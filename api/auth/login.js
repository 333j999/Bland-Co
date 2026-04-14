const { getAdminCfg, checkPassword, signJWT } = require('../_lib/auth');
const { kvGet, kvSet }                        = require('../_lib/kv');
const { cors, json, parseBody }               = require('../_lib/helpers');

const SESSION_TTL = 8 * 3600;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { password } = await parseBody(req);
  if (!password) return json(res, 400, { error: 'Password required' });

  const cfg   = await getAdminCfg({ kvGet, kvSet });
  const match = checkPassword(password, cfg);

  if (!match) {
    await new Promise(r => setTimeout(r, 600));
    return json(res, 401, { error: 'Incorrect password' });
  }

  const iat = Math.floor(Date.now() / 1000);
  const session = signJWT({ sub: 'admin', iat, exp: iat + SESSION_TTL });
  json(res, 200, { session });
};
