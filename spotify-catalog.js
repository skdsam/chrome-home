/** Spotify request parsing and matching. IDs come from Spotify or explicit links. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SpotifyCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const TYPES = ['artist', 'track', 'playlist', 'album'];
    const EMBED_TYPES = [...TYPES, 'episode', 'show'];
    // Spelling variants and established alternate names, never band/member substitutions.
    const ALIASES = {
        rhcp: 'Red Hot Chili Peppers', 'chili peppers': 'Red Hot Chili Peppers',
        'chilli peppers': 'Red Hot Chili Peppers', 'red hot chilli peppers': 'Red Hot Chili Peppers',
        'red hot chillier peppers': 'Red Hot Chili Peppers', 'counting crowes': 'Counting Crows',
        'counting crow': 'Counting Crows', acdc: 'AC/DC', gnr: "Guns N' Roses",
        '2 pac': '2Pac', tupac: '2Pac', 'tupac shakur': '2Pac', '2pac shakur': '2Pac',
        biggie: 'The Notorious B.I.G.', jayz: 'Jay-Z'
    };
    const GENRES = new Set(('uk garage|garage|ukg|2step|speed garage|bassline|house|deep house|tech house|' +
        'electro house|techno|hard techno|melodic techno|afrobeats|afrobeat|amapiano|synthwave|retrowave|' +
        'lofi|lo fi|focus|coding|study|chill|ambient|90s|80s|70s|2000s|rock|classic rock|metal|heavy metal|' +
        'rap|hip hop|hiphop|trap|drill|grime|pop|dance|edm|electronic|jazz|classical|piano|sleep|' +
        'workout|gym|gaming|soul|rnb|r b|latin|kpop|country|indie|blues|reggae|punk|funk|disco|acoustic').split('|'));
    function normalizeText(text) {
        return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    }
    function spotifyError(code, message) { return Object.assign(new Error(message), { code }); }
    function fromId(type, id, name) {
        if (!EMBED_TYPES.includes(type) || !/^[a-zA-Z0-9]{22}$/.test(id || '')) return null;
        return { type, id, name: name || `Spotify ${type}`, title: name || `Spotify ${type}`,
            uri: `spotify:${type}:${id}`,
            embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
            externalUrl: `https://open.spotify.com/${type}/${id}` };
    }
    function parseSpotifyLink(raw) {
        const text = String(raw || '').trim();
        if (!/^(?:spotify:|https?:\/\/|(?:open\.spotify\.com|spotify\.link)\/)/i.test(text)) return null;
        let type, id;
        const uri = text.match(/^spotify:(artist|track|playlist|album|episode|show):([a-zA-Z0-9]{22})$/);
        if (uri) [, type, id] = uri;
        else {
            try {
                const url = new URL(text);
                if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.port || url.username || url.password) throw new Error();
                const parts = url.pathname.match(/^\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/)?(artist|track|playlist|album|episode|show)\/([a-zA-Z0-9]{22})\/?$/);
                if (!parts) throw new Error();
                [, type, id] = parts;
            } catch (_) {
                throw spotifyError('invalid_link', 'Use a full https://open.spotify.com artist, song, album or playlist link, or a Spotify URI.');
            }
        }
        const candidate = fromId(type, id);
        if (!candidate) throw spotifyError('invalid_link', 'That Spotify link is not valid.');
        return candidate;
    }
    function parseSpotifyRequest(value, options = {}) {
        const raw = String(value || '').trim();
        if (!raw) throw spotifyError('empty_query', 'Enter an artist, song, playlist or Spotify link.');
        // Pip removes command verbs. Doing it again here corrupts names such as Play Dead.
        let query = raw;
        const direct = parseSpotifyLink(query.replace(/^(["'])(.*)\1$/, '$2'));
        if (direct) return { raw, direct, type: direct.type, query };
        let type = options.type || 'auto';
        if (!['auto', 'genre', 'mine', ...TYPES].includes(type)) type = 'auto';
        let mine = type === 'mine';
        if (/^my\s+playlists?$/i.test(query)) throw spotifyError('empty_query', 'Enter the name of one of your playlists.');
        if (/^my\s+(?:playlist\s+|.+\s+playlist$)/i.test(query)) {
            mine = true;
            query = query.replace(/^my\s+/i, '');
        }
        const wholeNameQuoted = /^(["']).*\1$/.test(query);
        const prefix = !wholeNameQuoted && query.match(/^(?:the\s+)?(artist|band|song|track|album|playlist|genre)\s+(.+)$/i);
        const suffix = !wholeNameQuoted && query.match(/^(.+)\s+(playlist)$/i);
        const songsBy = query.match(/^(?:songs|music|tracks)\s+by\s+(.+)$/i);
        if (songsBy) {
            if (type === 'auto') type = 'artist';
            query = songsBy[1];
        } else if (prefix) {
            if (type === 'auto') type = ({ band: 'artist', song: 'track' })[prefix[1].toLowerCase()] || prefix[1].toLowerCase();
            query = prefix[2];
        } else if (suffix) {
            if (type === 'auto') type = suffix[2].toLowerCase() === 'playlist' ? 'playlist' : 'artist';
            query = suffix[1];
        }
        if (mine) type = 'playlist';
        const quoted = /^(["']).*\1$/.test(query);
        query = query.replace(/^(["'])(.*)\1$/, '$2').trim();
        if (!query) throw spotifyError('empty_query', 'Enter a name to search for.');
        let artist = '';
        const trackBy = query.match(/^(.+)\s+by\s+(.+)$/i);
        if (!quoted && trackBy && ['auto', 'track', 'album'].includes(type)) {
            if (type === 'auto') type = 'track';
            query = trackBy[1].replace(/^(["'])(.*)\1$/, '$2').trim();
            artist = ALIASES[normalizeText(trackBy[2])] || trackBy[2].trim();
        }
        const normalized = normalizeText(query);
        if (type === 'auto' && !quoted && GENRES.has(normalized)) type = 'genre';
        if (['auto', 'artist'].includes(type) && ALIASES[normalized]) {
            query = ALIASES[normalized];
            if (type === 'auto') type = 'artist';
        }
        const escaped = text => text.replace(/["\\]/g, ' ');
        const searchQuery = artist ? `${type}:"${escaped(query)}" artist:"${escaped(artist)}"` : query;
        return { raw, type, mine, query, artist, searchQuery };
    }
    function toCandidate(item, type) {
        if (!item || !item.name || item.is_playable === false || item.restrictions?.reason) return null;
        const candidate = fromId(type, item.id, item.name);
        if (!candidate) return null;
        const artists = (item.artists || []).filter(Boolean).map(a => a.name).filter(Boolean);
        const ownerName = item.owner?.display_name || item.owner?.id || 'Unknown owner';
        const owner = item.owner?.id && item.owner.id !== ownerName ? `${ownerName} (${item.owner.id})` : ownerName;
        const image = (item.images || item.album?.images || []).find(i => /^https:\/\//.test(i?.url || ''))?.url;
        return { ...candidate, artists, ownerId: item.owner?.id || '', image: image || '',
            subtitle: type === 'playlist' ? `Playlist · ${owner}` : `${type[0].toUpperCase()}${type.slice(1)}${artists.length ? ` · ${artists.join(', ')}` : ''}`,
            title: artists.length ? `${item.name} — ${artists.join(', ')}` : item.name };
    }
    function similarity(left, right) {
        const a = normalizeText(left), b = normalizeText(right);
        if (a === b) return 1;
        const words = new Set(a.split(' ').filter(Boolean));
        const other = new Set(b.split(' ').filter(Boolean));
        if (!words.size || !other.size) return 0;
        const common = [...words].filter(w => other.has(w)).length;
        const overlap = common / Math.max(words.size, other.size);
        // Spelling mistakes may be offered as choices, but never count as exact matches.
        if (a.length < 4 || b.length < 4 || a.length > 160 || b.length > 160) return overlap;
        let row = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const next = [i];
            for (let j = 1; j <= b.length; j++) {
                next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            row = next;
        }
        const spelling = 1 - row[b.length] / Math.max(a.length, b.length);
        return Math.max(overlap, spelling >= 0.72 ? spelling : 0);
    }
    function rankCandidates(candidates, request) {
        const seen = new Set();
        return candidates.filter(Boolean).filter(candidate => {
            if (seen.has(candidate.uri)) return false;
            seen.add(candidate.uri);
            return true;
        }).map(candidate => {
            const nameScore = similarity(request.query, candidate.name);
            const artistScore = request.artist ? Math.max(0, ...candidate.artists.map(name => similarity(request.artist, name))) : 1;
            return { ...candidate, score: nameScore * artistScore, exact: nameScore === 1 && artistScore === 1 };
        }).filter(candidate => request.type === 'genre' || candidate.score >= 0.3)
            .sort((a, b) => b.score - a.score);
    }
    async function resolveSpotifyQuery(value, options = {}) {
        const request = parseSpotifyRequest(value, options);
        if (request.direct) return { status: 'resolved', candidate: request.direct, request };
        const api = options.api || (typeof window !== 'undefined' && window.SpotifyAuth);
        if (!api) throw spotifyError('helper_unavailable', 'Spotify search is unavailable. Start the Spotify helper and try again.');
        const offset = Math.max(0, Number(options.offset) || 0);
        let candidates = [], hasMore = false;
        if (request.mine) {
            // Scan all pages before deciding: duplicate titles may be on later pages.
            let libraryOffset = 0;
            while (true) {
                options.signal?.throwIfAborted();
                const data = await api.getPlaylists({ offset: libraryOffset, signal: options.signal });
                candidates.push(...(data.items || []).map(item => toCandidate(item, 'playlist')));
                if (!data.next) break;
                const nextOffset = libraryOffset + (Number(data.limit) || 50);
                if (nextOffset > 100000 || !(data.items || []).length) throw spotifyError('invalid_response', 'Spotify could not finish loading your playlists. Please try again.');
                libraryOffset = nextOffset;
            }
        } else {
            const types = request.type === 'auto' ? TYPES : [request.type === 'genre' ? 'playlist' : request.type];
            const data = await api.search(request.searchQuery, types.join(','), { offset, signal: options.signal });
            for (const type of types) {
                const page = data[`${type}s`];
                candidates.push(...(page?.items || []).map(item => toCandidate(item, type)));
                hasMore ||= !!page?.next;
            }
        }
        candidates = rankCandidates(candidates, request);
        const exact = candidates.filter(candidate => candidate.exact);
        // Public playlist names don't identify owners. Genres always offer suggestions.
        if (!options.choose && !offset && exact.length === 1 && exact[0].type !== 'playlist') {
            return { status: 'resolved', candidate: exact[0], request };
        }
        return { status: candidates.length ? 'choices' : 'not_found', request, candidates,
            offset, hasMore, nextOffset: offset + 10,
            message: candidates.length ? 'Choose a result below.' : `No matching ${request.mine ? 'saved playlists' : 'results'} for “${request.query}”. Try a more specific name or paste a Spotify link.` };
    }
    return { normalizeText, parseSpotifyLink, parseSpotifyRequest, rankCandidates, resolveSpotifyQuery };
});
