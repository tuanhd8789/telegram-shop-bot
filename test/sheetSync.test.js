const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database');
const { syncToDatabase } = require('../src/services/sheetSync');

const header = ['ID', 'Sản phẩm', 'Giá bán', 'Đơn vị', 'Tồn kho', 'Còn hàng', 'Liên hệ', 'Ghi chú'];

test('sheet sync reports only existing products that transition from zero stock', () => {
    db.exec('BEGIN');
    try {
        const categoryId = Number(db.prepare('INSERT INTO categories (name) VALUES (?)')
            .run('Sheet restock test').lastInsertRowid);
        const existingId = Number(db.prepare(
            'INSERT INTO products (category_id, name, price, sheet_stock) VALUES (?, ?, ?, 0)'
        ).run(categoryId, 'Existing sheet product', 1000).lastInsertRowid);
        const newId = existingId + 100000;

        const first = syncToDatabase([
            header,
            [String(existingId), 'Existing sheet product', '1000', '', '4', 'TRUE', '', ''],
            [String(newId), 'New sheet product', '2000', '', '5', 'TRUE', '', ''],
        ]);
        assert.deepEqual(first.restockedProductIds, [existingId]);

        const repeated = syncToDatabase([
            header,
            [String(existingId), 'Existing sheet product', '1000', '', '6', 'TRUE', '', ''],
        ]);
        assert.deepEqual(repeated.restockedProductIds, []);
    } finally {
        db.exec('ROLLBACK');
    }
});
