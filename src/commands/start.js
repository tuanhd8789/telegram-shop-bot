const userService = require('../services/userService');
const messages = require('../utils/messages');
const { showMainMenu } = require('../handlers/navigation');

module.exports = (bot) => {
    bot.start((ctx) => {
        const user = userService.findOrCreate(ctx.from);
        showMainMenu(ctx, messages.welcome(user.full_name));
    });
};
