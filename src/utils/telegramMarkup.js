const { Markup } = require('telegraf');

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function normalizeCustomEmojiId(value) {
    const id = String(value ?? '');
    return /^\d+$/.test(id) ? id : null;
}

function customEmojiHtml(customEmojiId, fallbackEmoji = '📦') {
    const id = normalizeCustomEmojiId(customEmojiId);
    const fallback = escapeHtml(fallbackEmoji);
    return id ? `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>` : fallback;
}

function callbackWithCustomEmoji(text, callbackData, customEmojiId) {
    const button = Markup.button.callback(text, callbackData);
    const id = normalizeCustomEmojiId(customEmojiId);
    if (id) button.icon_custom_emoji_id = id;
    return button;
}

module.exports = {
    callbackWithCustomEmoji,
    customEmojiHtml,
    escapeHtml,
    normalizeCustomEmojiId,
};
