const assert = require('assert');
const { PipLocalAI } = require('../pip-local-ai');
(async () => {
    assert.equal(await new PipLocalAI({}).availability(), 'unavailable');
    let destroyed = 0;
    let createOptions;
    const messages = [];
    const client = new PipLocalAI({
        availability: async () => 'downloadable',
        create: async options => {
            createOptions = options;
            options.monitor({addEventListener(type, callback) { callback({loaded: .5}); }});
            return {prompt: async () => 'Take one small step.', destroy() { destroyed++; }};
        }
    });
    assert.equal(await client.ask('Help me plan', 'Portfolio', text => messages.push(text)), 'Take one small step.');
    assert(messages.some(text => text.includes('50%')));
    assert.equal(destroyed, 1);
    assert.equal(client.operation, null);
    assert.equal(client.history.length, 2);
    assert.equal(createOptions.expectedOutputs[0].languages[0], 'en');
    client.api.create = async () => ({prompt: async () => { throw new Error('inference failed'); }, destroy() { destroyed++; }});
    await assert.rejects(client.ask('hello', ''), /inference failed/);
    assert.equal(destroyed, 2);
    assert.equal(client.operation, null);
    let finishDownload;
    client.api.create = () => new Promise(resolve => { finishDownload = resolve; });
    const pending = client.ask('hello', '');
    await new Promise(resolve => setImmediate(resolve));
    client.cancel();
    finishDownload({destroy() { destroyed++; }});
    await assert.rejects(pending, {name: 'AbortError'});
    assert.equal(destroyed, 3);
    assert.equal(client.operation, null);
    let started;
    const thinking = new Promise(resolve => { started = resolve; });
    client.api.create = async () => ({
        prompt: (_, {signal}) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
            started();
        }), destroy() { destroyed++; }
    });
    const generating = client.ask('hello', '');
    await thinking;
    client.cancel();
    await assert.rejects(generating, {name: 'AbortError'});
    assert.equal(destroyed, 4);
    console.log('Pip local AI lifecycle tests passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
