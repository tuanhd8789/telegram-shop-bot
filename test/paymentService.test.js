const test = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../src/services/paymentService');

test('generates a SePay-compatible payment code', () => {
    assert.match(paymentService.generatePaymentCode(), /^PAY[A-Z0-9]{6}$/);
});
