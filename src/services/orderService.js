const db = require('../database');
const { queueManualDelivery } = require('./manualDeliveryService');
const { allocateOrderStock, reserveAllocatedStock } = require('./fulfillmentService');

const orderService = {
  /**
   * Create a new order
   */
  create(userId, productId, quantity, totalPrice, paymentCode) {
    const result = db.prepare(`
      INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(userId, productId, quantity, totalPrice, paymentCode);

    return this.getById(result.lastInsertRowid);
  },

  createCombo(userId, combo, quantity, totalPrice, paymentCode) {
    const anchor = db.prepare('SELECT product_id FROM combo_products WHERE combo_id = ? ORDER BY sort_order, product_id LIMIT 1')
      .get(combo.id);
    if (!anchor) throw new Error('Combo chưa có sản phẩm');
    const result = db.prepare(`
      INSERT INTO orders (user_id, product_id, combo_id, quantity, total_price, payment_code, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(userId, anchor.product_id, combo.id, quantity, totalPrice, paymentCode);
    return this.getById(result.lastInsertRowid);
  },

  /**
   * Get order by ID
   */
  getById(id) {
    return db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      WHERE o.id = ?
    `).get(id);
  },

  /**
   * Get order by payment code
   */
  getByPaymentCode(code) {
    return db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      WHERE o.payment_code = ?
    `).get(code);
  },

  /**
   * Get user's pending orders
   */
  getPendingByUser(userId) {
    return db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      WHERE o.user_id = ? AND o.status = 'pending'
      ORDER BY o.created_at DESC
    `).all(userId);
  },

  /**
   * Get user's recent orders
   */
  getRecentByUser(userId, limit = 5) {
    return db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  },

  /**
   * Confirm payment and deliver products
   * Returns { success, accounts, error }
   */
  confirmAndDeliver(orderId) {
    const deliver = db.transaction(() => {
      const order = this.getById(orderId);
      if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
      if (!['pending', 'paid'].includes(order.status)) return { success: false, error: 'Đơn hàng đã được xử lý' };
      const allocation = allocateOrderStock(db, order);
      if (!allocation.success) {
        return { success: false, error: `Không đủ hàng. Tối đa còn ${allocation.available} lượt mua.` };
      }
      reserveAllocatedStock(db, order, allocation.items);
      db.prepare(`
        UPDATE orders SET status = 'delivered', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), delivered_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending', 'paid')
      `).run(orderId);
      const deliveryItems = allocation.items.map((item) => ({
        ...(order.combo_id ? { productName: item.productName } : {}),
        data: item.data,
        buyerMessage: item.buyer_message || null,
      }));
      return { success: true, accounts: deliveryItems.map((item) => item.data), deliveryItems, order };
    });
    return deliver.immediate();
  },

  /**
   * Mark order as paid (waiting for admin to provide account info)
   */
  markPaid(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    db.prepare(`
      UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    return { success: true, order };
  },

  /**
   * Queue admin-provided account data for the persistent Telegram worker.
   */
  queueManualDelivery(orderId, accounts) {
    return queueManualDelivery(db, orderId, accounts);
  },

  getDeliveryJob(orderId) {
    return db.prepare(`
      SELECT status, attempts, last_error
      FROM telegram_jobs
      WHERE dedupe_key = ?
    `).get(`order:${orderId}:delivery`);
  },

  /**
   * Cancel order
   */
  cancel(orderId) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(orderId);
  },

  /**
   * Get all pending orders (for admin)
   */
  getAllPending() {
    return db.prepare(`
      SELECT o.*, COALESCE(c.name, p.name) as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN combos c ON c.id = o.combo_id
      JOIN users u ON o.user_id = u.telegram_id
      WHERE o.status = 'pending'
      ORDER BY o.created_at ASC
    `).all();
  },

  /**
   * Get stats
   */
  getStats() {
    const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_price), 0) as s FROM orders WHERE status = 'delivered'").get().s;
    const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;
    const totalStock = db.prepare('SELECT COUNT(*) as c FROM stock WHERE is_sold = 0').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    return { totalOrders, totalRevenue, pendingOrders, totalStock, totalUsers };
  },
};

module.exports = orderService;
