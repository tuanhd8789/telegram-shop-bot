const db = require('../database');

const productService = {
    /**
     * Get all active products with stock count
     */
    getAll() {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.is_active = 1
      ORDER BY p.category_id, p.id
    `).all();
    },

    /**
     * Get single product with stock count
     */
    getById(id) {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.id = ?
    `).get(id);
    },

    /**
     * Get products by category
     */
    getByCategory(categoryId) {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.category_id = ? AND p.is_active = 1
      ORDER BY p.id
    `).all(categoryId);
    },

    /**
     * Get all categories
     */
    getCategories({ includeInactive = false } = {}) {
        return db.prepare(`
            SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) product_count,
              EXISTS (
                SELECT 1 FROM products p
                WHERE p.category_id = c.id
                  AND p.is_active = 1
                  AND (
                    COALESCE(p.sheet_stock, 0) > 0
                    OR EXISTS (
                      SELECT 1 FROM stock s
                      WHERE s.product_id = p.id AND s.is_sold = 0
                    )
                  )
              ) has_stock
            FROM categories c
            WHERE (? = 1 OR c.is_active = 1)
            ORDER BY c.sort_order, c.id
        `).all(includeInactive ? 1 : 0);
    },

    /**
     * Get one category for admin workflows, including hidden categories.
     */
    getCategoryById(id) {
        return db.prepare(`
            SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) product_count
            FROM categories c WHERE c.id = ?
        `).get(id);
    },

    /**
     * Add stock items for a product
     */
    addStock(productId, dataLines) {
        const insert = db.prepare('INSERT INTO stock (product_id, data, buyer_message) VALUES (?, ?, ?)');
        const insertMany = db.transaction((lines) => {
            for (const line of lines) {
                const item = typeof line === 'string' ? parseStockInputLine(line) : line;
                if (item?.data?.trim()) insert.run(productId, item.data.trim(), item.buyerMessage?.trim() || null);
            }
        });
        insertMany(dataLines);
    },

    /**
     * List unsold stock items for product-level administration.
     */
    getStockItems(productId, limit = 20, offset = 0) {
        return db.prepare(`
            SELECT id, product_id, data, buyer_message, is_sold, sold_to, sold_at, sold_order_id
            FROM stock
            WHERE product_id = ? AND is_sold = 0
            ORDER BY id
            LIMIT ? OFFSET ?
        `).all(productId, limit, offset);
    },

    /**
     * Get one stock item with its product name.
     */
    getStockItem(stockId) {
        return db.prepare(`
            SELECT s.*, p.name product_name
            FROM stock s
            JOIN products p ON p.id = s.product_id
            WHERE s.id = ?
        `).get(stockId);
    },

    /**
     * Update an unsold stock item. Sold stock is immutable order history.
     */
    updateStockItem(stockId, data) {
        return db.prepare('UPDATE stock SET data = ? WHERE id = ? AND is_sold = 0')
            .run(data.trim(), stockId);
    },

    updateStockBuyerMessage(stockId, buyerMessage) {
        return db.prepare('UPDATE stock SET buyer_message = ? WHERE id = ? AND is_sold = 0')
            .run(buyerMessage?.trim() || null, stockId);
    },

    updatePublicDescription(productId, publicDescription, publicImageFileId) {
        return db.prepare(`
            UPDATE products SET public_description = ?, public_image_file_id = ? WHERE id = ?
        `).run(publicDescription?.trim() || null, publicImageFileId || null, productId);
    },

    /**
     * Delete an unsold stock item. Sold stock is immutable order history.
     */
    deleteStockItem(stockId) {
        return db.prepare('DELETE FROM stock WHERE id = ? AND is_sold = 0').run(stockId);
    },

    /**
     * Get available stock for a product
     */
    getAvailableStock(productId, quantity) {
        return db.prepare(
            'SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 LIMIT ?'
        ).all(productId, quantity);
    },

    /**
     * Mark stock as sold
     */
    markSold(stockIds, userId) {
        const update = db.prepare(
            'UPDATE stock SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        const updateMany = db.transaction((ids) => {
            for (const id of ids) {
                update.run(userId, id);
            }
        });
        updateMany(stockIds);
    },

    /**
     * Add a new product
     */
    addProduct(categoryId, name, price, emoji = '📦', promotion = null, contactOnly = false, customEmojiId = null) {
        const result = db.prepare(
            'INSERT INTO products (category_id, name, price, emoji, promotion, contact_only, custom_emoji_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(categoryId, name, price, emoji, promotion, contactOnly ? 1 : 0, customEmojiId);
        return result.lastInsertRowid;
    },
};

function parseStockInputLine(line) {
    const value = String(line || '').trim();
    const separator = value.indexOf('||');
    if (separator === -1) return { data: value, buyerMessage: null };
    return {
        data: value.slice(0, separator).trim(),
        buyerMessage: value.slice(separator + 2).trim() || null,
    };
}

productService.parseStockInputLine = parseStockInputLine;

module.exports = productService;
