const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const port = Number(process.argv[3] || 8080);

const mime = { 
  '.html': 'text/html; charset=utf-8', 
  '.js': 'application/javascript; charset=utf-8', 
  '.css': 'text/css; charset=utf-8', 
  '.json': 'application/json; charset=utf-8', 
  '.svg': 'image/svg+xml', 
  '.png': 'image/png' 
};

// Memory cache to prevent Disk/OneDrive latency
const cache = new Map();

function preloadDist(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        preloadDist(fullPath);
      } else {
        cache.set(fullPath, fs.readFileSync(fullPath));
      }
    }
  } catch (e) {
    console.error('Preload failed:', e);
  }
}

preloadDist(root);

const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);

  // Quick console log
  console.log(`${new Date().toISOString()} ${req.method} ${urlPath}`);

  if (cache.has(filePath)) {
    sendFile(res, filePath, cache.get(filePath));
    return;
  }

  // Fallback for missing files
  fs.readFile(filePath, (err, data) => {
    if (err) { 
      res.writeHead(404, { 'access-control-allow-origin': '*' }); 
      res.end('not found'); 
      return; 
    }
    cache.set(filePath, data);
    sendFile(res, filePath, data);
  });
});

function sendFile(res, filePath, data) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': mime[ext] || 'application/octet-stream',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'baggage, sentry-trace, content-type',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'close' // Close connection immediately for faster local response
  });
  res.end(data);
}

server.listen(port, '127.0.0.1', () => {
  console.log('Low-Latency static remnote bridge on 127.0.0.1:' + port);
});
