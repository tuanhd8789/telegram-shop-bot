const http = require('http');

function createHealthServer(isReady, { sepayHandler } = {}) {
    return http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhooks/sepay' && sepayHandler) {
            Promise.resolve(sepayHandler(req, res)).catch((error) => {
                console.error('SePay webhook failed:', error.message);
                if (!res.headersSent) {
                    const body = JSON.stringify({ success: false });
                    res.writeHead(500, {
                        'content-type': 'application/json; charset=utf-8',
                        'content-length': Buffer.byteLength(body),
                        'cache-control': 'no-store',
                    });
                    res.end(body);
                }
            });
            return;
        }

        if (req.method !== 'GET' || req.url !== '/healthz') {
            res.writeHead(404).end();
            return;
        }

        const ready = isReady();
        const body = JSON.stringify({ status: ready ? 'ok' : 'starting' });
        res.writeHead(ready ? 200 : 503, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(body),
            'cache-control': 'no-store',
        });
        res.end(body);
    });
}

function startHealthServer(port, isReady, options) {
    return new Promise((resolve, reject) => {
        const server = createHealthServer(isReady, options).listen(port, '0.0.0.0', () => resolve(server));
        server.once('error', reject);
    });
}

module.exports = { createHealthServer, startHealthServer };
