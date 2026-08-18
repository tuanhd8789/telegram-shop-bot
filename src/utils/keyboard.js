const { Markup } = require('telegraf');
const { callbackWithCustomEmoji } = require('./telegramMarkup');

/**
 * Build product list keyboard
 */
function productListKeyboard(products) {
    const buttons = products.map((p) => {
        const stock = p.display_stock ?? p.stock_count ?? 0;
        const stockLabel = p.contact_only && stock === 0 ? 'Liên hệ' : stock;
        let label = `${formatPrice(p.price)} | ${stockLabel} | ${p.name}`;

        if (p.promotion) {
            label += ` | ${p.promotion}`;
        }

        const button = callbackWithCustomEmoji(label, `product_${p.id}`, p.custom_emoji_id);
        if (!p.contact_only && stock === 0) button.style = 'danger';
        return [button];
    });

    buttons.push([Markup.button.callback('🔄 Làm mới', 'refresh_products')]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Build quantity selection keyboard
 */
function quantityKeyboard(productId, maxQty = 10) {
    const max = Math.min(maxQty, 10);
    const rows = [];
    let row = [];

    for (let i = 1; i <= max; i++) {
        row.push(Markup.button.callback(`${i}`, `qty_${productId}_${i}`));
        if (row.length === 5) {
            rows.push(row);
            row = [];
        }
    }
    if (row.length > 0) rows.push(row);

    rows.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

    return Markup.inlineKeyboard(rows);
}

/**
 * Build order confirmation keyboard
 */
function orderConfirmKeyboard(orderId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✅ Đã thanh toán', `check_paid_${orderId}`)],
        [Markup.button.callback('❌ Hủy đơn', `cancel_order_${orderId}`)],
    ]);
}

/**
 * Build post-delivery keyboard
 */
function postDeliveryKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 Data chính', 'data_main'),
            Markup.button.callback('🔄 Mua lại', 'buy_again'),
        ],
        [Markup.button.callback('📋 Quay lại danh sách', 'refresh_products')],
    ]);
}

/**
 * Format price in VND
 */
function formatPrice(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Main menu keyboard (reply keyboard)
 */
function mainMenuKeyboard() {
    return Markup.keyboard([
        ['📦 Sản phẩm', '💰 Nạp tiền'],
        ['🔍 Kiểm tra thanh toán', '👤 Tài khoản'],
        ['🆘 Hỗ trợ'],
    ]).resize();
}

module.exports = {
    productListKeyboard,
    quantityKeyboard,
    orderConfirmKeyboard,
    postDeliveryKeyboard,
    formatPrice,
    mainMenuKeyboard,
};
