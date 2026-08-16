const test = require('node:test');
const assert = require('node:assert/strict');
const { Telegraf } = require('telegraf');
const { createSessionMiddleware } = require('../src/session');

test('initializes a writable session for a first-time callback', async () => {
    const bot = new Telegraf('123456:TEST_TOKEN');
    bot.botInfo = {
        id: 123456,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
    };
    let storedState;

    bot.use(createSessionMiddleware());
    bot.on('callback_query', (ctx) => {
        ctx.session.navigation = { action: 'stock_data', productId: 9 };
        storedState = ctx.session.navigation;
    });

    await bot.handleUpdate({
        update_id: 1,
        callback_query: {
            id: 'callback-1',
            chat_instance: 'instance-1',
            data: 'nav_stock_add_9',
            from: { id: 5487392216, is_bot: false, first_name: 'Admin' },
            message: {
                message_id: 1,
                date: 1,
                chat: { id: 5487392216, type: 'private' },
            },
        },
    });

    assert.deepEqual(storedState, { action: 'stock_data', productId: 9 });
});
