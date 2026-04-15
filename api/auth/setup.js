const { getAdminCfg } = require('../_lib/auth');
const { kvGet, kvSet } = require('../_lib/kv');
const { cors, json }   = require('../_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const cfg = await getAdminCfg({ kvGet, kvSet });
  if (cfg.setupComplete) return json(res, 403, { error: 'Setup already complete' });

  const issuer  = 'Bland+%26+Co+Admin';
  const account = 'admin';
  const uri = `otpauth://totp/${issuer}:${account}?secret=${cfg.totpSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  json(res, 200, { uri, secret: cfg.totpSecret });
};
