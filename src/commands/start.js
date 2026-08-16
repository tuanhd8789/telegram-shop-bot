const userService = require('../services/userService');
const messages = require('../utils/messages');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    bot.start((ctx) => {
        const user = userService.findOrCreate(ctx.from);
        ctx.replyWithHTML(
            messages.welcome(user.full_name),
            Markup.inlineKeyboard([[Markup.button.callback('🧭 Mở menu', 'nav_menu')]])
        );
    });
};
