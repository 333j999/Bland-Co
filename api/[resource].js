const { checkSession, randomUUID } = require('./_lib/auth');
const { kvGet, kvSet }             = require('./_lib/kv');
const { cors, json, parseBody }    = require('./_lib/helpers');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];
const read  = async r => (await kvGet(`data:${r}`)) ?? [];
const write = async (r, d) => kvSet(`data:${r}`, d);

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });

  const { resource } = req.query;
  if (!RESOURCES.includes(resource)) return json(res, 404, { error: 'Unknown resource' });

  const data = await read(resource);

  if (req.method === 'GET') return json(res, 200, data);

  if (req.method === 'POST') {
    const payload = await parseBody(req);
    const item = { id: `${resource.slice(0,3)}_${randomUUID().slice(0,8)}`, ...payload, createdAt: new Date().toISOString() };
    data.push(item);
    await write(resource, data);
    return json(res, 201, item);
  }

  json(res, 405, { error: 'Method not allowed' });
};
