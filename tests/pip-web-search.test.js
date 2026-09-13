const assert = require('assert');
const { PipWebSearch, cleanHtml } = require('../pip-web-search');

(async () => {
    // 1. Test cleanHtml
    assert.strictEqual(cleanHtml(''), '');
    assert.strictEqual(cleanHtml('Hello <b>world</b>! &amp; welcome &quot;here&#039;'), "Hello world! & welcome \"here'");
    assert.strictEqual(cleanHtml('The <span class="searchmatch">James</span> <span class="searchmatch">Webb</span> Space Telescope'), 'The James Webb Space Telescope');

    // 2. Test empty search
    const searcher = new PipWebSearch();
    const emptyRes = await searcher.search('');
    assert.deepStrictEqual(emptyRes, { contextText: '', sources: [] });

    // 3. Test DuckDuckGo parsing
    const mockFetchDDG = async url => {
        if (url.includes('duckduckgo.com')) {
            return {
                ok: true,
                json: async () => ({
                    Heading: 'James Webb Space Telescope',
                    AbstractText: 'The James Webb Space Telescope is a space telescope.',
                    AbstractURL: 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope',
                    RelatedTopics: [
                        {
                            Text: 'Hubble Space Telescope - An older space telescope',
                            FirstURL: 'https://en.wikipedia.org/wiki/Hubble_Space_Telescope'
                        }
                    ]
                })
            };
        }
        return { ok: false };
    };

    const ddgSearcher = new PipWebSearch(mockFetchDDG);
    const ddgRes = await ddgSearcher.search('JWST');
    assert.strictEqual(ddgRes.sources.length, 2);
    assert.strictEqual(ddgRes.sources[0].title, 'James Webb Space Telescope');
    assert.strictEqual(ddgRes.sources[0].url, 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope');
    assert(ddgRes.contextText.includes('The James Webb Space Telescope is a space telescope.'));

    // 4. Test Wikipedia parsing and deduplication
    const mockFetchBoth = async url => {
        if (url.includes('duckduckgo.com')) {
            return {
                ok: true,
                json: async () => ({
                    Heading: 'Test Topic',
                    AbstractText: 'DDG summary for Test Topic',
                    AbstractURL: 'https://example.com/topic',
                    RelatedTopics: []
                })
            };
        }
        if (url.includes('wikipedia.org')) {
            return {
                ok: true,
                json: async () => ({
                    query: {
                        search: [
                            {
                                title: 'Test Topic',
                                snippet: 'Wiki snippet for <span class="searchmatch">Test</span> Topic',
                                pageid: 123
                            },
                            {
                                title: 'Another Topic',
                                snippet: 'Snippet for Another Topic',
                                pageid: 456
                            }
                        ]
                    }
                })
            };
        }
        return { ok: false };
    };

    const bothSearcher = new PipWebSearch(mockFetchBoth);
    const bothRes = await bothSearcher.search('Test Topic');
    // DDG gives https://example.com/topic, Wiki gives https://en.wikipedia.org/wiki/Test_Topic and Another_Topic
    assert.strictEqual(bothRes.sources.length, 3);
    assert.strictEqual(bothRes.sources[0].title, 'Test Topic');
    assert(bothRes.contextText.includes('DDG summary for Test Topic'));
    assert(bothRes.contextText.includes('Wiki snippet for Test Topic'));

    // 5. Test network failure / offline resilience
    const failingSearcher = new PipWebSearch(async () => {
        throw new Error('Network offline');
    });
    const failRes = await failingSearcher.search('Anything');
    assert.deepStrictEqual(failRes, { contextText: '', sources: [] });

    console.log('Pip web search tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
