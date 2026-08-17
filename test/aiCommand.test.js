const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiCommandHandler } = require('../src/commands/ai');

function context(userId, text) {
    const replies = [];
    return {
        ctx: {
            from: { id: userId },
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
