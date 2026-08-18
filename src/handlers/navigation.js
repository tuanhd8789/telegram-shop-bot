const { Markup } = require('telegraf');
const config = require('../config');
const db = require('../database');
const userService = require('../services/userService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const settingsService = require('../services/settingsService');
const messages = require('../utils/messages');
const { formatPrice, productListKeyboard } = require('../utils/keyboard');
const {
    callbackWithCustomEmoji,
    customEmojiHtml,
    escapeHtml,
    normalizeCustomEmojiId,
} = require('../utils/telegramMarkup');
const productCommand = require('../commands/product');
const topupCommand = require('../commands/nap');
const { START_AI_CHAT_LABEL, STOP_AI_CHAT_LABEL } = require('../commands/ai');

const STOCK_PAGE_SIZE = 10;
const CATEGORY_GRID_COLUMNS = 2;

function isAdmin(ctx) {
    return ctx.from.id === config.ADMIN_ID;
}

const CUSTOMER_REPLY_LABELS = [
    '🛍 Tất cả sản phẩm',
    '🗂 Danh mục',
    '💰 Nạp tiền vào ví',
    '🧾 Đơn hàng',
    '👤 Tài khoản',
    '🆘 Hỗ trợ',
];

const ADMIN_REPLY_LABELS = [
    '🔧 QUẢN TRỊ',
    START_AI_CHAT_LABEL,
    STOP_AI_CHAT_LABEL,
    '📦 Quản lý sản phẩm',
    '🗂 Quản lý danh mục',
    '📥 Thêm tồn kho',
    '👁 Xem tồn kho',
    '🧹 Xóa tồn kho',
    '⏳ Đơn chờ',
    '📋 Tất cả đơn',
    '📊 Thống kê',
    '👥 Người dùng',
    '📣 Broadcast',
    '🔄 Đồng bộ Sheet',
    '⚙️ Cài đặt',
];

function replyMenuKeyboard(admin) {
    const rows = [
        [Markup.button.text('🛍 Tất cả sản phẩm'), Markup.button.text('🗂 Danh mục')],
        [Markup.button.text('💰 Nạp tiền vào ví'), Markup.button.text('🧾 Đơn hàng')],
        [Markup.button.text('👤 Tài khoản'), Markup.button.text('🆘 Hỗ trợ')],
    ];
    if (admin) {
        rows.push(
            [Markup.button.text('🔧 QUẢN TRỊ')],
            [Markup.button.text(START_AI_CHAT_LABEL), Markup.button.text(STOP_AI_CHAT_LABEL)],
            [Markup.button.text('📦 Quản lý sản phẩm'), Markup.button.text('🗂 Quản lý danh mục')],
            [Markup.button.text('📥 Thêm tồn kho'), Markup.button.text('👁 Xem tồn kho')],
            [Markup.button.text('🧹 Xóa tồn kho')],
            [Markup.button.text('⏳ Đơn chờ'), Markup.button.text('📋 Tất cả đơn')],
            [Markup.button.text('📊 Thống kê'), Markup.button.text('👥 Người dùng')],
            [Markup.button.text('📣 Broadcast'), Markup.button.text('🔄 Đồng bộ Sheet')],
            [Markup.button.text('⚙️ Cài đặt')]
        );
    }
    return Markup.keyboard(rows)
        .resize()
        .persistent()
        .placeholder('Chọn chức năng trong menu');
}

function showMainMenu(ctx, text) {
    userService.findOrCreate(ctx.from);
    return ctx.replyWithHTML(
        text || '⌨️ <b>MENU BÀN PHÍM</b>\n\nBấm biểu tượng bàn phím cạnh nút emoji để ẩn/hiện menu.',
        replyMenuKeyboard(isAdmin(ctx))
    );
}

function categoriesKeyboard(categories = productService.getCategories()) {
    const rows = [];
    for (let index = 0; index < categories.length; index += CATEGORY_GRID_COLUMNS) {
        rows.push(categories.slice(index, index + CATEGORY_GRID_COLUMNS).map((category) => {
            const button = callbackWithCustomEmoji(
                category.custom_emoji_id ? category.name : `${category.emoji || '📂'} ${category.name}`,
                `nav_category_${category.id}`,
                category.custom_emoji_id
            );
            button.style = category.has_stock ? 'success' : 'danger';
            return button;
        }));
    }
    rows.push([Markup.button.callback('🔄 Làm mới', 'nav_categories')]);
    rows.push([Markup.button.callback('↩️ Quay lại', 'nav_menu')]);
    return Markup.inlineKeyboard(rows);
}

function adminMenuKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(START_AI_CHAT_LABEL, 'nav_admin_ai_start'),
            Markup.button.callback(STOP_AI_CHAT_LABEL, 'nav_admin_ai_stop'),
        ],
        [Markup.button.callback('📦 Tất cả sản phẩm', 'adm_products'), Markup.button.callback('➕ Tạo sản phẩm', 'nav_admin_add_product')],
        [Markup.button.callback('🗂 Quản lý danh mục', 'nav_admin_category_menu'), Markup.button.callback('➕ Tạo danh mục', 'nav_admin_add_category')],
        [Markup.button.callback('📥 Thêm kho', 'nav_admin_add_stock'), Markup.button.callback('👁 Xem kho', 'nav_admin_view_stock')],
        [Markup.button.callback('⏳ Đơn chờ', 'adm_pending'), Markup.button.callback('📋 Đơn hàng', 'nav_admin_orders')],
        [Markup.button.callback('📊 Thống kê', 'adm_stats'), Markup.button.callback('👥 Người dùng', 'nav_admin_users')],
        [Markup.button.callback('📣 Gửi thông báo', 'nav_admin_broadcast'), Markup.button.callback('🔄 Đồng bộ Sheet', 'adm_sync')],
        [Markup.button.callback('⚙️ Cài đặt', 'nav_admin_settings')],
        [Markup.button.callback('↩️ Menu khách hàng', 'nav_menu')],
    ]);
}

function adminProductMenuKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📦 Tất cả sản phẩm', 'nav_admin_product_list')],
        [Markup.button.callback('➕ Tạo sản phẩm', 'nav_admin_add_product')],
        [Markup.button.callback('💵 Sửa giá', 'nav_admin_edit_price'), Markup.button.callback('✏️ Sửa tên & icon', 'nav_admin_edit_name')],
        [Markup.button.callback('🔁 Bật/tắt', 'nav_admin_toggle_product'), Markup.button.callback('🗑 Xóa', 'nav_admin_delete_product')],
        [Markup.button.callback('↩️ Quản trị', 'nav_admin')],
    ]);
}

function adminCategoryMenuKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tạo danh mục', 'nav_admin_add_category')],
        [Markup.button.callback('✏️ Sửa tên & icon', 'nav_admin_edit_category_name')],
        [Markup.button.callback('🙈 Ẩn/hiện danh mục', 'nav_admin_toggle_category')],
        [Markup.button.callback('🗑 Xóa danh mục', 'nav_admin_delete_category')],
        [Markup.button.callback('🗂 Xem danh mục', 'nav_admin_categories')],
        [Markup.button.callback('↩️ Quản trị', 'nav_admin')],
    ]);
}

function adminSettingsKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Sửa thông tin', 'nav_admin_edit_shop_info')],
        [Markup.button.callback('↩️ Quản trị', 'nav_admin')],
    ]);
}

function showAdminMenu(ctx) {
    if (!isAdmin(ctx)) return ctx.answerCbQuery?.('⛔ Bạn không có quyền.');
    return ctx.replyWithHTML('🔧 <b>QUẢN TRỊ</b>\n\nChọn nghiệp vụ cần thực hiện:', adminMenuKeyboard());
}

function productPicker(prefix, title) {
    const products = db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) stock_count
        FROM products p ORDER BY p.category_id, p.id
    `).all();
    const rows = products.map((product) => [
        Markup.button.callback(`#${product.id} ${product.name}`, `${prefix}_${product.id}`),
    ]);
    rows.push([Markup.button.callback('↩️ Quản trị', 'nav_admin')]);
    return { text: title, keyboard: Markup.inlineKeyboard(rows) };
}

function categoryPicker(prefix, title) {
    const categories = productService.getCategories({ includeInactive: true });
    const rows = categories.map((category) => [
        Markup.button.callback(
            `${category.is_active ? '🟢' : '🙈'} #${category.id} ${category.name} (${category.product_count} SP)`,
            `${prefix}_${category.id}`
        ),
    ]);
    rows.push([Markup.button.callback('↩️ Quản lý danh mục', 'nav_admin_category_menu')]);
    return {
        text: categories.length ? title : '🗂 Chưa có danh mục.',
        keyboard: Markup.inlineKeyboard(rows),
    };
}

function showAdminProductMenu(ctx) {
    return ctx.replyWithHTML('📦 <b>QUẢN LÝ SẢN PHẨM</b>', adminProductMenuKeyboard());
}

function showAdminCategoryMenu(ctx) {
    return ctx.replyWithHTML('🗂 <b>QUẢN LÝ DANH MỤC</b>', adminCategoryMenuKeyboard());
}

function showAdminProductList(ctx) {
    const products = db.prepare(`
        SELECT p.*, c.name category_name,
          (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) stock_count
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.category_id, p.id
    `).all();
    return ctx.replyWithHTML(products.map((item) =>
        `${item.is_active ? '🟢' : '🔴'} <b>#${item.id}</b> ${item.name}\n` +
        `   ${item.category_name || 'Chung'} — ${formatPrice(item.price)} — 📦 ${item.stock_count}`
    ).join('\n') || '📦 Chưa có sản phẩm.');
}

function showCategories(ctx) {
    return ctx.replyWithHTML('🗂 <b>DANH MỤC SẢN PHẨM</b>', categoriesKeyboard());
}

function showCustomerOrders(ctx) {
    const orders = orderService.getRecentByUser(ctx.from.id, 5);
    if (orders.length === 0) return ctx.reply('📋 Bạn chưa có đơn hàng nào.');
    return ctx.replyWithHTML(orders.map(messages.checkPayStatus).join('\n\n━━━━━━━━━━━━━━━━━\n\n'));
}

function showAdminCategories(ctx) {
    const categories = productService.getCategories({ includeInactive: true });
    return ctx.replyWithHTML(categories.map((item) =>
        `${item.is_active ? '🟢' : '🙈'} <b>#${item.id}</b> ${customEmojiHtml(item.custom_emoji_id, item.emoji || '📂')} ${escapeHtml(item.name)}` +
        ` — ${item.product_count} sản phẩm` +
        `${item.image_url ? '\n   🖼 ' + escapeHtml(item.image_url) : ''}`
    ).join('\n') || '🗂 Chưa có danh mục.');
}

function beginAddStock(ctx) {
    const picker = productPicker('nav_stock_add', '📥 Chọn sản phẩm cần thêm kho:');
    return ctx.reply(picker.text, picker.keyboard);
}

function showAdminStock(ctx) {
    const products = productService.getAll();
    if (products.length === 0) return ctx.reply('📦 Chưa có sản phẩm.');
    const rows = products.map((item) => [
        Markup.button.callback(`👁 #${item.id} ${item.name} (${item.stock_count})`, `nav_stock_product_${item.id}`),
    ]);
    rows.push([Markup.button.callback('↩️ Quản trị', 'nav_admin')]);
    return ctx.replyWithHTML(
        '🏪 <b>TỒN KHO</b>\n\nChọn sản phẩm để xem từng stock và thao tác:',
        Markup.inlineKeyboard(rows)
    );
}

function stockItemsKeyboard(items, productId, page = 0, totalPages = 1) {
    const rows = items.map((item) => [
        Markup.button.callback(`👁 #${item.id}`, `nav_stock_item_${item.id}`),
        Markup.button.callback(`✏️ #${item.id}`, `nav_stock_edit_${item.id}`),
        Markup.button.callback(`🗑 #${item.id}`, `nav_stock_delete_${item.id}`),
    ]);
    if (totalPages > 1) {
        const pagination = [];
        if (page > 0) pagination.push(Markup.button.callback('⬅️ Trang trước', `nav_stock_product_${productId}_${page - 1}`));
        if (page + 1 < totalPages) pagination.push(Markup.button.callback('Trang sau ➡️', `nav_stock_product_${productId}_${page + 1}`));
        rows.push(pagination);
    }
    rows.push([Markup.button.callback('↩️ Danh sách sản phẩm', 'nav_admin_view_stock')]);
    if (productId) rows.push([Markup.button.callback('📥 Thêm stock', `nav_stock_add_${productId}`)]);
    return Markup.inlineKeyboard(rows);
}

function showProductStock(ctx, productId, requestedPage = 0) {
    const product = productService.getById(productId);
    if (!product) return ctx.reply('❌ Sản phẩm không tồn tại.');
    const totalPages = Math.max(1, Math.ceil(product.stock_count / STOCK_PAGE_SIZE));
    const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
    const items = productService.getStockItems(productId, STOCK_PAGE_SIZE, page * STOCK_PAGE_SIZE);
    if (items.length === 0) {
        return ctx.replyWithHTML(
            `📦 <b>${escapeHtml(product.name)}</b>\n\nKho chưa bán đang trống.`,
            stockItemsKeyboard(items, product.id, page, totalPages)
        );
    }
    const text = items.map((item) => `<b>#${item.id}</b> <code>${escapeHtml(item.data)}</code>`).join('\n');
    return ctx.replyWithHTML(
        `📦 <b>${escapeHtml(product.name)}</b> — ${product.stock_count} stock chưa bán — trang ${page + 1}/${totalPages}\n\n${text}` +
        '\n\nChọn 👁 xem chi tiết, ✏️ sửa hoặc 🗑 xóa:',
        stockItemsKeyboard(items, product.id, page, totalPages)
    );
}

function showStockItem(ctx, stockId) {
    const item = productService.getStockItem(stockId);
    if (!item) return ctx.reply('❌ Stock không tồn tại.');
    const soldText = item.is_sold
        ? `Đã bán${item.sold_order_id ? ` — đơn #${item.sold_order_id}` : ''}`
        : 'Chưa bán';
    const rows = item.is_sold ? [] : [[
        Markup.button.callback('✏️ Sửa stock', `nav_stock_edit_${item.id}`),
        Markup.button.callback('🗑 Xóa stock', `nav_stock_delete_${item.id}`),
    ]];
    rows.push([Markup.button.callback('↩️ Kho sản phẩm', `nav_stock_product_${item.product_id}`)]);
    return ctx.replyWithHTML(
        `👁 <b>CHI TIẾT STOCK #${item.id}</b>\n\n` +
        `📦 Sản phẩm: <b>${escapeHtml(item.product_name)}</b> (#${item.product_id})\n` +
        `📋 Trạng thái: <b>${soldText}</b>\n` +
        `🔐 Dữ liệu:\n<code>${escapeHtml(item.data)}</code>` +
        (item.is_sold ? '\n\n🔒 Stock đã bán được khóa để bảo toàn lịch sử đơn hàng.' : ''),
        Markup.inlineKeyboard(rows)
    );
}

function showAdminOrders(ctx) {
    const orders = db.prepare(`SELECT o.*, p.name product_name FROM orders o JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 20`).all();
    return ctx.replyWithHTML(orders.map((item) =>
        `<b>#${item.id}</b> ${item.product_name} × ${item.quantity} — ${formatPrice(item.total_price)} — <code>${item.status}</code>`
    ).join('\n') || '📋 Chưa có đơn hàng.');
}

function showPendingOrders(ctx) {
    const orders = orderService.getAllPending();
    if (orders.length === 0) return ctx.reply('✅ Không có đơn hàng chờ.');
    const rows = orders.flatMap((order) => [[
        Markup.button.callback(`✅ Xác nhận #${order.id}`, `admin_confirm_${order.id}`),
        Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`),
    ]]);
    const text = orders.map((order) =>
        `<b>#${order.id}</b> ${order.product_name} × ${order.quantity} — ${formatPrice(order.total_price)}\n<code>${order.payment_code}</code>`
    ).join('\n\n');
    return ctx.replyWithHTML(`⏳ <b>ĐƠN CHỜ THANH TOÁN</b>\n\n${text}`, Markup.inlineKeyboard(rows));
}

function showStats(ctx) {
    const stats = orderService.getStats();
    return ctx.replyWithHTML(
        `📊 <b>THỐNG KÊ</b>\n\n` +
        `👥 Người dùng: <b>${stats.totalUsers}</b>\n` +
        `📦 Đơn hoàn thành: <b>${stats.totalOrders}</b>\n` +
        `💰 Doanh thu: <b>${formatPrice(stats.totalRevenue)}</b>\n` +
        `⏳ Đơn chờ: <b>${stats.pendingOrders}</b>\n` +
        `🏪 Tồn kho: <b>${stats.totalStock}</b>`
    );
}

function showAdminUsers(ctx) {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 20').all();
    return ctx.replyWithHTML(users.map((item) =>
        `<code>${item.telegram_id}</code> ${item.full_name} — ${formatPrice(item.balance)}`
    ).join('\n') || '👥 Chưa có người dùng.');
}

function showAdminSettings(ctx) {
    return ctx.replyWithHTML(
        `⚙️ <b>CÀI ĐẶT</b>\n\n` +
        `🏪 Shop: <b>${escapeHtml(config.SHOP_NAME)}</b>\n` +
        `🏦 Ngân hàng: <b>${escapeHtml(config.BANK.NAME)}</b>\n` +
        `🆘 Hỗ trợ: ${escapeHtml(config.SUPPORT_CONTACT)}`,
        adminSettingsKeyboard()
    );
}

async function runSheetSync(ctx) {
    const { syncFromSheet } = require('../services/sheetSync');
    if (!process.env.GOOGLE_SHEET_ID) return ctx.reply('⚠️ Chưa cấu hình GOOGLE_SHEET_ID.');
    await ctx.reply('🔄 Đang đồng bộ Google Sheet...');
    const result = await syncFromSheet();
    if (!result || result.error) return ctx.reply(`❌ Đồng bộ lỗi: ${result?.error || 'Unknown error'}`);
    return ctx.reply(`✅ Đồng bộ xong: cập nhật ${result.updated}, thêm ${result.added}, tổng ${result.total} sản phẩm.`);
}

function registerNavigation(bot, { aiController } = {}) {
    bot.action('nav_menu', (ctx) => { ctx.answerCbQuery(); return showMainMenu(ctx); });
    bot.action('nav_products', (ctx) => { ctx.answerCbQuery(); return productCommand.sendProductList(ctx); });
    bot.action('nav_categories', (ctx) => {
        ctx.answerCbQuery();
        return showCategories(ctx);
    });
    bot.action(/^nav_category_(\d+)$/, (ctx) => {
        ctx.answerCbQuery();
        const category = productService.getCategories().find((item) => item.id === Number(ctx.match[1]));
        if (!category) return ctx.reply('❌ Danh mục không tồn tại.');
        const products = productService.getByCategory(category.id);
        if (products.length === 0) return ctx.reply('❌ Danh mục này chưa có sản phẩm.');
        const sendProducts = () => ctx.replyWithHTML(
            `${customEmojiHtml(category.custom_emoji_id, category.emoji || '📂')} <b>${escapeHtml(category.name)}</b>`,
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
        return showCustomerOrders(ctx);
    });
    bot.action('nav_support', (ctx) => { ctx.answerCbQuery(); return ctx.replyWithHTML(messages.supportInfo); });
    bot.action('nav_admin', (ctx) => { ctx.answerCbQuery(); return showAdminMenu(ctx); });

    bot.action('nav_admin_product_list', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminProductList(ctx);
    });
    bot.action('nav_admin_edit_price', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = productPicker('nav_edit_price', '💵 Chọn sản phẩm cần sửa giá:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_edit_price_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'edit_product_price', productId: product.id };
        return ctx.replyWithHTML(`💵 Gửi giá mới cho <b>${product.name}</b>.`);
    });
    bot.action('nav_admin_edit_name', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = productPicker('nav_edit_name', '✏️ Chọn sản phẩm cần sửa tên & icon:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_edit_name_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'edit_product_name', productId: product.id };
        return ctx.replyWithHTML(`✏️ Bước 1/2: Gửi tên mới cho <b>${escapeHtml(product.name)}</b>. Gõ /cancel để hủy.`);
    });
    bot.action('nav_admin_toggle_product', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = productPicker('nav_toggle_product', '🔁 Chọn sản phẩm cần bật/tắt:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_toggle_product_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        const active = product.is_active ? 0 : 1;
        db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(active, product.id);
        ctx.answerCbQuery(active ? '🟢 Đã bật' : '🔴 Đã tắt');
        return ctx.replyWithHTML(`${active ? '🟢' : '🔴'} <b>${product.name}</b> đã ${active ? 'bật' : 'tắt'}.`);
    });
    bot.action('nav_admin_delete_product', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = productPicker('nav_delete_product', '🗑 Chọn sản phẩm cần xóa:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_delete_product_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        ctx.answerCbQuery();
        return ctx.replyWithHTML(
            `⚠️ Xóa sản phẩm <b>#${product.id} ${product.name}</b>?`,
            Markup.inlineKeyboard([[
                Markup.button.callback('🗑 Xác nhận xóa', `nav_delete_confirm_${product.id}`),
                Markup.button.callback('❌ Hủy', 'nav_admin'),
            ]])
        );
    });
    bot.action(/^nav_delete_confirm_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const productId = Number(ctx.match[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        const orderCount = db.prepare('SELECT COUNT(*) count FROM orders WHERE product_id = ?').get(productId).count;
        if (orderCount > 0) {
            return ctx.answerCbQuery('Không thể xóa sản phẩm đã có đơn; hãy tắt sản phẩm.', { show_alert: true });
        }
        const remove = db.transaction(() => {
            db.prepare('DELETE FROM stock WHERE product_id = ?').run(productId);
            db.prepare('DELETE FROM products WHERE id = ?').run(productId);
        });
        remove.immediate();
        ctx.answerCbQuery('🗑 Đã xóa');
        return ctx.replyWithHTML(`🗑 Đã xóa <b>${product.name}</b>.`);
    });

    bot.action('nav_admin_category_menu', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminCategoryMenu(ctx);
    });
    bot.action('nav_admin_categories', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminCategories(ctx);
    });
    bot.action('nav_admin_add_category', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'category_name' };
        return ctx.reply('➕ Gửi tên danh mục mới. Gõ /cancel để hủy.');
    });
    bot.action('nav_admin_edit_category_name', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = categoryPicker('nav_category_edit_name', '✏️ Chọn danh mục cần sửa tên & icon:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_category_edit_name_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const category = productService.getCategoryById(Number(ctx.match[1]));
        if (!category) return ctx.answerCbQuery('❌ Danh mục không tồn tại');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'edit_category_name', categoryId: category.id };
        return ctx.replyWithHTML(`✏️ Bước 1/2: Gửi tên mới cho danh mục <b>${escapeHtml(category.name)}</b>. Gõ /cancel để hủy.`);
    });
    bot.action('nav_admin_toggle_category', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = categoryPicker('nav_category_toggle', '🙈 Chọn danh mục cần ẩn/hiện:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_category_toggle_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const category = productService.getCategoryById(Number(ctx.match[1]));
        if (!category) return ctx.answerCbQuery('❌ Danh mục không tồn tại');
        const active = category.is_active ? 0 : 1;
        const result = db.prepare('UPDATE categories SET is_active = ? WHERE id = ? AND is_active = ?')
            .run(active, category.id, category.is_active);
        if (result.changes !== 1) return ctx.answerCbQuery('❌ Danh mục đã thay đổi, vui lòng tải lại', { show_alert: true });
        ctx.answerCbQuery(active ? '🟢 Đã hiện danh mục' : '🙈 Đã ẩn danh mục');
        return ctx.replyWithHTML(
            `${active ? '🟢 Đã hiện' : '🙈 Đã ẩn'} danh mục <b>${escapeHtml(category.name)}</b>.` +
            (active ? '' : '\nSản phẩm và lịch sử đơn hàng vẫn được giữ nguyên.'),
            Markup.inlineKeyboard([[Markup.button.callback('↩️ Quản lý danh mục', 'nav_admin_category_menu')]])
        );
    });
    bot.action('nav_admin_delete_category', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const picker = categoryPicker('nav_category_delete', '🗑 Chọn danh mục rỗng cần xóa:');
        return ctx.reply(picker.text, picker.keyboard);
    });
    bot.action(/^nav_category_delete_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const category = productService.getCategoryById(Number(ctx.match[1]));
        if (!category) return ctx.answerCbQuery('❌ Danh mục không tồn tại');
        if (category.product_count > 0) {
            return ctx.answerCbQuery(
                `Danh mục còn ${category.product_count} sản phẩm. Hãy ẩn danh mục hoặc chuyển/xóa sản phẩm trước.`,
                { show_alert: true }
            );
        }
        ctx.answerCbQuery();
        return ctx.replyWithHTML(
            `⚠️ Xóa vĩnh viễn danh mục <b>#${category.id} ${escapeHtml(category.name)}</b>?`,
            Markup.inlineKeyboard([[
                Markup.button.callback('🗑 Xác nhận xóa', `nav_category_delete_confirm_${category.id}`),
                Markup.button.callback('❌ Hủy', 'nav_admin_category_menu'),
            ]])
        );
    });
    bot.action(/^nav_category_delete_confirm_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const category = productService.getCategoryById(Number(ctx.match[1]));
        if (!category) return ctx.answerCbQuery('❌ Danh mục không tồn tại');
        const result = db.prepare(`
            DELETE FROM categories
            WHERE id = ? AND NOT EXISTS (SELECT 1 FROM products WHERE category_id = ?)
        `).run(category.id, category.id);
        if (result.changes !== 1) {
            return ctx.answerCbQuery('Không thể xóa: danh mục vừa có sản phẩm hoặc đã thay đổi.', { show_alert: true });
        }
        ctx.answerCbQuery('🗑 Đã xóa danh mục');
        return ctx.replyWithHTML(
            `🗑 Đã xóa danh mục <b>${escapeHtml(category.name)}</b>.`,
            Markup.inlineKeyboard([[Markup.button.callback('↩️ Quản lý danh mục', 'nav_admin_category_menu')]])
        );
    });
    bot.action('nav_admin_add_product', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const rows = productService.getCategories().map((item) => [
            callbackWithCustomEmoji(
                item.custom_emoji_id ? item.name : `${item.emoji || '📂'} ${item.name}`,
                `nav_product_category_${item.id}`,
                item.custom_emoji_id
            ),
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
        return beginAddStock(ctx);
    });
    bot.action(/^nav_stock_add_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại.');
        ctx.session.navigation = { action: 'stock_data', productId: product.id };
        return ctx.replyWithHTML(`📥 Gửi dữ liệu kho cho <b>${product.name}</b>, mỗi mặt hàng một dòng.`);
    });
    bot.action(/^nav_clear_stock_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const product = productService.getById(Number(ctx.match[1]));
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        ctx.answerCbQuery();
        return ctx.replyWithHTML(
            `⚠️ Xóa toàn bộ tồn kho chưa bán của <b>${product.name}</b>?`,
            Markup.inlineKeyboard([[
                Markup.button.callback('🧹 Xác nhận xóa kho', `nav_clear_stock_confirm_${product.id}`),
                Markup.button.callback('❌ Hủy', 'nav_admin'),
            ]])
        );
    });
    bot.action(/^nav_clear_stock_confirm_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const productId = Number(ctx.match[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        const result = db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(productId);
        ctx.answerCbQuery('🧹 Đã xóa kho');
        return ctx.replyWithHTML(`🧹 Đã xóa <b>${result.changes}</b> mặt hàng chưa bán khỏi <b>${product.name}</b>.`);
    });
    bot.action('nav_admin_view_stock', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminStock(ctx);
    });
    bot.action(/^nav_stock_product_(\d+)(?:_(\d+))?$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showProductStock(ctx, Number(ctx.match[1]), Number(ctx.match[2] || 0));
    });
    bot.action(/^nav_stock_item_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showStockItem(ctx, Number(ctx.match[1]));
    });
    bot.action(/^nav_stock_edit_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const item = productService.getStockItem(Number(ctx.match[1]));
        if (!item) return ctx.answerCbQuery('❌ Stock không tồn tại');
        if (item.is_sold) return ctx.answerCbQuery('🔒 Không thể sửa stock đã bán', { show_alert: true });
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'edit_stock', stockId: item.id, productId: item.product_id };
        return ctx.replyWithHTML(
            `✏️ Gửi dữ liệu mới cho stock <b>#${item.id}</b>.\n\nHiện tại:\n<code>${escapeHtml(item.data)}</code>\n\nGõ /cancel để hủy.`
        );
    });
    bot.action(/^nav_stock_delete_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const item = productService.getStockItem(Number(ctx.match[1]));
        if (!item) return ctx.answerCbQuery('❌ Stock không tồn tại');
        if (item.is_sold) return ctx.answerCbQuery('🔒 Không thể xóa stock đã bán', { show_alert: true });
        ctx.answerCbQuery();
        return ctx.replyWithHTML(
            `⚠️ Xóa stock <b>#${item.id}</b> của <b>${escapeHtml(item.product_name)}</b>?\n\n<code>${escapeHtml(item.data)}</code>`,
            Markup.inlineKeyboard([[
                Markup.button.callback('🗑 Xác nhận xóa', `nav_stock_delete_confirm_${item.id}`),
                Markup.button.callback('❌ Hủy', `nav_stock_item_${item.id}`),
            ]])
        );
    });
    bot.action(/^nav_stock_delete_confirm_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        const item = productService.getStockItem(Number(ctx.match[1]));
        if (!item) return ctx.answerCbQuery('❌ Stock không tồn tại');
        if (item.is_sold) return ctx.answerCbQuery('🔒 Không thể xóa stock đã bán', { show_alert: true });
        const result = productService.deleteStockItem(item.id);
        if (result.changes !== 1) return ctx.answerCbQuery('❌ Stock đã thay đổi, vui lòng tải lại', { show_alert: true });
        ctx.answerCbQuery('🗑 Đã xóa stock');
        return ctx.replyWithHTML(
            `🗑 Đã xóa stock <b>#${item.id}</b>.`,
            Markup.inlineKeyboard([[Markup.button.callback('↩️ Kho sản phẩm', `nav_stock_product_${item.product_id}`)]])
        );
    });
    bot.action('nav_admin_orders', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminOrders(ctx);
    });
    bot.action('nav_admin_users', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return showAdminUsers(ctx);
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
        return showAdminSettings(ctx);
    });
    bot.action('nav_admin_edit_shop_info', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        ctx.session.navigation = { action: 'edit_shop_info' };
        return ctx.replyWithHTML(
            `✏️ <b>SỬA THÔNG TIN SHOP</b>\n\n` +
            `Hiện tại: <b>${escapeHtml(config.SHOP_NAME)}</b> | ${escapeHtml(config.SUPPORT_CONTACT)}\n\n` +
            `Gửi thông tin mới theo đúng mẫu một dòng:\n` +
            `<code>Tên shop | @tai_khoan_ho_tro</code>\n\n` +
            `Nút này không sửa thông tin ngân hàng hoặc secret. Gõ /cancel để hủy.`
        );
    });
    bot.action('nav_admin_ai_start', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return aiController?.startChat(ctx) || ctx.reply('⚠️ Trợ lý AI chưa sẵn sàng.');
    });
    bot.action('nav_admin_ai_stop', (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔');
        ctx.answerCbQuery();
        return aiController?.stopChat(ctx) || ctx.reply('⚠️ Trợ lý AI chưa sẵn sàng.');
    });

    bot.on('text', async (ctx, next) => {
        const text = ctx.message.text.trim();
        const customerActions = {
            '🛍 Tất cả sản phẩm': () => productCommand.sendProductList(ctx),
            '🗂 Danh mục': () => showCategories(ctx),
            '💰 Nạp tiền vào ví': () => topupCommand.showTopupOptions(ctx),
            '🧾 Đơn hàng': () => showCustomerOrders(ctx),
            '👤 Tài khoản': () => ctx.replyWithHTML(messages.accountInfo(userService.findOrCreate(ctx.from))),
            '🆘 Hỗ trợ': () => ctx.replyWithHTML(messages.supportInfo),
        };
        const adminActions = {
            '🔧 QUẢN TRỊ': () => showAdminMenu(ctx),
            [START_AI_CHAT_LABEL]: () => aiController?.startChat(ctx) || ctx.reply('⚠️ Trợ lý AI chưa sẵn sàng.'),
            [STOP_AI_CHAT_LABEL]: () => aiController?.stopChat(ctx) || ctx.reply('⚠️ Trợ lý AI chưa sẵn sàng.'),
            '📦 Quản lý sản phẩm': () => showAdminProductMenu(ctx),
            '🗂 Quản lý danh mục': () => showAdminCategoryMenu(ctx),
            '📥 Thêm tồn kho': () => beginAddStock(ctx),
            '👁 Xem tồn kho': () => showAdminStock(ctx),
            '🧹 Xóa tồn kho': () => {
                const picker = productPicker('nav_clear_stock', '🧹 Chọn sản phẩm cần xóa tồn kho chưa bán:');
                return ctx.reply(picker.text, picker.keyboard);
            },
            '⏳ Đơn chờ': () => showPendingOrders(ctx),
            '📋 Tất cả đơn': () => showAdminOrders(ctx),
            '📊 Thống kê': () => showStats(ctx),
            '👥 Người dùng': () => showAdminUsers(ctx),
            '📣 Broadcast': () => {
                ctx.session.navigation = { action: 'broadcast' };
                return ctx.reply('📣 Gửi nội dung cần phát tới toàn bộ khách hàng.');
            },
            '🔄 Đồng bộ Sheet': () => runSheetSync(ctx),
            '⚙️ Cài đặt': () => showAdminSettings(ctx),
        };
        if (customerActions[text]) {
            delete ctx.session.navigation;
            return customerActions[text]();
        }
        if (adminActions[text]) {
            if (!isAdmin(ctx)) return ctx.reply('⛔ Bạn không có quyền sử dụng chức năng quản trị.');
            delete ctx.session.navigation;
            return adminActions[text]();
        }

        const state = ctx.session.navigation;
        if (!state || !isAdmin(ctx)) return next();
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
            return ctx.replyWithHTML(
                `✅ Đã tạo danh mục <b>#${result.lastInsertRowid}</b>: ${emoji} ${escapeHtml(state.name.slice(0, 100))}`,
                Markup.inlineKeyboard([[Markup.button.callback('↩️ Quản lý danh mục', 'nav_admin_category_menu')]])
            );
        }
        if (state.action === 'edit_category_name') {
            const category = productService.getCategoryById(state.categoryId);
            if (!category) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Danh mục không tồn tại.');
            }
            const name = text.slice(0, 100);
            if (!name) return ctx.reply('❌ Tên danh mục không được để trống.');
            ctx.session.navigation = { action: 'edit_category_custom_emoji', categoryId: category.id, name };
            return ctx.reply('🖼 Bước 2/2: Gửi ID custom emoji bằng số. Gửi dấu - để bỏ icon.');
        }
        if (state.action === 'edit_category_custom_emoji') {
            const category = productService.getCategoryById(state.categoryId);
            if (!category) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Danh mục không tồn tại.');
            }
            const customEmojiId = text === '-' ? null : normalizeCustomEmojiId(text);
            if (text !== '-' && !customEmojiId) {
                return ctx.reply('❌ ID custom emoji phải chỉ gồm chữ số. Gửi lại hoặc gửi dấu - để bỏ icon.');
            }
            const result = db.prepare('UPDATE categories SET name = ?, custom_emoji_id = ? WHERE id = ?')
                .run(state.name, customEmojiId, category.id);
            delete ctx.session.navigation;
            if (result.changes !== 1) return ctx.reply('❌ Không thể sửa danh mục; vui lòng tải lại.');
            return ctx.replyWithHTML(
                `✅ Đã sửa danh mục <b>${escapeHtml(category.name)}</b> → ` +
                `<b>${escapeHtml(state.name)}</b>. Icon: ${customEmojiId ? `<code>${customEmojiId}</code>` : 'không dùng'}.`,
                Markup.inlineKeyboard([[Markup.button.callback('↩️ Quản lý danh mục', 'nav_admin_category_menu')]])
            );
        }
        if (state.action === 'edit_shop_info') {
            try {
                const updated = settingsService.updateFromInput(text);
                delete ctx.session.navigation;
                return ctx.replyWithHTML(
                    `✅ Đã cập nhật thông tin shop.\n\n` +
                    `🏪 Shop: <b>${escapeHtml(updated.shopName)}</b>\n` +
                    `🆘 Hỗ trợ: ${escapeHtml(updated.supportContact)}`,
                    adminSettingsKeyboard()
                );
            } catch (error) {
                if (!(error instanceof settingsService.SettingsError)) throw error;
                return ctx.reply(`❌ ${error.message}\nGõ /cancel để hủy hoặc gửi lại.`);
            }
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
        if (state.action === 'edit_product_price') {
            const price = Number(text.replaceAll('.', '').replaceAll(',', ''));
            if (!Number.isSafeInteger(price) || price <= 0) return ctx.reply('❌ Giá không hợp lệ, hãy gửi lại bằng số.');
            const product = productService.getById(state.productId);
            if (!product) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Sản phẩm không tồn tại.');
            }
            db.prepare('UPDATE products SET price = ? WHERE id = ?').run(price, product.id);
            delete ctx.session.navigation;
            return ctx.replyWithHTML(`✅ Đã đổi giá <b>${product.name}</b>: ${formatPrice(product.price)} → <b>${formatPrice(price)}</b>.`);
        }
        if (state.action === 'edit_product_name') {
            const product = productService.getById(state.productId);
            if (!product) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Sản phẩm không tồn tại.');
            }
            const name = text.slice(0, 200);
            if (!name) return ctx.reply('❌ Tên sản phẩm không được để trống.');
            ctx.session.navigation = { action: 'edit_product_custom_emoji', productId: product.id, name };
            return ctx.reply('🖼 Bước 2/2: Gửi ID custom emoji bằng số. Gửi dấu - để bỏ icon.');
        }
        if (state.action === 'edit_product_custom_emoji') {
            const product = productService.getById(state.productId);
            if (!product) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Sản phẩm không tồn tại.');
            }
            const customEmojiId = text === '-' ? null : normalizeCustomEmojiId(text);
            if (text !== '-' && !customEmojiId) {
                return ctx.reply('❌ ID custom emoji phải chỉ gồm chữ số. Gửi lại hoặc gửi dấu - để bỏ icon.');
            }
            const result = db.prepare('UPDATE products SET name = ?, custom_emoji_id = ? WHERE id = ?')
                .run(state.name, customEmojiId, product.id);
            delete ctx.session.navigation;
            if (result.changes !== 1) return ctx.reply('❌ Không thể sửa sản phẩm; vui lòng tải lại.');
            return ctx.replyWithHTML(
                `✅ Đã sửa sản phẩm <b>${escapeHtml(product.name)}</b> → ` +
                `<b>${escapeHtml(state.name)}</b>. Icon: ${customEmojiId ? `<code>${customEmojiId}</code>` : 'không dùng'}.`
            );
        }
        if (state.action === 'stock_data') {
            const lines = text.split('\n').filter((line) => line.trim());
            productService.addStock(state.productId, lines);
            delete ctx.session.navigation;
            return ctx.reply(`✅ Đã thêm ${lines.length} mặt hàng vào kho.`);
        }
        if (state.action === 'edit_stock') {
            const item = productService.getStockItem(state.stockId);
            if (!item || item.is_sold) {
                delete ctx.session.navigation;
                return ctx.reply('❌ Stock không tồn tại hoặc đã được bán.');
            }
            const data = text.trim();
            if (!data) return ctx.reply('❌ Dữ liệu stock không được để trống.');
            const result = productService.updateStockItem(item.id, data);
            delete ctx.session.navigation;
            if (result.changes !== 1) return ctx.reply('❌ Không thể cập nhật stock; vui lòng tải lại.');
            return ctx.replyWithHTML(
                `✅ Đã cập nhật stock <b>#${item.id}</b>.\n\n<code>${escapeHtml(data)}</code>`,
                Markup.inlineKeyboard([[Markup.button.callback('👁 Xem chi tiết', `nav_stock_item_${item.id}`)]])
            );
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

module.exports = {
    registerNavigation,
    showMainMenu,
    replyMenuKeyboard,
    adminMenuKeyboard,
    categoriesKeyboard,
    adminProductMenuKeyboard,
    adminCategoryMenuKeyboard,
    adminSettingsKeyboard,
    showAdminStock,
    showProductStock,
    showStockItem,
    stockItemsKeyboard,
    CUSTOMER_REPLY_LABELS,
    ADMIN_REPLY_LABELS,
};
