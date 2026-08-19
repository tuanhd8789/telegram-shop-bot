function getOrderRequirements(database, order) {
    if (order.combo_id) {
        return database.prepare(`
            SELECT p.id product_id, p.name product_name, ? quantity
            FROM combo_products cp JOIN products p ON p.id = cp.product_id
            WHERE cp.combo_id = ? ORDER BY cp.sort_order, p.id
        `).all(order.quantity, order.combo_id);
    }
    return [{ product_id: order.product_id, product_name: order.product_name, quantity: order.quantity }];
}

function allocateOrderStock(database, order) {
    const requirements = getOrderRequirements(database, order);
    if (!requirements.length) return { success: false, available: 0, items: [] };
    const items = [];
    let available = Infinity;
    for (const requirement of requirements) {
        const count = database.prepare(
            'SELECT COUNT(*) count FROM stock WHERE product_id = ? AND is_sold = 0'
        ).get(requirement.product_id).count;
        available = Math.min(available, count);
        const stock = database.prepare(`
            SELECT id, data, buyer_message FROM stock
            WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT ?
        `).all(requirement.product_id, requirement.quantity);
        items.push(...stock.map((item) => ({
            ...item,
            productId: requirement.product_id,
            productName: requirement.product_name,
        })));
    }
    return {
        success: items.length === requirements.length * order.quantity,
        available: Number.isFinite(available) ? available : 0,
        items,
    };
}

function reserveAllocatedStock(database, order, items) {
    const reserve = database.prepare(`
        UPDATE stock SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP, sold_order_id = ?
        WHERE id = ? AND is_sold = 0
    `);
    for (const item of items) {
        if (reserve.run(order.user_id, order.id, item.id).changes !== 1) {
            throw new Error('Stock item was reserved concurrently');
        }
    }
}

module.exports = { getOrderRequirements, allocateOrderStock, reserveAllocatedStock };
