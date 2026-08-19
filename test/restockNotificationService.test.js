const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
    createRestockNotificationService,
} = require('../src/services/restockNotificationService');

function setup() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE users (telegram_id INTEGER PRIMARY KEY);
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY, parent_id INTEGER, is_active INTEGER DEFAULT 1
        );
        CREATE TABLE products (
          id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, emoji TEXT,
          custom_emoji_id TEXT, sheet_stock INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
        );
        CREATE TABLE stock (
          id INTEGER PRIMARY KEY, product_id INTEGER, is_sold INTEGER DEFAULT 0
        );
        INSERT INTO categories (id) VALUES (1);
        INSERT INTO users (telegram_id) VALUES (11), (22);
        INSERT INTO products (
          id, category_id, name, emoji, custom_emoji_id, sheet_stock
        ) VALUES (7, 1, 'Windows & Office', '📦', '5916038376150011838', 3);
    `);
    const messages = [];
    const telegram = {
        async sendMessage(chatId, text, options) {
            messages.push({ chatId, text, options });
        },
    };
    const service = createRestockNotificationService({
        db,
        telegram,
        logger: { log() {}, warn() {} },
    });
    return { db, messages, service };
}

test('notifies every registered user once when stock changes from zero to positive', async () => {
    const { service, messages } = setup();

    const result = await service.notifyIfRestocked(7, 0);

    assert.deepEqual(
        { triggered: result.triggered, total: result.total, sent: result.sent, failed: result.failed },
        { triggered: true, total: 2, sent: 2, failed: 0 }
    );
    assert.deepEqual(messages.map((item) => item.chatId), [11, 22]);
    assert.match(messages[0].text, /HÀNG MỚI VỀ/);
    assert.match(messages[0].text, /Windows &amp; Office/);
    assert.match(messages[0].text, /Số lượng tồn kho hiện tại: <b>3<\/b>/);
    assert.match(messages[0].text, /tg-emoji emoji-id="5916038376150011838"/);
    assert.deepEqual(
        messages[0].options.reply_markup.inline_keyboard[0].map((button) => ({
            text: button.text,
            callback: button.callback_data,
        })),
        [
            { text: '👁 Xem sản phẩm', callback: 'product_7' },
            { text: '🛒 Mua ngay', callback: 'qty_7_1' },
        ]
    );
});

test('does not notify when the product was already in stock or is hidden', async () => {
    const { db, service, messages } = setup();

    assert.equal((await service.notifyIfRestocked(7, 2)).triggered, false);
    db.prepare('UPDATE products SET is_active = 0 WHERE id = 7').run();
    assert.equal((await service.notifyIfRestocked(7, 0)).triggered, false);
    assert.equal(messages.length, 0);
});

test('sends the same layout as a test message to one selected chat', async () => {
    const { service, messages } = setup();

    await service.sendTest(7, 99);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].chatId, 99);
    assert.equal(messages[0].options.reply_markup.inline_keyboard[0][1].callback_data, 'qty_7_1');
});
