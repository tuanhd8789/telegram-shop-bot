const { Telegraf, session } = require('telegraf');
const config = require('./config');
const { validateConfig } = require('./configValidation');
const { startHealthServer } = require('./healthServer');
const { startPolling } = require('./botLifecycle');
const { registerCommandMenus } = require('./commandMenu');
const { createSePayWebhookHandler } = require('./sepayWebhook');
const { createSePayPaymentService } = require('./services/sepayPaymentService');
const { createDeliveryQueue } = require('./services/deliveryQueue');
const db = require('./database');

const configErrors = validateConfig(config);
if (configErrors.length > 0) {
    console.error(`❌ Cấu hình không hợp lệ:\n- ${configErrors.join('\n- ')}`);
    process.exit(1);
}

const bot = new Telegraf(config.BOT_TOKEN);
const bankAccounts = [config.BANK.ACCOUNT, config.BANK2?.ACCOUNT].filter(Boolean);
const sepayPaymentService = createSePayPaymentService({
    db,
    bankAccounts,
    adminId: config.ADMIN_ID,
});
const deliveryQueue = createDeliveryQueue({ db, telegram: bot.telegram });
const sepayHandler = createSePayWebhookHandler({
    secret: config.SEPAY_WEBHOOK_SECRET,
    toleranceSeconds: config.SEPAY_SIGNATURE_TOLERANCE_SECONDS,
    processPayment: sepayPaymentService.process,
    onResult: (result) => {
        console.log(`💳 SePay: ${result.status}${result.orderId ? ` (order #${result.orderId})` : ''}`);
    },
});

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
require('./handlers/navigation').registerNavigation(bot);

// Register handlers
require('./handlers/productSelect')(bot);
require('./handlers/quantitySelect')(bot);
require('./handlers/paymentConfirm')(bot);
require('./handlers/adminActions')(bot);

let healthServer;
let ready = false;
let botLaunched = false;
let pollingPromise;
let stopDeliveryWorker;

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
        healthServer = await startHealthServer(config.HEALTH_PORT, () => ready, { sepayHandler });
        stopDeliveryWorker = deliveryQueue.start();
        ready = true;

        console.log(`🤖 ${config.SHOP_NAME} Bot đã khởi động!`);
        console.log(`👤 Admin ID: ${config.ADMIN_ID}`);
        console.log(`🏦 Bank: ${config.BANK.NAME} (đã cấu hình)`);
        console.log(`💚 Health check: http://0.0.0.0:${config.HEALTH_PORT}/healthz`);
        console.log(`💳 SePay webhook: ${config.SEPAY_WEBHOOK_SECRET ? 'enabled' : 'disabled until secret is configured'}`);

        // Start Google Sheet auto-sync
        const { startAutoSync } = require('./services/sheetSync');
        startAutoSync();

        // Keep recoverable database snapshots on a separate volume.
        const { startBackupScheduler } = require('./services/backupService');
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
    if (stopDeliveryWorker) stopDeliveryWorker();

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
