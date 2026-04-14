const { checkSession } = require('../_lib/auth');
const { kvGet, kvSet } = require('../_lib/kv');
const { cors, json, parseBody } = require('../_lib/helpers');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];
const read  = async r => (await kvGet(`data:${r}`)) ?? [];
const write = async (r, d) => kvSet(`data:${r}`, d);

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });

  const { resource, id } = req.query;
  if (!RESOURCES.includes(resource)) return json(res, 404, { error: 'Unknown resource' });

  const data = await read(resource);

  if (req.method === 'GET') {
    const item = data.find(i => i.id === id);
    return item ? json(res, 200, item) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'PUT') {
    const idx = data.findIndex(i => i.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    const payload = await parseBody(req);
    data[idx] = { ...data[idx], ...payload, id, updatedAt: new Date().toISOString() };
    await write(resource, data);
    return json(res, 200, data[idx]);
  }

  if (req.method === 'DELETE') {
    const idx = data.findIndex(i => i.id === id);
    if (idx === -1) return json(res, 404, { error: 'Not found' });
    const [removed] = data.splice(idx, 1);
    await write(resource, data);
    return json(res, 200, removed);
  }

  json(res, 405, { error: 'Method not allowed' });
};
