/** Client for the local Spotify auth/search helper. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SpotifyAuth = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const SERVER = 'http://127.0.0.1:8888';
    // Keep the deadline active through body parsing; honour caller cancellation.
    async function serverFetch(path, opts = {}) {
        const controller = new AbortController();
        const { signal, timeout = 4000, ...requestOptions } = opts;
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
            const response = await fetch(`${SERVER}${path}`, { ...requestOptions, signal: controller.signal });
            const data = await response.json();
            return { ok: response.ok, status: response.status, headers: response.headers, data };
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }
    async function getStatus() {
        try {
            const response = await serverFetch('/status');
            if (!response.ok) throw new Error();
            const data = response.data;
            return { running: true, configured: !!data.configured, connected: !!data.connected,
                is_user_auth: !!data.is_user_auth, clientId: data.clientId || '',
                redirectUri: data.redirectUri || getRedirectUri() };
        } catch (_) { return { running: false, configured: false, connected: false }; }
    }
    async function saveCredentials(clientId, clientSecret) {
        try {
            const response = await serverFetch('/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret }), timeout: 15000
            });
            if (!response.ok) throw new Error(response.data.error || 'Failed to save credentials');
            return { success: true, data: response.data };
        } catch (error) {
            if (error.name === 'AbortError' || error.message.includes('fetch')) {
                throw new Error('Local helper server is unavailable. Double-click start-spotify.bat first.');
            }
            throw error;
        }
    }
    async function connect() {
        const url = `${SERVER}/login`;
        try {
            if (typeof chrome !== 'undefined' && chrome.tabs?.create) chrome.tabs.create({ url });
            else if (typeof window !== 'undefined') window.open(url, '_blank');
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }
    async function queryServer(path, { signal } = {}) {
        let response;
        try { response = await serverFetch(path, { signal, timeout: 15000 }); }
        catch (error) {
            if (signal?.aborted) throw error;
            const timedOut = error.name === 'AbortError';
            throw Object.assign(new Error(timedOut
                ? 'Spotify search timed out. Please try again.'
                : 'Spotify helper is unavailable. Start start-spotify.bat, then try again.'),
            { code: timedOut ? 'timeout' : 'helper_unavailable' });
        }
        if (response.ok) return response.data;
        const retryAfter = response.headers?.get('Retry-After');
        const messages = {
            400: 'Spotify could not understand this search. Try a name or a full Spotify link.',
            401: 'Connect your Spotify account in the widget, then try again.',
            403: 'Spotify denied access. Check the app access settings; for My playlists, reconnect your account to grant playlist access.',
            429: `Spotify is limiting searches. ${retryAfter ? `Try again in ${retryAfter} seconds.` : 'Please wait before trying again.'}`,
            502: 'Spotify is temporarily unavailable. Please try again.',
            504: 'Spotify took too long to respond. Please try again.'
        };
        const codes = { 400: 'invalid_query', 401: 'auth_required', 403: 'access_denied', 429: 'rate_limited', 504: 'timeout' };
        throw Object.assign(new Error(response.data.error === 'user_login_required'
            ? 'Log in to your Spotify account to search My playlists.'
            : messages[response.status] || 'Spotify search failed. Please try again.'),
        { code: codes[response.status] || 'service_error', status: response.status });
    }
    // Return candidates; matching belongs to SpotifyCatalog.
    async function search(query, types = 'artist,track,playlist,album', options = {}) {
        return queryServer(`/search?${new URLSearchParams({ q: query, type: types, offset: options.offset || 0 })}`, options);
    }
    async function getPlaylists(options = {}) {
        return queryServer(`/playlists?${new URLSearchParams({ offset: options.offset || 0 })}`, options);
    }
    async function isConnected() { const s = await getStatus(); return s.running && s.connected; }
    async function isServerRunning() { return (await getStatus()).running; }
    async function getClientId() { return (await getStatus()).clientId; }
    function getRedirectUri() { return `${SERVER}/callback`; }
    async function disconnect() { /* Change Setup opens the configuration UI. */ }
    return { getStatus, saveCredentials, connect, disconnect, search, getPlaylists, isConnected, isServerRunning, getClientId, getRedirectUri };
});
