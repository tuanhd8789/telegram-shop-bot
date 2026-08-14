const http = require('http');

function createHealthServer(isReady) {
    return http.createServer((req, res) => {
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

function startHealthServer(port, isReady) {
    return new Promise((resolve, reject) => {
        const server = createHealthServer(isReady).listen(port, '0.0.0.0', () => resolve(server));
        server.once('error', reject);
    });
}

module.exports = { createHealthServer, startHealthServer };
