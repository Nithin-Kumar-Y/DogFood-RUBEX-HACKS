'use strict';
// Static frontend + /api reverse proxy — the local-run substitute for nginx.
const http = require('http');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', 'frontend');
const API_PORT = parseInt(process.env.PORT || '3000', 10);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.png': 'image/png',
};

function startFrontend(port = 8080) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/health/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.url.startsWith('/api/')) {
      const proxy = http.request(
        {
          host: '127.0.0.1',
          port: API_PORT,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: '127.0.0.1:' + API_PORT },
        },
        (back) => {
          res.writeHead(back.statusCode, back.headers);
          back.pipe(res);
        }
      );
      proxy.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'backend unavailable' }));
      });
      req.pipe(proxy);
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const normFront = path.normalize(FRONT);
    const file = path.join(normFront, path.normalize(p).replace(/^([/\\])+/, ''));
    if (file !== normFront && !file.startsWith(normFront + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA fallback: unknown non-asset paths serve the app shell.
        fs.readFile(path.join(normFront, 'index.html'), (e2, d2) => {
          if (e2) {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(d2);
        });
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[start] Frontend on http://localhost:${port}`);
      resolve(server);
    });
  });
}

module.exports = { startFrontend };
