const { escapeHtml } = require('../utils/telegramMarkup');

function renderCustomerDelivery(payload) {
    const accounts = payload.accounts
        .map((account, index) => `${index + 1})\n${escapeHtml(account)}`)
        .join('\n');
    return (
        `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
        `🧾 Đơn hàng: <b>#${payload.orderId}</b>\n` +
        `📦 ${escapeHtml(payload.productName)} × ${payload.quantity}\n\n` +
        `🔑 <b>Thông tin sản phẩm:</b>\n${accounts}\n\n` +
        `Liên hệ với lệnh /hotro để được hỗ trợ ngay.`
    );
}

function renderAdminAlert(payload) {
    return (
        `💰 <b>GIAO DỊCH TIỀN VÀO</b>\n\n` +
        (payload.receivedAmount != null ? `💵 Số tiền: <b>${Number(payload.receivedAmount).toLocaleString('vi-VN')}đ</b>\n` : '') +
        (payload.gateway ? `🏦 Ngân hàng: <b>${escapeHtml(payload.gateway)}</b>\n` : '') +
        (payload.accountLast4 ? `💳 Tài khoản: <code>*${escapeHtml(payload.accountLast4)}</code>\n` : '') +
        (payload.paymentCode ? `🔖 Mã thanh toán: <code>${escapeHtml(payload.paymentCode)}</code>\n` : '') +
        (payload.referenceCode ? `↪️ Tham chiếu: <code>${escapeHtml(payload.referenceCode)}</code>\n` : '') +
        (payload.topupId ? `👛 Phiếu nạp ví: <b>#${payload.topupId}</b>\n` :
            `🧾 Đơn hàng: <b>${payload.orderId ? `#${payload.orderId}` : 'chưa khớp'}</b>\n`) +
        `📋 Kết quả: ${escapeHtml(payload.reason)}\n` +
        (payload.expectedAmount != null ? `💵 Số tiền cần nhận: <b>${Number(payload.expectedAmount).toLocaleString('vi-VN')}đ</b>\n` : '') +
        (payload.requiredStock != null ? `📦 Kho cần/có: <b>${payload.requiredStock}/${payload.availableStock}</b>\n` : '') +
        `🔎 SePay transaction: <code>${escapeHtml(payload.transactionId)}</code>` +
        (payload.manualDelivery ? `\n👉 Giao thủ công: <code>/confirm ${payload.orderId}</code>` : '')
    );
}

function renderWalletCredit(payload) {
    return (
        `✅ <b>NẠP VÍ THÀNH CÔNG</b>\n\n` +
        `🧾 Phiếu nạp: <b>#${payload.topupId}</b>\n` +
        `💵 Đã cộng: <b>${Number(payload.amount).toLocaleString('vi-VN')}đ</b>\n` +
        `👛 Số dư mới: <b>${Number(payload.balance).toLocaleString('vi-VN')}đ</b>`
    );
}

function renderJob(job) {
    const payload = JSON.parse(job.payload);
    if (job.kind === 'customer_delivery') return renderCustomerDelivery(payload);
    if (job.kind === 'admin_alert') return renderAdminAlert(payload);
    if (job.kind === 'wallet_credit') return renderWalletCredit(payload);
    throw new Error(`Unsupported Telegram job kind: ${job.kind}`);
}

function createDeliveryQueue({
    db,
    telegram,
    now = () => Date.now(),
    baseRetryMs = 5000,
    maxRetryMs = 5 * 60 * 1000,
}) {
    const claimNext = db.transaction((currentTime) => {
        const job = db.prepare(`
            SELECT * FROM telegram_jobs
            WHERE status IN ('pending', 'retry') AND next_attempt_at <= ?
            ORDER BY id ASC
            LIMIT 1
        `).get(currentTime);
        if (!job) return null;
        const claimed = db.prepare(`
            UPDATE telegram_jobs SET status = 'processing'
            WHERE id = ? AND status IN ('pending', 'retry')
        `).run(job.id);
        return claimed.changes === 1 ? job : null;
    });

    const markSent = db.transaction((job) => {
        db.prepare(`
            UPDATE telegram_jobs
            SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL
            WHERE id = ?
        `).run(job.id);
        if (job.kind === 'customer_delivery' && job.order_id != null) {
            db.prepare(`
                UPDATE orders
                SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'paid'
            `).run(job.order_id);
        }
    });

    async function processNext() {
        const job = claimNext.immediate(now());
        if (!job) return null;

        try {
            await telegram.sendMessage(job.chat_id, renderJob(job), { parse_mode: 'HTML' });
            markSent.immediate(job);
            return { status: 'sent', jobId: job.id };
        } catch (error) {
            const attempts = job.attempts + 1;
            const retryDelay = Math.min(maxRetryMs, baseRetryMs * (2 ** (attempts - 1)));
            db.prepare(`
                UPDATE telegram_jobs
                SET status = 'retry', attempts = ?, next_attempt_at = ?, last_error = ?
                WHERE id = ?
            `).run(attempts, now() + retryDelay, String(error.message || error).slice(0, 500), job.id);
            return { status: 'retry', jobId: job.id };
        }
    }

    async function drain(limit = 10) {
        for (let index = 0; index < limit; index += 1) {
            const result = await processNext();
            if (!result) break;
        }
    }

    function start(intervalMs = 5000) {
        db.prepare(`
            UPDATE telegram_jobs SET status = 'retry', next_attempt_at = 0
            WHERE status = 'processing'
        `).run();
        let running = false;
        const run = async () => {
            if (running) return;
            running = true;
            try {
                await drain();
            } catch (error) {
                console.error('Telegram delivery queue failed:', error.message);
            } finally {
                running = false;
            }
        };
        void run();
        const timer = setInterval(run, intervalMs);
        timer.unref();
        return () => clearInterval(timer);
    }

    return { processNext, drain, start };
}

module.exports = { createDeliveryQueue, renderJob };
