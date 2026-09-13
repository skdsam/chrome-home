const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Execute the actual server with fake transports: no port, credentials file or Spotify account.
function helper({ user = false, expired = false, env = {} } = {}) {
    const replies = [], requests = [];
    let handler;
    const transport = (options, callback, startNow) => {
        const request = new EventEmitter();
        request.write = () => {};
        request.destroy = error => { request.emit('error', error); request.emit('close'); };
        request.end = () => queueMicrotask(() => {
            requests.push({ path: options.path, hostname: options.hostname });
            const reply = replies.shift();
            if (!reply) { request.destroy(new Error('Unexpected request')); return; }
            if (reply.error) { request.destroy(reply.error); return; }
            const response = new EventEmitter();
            response.statusCode = reply.status || 200;
            response.headers = reply.headers || {};
            callback(response);
            response.emit('data', JSON.stringify(reply.body || {}));
            response.emit('end');
            request.emit('close');
        });
        if (startNow) request.end();
        return request;
    };
    const context = vm.createContext({
        require(name) {
            if (name === 'http') return { createServer(fn) { handler = fn; return { listen() {}, on() {} }; } };
            if (name === 'https') return { get: (o, cb) => transport(o, cb, true), request: (o, cb) => transport(o, cb, false) };
            if (name === 'fs') return { existsSync: () => false, writeFileSync() {} };
            if (name === 'child_process') return { exec() { assert.fail('Must not launch a browser'); } };
            return require(name);
        },
        __dirname: path.resolve(__dirname, '..'), process: { argv: ['node', 'spotify-server.js'], env: { SPOTIFY_CLIENT_ID: 'test', SPOTIFY_CLIENT_SECRET: 'test', ...env } },
        console: { log() {}, warn() {}, error() {} }, Buffer, URL, URLSearchParams, setTimeout, clearTimeout
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../spotify-server.js'), 'utf8'), context);
    vm.runInContext(`token = { access_token: 'test-access', refresh_token: ${user ? "'test-refresh'" : 'null'}, is_user_auth: ${user}, expires_at: ${expired ? '0' : 'Date.now() + 3600000'} };`, context);
    async function request(url) {
        const headers = {};
        let status, body;
        const response = { setHeader(key, value) { headers[key.toLowerCase()] = value; },
            writeHead(code, extra = {}) { status = code; Object.assign(headers, extra); },
            end(value) { body = value ? JSON.parse(value) : null; } };
        await handler({ url, method: 'GET', headers: { host: '127.0.0.1:8888' } }, response);
        return { status, body, headers };
    }
    return { replies, requests, request, context };
}

test('search sends the requested type, market, limit and offset', async () => {
    const app = helper();
    app.replies.push({ body: { artists: { items: [] } } });
    assert.equal((await app.request('/search?q=Queen&type=artist&offset=10')).status, 200);
    const url = new URL(app.requests[0].path, 'https://api.spotify.com');
    assert.equal(url.searchParams.get('market'), 'GB');
    assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(url.searchParams.get('offset'), '10');
    assert.equal(url.searchParams.get('type'), 'artist');
    const other = helper({ env: { SPOTIFY_MARKET: 'US' } });
    other.replies.push({ body: {} });
    await other.request('/search?q=Queen');
    assert.match(other.requests[0].path, /market=US/);
});

test('invalid queries do not reach Spotify', async () => {
    const app = helper();
    for (const url of ['/search', '/search?q=x&type=user', '/search?q=x&offset=-1', '/search?q=x&offset=1001', '/playlists?offset=oops']) {
        assert.equal((await app.request(url)).status, 400);
    }
    assert.equal(app.requests.length, 0);
});

test('personal library requires a user token, including after application token renewal', async () => {
    const app = helper();
    assert.equal((await app.request('/playlists')).body.error, 'user_login_required');
    assert.equal(app.requests.length, 0);
    const expired = helper({ expired: true });
    expired.replies.push({ body: { access_token: 'test-renewed', expires_in: 3600 } });
    assert.equal((await expired.request('/playlists')).status, 401);
    assert.equal(expired.requests.length, 1);
    assert.equal(expired.requests[0].hostname, 'accounts.spotify.com');
});

test('personal library passes pagination to the correct endpoint', async () => {
    const app = helper({ user: true });
    app.replies.push({ body: { items: [], next: null } });
    const result = await app.request('/playlists?offset=50');
    assert.equal(result.status, 200);
    assert.equal(app.requests[0].path, '/v1/me/playlists?limit=50&offset=50');
});

test('401 renews the token once and retries the same query', async () => {
    const app = helper({ user: true });
    app.replies.push({ status: 401, body: { error: 'expired' } },
        { body: { access_token: 'test-renewed', expires_in: 3600 } },
        { body: { artists: { items: [] } } });
    assert.equal((await app.request('/search?q=Queen')).status, 200);
    assert.equal(app.requests.length, 3);
    assert.equal(app.requests[0].path, app.requests[2].path);
});

test('persistent 401 does not loop forever', async () => {
    const app = helper({ user: true });
    app.replies.push({ status: 401 }, { body: { access_token: 'test-renewed', expires_in: 3600 } }, { status: 401 });
    assert.equal((await app.request('/search?q=Queen')).status, 401);
    assert.equal(app.requests.length, 3);
});

test('failed user refresh never silently substitutes an application token for a library request', async () => {
    const app = helper({ user: true, expired: true });
    app.replies.push({ body: { error: 'invalid_grant' } });
    assert.equal((await app.request('/playlists')).status, 401);
    assert.equal(app.requests.length, 1);
});

test('concurrent searches share one expired token refresh', async () => {
    const app = helper({ user: true, expired: true });
    app.replies.push({ body: { access_token: 'test-renewed', expires_in: 3600 } }, { body: {} }, { body: {} });
    const results = await Promise.all([app.request('/search?q=Queen'), app.request('/search?q=Adele')]);
    assert(results.every(result => result.status === 200));
    assert.equal(app.requests.filter(r => r.hostname === 'accounts.spotify.com').length, 1);
});

test('429 preserves Retry-After and prevents requests during the cooldown', async () => {
    const app = helper();
    app.replies.push({ status: 429, body: { error: 'rate limit' }, headers: { 'retry-after': '30' } });
    let response = await app.request('/search?q=Queen');
    assert.equal(response.status, 429);
    assert.equal(response.headers['retry-after'], '30');
    assert.equal(response.headers['access-control-expose-headers'], 'Retry-After');
    response = await app.request('/search?q=Adele');
    assert.equal(response.status, 429);
    assert.equal(app.requests.length, 1);
});

test('upstream permission failures and network timeouts remain distinguishable', async () => {
    const app = helper();
    app.replies.push({ status: 403, body: { error: 'denied' } });
    assert.equal((await app.request('/search?q=Queen')).status, 403);
    app.replies.push({ error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) });
    assert.equal((await app.request('/search?q=Queen')).status, 504);
    app.replies.push({ error: new Error('network') });
    assert.equal((await app.request('/search?q=Queen')).status, 502);
});

test('new account login requests private playlist scope', () => {
    const app = helper();
    assert.match(vm.runInContext('SCOPES', app.context), /playlist-read-private/);
});
