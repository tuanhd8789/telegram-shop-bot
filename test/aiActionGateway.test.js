const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAiActionGateway } = require('../src/services/aiActionGateway');

function setup() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE users (telegram_id INTEGER PRIMARY KEY, username TEXT, full_name TEXT, balance INTEGER DEFAULT 0);
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, emoji TEXT DEFAULT '📦',
          custom_emoji_id TEXT, sort_order INTEGER DEFAULT 0, image_url TEXT, is_active INTEGER DEFAULT 1
        );
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, name TEXT NOT NULL, price INTEGER NOT NULL,
          emoji TEXT DEFAULT '📦', custom_emoji_id TEXT, promotion TEXT, contact_only INTEGER DEFAULT 0,
          contact_url TEXT, sheet_stock INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
          FOREIGN KEY (category_id) REFERENCES categories(id)
        );
        CREATE TABLE stock (
          id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, data TEXT NOT NULL,
          is_sold INTEGER DEFAULT 0, sold_to INTEGER, sold_at TEXT, sold_order_id INTEGER,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL, total_price INTEGER NOT NULL, payment_code TEXT UNIQUE,
          status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, delivered_at TEXT,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE TABLE telegram_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
          order_id INTEGER, chat_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
        );
        CREATE TABLE ai_action_requests (
          id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL,
          preview TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
          decided_at INTEGER, backup_name TEXT, result TEXT
        );
        CREATE INDEX idx_ai_action_requests_admin_status ON ai_action_requests(admin_id, status, created_at);
    `);
    db.prepare('INSERT INTO users (telegram_id, username, full_name) VALUES (1, ?, ?)').run('private_user', 'Private Name');
    const categoryId = Number(db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)').run('Autodesk', '📲', 1).lastInsertRowid);
    const productId = Number(db.prepare('INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)').run(categoryId, 'AutoCAD', 300000).lastInsertRowid);
    const stockId = Number(db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)').run(productId, 'secret-license-key').lastInsertRowid);
    const orderId = Number(db.prepare(`
        INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code)
        VALUES (1, ?, 1, 300000, 'PAYABC123')
    `).run(productId).lastInsertRowid);
    let now = 1000;
    let backups = 0;
    const gateway = createAiActionGateway({
        db,
        config: { SHOP_NAME: '8789 Shop', SUPPORT_CONTACT: '@support', BANK: { NAME: 'MB' } },
        telegram: { sendMessage: async () => {} },
        now: () => now,
        backupDatabase: async () => { backups += 1; return 'backup.db'; },
    });
    return { db, gateway, categoryId, productId, stockId, orderId, setNow: (value) => { now = value; }, backups: () => backups };
}

test('read tools return useful data without customer or stock secrets', () => {
    const { db, gateway, productId, stockId } = setup();

    const product = gateway.runRead('get_product', { product_id: productId });
    const orders = gateway.runRead('list_orders', { limit: 10 });
    const stock = gateway.runRead('list_stock_items', { product_id: productId });

    assert.equal(product.stock_count, 1);
    assert.equal(orders[0].user_id, undefined);
    assert.equal(orders[0].payment_code, undefined);
    assert.deepEqual(stock, [{ id: stockId, product_id: productId }]);
    assert.doesNotMatch(JSON.stringify({ product, orders, stock }), /secret-license-key|Private Name|private_user|PAYABC123/);
    db.close();
});

test('write actions require confirmation, create a backup and cannot replay', async () => {
    const { db, gateway, productId, backups } = setup();
    const proposal = gateway.prepare('update_product', { product_id: productId, price: 450000 }, 99);

    assert.equal(db.prepare('SELECT price FROM products WHERE id = ?').get(productId).price, 300000);
    assert.equal(db.prepare('SELECT status FROM ai_action_requests WHERE id = ?').get(proposal.id).status, 'pending');

    const result = await gateway.confirm(proposal.id, 99);

    assert.equal(result.backupName, 'backup.db');
    assert.equal(backups(), 1);
    assert.equal(db.prepare('SELECT price FROM products WHERE id = ?').get(productId).price, 450000);
    assert.equal(db.prepare('SELECT status FROM ai_action_requests WHERE id = ?').get(proposal.id).status, 'completed');
    await assert.rejects(gateway.confirm(proposal.id, 99), /hết hạn, đã xử lý/);
    db.close();
});

test('cancelled, expired and cross-admin requests never execute', async () => {
    const { db, gateway, productId, setNow } = setup();
    const cancelled = gateway.prepare('update_product', { product_id: productId, price: 400000 }, 99);
    gateway.cancel(cancelled.id, 99);
    await assert.rejects(gateway.confirm(cancelled.id, 99), /hết hạn, đã xử lý/);

    const foreign = gateway.prepare('update_product', { product_id: productId, price: 410000 }, 99);
    await assert.rejects(gateway.confirm(foreign.id, 100), /không thuộc admin/);

    setNow(1000 + 11 * 60 * 1000);
    await assert.rejects(gateway.confirm(foreign.id, 99), /hết hạn, đã xử lý/);
    assert.equal(db.prepare('SELECT price FROM products WHERE id = ?').get(productId).price, 300000);
    db.close();
});

test('destructive constraints and protected stock handoff are enforced', async () => {
    const { db, gateway, productId } = setup();
    assert.throws(() => gateway.prepare('delete_product', { product_id: productId }, 99), /đã có 1 đơn/);

    const proposal = gateway.prepare('prepare_add_stock', { product_id: productId }, 99);
    const result = await gateway.confirm(proposal.id, 99);

    assert.deepEqual(result.interaction, { type: 'add_stock', productId });
    assert.equal(result.backupName, null);
    assert.doesNotMatch(db.prepare('SELECT arguments FROM ai_action_requests WHERE id = ?').get(proposal.id).arguments, /secret-license-key/);
    db.close();
});

test('confirmed orders reserve stock and enqueue durable delivery atomically', async () => {
    const { db, gateway, orderId, stockId } = setup();
    const proposal = gateway.prepare('confirm_order', { order_id: orderId }, 99);

    const result = await gateway.confirm(proposal.id, 99);

    assert.match(result.message, /xếp hàng giao đơn/);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status, 'paid');
    assert.equal(db.prepare('SELECT is_sold, sold_order_id FROM stock WHERE id = ?').get(stockId).is_sold, 1);
    assert.equal(db.prepare('SELECT sold_order_id FROM stock WHERE id = ?').get(stockId).sold_order_id, orderId);
    const job = db.prepare('SELECT kind, order_id, payload FROM telegram_jobs').get();
    assert.equal(job.kind, 'customer_delivery');
    assert.equal(job.order_id, orderId);
    assert.match(job.payload, /secret-license-key/);
    assert.doesNotMatch(db.prepare('SELECT preview FROM ai_action_requests WHERE id = ?').get(proposal.id).preview, /secret-license-key/);
    db.close();
});

test('destructive confirmations fail closed when stock changes after preview', async () => {
    const { db, gateway, categoryId } = setup();
    const productId = Number(db.prepare('INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)')
        .run(categoryId, 'No orders', 100000).lastInsertRowid);
    db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)').run(productId, 'first');
    const proposal = gateway.prepare('clear_unsold_stock', { product_id: productId }, 99);
    db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)').run(productId, 'added-after-preview');

    await assert.rejects(gateway.confirm(proposal.id, 99), /Tồn kho đã thay đổi sau preview/);

    assert.equal(db.prepare('SELECT COUNT(*) count FROM stock WHERE product_id = ?').get(productId).count, 2);
    assert.equal(db.prepare('SELECT status FROM ai_action_requests WHERE id = ?').get(proposal.id).status, 'failed');
    db.close();
});
