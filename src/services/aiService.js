const { setTimeout: sleep } = require('node:timers/promises');

const SYSTEM_PROMPT = `Bạn là trợ lý chỉ dành cho quản trị viên của Telegram Shop Bot.
Trả lời bằng tiếng Việt, rõ ràng và ngắn gọn.
Chỉ dùng các tool được cung cấp; không được tuyên bố đã đọc hoặc xử lý nếu chưa nhận kết quả tool.
Tool đọc có thể chạy ngay. Mỗi lần chỉ đề xuất tối đa một tool ghi; backend luôn yêu cầu admin bấm Xác nhận trước khi thực thi.
Không yêu cầu hoặc tiết lộ API key, bot token, mật khẩu, OTP, thông tin ngân hàng đầy đủ, nội dung stock hay dữ liệu riêng của khách hàng.
Không có shell, SQL tùy ý, file .env, secret hoặc quyền deploy. Nếu yêu cầu nằm ngoài allowlist, hãy nói rõ giới hạn.`;

function buildChatCompletionsUrl(baseUrl) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('AI_BASE_URL must use http or https');
    }

    const path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/chat/completions')) {
        url.pathname = path;
    } else if (!path) {
        url.pathname = '/v1/chat/completions';
    } else {
        url.pathname = `${path}/chat/completions`;
    }
    url.search = '';
    url.hash = '';
    return url.toString();
}

function extractAssistantText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part) => typeof part === 'string' ? part : part?.text)
            .filter((part) => typeof part === 'string')
            .join('\n')
            .trim();
    }
    return '';
}

function extractAssistantMessage(payload) {
    const message = payload?.choices?.[0]?.message;
    if (!message || typeof message !== 'object') {
        throw new Error('AI provider returned an invalid response');
    }
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls
        .filter((call) => call?.type === 'function' && call.function?.name)
        .map((call, index) => ({
            id: String(call.id || `tool_call_${index}`),
            type: 'function',
            function: {
                name: String(call.function.name),
                arguments: typeof call.function.arguments === 'string'
                    ? call.function.arguments
                    : JSON.stringify(call.function.arguments || {}),
            },
        })) : [];
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content && toolCalls.length === 0) throw new Error('AI provider returned an empty response');
    return { role: 'assistant', content, tool_calls: toolCalls };
}

function isRetryableStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}

function retryDelayMs(response, attempt, now = Date.now()) {
    const retryAfter = response.headers?.get?.('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10000);
        const timestamp = Date.parse(retryAfter);
        if (Number.isFinite(timestamp)) return Math.min(Math.max(timestamp - now, 0), 10000);
    }
    return Math.min(1000 * (2 ** attempt), 5000);
}

function createAiService({
    baseUrl,
    apiKey,
    model,
    timeoutMs = 45000,
    maxTokens = 700,
    fetchImpl = global.fetch,
    maxRetries = 2,
    sleepImpl = (delayMs, signal) => sleep(delayMs, undefined, { signal }),
}) {
    const endpoint = buildChatCompletionsUrl(baseUrl);

    async function complete(messages, tools = []) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        timeout.unref?.();

        try {
            const request = {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...messages,
                    ],
                    max_tokens: maxTokens,
                    ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
                }),
                signal: controller.signal,
            };

            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                const response = await fetchImpl(endpoint, request);
                if (response.ok) return extractAssistantMessage(await response.json());
                if (attempt < maxRetries && isRetryableStatus(response.status)) {
                    await sleepImpl(retryDelayMs(response, attempt), controller.signal);
                    continue;
                }
                throw new Error(`AI provider returned HTTP ${response.status}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('AI provider timed out');
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function answer(prompt) {
        const message = await complete([{ role: 'user', content: prompt }]);
        return message.content;
    }

    return { answer, complete };
}

module.exports = {
    SYSTEM_PROMPT,
    buildChatCompletionsUrl,
    createAiService,
    extractAssistantMessage,
    extractAssistantText,
    isRetryableStatus,
    retryDelayMs,
};
