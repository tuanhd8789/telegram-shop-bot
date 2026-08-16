const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
    createSePayPaymentService,
    normalizePaymentCode,
} = require('../src/services/sepayPaymentService');

function createDatabase(stockCount = 2) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE users (telegram_id INTEGER PRIMARY KEY, full_name TEXT);
        CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE stock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            is_sold INTEGER DEFAULT 0,
            sold_to INTEGER,
            sold_at DATETIME,
            sold_order_id INTEGER
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            total_price INTEGER NOT NULL,
            payment_code TEXT UNIQUE,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paid_at DATETIME,
            delivered_at DATETIME
        );
        CREATE TABLE payment_transactions (
            transaction_id TEXT PRIMARY KEY,
            order_id INTEGER,
            transfer_amount INTEGER NOT NULL,
            account_number TEXT NOT NULL,
            gateway TEXT,
            reference_code TEXT,
            payment_code TEXT,
            payload_hash TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE telegram_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dedupe_key TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL,
            order_id INTEGER,
            chat_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME
        );
        INSERT INTO users (telegram_id, full_name) VALUES (12345, 'Test User');
        INSERT INTO products (id, name) VALUES (1, 'Test Product');
        INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code)
        VALUES (12345, 1, 2, 16000, 'PAYABC123');
    `);
    const insertStock = db.prepare('INSERT INTO stock (product_id, data) VALUES (1, ?)');
    for (let index = 0; index < stockCount; index += 1) {
        insertStock.run(`account-${index + 1}`);
    }
    return db;
}

function validPayload(overrides = {}) {
    return {
        id: 92704,
        gateway: 'MBBank',
        accountNumber: '0366966858888',
        code: 'PAYABC123',
        content: 'PAYABC123 thanh toan',
        transferType: 'in',
        transferAmount: 16000,
        referenceCode: 'FT-TEST',
        ...overrides,
    };
}

function createService(db) {
    return createSePayPaymentService({
        db,
        bankAccounts: ['0366966858888'],
        adminId: 5487392216,
    });
}

test('normalizes both new and legacy payment codes', () => {
    assert.equal(normalizePaymentCode('PAYabc123'), 'PAYABC123');
    assert.equal(normalizePaymentCode('NAP PAY-ABC123'), 'PAYABC123');
    assert.equal(normalizePaymentCode('unrelated transfer'), '');
});

test('records payment, reserves stock, and queues delivery atomically', () => {
    const db = createDatabase();
    const service = createService(db);

    const result = service.process(validPayload(), { payloadHash: 'a'.repeat(64) });

    assert.equal(result.status, 'delivery_queued');
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'paid');
    assert.equal(db.prepare('SELECT COUNT(*) FROM stock WHERE sold_order_id = 1').pluck().get(), 2);
    assert.equal(db.prepare('SELECT status FROM payment_transactions').pluck().get(), 'accepted');
    assert.equal(db.prepare("SELECT COUNT(*) FROM telegram_jobs WHERE kind = 'customer_delivery'").pluck().get(), 1);
    assert.equal(db.prepare("SELECT COUNT(*) FROM telegram_jobs WHERE kind = 'admin_alert'").pluck().get(), 1);

    const duplicate = service.process(validPayload(), { payloadHash: 'a'.repeat(64) });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(db.prepare('SELECT COUNT(*) FROM telegram_jobs').pluck().get(), 2);
    db.close();
});

test('alerts admin once for an incoming transfer that does not match an order', () => {
    const db = createDatabase();
    const service = createService(db);
    const payload = validPayload({ id: 92706, code: 'PAYZZZ999', content: 'PAYZZZ999 nap tien' });

    const result = service.process(payload, { payloadHash: 'e'.repeat(64) });

    assert.equal(result.status, 'unmatched');
    assert.equal(db.prepare('SELECT COUNT(*) FROM payment_transactions').pluck().get(), 1);
    const job = db.prepare("SELECT * FROM telegram_jobs WHERE kind = 'admin_alert'").get();
    assert.ok(job);
    assert.equal(job.dedupe_key, 'sepay:92706:admin-alert');
    assert.deepEqual(JSON.parse(job.payload), {
        transactionId: '92706',
        orderId: null,
        reason: 'Có tiền vào nhưng chưa khớp đơn hàng',
        receivedAmount: 16000,
        accountLast4: '8888',
        gateway: 'MBBank',
        paymentCode: 'PAYZZZ999',
        referenceCode: 'FT-TEST',
    });

    const duplicate = service.process(payload, { payloadHash: 'e'.repeat(64) });
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(db.prepare('SELECT COUNT(*) FROM telegram_jobs').pluck().get(), 1);
    db.close();
});

test('leaves the order pending and alerts admin when the amount is wrong', () => {
    const db = createDatabase();
    const result = createService(db).process(
        validPayload({ id: 92705, transferAmount: 15000 }),
        { payloadHash: 'b'.repeat(64) }
    );

    assert.equal(result.status, 'amount_mismatch');
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'pending');
    assert.equal(db.prepare('SELECT status FROM payment_transactions').pluck().get(), 'amount_mismatch');
    assert.equal(db.prepare("SELECT COUNT(*) FROM telegram_jobs WHERE kind = 'admin_alert'").pluck().get(), 1);
    db.close();
});

test('marks a verified order paid and alerts admin when stock is insufficient', () => {
    const db = createDatabase(1);
    const result = createService(db).process(validPayload(), { payloadHash: 'c'.repeat(64) });

    assert.equal(result.status, 'stock_shortage');
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'paid');
    assert.equal(db.prepare('SELECT COUNT(*) FROM stock WHERE is_sold = 1').pluck().get(), 0);
    assert.equal(db.prepare("SELECT COUNT(*) FROM telegram_jobs WHERE kind = 'admin_alert'").pluck().get(), 1);
    db.close();
});

test('never applies a payment sent to a different bank account', () => {
    const db = createDatabase();
    const result = createService(db).process(
        validPayload({ accountNumber: '0000000000000' }),
        { payloadHash: 'd'.repeat(64) }
    );

    assert.equal(result.status, 'wrong_account');
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) FROM telegram_jobs').pluck().get(), 0);
    db.close();
});
