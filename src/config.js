require('dotenv').config();

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
};
