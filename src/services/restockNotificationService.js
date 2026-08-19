const { Markup } = require('telegraf');
const { customEmojiHtml, escapeHtml } = require('../utils/telegramMarkup');

function getNotifiableProduct(db, productId) {
    return db.prepare(`
        SELECT p.*,
          CASE
            WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
            THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
            ELSE COALESCE(p.sheet_stock, 0)
          END display_stock
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE p.id = ?
          AND p.is_active = 1
          AND (c.id IS NULL OR c.is_active = 1)
          AND (parent.id IS NULL OR parent.is_active = 1)
    `).get(productId);
}

function restockMessage(product) {
    return `🆕 <b>HÀNG MỚI VỀ</b>\n\n` +
        `${customEmojiHtml(product.custom_emoji_id, product.emoji || '📦')} <b>${escapeHtml(product.name)}</b>\n` +
        `📦 Số lượng tồn kho hiện tại: <b>${product.display_stock}</b>`;
}

function restockKeyboard(productId) {
    return Markup.inlineKeyboard([[
        Markup.button.callback('👁 Xem sản phẩm', `product_${productId}`),
        Markup.button.callback('🛒 Mua ngay', `qty_${productId}_1`),
    ]]);
}

function createRestockNotificationService({ db, telegram, logger = console }) {
    async function sendProduct(chatId, product) {
        await telegram.sendMessage(chatId, restockMessage(product), {
            parse_mode: 'HTML',
            ...restockKeyboard(product.id),
        });
    }

    async function notifyIfRestocked(productId, previousStock) {
        const product = getNotifiableProduct(db, productId);
        if (Number(previousStock) > 0 || !product || product.display_stock <= 0) {
            return { triggered: false, total: 0, sent: 0, failed: 0 };
        }

        const users = db.prepare('SELECT telegram_id FROM users ORDER BY telegram_id').all();
        let sent = 0;
        let failed = 0;

        for (const user of users) {
            try {
                await sendProduct(user.telegram_id, product);
                sent += 1;
            } catch (error) {
                failed += 1;
                logger.warn?.(`⚠️ Restock notification failed for one subscriber: ${error.message}`);
            }
        }

        logger.log?.(`📣 Restock notification #${product.id}: ${sent}/${users.length} sent`);
        return { triggered: true, total: users.length, sent, failed, product };
    }

    async function sendTest(productId, chatId) {
        const product = getNotifiableProduct(db, productId);
        if (!product) throw new Error('Sản phẩm không tồn tại hoặc đang bị ẩn.');
        await sendProduct(chatId, product);
        return product;
    }

    return { notifyIfRestocked, sendTest };
}

module.exports = {
    createRestockNotificationService,
    getNotifiableProduct,
    restockKeyboard,
    restockMessage,
};
