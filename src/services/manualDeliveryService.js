function queueManualDelivery(database, orderId, accounts) {
    const queue = database.transaction(() => {
        const order = database.prepare(`
            SELECT o.*, p.name AS product_name
            FROM orders o JOIN products p ON p.id = o.product_id
            WHERE o.id = ?
        `).get(orderId);
        if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
        if (order.status !== 'paid') {
            return { success: false, error: 'Đơn hàng chưa ở trạng thái đã thanh toán' };
        }
        if (!Array.isArray(accounts) || accounts.length !== order.quantity) {
            return {
                success: false,
                error: `Cần đúng ${order.quantity} dòng dữ liệu giao hàng`,
            };
        }

        const existing = database.prepare(
            'SELECT status FROM telegram_jobs WHERE dedupe_key = ?'
        ).get(`order:${order.id}:delivery`);
        if (existing) {
            return { success: false, error: `Đơn đã có job giao hàng (${existing.status})` };
        }

        const items = accounts.map((line) => {
            const value = String(line).trim();
            const separator = value.indexOf('||');
            if (separator === -1) return { data: value, buyerMessage: null };
            return {
                data: value.slice(0, separator).trim(),
                buyerMessage: value.slice(separator + 2).trim() || null,
            };
        });
        if (items.some((item) => !item.data)) {
            return { success: false, error: 'Dữ liệu giao hàng không được để trống trước dấu ||' };
        }

        database.prepare(`
            INSERT INTO telegram_jobs (dedupe_key, kind, order_id, chat_id, payload)
            VALUES (?, 'customer_delivery', ?, ?, ?)
        `).run(
            `order:${order.id}:delivery`,
            order.id,
            String(order.user_id),
            JSON.stringify({
                orderId: order.id,
                productName: order.product_name,
                quantity: order.quantity,
                items,
            })
        );
        database.prepare(`
            UPDATE products SET sheet_stock = MAX(sheet_stock - ?, 0)
            WHERE id = ?
        `).run(order.quantity, order.product_id);
        return { success: true, order };
    });
    return queue.immediate();
}

module.exports = { queueManualDelivery };
