const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const db = require('../src/database');
const productService = require('../src/services/productService');
const {
    registerNavigation,
    replyMenuKeyboard,
    adminMenuKeyboard,
    categoriesKeyboard,
    adminProductMenuKeyboard,
    adminCategoryMenuKeyboard,
    adminSettingsKeyboard,
    stockItemsKeyboard,
    CUSTOMER_REPLY_LABELS,
    ADMIN_REPLY_LABELS,
} = require('../src/handlers/navigation');
const { topupKeyboard } = require('../src/commands/nap');

function labels(markup) {
    const rows = markup.reply_markup.inline_keyboard || markup.reply_markup.keyboard;
    return rows.flat().map((button) => typeof button === 'string' ? button : button.text);
}

test('customer categories use a three-column grid with refresh and back rows', () => {
    const categories = Array.from({ length: 7 }, (_, index) => ({
        id: index + 1,
        name: `Category ${index + 1}`,
        emoji: '📂',
        custom_emoji_id: index === 0 ? '5916038376150011838' : null,
        has_stock: index % 2 === 0,
    }));

    const rows = categoriesKeyboard(categories).reply_markup.inline_keyboard;
    assert.deepEqual(rows.map((row) => row.length), [3, 3, 1, 1, 1]);
    assert.deepEqual(
        rows.slice(0, 3).flat().map((button) => button.callback_data),
        categories.map((category) => `nav_category_${category.id}`)
    );
    assert.equal(rows[0][0].icon_custom_emoji_id, '5916038376150011838');
    assert.deepEqual(rows.slice(0, 3).flat().map((button) => button.style), [
        'success', 'danger', 'success', 'danger', 'success', 'danger', 'success',
    ]);
    assert.deepEqual(rows.at(-2).map((button) => button.text), ['🔄 Làm mới']);
    assert.deepEqual(rows.at(-1).map((button) => button.text), ['↩️ Quay lại']);
});

test('category availability follows active local and sheet stock', () => {
    db.exec('BEGIN');
    try {
        const categoryId = Number(db.prepare(
            'INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)'
        ).run('Category stock test', '📂', 9999).lastInsertRowid);
        const productId = Number(db.prepare(
            'INSERT INTO products (category_id, name, price, sheet_stock) VALUES (?, ?, ?, ?)'
        ).run(categoryId, 'Category stock product', 1000, 0).lastInsertRowid);

        assert.equal(productService.getCategories({ includeInactive: true })
            .find((category) => category.id === categoryId).has_stock, 0);

        db.prepare('UPDATE products SET sheet_stock = 2 WHERE id = ?').run(productId);
        assert.equal(productService.getCategories({ includeInactive: true })
            .find((category) => category.id === categoryId).has_stock, 1);

        db.prepare('UPDATE products SET sheet_stock = 0 WHERE id = ?').run(productId);
        db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)').run(productId, 'available');
        assert.equal(productService.getCategories({ includeInactive: true })
            .find((category) => category.id === categoryId).has_stock, 1);

        db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(productId);
        assert.equal(productService.getCategories({ includeInactive: true })
            .find((category) => category.id === categoryId).has_stock, 0);
    } finally {
        db.exec('ROLLBACK');
    }
});

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

    const categoryLabels = labels(adminCategoryMenuKeyboard());
    for (const label of ['➕ Tạo danh mục', '✏️ Đổi tên danh mục', '🙈 Ẩn/hiện danh mục', '🗑 Xóa danh mục']) {
        assert.ok(categoryLabels.includes(label));
    }

    assert.deepEqual(labels(adminSettingsKeyboard()), ['✏️ Sửa thông tin', '↩️ Quản trị']);
});

test('admin settings button updates durable shop information and keeps invalid input editable', async () => {
    const registrations = [];
    let textHandler;
    const bot = {
        action(trigger, handler) { registrations.push({ trigger, handler }); },
        on(type, handler) { if (type === 'text') textHandler = handler; },
        telegram: { sendMessage: async () => {} },
    };
    registerNavigation(bot);

    const editAction = registrations.find(({ trigger }) => trigger === 'nav_admin_edit_shop_info');
    assert.ok(editAction, 'missing shop info edit action');

    const original = {
        adminId: config.ADMIN_ID,
        shopName: config.SHOP_NAME,
        supportContact: config.SUPPORT_CONTACT,
    };
    const session = {};
    const replies = [];
    config.ADMIN_ID = 5487392216;
    db.exec('BEGIN');
    try {
        await editAction.handler({
            from: { id: config.ADMIN_ID },
            session,
            answerCbQuery() {},
            replyWithHTML: (...args) => { replies.push(args); },
        });
        assert.deepEqual(session.navigation, { action: 'edit_shop_info' });
        assert.match(replies[0][0], /Tên shop \| @tai_khoan_ho_tro/);

        await textHandler({
            from: { id: config.ADMIN_ID },
            session,
            message: { text: 'invalid input' },
            reply: (...args) => { replies.push(args); },
        }, () => assert.fail('invalid settings input reached next middleware'));
        assert.deepEqual(session.navigation, { action: 'edit_shop_info' });
        assert.equal(config.SHOP_NAME, original.shopName);

        await textHandler({
            from: { id: config.ADMIN_ID },
            session,
            message: { text: 'Shop & Store | @support_team' },
            reply: (...args) => { replies.push(args); },
            replyWithHTML: (...args) => { replies.push(args); },
        }, () => assert.fail('valid settings input reached next middleware'));
        assert.equal(session.navigation, undefined);
        assert.equal(config.SHOP_NAME, 'Shop & Store');
        assert.equal(config.SUPPORT_CONTACT, '@support_team');
        assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'shop_name'").get().value, 'Shop & Store');
        assert.match(replies.at(-1)[0], /Shop &amp; Store/);

        const nonAdmin = { answers: [] };
        await editAction.handler({
            from: { id: 12345 },
            session: {},
            answerCbQuery: (...args) => { nonAdmin.answers.push(args); },
        });
        assert.equal(nonAdmin.answers[0][0], '⛔');
    } finally {
        db.exec('ROLLBACK');
        config.ADMIN_ID = original.adminId;
        config.SHOP_NAME = original.shopName;
        config.SUPPORT_CONTACT = original.supportContact;
    }
});

test('admin category buttons rename, hide/show and safely delete empty categories', async () => {
    const registrations = [];
    let textHandler;
    const bot = {
        action(trigger, handler) { registrations.push({ trigger, handler }); },
        on(type, handler) { if (type === 'text') textHandler = handler; },
        telegram: { sendMessage: async () => {} },
    };
    registerNavigation(bot);

    function findAction(callback) {
        for (const registration of registrations) {
            if (registration.trigger === callback) return { handler: registration.handler, match: [callback] };
            if (registration.trigger instanceof RegExp) {
                const match = callback.match(registration.trigger);
                if (match) return { handler: registration.handler, match };
            }
        }
        assert.fail(`Missing action handler for ${callback}`);
    }

    function callbackContext(callback, userId = 5487392216, session = {}) {
        const replies = [];
        const answers = [];
        const action = findAction(callback);
        return {
            ctx: {
                from: { id: userId },
                session,
                match: action.match,
                answerCbQuery: (...args) => { answers.push(args); },
                reply: (...args) => { replies.push(args); },
                replyWithHTML: (...args) => { replies.push(args); },
            },
            handler: action.handler,
            replies,
            answers,
        };
    }

    const originalAdminId = config.ADMIN_ID;
    config.ADMIN_ID = 5487392216;
    db.exec('BEGIN');
    try {
        const categoryId = Number(db.prepare(
            'INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)'
        ).run('Category UI test', '📂', 9998).lastInsertRowid);

        const renameSession = {};
        const rename = callbackContext(`nav_category_edit_name_${categoryId}`, config.ADMIN_ID, renameSession);
        await rename.handler(rename.ctx);
        assert.deepEqual(renameSession.navigation, { action: 'edit_category_name', categoryId });

        const renameReplies = [];
        await textHandler({
            from: { id: config.ADMIN_ID },
            session: renameSession,
            message: { text: 'Category renamed & safe' },
            reply: (...args) => { renameReplies.push(args); },
            replyWithHTML: (...args) => { renameReplies.push(args); },
        }, () => assert.fail('rename reached next middleware'));
        assert.equal(productService.getCategoryById(categoryId).name, 'Category renamed & safe');
        assert.match(renameReplies[0][0], /Category renamed &amp; safe/);

        const hide = callbackContext(`nav_category_toggle_${categoryId}`);
        await hide.handler(hide.ctx);
        assert.equal(productService.getCategoryById(categoryId).is_active, 0);
        assert.equal(productService.getCategories().some((item) => item.id === categoryId), false);
        assert.equal(productService.getCategories({ includeInactive: true }).some((item) => item.id === categoryId), true);

        const show = callbackContext(`nav_category_toggle_${categoryId}`);
        await show.handler(show.ctx);
        assert.equal(productService.getCategoryById(categoryId).is_active, 1);

        const productId = Number(db.prepare(
            'INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)'
        ).run(categoryId, 'Protected category product', 1000).lastInsertRowid);
        const blockedDelete = callbackContext(`nav_category_delete_${categoryId}`);
        await blockedDelete.handler(blockedDelete.ctx);
        assert.match(blockedDelete.answers[0][0], /còn 1 sản phẩm/);
        assert.ok(productService.getCategoryById(categoryId));
        db.prepare('DELETE FROM products WHERE id = ?').run(productId);

        const confirmPrompt = callbackContext(`nav_category_delete_${categoryId}`);
        await confirmPrompt.handler(confirmPrompt.ctx);
        assert.match(confirmPrompt.replies[0][0], /Xóa vĩnh viễn/);
        assert.equal(
            confirmPrompt.replies[0][1].reply_markup.inline_keyboard[0][0].callback_data,
            `nav_category_delete_confirm_${categoryId}`
        );

        const nonAdmin = callbackContext(`nav_category_delete_confirm_${categoryId}`, 12345);
        await nonAdmin.handler(nonAdmin.ctx);
        assert.ok(productService.getCategoryById(categoryId));

        const confirmedDelete = callbackContext(`nav_category_delete_confirm_${categoryId}`);
        await confirmedDelete.handler(confirmedDelete.ctx);
        assert.equal(productService.getCategoryById(categoryId), undefined);
    } finally {
        db.exec('ROLLBACK');
        config.ADMIN_ID = originalAdminId;
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
