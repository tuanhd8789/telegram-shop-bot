const crypto = require('crypto');

const MAX_BODY_BYTES = 64 * 1024;

function writeJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
    });
    res.end(body);
}

function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;

        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                tooLarge = true;
                return;
            }
            chunks.push(chunk);
        });
        req.once('end', () => {
            if (tooLarge) {
                const error = new Error('Webhook body is too large');
                error.statusCode = 413;
                reject(error);
                return;
            }
            resolve(Buffer.concat(chunks));
        });
        req.once('error', reject);
    });
}

function verifySePaySignature({ rawBody, signature, timestamp, secret, currentTime, toleranceSeconds }) {
    if (!/^\d+$/.test(timestamp || '')) return false;
    const timestampNumber = Number(timestamp);
    if (!Number.isSafeInteger(timestampNumber)) return false;
    if (Math.abs(currentTime - timestampNumber) > toleranceSeconds) return false;

    const expected = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest('hex')}`;
    const actualBuffer = Buffer.from(signature || '', 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSePayWebhookHandler({
    secret,
    processPayment,
    nowSeconds = () => Math.floor(Date.now() / 1000),
    toleranceSeconds = 300,
    maxBodyBytes = MAX_BODY_BYTES,
    onResult = () => {},
}) {
    if (typeof processPayment !== 'function') {
        throw new TypeError('processPayment must be a function');
    }

    return async (req, res) => {
        if (!secret) {
            writeJson(res, 503, { success: false });
            return;
        }
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
            writeJson(res, 415, { success: false });
            return;
        }

        let rawBody;
        try {
            rawBody = await readRawBody(req, maxBodyBytes);
        } catch (error) {
            writeJson(res, error.statusCode || 400, { success: false });
            return;
        }

        const signatureValid = verifySePaySignature({
            rawBody,
            signature: req.headers['x-sepay-signature'],
            timestamp: req.headers['x-sepay-timestamp'],
            secret,
            currentTime: nowSeconds(),
            toleranceSeconds,
        });
        if (!signatureValid) {
            writeJson(res, 401, { success: false });
            return;
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch (error) {
            writeJson(res, 400, { success: false });
            return;
        }

        try {
            const result = await processPayment(payload, {
                payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
            });
            onResult(result);
            writeJson(res, 200, { success: true });
        } catch (error) {
            writeJson(res, error.statusCode || 500, { success: false });
        }
    };
}

module.exports = {
    createSePayWebhookHandler,
    verifySePaySignature,
};
