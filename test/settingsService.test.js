const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createSettingsService, SettingsError } = require('../src/services/settingsService');

function createFixture() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    const config = { SHOP_NAME: 'Default Shop', SUPPORT_CONTACT: '@default_support' };
    return { db, config, service: createSettingsService(db, config) };
}

test('shop settings persist and load over environment defaults', () => {
    const fixture = createFixture();
    try {
        assert.deepEqual(fixture.service.updateFromInput('New Shop | @new_support'), {
            shopName: 'New Shop',
            supportContact: '@new_support',
        });

        const restartedConfig = { SHOP_NAME: 'Environment Shop', SUPPORT_CONTACT: '@environment_support' };
        const restartedService = createSettingsService(fixture.db, restartedConfig);
        assert.deepEqual(restartedService.load(), {
            shopName: 'New Shop',
            supportContact: '@new_support',
        });
        assert.deepEqual(restartedConfig, {
            SHOP_NAME: 'New Shop',
            SUPPORT_CONTACT: '@new_support',
        });
    } finally {
        fixture.db.close();
    }
});

test('shop settings reject malformed input without changing stored values', () => {
    const fixture = createFixture();
    try {
        fixture.service.updateFromInput('Original Shop | @original_support');
        for (const input of [
            'missing separator',
            ' | @valid_support',
            'Valid Shop | support_without_at',
            'Valid Shop | @abc',
        ]) {
            assert.throws(() => fixture.service.updateFromInput(input), SettingsError);
        }
        assert.deepEqual(fixture.service.getShopInfo(), {
            shopName: 'Original Shop',
            supportContact: '@original_support',
        });
        assert.equal(fixture.db.prepare('SELECT COUNT(*) count FROM app_settings').get().count, 2);
    } finally {
        fixture.db.close();
    }
});
