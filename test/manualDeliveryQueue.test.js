const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { queueManualDelivery } = require('../src/services/manualDeliveryService');

function createDatabase() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            sheet_stock INTEGER DEFAULT 0
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            status TEXT NOT NULL
        );
        CREATE TABLE telegram_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dedupe_key TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL,
            order_id INTEGER,
            chat_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
        );
        INSERT INTO products (id, name, sheet_stock) VALUES (1, 'Manual Product', 5);
        INSERT INTO orders (id, user_id, product_id, quantity, status)
        VALUES (1, 12345, 1, 2, 'paid');
    `);
    return db;
}

test('queues exact manual stock without marking the paid order delivered early', () => {
    const db = createDatabase();
    const result = queueManualDelivery(db, 1, [
        'account-1 || private guide 1',
        'account-2',
    ]);

    assert.equal(result.success, true);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'paid');
    assert.equal(db.prepare('SELECT COUNT(*) FROM telegram_jobs').pluck().get(), 1);
    assert.equal(db.prepare('SELECT sheet_stock FROM products WHERE id = 1').pluck().get(), 3);
    const payload = JSON.parse(db.prepare('SELECT payload FROM telegram_jobs').pluck().get());
    assert.deepEqual(payload.items, [
        { data: 'account-1', buyerMessage: 'private guide 1' },
        { data: 'account-2', buyerMessage: null },
    ]);
    db.close();
});

test('rejects incomplete manual delivery data', () => {
    const db = createDatabase();
    const result = queueManualDelivery(db, 1, ['only-one-account']);

    assert.equal(result.success, false);
    assert.match(result.error, /đúng 2 dòng/);
    assert.equal(db.prepare('SELECT COUNT(*) FROM telegram_jobs').pluck().get(), 0);
    db.close();
});
