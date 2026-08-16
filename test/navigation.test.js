const test = require('node:test');
const assert = require('node:assert/strict');
const { mainMenuKeyboard, adminMenuKeyboard } = require('../src/handlers/navigation');
const { topupKeyboard } = require('../src/commands/nap');

function labels(markup) {
    return markup.reply_markup.inline_keyboard.flat().map((button) => button.text);
}

test('customer menu does not expose the admin entry', () => {
    const customerLabels = labels(mainMenuKeyboard(false));
    assert.ok(customerLabels.includes('🛍 Tất cả sản phẩm'));
    assert.ok(customerLabels.includes('💰 Nạp tiền vào ví'));
    assert.equal(customerLabels.includes('🔧 Quản trị'), false);
});

test('admin menu exposes button-first management actions', () => {
    assert.ok(labels(mainMenuKeyboard(true)).includes('🔧 Quản trị'));
    const adminLabels = labels(adminMenuKeyboard());
    assert.ok(adminLabels.includes('➕ Tạo danh mục'));
    assert.ok(adminLabels.includes('➕ Tạo sản phẩm'));
    assert.ok(adminLabels.includes('📥 Thêm kho'));
    assert.ok(adminLabels.includes('📣 Gửi thông báo'));
});

test('top-up menu offers all requested preset amounts and custom input', () => {
    const topupLabels = labels(topupKeyboard());
    for (const amount of ['10.000đ', '50.000đ', '100.000đ', '200.000đ', '300.000đ', '500.000đ']) {
        assert.ok(topupLabels.includes(amount));
    }
    assert.ok(topupLabels.includes('✍️ Nhập số tiền khác'));
});
