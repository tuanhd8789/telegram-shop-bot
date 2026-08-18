const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const {
    registerNavigation,
    replyMenuKeyboard,
    adminMenuKeyboard,
    adminProductMenuKeyboard,
    stockItemsKeyboard,
    CUSTOMER_REPLY_LABELS,
    ADMIN_REPLY_LABELS,
} = require('../src/handlers/navigation');
const { topupKeyboard } = require('../src/commands/nap');

function labels(markup) {
    const rows = markup.reply_markup.inline_keyboard || markup.reply_markup.keyboard;
    return rows.flat().map((button) => typeof button === 'string' ? button : button.text);
}

test('customer reply keyboard is persistent and does not expose admin actions', () => {
    const keyboard = replyMenuKeyboard(false);
    const customerLabels = labels(keyboard);
    assert.ok(customerLabels.includes('🛍 Tất cả sản phẩm'));
    assert.ok(customerLabels.includes('💰 Nạp tiền vào ví'));
    assert.equal(customerLabels.includes('🔧 QUẢN TRỊ'), false);
    assert.equal(customerLabels.includes('👤 KHÁCH HÀNG'), false);
    assert.equal(keyboard.reply_markup.is_persistent, true);
    assert.equal(keyboard.reply_markup.resize_keyboard, true);
    assert.deepEqual(customerLabels, CUSTOMER_REPLY_LABELS);
});

test('admin reply keyboard keeps customer actions above admin actions', () => {
    const adminKeyboard = replyMenuKeyboard(true);
    const adminLabels = labels(adminKeyboard);
    assert.deepEqual(adminLabels.slice(0, CUSTOMER_REPLY_LABELS.length), CUSTOMER_REPLY_LABELS);
    assert.deepEqual(adminLabels.slice(CUSTOMER_REPLY_LABELS.length), ADMIN_REPLY_LABELS);
    const aiReplyRow = adminKeyboard.reply_markup.keyboard.find((row) =>
        row.some((button) => button.text === '🤖 Chat với AI')
    );
    assert.deepEqual(aiReplyRow.map((button) => button.text), [
        '🤖 Chat với AI',
        '🛑 Dừng chat với AI',
    ]);

    const inlineAdminKeyboard = adminMenuKeyboard();
    const inlineAdminLabels = labels(inlineAdminKeyboard);
    assert.ok(inlineAdminLabels.includes('➕ Tạo danh mục'));
    assert.ok(inlineAdminLabels.includes('➕ Tạo sản phẩm'));
    assert.ok(inlineAdminLabels.includes('📥 Thêm kho'));
    assert.ok(inlineAdminLabels.includes('📣 Gửi thông báo'));
    assert.ok(inlineAdminLabels.includes('🤖 Chat với AI'));
    assert.ok(inlineAdminLabels.includes('🛑 Dừng chat với AI'));
    assert.deepEqual(
        inlineAdminKeyboard.reply_markup.inline_keyboard[0].map((button) => button.text),
        ['🤖 Chat với AI', '🛑 Dừng chat với AI']
    );

    const productLabels = labels(adminProductMenuKeyboard());
    for (const label of ['📦 Tất cả sản phẩm', '➕ Tạo sản phẩm', '💵 Sửa giá', '✏️ Sửa tên', '🔁 Bật/tắt', '🗑 Xóa']) {
        assert.ok(productLabels.includes(label));
    }
});

test('top-up menu offers all requested preset amounts and custom input', () => {
    const topupLabels = labels(topupKeyboard());
    for (const amount of ['10.000đ', '50.000đ', '100.000đ', '200.000đ', '300.000đ', '500.000đ']) {
        assert.ok(topupLabels.includes(amount));
    }
    assert.ok(topupLabels.includes('✍️ Nhập số tiền khác'));
});

test('routes the admin add-stock reply button to the product picker', async () => {
    let textHandler;
    const bot = {
        action() {},
        on(type, handler) {
            if (type === 'text') textHandler = handler;
        },
    };
    registerNavigation(bot);
    const originalAdminId = config.ADMIN_ID;
    config.ADMIN_ID = 5487392216;
    const replies = [];
    const ctx = {
        from: { id: 5487392216 },
        session: {},
        message: { text: '📥 Thêm tồn kho' },
        reply: (...args) => { replies.push(args); },
    };

    try {
        await textHandler(ctx, () => assert.fail('reply button was not routed'));
    } finally {
        config.ADMIN_ID = originalAdminId;
    }

    assert.equal(replies.length, 1);
    assert.match(replies[0][0], /Chọn sản phẩm cần thêm kho/);
    assert.ok(replies[0][1].reply_markup.inline_keyboard.length > 1);
});

test('stock keyboard exposes detail, edit and delete actions for every item', () => {
    const keyboard = stockItemsKeyboard([{ id: 41 }, { id: 42 }], 9);
    const buttons = keyboard.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map((button) => button.callback_data).filter(Boolean);

    for (const stockId of [41, 42]) {
        assert.ok(callbacks.includes(`nav_stock_item_${stockId}`));
        assert.ok(callbacks.includes(`nav_stock_edit_${stockId}`));
        assert.ok(callbacks.includes(`nav_stock_delete_${stockId}`));
    }
    assert.ok(callbacks.includes('nav_stock_add_9'));
    assert.ok(callbacks.includes('nav_admin_view_stock'));
});

test('stock keyboard paginates inventories larger than one page', () => {
    const keyboard = stockItemsKeyboard([{ id: 51 }], 9, 1, 3);
    const callbacks = keyboard.reply_markup.inline_keyboard.flat()
        .map((button) => button.callback_data)
        .filter(Boolean);

    assert.ok(callbacks.includes('nav_stock_product_9_0'));
    assert.ok(callbacks.includes('nav_stock_product_9_2'));
});
