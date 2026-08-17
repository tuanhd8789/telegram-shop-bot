const test = require('node:test');
const assert = require('node:assert/strict');
const registerSupport = require('../src/commands/support');

test('registers /hotro while preserving the legacy /support alias', () => {
    const handlers = new Map();
    const bot = {
        command(name, handler) {
            handlers.set(name, handler);
        },
    };

    registerSupport(bot);

    assert.equal(typeof handlers.get('hotro'), 'function');
    assert.equal(handlers.get('support'), handlers.get('hotro'));
});
