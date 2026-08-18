const test = require('node:test');
const assert = require('node:assert/strict');
const {
    callbackWithCustomEmoji,
    customEmojiHtml,
    escapeHtml,
} = require('../src/utils/telegramMarkup');

test('custom emoji helpers produce Bot API button icons and safe HTML fallback', () => {
    const button = callbackWithCustomEmoji('Autodesk', 'nav_category_4', '5916038376150011838');
    assert.equal(button.icon_custom_emoji_id, '5916038376150011838');
    assert.equal(button.callback_data, 'nav_category_4');
    assert.equal(
        customEmojiHtml('5916038376150011838', '📲'),
        '<tg-emoji emoji-id="5916038376150011838">📲</tg-emoji>'
    );
    assert.equal(escapeHtml('a<&>b'), 'a&lt;&amp;&gt;b');
});

test('invalid custom emoji IDs fall back to a plain emoji', () => {
    for (const invalidId of [
        'bad-id',
        'https://example.com/icon.png',
        '53885605919861068155388560591986106815',
        '9223372036854775808',
        '0',
    ]) {
        const button = callbackWithCustomEmoji('Autodesk', 'nav_category_4', invalidId);
        assert.equal(button.icon_custom_emoji_id, undefined);
        assert.equal(customEmojiHtml(invalidId, '📦'), '📦');
    }
});
