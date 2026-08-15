const test = require('node:test');
const assert = require('node:assert/strict');

const { registerCommandMenus } = require('../src/commandMenu');

test('registers public commands globally and admin commands only for the admin chat', async () => {
    const calls = [];
    const telegram = {
        setMyCommands(commands, extra) {
            calls.push({ commands, extra });
            return Promise.resolve(true);
        },
    };

    await registerCommandMenus(telegram, 400332489);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].extra, undefined);
    assert.equal(calls[0].commands.some(({ command }) => command === 'admin'), false);
    assert.deepEqual(calls[1].extra, {
        scope: { type: 'chat', chat_id: 400332489 },
    });
    assert.equal(calls[1].commands.some(({ command }) => command === 'admin'), true);
    assert.equal(calls[1].commands.some(({ command }) => command === 'addstock'), true);
});
