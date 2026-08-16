const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createDeliveryQueue, renderJob } = require('../src/services/deliveryQueue');

function createDatabase() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            status TEXT NOT NULL,
            delivered_at DATETIME
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
        INSERT INTO orders (id, status) VALUES (1, 'paid');
        INSERT INTO telegram_jobs (dedupe_key, kind, order_id, chat_id, payload)
        VALUES (
            'order:1:delivery',
            'customer_delivery',
            1,
            '12345',
            '{"orderId":1,"productName":"Test","quantity":1,"accounts":["demo-account"]}'
        );
    `);
    return db;
}

test('persists a failed Telegram delivery and retries it later', async () => {
    const db = createDatabase();
    let now = 1_800_000_000_000;
    let shouldFail = true;
    const sent = [];
    const queue = createDeliveryQueue({
        db,
        telegram: {
            sendMessage: async (...args) => {
                if (shouldFail) throw new Error('temporary Telegram failure');
                sent.push(args);
            },
        },
        now: () => now,
        baseRetryMs: 1000,
    });

    await queue.processNext();
    let job = db.prepare('SELECT * FROM telegram_jobs WHERE id = 1').get();
    assert.equal(job.status, 'retry');
    assert.equal(job.attempts, 1);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'paid');

    shouldFail = false;
    now = job.next_attempt_at;
    await queue.processNext();
    job = db.prepare('SELECT * FROM telegram_jobs WHERE id = 1').get();
    assert.equal(job.status, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = 1').pluck().get(), 'delivered');
    db.close();
});

test('renders an incoming transfer alert with reconciliation details', () => {
    const message = renderJob({
        kind: 'admin_alert',
        payload: JSON.stringify({
            transactionId: '92706',
            orderId: null,
            reason: 'Có tiền vào nhưng chưa khớp đơn hàng',
            receivedAmount: 16000,
            accountLast4: '8888',
            gateway: 'MBBank',
            paymentCode: 'PAYZZZ999',
            referenceCode: 'FT<&TEST',
        }),
    });

    assert.match(message, /GIAO DỊCH TIỀN VÀO/);
    assert.match(message, /16\.000đ/);
    assert.match(message, /\*8888/);
    assert.match(message, /PAYZZZ999/);
    assert.match(message, /FT&lt;&amp;TEST/);
    assert.match(message, /chưa khớp đơn hàng/);
});

test('renders a wallet credit notification', () => {
    const message = renderJob({
        kind: 'wallet_credit',
        payload: JSON.stringify({ topupId: 7, amount: 50000, balance: 125000 }),
    });

    assert.match(message, /NẠP VÍ THÀNH CÔNG/);
    assert.match(message, /50\.000đ/);
    assert.match(message, /125\.000đ/);
});
