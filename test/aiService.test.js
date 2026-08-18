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

test('sends a bounded chat completion request without tools for compatibility', async () => {
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
    assert.match(body.messages[0].content, /Xác nhận/);
    assert.deepEqual(body.messages[1], { role: 'user', content: 'Tình trạng bot?' });
    assert.equal(body.tools, undefined);
});

test('sends tool schemas and normalizes OpenAI-compatible tool calls', async () => {
    let body;
    const service = createAiService({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-secret',
        model: 'test-model',
        fetchImpl: async (_url, options) => {
            body = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: {
                        content: '',
                        tool_calls: [{
                            id: 'call-1',
                            type: 'function',
                            function: { name: 'get_shop_overview', arguments: '{}' },
                        }],
                    } }],
                }),
            };
        },
    });
    const tools = [{ type: 'function', function: { name: 'get_shop_overview', parameters: { type: 'object' } } }];

    const message = await service.complete([{ role: 'user', content: 'Xem shop' }], tools);

    assert.deepEqual(body.tools, tools);
    assert.equal(body.tool_choice, 'auto');
    assert.equal(message.tool_calls[0].function.name, 'get_shop_overview');
    assert.equal(message.tool_calls[0].function.arguments, '{}');
});

test('does not expose provider response bodies in errors', async () => {
    let attempts = 0;
    const service = createAiService({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'do-not-leak',
        model: 'test-model',
        fetchImpl: async () => {
            attempts += 1;
            return { ok: false, status: 401 };
        },
    });

    await assert.rejects(service.answer('test'), /^Error: AI provider returned HTTP 401$/);
    assert.equal(attempts, 1);
});

test('retries transient provider rate limits and respects Retry-After', async () => {
    let attempts = 0;
    const delays = [];
    const service = createAiService({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-secret',
        model: 'test-model',
        sleepImpl: async (delayMs) => { delays.push(delayMs); },
        fetchImpl: async () => {
            attempts += 1;
            if (attempts < 3) {
                return {
                    ok: false,
                    status: 429,
                    headers: { get: () => '0.25' },
                };
            }
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'Đã sẵn sàng' } }] }),
            };
        },
    });

    assert.equal(await service.answer('test'), 'Đã sẵn sàng');
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [250, 250]);
});
