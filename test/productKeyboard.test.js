const test = require('node:test');
const assert = require('node:assert/strict');

const { productListKeyboard } = require('../src/utils/keyboard');

test('product buttons show price, stock and app name in that order with a custom icon', () => {
    const keyboard = productListKeyboard([{
        id: 9,
        name: 'Autodesk Full App 1 năm chính chủ',
        price: 600000,
        display_stock: 34,
        stock_count: 0,
        custom_emoji_id: '5916038376150011838',
    }]);

    const button = keyboard.reply_markup.inline_keyboard[0][0];
    assert.equal(button.text, '600.000đ | 34 | Autodesk Full App 1 năm chính chủ');
    assert.equal(button.callback_data, 'product_9');
    assert.equal(button.icon_custom_emoji_id, '5916038376150011838');
});

test('contact-only products keep the same column order', () => {
    const keyboard = productListKeyboard([{
        id: 10,
        name: 'AutoCAD LT',
        price: 300000,
        display_stock: 0,
        stock_count: 0,
        contact_only: 1,
    }]);

    const button = keyboard.reply_markup.inline_keyboard[0][0];
    assert.equal(button.text, '300.000đ | Liên hệ | AutoCAD LT');
    assert.equal(button.icon_custom_emoji_id, undefined);
});
