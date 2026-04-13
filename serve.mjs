import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mjs': 'application/javascript',
};

const server = createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    urlPath = req.url.split('?')[0];
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = join(__dirname, urlPath);

  const tryRead = async (p) => {
    try {
      const data = await readFile(p);
      return data;
    } catch {
      return null;
    }
  };

  let data = await tryRead(filePath);
  let resolvedPath = filePath;

  if (!data) {
    resolvedPath = filePath + '.html';
    data = await tryRead(resolvedPath);
  }

  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found: ' + urlPath);
    return;
  }

  const ext = extname(resolvedPath).toLowerCase();
  const contentType = mime[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
});

server.listen(PORT, () => {
  console.log(`\n  Bland & Co Jewellers — Dev Server`);
  console.log(`  http://localhost:${PORT}\n`);
});
