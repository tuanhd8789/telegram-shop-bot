const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database');
const productService = require('../src/services/productService');

test('admin can update private buyer messages on unsold stock but sold stock remains immutable', () => {
    const category = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)')
        .run('Stock CRUD test', '🧪', 9999);
    const product = db.prepare('INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)')
        .run(category.lastInsertRowid, 'Stock CRUD test product', 1);
    const unsold = db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)')
        .run(product.lastInsertRowid, 'old-data');
    const sold = db.prepare('INSERT INTO stock (product_id, data, is_sold) VALUES (?, ?, 1)')
        .run(product.lastInsertRowid, 'sold-data');

    try {
        const items = productService.getStockItems(product.lastInsertRowid);
        assert.deepEqual(items.map((item) => item.id), [Number(unsold.lastInsertRowid)]);

        assert.equal(productService.updateStockItem(unsold.lastInsertRowid, 'new-data').changes, 1);
        assert.equal(productService.getStockItem(unsold.lastInsertRowid).data, 'new-data');
        assert.equal(productService.updateStockBuyerMessage(unsold.lastInsertRowid, 'Download & install guide').changes, 1);
        assert.equal(productService.getStockItem(unsold.lastInsertRowid).buyer_message, 'Download & install guide');
        assert.equal(productService.updateStockBuyerMessage(sold.lastInsertRowid, 'tampered').changes, 0);
        assert.equal(productService.updateStockItem(sold.lastInsertRowid, 'tampered').changes, 0);
        assert.equal(productService.deleteStockItem(sold.lastInsertRowid).changes, 0);
        assert.equal(productService.deleteStockItem(unsold.lastInsertRowid).changes, 1);
        assert.equal(productService.getStockItem(unsold.lastInsertRowid), undefined);
    } finally {
        db.prepare('DELETE FROM stock WHERE product_id = ?').run(product.lastInsertRowid);
        db.prepare('DELETE FROM products WHERE id = ?').run(product.lastInsertRowid);
        db.prepare('DELETE FROM categories WHERE id = ?').run(category.lastInsertRowid);
    }
});

test('bulk stock input separates each stock secret from its buyer message', () => {
    assert.deepEqual(productService.parseStockInputLine('KEY-123 || https://example.com/guide'), {
        data: 'KEY-123',
        buyerMessage: 'https://example.com/guide',
    });
    assert.deepEqual(productService.parseStockInputLine('email|password'), {
        data: 'email|password',
        buyerMessage: null,
    });
});

test('adding stock reports the transition used by restock notifications', () => {
    db.exec('BEGIN');
    try {
        const categoryId = Number(db.prepare('INSERT INTO categories (name) VALUES (?)')
            .run('Restock transition test').lastInsertRowid);
        const productId = Number(db.prepare(
            'INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)'
        ).run(categoryId, 'Restock transition product', 1000).lastInsertRowid);

        const result = productService.addStock(productId, ['KEY-1', 'KEY-2 || Hướng dẫn']);

        assert.deepEqual(result, { added: 2, beforeStock: 0, afterStock: 2 });
    } finally {
        db.exec('ROLLBACK');
    }
});
