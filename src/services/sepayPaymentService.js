const { allocateOrderStock, reserveAllocatedStock } = require('./fulfillmentService');

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
    const hasComboSchema = Boolean(db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'combos'"
    ).get());
    const orderNameSelect = hasComboSchema
        ? 'o.*, COALESCE(c.name, p.name) AS product_name'
        : 'o.*, p.name AS product_name';
    const comboJoin = hasComboSchema ? 'LEFT JOIN combos c ON c.id = o.combo_id' : '';
    const allowedAccounts = new Set(bankAccounts.map(normalizeAccount).filter(Boolean));
    const getTransaction = db.prepare(
        'SELECT transaction_id FROM payment_transactions WHERE transaction_id = ?'
    );
    const getExactOrder = db.prepare(`
        SELECT ${orderNameSelect}
        FROM orders o JOIN products p ON p.id = o.product_id
        ${comboJoin}
        WHERE o.payment_code = ?
    `);
    const getTopup = db.prepare(`
        SELECT t.*, u.balance
        FROM wallet_topups t JOIN users u ON u.telegram_id = t.user_id
        WHERE t.payment_code = ?
    `);
    const getLegacyOrders = db.prepare(`
        SELECT ${orderNameSelect}
        FROM orders o JOIN products p ON p.id = o.product_id
        ${comboJoin}
        WHERE o.payment_code LIKE '%PAY%'
        ORDER BY o.id DESC LIMIT 500
    `);
    const insertTransaction = db.prepare(`
        INSERT INTO payment_transactions (
            transaction_id, order_id, topup_id, transfer_amount, account_number, gateway,
            reference_code, payment_code, payload_hash, status, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    function addTransaction(data, orderId, topupId, status, reason = null) {
        insertTransaction.run(
            data.transactionId,
            orderId,
            topupId,
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
                receivedAmount: data.amount,
                accountLast4: data.accountNumber.slice(-4),
                gateway: data.gateway,
                paymentCode: data.paymentCode,
                referenceCode: data.referenceCode,
                ...details,
            })
        );
    }

    const processTransaction = db.transaction((data) => {
        if (getTransaction.get(data.transactionId)) {
            return { status: 'duplicate' };
        }

        if (data.transferType !== 'in') {
            addTransaction(data, null, null, 'ignored_transfer_type', 'Only incoming transfers are accepted');
            return { status: 'ignored_transfer_type' };
        }
        if (!allowedAccounts.has(data.accountNumber)) {
            addTransaction(data, null, null, 'wrong_account', 'Receiving account does not match configuration');
            return { status: 'wrong_account' };
        }
        if (!data.paymentCode) {
            addTransaction(data, null, null, 'unmatched', 'No supported payment code found');
            addAdminAlert(data, null, 'Có tiền vào nhưng không có mã thanh toán');
            return { status: 'unmatched' };
        }

        const order = findOrder(data.paymentCode);
        if (!order) {
            const topup = getTopup.get(data.paymentCode);
            if (topup) {
                if (topup.status !== 'pending') {
                    addTransaction(data, null, topup.id, 'topup_already_processed', `Top-up status is ${topup.status}`);
                    addAdminAlert(data, null, `Phiếu nạp ví đã ở trạng thái ${topup.status}`, { topupId: topup.id });
                    return { status: 'topup_already_processed', topupId: topup.id };
                }
                if (data.amount !== topup.amount) {
                    addTransaction(data, null, topup.id, 'topup_amount_mismatch', 'Transfer amount does not equal top-up amount');
                    addAdminAlert(data, null, 'Sai số tiền nạp ví', {
                        topupId: topup.id,
                        expectedAmount: topup.amount,
                    });
                    return { status: 'topup_amount_mismatch', topupId: topup.id };
                }

                addTransaction(data, null, topup.id, 'wallet_credited');
                db.prepare(`
                    UPDATE wallet_topups SET status = 'paid', paid_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND status = 'pending'
                `).run(topup.id);
                db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?')
                    .run(topup.amount, topup.user_id);
                enqueueJob.run(
                    `sepay:${data.transactionId}:wallet-credit`,
                    'wallet_credit',
                    null,
                    String(topup.user_id),
                    JSON.stringify({
                        topupId: topup.id,
                        amount: topup.amount,
                        balance: topup.balance + topup.amount,
                    })
                );
                addAdminAlert(data, null, 'Đã khớp phiếu nạp và cộng ví', { topupId: topup.id });
                return { status: 'wallet_credited', topupId: topup.id };
            }

            addTransaction(data, null, null, 'unmatched', 'No order or top-up matches the payment code');
            addAdminAlert(data, null, 'Có tiền vào nhưng chưa khớp đơn hàng');
            return { status: 'unmatched' };
        }
        if (order.status !== 'pending') {
            addTransaction(data, order.id, null, 'order_already_processed', `Order status is ${order.status}`);
            addAdminAlert(data, order, `Đơn đã ở trạng thái ${order.status} nhưng nhận thêm giao dịch`);
            return { status: 'order_already_processed', orderId: order.id };
        }
        if (data.amount !== order.total_price) {
            addTransaction(data, order.id, null, 'amount_mismatch', 'Transfer amount does not equal order total');
            addAdminAlert(data, order, 'Sai số tiền thanh toán', {
                expectedAmount: order.total_price,
                receivedAmount: data.amount,
            });
            return { status: 'amount_mismatch', orderId: order.id };
        }

        const allocation = allocateOrderStock(db, order);

        addTransaction(data, order.id, null, 'accepted');
        const paid = db.prepare(`
            UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
        `).run(order.id);
        if (paid.changes !== 1) throw new Error('Order state changed while processing payment');

        if (!allocation.success) {
            addAdminAlert(data, order, 'Đã nhận đủ tiền nhưng thiếu kho giao tự động', {
                requiredStock: order.quantity,
                availableStock: allocation.available,
                manualDelivery: true,
            });
            return { status: 'stock_shortage', orderId: order.id };
        }
        reserveAllocatedStock(db, order, allocation.items);

        addAdminAlert(data, order, 'Đã nhận tiền, khớp đơn và xếp hàng giao tự động');
        enqueueJob.run(
            `order:${order.id}:delivery`,
            'customer_delivery',
            order.id,
            String(order.user_id),
            JSON.stringify({
                orderId: order.id,
                productName: order.product_name,
                quantity: order.quantity,
                items: allocation.items.map((item) => ({
                    ...(order.combo_id ? { productName: item.productName } : {}),
                    data: item.data,
                    buyerMessage: item.buyer_message || null,
                })),
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
