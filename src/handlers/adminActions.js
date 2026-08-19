const config = require('../config');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const { deliverOrder } = require('./paymentConfirm');
const { formatPrice } = require('../utils/keyboard');
const { customEmojiHtml, escapeHtml } = require('../utils/telegramMarkup');
const { showAdminStock, showProductStock } = require('./navigation');
const settingsService = require('../services/settingsService');
const { Markup } = require('telegraf');
const db = require('../database');
const { allocateOrderStock } = require('../services/fulfillmentService');

// Admin state per user (for multi-step flows)
const adminState = {};

function isAdmin(ctx) {
    return ctx.from.id === config.ADMIN_ID;
}

function adminOnly(ctx, next) {
    if (!isAdmin(ctx)) {
        return ctx.replyWithHTML('⛔ Bạn không có quyền sử dụng lệnh này.');
    }
    return next();
}

module.exports = (bot) => {

    function beginManualDelivery(ctx, order, product) {
        adminState[ctx.from.id] = {
            action: 'deliver_order',
            orderId: order.id,
            userId: order.user_id,
            productName: product.name,
            quantity: order.quantity,
        };
        return ctx.replyWithHTML(
            `📝 <b>GIAO HÀNG THỦ CÔNG — Đơn #${order.id}</b>\n\n` +
            `📦 SP: <b>${product.name}</b>\n` +
            `📊 SL: ${order.quantity}\n\n` +
            `👇 Gửi nội dung sản phẩm ngay bây giờ, mỗi sản phẩm một dòng.\n` +
            `Có thể thêm lời nhắn riêng sau dấu <code>||</code>.\n` +
            `Bot sẽ lưu job và tự retry nếu Telegram tạm lỗi.\n\n` +
            `Gõ /cancel để hủy.`
        );
    }

    // ═══════════════════════════════════════
    // /admin - Admin Panel (Main Menu)
    // ═══════════════════════════════════════
    bot.command('admin', adminOnly, (ctx) => {
        const stats = orderService.getStats();
        ctx.replyWithHTML(
            `🔧 <b>ADMIN PANEL — ${escapeHtml(config.SHOP_NAME)}</b>\n\n` +
            `📊 <b>Thống kê nhanh:</b>\n` +
            `├ 👥 Users: ${stats.totalUsers}\n` +
            `├ 📦 Đơn hoàn thành: ${stats.totalOrders}\n` +
            `├ 💰 Doanh thu: ${formatPrice(stats.totalRevenue)}\n` +
            `├ ⏳ Đơn chờ: ${stats.pendingOrders}\n` +
            `└ 🏪 Tồn kho: ${stats.totalStock}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📦 <b>QUẢN LÝ SẢN PHẨM:</b>\n` +
            `/listproduct — Xem tất cả sản phẩm\n` +
            `/addproduct — Thêm sản phẩm mới\n` +
            `/editprice [ID] [giá] — Sửa giá\n` +
            `/editname [ID] [tên] — Sửa tên\n` +
            `/toggleproduct [ID] — Bật/tắt sản phẩm\n` +
            `/deleteproduct [ID] — Xóa sản phẩm\n\n` +
            `📋 <b>QUẢN LÝ KHO:</b>\n` +
            `/addstock [ID] — Thêm tài khoản vào kho\n` +
            `/viewstock [ID] — Xem, sửa hoặc xóa từng stock\n` +
            `/clearstock [ID] — Xóa toàn bộ kho (chưa bán)\n\n` +
            `💰 <b>ĐƠN HÀNG & THANH TOÁN:</b>\n` +
            `/pending — Xem đơn chờ thanh toán\n` +
            `/confirm [orderID] — Xác nhận & giao hàng\n` +
            `/cancelorder [orderID] — Hủy đơn\n` +
            `/orders — Xem tất cả đơn hàng\n\n` +
            `🏦 <b>CÀI ĐẶT:</b>\n` +
            `/setbank — Xem thông tin ngân hàng\n` +
            `/setshop — Xem/sửa thông tin shop\n\n` +
            `📊 <b>GOOGLE SHEET & KHÁC:</b>\n` +
            `/sync — 🔄 Đồng bộ sản phẩm từ Google Sheet\n` +
            `/stats — Thống kê chi tiết\n` +
            `/users — Xem danh sách users\n` +
            `/broadcast — Gửi thông báo tới all users`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 Sản phẩm', 'adm_products'), Markup.button.callback('⏳ Đơn chờ', 'adm_pending')],
                [Markup.button.callback('🔄 Sync Sheet', 'adm_sync'), Markup.button.callback('📊 Thống kê', 'adm_stats')],
            ])
        );
    });

    // Admin button callbacks
    bot.action('adm_products', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showProductList(ctx); } });
    bot.action('adm_pending', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showPending(ctx); } });
    bot.action('adm_stats', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showStats(ctx); } });
    bot.action('adm_sync', async (ctx) => {
        if (!isAdmin(ctx)) return;
        ctx.answerCbQuery('🔄 Đang sync...');
        await runSync(ctx);
    });

    // /sync - Manual sync from Google Sheet
    bot.command('sync', adminOnly, async (ctx) => {
        await runSync(ctx);
    });

    async function runSync(ctx) {
        const { syncFromSheet, SYNC_INTERVAL } = require('../services/sheetSync');
        if (!process.env.GOOGLE_SHEET_ID) {
            return ctx.replyWithHTML(
                `❌ <b>Chưa cài đặt Google Sheet!</b>\n\n` +
                `Thêm <code>GOOGLE_SHEET_ID</code> vào file .env\n\n` +
                `📋 Hướng dẫn:\n` +
                `1. Mở Google Sheet\n` +
                `2. File → Chia sẻ → Xuất bản lên web → Xuất bản\n` +
                `3. Copy Sheet ID từ URL:\n` +
                `   <code>docs.google.com/spreadsheets/d/<b>[SHEET_ID]</b>/edit</code>\n` +
                `4. Thêm vào .env:\n` +
                `   <code>GOOGLE_SHEET_ID=your_sheet_id</code>\n` +
                `5. Restart bot`
            );
        }

        await ctx.replyWithHTML('🔄 Đang đồng bộ từ Google Sheet...');
        const result = await syncFromSheet();

        if (result && !result.error) {
            ctx.replyWithHTML(
                `✅ <b>Đồng bộ thành công!</b>\n\n` +
                `├ ✏️ Đã cập nhật: ${result.updated} sản phẩm\n` +
                `├ ➕ Đã thêm mới: ${result.added} sản phẩm\n` +
                `└ 📊 Tổng: ${result.total} sản phẩm\n\n` +
                `🔄 Tự động sync mỗi ${SYNC_INTERVAL} phút`
            );
        } else {
            ctx.replyWithHTML(`❌ Lỗi sync: ${result?.error || 'Unknown error'}\n\n💡 Kiểm tra Sheet đã "Xuất bản lên web" chưa.`);
        }
    }

    // ═══════════════════════════════════════
    // QUẢN LÝ SẢN PHẨM
    // ═══════════════════════════════════════

    // /listproduct - List all products with IDs
    bot.command('listproduct', adminOnly, (ctx) => {
        showProductList(ctx);
    });

    // /addproduct - Add new product (interactive)
    bot.command('addproduct', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/addproduct', '').trim();
        const parts = argsText.split('|').map((s) => s.trim());

        if (parts.length < 3 || !parts[0]) {
            const categories = productService.getCategories();
            let catList = categories.map((c) => `  ${c.id}. ${c.emoji} ${c.name}`).join('\n');
            return ctx.replyWithHTML(
                `➕ <b>THÊM SẢN PHẨM</b>\n\n` +
                `Cách dùng:\n` +
                `<code>/addproduct catID | tên | giá</code>\n\n` +
                `Ví dụ:\n` +
                `<code>/addproduct 1 | ChatGPT Plus 3 tháng | 20000</code>\n\n` +
                `📂 <b>Danh mục:</b>\n${catList}\n\n` +
                `💡 Thêm danh mục: <code>/addcategory tên | emoji</code>`
            );
        }

        const [catId, name, priceStr] = parts;
        const price = parseInt(priceStr);
        if (isNaN(price)) return ctx.reply('❌ Giá phải là số.');

        const id = productService.addProduct(parseInt(catId), name, price);
        ctx.replyWithHTML(
            `✅ Đã thêm sản phẩm:\n` +
            `├ ID: <b>#${id}</b>\n` +
            `├ Tên: ${name}\n` +
            `├ Giá: ${formatPrice(price)}\n` +
            `└ Danh mục: #${catId}\n\n` +
            `👉 Thêm kho: <code>/addstock ${id}</code>`
        );
    });

    // /addcategory - Add new category
    bot.command('addcategory', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/addcategory', '').trim();
        const parts = argsText.split('|').map((s) => s.trim());

        if (parts.length < 1 || !parts[0]) {
            return ctx.replyWithHTML('Cách dùng: <code>/addcategory tên | emoji</code>\nVí dụ: <code>/addcategory Netflix | 🎬</code>');
        }

        const name = parts[0];
        const emoji = parts[1] || '📦';
        const db = require('../database');
        const result = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)').run(name, emoji, 99);
        ctx.replyWithHTML(`✅ Đã thêm danh mục #${result.lastInsertRowid}: ${emoji} ${name}`);
    });

    // /editprice [ID] [price] - Edit product price
    bot.command('editprice', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) {
            return ctx.replyWithHTML('Cách dùng: <code>/editprice [productID] [giá mới]</code>\nVí dụ: <code>/editprice 1 10000</code>');
        }

        const productId = parseInt(args[1]);
        const newPrice = parseInt(args[2]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, productId);
        ctx.replyWithHTML(
            `✅ Đã cập nhật giá:\n` +
            `├ Sản phẩm: ${product.name}\n` +
            `├ Giá cũ: ${formatPrice(product.price)}\n` +
            `└ Giá mới: <b>${formatPrice(newPrice)}</b>`
        );
    });

    // /editname [ID] [name] - Edit product name
    bot.command('editname', adminOnly, (ctx) => {
        const match = ctx.message.text.match(/^\/editname\s+(\d+)\s+(.+)$/);
        if (!match) {
            return ctx.replyWithHTML('Cách dùng: <code>/editname [productID] [tên mới]</code>\nVí dụ: <code>/editname 1 ChatGPT Plus 1 tháng mới</code>');
        }

        const productId = parseInt(match[1]);
        const newName = match[2].trim();
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        db.prepare('UPDATE products SET name = ? WHERE id = ?').run(newName, productId);
        ctx.replyWithHTML(
            `✅ Đã đổi tên:\n` +
            `├ Cũ: ${product.name}\n` +
            `└ Mới: <b>${newName}</b>`
        );
    });

    // /toggleproduct [ID] - Toggle product active/inactive
    bot.command('toggleproduct', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/toggleproduct [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const newState = product.is_active ? 0 : 1;
        const db = require('../database');
        db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(newState, productId);
        ctx.replyWithHTML(
            `✅ Sản phẩm <b>${product.name}</b>: ${newState ? '🟢 Đã BẬT' : '🔴 Đã TẮT'}`
        );
    });

    // /deleteproduct [ID] - Delete product
    bot.command('deleteproduct', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/deleteproduct [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(productId);
        db.prepare('DELETE FROM products WHERE id = ?').run(productId);
        ctx.replyWithHTML(`🗑️ Đã xóa sản phẩm: <b>${product.name}</b>`);
    });

    // ═══════════════════════════════════════
    // QUẢN LÝ KHO
    // ═══════════════════════════════════════

    // /addstock [ID] - Add stock items
    bot.command('addstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            // List products so admin can see IDs
            const products = productService.getAll();
            let list = products.map((p) => `  #${p.id} ${p.name} (kho: ${p.stock_count})`).join('\n');
            return ctx.replyWithHTML(
                `📦 <b>THÊM NỘI DUNG SẢN PHẨM VÀO KHO</b>\n\n` +
                `Cách dùng: <code>/addstock [productID]</code>\n\n` +
                `Sau đó gửi nội dung admin soạn sẵn để giao cho khách (mỗi sản phẩm một dòng).\n\n` +
                `📋 <b>Sản phẩm:</b>\n${list}`
            );
        }

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        // Set admin waiting state
        adminState[ctx.from.id] = { action: 'addstock', productId };
        ctx.replyWithHTML(
            `📦 Thêm nội dung giao hàng cho: <b>${product.name}</b>\n` +
            `📊 Kho hiện tại: ${product.stock_count}\n\n` +
            `👇 Gửi nội dung admin soạn sẵn (mỗi sản phẩm một dòng). Có thể thêm lời nhắn riêng sau dấu <code>||</code>:\n\n` +
            `<i>Ví dụ:</i>\n` +
            `<code>Mã: ABC-123 || Link tải: https://example.com và hướng dẫn cài đặt</code>\n\n` +
            `Gõ /cancel để hủy.`
        );
    });

    // /viewstock [ID] - View stock details
    bot.command('viewstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            return showAdminStock(ctx);
        }

        const productId = parseInt(args[1]);
        if (!Number.isSafeInteger(productId)) return ctx.reply('❌ Product ID không hợp lệ.');
        return showProductStock(ctx, productId);
    });

    // /clearstock [ID] - Clear unsold stock
    bot.command('clearstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/clearstock [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        const result = db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(productId);
        ctx.replyWithHTML(`🗑️ Đã xóa <b>${result.changes}</b> tài khoản chưa bán khỏi <b>${product.name}</b>`);
    });

    // ═══════════════════════════════════════
    // ĐƠN HÀNG
    // ═══════════════════════════════════════

    // /confirm {orderID}
    bot.command('confirm', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('Cách dùng: /confirm [orderID]');

        const orderId = parseInt(args[1]);
        const order = orderService.getById(orderId);
        if (!order) return ctx.reply('❌ Đơn hàng không tồn tại');

        if (order.combo_id) {
            if (!['pending', 'paid'].includes(order.status)) {
                return ctx.replyWithHTML(`❌ Đơn <b>#${orderId}</b> đã ở trạng thái <code>${order.status}</code>.`);
            }
            const allocation = allocateOrderStock(db, order);
            if (!allocation.success) {
                return ctx.replyWithHTML(
                    `❌ Combo không còn đủ thành phần; tối đa <b>${allocation.available}</b> lượt mua. ` +
                    `Bổ sung tồn kho rồi xác nhận lại; combo không hỗ trợ giao thủ công.`
                );
            }
            const result = await deliverOrder(bot, orderId);
            return ctx.replyWithHTML(result.success
                ? `✅ Đơn combo <b>#${orderId}</b> đã xác nhận & giao hàng thành công!`
                : `❌ Lỗi: ${result.error}`);
        }

        if (order.status === 'paid') {
            const deliveryJob = orderService.getDeliveryJob(orderId);
            if (deliveryJob) {
                return ctx.replyWithHTML(
                    `ℹ️ Đơn <b>#${orderId}</b> đã có job giao hàng trạng thái <code>${deliveryJob.status}</code>.`
                );
            }
            return beginManualDelivery(ctx, order, productService.getById(order.product_id));
        }
        if (order.status !== 'pending') {
            return ctx.replyWithHTML(`❌ Đơn <b>#${orderId}</b> đã ở trạng thái <code>${order.status}</code>.`);
        }

        const stock = productService.getAvailableStock(order.product_id, order.quantity);
        if (stock.length < order.quantity) {
            const paid = orderService.markPaid(orderId);
            if (!paid.success) return ctx.replyWithHTML(`❌ Lỗi: ${paid.error}`);
            return beginManualDelivery(ctx, order, productService.getById(order.product_id));
        }

        const result = await deliverOrder(bot, orderId);

        if (result.success) {
            ctx.replyWithHTML(`✅ Đơn <b>#${orderId}</b> đã xác nhận & giao hàng thành công!`);
        } else {
            ctx.replyWithHTML(`❌ Lỗi: ${result.error}`);
        }
    });

    // /pending - View pending orders
    bot.command('pending', adminOnly, (ctx) => {
        showPending(ctx);
    });

    // /cancelorder [ID]
    bot.command('cancelorder', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/cancelorder [orderID]</code>');

        const orderId = parseInt(args[1]);
        orderService.cancel(orderId);
        ctx.replyWithHTML(`❌ Đã hủy đơn hàng <b>#${orderId}</b>`);
    });

    // /orders - View all orders
    bot.command('orders', adminOnly, (ctx) => {
        const db = require('../database');
        const orders = db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      JOIN users u ON o.user_id = u.telegram_id
      ORDER BY o.created_at DESC
      LIMIT 20
    `).all();

        if (orders.length === 0) return ctx.reply('📋 Chưa có đơn hàng nào.');

        let text = `📋 <b>ĐƠN HÀNG GẦN ĐÂY (${orders.length})</b>\n\n`;
        const statusEmoji = { pending: '⏳', paid: '💵', delivered: '✅', cancelled: '❌' };
        orders.forEach((o) => {
            text += `${statusEmoji[o.status] || '❓'} <b>#${o.id}</b> | ${o.user_name}\n`;
            text += `  ${o.product_name} × ${o.quantity} = ${formatPrice(o.total_price)}\n`;
            text += `  📅 ${o.created_at}\n\n`;
        });

        ctx.replyWithHTML(text);
    });

    // ═══════════════════════════════════════
    // CÀI ĐẶT THANH TOÁN / SHOP
    // ═══════════════════════════════════════

    // /setbank - View bank info (fixed to Techcombank)
    bot.command('setbank', adminOnly, (ctx) => {
        ctx.replyWithHTML(
            `🏦 <b>THÔNG TIN NGÂN HÀNG</b>\n\n` +
            `├ Ngân hàng: <b>${config.BANK.NAME}</b>\n` +
            `├ BIN: <code>${config.BANK.BIN}</code>\n` +
            `├ Số TK: <code>${config.BANK.ACCOUNT}</code>\n` +
            `└ Chủ TK: <b>${config.BANK.ACCOUNT_NAME}</b>\n\n` +
            `✅ QR VietQR thanh toán sử dụng thông tin trên.`
        );
    });

    // /setshop - Edit shop name & support
    bot.command('setshop', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/setshop', '').trim();

        if (!argsText) {
            return ctx.replyWithHTML(
                `🏪 <b>THÔNG TIN SHOP</b>\n\n` +
                `├ Tên: <b>${escapeHtml(config.SHOP_NAME)}</b>\n` +
                `└ Hỗ trợ: ${escapeHtml(config.SUPPORT_CONTACT)}\n\n` +
                `✏️ Để sửa:\n` +
                `<code>/setshop tên shop | @contact_hỗ_trợ</code>`
            );
        }

        try {
            const updated = settingsService.updateFromInput(argsText);
            return ctx.replyWithHTML(
                `✅ Đã cập nhật:\n` +
                `├ Shop: <b>${escapeHtml(updated.shopName)}</b>\n` +
                `└ Hỗ trợ: ${escapeHtml(updated.supportContact)}`
            );
        } catch (error) {
            if (!(error instanceof settingsService.SettingsError)) throw error;
            return ctx.reply(`❌ ${error.message}`);
        }
    });

    // ═══════════════════════════════════════
    // THỐNG KÊ & USERS
    // ═══════════════════════════════════════

    // /stats - Detailed stats
    bot.command('stats', adminOnly, (ctx) => {
        showStats(ctx);
    });

    // /users - List users
    bot.command('users', adminOnly, (ctx) => {
        const db = require('../database');
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 20').all();

        let text = `👥 <b>USERS GẦN ĐÂY (${users.length})</b>\n\n`;
        users.forEach((u) => {
            text += `🆔 <code>${u.telegram_id}</code> | ${u.full_name}`;
            if (u.username) text += ` (@${u.username})`;
            text += `\n  💰 ${formatPrice(u.balance)} | 📅 ${u.created_at}\n\n`;
        });

        ctx.replyWithHTML(text);
    });

    // /broadcast - Send message to all users
    bot.command('broadcast', adminOnly, (ctx) => {
        const msg = ctx.message.text.replace('/broadcast', '').trim();

        if (!msg) {
            adminState[ctx.from.id] = { action: 'broadcast' };
            return ctx.replyWithHTML(
                `📢 <b>GỬI THÔNG BÁO</b>\n\n` +
                `Gửi nội dung thông báo ngay bây giờ.\n` +
                `Hỗ trợ HTML formatting.\n\n` +
                `Gõ /cancel để hủy.`
            );
        }

        sendBroadcast(ctx, bot, msg);
    });

    // /cancel - Cancel current admin action
    bot.command('cancel', (ctx) => {
        if (adminState[ctx.from.id]) {
            delete adminState[ctx.from.id];
            ctx.reply('❌ Đã hủy thao tác.');
        }
    });

    // ═══════════════════════════════════════
    // TEXT HANDLER - for multi-step admin flows
    // ═══════════════════════════════════════
    bot.on('text', async (ctx, next) => {
        if (!isAdmin(ctx)) return next();

        const state = adminState[ctx.from.id];
        if (!state) return next();

        // Handle addstock text input
        if (state.action === 'addstock') {
            delete adminState[ctx.from.id];

            const lines = ctx.message.text.split('\n').filter((l) => l.trim());
            if (lines.length === 0) return ctx.reply('❌ Không có dữ liệu.');

            productService.addStock(state.productId, lines);
            const product = productService.getById(state.productId);

            ctx.replyWithHTML(
                `✅ <b>Đã thêm ${lines.length} nội dung sản phẩm!</b>\n\n` +
                `├ Sản phẩm: ${product.name}\n` +
                `└ 📦 Tồn kho: <b>${product.stock_count}</b>`
            );
            return;
        }

        // Handle broadcast text input
        if (state.action === 'broadcast') {
            delete adminState[ctx.from.id];
            sendBroadcast(ctx, bot, ctx.message.text);
            return;
        }

        // Handle manual delivery: admin provides account info
        if (state.action === 'deliver_order') {
            delete adminState[ctx.from.id];

            const accountData = ctx.message.text.trim();
            const accounts = accountData.split('\n').filter((l) => l.trim());
            const queued = orderService.queueManualDelivery(state.orderId, accounts);
            if (!queued.success) {
                adminState[ctx.from.id] = state;
                return ctx.replyWithHTML(
                    `❌ Không thể xếp job giao hàng: ${queued.error}\n` +
                    `Hãy gửi lại đúng dữ liệu hoặc gõ /cancel.`
                );
            }
            ctx.replyWithHTML(
                `✅ <b>Đã xếp hàng giao đơn #${state.orderId}</b>\n\n` +
                `Bot sẽ gửi cho khách và tự retry nếu Telegram tạm lỗi. Trạng thái đơn chuyển sang <code>delivered</code> sau khi gửi thành công.`
            );
            return;
        }

        return next();
    });

    // ═══════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════

    function showProductList(ctx) {
        const db = require('../database');
        const products = db.prepare(`
      SELECT p.id as product_id, p.name, p.price, p.emoji, p.promotion, p.contact_only, p.is_active, p.category_id,
        c.name as cat_name, c.emoji as cat_emoji, c.custom_emoji_id as cat_custom_emoji_id,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.category_id, p.id
    `).all();

        if (products.length === 0) return ctx.reply('❌ Chưa có sản phẩm nào.');

        let text = `📦 <b>TẤT CẢ SẢN PHẨM</b>\n\n`;
        let currentCat = null;

        products.forEach((p) => {
            if (p.category_id !== currentCat) {
                currentCat = p.category_id;
                text += `\n${customEmojiHtml(p.cat_custom_emoji_id, p.cat_emoji || '📂')} <b>${escapeHtml(p.cat_name || 'Chung')}</b>\n`;
            }

            const status = p.is_active ? '🟢' : '🔴';
            text += `${status} <b>ID:${p.product_id}</b> | ${escapeHtml(p.name)}\n`;
            text += `     💰 ${formatPrice(p.price)} | 📦 Kho: ${p.stock_count}`;
            if (p.contact_only) text += ` | 💬 Liên hệ`;
            if (p.promotion) text += ` | ${p.promotion}`;
            text += `\n`;
        });

        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `💡 Dùng ID ở trên cho các lệnh:\n`;
        text += `/addstock [ID] | /editprice [ID] [giá]\n`;
        text += `/editname [ID] [tên] | /viewstock [ID]`;

        ctx.replyWithHTML(text);
    }

    function showPending(ctx) {
        const orders = orderService.getAllPending();
        if (orders.length === 0) return ctx.reply('✅ Không có đơn hàng chờ!');

        let text = `⏳ <b>ĐƠN CHỜ THANH TOÁN (${orders.length})</b>\n\n`;
        orders.forEach((o) => {
            text +=
                `📌 <b>#${o.id}</b> | ${o.user_name}\n` +
                `  📦 ${o.product_name} × ${o.quantity}\n` +
                `  💰 ${formatPrice(o.total_price)}\n` +
                `  🔑 <code>${o.payment_code}</code>\n` +
                `  📅 ${o.created_at}\n` +
                `  → <code>/confirm ${o.id}</code>\n\n`;
        });

        ctx.replyWithHTML(text);
    }

    function showStats(ctx) {
        const stats = orderService.getStats();
        const db = require('../database');
        const todayOrders = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total_price),0) as s FROM orders WHERE status='delivered' AND date(delivered_at)=date('now')").get();

        ctx.replyWithHTML(
            `📊 <b>THỐNG KÊ CHI TIẾT</b>\n\n` +
            `<b>Tổng quan:</b>\n` +
            `├ 👥 Users: ${stats.totalUsers}\n` +
            `├ 📦 Đơn hoàn thành: ${stats.totalOrders}\n` +
            `├ 💰 Tổng doanh thu: ${formatPrice(stats.totalRevenue)}\n` +
            `├ ⏳ Đơn chờ: ${stats.pendingOrders}\n` +
            `└ 🏪 Tồn kho: ${stats.totalStock}\n\n` +
            `<b>Hôm nay:</b>\n` +
            `├ 📦 Đơn: ${todayOrders.c}\n` +
            `└ 💰 Doanh thu: ${formatPrice(todayOrders.s)}`
        );
    }

    function showBank(ctx) {
        ctx.replyWithHTML(
            `🏦 <b>THÔNG TIN NGÂN HÀNG</b>\n\n` +
            `├ Ngân hàng: <b>${config.BANK.NAME}</b>\n` +
            `├ BIN: <code>${config.BANK.BIN}</code>\n` +
            `├ Số TK: <code>${config.BANK.ACCOUNT}</code>\n` +
            `└ Chủ TK: <b>${config.BANK.ACCOUNT_NAME}</b>\n\n` +
            `✏️ Sửa: <code>/setbank BIN | SốTK | TênCTK | TênNH</code>`
        );
    }

    async function sendBroadcast(ctx, bot, message) {
        const db = require('../database');
        const users = db.prepare('SELECT telegram_id FROM users').all();

        let sent = 0;
        let failed = 0;

        await ctx.reply(`📢 Đang gửi tới ${users.length} users...`);

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
                sent++;
            } catch (err) {
                failed++;
            }
        }

        ctx.replyWithHTML(`📢 <b>Đã gửi xong!</b>\n├ ✅ Thành công: ${sent}\n└ ❌ Thất bại: ${failed}`);
    }
};

// Export setAdminState so other handlers can set admin state
module.exports.setAdminState = (userId, state) => {
    adminState[userId] = state;
};
