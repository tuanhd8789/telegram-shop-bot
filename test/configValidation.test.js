const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/configValidation');

function validConfig() {
    return {
        BOT_TOKEN: '123456:valid-test-token',
        ADMIN_ID: 40033248,
        BANK: { ACCOUNT: '123456789', ACCOUNT_NAME: 'TEST USER' },
    };
}

test('accepts complete required configuration', () => {
    assert.deepEqual(validateConfig(validConfig()), []);
});

test('reports all missing required configuration', () => {
    const errors = validateConfig({
        BOT_TOKEN: 'your_bot_token_here',
        ADMIN_ID: 0,
        BANK: { ACCOUNT: '', ACCOUNT_NAME: '' },
    });

    assert.deepEqual(errors, [
        'BOT_TOKEN is required',
        'ADMIN_ID must be a positive Telegram user ID',
        'BANK_ACCOUNT is required',
        'BANK_ACCOUNT_NAME is required',
    ]);
});

test('rejects a configured SePay secret that is too short', () => {
    const config = validConfig();
    config.SEPAY_WEBHOOK_SECRET = 'too-short';
    assert.deepEqual(validateConfig(config), [
        'SEPAY_WEBHOOK_SECRET must be at least 32 characters when enabled',
    ]);
});
