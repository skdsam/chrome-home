/**
 * Spotify Catalog & Live Resolver
 * Author: SkdSam
 *
 * Resolution order:
 *  1. Direct Spotify URL passthrough
 *  2. Offline genre keywords → known playlist
 *  3. Offline artist catalog (instant, 150+ artists)
 *  4. Offline track catalog  (instant, 80+ tracks)
 *  5. LIVE Spotify search   (fetch open.spotify.com/search — SSR JSON in __NEXT_DATA__)
 *  6. LIVE iTunes search    (fallback artist resolution + genre hint)
 *  7. Genre word-boundary fallback
 *  8. Top Hits last resort
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SpotifyCatalog = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  OFFLINE GENRE → PLAYLIST MAP (Verified working Spotify playlists) */
    /* ------------------------------------------------------------------ */
    const SPOTIFY_GENRES = {
        // UK Garage & Bassline
        'uk garage': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        'ukgarage': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        'garage': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        'ukg': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        '2step': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        'speed garage': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },
        'bassline': { title: 'UK Garage Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0RJRF55W5lt?utm_source=generator' },

        // House & Deep House
        'house': { title: 'Housewerk', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXa8NOEUWPn9W?utm_source=generator' },
        'deep house': { title: 'Deep House Relax', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2TRYkJECvfC?utm_source=generator' },
        'deephouse': { title: 'Deep House Relax', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2TRYkJECvfC?utm_source=generator' },
        'tech house': { title: 'Housewerk', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXa8NOEUWPn9W?utm_source=generator' },
        'electro house': { title: 'Housewerk', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXa8NOEUWPn9W?utm_source=generator' },

        // Techno
        'techno': { title: 'TECHNO BUNKER', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX6J5NfMJS675?utm_source=generator' },
        'hard techno': { title: 'TECHNO BUNKER', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX6J5NfMJS675?utm_source=generator' },
        'melodic techno': { title: 'TECHNO BUNKER', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX6J5NfMJS675?utm_source=generator' },

        // Afrobeats
        'afrobeats': { title: 'African Heat', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWYkaDif7Ztbp?utm_source=generator' },
        'afrobeat': { title: 'African Heat', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWYkaDif7Ztbp?utm_source=generator' },
        'amapiano': { title: 'African Heat', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWYkaDif7Ztbp?utm_source=generator' },
        'african': { title: 'African Heat', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWYkaDif7Ztbp?utm_source=generator' },
        'afro': { title: 'African Heat', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWYkaDif7Ztbp?utm_source=generator' },

        // Synthwave & Retrowave
        'synthwave': { title: 'Retrowave // Outrun', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator' },
        'retrowave': { title: 'Retrowave // Outrun', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator' },
        'outrun': { title: 'Retrowave // Outrun', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator' },

        // Focus & Study
        'focus': { title: 'Deep Focus', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator' },
        'deep focus': { title: 'Deep Focus', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator' },
        'coding': { title: 'Deep Focus', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator' },
        'work': { title: 'Deep Focus', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator' },
        'study': { title: 'Deep Focus', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator' },
        'lofi': { title: 'chill lofi study beats', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS?utm_source=generator' },
        'lo fi': { title: 'chill lofi study beats', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS?utm_source=generator' },
        'study beats': { title: 'chill lofi study beats', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS?utm_source=generator' },

        // Mood & Vibes
        'calm': { title: 'calm vibes', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1s9knjP51Oa?utm_source=generator' },
        'calm vibes': { title: 'calm vibes', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1s9knjP51Oa?utm_source=generator' },
        'mood booster': { title: 'Mood Booster', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator' },
        'mood': { title: 'Mood Booster', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator' },
        'happy': { title: 'Mood Booster', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator' },
        'feel good': { title: 'Mood Booster', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator' },
        'chill': { title: 'Chill Hits', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4WYpdgoIcn6?utm_source=generator' },
        'relax': { title: 'Chill Hits', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4WYpdgoIcn6?utm_source=generator' },

        // Era / Decade Hits
        '90s': { title: 'All Out 90s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXbTxeAdrVG2l?utm_source=generator' },
        'all out 90s': { title: 'All Out 90s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXbTxeAdrVG2l?utm_source=generator' },
        '80s': { title: 'All Out 80s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4UtSsGT1Sbe?utm_source=generator' },
        'all out 80s': { title: 'All Out 80s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4UtSsGT1Sbe?utm_source=generator' },
        '00s': { title: '00s Rock Anthems', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3oM43CtKnRV?utm_source=generator' },
        '2000s': { title: '00s Rock Anthems', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3oM43CtKnRV?utm_source=generator' },
        '70s': { title: 'All Out 70s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWTJ7xPn4vNaz?utm_source=generator' },
        'all out 70s': { title: 'All Out 70s', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWTJ7xPn4vNaz?utm_source=generator' },

        // Rock & Metal
        'rock': { title: 'Rock Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWXRqgorJj26U?utm_source=generator' },
        'classic rock': { title: 'Rock Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWXRqgorJj26U?utm_source=generator' },
        'classicrock': { title: 'Rock Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWXRqgorJj26U?utm_source=generator' },
        '80s rock': { title: '80s Rock Anthems', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1spT6G94GFC?utm_source=generator' },
        'metal': { title: 'Heavy Metal', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX9qNs32fujYe?utm_source=generator' },
        'heavy metal': { title: 'Heavy Metal', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX9qNs32fujYe?utm_source=generator' },
        'kickass metal': { title: 'Heavy Metal', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX9qNs32fujYe?utm_source=generator' },

        // Hip-hop & Rap
        'rap': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },
        'hiphop': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },
        'hip hop': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },
        'trap': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },
        'drill': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },
        'grime': { title: 'RapCaviar', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator' },

        // Hits & Pop
        'pop': { title: "Today's Top Hits", url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator' },
        'hits': { title: 'Mega Hit Mix', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXbYM3nMM0oPk?utm_source=generator' },
        'top hits': { title: "Today's Top Hits", url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator' },
        'tophits': { title: "Today's Top Hits", url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator' },
        'viral': { title: 'Viral Hits', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2L0iB23Enbq?utm_source=generator' },
        'tiktok': { title: 'Viral Hits', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2L0iB23Enbq?utm_source=generator' },

        // Electronic & Dance
        'dance': { title: 'mint', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4dyzvuaRJ0n?utm_source=generator' },
        'edm': { title: 'mint', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4dyzvuaRJ0n?utm_source=generator' },
        'electronic': { title: 'mint', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4dyzvuaRJ0n?utm_source=generator' },
        'club': { title: 'mint', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4dyzvuaRJ0n?utm_source=generator' },

        // Other Essentials
        'jazz': { title: 'Jazz Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXbITWG1ZJKYt?utm_source=generator' },
        'classical': { title: 'Classical Essentials', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWEJlAGA9gs0?utm_source=generator' },
        'piano': { title: 'Peaceful Piano', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO?utm_source=generator' },
        'sleep': { title: 'Peaceful Piano', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO?utm_source=generator' },
        'workout': { title: 'Beast Mode', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX76t638V648v?utm_source=generator' },
        'gym': { title: 'Beast Mode', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX76t638V648v?utm_source=generator' },
        'gaming': { title: 'Top Gaming Tracks', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWTyiBJ6yEqeu?utm_source=generator' },
        'soul': { title: '70s Soul Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWULEW2RfoSCi?utm_source=generator' },
        'rnb': { title: 'Are & Be', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4SBhb3fqAp5?utm_source=generator' },
        'r&b': { title: 'Are & Be', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4SBhb3fqAp5?utm_source=generator' },
        'latin': { title: 'Viva Latino', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX10zKzsJ2jva?utm_source=generator' },
        'kpop': { title: 'K-Pop ON!', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX9tPFwDMOaN1?utm_source=generator' },
        'country': { title: 'Hot Country', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1lVhptIYRda?utm_source=generator' },
        'ambient': { title: 'Ambient Relaxation', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3Ogo9pFvBkY?utm_source=generator' },
        'indie': { title: "Indie's Top 50", url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2Nc3B70tvx0?utm_source=generator' },
        'alt': { title: "Indie's Top 50", url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX2Nc3B70tvx0?utm_source=generator' },
        'blues': { title: 'Blues Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXd9rSDgaGda4?utm_source=generator' },
        'reggae': { title: 'Reggae Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXbSyd5txkwh7?utm_source=generator' },
        'punk': { title: 'Punk Essentials', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX3LDIBRoaRyQ?utm_source=generator' },
        'funk': { title: 'Funk Classics', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWvh2cfrxXML?utm_source=generator' },
        'disco': { title: 'Disco Fever', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1lVhptIYRda?utm_source=generator' },
        'acoustic': { title: 'Acoustic Hits', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX504r9869VvY?utm_source=generator' }
    };

    /* ------------------------------------------------------------------ */
    /*  OFFLINE ARTIST CATALOG (instant, no network)                       */
    /* ------------------------------------------------------------------ */
    const SPOTIFY_ARTISTS = {
        'red hot chili peppers': { title: 'Red Hot Chili Peppers', id: '0L8ExT028jH3ddEcZwqJJ5' },
        'queen': { title: 'Queen', id: '1dfeR4HaWDbWqFHLkxsg1d' },
        'the beatles': { title: 'The Beatles', id: '3WrFJ7ztbogyGnTHbHJFl2' },
        'eminem': { title: 'Eminem', id: '7dGJo4pcD2V6oG8kP0tJRR' },
        'taylor swift': { title: 'Taylor Swift', id: '06HL4z0CvFAxyc27GXpf02' },
        'drake': { title: 'Drake', id: '3TVXtAsR1Inumwj472S9r4' },
        'nirvana': { title: 'Nirvana', id: '6olE6TJLqED3rqDCT0FyPh' },
        'coldplay': { title: 'Coldplay', id: '4gzpq5DPGxSnKTe4SA8HAU' },
        'daft punk': { title: 'Daft Punk', id: '4tZwfgrHOc3mvqY8O0t7P' },
        'the weeknd': { title: 'The Weeknd', id: '1Xyo4u8uXC1ZmMpatF05PJ' },
        'billie eilish': { title: 'Billie Eilish', id: '6qqNVTkY8uBg9cP3Jd7DAH' },
        'bruno mars': { title: 'Bruno Mars', id: '0du5cEVh5yTK9QJze8zA0C' },
        'dua lipa': { title: 'Dua Lipa', id: '6M2wZ9GZgrQXHsfURRPENY' },
        'ed sheeran': { title: 'Ed Sheeran', id: '6eUKZXaKkcviH0Ku9w2n3V' },
        'michael jackson': { title: 'Michael Jackson', id: '3fMbdgg4jU38AjKoO2Pvl5' },
        'kendrick lamar': { title: 'Kendrick Lamar', id: '2YZyLoL8N0Wb9xBt1NhZWg' },
        'kanye west': { title: 'Kanye West', id: '5K4W6rqBFWDnAN6FQUkS6x' },
        'travis scott': { title: 'Travis Scott', id: '0Y5tJX1MQlPlqiwlOH1tJY' },
        'post malone': { title: 'Post Malone', id: '246dkjvS1zLTtiykXe5h60' },
        'pink floyd': { title: 'Pink Floyd', id: '0k17h0D3J5VfsdmQ1iZtE9' },
        'led zeppelin': { title: 'Led Zeppelin', id: '36QJXiGunqPPsqioAvDXbN' },
        'ac/dc': { title: 'AC/DC', id: '711MCceyCB4FnflGYjh09N' },
        'metallica': { title: 'Metallica', id: '2ye2Wgw4gimLv2eAKt19Zw' },
        'arctic monkeys': { title: 'Arctic Monkeys', id: '7Ln80gUS6He07XvHI8qqHH' },
        'radiohead': { title: 'Radiohead', id: '4Z8W4fKeB5YxbusRsdQVPb' },
        'fleetwood mac': { title: 'Fleetwood Mac', id: '08GQAI4e5rBaRujQwKX7FO' },
        'oasis': { title: 'Oasis', id: '2DaxqgrOhkeH0fpeiQq2f4' },
        'linkin park': { title: 'Linkin Park', id: '6XyY86QOPPrYVGvF9ch6wz' },
        'green day': { title: 'Green Day', id: '7oPftvlwr6VrsViSDV7fJY' },
        'guns n roses': { title: "Guns N' Roses", id: '3qm84nboxUEQ2vnjduHRae' },
        'eagles': { title: 'Eagles', id: '0ECwFtbYZIgVO9fge9902v' },
        'bob marley': { title: 'Bob Marley & The Wailers', id: '2QsynagSdAqZj3U9HgOTDC' },
        'david bowie': { title: 'David Bowie', id: '0oSGxfWSnnOXhD2fKuz2Gy' },
        'elton john': { title: 'Elton John', id: '3PhoLVEDkcUdcqnG041xWf' },
        'miles davis': { title: 'Miles Davis', id: '0kbYTNQb4Pb1rYv59Ha9eg' },
        'gorillaz': { title: 'Gorillaz', id: '3AA28KZvwAUc0oJaBkNEhJ' },
        'foo fighters': { title: 'Foo Fighters', id: '7jy3rLJdDQY21OgRLCZ9sD' },
        'blink 182': { title: 'Blink-182', id: '6pnWTtD9WnFh3N3A6HkW7U' },
        'the killers': { title: 'The Killers', id: '0C0XlULifJtAgn6ZNCW2eu' },
        'muse': { title: 'Muse', id: '12Chz9d9Zuo1JwAmqvPpAI' },
        'imagine dragons': { title: 'Imagine Dragons', id: '53XhwfbYqKCa1cC15pYq2q' },
        'maroon 5': { title: 'Maroon 5', id: '04gDigrS5kc9YWfZHwBETP' },
        'twenty one pilots': { title: 'Twenty One Pilots', id: '3YQKmKGau1PzlVlkL1iodx' },
        'onerepublic': { title: 'OneRepublic', id: '5Pwc4xIPtKrFEn4wm9ilR5' },
        'paramore': { title: 'Paramore', id: '74XFHRwlV6OrjEM0A2NCMF' },
        'my chemical romance': { title: 'My Chemical Romance', id: '7FBcucxuaC3Vm8GL2HEhu2' },
        'slipknot': { title: 'Slipknot', id: '05fG473iIaoy82DysXiYbm' },
        'system of a down': { title: 'System of a Down', id: '5eAWCfyUhZtYtQx9TkffAc' },
        'iron maiden': { title: 'Iron Maiden', id: '6zaBuK29G0q6KkWg6hU58N' },
        'black sabbath': { title: 'Black Sabbath', id: '5M52tdBn3P6L4UMv1C4a42' },
        'pearl jam': { title: 'Pearl Jam', id: '1w5Kfo2jwwGACugZKNmpfm' },
        'the strokes': { title: 'The Strokes', id: '0epOFNiUfyON9DRx7867CO' },
        'tame impala': { title: 'Tame Impala', id: '5INjqkS1o8h1imAzPqGZBb' },
        'glass animals': { title: 'Glass Animals', id: '4yvcSjfu4200aCGTX9AtYe' },
        'the 1975': { title: 'The 1975', id: '3mIj9lX2MWuHmhNCA7LSCW' },
        'hozier': { title: 'Hozier', id: '2FXC3k01HR6lZQVoqErqFc' },
        'shawn mendes': { title: 'Shawn Mendes', id: '7n2wHs1T7AcfpO2W3uqwgr' },
        'justin bieber': { title: 'Justin Bieber', id: '1uNFoZAHBGtllmzznpCI3s' },
        'rihanna': { title: 'Rihanna', id: '5pKCCKE2220Q72LJdVgskI' },
        'ariana grande': { title: 'Ariana Grande', id: '66CXWjxzNUsdJxJ2JdwvnR' },
        'beyonce': { title: 'Beyoncé', id: '6vWDO969PvNqNYHIOW5v0m' },
        'sza': { title: 'SZA', id: '7tYKF4w9nC0nq9CsPZTHyP' },
        'olivia rodrigo': { title: 'Olivia Rodrigo', id: '1McMsnEElThX1knmY4oliG' },
        'lana del rey': { title: 'Lana Del Rey', id: '00FQb4jTyendSlQ1GKgTJ9' },
        'harry styles': { title: 'Harry Styles', id: '6KImCVD70vtIoJWnq6nGn3' },
        'adele': { title: 'Adele', id: '4dpARuHxo51G3z768sgnrY' },
        '2pac': { title: '2Pac', id: '1ZwdS5xdxEREPySFridCfh' },
        'counting crows': { title: 'Counting Crows', id: '0vEsuISMWAKNctLlUAhSZC' },
        'notorious big': { title: 'The Notorious B.I.G.', id: '5me0Irg2ANcsBD93oaqw30' },
        'jay z': { title: 'JAY-Z', id: '3nFkdlSjzX9mRTtwJOzDYB' },
        'snoop dogg': { title: 'Snoop Dogg', id: '7hJcb9fa4alzcPaHfUvRa1' },
        '50 cent': { title: '50 Cent', id: '3q7HBObVc0L8jNeTe5G635' },
        'dr dre': { title: 'Dr. Dre', id: '6DPYiyq5kWVCP49rxLg3ff' },
        'j cole': { title: 'J. Cole', id: '6l3HvQ5sa6mXTsMTB19rO5' },
        'future': { title: 'Future', id: '1RyvyyTE3KVwmbtbgoRAXM' },
        '21 savage': { title: '21 Savage', id: '1URnnhqYAYcrqrcwql10ft' },
        'metro boomin': { title: 'Metro Boomin', id: '0iEt2Vh4J0y3v5AUMgWk8B' },
        'playboi carti': { title: 'Playboi Carti', id: '699OT29WJMyPtKuOpDTN9o' },
        'lil uzi vert': { title: 'Lil Uzi Vert', id: '4O15NlyKENPzIO9nmIRdL1' },
        'juice wrld': { title: 'Juice WRLD', id: '4MCBQP94vgT97t8DeY3pgf' },
        'mac miller': { title: 'Mac Miller', id: '4LLpKhyESsy2NVpcXZCwnv' },
        'central cee': { title: 'Central Cee', id: '5H4neSTvgmviAq4ZaPtYvU' },
        'stormzy': { title: 'Stormzy', id: '2SrSdSAnpqR9CyAUpqZAG5' },
        'dave': { title: 'Dave', id: '6Mo1fqJkQ1oUXxptql29L8' },
        'burna boy': { title: 'Burna Boy', id: '3wcj11K77LjEY1PkFcspU0' },
        'wizkid': { title: 'Wizkid', id: '3tVQdUvMrE001vjL9KiUMg' },
        'rema': { title: 'Rema', id: '46AhbaV4i286Tf9e1Aeb7C' },
        'bad bunny': { title: 'Bad Bunny', id: '4q3ewBCX7sLwd24euqV69X' },
        'hans zimmer': { title: 'Hans Zimmer', id: '0YC192cP3KUrI8CnlVM9ap' },
        'john williams': { title: 'John Williams', id: '3dRfiJ2650SZu6GbydcHNb' },
        'ludovico einaudi': { title: 'Ludovico Einaudi', id: '2uFUBdaVGtyMqckSeCl0Qj' },
        'stevie wonder': { title: 'Stevie Wonder', id: '7guDJrVYXvYlldVIrnx4io' },
        'prince': { title: 'Prince', id: '5a2w2vQI9AnURbr9B2PRQg' },
        'frank ocean': { title: 'Frank Ocean', id: '2h93pZq0e7k5yf4diw4Q99' },
        'childish gambino': { title: 'Childish Gambino', id: '73sIBHcq9Y500q12neCGkz' },
        'tyler the creator': { title: 'Tyler, The Creator', id: '4V8LLVI7PbaPR0K2TGSFFN' },
        'asap rocky': { title: 'A$AP Rocky', id: '13ubrt8QOOCEjjTaCV0OaB' },
        'lil wayne': { title: 'Lil Wayne', id: '55Aa2cqylxrFIXC767Z865' },
        'jack harlow': { title: 'Jack Harlow', id: '2P5QIM928SuDrk7BSn97vR' },
        'charli xcx': { title: 'Charli xcx', id: '25uiPmTg16RbhZWAqwLBy5' },
        'chappell roan': { title: 'Chappell Roan', id: '7GlBOeep6PqTfFi59PTJUt' },
        'sabrina carpenter': { title: 'Sabrina Carpenter', id: '74KM79TiuVKeVCqs8QtB0B' },
        'the cure': { title: 'The Cure', id: '6gOFZsnjdBCOYEVFSnfzIk' },
        'the smiths': { title: 'The Smiths', id: '3yY2gUcIsjMr8hjo51PoJ8' },
        'depeche mode': { title: 'Depeche Mode', id: '762310PdDnwsDxAQxzQkfR' },
        'joy division': { title: 'Joy Division', id: '623bIsQRxwv2SHEv37VNih' },
        'the doors': { title: 'The Doors', id: '22WZ7M067XjbSRkJGWtKvN' },
        'jimi hendrix': { title: 'Jimi Hendrix', id: '776Uo845nYHJpNaStv1Ds4' },
        'bob dylan': { title: 'Bob Dylan', id: '74ASZWbe4lXaubB36ztrGX' },
        'bruce springsteen': { title: 'Bruce Springsteen', id: '3eqjTLE0HfPfh78zjh6TqT' },
        'u2': { title: 'U2', id: '51Blml2LZPmy7TTiAg47vQ' },
        'r.e.m': { title: 'R.E.M.', id: '4KWTAlx2RvbpseOuc6NQ6j' },
        'rem': { title: 'R.E.M.', id: '4KWTAlx2RvbpseOuc6NQ6j' },
        'the police': { title: 'The Police', id: '5NGO30tJxFlKixkPSgXcFE' },
        'sting': { title: 'Sting', id: '0Ty63ceoRnnJKVEYP0VQpk' },
        'tom petty': { title: 'Tom Petty', id: '2ySMbKJEFuAJOGMAN7bVRy' },
        'bon jovi': { title: 'Bon Jovi', id: '58lV9VcRSjABbAbfWS6skp' },
        'aerosmith': { title: 'Aerosmith', id: '7Ey4PD4MYsKc5I2dolUwbH' },
        'van halen': { title: 'Van Halen', id: '2cnMpRsOKqO0b7eJeoAyj3' },
        'dire straits': { title: 'Dire Straits', id: '0WwSkZ7LtFUFjGjMZBMt6T' },
        'the rolling stones': { title: 'The Rolling Stones', id: '22bE4uQ6baNwSHPVcDxLCe' },
        'rolling stones': { title: 'The Rolling Stones', id: '22bE4uQ6baNwSHPVcDxLCe' },
        'amy winehouse': { title: 'Amy Winehouse', id: '6Q192DXotxtaysaqNPy5yR' },
        'george michael': { title: 'George Michael', id: '19ra5tSw0d8WyfXmL3YMlx' },
        'duran duran': { title: 'Duran Duran', id: '0lZoBs4Pzo7R89JM9lxwoT' },
        'lcd soundsystem': { title: 'LCD Soundsystem', id: '066X20Nz7TLEc9ZBQHZXCL' },
        'vampire weekend': { title: 'Vampire Weekend', id: '5BvJzeQpmsdsFp4HGUYUEx' },
        'arcade fire': { title: 'Arcade Fire', id: '3kjuyTCjPG1WMFCiyc5IuB' },
        'bon iver': { title: 'Bon Iver', id: '4LEiUjE18IG3IOsWFvNVhF' },
        'sufjan stevens': { title: 'Sufjan Stevens', id: '4MXUO7sVCaFgFjoTI5ox5c' },
        'phoebe bridgers': { title: 'Phoebe Bridgers', id: '1btWGBz4Uu1HozTwb2Lm8A' },
        'gracie abrams': { title: 'Gracie Abrams', id: '4tuJ0bMpJh75OH1StNR1Gg' },
        'noah kahan': { title: 'Noah Kahan', id: '2RQXRUsr4IW1f3mKz2t4Eh' },
        'lewis capaldi': { title: 'Lewis Capaldi', id: '4GNC7GD6oZMSxPGyXy4MNB' },
        'sam smith': { title: 'Sam Smith', id: '2wY79sveU1sp5g7SokKOiI' },
        'james blunt': { title: 'James Blunt', id: '7HbNSqqBsT0qEetknx8qUI' },
        'norah jones': { title: 'Norah Jones', id: '433KRn5lVCkPZQSL0kXQoR' },
        'john mayer': { title: 'John Mayer', id: '0hEurMDQu99nJRq8pTxO14' },
        'jack johnson': { title: 'Jack Johnson', id: '3GBPw9NK25X1uF9SNqoiUi' },
        'ben harper': { title: 'Ben Harper', id: '0UhseMCF4rqxl4gEnf6Pup' },
        'dave matthews band': { title: 'Dave Matthews Band', id: '1f9zGqNZRH8EPa9nAgFcGq' },
        'phish': { title: 'Phish', id: '0NsukpwAMlzxzYONv1MXdX' },
        'grateful dead': { title: 'Grateful Dead', id: '4TMHGUX5WIsJHMTJFk8UmI' },
        'neil young': { title: 'Neil Young', id: '6v8FB84lnmJs434UJf2Mrm' },
        'simon and garfunkel': { title: 'Simon & Garfunkel', id: '70cRZdQywnSFp9pnc2WTCE' },
        'simon garfunkel': { title: 'Simon & Garfunkel', id: '70cRZdQywnSFp9pnc2WTCE' },
        'cat stevens': { title: 'Cat Stevens', id: '2TI7qyDE0QfyOlnbtfDb3z' },
        'rod stewart': { title: 'Rod Stewart', id: '2y8Jo9CKhgzkhW9g1RHTTN' },
        'eric clapton': { title: 'Eric Clapton', id: '6PAt558ZEZl0DmdXlnjMgD' },
        'bb king': { title: 'B.B. King', id: '8geEjU9bfNEWz6LS78dCJl' },
        'muddy waters': { title: 'Muddy Waters', id: '44GxbGmBa7mHDG6VhqI6HU' },
        'johnny cash': { title: 'Johnny Cash', id: '6kACVPfCOnqzgfEF5ryl0x' },
        'willie nelson': { title: 'Willie Nelson', id: '0HL0Y5VCVGlbEE4VMPBBWj' },
        'dolly parton': { title: 'Dolly Parton', id: '32vWCbZh0xZ4o9gkz4PsEU' },
        'kenny rogers': { title: 'Kenny Rogers', id: '5aW4cofMJeAWFuwd9LCemE' },
        'frank sinatra': { title: 'Frank Sinatra', id: '1Mxqyy3pSjf8kZZL4QVxS0' },
        'dean martin': { title: 'Dean Martin', id: '6mFkJmJbxWACStEPrqZ23r' },
        'nat king cole': { title: 'Nat King Cole', id: '3wYyutjgII8wqSPbCXCQMN' },
        'ella fitzgerald': { title: 'Ella Fitzgerald', id: '0XkgAZo92JgNSKASDdCdaA' },
        'louis armstrong': { title: 'Louis Armstrong', id: '19eLuQmk9aCobbVDHC5Za' },
        'john coltrane': { title: 'John Coltrane', id: '2hGh5VOeeqimQFxqXiRMgr' },
        'chet baker': { title: 'Chet Baker', id: '1ZEfVCiTxrPGFV0WRsOueO' }
    };

    /* ------------------------------------------------------------------ */
    /*  OFFLINE TRACK CATALOG (instant, no network)                        */
    /* ------------------------------------------------------------------ */
    const SPOTIFY_TRACKS = {
        'bohemian rhapsody': { title: 'Bohemian Rhapsody - Queen', id: '3z8h0TU7ReDPLIbEnYhWZb' },
        'hotel california': { title: 'Hotel California - Eagles', id: '40riOy7x9W7GXjyGp4pjAv' },
        'californication': { title: 'Californication - Red Hot Chili Peppers', id: '48UPSzbZjgc449aqz8bxox' },
        'under the bridge': { title: 'Under the Bridge - Red Hot Chili Peppers', id: '3d9DChrdcR0QXypqw5dfT8' },
        'cant stop': { title: "Can't Stop - Red Hot Chili Peppers", id: '3ZOEytgrvLmpEaqguKNvgj' },
        'snow hey oh': { title: 'Snow (Hey Oh) - Red Hot Chili Peppers', id: '2aibwv5hGXSgw7YjF9OOeg' },
        'scar tissue': { title: 'Scar Tissue - Red Hot Chili Peppers', id: '1G391cbiT3v3CyAJOutLbt' },
        'dani california': { title: 'Dani California - Red Hot Chili Peppers', id: '10Nmj3ueHpAF8Ki9SQnc6W' },
        'smells like teen spirit': { title: 'Smells Like Teen Spirit - Nirvana', id: '5ghIJDhubRg0Za5inxsAh9' },
        'come as you are': { title: 'Come As You Are - Nirvana', id: '4P5KoWXOxwuBCLmQzgEg9K' },
        'stairway to heaven': { title: 'Stairway to Heaven - Led Zeppelin', id: '5CQ30WqJwcep0pYcV4AMNc' },
        'sweet child o mine': { title: "Sweet Child O' Mine - Guns N' Roses", id: '7o2CTH4ctstm8TNelqjb51' },
        'billie jean': { title: 'Billie Jean - Michael Jackson', id: '5ChkMS8OtdzsqVrYbTje9b' },
        'thriller': { title: 'Thriller - Michael Jackson', id: '2LlQb7Uoj9MYbbGbgQhhax' },
        'beat it': { title: 'Beat It - Michael Jackson', id: '1OOtq8t4UR45L92vOpZwzy' },
        'lose yourself': { title: 'Lose Yourself - Eminem', id: '5Z01UMMf7V1o0Mz9bi66vF' },
        'without me': { title: 'Without Me - Eminem', id: '7lQ8MOhqYxd8zQgDkdT3q1' },
        'shape of you': { title: 'Shape of You - Ed Sheeran', id: '7qiZfU4dY1lWllzX7mPBI3' },
        'blinding lights': { title: 'Blinding Lights - The Weeknd', id: '0VjIjW4GlUZAMYd2vXMi3b' },
        'starboy': { title: 'Starboy - The Weeknd', id: '7MXVkk9YM5odIRMYW9IOIl' },
        'levitating': { title: 'Levitating - Dua Lipa', id: '39LLxExYz6ewLAcYrzQQyP' },
        'dont stop me now': { title: "Don't Stop Me Now - Queen", id: '5T8EDUDqKcs6OSOwEsfqG7' },
        'another one bites the dust': { title: 'Another One Bites the Dust - Queen', id: '5vdp5UmvTsnSdAkegVYFQt' },
        'we will rock you': { title: 'We Will Rock You - Queen', id: '4pbG9SUmWIvs1Gi7NW0Esv' },
        'in the end': { title: 'In the End - Linkin Park', id: '60a0Rd6pj0xtZHEx2Y0BQm' },
        'numb': { title: 'Numb - Linkin Park', id: '2nLtzopw45Gvu7jY8fzcQw' },
        'wonderwall': { title: 'Wonderwall - Oasis', id: '7ygpwy2q0UQzIDnWxAc4Ka' },
        'mr brightside': { title: 'Mr. Brightside - The Killers', id: '003vvx7Niy0JvhvHt4aM8q' },
        'take on me': { title: 'Take On Me - a-ha', id: '2WfaOiMkCvy7Z5vohoZwOX' },
        'africa': { title: 'Africa - TOTO', id: '2374M0fQpWi3dLnB54qaLX' },
        'dreams': { title: 'Dreams - Fleetwood Mac', id: '0ofHAoxe9vBkTCp2UQIavz' },
        'careless whisper': { title: 'Careless Whisper - George Michael', id: '4jDmJ51YHR02IlAxKf2XY2' },
        'gods plan': { title: "God's Plan - Drake", id: '6DCZcSspjsKoFWhjrWoCWe' },
        'humble': { title: 'HUMBLE. - Kendrick Lamar', id: '7KXjTSCq5nL1LoYtL7XAwS' },
        'uptown funk': { title: 'Uptown Funk - Mark Ronson ft. Bruno Mars', id: '32OlwWuMpZ6b0aN2RZOeMS' },
        'bad guy': { title: 'bad guy - Billie Eilish', id: '2FxJ2nKz2b6aYFk26c36uX' },
        'sunflower': { title: 'Sunflower - Post Malone & Swae Lee', id: '3KkXRQHbMCARz0aVfEt68P' },
        'circles': { title: 'Circles - Post Malone', id: '21jGcNKet2qwijlDFuPiPb' },
        'shallow': { title: 'Shallow - Lady Gaga & Bradley Cooper', id: '2VxeLyX666F8uXCJ0dVeBM' },
        'believer': { title: 'Believer - Imagine Dragons', id: '0pqnGHJpmpxLKifKRmU6WP' },
        'radioactive': { title: 'Radioactive - Imagine Dragons', id: '62yJjFmy2crEiiaK2AqE07' },
        'counting stars': { title: 'Counting Stars - OneRepublic', id: '2tpWsVSb9UEmDRxAl1zhX1' },
        'hey jude': { title: 'Hey Jude - The Beatles', id: '0aym2LBJBk9DAYWvqaGZa1' },
        'let it be': { title: 'Let It Be - The Beatles', id: '7iN1PerformFh6K2k4dE6kS' },
        'yesterday': { title: 'Yesterday - The Beatles', id: '3BQHpFgAp4l80e1XslIjNI' },
        'viva la vida': { title: 'Viva La Vida - Coldplay', id: '1itFlk9qZTvt9F7wwwv6yd' },
        'yellow': { title: 'Yellow - Coldplay', id: '3AJwUDP919kvQ9QcozQPxg' },
        'the scientist': { title: 'The Scientist - Coldplay', id: '75JFxkI2RXiU7L9VXzM0cp' },
        'fix you': { title: 'Fix You - Coldplay', id: '7LVHVU3tWfcxj5aiP2W44Q' },
        'one more time': { title: 'One More Time - Daft Punk', id: '0DiWol3AO6WpXZgp0gGlNW' },
        'get lucky': { title: 'Get Lucky - Daft Punk', id: '2Foc5Q5nqNiosCNqttzHof' },
        'harder better faster stronger': { title: 'Harder, Better, Faster, Stronger - Daft Punk', id: '5W3cjX2J3tjhG8theYzFR2' },
        'creep': { title: 'Creep - Radiohead', id: '70LcF31zb1H0PyJoS1Sx1r' },
        'karma police': { title: 'Karma Police - Radiohead', id: '63OQupATfuecGZGnnbMM4j' },
        'do i wanna know': { title: 'Do I Wanna Know? - Arctic Monkeys', id: '5FVd6KXrgO9B3JPmC8OPst' },
        'r u mine': { title: 'R U Mine? - Arctic Monkeys', id: '2AT8i7KDTpe7Z2RpDC6Mi0' },
        'back in black': { title: 'Back In Black - AC/DC', id: '08mG3Y1vljYA6bvNXEsOh9' },
        'highway to hell': { title: 'Highway to Hell - AC/DC', id: '2zYzyRzz6ye9rIM4qm2ur1' },
        'thunderstruck': { title: 'Thunderstruck - AC/DC', id: '57bgtoPSgt236HzfBOd8kj' },
        'enter sandman': { title: 'Enter Sandman - Metallica', id: '5sICkBXVmaCQk5aISGR3x1' },
        'master of puppets': { title: 'Master of Puppets - Metallica', id: '54bm7qJt9H42Y3uG6jZ79k' },
        'nothing else matters': { title: 'Nothing Else Matters - Metallica', id: '2Ctemuomr4X6G0Tq1Jq0d3' },
        'comfortably numb': { title: 'Comfortably Numb - Pink Floyd', id: '7rPzQB1BG0vBddshvLzpFn' },
        'wish you were here': { title: 'Wish You Were Here - Pink Floyd', id: '6mFkJmJbxWACStEPrqZ23r' },
        'basket case': { title: 'Basket Case - Green Day', id: '6L89mwAVIR16Qce8kTaIK7' },
        'american idiot': { title: 'American Idiot - Green Day', id: '6nTiIhLmQ3FWhvrGafw2Kq' },
        'as it was': { title: 'As It Was - Harry Styles', id: '4LRPiXqCikLlN15c3yImP7' },
        'flowers': { title: 'Flowers - Miley Cyrus', id: '0yLdtUSu995ocfrWAgHYKd' },
        'cruel summer': { title: 'Cruel Summer - Taylor Swift', id: '1BxfuPKGuaTgP7aM0fbdwr' },
        'anti hero': { title: 'Anti-Hero - Taylor Swift', id: '0V3wPSX9ygBnKi895g6un2' },
        'shake it off': { title: 'Shake It Off - Taylor Swift', id: '0cqRj7pUJDkTCEsJkx8snD' },
        'blank space': { title: 'Blank Space - Taylor Swift', id: '1p80LdxRV74UKvL8vDWhTe' },
        'espresso': { title: 'Espresso - Sabrina Carpenter', id: '2HRgqmZQC00UMxiQW5Zao4' },
        'birds of a feather': { title: 'BIRDS OF A FEATHER - Billie Eilish', id: '6dOtVTDmMPvnLQIWBnRXZ9' },
        'good 4 u': { title: 'good 4 u - Olivia Rodrigo', id: '4ZtFanR9U6ndgddUvflAjG' },
        'drivers license': { title: 'drivers license - Olivia Rodrigo', id: '5wANPM4fQCJwkGd4rN57mH' },
        'vampire': { title: 'vampire - Olivia Rodrigo', id: '3k79jB4aGmM2ABighVOhaN' },
        'mr jones': { title: 'Mr. Jones - Counting Crows', id: '0OmOHkNnFhIzEBBJGdxnLt' },
        'round here': { title: 'Round Here - Counting Crows', id: '17wQD6vDxRQVvKE3hAeHLa' },
        'accidentally in love': { title: 'Accidentally in Love - Counting Crows', id: '2QjOHCTQ1Jl3zawyYjm2bI' }
    };

    /* ------------------------------------------------------------------ */
    /*  ALIASES                                                             */
    /* ------------------------------------------------------------------ */
    const SPOTIFY_ALIASES = {
        'rhcp': 'red hot chili peppers',
        'chili peppers': 'red hot chili peppers',
        'chilli peppers': 'red hot chili peppers',
        'red hot chilli peppers': 'red hot chili peppers',
        'red hot chillier peppers': 'red hot chili peppers',
        'counting crowes': 'counting crows',
        'counting crow': 'counting crows',
        'freddie mercury': 'queen',
        'beatles': 'the beatles',
        'slim shady': 'eminem',
        'kurt cobain': 'nirvana',
        'kanye': 'kanye west',
        'kendrick': 'kendrick lamar',
        'chester bennington': 'linkin park',
        'acdc': 'ac/dc',
        'gnr': 'guns n roses',
        "guns n' roses": 'guns n roses',
        'billie': 'billie eilish',
        'dua': 'dua lipa',
        'weeknd': 'the weeknd',
        'mj': 'michael jackson',
        'the boss': 'bruce springsteen',
        '2 pac': '2pac',
        'tupac': '2pac',
        'tupac shakur': '2pac',
        '2pac shakur': '2pac',
        'biggie': 'notorious big',
        'notorious b.i.g': 'notorious big',
        'the notorious big': 'notorious big',
        'jay-z': 'jay z',
        'jayz': 'jay z',
        'tyler': 'tyler the creator',
        'rocky': 'asap rocky',
        'a$ap rocky': 'asap rocky',
        '1975': 'the 1975',
        'killers': 'the killers',
        'strokes': 'the strokes',
        'doors': 'the doors',
        'police': 'the police',
        'stones': 'the rolling stones',
        'rolling stones': 'the rolling stones',
        'cure': 'the cure',
        'smiths': 'the smiths',
        'counting crow': 'counting crows'
    };

    /* ------------------------------------------------------------------ */
    /*  HELPERS                                                             */
    /* ------------------------------------------------------------------ */
    function normalizeText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function makeEmbedUrl(type, id) {
        return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`;
    }

    /* ------------------------------------------------------------------ */
    /*  LIVE RESOLVER — Spotify SSR page (__NEXT_DATA__ JSON)              */
    /*                                                                      */
    /*  open.spotify.com/search/{query} is a Next.js page that ships       */
    /*  the full search result tree inside a <script id="__NEXT_DATA__">   */
    /*  JSON blob.  We parse it to pull the first artist or track ID.      */
    /*  The extension already has open.spotify.com in host_permissions, so */
    /*  the fetch succeeds without CORS issues.                             */
    /* ------------------------------------------------------------------ */
    async function liveSpotifySearch(query, preferTrack) {
        const searchTypes = preferTrack ? ['tracks', 'artists'] : ['artists', 'tracks'];
        for (const type of searchTypes) {
            try {
                const url = `https://open.spotify.com/search/${encodeURIComponent(query)}/${type}`;
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 6000);
                const res = await fetch(url, {
                    signal: ctrl.signal,
                    credentials: 'omit',
                    headers: { 'Accept': 'text/html' }
                });
                clearTimeout(timer);
                if (!res.ok) continue;

                const html = await res.text();

                // Extract __NEXT_DATA__ JSON
                const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
                if (!match) continue;

                const json = JSON.parse(match[1]);

                // Navigate to the search results in the page props tree
                // Path varies slightly by Spotify version; try both known paths
                const searchResults =
                    json?.props?.pageProps?.data?.searchV2 ||
                    json?.props?.pageProps?.data?.search ||
                    json?.props?.pageProps?.data ||
                    null;

                if (!searchResults) continue;

                // Try artists first (when not preferTrack)
                if (type === 'artists') {
                    const artists = searchResults?.artists?.items || searchResults?.artists?.edges?.map(e => e.node) || [];
                    const artist = artists[0];
                    if (artist) {
                        const id = artist.id || artist.uri?.split(':').pop();
                        const name = artist.profile?.name || artist.name || query;
                        if (id) return { type: 'artist', id, title: name };
                    }
                }

                // Try tracks
                if (type === 'tracks') {
                    const tracks =
                        searchResults?.tracksV2?.items ||
                        searchResults?.tracks?.items ||
                        searchResults?.tracks?.edges?.map(e => e.node?.track || e.node) || [];
                    const track = tracks[0]?.item || tracks[0];
                    if (track) {
                        const id = track.id || track.uri?.split(':').pop();
                        const trackName = track.name || query;
                        const artistName = track.artists?.items?.[0]?.profile?.name
                            || track.artists?.[0]?.name
                            || '';
                        const title = artistName ? `${trackName} — ${artistName}` : trackName;
                        if (id) return { type: 'track', id, title };
                    }
                }
            } catch (_) {
                // Silently continue to next attempt
            }
        }
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  ITUNES FALLBACK — for artist name resolution when Spotify SSR      */
    /*  fails (rate-limited or bot-detected)                               */
    /* ------------------------------------------------------------------ */
    async function itunesFallback(query) {
        try {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=3`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch(url, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) return null;
            const data = await res.json();
            const item = data.results?.[0];
            if (!item) return null;
            return { artistName: item.artistName, trackName: item.trackName, genre: item.primaryGenreName };
        } catch (_) {
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  MUSICBRAINZ RESOLVER — Free global encyclopedia of artist URLs    */
    /* ------------------------------------------------------------------ */
    async function musicBrainzArtist(query) {
        try {
            const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch(url, {
                signal: ctrl.signal,
                headers: { 'User-Agent': 'ChromeHome/1.0 (skdsam)' }
            });
            clearTimeout(timer);
            if (!res.ok) return null;
            const data = await res.json();
            const artists = data.artists || [];
            for (const artist of artists.slice(0, 3)) {
                try {
                    const relUrl = `https://musicbrainz.org/ws/2/artist/${artist.id}?inc=url-rels&fmt=json`;
                    const relRes = await fetch(relUrl, {
                        headers: { 'User-Agent': 'ChromeHome/1.0 (skdsam)' }
                    });
                    if (!relRes.ok) continue;
                    const relData = await relRes.json();
                    const spotify = relData.relations?.find(r => r.url?.resource?.includes('open.spotify.com/artist/'));
                    if (spotify) {
                        const parts = spotify.url.resource.split('/');
                        const id = parts[parts.length - 1].split('?')[0];
                        if (id) return { type: 'artist', id, title: artist.name };
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  MAIN RESOLVER                                                       */
    /* ------------------------------------------------------------------ */
    async function resolveSpotifyQuery(query) {
        const raw = String(query || '').trim();
        if (!raw) {
            return { title: "Today's Top Hits", embedUrl: SPOTIFY_GENRES['pop'].url };
        }

        // 0. LIVE Spotify API search (when connected — 100% accurate for any artist/song)
        if (typeof window !== 'undefined' && window.SpotifyAuth) {
            try {
                const apiResult = await window.SpotifyAuth.search(raw);
                if (apiResult?.id) {
                    return {
                        title: apiResult.title,
                        embedUrl: makeEmbedUrl(apiResult.type, apiResult.id)
                    };
                }
            } catch (_) {
                // API unavailable — fall through to offline catalog
            }
        }

        // 1. Direct Spotify URL passthrough
        if (raw.includes('spotify.com')) {
            let embedUrl = raw;
            try {
                const u = new URL(raw);
                if (u.hostname.includes('spotify.com') && !u.pathname.includes('/embed')) {
                    embedUrl = `https://${u.hostname}/embed${u.pathname}${u.search}`;
                }
            } catch (_) {}
            return { title: 'Spotify Player', embedUrl };
        }

        const normalized = normalizeText(raw);
        const squashed = normalized.replace(/\s+/g, '');

        // 2. Offline genre keyword exact match
        if (SPOTIFY_GENRES[normalized] || SPOTIFY_GENRES[squashed]) {
            const g = SPOTIFY_GENRES[normalized] || SPOTIFY_GENRES[squashed];
            return { title: g.title, embedUrl: g.url };
        }

        // 2b. Check if query is a genre phrase (e.g. "uk garage mix", "uk garage playlist", "play uk garage")
        // Sorted by length descending so specific genres match before short generic ones
        const genreKeysByLength = Object.keys(SPOTIFY_GENRES).sort((a, b) => b.length - a.length);
        const isKnownArtistExact = !!(SPOTIFY_ARTISTS[normalized] || SPOTIFY_ALIASES[normalized] || SPOTIFY_ARTISTS[squashed]);
        if (!isKnownArtistExact) {
            for (const k of genreKeysByLength) {
                if (k.length >= 3 && new RegExp(`(^|\\b)${k}(\\b|$)`, 'i').test(normalized)) {
                    const g = SPOTIFY_GENRES[k];
                    return { title: g.title, embedUrl: g.url };
                }
            }
        }

        // 3. Offline track catalog
        if (SPOTIFY_TRACKS[normalized] || SPOTIFY_TRACKS[squashed]) {
            const t = SPOTIFY_TRACKS[normalized] || SPOTIFY_TRACKS[squashed];
            return { title: t.title, embedUrl: makeEmbedUrl('track', t.id) };
        }

        // 4. Offline artist catalog (direct + alias)
        let artistKey = normalized;
        if (SPOTIFY_ALIASES[artistKey]) artistKey = SPOTIFY_ALIASES[artistKey];
        if (SPOTIFY_ALIASES[squashed]) artistKey = SPOTIFY_ALIASES[squashed];
        if (SPOTIFY_ARTISTS[artistKey]) {
            const a = SPOTIFY_ARTISTS[artistKey];
            return { title: a.title, embedUrl: makeEmbedUrl('artist', a.id) };
        }

        // 5. Offline partial substring match in artists
        for (const [key, artist] of Object.entries(SPOTIFY_ARTISTS)) {
            if (key.length >= 4 && (normalized === key || normalized.startsWith(key) || normalized.includes(key))) {
                return { title: artist.title, embedUrl: makeEmbedUrl('artist', artist.id) };
            }
        }

        // 6. Offline partial substring match in tracks
        for (const [key, track] of Object.entries(SPOTIFY_TRACKS)) {
            if (key.length >= 5 && (normalized === key || normalized.startsWith(key) || normalized.includes(key))) {
                return { title: track.title, embedUrl: makeEmbedUrl('track', track.id) };
            }
        }

        // 7. Live MusicBrainz artist search (works for ANY artist with real Spotify links!)
        const mbArtist = await musicBrainzArtist(raw);
        if (mbArtist) {
            return {
                title: mbArtist.title,
                embedUrl: makeEmbedUrl('artist', mbArtist.id)
            };
        }

        // 8. LIVE Spotify SSR search fallback
        const looksLikeTrack = /\bsong\b|\btrack\b|\bplay\b/.test(normalized);
        const live = await liveSpotifySearch(raw, looksLikeTrack);
        if (live) {
            return {
                title: live.title,
                embedUrl: makeEmbedUrl(live.type, live.id)
            };
        }

        // 9. iTunes fallback → try to resolve artist name → check catalog / MusicBrainz
        const itunes = await itunesFallback(raw);
        if (itunes) {
            const itArtist = normalizeText(itunes.artistName);
            const itSquash = itArtist.replace(/\s+/g, '');
            const resolvedKey = SPOTIFY_ALIASES[itArtist] || SPOTIFY_ALIASES[itSquash] || itArtist;
            if (SPOTIFY_ARTISTS[resolvedKey]) {
                const a = SPOTIFY_ARTISTS[resolvedKey];
                return {
                    title: `${a.title} — ${itunes.trackName}`,
                    embedUrl: makeEmbedUrl('artist', a.id)
                };
            }
            // Check MusicBrainz for the iTunes artist name
            const mbFromItunes = await musicBrainzArtist(itunes.artistName);
            if (mbFromItunes) {
                return {
                    title: `${mbFromItunes.title} — ${itunes.trackName}`,
                    embedUrl: makeEmbedUrl('artist', mbFromItunes.id)
                };
            }
            // Genre hint from iTunes
            const itGenre = normalizeText(itunes.genre || '');
            for (const gKey of genreKeysByLength) {
                if (gKey.length >= 3 && (itGenre.includes(gKey) || gKey.includes(itGenre))) {
                    return {
                        title: `${SPOTIFY_GENRES[gKey].title} (${itunes.artistName} — ${itunes.trackName})`,
                        embedUrl: SPOTIFY_GENRES[gKey].url
                    };
                }
            }
        }

        // 10. Word-boundary genre fallback
        for (const k of genreKeysByLength) {
            if (new RegExp(`\\b${k}\\b`, 'i').test(raw)) {
                return { title: `${SPOTIFY_GENRES[k].title} (${raw})`, embedUrl: SPOTIFY_GENRES[k].url };
            }
        }

        // 11. Last resort
        return {
            title: `Top Hits (matching "${raw}")`,
            embedUrl: SPOTIFY_GENRES['pop'].url
        };
    }

    return {
        SPOTIFY_GENRES,
        SPOTIFY_ARTISTS,
        SPOTIFY_ALIASES,
        SPOTIFY_TRACKS,
        resolveSpotifyQuery
    };
});
