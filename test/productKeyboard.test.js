const test = require('node:test');
const assert = require('node:assert/strict');

const { formatCompactPrice, productListKeyboard } = require('../src/utils/keyboard');

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
    assert.equal(button.text, '600k | 34 | Autodesk Full App 1 năm chính chủ');
    assert.equal(button.callback_data, 'product_9');
    assert.equal(button.icon_custom_emoji_id, '5916038376150011838');
    assert.equal(button.style, undefined);
    assert.deepEqual(
        keyboard.reply_markup.inline_keyboard.at(-1).map((item) => item.callback_data),
        ['refresh_products', 'nav_menu']
    );
});

test('category product lists use category refresh and back callbacks in one row', () => {
    const keyboard = productListKeyboard([], {
        refreshCallback: 'nav_category_7',
        backCallback: 'nav_categories',
    });
    assert.deepEqual(
        keyboard.reply_markup.inline_keyboard[0].map((item) => item.callback_data),
        ['nav_category_7', 'nav_categories']
    );
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
    assert.equal(button.text, '300k | Liên hệ | AutoCAD LT');
    assert.equal(button.icon_custom_emoji_id, undefined);
    assert.equal(button.style, undefined);
});

test('out-of-stock product buttons are red', () => {
    const keyboard = productListKeyboard([{
        id: 11,
        name: 'Microsoft 365',
        price: 250000,
        stock_count: 0,
    }]);

    const button = keyboard.reply_markup.inline_keyboard[0][0];
    assert.equal(button.text, '250k | 0 | Microsoft 365');
    assert.equal(button.style, 'danger');
});

test('compact prices use Vietnamese million units and retain meaningful decimals', () => {
    assert.equal(formatCompactPrice(1000000), '1 triệu');
    assert.equal(formatCompactPrice(1200000), '1,2 triệu');
    assert.equal(formatCompactPrice(1250000), '1,25 triệu');
});

test('compact prices fall back to full currency when abbreviation would lose precision', () => {
    assert.equal(formatCompactPrice(999999), '999.999đ');
    assert.equal(formatCompactPrice(999), '999đ');
});
