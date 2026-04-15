const { randomUUID } = require('crypto');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];

const sb = (path, opts = {}) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });

const parseBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const { resource } = req.query;
  if (!RESOURCES.includes(resource)) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Unknown resource' }));
  }

  try {
    if (req.method === 'GET') {
      const r = await sb(`/${resource}?select=*&order=created_at.desc`);
      const rows = await r.json();
      if (!Array.isArray(rows)) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'DB error', detail: rows }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify(rows.map(({ id, data }) => ({ id, ...data }))));
    }

    if (req.method === 'POST') {
      const payload = await parseBody(req);
      const id = `${resource.slice(0, 3)}_${randomUUID().slice(0, 8)}`;
      const { id: _id, createdAt: _c, ...rest } = payload;
      const r = await sb(`/${resource}`, {
        method: 'POST',
        body: JSON.stringify({ id, data: { ...rest, createdAt: new Date().toISOString() } }),
      });
      if (!r.ok) {
        const detail = await r.text();
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'DB error', detail }));
      }
      const result = await r.json();
      const row = Array.isArray(result) ? result[0] : result;
      res.writeHead(201);
      return res.end(JSON.stringify({ id: row.id, ...row.data }));
    }

    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
