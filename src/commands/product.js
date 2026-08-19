const productService = require('../services/productService');
const messages = require('../utils/messages');
const { productListKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('product', (ctx) => {
        sendProductList(ctx);
    });

    // Refresh products callback
    bot.action('refresh_products', (ctx) => {
        ctx.answerCbQuery('🔄 Đang làm mới...');
        sendProductList(ctx, true);
    });
};

function sendProductList(ctx, edit = false) {
    const products = productService.getAll();

    if (products.length === 0) {
        const msg = '❌ Hiện tại không có sản phẩm nào.';
        const keyboard = productListKeyboard([]);
        return edit ? ctx.editMessageText(msg, keyboard) : ctx.reply(msg, keyboard);
    }

    const keyboard = productListKeyboard(products);
    const text = messages.productHeader;

    if (edit) {
        ctx.editMessageText(text, keyboard);
    } else {
        ctx.reply(text, keyboard);
    }
}

module.exports.sendProductList = sendProductList;
