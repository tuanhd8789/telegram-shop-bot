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

test('keeps all admin text in AI mode until the stop button is pressed', async () => {
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

    const message = context(123, '/stats');
    await controller.textMiddleware(message.ctx, () => assert.fail('active AI text reached the bot command'));
    assert.deepEqual(prompts, ['/stats']);
    assert.deepEqual(message.replies, ['AI: /stats']);

    const stop = context(123, STOP_AI_CHAT_LABEL);
    await controller.textMiddleware(stop.ctx, () => assert.fail('stop button reached next middleware'));
    assert.equal(active, false);

    let nextCalled = false;
    const afterStop = context(123, 'tin nhắn bình thường');
    await controller.textMiddleware(afterStop.ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(prompts, ['/stats']);
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

test('lets the admin ask a one-shot read-only question', async () => {
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
    assert.match(usage.replies[0], /chưa có quyền đọc DB/);

    const failed = context(123, '/ai test');
    await handler(failed.ctx);
    assert.match(failed.replies[0], /AI tạm thời không trả lời được/);
    assert.doesNotMatch(failed.replies[0], /secret provider detail/);
});
