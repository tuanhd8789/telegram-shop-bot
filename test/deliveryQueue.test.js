const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createDeliveryQueue } = require('../src/services/deliveryQueue');

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
