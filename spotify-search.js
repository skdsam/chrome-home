/** Only the latest Spotify request or offered choice may select music. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SpotifySearch = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function createController({ resolve, onResult, onSelect, timeoutMs = 30000 }) {
        let generation = 0, active = null, latest = null;
        function publish(result, version) {
            latest = { ...result, version };
            onResult(latest);
            return latest;
        }
        function select(candidate, request, version) {
            onSelect(candidate);
            return publish({ status: 'resolved', success: true, candidate, request, title: candidate.title, embedUrl: candidate.embedUrl }, version);
        }
        async function search(query, options = {}) {
            const version = ++generation;
            active?.abort();
            const controller = new AbortController();
            active = controller;
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            let abortListener;
            const cancelled = new Promise((_, reject) => {
                abortListener = () => reject(new Error('Search cancelled'));
                controller.signal.addEventListener('abort', abortListener, { once: true });
            });
            publish({ status: 'searching', query }, version);
            try {
                const result = await Promise.race([resolve(query, { ...options, signal: controller.signal }), cancelled]);
                if (version !== generation) return { status: 'superseded', success: false };
                if (timedOut) throw new Error('timeout');
                if (result.status === 'resolved') return select(result.candidate, result.request, version);
                return publish({ ...result, success: false }, version);
            } catch (error) {
                if (version !== generation) return { status: 'superseded', success: false };
                return publish({ status: 'error', success: false, code: timedOut ? 'timeout' : error.code,
                    message: timedOut ? 'Spotify search took too long. Please try again.' : error.message || 'Spotify search failed. Please try again.' }, version);
            } finally {
                clearTimeout(timer);
                controller.signal.removeEventListener('abort', abortListener);
                if (active === controller) active = null;
            }
        }
        function choose(uri, version) {
            if (version !== generation || latest?.status !== 'choices') return { status: 'superseded', success: false };
            const candidate = latest.candidates.find(item => item.uri === uri);
            if (!candidate) return { status: 'superseded', success: false };
            return select(candidate, latest.request, ++generation);
        }
        function cancel() { ++generation; active?.abort(); active = null; }
        return { search, choose, cancel };
    }
    return { createController };
});
