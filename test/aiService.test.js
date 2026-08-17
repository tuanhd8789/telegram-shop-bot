const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SYSTEM_PROMPT,
    buildChatCompletionsUrl,
    createAiService,
} = require('../src/services/aiService');

test('normalizes OpenAI-compatible base URLs', () => {
    assert.equal(
        buildChatCompletionsUrl('https://api.example.com'),
        'https://api.example.com/v1/chat/completions'
    );
    assert.equal(
        buildChatCompletionsUrl('https://api.example.com/v1/'),
        'https://api.example.com/v1/chat/completions'
    );
    assert.equal(
        buildChatCompletionsUrl('https://api.example.com/v1/chat/completions'),
        'https://api.example.com/v1/chat/completions'
    );
});

test('sends a bounded read-only chat completion request', async () => {
    let request;
    const service = createAiService({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-secret',
        model: 'test-model',
        maxTokens: 321,
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: ' Xin chào admin ' } }] }),
            };
        },
    });

    assert.equal(await service.answer('Tình trạng bot?'), 'Xin chào admin');
    assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer test-secret');
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.max_tokens, 321);
    assert.equal(body.messages[0].content, SYSTEM_PROMPT);
    assert.match(body.messages[0].content, /không có công cụ/);
    assert.deepEqual(body.messages[1], { role: 'user', content: 'Tình trạng bot?' });
    assert.equal(body.tools, undefined);
});

test('does not expose provider response bodies in errors', async () => {
    const service = createAiService({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'do-not-leak',
        model: 'test-model',
        fetchImpl: async () => ({ ok: false, status: 401 }),
    });

    await assert.rejects(service.answer('test'), /^Error: AI provider returned HTTP 401$/);
});
