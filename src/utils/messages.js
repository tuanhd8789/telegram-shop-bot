const config = require('../config');
const settingsService = require('../services/settingsService');
const { formatPrice } = require('./keyboard');
const { escapeHtml } = require('./telegramMarkup');

function renderEditableContent(value, variables = {}) {
    let rendered = escapeHtml(value);
    for (const [key, replacement] of Object.entries(variables)) {
        rendered = rendered.replaceAll(`{${key}}`, escapeHtml(replacement));
    }
    return rendered;
}

const messages = {
    welcome: (name) => {
        const variables = { name, shop: config.SHOP_NAME, support: config.SUPPORT_CONTACT };
        return `${renderEditableContent(settingsService.getContent('welcome'), variables)}\n\n` +
            `${renderEditableContent(settingsService.getContent('introduction'), variables)}\n\n` +
            `Bấm biểu tượng <b>bàn phím cạnh nút emoji</b> để mở menu mua hàng, nạp ví hoặc quản trị mà không cần gõ lệnh.`;
    },

    accountInfo: (user) =>
        `👤 <b>Thông tin tài khoản</b>\n\n` +
        `🆔 ID: <code>${user.telegram_id}</code>\n` +
        `👤 Tên: ${user.full_name}\n` +
        `💰 Số dư: <b>${formatPrice(user.balance)}</b>\n` +
        `📅 Tham gia: ${user.created_at}`,

    productHeader:
        '👇 👇 👇  Chọn sản phẩm bạn muốn mua bên dưới:',

    selectQuantity: (product) =>
        `📦 <b>${escapeHtml(product.name)}</b>\n` +
        `💰 Giá: ${formatPrice(product.price)}/cái\n` +
        `📊 Còn lại: ${product.display_stock || product.stock_count} sản phẩm\n\n` +
        (product.public_description ? `📝 ${escapeHtml(product.public_description)}\n\n` : '') +
        `Chọn số lượng muốn mua:`,

    contactOnly: (product) =>
        `📦 <b>${escapeHtml(product.name)}</b>\n\n` +
        `💰 Giá: ${formatPrice(product.price)}\n` +
        (product.promotion ? `📋 ${escapeHtml(product.promotion)}\n` : '') +
        (product.public_description ? `📝 ${escapeHtml(product.public_description)}\n\n` : '') +
        `Liên hệ mua ở phía dưới để mình nâng nha các tình yêu\n\n` +
        `💬 Sản phẩm này cần liên hệ trực tiếp để mua.\n` +
        `Bấm nút bên dưới để xem thông tin liên hệ.`,

    paymentQR: (order, product, paymentCode) =>
        `⏳ <b>Đang chờ thanh toán ${formatPrice(order.total_price)}...</b>\n\n` +
        `Quét mã QR phía trên để chuyển khoản.\n\n` +
        `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
        `📦 Sản phẩm: ${product.name}\n` +
        `📊 Số lượng: ${order.quantity}\n` +
        `💵 Tổng tiền: <b>${formatPrice(order.total_price)}</b>\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n` +
        `🏦 Quét mã QR để chuyển khoản\n` +
        `├ Số tiền: <b>${formatPrice(order.total_price)}</b>\n` +
        `└ Nội dung CK: <code>${paymentCode}</code>`,

    orderSuccess: (product, quantity, items) => {
        let msg =
            `✅ <b>ĐƠN HÀNG THÀNH CÔNG!</b>\n\n` +
            `📦 ${escapeHtml(product.name)} × ${quantity}\n\n` +
            `🔑 <b>Thông tin sản phẩm:</b>\n`;

        items.forEach((item, i) => {
            const normalized = typeof item === 'string' ? { data: item } : item;
            msg += `${i + 1})${normalized.productName ? ` <b>${escapeHtml(normalized.productName)}</b>` : ''}\n${escapeHtml(normalized.data)}\n`;
            if (normalized.buyerMessage) {
                msg += `💬 <b>Lời nhắn riêng:</b>\n${escapeHtml(normalized.buyerMessage)}\n`;
            }
        });

        msg += `\nLiên hệ với lệnh /hotro để được hỗ trợ ngay.`;

        return msg;
    },

    orderSuccessNotify: (quantity) =>
        `✅ Đã mua thành công ${quantity} sản phẩm! Kiểm tra tin nhắn bên dưới.`,

    noStock:
        '❌ Rất tiếc, sản phẩm đã hết hàng. Vui lòng thử lại sau.',

    invalidQuantity: (available) =>
        `❌ Không đủ hàng. Hiện chỉ còn ${available} sản phẩm.`,

    napInfo: (amount, paymentCode) =>
        `💰 <b>NẠP SỐ DƯ</b>\n\n` +
        `Quét mã QR để nạp ${formatPrice(amount)} vào tài khoản.\n\n` +
        `🏦 Quét mã QR để chuyển khoản\n` +
        `├ Số tiền: <b>${formatPrice(amount)}</b>\n` +
        `└ Nội dung CK: <code>${paymentCode}</code>`,

    checkPayStatus: (order) => {
        const statusMap = {
            pending: '⏳ Đang chờ thanh toán',
            paid: '💵 Đã thanh toán',
            delivered: '✅ Đã giao hàng',
            cancelled: '❌ Đã hủy',
        };
        return (
            `🔍 <b>Trạng thái đơn hàng #${order.id}</b>\n\n` +
            `📦 Sản phẩm: ${order.product_name}\n` +
            `📊 Số lượng: ${order.quantity}\n` +
            `💵 Tổng tiền: ${formatPrice(order.total_price)}\n` +
            `📋 Trạng thái: ${statusMap[order.status] || order.status}\n` +
            `📅 Ngày tạo: ${order.created_at}`
        );
    },

    get supportInfo() {
        return renderEditableContent(settingsService.getContent('support'), {
            shop: config.SHOP_NAME,
            support: config.SUPPORT_CONTACT,
        });
    },

    myId: (id) =>
        `🆔 <b>Telegram ID của bạn:</b>\n<code>${id}</code>`,

    adminOnly: '⛔ Bạn không có quyền sử dụng lệnh này.',

    orderCancelled: '❌ Đơn hàng đã bị hủy.',

    paymentPending:
        '⏳ Chưa nhận được thanh toán. Vui lòng chờ hoặc liên hệ hỗ trợ.',
};

module.exports = messages;
