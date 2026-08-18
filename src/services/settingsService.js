class SettingsError extends Error {}

const SHOP_NAME_KEY = 'shop_name';
const SUPPORT_CONTACT_KEY = 'support_contact';

function createSettingsService(db, config) {
    function getShopInfo() {
        return {
            shopName: config.SHOP_NAME,
            supportContact: config.SUPPORT_CONTACT,
        };
    }

    function load() {
        const rows = db.prepare('SELECT key, value FROM app_settings WHERE key IN (?, ?)')
            .all(SHOP_NAME_KEY, SUPPORT_CONTACT_KEY);
        for (const row of rows) {
            if (row.key === SHOP_NAME_KEY) config.SHOP_NAME = row.value;
            if (row.key === SUPPORT_CONTACT_KEY) config.SUPPORT_CONTACT = row.value;
        }
        return getShopInfo();
    }

    function parseInput(input) {
        const text = typeof input === 'string' ? input.trim() : '';
        const separator = text.indexOf('|');
        if (separator === -1) {
            throw new SettingsError('Hãy gửi theo mẫu: Tên shop | @tai_khoan_ho_tro');
        }
        const shopName = text.slice(0, separator).trim();
        const supportContact = text.slice(separator + 1).trim();
        if (!shopName || shopName.length > 100 || /[\r\n]/.test(shopName)) {
            throw new SettingsError('Tên shop phải có từ 1 đến 100 ký tự trên một dòng.');
        }
        if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(supportContact)) {
            throw new SettingsError('Liên hệ hỗ trợ phải là Telegram username dạng @username (5–32 ký tự).');
        }
        return { shopName, supportContact };
    }

    function updateFromInput(input) {
        const values = parseInput(input);
        const upsert = db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        db.transaction(() => {
            upsert.run(SHOP_NAME_KEY, values.shopName);
            upsert.run(SUPPORT_CONTACT_KEY, values.supportContact);
        }).immediate();
        config.SHOP_NAME = values.shopName;
        config.SUPPORT_CONTACT = values.supportContact;
        return getShopInfo();
    }

    return { getShopInfo, load, parseInput, updateFromInput };
}

const config = require('../config');
const db = require('../database');
const settingsService = createSettingsService(db, config);

module.exports = { ...settingsService, createSettingsService, SettingsError };
