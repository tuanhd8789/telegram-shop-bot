const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createAiCommandHandler,
    createAiController,
    START_AI_CHAT_LABEL,
    STOP_AI_CHAT_LABEL,
} = require('../src/commands/ai');

function context(userId, text) {
    const replies = [];
    return {
        ctx: {
            from: { id: userId },
            session: {},
            message: { text },
            reply: async (message) => { replies.push(message); },
            replyWithHTML: async (message) => { replies.push(message); },
            sendChatAction: async () => {},
        },
        replies,
    };
}

test('blocks non-admin users before calling the provider', async () => {
    let calls = 0;
    const handler = createAiCommandHandler({
        adminId: 123,
        enabled: true,
        aiService: { answer: async () => { calls += 1; return 'never'; } },
    });
    const { ctx, replies } = context(456, '/ai hello');

    await handler(ctx);

    assert.equal(calls, 0);
    assert.match(replies[0], /chỉ dành cho admin/);
});

test('routes normal admin text to AI while letting bot commands pass through', async () => {
    let active = false;
    const prompts = [];
    const chatModeStore = {
        isActive: () => active,
        setActive: (_telegramId, value) => { active = value; },
    };
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: { answer: async (prompt) => { prompts.push(prompt); return `AI: ${prompt}`; } },
        chatModeStore,
    });

    const start = context(123, START_AI_CHAT_LABEL);
    start.ctx.session.navigation = { action: 'broadcast' };
    await controller.textMiddleware(start.ctx, () => assert.fail('start button reached next middleware'));
    assert.equal(active, true);
    assert.equal(start.ctx.session.navigation, undefined);

    let commandReached = false;
    const command = context(123, '/stats');
    await controller.textMiddleware(command.ctx, () => { commandReached = true; });
    assert.equal(commandReached, true);
    assert.equal(active, true);

    const message = context(123, 'tình trạng shop');
    await controller.textMiddleware(message.ctx, () => assert.fail('active AI text reached the bot handlers'));
    assert.deepEqual(prompts, ['tình trạng shop']);
    assert.deepEqual(message.replies, ['AI: tình trạng shop']);

    const stop = context(123, STOP_AI_CHAT_LABEL);
    await controller.textMiddleware(stop.ctx, () => assert.fail('stop button reached next middleware'));
    assert.equal(active, false);

    let nextCalled = false;
    const afterStop = context(123, 'tin nhắn bình thường');
    await controller.textMiddleware(afterStop.ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(prompts, ['tình trạng shop']);
});

test('start and menu commands leave AI mode before reaching command handlers', async () => {
    let active = true;
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: { answer: async () => assert.fail('navigation command reached AI') },
        chatModeStore: {
            isActive: () => active,
            setActive: (_telegramId, value) => { active = value; },
        },
    });

    for (const text of ['/start', '/menu@minhbrandbot']) {
        active = true;
        let nextCalled = false;
        const request = context(123, text);
        await controller.textMiddleware(request.ctx, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(active, false);
    }
});

test('natural Vietnamese exit text stops AI without calling the provider', async () => {
    let active = true;
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: { answer: async () => assert.fail('exit text reached AI') },
        chatModeStore: {
            isActive: () => active,
            setActive: (_telegramId, value) => { active = value; },
        },
    });
    const request = context(123, 'Thoát khỏi chat với Ai.');

    await controller.textMiddleware(request.ctx, () => assert.fail('exit text reached bot handlers'));

    assert.equal(active, false);
    assert.match(request.replies[0], /Đã dừng chat với AI/);
});

test('never lets a non-admin enable persistent AI chat mode', async () => {
    let active = false;
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: { answer: async () => 'never' },
        chatModeStore: {
            isActive: () => active,
            setActive: (_telegramId, value) => { active = value; },
        },
    });
    const attempt = context(456, START_AI_CHAT_LABEL);
    let nextCalled = false;

    await controller.textMiddleware(attempt.ctx, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(active, false);
});

test('lets the admin ask a one-shot question', async () => {
    const prompts = [];
    const handler = createAiCommandHandler({
        adminId: 123,
        enabled: true,
        aiService: { answer: async (prompt) => { prompts.push(prompt); return 'Bot ổn định.'; } },
    });
    const { ctx, replies } = context(123, '/ai kiểm tra bot');

    await handler(ctx);

    assert.deepEqual(prompts, ['kiểm tra bot']);
    assert.deepEqual(replies, ['Bot ổn định.']);
});

test('returns safe usage and provider failure messages', async () => {
    const logger = { error() {} };
    const handler = createAiCommandHandler({
        adminId: 123,
        enabled: true,
        aiService: { answer: async () => { throw new Error('secret provider detail'); } },
        logger,
    });
    const usage = context(123, '/ai');
    await handler(usage.ctx);
    assert.match(usage.replies[0], /tool đọc dữ liệu/);

    const failed = context(123, '/ai test');
    await handler(failed.ctx);
    assert.match(failed.replies[0], /AI tạm thời không trả lời được/);
    assert.doesNotMatch(failed.replies[0], /secret provider detail/);
});

test('runs read tools automatically and returns the grounded answer', async () => {
    const calls = [];
    let receivedArgs;
    const aiService = {
        async complete(messages) {
            calls.push(messages);
            if (calls.length === 1) {
                return {
                    role: 'assistant',
                    content: '',
                    tool_calls: [{ id: 'read-1', type: 'function', function: {
                        name: 'get_shop_overview', arguments: '{"_":"provider metadata","reason":"Kiểm tra tổng quan"}',
                    } }],
                };
            }
            assert.match(messages.at(-1).content, /"users":7/);
            return { role: 'assistant', content: '**Shop ổn định**', tool_calls: [] };
        },
    };
    const actionGateway = {
        getTools: () => [],
        isReadTool: (name) => name === 'get_shop_overview',
        isWriteTool: () => false,
        runRead: (_name, args) => {
            receivedArgs = args;
            return { users: 7 };
        },
    };
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService,
        actionGateway,
        chatModeStore: { isActive: () => false, setActive() {} },
    });
    const request = context(123, '/ai tình trạng shop');

    await controller.command(request.ctx);

    assert.equal(calls.length, 2);
    assert.deepEqual(receivedArgs, {});
    assert.equal(request.replies[0], '<b>Shop ổn định</b>');
});

test('shows a confirmation button instead of executing a write tool', async () => {
    let prepared = 0;
    const actionGateway = {
        getTools: () => [],
        isReadTool: () => false,
        isWriteTool: (name) => name === 'update_product',
        prepare(name, args, adminId) {
            prepared += 1;
            assert.equal(name, 'update_product');
            assert.deepEqual(args, { product_id: 9, price: 700000 });
            assert.equal(adminId, 123);
            return { id: '0123456789abcdef', preview: 'Đổi giá sản phẩm #9.' };
        },
    };
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: {
            complete: async () => ({
                role: 'assistant', content: '',
                tool_calls: [{ id: 'write-1', type: 'function', function: {
                    name: 'update_product', arguments: '{"product_id":9,"price":700000}',
                } }],
            }),
        },
        actionGateway,
        chatModeStore: { isActive: () => false, setActive() {} },
    });
    const request = context(123, '/ai đổi giá');

    await controller.command(request.ctx);

    assert.equal(prepared, 1);
    assert.match(request.replies[0], /Chưa có thay đổi nào/);
    assert.match(request.replies[0], /0123456789abcdef/);
});

test('confirmation callbacks execute once and protected handoffs leave AI mode', async () => {
    let active = true;
    let confirms = 0;
    const actionGateway = {
        confirm: async (id, adminId) => {
            confirms += 1;
            assert.equal(id, '0123456789abcdef');
            assert.equal(adminId, 123);
            return {
                message: 'Mở nhập kho.',
                backupName: null,
                interaction: { type: 'add_stock', productId: 9 },
            };
        },
    };
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: {},
        actionGateway,
        chatModeStore: {
            isActive: () => active,
            setActive: (_id, value) => { active = value; },
        },
    });
    const request = context(123, 'callback');
    request.ctx.match = ['full', '0123456789abcdef'];
    request.ctx.answerCbQuery = async () => {};

    await controller.confirmAction(request.ctx);

    assert.equal(confirms, 1);
    assert.equal(active, false);
    assert.deepEqual(request.ctx.session.navigation, { action: 'stock_data', productId: 9 });
    assert.match(request.replies[0], /Mở nhập kho/);
});

test('confirmation callbacks reject non-admin users before gateway execution', async () => {
    let confirms = 0;
    const controller = createAiController({
        adminId: 123,
        enabled: true,
        aiService: {},
        actionGateway: { confirm: async () => { confirms += 1; } },
        chatModeStore: { isActive: () => false, setActive() {} },
    });
    const request = context(456, 'callback');
    request.ctx.match = ['full', '0123456789abcdef'];
    const alerts = [];
    request.ctx.answerCbQuery = async (...args) => { alerts.push(args); };

    await controller.confirmAction(request.ctx);

    assert.equal(confirms, 0);
    assert.match(alerts[0][0], /không có quyền/);
});
