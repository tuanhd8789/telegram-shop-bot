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

test('editable customer content persists independently and rejects invalid values', () => {
    const fixture = createFixture();
    try {
        assert.match(fixture.service.getContent('welcome'), /\{name\}/);
        fixture.service.updateContent('welcome', 'Xin chào {name} đến {shop}');
        fixture.service.updateContent('introduction', 'Giới thiệu mới');
        fixture.service.updateContent('support', 'Liên hệ {support}');

        const restartedService = createSettingsService(fixture.db, {
            SHOP_NAME: 'Default Shop',
            SUPPORT_CONTACT: '@default_support',
        });
        restartedService.load();
        assert.deepEqual(restartedService.getContent(), {
            welcome: 'Xin chào {name} đến {shop}',
            introduction: 'Giới thiệu mới',
            support: 'Liên hệ {support}',
        });
        assert.throws(() => fixture.service.updateContent('welcome', ''), SettingsError);
        assert.throws(() => fixture.service.updateContent('unknown', 'value'), SettingsError);
        assert.equal(fixture.db.prepare('SELECT COUNT(*) count FROM app_settings').get().count, 3);
    } finally {
        fixture.db.close();
    }
});
