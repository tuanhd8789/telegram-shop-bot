require('dotenv').config();

function boundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || 0,

    // Bank config for VietQR
    BANK: {
        BIN: process.env.BANK_BIN || '970422',
        ACCOUNT: process.env.BANK_ACCOUNT || '',
        ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || '',
        NAME: process.env.BANK_NAME || 'MB',
    },

    BANK2: process.env.BANK2_ACCOUNT ? {
        BIN: process.env.BANK2_BIN || '970436',
        ACCOUNT: process.env.BANK2_ACCOUNT,
        ACCOUNT_NAME: process.env.BANK2_ACCOUNT_NAME || '',
        NAME: process.env.BANK2_NAME || 'VCB',
    } : null,

    // Payment
    HEALTH_PORT: parseInt(process.env.HEALTH_PORT, 10) || 3000,
    SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET || '',
    SEPAY_SIGNATURE_TOLERANCE_SECONDS:
        parseInt(process.env.SEPAY_SIGNATURE_TOLERANCE_SECONDS, 10) || 300,

    // Shop
    SHOP_NAME: process.env.SHOP_NAME || 'Starizzi Shop',
    SUPPORT_CONTACT: process.env.SUPPORT_CONTACT || '@starizzi_support',

    // Admin-only AI assistant with a confirmed safe-action allowlist
    AI: {
        ENABLED: String(process.env.AI_ENABLED || '').toLowerCase() === 'true',
        BASE_URL: process.env.AI_BASE_URL || '',
        API_KEY: process.env.AI_API_KEY || '',
        MODEL: process.env.AI_MODEL || '',
        API_MODE: process.env.AI_API_MODE || 'chat_completions',
        TIMEOUT_MS: boundedInteger(process.env.AI_TIMEOUT_MS, 45000, 1000, 120000),
        MAX_TOKENS: boundedInteger(process.env.AI_MAX_TOKENS, 700, 1, 2000),
    },
};
