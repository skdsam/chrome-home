/**
 * Spotify PKCE OAuth + Search API
 * Author: SkdSam
 *
 * Flow:
 *  1. User enters Client ID (from developer.spotify.com)
 *  2. chrome.identity.launchWebAuthFlow opens Spotify login
 *  3. Access token stored in chrome.storage.local
 *  4. Every search calls Spotify Search API → exact IDs → correct embed
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
        const enc = new TextEncoder();
        const data = enc.encode(plain);
        return crypto.subtle.digest('SHA-256', data);
    }

    function base64URLEncode(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    async function generatePKCE() {
        const verifier = randomString(128);
        const hashed = await sha256(verifier);
        const challenge = base64URLEncode(hashed);
        return { verifier, challenge };
    }

    /* ------------------------------------------------------------------ */
    /*  Storage helpers                                                     */
    /* ------------------------------------------------------------------ */
    function loadAuthData() {
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.get([STORAGE_KEY], result => {
                    resolve(result[STORAGE_KEY] || null);
                });
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

        const now = Date.now();
        // Token still valid (with 60s buffer)
        if (data.expires_at && now < data.expires_at - 60000) {
            return data.access_token;
        }

        // Try to refresh
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

        // Token expired and refresh failed — clear it
        await clearAuthData();
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  OAuth PKCE login flow                                               */
    /* ------------------------------------------------------------------ */
    async function connect(clientId) {
        if (!clientId || !clientId.trim()) {
            throw new Error('Please enter your Spotify Client ID first.');
        }
        clientId = clientId.trim();

        const redirectUri = chrome.identity.getRedirectURL();
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
            chrome.identity.launchWebAuthFlow(
                { url: authUrl, interactive: true },
                async (responseUrl) => {
                    if (chrome.runtime.lastError) {
                        return reject(new Error(chrome.runtime.lastError.message || 'Login cancelled'));
                    }
                    if (!responseUrl) {
                        return reject(new Error('Login cancelled or popup blocked'));
                    }

                    const url = new URL(responseUrl);
                    const code = url.searchParams.get('code');
                    const returnedState = url.searchParams.get('state');
                    const error = url.searchParams.get('error');

                    if (error) return reject(new Error(`Spotify error: ${error}`));
                    if (returnedState !== state) return reject(new Error('State mismatch — possible CSRF'));
                    if (!code) return reject(new Error('No authorization code received'));

                    // Exchange code for tokens
                    try {
                        const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                grant_type: 'authorization_code',
                                code,
                                redirect_uri: redirectUri,
                                client_id: clientId,
                                code_verifier: verifier
                            })
                        });

                        if (!tokenResp.ok) {
                            const err = await tokenResp.text();
                            return reject(new Error(`Token exchange failed: ${err}`));
                        }

                        const tokens = await tokenResp.json();
                        await saveAuthData({
                            client_id: clientId,
                            access_token: tokens.access_token,
                            refresh_token: tokens.refresh_token,
                            expires_at: Date.now() + tokens.expires_in * 1000
                        });

                        resolve({ success: true });
                    } catch (err) {
                        reject(err);
                    }
                }
            );
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
            if (resp.status === 401) {
                await clearAuthData();
            }
            return null;
        }

        const data = await resp.json();

        // Prefer track when query looks like a song title (has "by" or quote)
        const looksLikeTrack = /\bby\b|'|"/.test(query.toLowerCase());
        const artists = data.artists?.items || [];
        const tracks = data.tracks?.items || [];

        if (looksLikeTrack && tracks.length > 0) {
            const t = tracks[0];
            return {
                type: 'track',
                id: t.id,
                title: `${t.name} — ${t.artists?.[0]?.name || ''}`
            };
        }

        if (artists.length > 0) {
            const a = artists[0];
            return { type: 'artist', id: a.id, title: a.name };
        }

        if (tracks.length > 0) {
            const t = tracks[0];
            return {
                type: 'track',
                id: t.id,
                title: `${t.name} — ${t.artists?.[0]?.name || ''}`
            };
        }

        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                          */
    /* ------------------------------------------------------------------ */
    async function isConnected() {
        const token = await getValidToken();
        return !!token;
    }

    async function getClientId() {
        const data = await loadAuthData();
        return data?.client_id || '';
    }

    async function disconnect() {
        await clearAuthData();
    }

    function getRedirectUri() {
        if (typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL) {
            return chrome.identity.getRedirectURL();
        }
        return 'N/A (only available in extension context)';
    }

    return { connect, disconnect, search, isConnected, getClientId, getRedirectUri };
});
