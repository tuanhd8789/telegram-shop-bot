const SYSTEM_PROMPT = `Bạn là trợ lý chỉ dành cho quản trị viên của Telegram Shop Bot.
Trả lời bằng tiếng Việt, rõ ràng và ngắn gọn.
Giai đoạn hiện tại chỉ được tư vấn: bạn không có công cụ, không được tuyên bố đã đọc hoặc sửa cấu hình, cơ sở dữ liệu, file, server hay Telegram.
Không yêu cầu hoặc tiết lộ API key, bot token, mật khẩu, OTP, thông tin ngân hàng đầy đủ hay dữ liệu riêng của khách hàng.
Khi được yêu cầu cấu hình bot, hãy đưa ra đề xuất gồm thay đổi dự kiến, rủi ro và bước xác nhận; nói rõ rằng thay đổi chưa được áp dụng.`;

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

function createAiService({
    baseUrl,
    apiKey,
    model,
    timeoutMs = 45000,
    maxTokens = 700,
    fetchImpl = global.fetch,
}) {
    const endpoint = buildChatCompletionsUrl(baseUrl);

    async function answer(prompt) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        timeout.unref?.();

        try {
            const response = await fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: maxTokens,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`AI provider returned HTTP ${response.status}`);
            }

            const text = extractAssistantText(await response.json());
            if (!text) throw new Error('AI provider returned an empty response');
            return text;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('AI provider timed out');
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    return { answer };
}

module.exports = {
    SYSTEM_PROMPT,
    buildChatCompletionsUrl,
    createAiService,
    extractAssistantText,
};
