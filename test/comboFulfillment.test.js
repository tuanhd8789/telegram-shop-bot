const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { allocateOrderStock, reserveAllocatedStock } = require('../src/services/fulfillmentService');

function setup() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE combo_products (
          combo_id INTEGER NOT NULL, product_id INTEGER NOT NULL, sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE stock (
          id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, data TEXT NOT NULL,
          buyer_message TEXT, is_sold INTEGER DEFAULT 0, sold_to INTEGER,
          sold_at TEXT, sold_order_id INTEGER
        );
        INSERT INTO products VALUES (1, 'Windows'), (2, 'Office');
        INSERT INTO combo_products VALUES (10, 1, 1), (10, 2, 2);
        INSERT INTO stock (id, product_id, data) VALUES
          (1, 1, 'win-1'), (2, 1, 'win-2'), (3, 1, 'win-3'),
          (4, 2, 'office-1'), (5, 2, 'office-2');
    `);
    return db;
}

test('combo stock equals the least-stocked component and reserves every component atomically', () => {
    const db = setup();
    const order = { id: 77, combo_id: 10, quantity: 2, user_id: 999 };
    const allocation = allocateOrderStock(db, order);
    assert.equal(allocation.success, true);
    assert.equal(allocation.available, 2);
    assert.deepEqual(allocation.items.map((item) => item.productName), [
        'Windows', 'Windows', 'Office', 'Office',
    ]);

    db.transaction(() => reserveAllocatedStock(db, order, allocation.items)).immediate();
    assert.equal(db.prepare('SELECT COUNT(*) FROM stock WHERE sold_order_id = 77').pluck().get(), 4);

    const next = allocateOrderStock(db, { ...order, id: 78, quantity: 1 });
    assert.equal(next.success, false);
    assert.equal(next.available, 0);
    db.close();
});
