import { createServer } from 'http';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3000;
const DATA_DIR = join(__dirname, 'data');

await mkdir(DATA_DIR, { recursive: true });

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];

for (const r of RESOURCES) {
  const p = join(DATA_DIR, `${r}.json`);
  try { await readFile(p); } catch { await writeFile(p, '[]'); }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const readData  = async (r) => JSON.parse(await readFile(join(DATA_DIR, `${r}.json`), 'utf8'));
const writeData = async (r, d) => writeFile(join(DATA_DIR, `${r}.json`), JSON.stringify(d, null, 2));

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
};

const body = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  req.on('error', reject);
});

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// ── Stats ─────────────────────────────────────────────────────────────────────

const getStats = async () => {
  const [inv, enq, val, tes, con] = await Promise.all(RESOURCES.map(readData));
  return {
    inventory: {
      total:     inv.length,
      available: inv.filter(i => i.status === 'available').length,
      reserved:  inv.filter(i => i.status === 'reserved').length,
      sold:      inv.filter(i => i.status === 'sold').length,
    },
    enquiries: {
      total:     enq.length,
      new:       enq.filter(e => e.status === 'new').length,
      contacted: enq.filter(e => e.status === 'contacted').length,
      closed:    enq.filter(e => e.status === 'closed').length,
    },
    valuations: {
      total:   val.length,
      pending: val.filter(v => v.status === 'pending').length,
      offered: val.filter(v => v.status === 'offered').length,
    },
    testimonials: {
      total:   tes.length,
      visible: tes.filter(t => t.visible).length,
    },
    consultations: {
      total:     con.length,
      pending:   con.filter(c => c.status === 'pending').length,
      confirmed: con.filter(c => c.status === 'confirmed').length,
      today:     con.filter(c => c.preferredDate === new Date().toISOString().slice(0,10)).length,
    },
  };
};

// ── Router ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const method = req.method.toUpperCase();
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { urlPath = req.url.split('?')[0]; }

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ── API routes ──────────────────────────────────────────────────────────────
  if (urlPath.startsWith('/api/')) {
    const parts    = urlPath.slice(5).split('/').filter(Boolean);
    const resource = parts[0];
    const id       = parts[1];

    if (resource === 'stats' && method === 'GET') {
      return json(res, 200, await getStats());
    }

    if (!RESOURCES.includes(resource)) {
      return json(res, 404, { error: 'Unknown resource' });
    }

    try {
      const data = await readData(resource);

      if (!id && method === 'GET')  return json(res, 200, data);

      if (!id && method === 'POST') {
        const payload = await body(req);
        const item = { id: `${resource.slice(0,3)}_${randomUUID().slice(0,8)}`, ...payload, createdAt: new Date().toISOString() };
        data.push(item);
        await writeData(resource, data);
        return json(res, 201, item);
      }

      if (id && method === 'GET') {
        const item = data.find(i => i.id === id);
        return item ? json(res, 200, item) : json(res, 404, { error: 'Not found' });
      }

      if (id && method === 'PUT') {
        const idx = data.findIndex(i => i.id === id);
        if (idx === -1) return json(res, 404, { error: 'Not found' });
        const payload = await body(req);
        data[idx] = { ...data[idx], ...payload, id, updatedAt: new Date().toISOString() };
        await writeData(resource, data);
        return json(res, 200, data[idx]);
      }

      if (id && method === 'DELETE') {
        const idx = data.findIndex(i => i.id === id);
        if (idx === -1) return json(res, 404, { error: 'Not found' });
        const [removed] = data.splice(idx, 1);
        await writeData(resource, data);
        return json(res, 200, removed);
      }

      return json(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: 'Internal server error' });
    }
  }

  // ── Static files ────────────────────────────────────────────────────────────
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = join(__dirname, urlPath);
  const tryRead  = async (p) => { try { return await readFile(p); } catch { return null; } };

  let data = await tryRead(filePath);
  let resolvedPath = filePath;
  if (!data) { resolvedPath = filePath + '.html'; data = await tryRead(resolvedPath); }

  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  const ct = mime[extname(resolvedPath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  res.end(data);
});

server.listen(PORT, () => {
  console.log(`\n  Bland & Co — Dev Server`);
  console.log(`  Site:  http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin.html\n`);
});
