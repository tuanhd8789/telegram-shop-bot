const productService = require('../services/productService');
const messages = require('../utils/messages');
const { quantityKeyboard, itemQuantityKeyboard, formatPrice } = require('../utils/keyboard');
const catalogService = require('../services/catalogService');
const { escapeHtml } = require('../utils/telegramMarkup');
const config = require('../config');
const { Markup } = require('telegraf');

async function replyProductCard(ctx, product, text, keyboard) {
    if (!product.public_image_file_id) return ctx.replyWithHTML(text, keyboard);
    try {
        if (text.length > 900) {
            await ctx.replyWithPhoto(product.public_image_file_id);
            return ctx.replyWithHTML(text, keyboard);
        }
        return await ctx.replyWithPhoto(product.public_image_file_id, {
            caption: text,
            parse_mode: 'HTML',
            ...keyboard,
        });
    } catch (error) {
        return ctx.replyWithHTML(text, keyboard);
    }
}

module.exports = (bot) => {
    bot.action(/^combo_(\d+)$/, async (ctx) => {
        const combo = catalogService.getComboById(Number(ctx.match[1]));
        if (!combo || !combo.is_active) return ctx.answerCbQuery('❌ Combo không tồn tại');
        ctx.answerCbQuery();
        if (!combo.display_stock) return ctx.reply(messages.noStock);
        const components = combo.components.map((item) => `• ${escapeHtml(item.name)}`).join('\n');
        return ctx.replyWithHTML(
            `🎁 <b>${escapeHtml(combo.name)}</b>\n💰 Giá: ${formatPrice(combo.price)}/combo\n` +
            `📊 Còn lại: ${combo.display_stock} combo\n\n<b>Gồm:</b>\n${components}\n\nChọn số lượng muốn mua:`,
            itemQuantityKeyboard('combo_qty', combo.id, Math.min(combo.display_stock, 10))
        );
    });

    // Handle product selection
    bot.action(/^product_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        ctx.answerCbQuery();

        // Contact-only products → show contact info + Zalo link
        if (product.contact_only) {
            const buttons = [];

            // Button 1: Liên hệ mua qua Telegram admin
            const adminUsername = config.SUPPORT_CONTACT.replace('@', '');
            buttons.push([Markup.button.url('💬 Liên hệ mua', `https://t.me/${adminUsername}`)]);

            // Button 2: Tham gia nhóm Zalo (from sheet contact_url)
            if (product.contact_url) {
                buttons.push([Markup.button.url('📱 Hotline Zalo 24/7', product.contact_url)]);
            }

            // Back to product list
            buttons.push([Markup.button.callback('↩️ Quay lại', 'refresh_products')]);

            return replyProductCard(ctx, product, messages.contactOnly(product), Markup.inlineKeyboard(buttons));
        }

        // Check stock (use display_stock which falls back to sheet_stock)
        const availableStock = product.display_stock || product.stock_count;
        if (availableStock === 0) {
            return ctx.reply(messages.noStock);
        }

        // Show quantity selector
        const maxQty = Math.min(availableStock, 10);
        return replyProductCard(ctx, product, messages.selectQuantity(product), quantityKeyboard(productId, maxQty));
    });
};
