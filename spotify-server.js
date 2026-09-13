/**
 * Chrome Home — Spotify Local Auth & Search Server
 * Author: SkdSam
 *
 * Zero-dependency Node.js server that handles Spotify OAuth and search
 * for the Chrome Home extension.
 *
 * Supports BOTH authentication modes:
 *   1. Client ID only (PKCE Flow) — NO Client Secret needed!
 *   2. Client ID + Client Secret (Client Credentials + Authorization Code)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const os = require('os');

// ── Configuration & Paths ───────────────────────────────────────────────────
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-private user-read-email';
const CONFIG_FILE = path.join(__dirname, 'spotify-credentials.local.json');

let clientId = process.argv[2] || process.env.SPOTIFY_CLIENT_ID || null;
let clientSecret = process.argv[3] || process.env.SPOTIFY_CLIENT_SECRET || null;

// Load persisted credentials if not passed in argv/env
function loadSavedCredentials() {
    if (clientId) return;
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data.clientId) {
                clientId = data.clientId.trim();
                clientSecret = (data.clientSecret || '').trim() || null;
                console.log('🔑 Loaded saved Spotify credentials from spotify-credentials.local.json');
            }
        }
    } catch (err) {
        console.warn('⚠ Could not read saved credentials:', err.message);
    }
}

function saveCredentials(newId, newSecret) {
    clientId = String(newId || '').trim();
    clientSecret = String(newSecret || '').trim() || null;
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({
            clientId,
            clientSecret,
            savedAt: new Date().toISOString()
        }, null, 2), 'utf8');
        console.log('💾 Saved Spotify credentials to spotify-credentials.local.json');
        return true;
    } catch (err) {
        console.error('❌ Failed to save credentials file:', err.message);
        return false;
    }
}

loadSavedCredentials();

// ── Token & PKCE State ──────────────────────────────────────────────────────
let token = {
    access_token: null,
    refresh_token: null,
    expires_at: 0,
    is_user_auth: false
};

let pendingState = null;
let pendingVerifier = null;

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── Spotify HTTP Request Helper ─────────────────────────────────────────────
function spotifyAccountsRequest(requestPath, params) {
    return new Promise((resolve, reject) => {
        if (!clientId) {
            return reject(new Error('Client ID not configured'));
        }
        const postDataParams = { ...params };
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        if (clientSecret) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        } else {
            postDataParams.client_id = clientId;
        }

        const postData = new URLSearchParams(postDataParams).toString();
        headers['Content-Length'] = Buffer.byteLength(postData);

        const options = {
            hostname: 'accounts.spotify.com',
            path: requestPath,
            method: 'POST',
            headers
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Parse error from Spotify: ' + data));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Refresh access token
async function refreshAccessToken() {
    if (!token.refresh_token) {
        if (clientSecret) return fetchClientCredentialsToken();
        throw new Error('Please log in again');
    }
    console.log('🔄 Refreshing Spotify access token...');
    const data = await spotifyAccountsRequest('/api/token', {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token
    });
    if (data.error) {
        if (clientSecret) return fetchClientCredentialsToken();
        throw new Error(data.error_description || data.error);
    }
    token.access_token = data.access_token;
    if (data.refresh_token) token.refresh_token = data.refresh_token;
    token.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
    token.is_user_auth = true;
    console.log('✅ Spotify user token refreshed (valid for', Math.round((data.expires_in || 3600) / 60), 'mins)');
    return token.access_token;
}

// Fetch application token (Client Credentials — requires clientSecret)
async function fetchClientCredentialsToken() {
    if (!clientId || !clientSecret) return null;
    console.log('🔑 Requesting Spotify Client Credentials token...');
    const data = await spotifyAccountsRequest('/api/token', {
        grant_type: 'client_credentials'
    });
    if (data.error) {
        throw new Error(data.error_description || data.error);
    }
    token.access_token = data.access_token;
    token.refresh_token = null;
    token.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
    token.is_user_auth = false;
    console.log('✅ Spotify search token active (valid for', Math.round((data.expires_in || 3600) / 60), 'mins)');
    return token.access_token;
}

async function getValidToken() {
    if (!clientId) return null;
    if (token.access_token && Date.now() < token.expires_at - 60000) {
        return token.access_token;
    }
    if (token.refresh_token) {
        return refreshAccessToken();
    }
    if (clientSecret) {
        return fetchClientCredentialsToken();
    }
    return null;
}

function spotifyAPIRequest(requestPath) {
    return new Promise((resolve, reject) => {
        getValidToken().then(accessToken => {
            if (!accessToken) return reject(new Error('Not authenticated'));
            const options = {
                hostname: 'api.spotify.com',
                path: requestPath,
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Accept': 'application/json'
                }
            };
            const req = https.get(options, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        reject(new Error('Parse error from Spotify API'));
                    }
                });
            });
            req.on('error', reject);
        }).catch(reject);
    });
}

// ── HTTP Helpers ─────────────────────────────────────────────────────────────
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, status, data) {
    cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function html(res, content) {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
}

function readBody(req) {
    return new Promise(resolve => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (_) {
                try {
                    const parsed = Object.fromEntries(new URLSearchParams(body));
                    resolve(parsed);
                } catch (__) {
                    resolve({});
                }
            }
        });
    });
}

function openBrowser(targetUrl) {
    const platform = os.platform();
    const cmd = platform === 'win32' ? `start "" "${targetUrl}"` :
                platform === 'darwin' ? `open "${targetUrl}"` : `xdg-open "${targetUrl}"`;
    exec(cmd);
}

// ── HTTP Request Handler ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:8888'}`);
    const pathname = reqUrl.pathname;
    const query = Object.fromEntries(reqUrl.searchParams);

    if (req.method === 'OPTIONS') {
        cors(res);
        res.writeHead(204);
        res.end();
        return;
    }

    // ── GET /status ──────────────────────────────────────────────────────────
    if (pathname === '/status') {
        const configured = !!clientId;
        const connected = !!token.access_token;
        const maskedId = clientId ? (clientId.slice(0, 4) + '••••' + clientId.slice(-4)) : null;
        json(res, 200, {
            running: true,
            configured,
            connected,
            has_secret: !!clientSecret,
            is_user_auth: token.is_user_auth,
            expires_at: token.expires_at,
            clientId: maskedId,
            redirectUri: REDIRECT_URI
        });
        return;
    }

    // ── POST /config or GET /config ──────────────────────────────────────────
    if (pathname === '/config') {
        let newId = query.clientId;
        let newSecret = query.clientSecret;

        if (req.method === 'POST') {
            const body = await readBody(req);
            newId = newId || body.clientId;
            newSecret = newSecret !== undefined ? newSecret : body.clientSecret;
        }

        if (!newId) {
            json(res, 400, { error: 'Client ID is required.' });
            return;
        }

        const saved = saveCredentials(newId, newSecret);
        if (!saved) {
            json(res, 500, { error: 'Could not save credentials to file.' });
            return;
        }

        // If secret provided, test client credentials token immediately
        if (clientSecret) {
            try {
                await fetchClientCredentialsToken();
            } catch (err) {
                console.warn('Client credentials test warning:', err.message);
            }
        }

        if (req.method === 'GET' && !query.json) {
            res.writeHead(302, { Location: '/' });
            res.end();
            return;
        }

        json(res, 200, {
            success: true,
            message: clientSecret ? 'Spotify credentials saved & search active!' : 'Client ID saved! Click Connect to authenticate via PKCE.',
            connected: !!token.access_token,
            has_secret: !!clientSecret
        });
        return;
    }

    // ── GET /search?q=... ────────────────────────────────────────────────────
    if (pathname === '/search') {
        const q = query.q;
        if (!q) { json(res, 400, { error: 'Missing ?q=' }); return; }

        if (!clientId) {
            json(res, 401, {
                error: 'not_configured',
                message: 'Spotify Client ID not set. Open http://127.0.0.1:8888 to enter it.'
            });
            return;
        }

        try {
            const types = query.type || 'artist,track,playlist';
            const result = await spotifyAPIRequest(
                `/v1/search?${new URLSearchParams({ q, type: types, limit: 5 })}`
            );
            json(res, result.status, result.body);
        } catch (err) {
            if (err.message === 'Not authenticated') {
                json(res, 401, { error: 'not_connected', message: 'Click Connect on the widget to log into Spotify.' });
            } else {
                json(res, 500, { error: err.message });
            }
        }
        return;
    }

    // ── GET /login ───────────────────────────────────────────────────────────
    if (pathname === '/login') {
        if (!clientId) {
            json(res, 400, { error: 'Configure Client ID first.' });
            return;
        }

        pendingState = generateState();
        pendingVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(pendingVerifier);

        const authParams = {
            client_id: clientId,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            state: pendingState,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            show_dialog: 'false'
        };

        const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams(authParams);

        if (query.json === '1' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            openBrowser(authUrl);
            json(res, 200, { authUrl, message: 'Opening Spotify login in your browser…' });
            return;
        }

        // Direct browser navigation -> 302 redirect directly to Spotify login page
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
    }

    // ── GET /callback ────────────────────────────────────────────────────────
    if (pathname === '/callback') {
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
            const tokenParams = {
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: pendingVerifier
            };

            const data = await spotifyAccountsRequest('/api/token', tokenParams);

            if (data.error) throw new Error(data.error_description || data.error);

            token.access_token = data.access_token;
            token.refresh_token = data.refresh_token;
            token.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
            token.is_user_auth = true;
            pendingState = null;
            pendingVerifier = null;

            console.log('\n✅ User Spotify account connected! Token valid for', Math.round((data.expires_in || 3600) / 60), 'minutes\n');

            html(res, `<!DOCTYPE html>
<html>
<head>
  <title>Connected!</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #121212; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 40px; background: rgba(255,255,255,0.04); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); max-width: 420px; }
    h1 { color: #1db954; margin: 0 0 12px; font-size: 2.2em; }
    p { color: #aaa; margin: 6px 0; }
  </style>
  <script>setTimeout(() => window.close(), 2500);</script>
</head>
<body>
  <div class="box">
    <h1>✅ Connected!</h1>
    <p>Spotify is now linked to Chrome Home.</p>
    <p style="color:#666;font-size:12px;margin-top:16px;">This tab will close automatically in 2 seconds…</p>
  </div>
</body>
</html>`);
        } catch (err) {
            console.error('❌ Token exchange failed:', err.message);
            html(res, `<h2>❌ Token exchange failed</h2><p>${err.message}</p>`);
        }
        return;
    }

    // ── GET / (Setup / Dashboard UI) ─────────────────────────────────────────
    if (pathname === '/') {
        const isConfigured = !!clientId;
        const hasToken = !!token.access_token;

        html(res, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Chrome Home — Spotify Helper</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #121212;
      --card: #181818;
      --card-border: rgba(255, 255, 255, 0.1);
      --accent: #1db954;
      --accent-hover: #1ed760;
      --text: #ffffff;
      --text-muted: #a7a7a7;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 32px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 24px;
    }
    .logo {
      width: 44px;
      height: 44px;
      background: var(--accent);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .subtitle { color: var(--text-muted); font-size: 13px; margin-top: 2px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .badge.active { background: rgba(29, 185, 84, 0.15); color: #1db954; border: 1px solid rgba(29, 185, 84, 0.3); }
    .badge.pending { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
    .step-box {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.5;
    }
    .step-title {
      font-weight: 600;
      color: #fff;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-num {
      background: var(--accent);
      color: #000;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }
    .code-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 8px 12px;
      margin: 8px 0;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      color: var(--accent);
      font-size: 12px;
      flex: 1;
      word-break: break-all;
    }
    .copy-btn {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .copy-btn:hover { background: rgba(255,255,255,0.2); }
    .field { margin-bottom: 14px; }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13px;
      font-family: monospace;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus { border-color: var(--accent); }
    .btn {
      width: 100%;
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 8px;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: rgba(255,255,255,0.08);
      color: #fff;
      margin-top: 10px;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .help-link { color: var(--accent); text-decoration: none; }
    .help-link:hover { text-decoration: underline; }
    .footer-text {
      text-align: center;
      font-size: 11px;
      color: #666;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">🎵</div>
      <div>
        <h1>Chrome Home Spotify Helper</h1>
        <div class="subtitle">Local search & auth helper for any artist or song</div>
      </div>
    </div>

    ${isConfigured && hasToken ? `
      <div class="badge active">● Active & Ready — Search works for any artist or song</div>
      <p style="font-size:13px;color:#bbb;line-height:1.5">
        Spotify is linked to Chrome Home! You can search and play any artist or song.
      </p>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px;">
        <button class="btn" onclick="openLogin()">Re-authenticate with Spotify</button>
        <button class="btn btn-secondary" onclick="location.href='/?edit=1'">Edit Credentials</button>
      </div>
    ` : `
      <div class="badge pending">● Setup Required</div>

      <div class="step-box">
        <div class="step-title"><span class="step-num">1</span> Spotify Dashboard Setup</div>
        <div>In your Spotify app settings, add this Redirect URI:</div>
        <div class="code-box">
          <code id="uri">${REDIRECT_URI}</code>
          <button class="copy-btn" type="button" onclick="navigator.clipboard.writeText('${REDIRECT_URI}');this.textContent='Copied!'">Copy</button>
        </div>
      </div>

      <div class="step-box">
        <div class="step-title"><span class="step-num">2</span> Enter Your Spotify Client ID</div>
        <form action="/config" method="GET">
          <div class="field">
            <label for="clientId">Client ID (Required)</label>
            <input type="text" id="clientId" name="clientId" placeholder="Paste your Client ID" required value="${clientId || ''}">
          </div>
          <div class="field">
            <label for="clientSecret">Client Secret (Optional — click "View client secret" in dashboard)</label>
            <input type="password" id="clientSecret" name="clientSecret" placeholder="Optional" value="${clientSecret || ''}">
          </div>
          <button type="submit" class="btn">Save & Connect</button>
        </form>
      </div>
    `}

    <div class="footer-text">
      Running locally on 127.0.0.1:8888 · Zero external trackers · Saved locally
    </div>
  </div>

  <script>
    function openLogin() {
      fetch('/login').then(r => r.json()).then(d => {
        alert(d.message || 'Opening Spotify login in your browser…');
      });
    }
  </script>
</body>
</html>`);
        return;
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    json(res, 404, { error: 'Not found' });
});

// ── Startup & Port Handling ──────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
    console.log('\n🎵 Chrome Home Spotify Server running');
    console.log(`   Local URL:    http://127.0.0.1:${PORT}`);
    console.log(`   Redirect URI: ${REDIRECT_URI}`);
    if (clientId) {
        console.log('   Status:       ✅ Configured & Ready');
        if (clientSecret) {
            getValidToken().catch(err => console.warn('⚠ Initial token fetch:', err.message));
        }
    } else {
        console.log('   Status:       ⚡ Setup needed: open http://127.0.0.1:8888 or use Chrome Home widget');
    }
    console.log('');
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.log(`\nℹ️ Port ${PORT} is already running.`);
        console.log('   The Spotify helper server is already active!\n');
    } else {
        console.error('Server error:', err);
    }
});
