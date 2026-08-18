class SettingsError extends Error {}

const SHOP_NAME_KEY = 'shop_name';
const SUPPORT_CONTACT_KEY = 'support_contact';
const CONTENT_FIELDS = Object.freeze({
    welcome: {
        key: 'welcome_message',
        label: 'lời chào',
        maxLength: 1000,
        defaultValue: '👋 Chào mừng {name} đến với {shop}!',
    },
    introduction: {
        key: 'introduction_message',
        label: 'giới thiệu',
        maxLength: 1500,
        defaultValue: '🛒 Chuyên cung cấp tài khoản Premium giá rẻ',
    },
    support: {
        key: 'support_message',
        label: 'thông tin hỗ trợ',
        maxLength: 3500,
        defaultValue: '🆘 HỖ TRỢ\n\nNếu bạn gặp vấn đề, liên hệ:\n👉 {support}\n\n⏰ Hỗ trợ 24/7',
    },
});

function createSettingsService(db, config) {
    let content = Object.fromEntries(
        Object.entries(CONTENT_FIELDS).map(([field, definition]) => [field, definition.defaultValue])
    );

    function getShopInfo() {
        return {
            shopName: config.SHOP_NAME,
            supportContact: config.SUPPORT_CONTACT,
        };
    }

    function load() {
        content = Object.fromEntries(
            Object.entries(CONTENT_FIELDS).map(([field, definition]) => [field, definition.defaultValue])
        );
        const contentKeys = Object.values(CONTENT_FIELDS).map(({ key }) => key);
        const rows = db.prepare(`
            SELECT key, value FROM app_settings
            WHERE key IN (${Array(contentKeys.length + 2).fill('?').join(', ')})
        `).all(SHOP_NAME_KEY, SUPPORT_CONTACT_KEY, ...contentKeys);
        for (const row of rows) {
            if (row.key === SHOP_NAME_KEY) config.SHOP_NAME = row.value;
            if (row.key === SUPPORT_CONTACT_KEY) config.SUPPORT_CONTACT = row.value;
            const contentField = Object.entries(CONTENT_FIELDS)
                .find(([, definition]) => definition.key === row.key)?.[0];
            if (contentField) content[contentField] = row.value;
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

    function getContent(field) {
        if (field === undefined) return { ...content };
        if (!CONTENT_FIELDS[field]) throw new SettingsError('Mục nội dung không hợp lệ.');
        return content[field];
    }

    function updateContent(field, input) {
        const definition = CONTENT_FIELDS[field];
        if (!definition) throw new SettingsError('Mục nội dung không hợp lệ.');
        const value = typeof input === 'string' ? input.trim() : '';
        if (!value || value.length > definition.maxLength || value.includes('\u0000')) {
            throw new SettingsError(
                `${definition.label[0].toUpperCase()}${definition.label.slice(1)} phải có từ 1 đến ${definition.maxLength} ký tự.`
            );
        }
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(definition.key, value);
        content[field] = value;
        return { field, label: definition.label, value };
    }

    return { getShopInfo, load, parseInput, updateFromInput, getContent, updateContent };
}

const config = require('../config');
const db = require('../database');
const settingsService = createSettingsService(db, config);

module.exports = { ...settingsService, createSettingsService, SettingsError, CONTENT_FIELDS };
