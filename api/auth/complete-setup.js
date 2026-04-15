const { getAdminCfg, verifyTOTP } = require('../_lib/auth');
const { kvGet, kvSet }             = require('../_lib/kv');
const { cors, json, parseBody }    = require('../_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const cfg = await getAdminCfg({ kvGet, kvSet });
  if (cfg.setupComplete) return json(res, 403, { error: 'Setup already complete' });

  const { code } = await parseBody(req);
  if (!verifyTOTP(cfg.totpSecret, code)) return json(res, 401, { error: 'Invalid code — try again' });

  cfg.setupComplete = true;
  await kvSet('admin:config', cfg);
  json(res, 200, { ok: true });
};
