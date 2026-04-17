const { checkSession } = require('./_lib/auth');
const { kvGet, kvSet } = require('./_lib/kv');
const { cors, json, parseBody } = require('./_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }

  if (req.method === 'GET') {
    const settings = (await kvGet('site:settings')) ?? {};
    return json(res, 200, settings);
  }

  if (req.method === 'PUT') {
    if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });
    const body = await parseBody(req);
    const existing = (await kvGet('site:settings')) ?? {};
    const updated = { ...existing, ...body };
    await kvSet('site:settings', updated);
    return json(res, 200, updated);
  }

  json(res, 405, { error: 'Method not allowed' });
};
