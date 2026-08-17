const messages = require('../utils/messages');

module.exports = (bot) => {
    const showSupport = (ctx) => {
        ctx.replyWithHTML(messages.supportInfo);
    };

    bot.command('hotro', showSupport);
    bot.command('support', showSupport);
};
