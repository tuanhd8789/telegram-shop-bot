const { Telegraf, session } = require('telegraf');
const config = require('./config');
const { validateConfig } = require('./configValidation');
const { startHealthServer } = require('./healthServer');
const { startPolling } = require('./botLifecycle');
const { registerCommandMenus } = require('./commandMenu');

const configErrors = validateConfig(config);
if (configErrors.length > 0) {
    console.error(`❌ Cấu hình không hợp lệ:\n- ${configErrors.join('\n- ')}`);
    process.exit(1);
}

const bot = new Telegraf(config.BOT_TOKEN);

// Enable session for admin stock input
bot.use(session());

// Error handler
bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err.message);
    try {
        ctx.reply('❌ Đã xảy ra lỗi. Vui lòng thử lại sau.');
    } catch (e) {
        // ignore
    }
});

// Register commands
require('./commands/start')(bot);
require('./commands/menu')(bot);
require('./commands/product')(bot);
require('./commands/nap')(bot);
require('./commands/checkpay')(bot);
require('./commands/support')(bot);
require('./commands/myid')(bot);

// Register handlers
require('./handlers/productSelect')(bot);
require('./handlers/quantitySelect')(bot);
require('./handlers/paymentConfirm')(bot);
require('./handlers/adminActions')(bot);

let healthServer;
let ready = false;
let botLaunched = false;
let pollingPromise;

async function start() {
    try {
        await registerCommandMenus(bot.telegram, config.ADMIN_ID);
        const polling = await startPolling(bot, (error) => {
            ready = false;
            console.error('❌ Telegram polling đã dừng:', error.message);
            process.exit(1);
        });
        pollingPromise = polling.pollingPromise;
        botLaunched = true;
        healthServer = await startHealthServer(config.HEALTH_PORT, () => ready);
        ready = true;

        console.log(`🤖 ${config.SHOP_NAME} Bot đã khởi động!`);
        console.log(`👤 Admin ID: ${config.ADMIN_ID}`);
        console.log(`🏦 Bank: ${config.BANK.NAME} (đã cấu hình)`);
        console.log(`💚 Health check: http://0.0.0.0:${config.HEALTH_PORT}/healthz`);

        // Start Google Sheet auto-sync
        const { startAutoSync } = require('./services/sheetSync');
        startAutoSync();

        // Keep recoverable database snapshots on a separate volume.
        const { startBackupScheduler } = require('./services/backupService');
        const db = require('./database');
        startBackupScheduler(db);
    } catch (err) {
        console.error('❌ Không thể khởi động bot:', err.message);
        process.exit(1);
    }
}

start();

// Prevent crash on network errors
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled rejection (ignored):', err.message || err);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err.message || err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Network error, bot continues running...');
        return; // Don't crash on network errors
    }
    process.exit(1);
});

// Graceful shutdown
let stopping = false;
async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    ready = false;

    if (healthServer) {
        await new Promise((resolve) => healthServer.close(resolve));
    }
    if (botLaunched) {
        bot.stop(signal);
        await pollingPromise;
    } else {
        process.exit(0);
    }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
