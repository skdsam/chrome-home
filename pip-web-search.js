/* global fetch */
(function () {
    'use strict';

    function cleanHtml(html) {
        if (!html) return '';
        return html
            .replace(/<[^>]+>/g, '')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }

    class PipWebSearch {
        constructor(fetchFn = globalThis.fetch?.bind(globalThis)) {
            this.fetch = fetchFn;
        }

        async searchDuckDuckGo(query, signal) {
            if (!this.fetch) return [];
            try {
                const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
                const res = await this.fetch(url, { signal });
                if (!res.ok) return [];
                const data = await res.json();
                const results = [];

                if (data.AbstractText && data.AbstractURL) {
                    results.push({
                        title: data.Heading || query,
                        url: data.AbstractURL,
                        snippet: cleanHtml(data.AbstractText)
                    });
                }

                if (Array.isArray(data.RelatedTopics)) {
                    for (const item of data.RelatedTopics) {
                        if (item.Text && item.FirstURL && results.length < 3) {
                            results.push({
                                title: cleanHtml(item.Text.split(' - ')[0] || item.Text).slice(0, 80),
                                url: item.FirstURL,
                                snippet: cleanHtml(item.Text)
                            });
                        }
                    }
                }

                return results;
            } catch (_) {
                return [];
            }
        }

        async searchWikipedia(query, signal) {
            if (!this.fetch) return [];
            try {
                const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
                const res = await this.fetch(url, { signal });
                if (!res.ok) return [];
                const data = await res.json();
                const items = data?.query?.search;
                if (!Array.isArray(items)) return [];

                return items.slice(0, 2).map(item => ({
                    title: item.title,
                    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
                    snippet: cleanHtml(item.snippet)
                }));
            } catch (_) {
                return [];
            }
        }

        async search(query, options = {}) {
            const trimmed = (query || '').trim();
            if (!trimmed) return { contextText: '', sources: [] };

            const timeoutMs = options.timeoutMs || 5000;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const [ddgResult, wikiResult] = await Promise.allSettled([
                    this.searchDuckDuckGo(trimmed, controller.signal),
                    this.searchWikipedia(trimmed, controller.signal)
                ]);

                const ddgItems = ddgResult.status === 'fulfilled' ? ddgResult.value : [];
                const wikiItems = wikiResult.status === 'fulfilled' ? wikiResult.value : [];

                const seenUrls = new Set();
                const sources = [];

                for (const item of [...ddgItems, ...wikiItems]) {
                    if (item && item.url && !seenUrls.has(item.url)) {
                        seenUrls.add(item.url);
                        sources.push(item);
                    }
                    if (sources.length >= 4) break;
                }

                if (sources.length === 0) {
                    return { contextText: '', sources: [] };
                }

                const contextLines = sources.map(s => `[${s.title}] ${s.snippet}`);
                const contextText = `Web Search Context:\n${contextLines.join('\n')}`;

                return { contextText, sources };
            } finally {
                clearTimeout(timer);
            }
        }
    }

    if (typeof module !== 'undefined') {
        module.exports = { PipWebSearch, cleanHtml };
    } else {
        window.PipWebSearch = PipWebSearch;
    }
}());
