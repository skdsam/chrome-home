const assert = require('assert');
const { parseRequest, parseExpression } = require('../ask-pip');
assert.deepStrictEqual(parseRequest('find my design bookmarks'), {type: 'bookmarks', query: 'design'});
assert.equal(parseRequest('help me plan today').type, 'plan');
assert.equal(parseRequest('what is the weather?').type, 'unknown');
assert.deepStrictEqual(parseExpression('[dance] Tiny celebration!'), {mood: 'dance', text: 'Tiny celebration!'});
assert.deepStrictEqual(parseExpression('Hello there'), {mood: 'nod', text: 'Hello there'});
assert.equal(parseExpression('[execute] something').mood, 'nod');
class Element {
    constructor() { this.listeners = {}; this.children = []; this.value = ''; this.dataset = {}; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    append(child) { this.children.push(child); }
    querySelectorAll() { return []; }
    focus() {}
    show() { this.open = true; }
}
const ids = Object.fromEntries(['ask-pip', 'ask-pip-input', 'ask-pip-answer', 'ask-pip-close', 'ask-pip-form', 'daily-intention'].map(id => [id, new Element()]));
global.document = { getElementById: id => ids[id], createElement: () => new Element() };
global.window = {};
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
    console.log('Ask Pip tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
