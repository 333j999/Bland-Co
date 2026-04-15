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

  const { resource, id } = req.query;
  if (!RESOURCES.includes(resource)) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Unknown resource' }));
  }

  try {
    if (req.method === 'GET') {
      const r = await sb(`/${resource}?id=eq.${encodeURIComponent(id)}&select=*`);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Not found' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ id: rows[0].id, ...rows[0].data }));
    }

    if (req.method === 'PUT') {
      const existing = await sb(`/${resource}?id=eq.${encodeURIComponent(id)}&select=*`);
      const rows = await existing.json();
      if (!Array.isArray(rows) || !rows.length) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Not found' }));
      }

      const payload = await parseBody(req);
      const { id: _id, ...changes } = payload;
      const mergedData = { ...rows[0].data, ...changes, updatedAt: new Date().toISOString() };

      const r = await sb(`/${resource}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: mergedData }),
      });
      if (!r.ok) {
        const detail = await r.text();
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'DB error', detail }));
      }
      const result = await r.json();
      const row = Array.isArray(result) ? result[0] : result;
      res.writeHead(200);
      return res.end(JSON.stringify({ id: row.id, ...row.data }));
    }

    if (req.method === 'DELETE') {
      const r = await sb(`/${resource}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'DB error' }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ id }));
    }

    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
