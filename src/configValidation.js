function validateConfig(config) {
    const errors = [];

    if (!config.BOT_TOKEN || config.BOT_TOKEN === 'your_bot_token_here') {
        errors.push('BOT_TOKEN is required');
    }
    if (!Number.isSafeInteger(config.ADMIN_ID) || config.ADMIN_ID <= 0) {
        errors.push('ADMIN_ID must be a positive Telegram user ID');
    }
    if (!config.BANK.ACCOUNT || config.BANK.ACCOUNT === 'your_bank_account_number') {
        errors.push('BANK_ACCOUNT is required');
    }
    if (!config.BANK.ACCOUNT_NAME || config.BANK.ACCOUNT_NAME === 'YOUR_FULL_NAME') {
        errors.push('BANK_ACCOUNT_NAME is required');
    }
    if (config.SEPAY_WEBHOOK_SECRET && config.SEPAY_WEBHOOK_SECRET.length < 32) {
        errors.push('SEPAY_WEBHOOK_SECRET must be at least 32 characters when enabled');
    }
    if (config.AI?.ENABLED) {
        if (!config.AI.API_KEY) errors.push('AI_API_KEY is required when AI is enabled');
        if (!config.AI.MODEL) errors.push('AI_MODEL is required when AI is enabled');
        if (config.AI.API_MODE !== 'chat_completions') {
            errors.push('AI_API_MODE must be chat_completions in the admin-only phase');
        }
        try {
            const url = new URL(config.AI.BASE_URL);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
        } catch {
            errors.push('AI_BASE_URL must be a valid http(s) URL when AI is enabled');
        }
    }

    return errors;
}

module.exports = { validateConfig };
