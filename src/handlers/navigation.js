const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../database');
const userService = require('../services/userService');
const productService = require('../services/productService');
const messages = require('../utils/messages');
const { formatPrice, productListKeyboard } = require('../utils/keyboard');
const productCommand = require('../commands/product');
const topupCommand = require('../commands/nap');

function isAdmin(ctx) {
    return ctx.from.id === config.ADMIN_ID;
}

function mainMenuKeyboard(admin) {
    const rows = [
        [Markup.button.callback('🛍 Tất cả sản phẩm', 'nav_products'), Markup.button.callback('🗂 Danh mục', 'nav_categories')],
        [Markup.button.callback('💰 Nạp tiền vào ví', 'nav_topup'), Markup.button.callback('🧾 Đơn hàng', 'nav_orders')],
        [Markup.button.callback('👤 Tài khoản', 'nav_account'), Markup.button.callback('🆘 Hỗ trợ', 'nav_support')],
    ];
    if (admin) rows.push([Markup.button.callback('🔧 Quản trị', 'nav_admin')]);
    return Markup.inlineKeyboard(rows);
}

function showMainMenu(ctx) {
    userService.findOrCreate(ctx.from);
    const adminText = isAdmin(ctx) ? '\n\n🔧 <b>QUẢN TRỊ</b> — chỉ tài khoản admin thấy nút bên dưới.' : '';
    return ctx.replyWithHTML(
        `👤 <b>KHÁCH HÀNG</b>\nChọn thao tác bên dưới, không cần gõ lệnh.${adminText}`,
        mainMenuKeyboard(isAdmin(ctx))
    );
}

function categoriesKeyboard() {
    const rows = productService.getCategories().map((category) => [
        Markup.button.callback(`${category.emoji || '📂'} ${category.name}`, `nav_category_${category.id}`),
    ]);
    rows.push([Markup.button.callback('📦 Tất cả sản phẩm', 'nav_products')]);
    rows.push([Markup.button.callback('↩️ Menu', 'nav_menu')]);
    return Markup.inlineKeyboard(rows);
}

function adminMenuKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📦 Tất cả sản phẩm', 'adm_products'), Markup.button.callback('➕ Tạo sản phẩm', 'nav_admin_add_product')],
        [Markup.button.callback('🗂 Danh mục', 'nav_admin_categories'), Markup.button.callback('➕ Tạo danh mục', 'nav_admin_add_category')],
        [Markup.button.callback('📥 Thêm kho', 'nav_admin_add_stock'), Markup.button.callback('👁 Xem kho', 'nav_admin_view_stock')],
        [Markup.button.callback('⏳ Đơn chờ', 'adm_pending'), Markup.button.callback('📋 Đơn hàng', 'nav_admin_orders')],
        [Markup.button.callback('📊 Thống kê', 'adm_stats'), Markup.button.callback('👥 Người dùng', 'nav_admin_users')],
        [Markup.button.callback('📣 Gửi thông báo', 'nav_admin_broadcast'), Markup.button.callback('🔄 Đồng bộ Sheet', 'adm_sync')],
        [Markup.button.callback('⚙️ Cài đặt', 'nav_admin_settings')],
        [Markup.button.callback('↩️ Menu khách hàng', 'nav_menu')],
    ]);
}

function showAdminMenu(ctx) {
    if (!isAdmin(ctx)) return ctx.answerCbQuery?.('⛔ Bạn không có quyền.');
    return ctx.replyWithHTML('🔧 <b>QUẢN TRỊ</b>\n\nChọn nghiệp vụ cần thực hiện:', adminMenuKeyboard());
}

function productPicker(prefix, title) {
    const products = productService.getAll();
    const rows = products.map((product) => [
        Markup.button.callback(`#${product.id} ${product.name}`, `${prefix}_${product.id}`),
    ]);
    rows.push([Markup.button.callback('↩️ Quản trị', 'nav_admin')]);
    return { text: title, keyboard: Markup.inlineKeyboard(rows) };
}

function registerNavigation(bot) {
    bot.action('nav_menu', (ctx) => { ctx.answerCbQuery(); return showMainMenu(ctx); });
    bot.action('nav_products', (ctx) => { ctx.answerCbQuery(); return productCommand.sendProductList(ctx); });
    bot.action('nav_categories', (ctx) => {
        ctx.answerCbQuery();
        return ctx.replyWithHTML('🗂 <b>DANH MỤC SẢN PHẨM</b>', categoriesKeyboard());
    });
    bot.action(/^nav_category_(\d+)$/, (ctx) => {
        ctx.answerCbQuery();
        const category = productService.getCategories().find((item) => item.id === Number(ctx.match[1]));
        if (!category) return ctx.reply('❌ Danh mục không tồn tại.');
        const products = productService.getByCategory(category.id);
        if (products.length === 0) return ctx.reply('❌ Danh mục này chưa có sản phẩm.');
        const sendProducts = () => ctx.replyWithHTML(
            `${category.emoji || '📂'} <b>${category.name}</b>`,
            productListKeyboard(products)
        );
        if (category.image_url) {
            return ctx.replyWithPhoto(category.image_url, { caption: `${category.emoji || '📂'} ${category.name}` })
                .then(sendProducts)
                .catch(sendProducts);
        }
        return sendProducts();
    });
    bot.action('nav_topup', (ctx) => { ctx.answerCbQuery(); return topupCommand.showTopupOptions(ctx); });
    bot.action('nav_account', (ctx) => {
        ctx.answerCbQuery();
        return ctx.replyWithHTML(messages.accountInfo(userService.findOrCreate(ctx.from)));
    });
    bot.action('nav_orders', (ctx) => {
        ctx.answerCbQuery();
        const orders = require('../services/orderService').getRecentByUser(ctx.from.id, 5);
        if (orders.length === 0) return ctx.reply('📋 Bạn chưa có đơn hàng nào.');
        return ctx.replyWithHTML(orders.map(messages.checkPayStatus).join('\n\n━━━━━━━━━━━━━━━━━\n\n'));
    });
    bot.action('nav_support', (ctx) => { ctx.answerCbQuery(); return ctx.replyWithHTML(messages.supportInfo); });
    bot.action('nav_admin', (ctx) => { ctx.answerCbQuery(); return showAdminMenu(ctx); });

    bot.action('nav_admin_categories', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const categories = productService.getCategories();
        return ctx.replyWithHTML(categories.map((item) =>
            `<b>#${item.id}</b> ${item.emoji || '📂'} ${item.name}${item.image_url ? '\n   🖼 ' + item.image_url : ''}`
        ).join('\n'));
    });
    bot.action('nav_admin_add_category', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'category_name' };
        return ctx.reply('➕ Gửi tên danh mục mới. Gõ /cancel để hủy.');
    });
    bot.action('nav_admin_add_product', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const rows = productService.getCategories().map((item) => [
            Markup.button.callback(`${item.emoji || '📂'} ${item.name}`, `nav_product_category_${item.id}`),
        ]);
        return ctx.replyWithHTML('➕ <b>TẠO SẢN PHẨM</b>\n\nChọn danh mục:', Markup.inlineKeyboard(rows));
    });
    bot.action(/^nav_product_category_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'product_name', categoryId: Number(ctx.match[1]) };
        return ctx.reply('✍️ Gửi tên sản phẩm. Có thể ghi các phiên bản chung trong tên, ví dụ: AutoCAD LT 2D 1 năm (2024, 2025, 2026, 2027).');
    });
    bot.action('nav_admin_add_stock', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = productPicker('nav_stock_add', '📥 Chọn sản phẩm cần thêm kho:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_stock_add_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại.');
        ctx.session.navigation = { action: 'stock_data', productId: product.id };
        return ctx.replyWithHTML(`📥 Gửi dữ liệu kho cho <b>${product.name}</b>, mỗi mặt hàng một dòng.`);
    });
    bot.action('nav_admin_view_stock', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const products = productService.getAll();
        return ctx.replyWithHTML(products.map((item) =>
            `<b>#${item.id}</b> ${item.name} — 📦 ${item.stock_count}`
        ).join('\n') || '📦 Kho trống.');
    });
    bot.action('nav_admin_orders', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const orders = db.prepare(`SELECT o.*, p.name product_name FROM orders o JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 20`).all();
        return ctx.replyWithHTML(orders.map((item) =>
            `<b>#${item.id}</b> ${item.product_name} × ${item.quantity} — ${formatPrice(item.total_price)} — <code>${item.status}</code>`
        ).join('\n') || '📋 Chưa có đơn hàng.');
    });
    bot.action('nav_admin_users', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 20').all();
        return ctx.replyWithHTML(users.map((item) =>
            `<code>${item.telegram_id}</code> ${item.full_name} — ${formatPrice(item.balance)}`
        ).join('\n') || '👥 Chưa có người dùng.');
    });
    bot.action('nav_admin_broadcast', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'broadcast' };
        return ctx.reply('📣 Gửi nội dung cần phát tới toàn bộ khách hàng.');
    });
    bot.action('nav_admin_settings', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return ctx.replyWithHTML(
            `⚙️ <b>CÀI ĐẶT</b>\n\n🏪 Shop: <b>${config.SHOP_NAME}</b>\n🏦 Ngân hàng: <b>${config.BANK.NAME}</b>\n🆘 Hỗ trợ: ${config.SUPPORT_CONTACT}`
        );
    });

    bot.on('text', async (ctx, next) => {
        const state = ctx.session.navigation;
        if (!state || !isAdmin(ctx)) return next();
        const text = ctx.message.text.trim();
        if (text === '/cancel') {
            delete ctx.session.navigation;
            return ctx.reply('❌ Đã hủy thao tác.');
        }
        if (state.action === 'category_name') {
            ctx.session.navigation = { action: 'category_icon', name: text };
            return ctx.reply('🖼 Gửi một emoji hoặc đường dẫn ảnh công khai PNG/JPG. Gửi dấu - để dùng 📦 mặc định.');
        }
        if (state.action === 'category_icon') {
            const isUrl = /^https:\/\//i.test(text);
            const emoji = text === '-' || isUrl ? '📦' : Array.from(text)[0];
            const imageUrl = isUrl ? text : null;
            const sortOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 value FROM categories').get().value;
            const result = db.prepare('INSERT INTO categories (name, emoji, sort_order, image_url) VALUES (?, ?, ?, ?)')
                .run(state.name.slice(0, 100), emoji, sortOrder, imageUrl);
            delete ctx.session.navigation;
            return ctx.replyWithHTML(`✅ Đã tạo danh mục <b>#${result.lastInsertRowid}</b>: ${emoji} ${state.name}`);
        }
        if (state.action === 'product_name') {
            ctx.session.navigation = { ...state, action: 'product_price', name: text };
            return ctx.reply('💵 Gửi giá bán bằng số, ví dụ: 300000.');
        }
        if (state.action === 'product_price') {
            const price = Number(text.replaceAll('.', '').replaceAll(',', ''));
            if (!Number.isSafeInteger(price) || price <= 0) return ctx.reply('❌ Giá không hợp lệ, hãy gửi lại bằng số.');
            const id = productService.addProduct(state.categoryId, state.name.slice(0, 200), price);
            delete ctx.session.navigation;
            return ctx.replyWithHTML(`✅ Đã tạo sản phẩm <b>#${id}</b>: ${state.name} — ${formatPrice(price)}`);
        }
        if (state.action === 'stock_data') {
            const lines = text.split('\n').filter((line) => line.trim());
            productService.addStock(state.productId, lines);
            delete ctx.session.navigation;
            return ctx.reply(`✅ Đã thêm ${lines.length} mặt hàng vào kho.`);
        }
        if (state.action === 'broadcast') {
            delete ctx.session.navigation;
            const users = db.prepare('SELECT telegram_id FROM users').all();
            const results = await Promise.allSettled(users.map((user) => bot.telegram.sendMessage(user.telegram_id, text)));
            const sent = results.filter((item) => item.status === 'fulfilled').length;
            return ctx.reply(`📣 Đã gửi thành công ${sent}/${users.length} người dùng.`);
        }
        return next();
    });
}

module.exports = { registerNavigation, showMainMenu, mainMenuKeyboard, adminMenuKeyboard };
