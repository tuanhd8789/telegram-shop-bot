function normalizePaymentCode(value) {
    const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = compact.match(/PAY[A-Z0-9]{6}/);
    return match ? match[0] : '';
}

function normalizeAccount(value) {
    return String(value || '').replace(/\s+/g, '');
}

function payloadError(message) {
    const error = new Error(message);
    error.statusCode = 422;
    return error;
}

function createSePayPaymentService({ db, bankAccounts, adminId }) {
    const allowedAccounts = new Set(bankAccounts.map(normalizeAccount).filter(Boolean));
    const getTransaction = db.prepare(
        'SELECT transaction_id FROM payment_transactions WHERE transaction_id = ?'
    );
    const getExactOrder = db.prepare(`
        SELECT o.*, p.name AS product_name
        FROM orders o JOIN products p ON p.id = o.product_id
        WHERE o.payment_code = ?
    `);
    const getLegacyOrders = db.prepare(`
        SELECT o.*, p.name AS product_name
        FROM orders o JOIN products p ON p.id = o.product_id
        WHERE o.payment_code LIKE '%PAY%'
        ORDER BY o.id DESC LIMIT 500
    `);
    const insertTransaction = db.prepare(`
        INSERT INTO payment_transactions (
            transaction_id, order_id, transfer_amount, account_number, gateway,
            reference_code, payment_code, payload_hash, status, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const enqueueJob = db.prepare(`
        INSERT INTO telegram_jobs (
            dedupe_key, kind, order_id, chat_id, payload
        ) VALUES (?, ?, ?, ?, ?)
    `);

    function findOrder(paymentCode) {
        const exact = getExactOrder.get(paymentCode);
        if (exact) return exact;
        return getLegacyOrders.all().find(
            (order) => normalizePaymentCode(order.payment_code) === paymentCode
        );
    }

    function addTransaction(data, orderId, status, reason = null) {
        insertTransaction.run(
            data.transactionId,
            orderId,
            data.amount,
            data.accountNumber,
            data.gateway,
            data.referenceCode,
            data.paymentCode,
            data.payloadHash,
            status,
            reason
        );
    }

    function addAdminAlert(data, order, reason, details = {}) {
        if (!adminId) return;
        enqueueJob.run(
            `sepay:${data.transactionId}:admin-alert`,
            'admin_alert',
            order?.id || null,
            String(adminId),
            JSON.stringify({
                transactionId: data.transactionId,
                orderId: order?.id || null,
                reason,
                ...details,
            })
        );
    }

    const processTransaction = db.transaction((data) => {
        if (getTransaction.get(data.transactionId)) {
            return { status: 'duplicate' };
        }

        if (data.transferType !== 'in') {
            addTransaction(data, null, 'ignored_transfer_type', 'Only incoming transfers are accepted');
            return { status: 'ignored_transfer_type' };
        }
        if (!allowedAccounts.has(data.accountNumber)) {
            addTransaction(data, null, 'wrong_account', 'Receiving account does not match configuration');
            return { status: 'wrong_account' };
        }
        if (!data.paymentCode) {
            addTransaction(data, null, 'unmatched', 'No supported payment code found');
            return { status: 'unmatched' };
        }

        const order = findOrder(data.paymentCode);
        if (!order) {
            addTransaction(data, null, 'unmatched', 'No order matches the payment code');
            return { status: 'unmatched' };
        }
        if (order.status !== 'pending') {
            addTransaction(data, order.id, 'order_already_processed', `Order status is ${order.status}`);
            addAdminAlert(data, order, `Đơn đã ở trạng thái ${order.status} nhưng nhận thêm giao dịch`);
            return { status: 'order_already_processed', orderId: order.id };
        }
        if (data.amount !== order.total_price) {
            addTransaction(data, order.id, 'amount_mismatch', 'Transfer amount does not equal order total');
            addAdminAlert(data, order, 'Sai số tiền thanh toán', {
                expectedAmount: order.total_price,
                receivedAmount: data.amount,
            });
            return { status: 'amount_mismatch', orderId: order.id };
        }

        const stock = db.prepare(`
            SELECT id, data FROM stock
            WHERE product_id = ? AND is_sold = 0
            ORDER BY id ASC LIMIT ?
        `).all(order.product_id, order.quantity);

        addTransaction(data, order.id, 'accepted');
        const paid = db.prepare(`
            UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
        `).run(order.id);
        if (paid.changes !== 1) throw new Error('Order state changed while processing payment');

        if (stock.length < order.quantity) {
            addAdminAlert(data, order, 'Đã nhận đủ tiền nhưng thiếu kho giao tự động', {
                requiredStock: order.quantity,
                availableStock: stock.length,
                manualDelivery: true,
            });
            return { status: 'stock_shortage', orderId: order.id };
        }

        const reserveStock = db.prepare(`
            UPDATE stock
            SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP, sold_order_id = ?
            WHERE id = ? AND is_sold = 0
        `);
        for (const item of stock) {
            const reserved = reserveStock.run(order.user_id, order.id, item.id);
            if (reserved.changes !== 1) throw new Error('Stock item was reserved concurrently');
        }

        enqueueJob.run(
            `order:${order.id}:delivery`,
            'customer_delivery',
            order.id,
            String(order.user_id),
            JSON.stringify({
                orderId: order.id,
                productName: order.product_name,
                quantity: order.quantity,
                accounts: stock.map((item) => item.data),
            })
        );
        return { status: 'delivery_queued', orderId: order.id };
    });

    function process(payload, { payloadHash } = {}) {
        const transactionId = String(payload?.id ?? '').trim();
        const amount = Number(payload?.transferAmount);
        const accountNumber = normalizeAccount(payload?.accountNumber);
        const transferType = String(payload?.transferType || '').toLowerCase().trim();
        if (!transactionId || transactionId.length > 128) throw payloadError('Invalid transaction id');
        if (!Number.isSafeInteger(amount) || amount <= 0) throw payloadError('Invalid transfer amount');
        if (!accountNumber) throw payloadError('Missing receiving account');
        if (!transferType) throw payloadError('Missing transfer type');
        if (!/^[a-f0-9]{64}$/.test(payloadHash || '')) throw payloadError('Missing payload hash');

        const data = {
            transactionId,
            amount,
            accountNumber,
            transferType,
            paymentCode: normalizePaymentCode(payload.code) || normalizePaymentCode(payload.content),
            gateway: String(payload.gateway || '').slice(0, 100),
            referenceCode: String(payload.referenceCode || '').slice(0, 200),
            payloadHash,
        };
        return processTransaction.immediate(data);
    }

    return { process };
}

module.exports = { createSePayPaymentService, normalizePaymentCode };
