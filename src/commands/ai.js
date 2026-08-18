const { Markup } = require('telegraf');
const { escapeHtml } = require('../utils/telegramMarkup');

const MAX_PROMPT_LENGTH = 4000;
const MAX_TELEGRAM_LENGTH = 3500;
const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS = 5;
const AI_GUIDE_URL = 'https://github.com/tuanhd8789/telegram-shop-bot/blob/main/docs/admin-ai.md';
const START_AI_CHAT_LABEL = '🤖 Chat với AI';
const STOP_AI_CHAT_LABEL = '🛑 Dừng chat với AI';

function getPrompt(ctx) {
    return String(ctx.message?.text || '')
        .replace(/^\/ai(?:@\w+)?(?:\s+|$)/i, '')
        .trim();
}

function renderAiHtml(value) {
    return escapeHtml(value)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function normalizeProviderArguments(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const normalized = { ...value };
    // Some OpenAI-compatible reasoning models add this harmless metadata even
    // when additionalProperties is false. Strip only this known field; the
    // gateway still rejects every other argument outside the tool allowlist.
    if (typeof normalized.reason === 'string') delete normalized.reason;
    return normalized;
}

function createAiController({
    adminId,
    enabled,
    aiService,
    chatModeStore,
    actionGateway,
    logger = console,
}) {
    let requestRunning = false;

    function isAdmin(ctx) {
        return ctx.from?.id === adminId;
    }

    function isAvailable() {
        return enabled && aiService;
    }

    function replyAiText(ctx, value, extra) {
        const text = String(value || '').slice(0, MAX_TELEGRAM_LENGTH);
        if (ctx.replyWithHTML) return ctx.replyWithHTML(renderAiHtml(text), extra);
        return ctx.reply(text, extra);
    }

    function showProposal(ctx, proposal) {
        const text =
            `🛡️ <b>AI ĐỀ XUẤT HÀNH ĐỘNG</b>\n\n` +
            `${escapeHtml(proposal.preview)}\n\n` +
            `Mã audit: <code>${proposal.id}</code>\n` +
            `Yêu cầu hết hạn sau 10 phút. Chưa có thay đổi nào được áp dụng.`;
        const keyboard = Markup.inlineKeyboard([[
            Markup.button.callback('✅ Xác nhận', `ai_action_confirm_${proposal.id}`),
            Markup.button.callback('❌ Hủy', `ai_action_cancel_${proposal.id}`),
        ]]);
        if (ctx.replyWithHTML) return ctx.replyWithHTML(text, keyboard);
        return ctx.reply(proposal.preview, keyboard);
    }

    async function runTools(ctx, prompt, canReply = () => true) {
        if (!actionGateway || typeof aiService.complete !== 'function') {
            const answer = await aiService.answer(prompt);
            return canReply() ? replyAiText(ctx, answer) : undefined;
        }

        const messages = [{ role: 'user', content: prompt }];
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
            const message = await aiService.complete(messages, actionGateway.getTools());
            if (!canReply()) return;
            const calls = message.tool_calls || [];
            if (calls.length === 0) return replyAiText(ctx, message.content);
            if (calls.length > MAX_TOOL_CALLS) throw new Error('AI requested too many tools');
            const writeCalls = calls.filter((call) => actionGateway.isWriteTool(call.function.name));
            if (writeCalls.length > 1) {
                return replyAiText(ctx, 'Mỗi lần chỉ được đề xuất một hành động ghi. Hãy yêu cầu từng thay đổi riêng và xác nhận lần lượt.');
            }

            messages.push(message);
            let proposal = null;
            for (const call of calls) {
                let args;
                try {
                    args = normalizeProviderArguments(JSON.parse(call.function.arguments || '{}'));
                } catch {
                    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'JSON arguments không hợp lệ' }) });
                    continue;
                }
                try {
                    if (actionGateway.isReadTool(call.function.name)) {
                        const result = actionGateway.runRead(call.function.name, args);
                        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, result }) });
                    } else if (actionGateway.isWriteTool(call.function.name)) {
                        proposal = actionGateway.prepare(call.function.name, args, adminId);
                        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, pending_confirmation: proposal.id }) });
                    } else {
                        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Tool không nằm trong allowlist' }) });
                    }
                } catch (error) {
                    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: error.message }) });
                }
            }
            if (proposal) return showProposal(ctx, proposal);
        }
        return replyAiText(ctx, 'AI đã dùng quá nhiều vòng công cụ. Hãy chia yêu cầu thành phần nhỏ hơn.');
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
            const answer = await runTools(
                ctx,
                prompt,
                () => !requireActive || chatModeStore.isActive(adminId)
            );
            if (requireActive && !chatModeStore.isActive(adminId)) return;
            return answer;
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
                'AI có tool đọc dữ liệu đã lọc. Hành động ghi luôn hiện bản xem trước và chỉ chạy sau khi admin bấm Xác nhận.\n' +
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

    function applyInteraction(ctx, interaction) {
        if (!interaction) return;
        chatModeStore.setActive(adminId, false);
        if (interaction.type === 'add_stock') {
            ctx.session.navigation = { action: 'stock_data', productId: interaction.productId };
        } else if (interaction.type === 'edit_stock') {
            ctx.session.navigation = { action: 'edit_stock_data', stockId: interaction.stockId };
        } else if (interaction.type === 'manual_delivery') {
            require('../handlers/adminActions').setAdminState(adminId, {
                action: 'deliver_order',
                orderId: interaction.orderId,
                userId: interaction.userId,
                productName: interaction.productName,
                quantity: interaction.quantity,
            });
        }
    }

    async function confirmAction(ctx) {
        if (!isAdmin(ctx)) return ctx.answerCbQuery?.('⛔ Bạn không có quyền.', { show_alert: true });
        if (!actionGateway) return ctx.answerCbQuery?.('AI Action Gateway chưa sẵn sàng.', { show_alert: true });
        await ctx.answerCbQuery?.('⏳ Đang xử lý...');
        try {
            const result = await actionGateway.confirm(ctx.match[1], adminId);
            applyInteraction(ctx, result.interaction);
            const backup = result.backupName ? `\nBackup: ${result.backupName}` : '';
            return replyAiText(ctx, `✅ ${result.message}${backup}`);
        } catch (error) {
            logger.error(`AI action confirmation failed: ${error.message}`);
            return replyAiText(ctx, `❌ Không thực hiện được: ${error.message}`);
        }
    }

    async function cancelAction(ctx) {
        if (!isAdmin(ctx)) return ctx.answerCbQuery?.('⛔ Bạn không có quyền.', { show_alert: true });
        if (!actionGateway) return ctx.answerCbQuery?.('AI Action Gateway chưa sẵn sàng.', { show_alert: true });
        await ctx.answerCbQuery?.('Đã hủy');
        try {
            const result = actionGateway.cancel(ctx.match[1], adminId);
            return replyAiText(ctx, `❌ ${result.message}`);
        } catch (error) {
            return replyAiText(ctx, `❌ Không hủy được: ${error.message}`);
        }
    }

    return { cancelAction, command, confirmAction, startChat, stopChat, textMiddleware };
}

function createAiCommandHandler(options) {
    const inactiveStore = { isActive: () => false, setActive() {} };
    return createAiController({ ...options, chatModeStore: options.chatModeStore || inactiveStore }).command;
}

function registerAiCommand(bot, controller) {
    bot.command('ai', controller.command);
    bot.action(/^ai_action_confirm_([a-f0-9]{16})$/, controller.confirmAction);
    bot.action(/^ai_action_cancel_([a-f0-9]{16})$/, controller.cancelAction);
}

module.exports = registerAiCommand;
module.exports.createAiCommandHandler = createAiCommandHandler;
module.exports.createAiController = createAiController;
module.exports.getPrompt = getPrompt;
module.exports.renderAiHtml = renderAiHtml;
module.exports.START_AI_CHAT_LABEL = START_AI_CHAT_LABEL;
module.exports.STOP_AI_CHAT_LABEL = STOP_AI_CHAT_LABEL;
