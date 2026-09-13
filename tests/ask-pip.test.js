const assert = require('assert');
const { parseRequest, parseExpression } = require('../ask-pip');
assert.deepStrictEqual(parseRequest('find my design bookmarks'), {type: 'bookmarks', query: 'design'});
assert.equal(parseRequest('help me plan today').type, 'plan');
assert.equal(parseRequest('what is the weather?').type, 'unknown');
assert.deepStrictEqual(parseExpression('[dance] Tiny celebration!'), {mood: 'dance', text: 'Tiny celebration!'});
assert.deepStrictEqual(parseExpression('Hello there'), {mood: 'nod', text: 'Hello there'});
assert.equal(parseExpression('[execute] something').mood, 'nod');
assert.deepStrictEqual(parseRequest('open my tasks'), {type: 'widget', action: 'open', target: 'tasks'});
assert.deepStrictEqual(parseRequest('launch spotify'), {type: 'widget', action: 'open', target: 'spotify'});
assert.deepStrictEqual(parseRequest('close quick notes'), {type: 'widget', action: 'close', target: 'quick notes'});
assert.deepStrictEqual(parseRequest('minimize tech news'), {type: 'widget', action: 'minimize', target: 'tech news'});
assert.deepStrictEqual(parseRequest('tidy screen'), {type: 'widget', action: 'closeAll'});
assert.deepStrictEqual(parseRequest('clean up my workspace'), {type: 'widget', action: 'closeAll'});
assert.deepStrictEqual(parseRequest('minimize all widgets'), {type: 'widget', action: 'minimizeAll'});
assert.deepStrictEqual(parseRequest('reset layout'), {type: 'widget', action: 'resetLayout'});
assert.deepStrictEqual(parseRequest('what widgets are open?'), {type: 'widget', action: 'list'});
class Element {
    constructor() {
        this.listeners = {};
        this.children = [];
        this.value = '';
        this.dataset = {};
        this.classList = { add() {}, remove() {}, contains() { return false; } };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    append(child) { this.children.push(child); }
    querySelectorAll() { return []; }
    focus() {}
    show() { this.open = true; }
}
const ids = Object.fromEntries(['ask-pip', 'ask-pip-input', 'ask-pip-answer', 'ask-pip-close', 'ask-pip-form', 'daily-intention', 'pip-web-search', 'pip-local-ai', 'pip-ai-status', 'pip-ai-stop'].map(id => [id, new Element()]));
global.document = { getElementById: id => ids[id], createElement: () => new Element() };

let targetedWidgetId = null;
global.window = {
    pageCompanion: {
        targetWidget(id) { targetedWidgetId = id; },
        setChatMood(m) { this.lastMood = m; },
        startConversation() {},
        endConversation() {}
    },
    chromeHomeWidgets: {
        lastAction: null,
        open(target) {
            this.lastAction = `open:${target}`;
            if (target === 'spotify') return { id: 'spotify-widget', name: 'Spotify Player' };
            if (target === 'tasks' || target === 'todo') return { id: 'todo-widget', name: 'Todo Tasks' };
            return null;
        },
        close(target) {
            this.lastAction = `close:${target}`;
            return { id: 'football-widget', name: 'Sports Matches' };
        },
        minimize(target, val) {
            this.lastAction = `minimize:${target}:${val}`;
            return { id: 'notes-widget', name: 'Quick Notes' };
        },
        closeAll() {
            this.lastAction = 'closeAll';
            return 3;
        },
        minimizeAll() {
            this.lastAction = 'minimizeAll';
            return 2;
        },
        resetLayout() {
            this.lastAction = 'resetLayout';
            return true;
        },
        getOpenWidgets() {
            this.lastAction = 'getOpenWidgets';
            return [{ id: 'spotify-widget', name: 'Spotify Player', isMinimized: false }];
        }
    },
    PipWebSearch: class {
        async search(query) {
            return {
                contextText: `Context for ${query}`,
                sources: [{ title: 'JWST Article', url: 'https://en.wikipedia.org/wiki/JWST', snippet: 'A space telescope.' }]
            };
        }
    }
};
global.chrome = { runtime: {}, bookmarks: { getTree(callback) { callback([{title: 'Design', children: [{ title: 'Portfolio', url: 'https://example.com' }, { title: 'Unsafe', url: 'javascript:alert(1)' }]}]); } } };
delete require.cache[require.resolve('../ask-pip')];
require('../ask-pip');
(async () => {
    window.askPip.open();
    ids['ask-pip-input'].value = 'find my design bookmarks';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(ids['ask-pip-answer'].textContent, 'Found 1 bookmark:');
    assert.equal(ids['ask-pip-answer'].children[0].children[0].children[0].href, 'https://example.com');
    ids['ask-pip-input'].value = 'help me plan today';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert(ids['ask-pip-answer'].textContent.includes('one thing'));
    ids['ask-pip-input'].value = 'Finish my portfolio';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert(ids['ask-pip-answer'].textContent.includes('Finish my portfolio'));

    // Test web search lookup
    ids['pip-web-search'].checked = true;
    ids['ask-pip-input'].value = 'What is the JWST?';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert(ids['ask-pip-answer'].textContent.includes('Here is what I found for "What is the JWST?"'));
    assert(ids['ask-pip-answer'].children.length > 0);

    // Test widget control actions
    ids['ask-pip-input'].value = 'open spotify';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'open:spotify');
    assert.equal(targetedWidgetId, 'spotify-widget');
    assert(ids['ask-pip-answer'].textContent.includes('Opened Spotify Player for you!'));
    assert.equal(window.pageCompanion.lastMood, 'dance');

    ids['ask-pip-input'].value = 'close sports';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'close:sports');
    assert(ids['ask-pip-answer'].textContent.includes('Closed Sports Matches.'));

    ids['ask-pip-input'].value = 'minimize notes';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'minimize:notes:true');
    assert(ids['ask-pip-answer'].textContent.includes('Minimized Quick Notes.'));

    ids['ask-pip-input'].value = 'tidy screen';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'closeAll');
    assert(ids['ask-pip-answer'].textContent.includes('All tidy! Closed 3 open widgets.'));

    ids['ask-pip-input'].value = 'minimize all widgets';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'minimizeAll');
    assert(ids['ask-pip-answer'].textContent.includes('Minimized 2 widgets to their headers.'));

    ids['ask-pip-input'].value = 'reset layout';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'resetLayout');
    assert(ids['ask-pip-answer'].textContent.includes('Widgets have been reset to their default positions.'));

    ids['ask-pip-input'].value = 'what widgets are open?';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert.equal(window.chromeHomeWidgets.lastAction, 'getOpenWidgets');
    assert(ids['ask-pip-answer'].textContent.includes('Currently open widgets: Spotify Player.'));

    // Unmatched target test in registry
    ids['ask-pip-input'].value = 'open cinema';
    await ids['ask-pip-form'].listeners.submit({preventDefault() {}});
    assert(ids['ask-pip-answer'].textContent.includes('couldn\'t find a widget matching "cinema"'));

    // Directly test handleWidgetRequest fallback
    const { handleWidgetRequest } = require('../ask-pip');
    const unknownRes = handleWidgetRequest({ type: 'widget', action: 'open', target: 'unicorn' });
    assert(unknownRes.text.includes('couldn\'t find a widget matching "unicorn"'));

    console.log('Ask Pip tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

