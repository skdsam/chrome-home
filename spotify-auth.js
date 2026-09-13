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
    const TIMEOUT_MS = 3000;

    // Wrapper with timeout so the extension doesn't hang if server isn't running
    function serverFetch(path, opts = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        return fetch(`${SERVER}${path}`, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Open Spotify login — opens the auth page in the browser.
     * The local server handles the OAuth callback automatically.
     */
    async function connect() {
        try {
            const resp = await serverFetch('/login');
            if (resp.ok) return { success: true };
            throw new Error('Server error — is spotify-server.js running?');
        } catch (err) {
            if (err.name === 'AbortError' || err.message.includes('fetch')) {
                throw new Error(
                    'Could not reach the local server.\n\n' +
                    'Open a terminal and run:\n' +
                    'node spotify-server.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET'
                );
            }
            throw err;
        }
    }

    /**
     * Check if the local server is running AND authenticated.
     */
    async function isConnected() {
        try {
            const resp = await serverFetch('/status');
            if (!resp.ok) return false;
            const data = await resp.json();
            return data.connected === true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Check if the local server is reachable at all (even if not yet logged in).
     */
    async function isServerRunning() {
        try {
            const resp = await serverFetch('/status');
            return resp.ok;
        } catch (_) {
            return false;
        }
    }

    /**
     * Search for an artist or track.
     * Returns { type, id, title } or null.
     */
    async function search(query, types = 'artist,track') {
        try {
            const resp = await serverFetch(
                `/search?${new URLSearchParams({ q: query, type: types })}`
            );
            if (resp.status === 401) return null; // Not connected
            if (!resp.ok) return null;
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
        } catch (_) {
            return null; // Server not running — fall through to offline catalog
        }
    }

    async function disconnect() {
        // Nothing to clear — tokens are held by the server process
        // Stopping the server (Ctrl+C) effectively disconnects
    }

    async function getClientId() {
        return ''; // Managed by server, not stored in extension
    }

    function getRedirectUri() {
        return 'http://127.0.0.1:8888/callback';
    }

    return { connect, disconnect, search, isConnected, isServerRunning, getClientId, getRedirectUri };
});
