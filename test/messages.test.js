const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const messages = require('../src/utils/messages');

test('customer messages use the current escaped shop information', () => {
    const original = {
        shopName: config.SHOP_NAME,
        supportContact: config.SUPPORT_CONTACT,
    };
    try {
        config.SHOP_NAME = 'Shop & Store';
        config.SUPPORT_CONTACT = '@support_team';
        assert.match(messages.welcome('A < B'), /A &lt; B/);
        assert.match(messages.welcome('A < B'), /Shop &amp; Store/);
        assert.match(messages.supportInfo, /@support_team/);
    } finally {
        config.SHOP_NAME = original.shopName;
        config.SUPPORT_CONTACT = original.supportContact;
    }
});
