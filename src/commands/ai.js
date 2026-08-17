const MAX_PROMPT_LENGTH = 4000;
const MAX_TELEGRAM_LENGTH = 3900;
const AI_GUIDE_URL = 'https://github.com/tuanhd8789/telegram-shop-bot/blob/main/docs/admin-ai.md';

function getPrompt(ctx) {
    return String(ctx.message?.text || '')
        .replace(/^\/ai(?:@\w+)?(?:\s+|$)/i, '')
        .trim();
}

function createAiCommandHandler({ adminId, enabled, aiService, logger = console }) {
    let requestRunning = false;

    return async function aiCommand(ctx) {
        if (ctx.from?.id !== adminId) {
            return ctx.reply('⛔ Chức năng AI chỉ dành cho admin.');
        }
        if (!enabled || !aiService) {
            return ctx.reply('⚠️ Trợ lý AI chưa được bật hoặc cấu hình chưa đầy đủ.');
        }

        const prompt = getPrompt(ctx);
        if (!prompt) {
            return ctx.reply(
                '🤖 Dùng: /ai câu hỏi của bạn\n\n' +
                'AI hiện chỉ tư vấn cho admin, chưa có quyền đọc DB, chạy lệnh hoặc tự sửa cấu hình.\n' +
                `Hướng dẫn: ${AI_GUIDE_URL}`
            );
        }
        if (prompt.length > MAX_PROMPT_LENGTH) {
            return ctx.reply(`❌ Câu hỏi quá dài. Tối đa ${MAX_PROMPT_LENGTH} ký tự.`);
        }
        if (requestRunning) {
            return ctx.reply('⏳ AI đang xử lý câu hỏi trước, vui lòng chờ.');
        }

        requestRunning = true;
        try {
            await ctx.sendChatAction?.('typing');
            const answer = await aiService.answer(prompt);
            const reply = answer.length > MAX_TELEGRAM_LENGTH
                ? `${answer.slice(0, MAX_TELEGRAM_LENGTH)}\n\n… (đã rút gọn)`
                : answer;
            return ctx.reply(reply);
        } catch (error) {
            logger.error(`Admin AI request failed: ${error.message}`);
            return ctx.reply('❌ AI tạm thời không trả lời được. Kiểm tra provider hoặc thử lại sau.');
        } finally {
            requestRunning = false;
        }
    };
}

function registerAiCommand(bot, options) {
    const handler = createAiCommandHandler(options);
    bot.command('ai', handler);
    return handler;
}

module.exports = registerAiCommand;
module.exports.createAiCommandHandler = createAiCommandHandler;
module.exports.getPrompt = getPrompt;
