const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequest, handleWidgetRequest } = require('../ask-pip');

test('natural task requests keep their text and beat planning/bookmark keywords', () => {
    for (const input of ['add buy milk', 'add buy milk to my todo list', 'add to our to-do list buy milk',
        'can you please add a task buy milk', 'add buy milk to the todo widget']) {
        assert.deepEqual(parseRequest(input), { type: 'widget', action: 'todo_add', text: 'buy milk' });
    }
    assert.equal(parseRequest('add plan tomorrow').text, 'plan tomorrow');
    assert.equal(parseRequest('add review bookmarks').action, 'todo_add');
    assert.equal(parseRequest('create a plan for today').type, 'unknown');
    assert.equal(parseRequest('how do I add a task?').type, 'unknown');
    assert.equal(parseRequest('how do I add task buy milk?').type, 'unknown');
});

test('note commands preserve punctuation, multiline content and explicit destinations', () => {
    for (const input of ['add quick note Call Jane!', 'add Call Jane! to quick notes', 'take a note Call Jane!',
        'add to my quick notes widget Call Jane!']) {
        assert.deepEqual(parseRequest(input), { type: 'widget', action: 'notes_add', text: 'Call Jane!' });
    }
    assert.equal(parseRequest('add note Plan tomorrow\nBuy <milk> & tea').text, 'Plan tomorrow\nBuy <milk> & tea');
    assert.equal(parseRequest('add note send updates to my sites').action, 'notes_add');
});

test('shortcut and My Sites commands accept names, domains and full URLs', () => {
    for (const input of ['add shortcut GitHub https://github.com', 'add https://github.com called GitHub as a shortcut',
        'add GitHub https://github.com to my shortcuts', 'create a short cut GitHub https://github.com']) {
        assert.deepEqual(parseRequest(input), { type: 'widget', action: 'shortcut_add', title: 'GitHub', url: 'https://github.com' });
    }
    assert.deepEqual(parseRequest('add Example example.com to my sites'), { type: 'widget', action: 'site_add', title: 'Example', url: 'example.com' });
    assert.deepEqual(parseRequest('add to my sites Example https://example.com/a?x=1&y=2'), {
        type: 'widget', action: 'site_add', title: 'Example', url: 'https://example.com/a?x=1&y=2'
    });
    assert.equal(parseRequest('add shortcut https://one.com https://two.com').action, 'addition_help');
});

test('missing URL asks for an address without guessing a domain or writing', async () => {
    global.window = { chromeHomeWidgets: { addShortcut() { assert.fail('Must not save without a URL'); } } };
    const request = parseRequest('add shortcut GitHub');
    const reply = await handleWidgetRequest(request);
    assert.match(reply.text, /What URL/);
    assert.deepEqual(reply.followUp, request);
});

test('addition success waits for the actual save; rapid commands are serialised', async () => {
    const calls = [];
    let finish;
    global.window = { chromeHomeWidgets: { addTodo: text => {
        calls.push(text);
        if (text === 'first') return new Promise(resolve => { finish = () => resolve({ text }); });
        return { text };
    } } };
    let firstDone = false;
    const first = handleWidgetRequest({ action: 'todo_add', text: 'first' }).then(reply => { firstDone = true; return reply; });
    const second = handleWidgetRequest({ action: 'todo_add', text: 'second' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ['first']);
    assert.equal(firstDone, false);
    finish();
    assert.match((await first).text, /first/);
    assert.match((await second).text, /second/);
    assert.deepEqual(calls, ['first', 'second']);
});

test('failed writes do not report success and do not block the next addition', async () => {
    global.window = { chromeHomeWidgets: { addNote: async () => { throw new Error('Storage is full'); } } };
    await assert.rejects(handleWidgetRequest({ action: 'notes_add', text: 'test' }), /Storage is full/);
    global.window.chromeHomeWidgets.addNote = async text => ({ text });
    assert.match((await handleWidgetRequest({ action: 'notes_add', text: 'saved' })).text, /saved/);
});

test('site dispatch uses the right destination and reports duplicates accurately', async () => {
    const calls = [];
    global.window = { chromeHomeWidgets: {
        addSite: async (url, title) => { calls.push(['site', url, title]); return { title, duplicate: false }; },
        addShortcut: async (url, title) => { calls.push(['shortcut', url, title]); return { title, duplicate: true }; }
    } };
    assert.match((await handleWidgetRequest(parseRequest('add Example example.com to my sites'))).text, /My Sites/);
    assert.match((await handleWidgetRequest(parseRequest('add shortcut Example example.com'))).text, /already/);
    assert.deepEqual(calls.map(call => call[0]), ['site', 'shortcut']);
});
