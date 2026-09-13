/**
 * Spotify PKCE OAuth — Loopback Redirect (127.0.0.1)
 * Author: SkdSam
 *
 * Spotify's April 2025 security update blocks chromiumapp.org.
 * The only accepted redirect for local apps is http://127.0.0.1
 * This module uses that approach: opens the Spotify auth page in a tab,
 * listens for the redirect via chrome.tabs, captures the code, and
 * exchanges it for tokens — all without a backend server.
 *
 * Setup: Add  http://127.0.0.1  (no port) as your Redirect URI in
 *        developer.spotify.com → your app → Settings
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SpotifyAuth = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'spotify_auth';
    const SCOPES = 'user-read-private user-read-email';
    // Port range to try for the loopback server
    const PORT_MIN = 49152;
    const PORT_MAX = 65535;

    /* ------------------------------------------------------------------ */
    /*  PKCE helpers                                                        */
    /* ------------------------------------------------------------------ */
    function randomString(len) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const arr = new Uint8Array(len);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => chars[b % chars.length]).join('');
    }

    async function sha256(plain) {
        const data = new TextEncoder().encode(plain);
        return crypto.subtle.digest('SHA-256', data);
    }

    function base64URLEncode(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    async function generatePKCE() {
        const verifier = randomString(128);
        const challenge = base64URLEncode(await sha256(verifier));
        return { verifier, challenge };
    }

    /* ------------------------------------------------------------------ */
    /*  Storage helpers                                                     */
    /* ------------------------------------------------------------------ */
    function loadAuthData() {
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.get([STORAGE_KEY], r => resolve(r[STORAGE_KEY] || null));
            } else {
                try { resolve(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
                catch (_) { resolve(null); }
            }
        });
    }

    function saveAuthData(data) {
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                resolve();
            }
        });
    }

    function clearAuthData() {
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.remove([STORAGE_KEY], resolve);
            } else {
                localStorage.removeItem(STORAGE_KEY);
                resolve();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Token management                                                    */
    /* ------------------------------------------------------------------ */
    async function getValidToken() {
        const data = await loadAuthData();
        if (!data?.access_token) return null;

        if (data.expires_at && Date.now() < data.expires_at - 60000) {
            return data.access_token;
        }

        if (data.refresh_token && data.client_id) {
            try {
                const resp = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: data.refresh_token,
                        client_id: data.client_id
                    })
                });
                if (resp.ok) {
                    const json = await resp.json();
                    const updated = {
                        ...data,
                        access_token: json.access_token,
                        refresh_token: json.refresh_token || data.refresh_token,
                        expires_at: Date.now() + json.expires_in * 1000
                    };
                    await saveAuthData(updated);
                    return updated.access_token;
                }
            } catch (_) {}
        }

        await clearAuthData();
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  Pick a random port                                                  */
    /* ------------------------------------------------------------------ */
    function randomPort() {
        return Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1)) + PORT_MIN;
    }

    /* ------------------------------------------------------------------ */
    /*  OAuth PKCE — loopback redirect via tab monitoring                  */
    /* ------------------------------------------------------------------ */
    async function connect(clientId) {
        if (!clientId?.trim()) throw new Error('Please enter your Spotify Client ID first.');
        clientId = clientId.trim();

        const port = randomPort();
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const { verifier, challenge } = await generatePKCE();
        const state = randomString(16);

        const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SCOPES,
            state
        });

        return new Promise((resolve, reject) => {
            let authTabId = null;
            let done = false;

            // Listen for tab URL changes — catch the redirect to 127.0.0.1
            function onTabUpdate(tabId, changeInfo, tab) {
                if (!tab.url) return;

                let url;
                try { url = new URL(tab.url); } catch (_) { return; }

                if (url.hostname !== '127.0.0.1' || url.port !== String(port)) return;
                if (done) return;
                done = true;

                chrome.tabs.onUpdated.removeListener(onTabUpdate);
                chrome.tabs.remove(tabId).catch(() => {});

                const code = url.searchParams.get('code');
                const returnedState = url.searchParams.get('state');
                const error = url.searchParams.get('error');

                if (error) return reject(new Error(`Spotify error: ${error}`));
                if (returnedState !== state) return reject(new Error('State mismatch — possible CSRF'));
                if (!code) return reject(new Error('No authorization code received'));

                // Exchange code for tokens
                fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                        client_id: clientId,
                        code_verifier: verifier
                    })
                })
                .then(r => {
                    if (!r.ok) return r.text().then(t => { throw new Error(`Token exchange failed: ${t}`); });
                    return r.json();
                })
                .then(async tokens => {
                    await saveAuthData({
                        client_id: clientId,
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token,
                        expires_at: Date.now() + tokens.expires_in * 1000
                    });
                    resolve({ success: true });
                })
                .catch(reject);
            }

            chrome.tabs.onUpdated.addListener(onTabUpdate);

            // Open the Spotify login page
            chrome.tabs.create({ url: authUrl }, tab => {
                authTabId = tab.id;
            });

            // Timeout after 5 minutes
            setTimeout(() => {
                if (done) return;
                done = true;
                chrome.tabs.onUpdated.removeListener(onTabUpdate);
                if (authTabId) chrome.tabs.remove(authTabId).catch(() => {});
                reject(new Error('Login timed out — please try again'));
            }, 5 * 60 * 1000);
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Spotify Search API                                                  */
    /* ------------------------------------------------------------------ */
    async function search(query, types = 'artist,track') {
        const token = await getValidToken();
        if (!token) return null;

        const resp = await fetch(
            `https://api.spotify.com/v1/search?${new URLSearchParams({
                q: query,
                type: types,
                limit: 1,
                market: 'from_token'
            })}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!resp.ok) {
            if (resp.status === 401) await clearAuthData();
            return null;
        }

        const data = await resp.json();

        const looksLikeTrack = /\bby\b|'|"/.test(query.toLowerCase());
        const artists = data.artists?.items || [];
        const tracks = data.tracks?.items || [];

        if (looksLikeTrack && tracks.length > 0) {
            const t = tracks[0];
            return { type: 'track', id: t.id, title: `${t.name} — ${t.artists?.[0]?.name || ''}` };
        }
        if (artists.length > 0) {
            const a = artists[0];
            return { type: 'artist', id: a.id, title: a.name };
        }
        if (tracks.length > 0) {
            const t = tracks[0];
            return { type: 'track', id: t.id, title: `${t.name} — ${t.artists?.[0]?.name || ''}` };
        }
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                          */
    /* ------------------------------------------------------------------ */
    async function isConnected() {
        return !!(await getValidToken());
    }

    async function getClientId() {
        const data = await loadAuthData();
        return data?.client_id || '';
    }

    async function disconnect() {
        await clearAuthData();
    }

    function getRedirectUri() {
        // The redirect URI to register in Spotify Developer Dashboard
        // Use http://127.0.0.1 (no port number — Spotify allows any port for loopback)
        return 'http://127.0.0.1';
    }

    return { connect, disconnect, search, isConnected, getClientId, getRedirectUri };
});
