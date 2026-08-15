const test = require('node:test');
const assert = require('node:assert/strict');
const { startPolling } = require('../src/botLifecycle');

test('startPolling resolves when connected without waiting for polling to stop', async () => {
    const pollingPromise = new Promise(() => {});
    const bot = {
        launch(_config, onConnected) {
            queueMicrotask(onConnected);
            return pollingPromise;
        },
    };

    const result = await startPolling(bot, () => assert.fail('unexpected fatal error'));

    assert.equal(result.pollingPromise, pollingPromise);
});

test('startPolling rejects when launch fails before connecting', async () => {
    const expected = new Error('connection failed');
    const bot = { launch: () => Promise.reject(expected) };

    await assert.rejects(startPolling(bot, () => assert.fail('unexpected fatal error')), expected);
});
