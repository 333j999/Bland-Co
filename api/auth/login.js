const { getAdminCfg, checkPassword, randomUUID } = require('../_lib/auth');
const { kvGet, kvSet }                           = require('../_lib/kv');
const { cors, json, parseBody }                  = require('../_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { password } = await parseBody(req);
  if (!password) return json(res, 400, { error: 'Password required' });

  const cfg   = await getAdminCfg({ kvGet, kvSet });
  const match = checkPassword(password, cfg);

  if (!match) {
    await new Promise(r => setTimeout(r, 600)); // brute-force delay
    return json(res, 401, { error: 'Incorrect password' });
  }

  const challenge = randomUUID();
  await kvSet(`challenge:${challenge}`, { at: Date.now() }, 300); // 5-min TTL
  json(res, 200, { challenge, setupRequired: !cfg.setupComplete });
};
