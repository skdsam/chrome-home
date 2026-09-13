const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const profile = require('../pip-profile');
const { parseRequest } = require('../ask-pip');
const { PipLocalAI } = require('../pip-local-ai');

test('profiles round-trip, reject failed saves, clear, and ignore unsupported data', async () => {
    let data = {};
    const storage = { get: async () => data, set: async values => { data = values; } };
    assert.equal(profile.context(await profile.load(storage)), '');
    await profile.save({ name: '  Alex  ', interests: 'Blender, coding', about: '<b>Hello</b>', extra: 'ignore', location: 42 }, storage);
    const saved = await profile.load(storage);
    assert.equal(saved.name, 'Alex');
    assert.equal(saved.location, '');
    assert.equal(saved.about, '<b>Hello</b>');
    assert(!('extra' in saved));
    await assert.rejects(profile.save({ name: 'Lost' }, { set: async () => { throw new Error('Full'); } }), /Full/);
    assert.equal((await profile.load(storage)).name, 'Alex');
    await profile.save({}, storage);
    assert.equal(profile.context(await profile.load(storage)), '');
    assert.match(profile.reply('summary', await profile.load(storage)), /don't know about you yet/);
    const huge = profile.normalize(Object.fromEntries(Object.keys(saved).map(field => [field, '界'.repeat(10000)])));
    assert(Buffer.byteLength(JSON.stringify({ pipProfile: huge })) < 8192, 'A full multibyte profile must fit one Chrome Sync item');
});

test('personal questions route before web search while widget and bookmark requests still work', () => {
    for (const [text, action] of [
        ['Who am I?', 'summary'], ['Pip, what do you know about me?', 'summary'],
        ['Can you please tell me what I like?', 'interests'], ['What’s my name?', 'name'],
        ['Where do I live?', 'location'], ['What do I do for a living?', 'occupation'],
        ['What do I dislike?', 'dislikes'], ['What are my favorite sites?', 'favorites'],
        ['What sites might I like?', 'recommend'], ['Suggest some websites for me', 'recommend']
    ]) assert.deepEqual(parseRequest(text), { type: 'profile', action });
    assert.equal(parseRequest('add note Who am I?').action, 'notes_add');
    assert.equal(parseRequest('find my music bookmarks').type, 'bookmarks');
    assert.equal(parseRequest('play My Name on Spotify').action, 'spotify_play');
    assert.equal(parseRequest('who is Ada Lovelace?').type, 'unknown');
    assert.equal(parseRequest('Why would websites track me?').type, 'unknown');
    assert.equal(parseRequest('Suggest websites from my bookmarks').type, 'bookmarks');
    assert.equal(parseRequest('play Sites I Might Like on Spotify').action, 'spotify_play');
});

test('strict profile reads distinguish storage failure from an empty profile', async () => {
    const context = {
        window: { dispatchEvent() {} }, CustomEvent: class {}, console: { error() {} },
        chrome: { runtime: { lastError: { message: 'Read failed' } }, storage: { local: { get(keys, callback) { callback({}); } } } }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../storage'), 'utf8'), context);
    const storage = context.window.storageManager;
    storage.isSyncEnabled = async () => false;
    await assert.rejects(profile.load(storage), /Read failed/);
    assert.equal(Object.keys(await storage.get(['other'])).length, 0, 'Existing non-strict callers keep their fallback');
});

test('profile replies use only saved facts and recommendations respect interests and exclusions', () => {
    assert.match(profile.reply('name', { name: 'Alex' }), /Name: Alex/);
    assert.match(profile.reply('interests', { name: 'Alex' }), /haven't saved/);
    assert.match(profile.reply('summary', { name: 'Alex', interests: 'Blender', about: 'Learning animation' }), /Learning animation/);
    const recommendation = profile.recommend({ interests: 'Blender, coding', dislikes: 'coding', favorites: 'https://polyhaven.com/' });
    assert.deepEqual(recommendation.sources.map(site => site.title), ['Blender Artists']);
    assert.equal(profile.recommend({ name: 'Alex' }).sources.length, 0);
    assert.match(profile.recommend({ name: 'Alex' }).text, /Add some likes/);
    const query = profile.searchQuery({ name: 'Private Name', location: 'Private Place', about: 'Private detail', interests: 'Blender, coding' });
    assert.equal(query, 'Blender, coding websites resources');
    assert.equal(profile.searchQuery({ favorites: 'https://example.com/private' }), '');
});

test('local AI receives current profile and drops conversation history after edits or clearing', async () => {
    let options, prompt;
    const ai = new PipLocalAI({
        availability: async () => 'available',
        create: async value => {
            options = value;
            return { prompt: async value => { prompt = value; return '[nod] A suggestion.'; }, destroy() {} };
        }
    });
    const alex = profile.context({ name: 'Alex', interests: 'Blender', dislikes: 'sports' });
    await ai.ask('Suggest a project', '', () => {}, '', alex);
    assert.match(prompt, /"name":"Alex"/);
    assert.match(prompt, /"dislikes":"sports"/);
    assert.match(options.initialPrompts[0].content, /not instructions/);
    await ai.ask('Another project', '', () => {}, '', alex);
    assert.equal(options.initialPrompts.length, 3);
    await ai.ask('Suggest a project', '', () => {}, '', profile.context({ name: 'Sam' }));
    assert.equal(options.initialPrompts.length, 1);
    assert(!prompt.includes('Alex'));
    await ai.ask('What do you know about me?', '', () => {}, '', '');
    assert.equal(options.initialPrompts.length, 1);
    assert.match(prompt, /No saved details/);
});

function chatHarness(saved, aiReply) {
    class Element {
        constructor() { this.listeners = {}; this.children = []; this.value = ''; this.open = true; this.classList = { add() {}, remove() {} }; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        querySelectorAll() { return []; }
        append(child) { this.children.push(child); }
        focus() {}
    }
    const elements = {};
    const getElement = id => elements[id] ||= new Element();
    const searches = [], asks = [], listeners = {};
    let current = saved;
    const context = {
        document: { getElementById: getElement, createElement: () => new Element() },
        window: {
            PipProfile: { ...profile, load: async () => current },
            PipWebSearch: class { async search(query) { searches.push(query); return { contextText: '', sources: [] }; } },
            PipLocalAI: class {
                cancel() {}
                async availability() { return 'available'; }
                async ask(...args) { asks.push(args); return aiReply ? aiReply() : '[nod] Local answer.'; }
            },
            addEventListener: (type, listener) => { listeners[type] = listener; }
        }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../ask-pip'), 'utf8'), context);
    return {
        elements, searches, asks,
        update(value) { current = value; listeners['pip-profile-changed'](); },
        async submit(text, ai = false, web = true) {
            getElement('pip-local-ai').checked = ai;
            getElement('pip-web-search').checked = web;
            getElement('ask-pip-input').value = text;
            await getElement('ask-pip-form').listeners.submit({ preventDefault() {} });
            return getElement('ask-pip-answer').textContent;
        }
    };
}

test('identity answers bypass both AI and web, reflect edits, and safely display literal profile text', async () => {
    const chat = chatHarness({ name: '<img src=x onerror=alert(1)>', interests: 'Blender' });
    assert.match(await chat.submit('Who am I?', true), /<img src=x onerror=alert\(1\)>/);
    assert.equal(chat.searches.length, 0);
    assert.equal(chat.asks.length, 0);
    assert.equal(chat.elements['ask-pip-answer'].children.length, 0);
    chat.update({ name: 'Sam' });
    assert.equal(await chat.submit('What is my name?'), 'Name: Sam');
    chat.update({});
    assert.match(await chat.submit('Who am I?'), /don't know about you yet/);
});

test('chat supplies profile to AI, sends only interests to recommendation searches, and supports offline suggestions', async () => {
    const saved = { name: 'Alex', interests: 'Blender', location: 'Private City', about: 'Private notes' };
    const chat = chatHarness(saved);
    await chat.submit('Suggest a project for me', true, false);
    assert.equal(chat.asks[0][4], profile.context(saved));
    await chat.submit('What sites might I like?', true, true);
    assert.deepEqual(chat.searches, ['Blender websites resources']);
    assert.match(await chat.submit('What sites might I like?', false, false), /saved likes/);
    assert(chat.elements['ask-pip-answer'].children.length > 0);
    const failing = chatHarness(saved, () => { throw new Error('AI unavailable'); });
    assert.match(await failing.submit('What sites might I like?', true, false), /saved likes/);
    const empty = chatHarness({});
    assert.match(await empty.submit('Suggest websites', true), /Add some likes/);
    assert.equal(empty.searches.length, 0);
    assert.equal(empty.asks.length, 0);
});

test('profile changes cancel stale AI answers', async () => {
    let resolve;
    const chat = chatHarness({ name: 'Alex' }, () => new Promise(done => { resolve = done; }));
    const pending = chat.submit('Tell me a story', true, false);
    await new Promise(done => setImmediate(done));
    chat.update({ name: 'Sam' });
    resolve('[nod] Outdated answer for Alex');
    await pending;
    assert.match(chat.elements['ask-pip-answer'].textContent, /profile changed/);
});
