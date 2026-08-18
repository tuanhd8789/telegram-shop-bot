const MAX_PROMPT_LENGTH = 4000;
const MAX_TELEGRAM_LENGTH = 3900;
const AI_GUIDE_URL = 'https://github.com/tuanhd8789/telegram-shop-bot/blob/main/docs/admin-ai.md';
const START_AI_CHAT_LABEL = '🤖 Chat với AI';
const STOP_AI_CHAT_LABEL = '🛑 Dừng chat với AI';

function getPrompt(ctx) {
    return String(ctx.message?.text || '')
        .replace(/^\/ai(?:@\w+)?(?:\s+|$)/i, '')
        .trim();
}

function createAiController({
    adminId,
    enabled,
    aiService,
    chatModeStore,
    logger = console,
}) {
    let requestRunning = false;

    function isAdmin(ctx) {
        return ctx.from?.id === adminId;
    }

    function isAvailable() {
        return enabled && aiService;
    }

    async function answerPrompt(ctx, prompt, requireActive = false) {
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
            if (requireActive && !chatModeStore.isActive(adminId)) return;
            const reply = answer.length > MAX_TELEGRAM_LENGTH
                ? `${answer.slice(0, MAX_TELEGRAM_LENGTH)}\n\n… (đã rút gọn)`
                : answer;
            return ctx.reply(reply);
        } catch (error) {
            logger.error(`Admin AI request failed: ${error.message}`);
            if (requireActive && !chatModeStore.isActive(adminId)) return;
            return ctx.reply('❌ AI tạm thời không trả lời được. Kiểm tra provider hoặc thử lại sau.');
        } finally {
            requestRunning = false;
        }
    }

    async function command(ctx) {
        if (!isAdmin(ctx)) {
            return ctx.reply('⛔ Chức năng AI chỉ dành cho admin.');
        }
        if (!isAvailable()) {
            return ctx.reply('⚠️ Trợ lý AI chưa được bật hoặc cấu hình chưa đầy đủ.');
        }

        const prompt = getPrompt(ctx);
        if (!prompt) {
            return ctx.reply(
                '🤖 Dùng /ai câu hỏi, hoặc bấm “Chat với AI” để chuyển mọi tin nhắn text sang AI.\n\n' +
                'AI hiện chỉ tư vấn cho admin, chưa có quyền đọc DB, chạy lệnh hoặc tự sửa cấu hình.\n' +
                `Hướng dẫn: ${AI_GUIDE_URL}`
            );
        }
        return answerPrompt(ctx, prompt);
    }

    function startChat(ctx) {
        if (!isAdmin(ctx)) return ctx.reply('⛔ Chức năng AI chỉ dành cho admin.');
        if (!isAvailable()) {
            return ctx.reply('⚠️ Trợ lý AI chưa được bật hoặc cấu hình chưa đầy đủ.');
        }
        if (chatModeStore.isActive(adminId)) {
            return ctx.reply(`🤖 Chế độ chat AI đang bật. Bấm “${STOP_AI_CHAT_LABEL}” để dừng.`);
        }
        chatModeStore.setActive(adminId, true);
        if (ctx.session) delete ctx.session.navigation;
        return ctx.reply(
            `✅ Đã bật chat với AI. Từ bây giờ mọi tin nhắn text của admin sẽ gửi tới AI cho đến khi bấm “${STOP_AI_CHAT_LABEL}”.\n\n` +
            'AI vẫn xử lý từng tin nhắn độc lập và không lưu lịch sử hội thoại.'
        );
    }

    function stopChat(ctx) {
        if (!isAdmin(ctx)) return ctx.reply('⛔ Chức năng AI chỉ dành cho admin.');
        if (!chatModeStore.isActive(adminId)) {
            return ctx.reply('ℹ️ Chế độ chat AI hiện không bật.');
        }
        chatModeStore.setActive(adminId, false);
        return ctx.reply('🛑 Đã dừng chat với AI. Các tin nhắn tiếp theo sẽ trở lại luồng của bot.');
    }

    async function textMiddleware(ctx, next) {
        const text = String(ctx.message?.text || '').trim();
        if (!text || !isAdmin(ctx)) return next();
        if (text === START_AI_CHAT_LABEL) return startChat(ctx);
        if (text === STOP_AI_CHAT_LABEL) return stopChat(ctx);
        if (!chatModeStore.isActive(adminId)) return next();
        if (!isAvailable()) return ctx.reply('⚠️ Trợ lý AI chưa được bật hoặc cấu hình chưa đầy đủ.');
        return answerPrompt(ctx, text, true);
    }

    return { command, startChat, stopChat, textMiddleware };
}

function createAiCommandHandler(options) {
    const inactiveStore = { isActive: () => false, setActive() {} };
    return createAiController({ ...options, chatModeStore: options.chatModeStore || inactiveStore }).command;
}

function registerAiCommand(bot, controller) {
    bot.command('ai', controller.command);
}

module.exports = registerAiCommand;
module.exports.createAiCommandHandler = createAiCommandHandler;
module.exports.createAiController = createAiController;
module.exports.getPrompt = getPrompt;
module.exports.START_AI_CHAT_LABEL = START_AI_CHAT_LABEL;
module.exports.STOP_AI_CHAT_LABEL = STOP_AI_CHAT_LABEL;
