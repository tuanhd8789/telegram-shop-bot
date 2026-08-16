const { session } = require('telegraf');

function createSessionMiddleware() {
    return session({ defaultSession: () => ({}) });
}

module.exports = { createSessionMiddleware };
