const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startHealthServer } = require('../src/healthServer');
const { createSePayWebhookHandler } = require('../src/sepayWebhook');

const SECRET = 'test-secret-that-is-at-least-32-bytes-long';

function sign(body, timestamp, secret = SECRET) {
    return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

test('accepts a valid SePay HMAC over the raw request body', async (t) => {
    const received = [];
    const nowSeconds = 1_800_000_000;
    const handler = createSePayWebhookHandler({
        secret: SECRET,
        nowSeconds: () => nowSeconds,
        processPayment: (payload, context) => received.push({ payload, context }),
    });
    const server = await startHealthServer(0, () => true, { sepayHandler: handler });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const body = JSON.stringify({ id: 92704, transferType: 'in', transferAmount: 8000 });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/sepay`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-sepay-timestamp': String(nowSeconds),
            'x-sepay-signature': sign(body, nowSeconds),
        },
        body,
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"success":true}');
    assert.equal(received.length, 1);
    assert.equal(received[0].payload.id, 92704);
    assert.match(received[0].context.payloadHash, /^[a-f0-9]{64}$/);
});

test('rejects an invalid or expired SePay signature before processing', async (t) => {
    let calls = 0;
    const nowSeconds = 1_800_000_000;
    const handler = createSePayWebhookHandler({
        secret: SECRET,
        nowSeconds: () => nowSeconds,
        processPayment: () => { calls += 1; },
    });
    const server = await startHealthServer(0, () => true, { sepayHandler: handler });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/webhooks/sepay`;
    const body = JSON.stringify({ id: 1 });

    let response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-sepay-timestamp': String(nowSeconds),
            'x-sepay-signature': sign(body, nowSeconds, 'wrong-secret-that-is-also-long-enough'),
        },
        body,
    });
    assert.equal(response.status, 401);

    const expired = nowSeconds - 301;
    response = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-sepay-timestamp': String(expired),
            'x-sepay-signature': sign(body, expired),
        },
        body,
    });
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
});

test('keeps the SePay endpoint disabled until a secret is configured', async (t) => {
    const handler = createSePayWebhookHandler({
        secret: '',
        processPayment: () => assert.fail('must not process without a secret'),
    });
    const server = await startHealthServer(0, () => true, { sepayHandler: handler });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/sepay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
    });
    assert.equal(response.status, 503);
});
