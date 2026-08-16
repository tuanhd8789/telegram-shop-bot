const paymentService = require('../services/paymentService');
const walletService = require('../services/walletService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');
const { Markup } = require('telegraf');

const PRESET_AMOUNTS = [10000, 50000, 100000, 200000, 300000, 500000];

function topupKeyboard() {
    const rows = [];
    for (let index = 0; index < PRESET_AMOUNTS.length; index += 2) {
        rows.push(PRESET_AMOUNTS.slice(index, index + 2).map((amount) =>
            Markup.button.callback(formatPrice(amount), `topup_${amount}`)
        ));
    }
    rows.push([Markup.button.callback('✍️ Nhập số tiền khác', 'topup_custom')]);
    rows.push([Markup.button.callback('↩️ Quay lại menu', 'nav_menu')]);
    return Markup.inlineKeyboard(rows);
}

function showTopupOptions(ctx) {
    return ctx.replyWithHTML(
        '💰 <b>NẠP TIỀN VÀO VÍ</b>\n\nChọn nhanh số tiền hoặc nhập số khác (tối thiểu 10.000đ):',
        topupKeyboard()
    );
}

async function createTopup(ctx, amount) {
    if (!Number.isSafeInteger(amount) || amount < 10000) {
        return ctx.reply('❌ Số tiền tối thiểu là 10.000đ.');
    }
    userService.findOrCreate(ctx.from);
    const payment = paymentService.generatePayment(amount);
    walletService.createTopup(ctx.from.id, amount, payment.paymentCode);

    return ctx.replyWithPhoto(payment.qrUrl, {
        caption:
            `💰 <b>NẠP TIỀN VÀO VÍ</b>\n\n` +
            `├ Số tiền: <b>${formatPrice(amount)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            '✅ Khi SePay xác nhận đúng mã và số tiền, ví sẽ được cộng tự động và bot sẽ báo lại.',
        parse_mode: 'HTML',
    });
}

module.exports = (bot) => {
    bot.command('nap', (ctx) => {
        const text = ctx.message.text.split(' ');
        if (text.length < 2 || isNaN(text[1])) return showTopupOptions(ctx);
        return createTopup(ctx, parseInt(text[1], 10));
    });

    bot.action(/^topup_(\d+)$/, (ctx) => {
        ctx.answerCbQuery();
        return createTopup(ctx, parseInt(ctx.match[1], 10));
    });

    bot.action('topup_custom', (ctx) => {
        ctx.answerCbQuery();
        ctx.session.awaitingTopupAmount = true;
        return ctx.reply('✍️ Gửi số tiền muốn nạp, ví dụ: 75000. Gõ /cancel để hủy.');
    });

    bot.on('text', (ctx, next) => {
        if (!ctx.session.awaitingTopupAmount) return next();
        ctx.session.awaitingTopupAmount = false;
        const value = ctx.message.text.replaceAll('.', '').replaceAll(',', '').trim();
        if (value === '/cancel') return ctx.reply('❌ Đã hủy nạp tiền.');
        return createTopup(ctx, Number(value));
    });
};

module.exports.showTopupOptions = showTopupOptions;
module.exports.createTopup = createTopup;
module.exports.topupKeyboard = topupKeyboard;
