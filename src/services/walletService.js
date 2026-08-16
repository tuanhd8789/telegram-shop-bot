const db = require('../database');

const walletService = {
    createTopup(userId, amount, paymentCode) {
        const result = db.prepare(`
            INSERT INTO wallet_topups (user_id, amount, payment_code)
            VALUES (?, ?, ?)
        `).run(userId, amount, paymentCode);
        return db.prepare('SELECT * FROM wallet_topups WHERE id = ?').get(result.lastInsertRowid);
    },

    getRecentTopups(userId, limit = 5) {
        return db.prepare(`
            SELECT * FROM wallet_topups
            WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(userId, limit);
    },
};

module.exports = walletService;
