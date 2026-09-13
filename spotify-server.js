/**
 * Chrome Home — Spotify Local Auth Server
 * Author: SkdSam
 *
 * A tiny Node.js server (zero npm dependencies) that handles Spotify OAuth
 * for the Chrome Home extension. Run this once in your terminal.
 *
 * Usage:
 *   node spotify-server.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * Where to get CLIENT_ID and CLIENT_SECRET:
 *   1. Go to developer.spotify.com/dashboard → Create app (any name)
 *   2. Add Redirect URI:  http://127.0.0.1:8888/callback
 *   3. Tick "Web API" → Save
 *   4. Copy Client ID and Client Secret
 *
 * Then run:
 *   node spotify-server.js abc123clientid abc123clientsecret
 *
 * The server stays running. Your extension will automatically use it.
 * To stop: press Ctrl+C in the terminal.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const { exec } = require('child_process');
const os = require('os');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = 8888;
const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-private user-read-email';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('\n❌  Missing credentials.\n');
    console.error('Usage: node spotify-server.js <CLIENT_ID> <CLIENT_SECRET>\n');
    console.error('Get your credentials from: https://developer.spotify.com/dashboard\n');
    process.exit(1);
}

// ── Token state ──────────────────────────────────────────────────────────────
let token = {
    access_token: null,
    refresh_token: null,
    expires_at: 0
};

// ── PKCE helpers (not needed for auth code with secret, but we use code flow) ─
function generateState() {
    return Math.random().toString(36).substring(2, 18);
}

let pendingState = null;

// ── Spotify API helpers ───────────────────────────────────────────────────────
function spotifyRequest(path, params) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'accounts.spotify.com',
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Parse error: ' + data)); }
            });
        });
        req.on('error', reject);
        req.write(new URLSearchParams(params).toString());
        req.end();
    });
}

async function refreshAccessToken() {
    console.log('🔄  Refreshing access token...');
    const data = await spotifyRequest('/api/token', {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token
    });
    if (data.error) throw new Error(data.error_description || data.error);
    token.access_token = data.access_token;
    if (data.refresh_token) token.refresh_token = data.refresh_token;
    token.expires_at = Date.now() + data.expires_in * 1000;
    console.log('✅  Token refreshed, valid for', Math.round(data.expires_in / 60), 'minutes');
}

async function getValidToken() {
    if (!token.access_token) return null;
    if (Date.now() < token.expires_at - 60000) return token.access_token;
    await refreshAccessToken();
    return token.access_token;
}

function spotifyAPIRequest(path) {
    return new Promise((resolve, reject) => {
        getValidToken().then(accessToken => {
            if (!accessToken) return reject(new Error('Not authenticated'));
            const options = {
                hostname: 'api.spotify.com',
                path,
                headers: { 'Authorization': 'Bearer ' + accessToken }
            };
            const req = https.get(options, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                    catch (e) { reject(new Error('Parse error')); }
                });
            });
            req.on('error', reject);
        }).catch(reject);
    });
}

// ── CORS helper ──────────────────────────────────────────────────────────────
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
    cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function html(res, content) {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
}

// ── Open browser cross-platform ───────────────────────────────────────────────
function openBrowser(url) {
    const platform = os.platform();
    const cmd = platform === 'win32' ? `start "" "${url}"` :
                 platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const path = parsed.pathname;
    const query = parsed.query;

    if (req.method === 'OPTIONS') {
        cors(res);
        res.writeHead(204);
        res.end();
        return;
    }

    // ── GET / → login page ──────────────────────────────────────────────────
    if (path === '/') {
        pendingState = generateState();
        const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            state: pendingState,
            show_dialog: 'false'
        });
        openBrowser(authUrl);
        html(res, `<!DOCTYPE html>
<html>
<head>
  <title>Chrome Home — Spotify Auth</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #121212; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 40px; }
    h1 { color: #1db954; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🎵 Spotify Login</h1>
    <p>Opening Spotify login in your browser…</p>
    <p style="color:#666;font-size:12px">You can close this tab after logging in.</p>
  </div>
</body>
</html>`);
        return;
    }

    // ── GET /callback → exchange code for tokens ────────────────────────────
    if (path === '/callback') {
        const code = query.code;
        const state = query.state;
        const error = query.error;

        if (error) {
            html(res, `<h2>❌ Spotify error: ${error}</h2><p>Close this tab and try again.</p>`);
            return;
        }
        if (state !== pendingState) {
            html(res, `<h2>❌ State mismatch</h2><p>Possible CSRF. Try again.</p>`);
            return;
        }
        if (!code) {
            html(res, `<h2>❌ No code received</h2>`);
            return;
        }

        try {
            const data = await spotifyRequest('/api/token', {
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            });

            if (data.error) throw new Error(data.error_description || data.error);

            token.access_token = data.access_token;
            token.refresh_token = data.refresh_token;
            token.expires_at = Date.now() + data.expires_in * 1000;
            pendingState = null;

            console.log('\n✅  Spotify connected! Token valid for', Math.round(data.expires_in / 60), 'minutes');
            console.log('    The Chrome Home extension can now search any artist or song.\n');

            html(res, `<!DOCTYPE html>
<html>
<head>
  <title>Connected!</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #121212; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 40px; }
    h1 { color: #1db954; font-size: 3em; }
  </style>
  <script>setTimeout(() => window.close(), 2000);</script>
</head>
<body>
  <div class="box">
    <h1>✅ Connected!</h1>
    <p>Spotify is now linked to Chrome Home.</p>
    <p style="color:#666">This tab will close automatically…</p>
  </div>
</body>
</html>`);
        } catch (err) {
            console.error('❌  Token exchange failed:', err.message);
            html(res, `<h2>❌ Token exchange failed</h2><p>${err.message}</p>`);
        }
        return;
    }

    // ── GET /status → connection status (for extension to check) ────────────
    if (path === '/status') {
        const connected = !!token.access_token;
        json(res, 200, { connected, expires_at: token.expires_at });
        return;
    }

    // ── GET /search?q=... → proxy Spotify search API ─────────────────────────
    if (path === '/search') {
        const q = query.q;
        if (!q) { json(res, 400, { error: 'Missing ?q=' }); return; }

        try {
            const types = query.type || 'artist,track';
            const result = await spotifyAPIRequest(
                `/v1/search?${new URLSearchParams({ q, type: types, limit: 3, market: 'from_token' })}`
            );
            json(res, result.status, result.body);
        } catch (err) {
            if (err.message === 'Not authenticated') {
                json(res, 401, { error: 'not_connected', message: 'Open http://127.0.0.1:8888 to connect Spotify' });
            } else {
                json(res, 500, { error: err.message });
            }
        }
        return;
    }

    // ── GET /login → trigger login flow from extension ───────────────────────
    if (path === '/login') {
        pendingState = generateState();
        const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            state: pendingState,
            show_dialog: 'false'
        });
        openBrowser(authUrl);
        json(res, 200, { message: 'Opening Spotify login in your browser…' });
        return;
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('\n🎵  Chrome Home Spotify Server running');
    console.log(`    Local:  http://127.0.0.1:${PORT}`);
    console.log('\n📋  To connect Spotify: open http://127.0.0.1:8888 in your browser');
    console.log('    Or click "Connect" in the Chrome Home Spotify widget.\n');
    console.log('    Press Ctrl+C to stop.\n');
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Port ${PORT} is already in use.`);
        console.error('    Is the server already running? Check Task Manager.\n');
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});
