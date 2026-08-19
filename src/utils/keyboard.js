const { Markup } = require('telegraf');
const { callbackWithCustomEmoji } = require('./telegramMarkup');

/**
 * Build product list keyboard
 */
function productListKeyboard(products, {
    refreshCallback = 'refresh_products',
    backCallback = 'nav_menu',
} = {}) {
    const buttons = products.map((p) => {
        const stock = p.display_stock ?? p.stock_count ?? 0;
        const stockLabel = p.contact_only && stock === 0 ? 'Liên hệ' : stock;
        let label = `${formatCompactPrice(p.price)} | ${stockLabel} | ${p.name}`;

        if (p.promotion) {
            label += ` | ${p.promotion}`;
        }

        const button = callbackWithCustomEmoji(label, `product_${p.id}`, p.custom_emoji_id);
        if (!p.contact_only && stock === 0) button.style = 'danger';
        return [button];
    });

    buttons.push([
        Markup.button.callback('🔄 Làm mới', refreshCallback),
        Markup.button.callback('↩️ Quay lại', backCallback),
    ]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * Build quantity selection keyboard
 */
function quantityKeyboard(productId, maxQty = 10) {
    return itemQuantityKeyboard('qty', productId, maxQty);
}

function itemQuantityKeyboard(prefix, itemId, maxQty = 10) {
    const max = Math.min(maxQty, 10);
    const rows = [];
    let row = [];

    for (let i = 1; i <= max; i++) {
        row.push(Markup.button.callback(`${i}`, `${prefix}_${itemId}_${i}`));
        if (row.length === 5) {
            rows.push(row);
            row = [];
        }
    }
    if (row.length > 0) rows.push(row);

    rows.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

    return Markup.inlineKeyboard(rows);
}

function comboListKeyboard(combos, { refreshCallback = 'nav_combos', backCallback = 'nav_categories' } = {}) {
    const rows = combos.map((combo) => {
        const button = callbackWithCustomEmoji(
            `${formatCompactPrice(combo.price)} | ${combo.display_stock} | ${combo.name}`,
            `combo_${combo.id}`,
            combo.custom_emoji_id
        );
        if (combo.display_stock === 0) button.style = 'danger';
        return [button];
    });
    rows.push([
        Markup.button.callback('🔄 Làm mới', refreshCallback),
        Markup.button.callback('↩️ Quay lại', backCallback),
    ]);
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
 * Format product-list prices without losing sub-thousand precision.
 */
function formatCompactPrice(amount) {
    const value = Number(amount);

    if (!Number.isFinite(value) || value < 1000 || value % 1000 !== 0) {
        return formatPrice(amount);
    }

    if (value >= 1000000) {
        const millions = new Intl.NumberFormat('vi-VN', {
            maximumFractionDigits: 3,
        }).format(value / 1000000);
        return `${millions} triệu`;
    }

    return `${value / 1000}k`;
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
    itemQuantityKeyboard,
    comboListKeyboard,
    orderConfirmKeyboard,
    postDeliveryKeyboard,
    formatPrice,
    formatCompactPrice,
    mainMenuKeyboard,
};
