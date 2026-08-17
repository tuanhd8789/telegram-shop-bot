const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../src/utils/messages');

test('legacy confirmed orders use the same plain product information format', () => {
    const message = messages.orderSuccess(
        { name: 'Sản phẩm <Admin>' },
        1,
        ['Nội dung đã soạn & sẵn sàng giao']
    );

    assert.match(message, /Thông tin sản phẩm:/);
    assert.match(message, /Sản phẩm &lt;Admin&gt;/);
    assert.match(message, /Nội dung đã soạn &amp; sẵn sàng giao/);
    assert.match(message, /Liên hệ với lệnh \/hotro để được hỗ trợ ngay\./);
    assert.doesNotMatch(message, /<code>/);
    assert.doesNotMatch(message, /Thông tin tài khoản|outlook\.com|passchatgpt/);
    assert.match(messages.orderSuccessNotify(1), /1 sản phẩm/);
});
