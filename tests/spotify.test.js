const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../spotify-catalog');
const auth = require('../spotify-auth');
const { createController } = require('../spotify-search');
const { parseRequest, handleWidgetRequest } = require('../ask-pip');

const id = n => String(n).padStart(22, '0');
const artist = (name, n = 1) => ({ name, id: id(n) });
const playlist = (name, owner, n = 1) => ({ name, id: id(n), owner: { id: owner, display_name: owner } });
const track = (name, by, n = 1, extra = {}) => ({ name, id: id(n), artists: [{ name: by }], ...extra });
const apiFor = data => ({ search: async () => data });
const resolve = (query, data, options = {}) => catalog.resolveSpotifyQuery(query, { api: apiFor(data), ...options });

test('Pip preserves music intent, names and playlist words', () => {
    for (const [input, query] of [
        ['play Queen playlist', 'Queen playlist'], ['play Deep Focus playlist', 'Deep Focus playlist'],
        ['play The The', 'The The'], ['play Roxy Music', 'Roxy Music'], ['play Play Dead', 'Play Dead'],
        ['Can you play Red Hot Chili Peppers on Spotify?', 'Red Hot Chili Peppers'],
        ['play my playlist Summer', 'my playlist Summer']
    ]) assert.deepEqual(parseRequest(input), { type: 'widget', action: 'spotify_play', query });
    assert.equal(parseRequest('help me plan today').type, 'plan');
    assert.equal(parseRequest('add note play Queen').action, 'notes_add');
});

test('genre substrings never turn artist names into playlists', () => {
    for (const name of ['Beach House', 'Panic! At The Disco', 'Pop Smoke', 'Roxy Music', 'The The', 'Play Dead']) {
        const request = catalog.parseSpotifyRequest(name);
        assert.equal(request.type, 'auto');
        assert.equal(request.query, name);
    }
    assert.equal(catalog.parseSpotifyRequest('house').type, 'genre');
    assert.equal(catalog.parseSpotifyRequest('house', { type: 'artist' }).type, 'artist');
    assert.equal(catalog.parseSpotifyRequest('"House"').type, 'auto');
    assert.equal(catalog.parseSpotifyRequest('"The Playlist"').query, 'The Playlist');
});

test('explicit request types and track artist constraints survive parsing', () => {
    assert.equal(catalog.parseSpotifyRequest('Queen playlist').type, 'playlist');
    assert.equal(catalog.parseSpotifyRequest('playlist Queen').query, 'Queen');
    assert.equal(catalog.parseSpotifyRequest('my Queen playlist').mine, true);
    assert.equal(catalog.parseSpotifyRequest('my playlist Queen').query, 'Queen');
    assert.equal(catalog.parseSpotifyRequest('Queen', { type: 'mine' }).mine, true);
    assert.equal(catalog.parseSpotifyRequest('songs by Queen').type, 'artist');
    const request = catalog.parseSpotifyRequest('song "Hello" by Adele');
    assert.equal(request.type, 'track');
    assert.equal(request.query, 'Hello');
    assert.equal(request.artist, 'Adele');
    assert.equal(request.searchQuery, 'track:"Hello" artist:"Adele"');
});

test('only genuine aliases are expanded', () => {
    assert.equal(catalog.parseSpotifyRequest('rhcp').query, 'Red Hot Chili Peppers');
    assert.equal(catalog.parseSpotifyRequest('tupac').query, '2Pac');
    assert.equal(catalog.parseSpotifyRequest('Freddie Mercury').query, 'Freddie Mercury');
    assert.equal(catalog.parseSpotifyRequest('Kurt Cobain').query, 'Kurt Cobain');
});

test('direct URLs, international URLs, embed URLs and URIs bypass search', async () => {
    for (const input of [`https://open.spotify.com/playlist/${id(1)}?si=abc`,
        `https://open.spotify.com/intl-de/playlist/${id(1)}`, `https://open.spotify.com/embed/playlist/${id(1)}`,
        `spotify:playlist:${id(1)}`, `"spotify:playlist:${id(1)}"`, parseRequest(`play spotify:playlist:${id(1)}`).query]) {
        const result = await catalog.resolveSpotifyQuery(input, { api: { search() { throw new Error('Must not search links'); } } });
        assert.equal(result.status, 'resolved');
        assert.equal(result.candidate.uri, `spotify:playlist:${id(1)}`);
        assert.equal(result.candidate.embedUrl, `https://open.spotify.com/embed/playlist/${id(1)}?utm_source=generator`);
    }
});

test('malformed, deceptive and unsupported URLs never become embeds', () => {
    for (const url of ['https://spotify.com.evil.example/playlist/a', 'https://example.com',
        `https://open.spotify.com@evil.example/playlist/${id(1)}`, `http://open.spotify.com/playlist/${id(1)}`,
        'https://open.spotify.com/search/Queen', 'https://spotify.link/abc', 'spotify:playlist:bad']) {
        assert.throws(() => catalog.parseSpotifyLink(url), { code: 'invalid_link' });
    }
    assert.throws(() => catalog.parseSpotifyRequest(''), { code: 'empty_query' });
});

test('exact artist beats a tribute even when the exact artist is returned second', async () => {
    const result = await resolve('Queen', { artists: { items: [artist('Queen Tribute', 1), artist('Queen', 2)] } });
    assert.equal(result.status, 'resolved');
    assert.equal(result.candidate.id, id(2));
});

test('genre-word artists resolve to artists and not a hardcoded genre ID', async () => {
    for (const name of ['Beach House', 'Panic! At The Disco']) {
        const result = await resolve(name, { artists: { items: [artist(name)] }, playlists: { items: [playlist('Housewerk', 'Spotify', 2)] } });
        assert.equal(result.status, 'resolved');
        assert.equal(result.candidate.type, 'artist');
        assert.equal(result.candidate.name, name);
    }
});

test('duplicate artist names and names shared across types require a choice', async () => {
    let result = await resolve('Queen', { artists: { items: [artist('Queen', 1), artist('Queen', 2)] } });
    assert.equal(result.status, 'choices');
    result = await resolve('Queen', { artists: { items: [artist('Queen', 1)] }, tracks: { items: [track('Queen', 'Other', 2)] } });
    assert.equal(result.status, 'choices');
});

test('a playlist request searches only playlists and preserves owner/artwork', async () => {
    let call;
    const result = await catalog.resolveSpotifyQuery('Queen playlist', { api: { search: async (...args) => {
        call = args;
        return { artists: { items: [artist('Queen')] }, playlists: { items: [null,
            { ...playlist('Queen', 'Alice', 2), images: [{ url: 'https://example.com/art.jpg' }] },
            playlist('Queen', 'Bob', 3)] } };
    } } });
    assert.equal(call[0], 'Queen');
    assert.equal(call[1], 'playlist');
    assert.equal(result.status, 'choices');
    assert.equal(result.candidates.length, 2);
    assert.match(result.candidates[0].subtitle, /Alice/);
    assert.equal(result.candidates[0].image, 'https://example.com/art.jpg');
});

test('track-by-artist request cannot silently select another performer', async () => {
    const result = await resolve('Hello by Adele', { tracks: { items: [track('Hello', 'Lionel Richie', 1), track('Hello', 'Adele', 2)] } });
    assert.equal(result.status, 'resolved');
    assert.equal(result.candidate.id, id(2));
    assert.equal((await resolve('Hello by Adele', { tracks: { items: [track('Hello', 'Lionel Richie')] } })).status, 'not_found');
});

test('Unicode and accent matching work, while spelling guesses require a choice', async () => {
    assert.equal((await resolve('Beyonce', { artists: { items: [artist('Beyoncé')] } })).status, 'resolved');
    assert.equal((await resolve('宇多田ヒカル', { artists: { items: [artist('宇多田ヒカル')] } })).status, 'resolved');
    assert.equal((await resolve('Adle', { artists: { items: [artist('Adele')] } })).status, 'choices');
});

test('missing, unavailable and malformed candidates never load unrelated music', async () => {
    for (const data of [{}, { artists: { items: [artist('Unrelated')] } },
        { tracks: { items: [track('Hello', 'Adele', 1, { is_playable: false }), null, { name: 'Hello', id: 'broken' }] } }]) {
        const result = await resolve('Hello', data);
        assert.equal(result.status, 'not_found');
        assert.equal(result.candidate, undefined);
    }
});

test('genres offer live playlists and pagination remains available', async () => {
    const result = await resolve('disco', { playlists: { items: [playlist('Disco Fever', 'Spotify')], next: 'next-page' } });
    assert.equal(result.status, 'choices');
    assert.equal(result.hasMore, true);
    assert.equal(result.nextOffset, 10);
    const emptyPage = await resolve('Queen playlist', { playlists: { items: [], next: 'next-page' } }, { offset: 10 });
    assert.equal(emptyPage.status, 'not_found');
    assert.equal(emptyPage.nextOffset, 20);
});

test('personal playlist search scans later pages and never calls public search', async () => {
    const offsets = [];
    const result = await catalog.resolveSpotifyQuery('my playlist Summer', { api: {
        search() { throw new Error('Must not search public catalog'); },
        getPlaylists: async ({ offset }) => {
            offsets.push(offset);
            return offset === 0 ? { items: [playlist('Summer', 'Me', 1)], next: 'next', limit: 50 }
                : { items: [playlist('Summer', 'Friend', 2)], next: null };
        }
    } });
    assert.deepEqual(offsets, [0, 50]);
    assert.equal(result.status, 'choices');
    assert.equal(result.candidates.length, 2);
});

test('API failures propagate and do not fall back to another catalog', async () => {
    const error = Object.assign(new Error('Connect Spotify'), { code: 'auth_required' });
    await assert.rejects(catalog.resolveSpotifyQuery('Queen', { api: { search: async () => { throw error; } } }), error);
});

test('auth client distinguishes service, authentication and rate-limit failures', async () => {
    const originalFetch = global.fetch;
    try {
        for (const [status, code] of [[401, 'auth_required'], [403, 'access_denied'], [429, 'rate_limited'], [502, 'service_error']]) {
            global.fetch = async () => ({ ok: false, status, headers: new Headers({ 'Retry-After': '12' }), json: async () => ({ error: 'error' }) });
            await assert.rejects(auth.search('Queen'), error => error.code === code && (status !== 429 || error.message.includes('12')));
        }
        global.fetch = async () => { throw new TypeError('fetch failed'); };
        await assert.rejects(auth.search('Queen'), { code: 'helper_unavailable' });
    } finally { global.fetch = originalFetch; }
});

test('auth client forwards pagination and cancellation, including response bodies', async () => {
    const originalFetch = global.fetch;
    try {
        let url;
        global.fetch = async input => { url = new URL(input); return { ok: true, status: 200, json: async () => ({ artists: { items: [] } }) }; };
        await auth.search('Queen', 'artist', { offset: 10 });
        assert.equal(url.searchParams.get('offset'), '10');
        await auth.getPlaylists({ offset: 50 });
        assert.equal(url.pathname, '/playlists');
        assert.equal(url.searchParams.get('offset'), '50');
        const controller = new AbortController();
        global.fetch = async (_, { signal }) => ({ ok: true, json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) });
        const pending = auth.search('Queen', 'artist', { signal: controller.signal });
        await Promise.resolve();
        controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
    } finally { global.fetch = originalFetch; }
});

test('slow earlier results cannot overwrite the newest selection', async () => {
    const deferred = new Map(), selected = [], results = [];
    const controller = createController({ resolve: query => new Promise(done => deferred.set(query, done)),
        onSelect: c => selected.push(c.title), onResult: r => results.push(r.status) });
    const old = controller.search('Old');
    const latest = controller.search('New');
    deferred.get('New')({ status: 'resolved', candidate: { title: 'New' } });
    await latest;
    deferred.get('Old')({ status: 'resolved', candidate: { title: 'Old' } });
    assert.equal((await old).status, 'superseded');
    assert.deepEqual(selected, ['New']);
    assert.equal(results.at(-1), 'resolved');
});

test('errors, no results and expired result buttons preserve current music', async () => {
    const selected = [];
    const controller = createController({ resolve: async query => {
        if (query === 'error') throw new Error('Offline');
        if (query === 'none') return { status: 'not_found', candidates: [] };
        return { status: 'choices', candidates: [{ uri: 'valid-choice', title: 'Chosen' }] };
    }, onSelect: c => selected.push(c.title), onResult() {} });
    const first = await controller.search('choices');
    assert.equal(controller.choose('unoffered', first.version).status, 'superseded');
    await controller.search('error');
    assert.equal(controller.choose('valid-choice', first.version).status, 'superseded');
    await controller.search('none');
    assert.deepEqual(selected, []);
    const next = await controller.search('choices');
    assert.equal(controller.choose('valid-choice', next.version).success, true);
    controller.choose('valid-choice', next.version);
    assert.deepEqual(selected, ['Chosen']);
});

test('deadline returns an error even if a provider ignores cancellation', async () => {
    const controller = createController({ resolve: () => new Promise(() => {}), timeoutMs: 10,
        onSelect() { assert.fail('Must not select'); }, onResult() {} });
    const result = await controller.search('Queen');
    assert.equal(result.code, 'timeout');
    assert.equal(result.success, false);
});

test('Pip reports ambiguity and errors without claiming music is playing', async () => {
    const originalWindow = global.window;
    try {
        for (const result of [{ status: 'choices', success: false }, { status: 'error', success: false, message: 'Connect Spotify' }]) {
            global.window = { chromeHomeWidgets: { playSpotify: async () => result } };
            const reply = await handleWidgetRequest({ action: 'spotify_play', query: 'Queen' });
            assert.doesNotMatch(reply.text, /Switched|Playing/);
            assert.match(reply.text, result.status === 'choices' ? /Choose/ : /Connect Spotify/);
        }
    } finally { global.window = originalWindow; }
});
