const test = require('node:test');
const assert = require('node:assert/strict');
const { startHealthServer } = require('../src/healthServer');

test('health endpoint reflects bot readiness', async (t) => {
    let ready = false;
    const server = await startHealthServer(0, () => ready);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/healthz`;

    let response = await fetch(url);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'starting' });

    ready = true;
    response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
});
