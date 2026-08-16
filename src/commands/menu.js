const { showMainMenu } = require('../handlers/navigation');

module.exports = (bot) => {
    bot.command('menu', (ctx) => {
        showMainMenu(ctx);
    });
};
