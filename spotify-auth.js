/**
 * Spotify Auth — Local Server Client
 * Author: SkdSam
 *
 * Talks to the local spotify-server.js running on http://127.0.0.1:8888
 * The server handles all OAuth complexity and proxies search requests.
 * No redirect URI problems, no chromiumapp.org issues, no CORS.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SpotifyAuth = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SERVER = 'http://127.0.0.1:8888';
    const TIMEOUT_MS = 4000;

    // Wrapper with timeout so the extension doesn't hang if server isn't running
    function serverFetch(path, opts = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        return fetch(`${SERVER}${path}`, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * Get detailed status of local server
     * Returns { running, configured, connected, is_user_auth, clientId, redirectUri }
     */
    async function getStatus() {
        try {
            const resp = await serverFetch('/status');
            if (!resp.ok) return { running: false, configured: false, connected: false };
            const data = await resp.json();
            return {
                running: true,
                configured: !!data.configured,
                connected: !!data.connected,
                is_user_auth: !!data.is_user_auth,
                clientId: data.clientId || '',
                redirectUri: data.redirectUri || 'http://127.0.0.1:8888/callback'
            };
        } catch (_) {
            return { running: false, configured: false, connected: false };
        }
    }

    /**
     * Save Client ID & Secret to the local server
     */
    async function saveCredentials(clientId, clientSecret) {
        try {
            const resp = await serverFetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to save credentials');
            return { success: true, data };
        } catch (err) {
            if (err.name === 'AbortError' || err.message.includes('fetch')) {
                throw new Error('Local helper server is not running. Double-click start-spotify.bat first.');
            }
            throw err;
        }
    }

    /**
     * Open Spotify login — opens the auth page directly in the browser tab.
     * The local server handles the OAuth callback automatically.
     */
    async function connect() {
        const loginUrl = `${SERVER}/login`;
        try {
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: loginUrl });
            } else if (typeof window !== 'undefined') {
                window.open(loginUrl, '_blank');
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Check if the local server is running AND authenticated / active.
     */
    async function isConnected() {
        const st = await getStatus();
        return st.running && st.connected;
    }

    /**
     * Check if the local server is reachable at all.
     */
    async function isServerRunning() {
        const st = await getStatus();
        return st.running;
    }

    /**
     * Search for an artist, track, or playlist.
     * Returns { type, id, title } or null.
     */
    async function search(query, types = 'artist,track,playlist') {
        try {
            const resp = await serverFetch(
                `/search?${new URLSearchParams({ q: query, type: types })}`
            );
            if (resp.status === 401) return null; // Not connected or configured
            if (!resp.ok) return null;
            const data = await resp.json();

            const qLower = String(query || '').toLowerCase().trim();
            const looksLikeTrack = /\b(by|song|track|play)\b|'|"/.test(qLower);
            const looksLikePlaylist = /\b(playlist|mix|classics|session|vibes|party|garage|ukg|hits|anthems|workout|chill|dance|edm|dnb|techno|house|rap|hiphop|rock|pop)\b/.test(qLower);

            const artists = data.artists?.items || [];
            const tracks = data.tracks?.items || [];
            const playlists = data.playlists?.items || [];

            // If query explicitly hints at playlist or genre, check playlists first
            if (looksLikePlaylist && playlists.length > 0) {
                const exactArtist = artists.find(a => a.name.toLowerCase() === qLower);
                if (exactArtist && !qLower.includes('playlist') && !qLower.includes('mix')) {
                    return { type: 'artist', id: exactArtist.id, title: exactArtist.name };
                }
                const p = playlists[0];
                return { type: 'playlist', id: p.id, title: p.name };
            }

            if (looksLikeTrack && tracks.length > 0) {
                const t = tracks[0];
                return { type: 'track', id: t.id, title: `${t.name} — ${t.artists?.[0]?.name || ''}` };
            }
            if (artists.length > 0) {
                const a = artists[0];
                return { type: 'artist', id: a.id, title: a.name };
            }
            if (playlists.length > 0) {
                const p = playlists[0];
                return { type: 'playlist', id: p.id, title: p.name };
            }
            if (tracks.length > 0) {
                const t = tracks[0];
                return { type: 'track', id: t.id, title: `${t.name} — ${t.artists?.[0]?.name || ''}` };
            }
            return null;
        } catch (_) {
            return null; // Server not running — fall through to offline catalog
        }
    }

    async function disconnect() {
        // Can be extended if needed
    }

    async function getClientId() {
        const st = await getStatus();
        return st.clientId || '';
    }

    function getRedirectUri() {
        return 'http://127.0.0.1:8888/callback';
    }

    return {
        getStatus,
        saveCredentials,
        connect,
        disconnect,
        search,
        isConnected,
        isServerRunning,
        getClientId,
        getRedirectUri
    };
});
