const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database');
const productService = require('../src/services/productService');

test('admin can update and delete unsold stock but cannot mutate sold stock', () => {
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
