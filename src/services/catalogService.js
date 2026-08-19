const db = require('../database');

function stockProjection(alias = 'p') {
    return `
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = ${alias}.id AND s.is_sold = 0) stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = ${alias}.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = ${alias}.id AND s.is_sold = 0)
          ELSE COALESCE(${alias}.sheet_stock, 0)
        END display_stock`;
}

function getSection(key) {
    return db.prepare('SELECT * FROM catalog_sections WHERE section_key = ?').get(key);
}

function updateSection(key, name, customEmojiId) {
    return db.prepare('UPDATE catalog_sections SET name = ?, custom_emoji_id = ? WHERE section_key = ?')
        .run(name.trim().slice(0, 100), customEmojiId || null, key);
}

function getHotProducts() {
    return db.prepare(`
        SELECT p.*, ${stockProjection('p')}
        FROM hot_products h
        JOIN products p ON p.id = h.product_id
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE p.is_active = 1 AND c.is_active = 1 AND (parent.id IS NULL OR parent.is_active = 1)
        ORDER BY h.sort_order, c.sort_order, p.sort_order, p.id
    `).all();
}

function listHotMembership() {
    return db.prepare(`
        SELECT p.id, p.name, EXISTS(SELECT 1 FROM hot_products h WHERE h.product_id = p.id) selected
        FROM products p
        ORDER BY p.category_id, p.sort_order, p.id
    `).all();
}

function toggleHotProduct(productId) {
    const existing = db.prepare('SELECT 1 FROM hot_products WHERE product_id = ?').get(productId);
    if (existing) {
        db.prepare('DELETE FROM hot_products WHERE product_id = ?').run(productId);
        return false;
    }
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 value FROM hot_products').get().value;
    db.prepare('INSERT INTO hot_products (product_id, sort_order) VALUES (?, ?)').run(productId, order);
    return true;
}

function getCombos({ includeInactive = false } = {}) {
    return db.prepare(`
        SELECT c.*,
          COUNT(cp.product_id) component_count,
          CASE WHEN COUNT(cp.product_id) = 0 THEN 0 ELSE MIN((
            SELECT COUNT(*) FROM stock s
            WHERE s.product_id = cp.product_id AND s.is_sold = 0
          )) END display_stock
        FROM combos c
        LEFT JOIN combo_products cp ON cp.combo_id = c.id
        WHERE (? = 1 OR c.is_active = 1)
        GROUP BY c.id
        ORDER BY c.sort_order, c.id
    `).all(includeInactive ? 1 : 0);
}

function getComboById(id) {
    const combo = db.prepare(`
        SELECT c.*,
          COUNT(cp.product_id) component_count,
          CASE WHEN COUNT(cp.product_id) = 0 THEN 0 ELSE MIN((
            SELECT COUNT(*) FROM stock s
            WHERE s.product_id = cp.product_id AND s.is_sold = 0
          )) END display_stock
        FROM combos c
        LEFT JOIN combo_products cp ON cp.combo_id = c.id
        WHERE c.id = ? GROUP BY c.id
    `).get(id);
    if (!combo) return null;
    combo.components = db.prepare(`
        SELECT p.id, p.name, cp.sort_order,
          (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) stock_count
        FROM combo_products cp JOIN products p ON p.id = cp.product_id
        WHERE cp.combo_id = ? ORDER BY cp.sort_order, p.sort_order, p.id
    `).all(id);
    return combo;
}

function createCombo(name, price, customEmojiId) {
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 value FROM combos').get().value;
    return Number(db.prepare(`
        INSERT INTO combos (name, price, custom_emoji_id, sort_order) VALUES (?, ?, ?, ?)
    `).run(name.trim().slice(0, 200), price, customEmojiId || null, order).lastInsertRowid);
}

function updateCombo(id, { name, price, customEmojiId }) {
    return db.prepare('UPDATE combos SET name = ?, price = ?, custom_emoji_id = ? WHERE id = ?')
        .run(name.trim().slice(0, 200), price, customEmojiId || null, id);
}

function listComboMembership(comboId) {
    return db.prepare(`
        SELECT p.id, p.name, EXISTS(
          SELECT 1 FROM combo_products cp WHERE cp.combo_id = ? AND cp.product_id = p.id
        ) selected
        FROM products p ORDER BY p.category_id, p.sort_order, p.id
    `).all(comboId);
}

function toggleComboProduct(comboId, productId) {
    const existing = db.prepare('SELECT 1 FROM combo_products WHERE combo_id = ? AND product_id = ?')
        .get(comboId, productId);
    if (existing) {
        db.prepare('DELETE FROM combo_products WHERE combo_id = ? AND product_id = ?').run(comboId, productId);
        return false;
    }
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 value FROM combo_products WHERE combo_id = ?')
        .get(comboId).value;
    db.prepare('INSERT INTO combo_products (combo_id, product_id, sort_order) VALUES (?, ?, ?)')
        .run(comboId, productId, order);
    return true;
}

module.exports = {
    getSection,
    updateSection,
    getHotProducts,
    listHotMembership,
    toggleHotProduct,
    getCombos,
    getComboById,
    createCombo,
    updateCombo,
    listComboMembership,
    toggleComboProduct,
};
