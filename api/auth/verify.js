const { getAdminCfg, verifyTOTP, signJWT } = require('../_lib/auth');
const { kvGet, kvSet, kvDel }              = require('../_lib/kv');
const { cors, json, parseBody }            = require('../_lib/helpers');

const SESSION_TTL = 8 * 3600; // 8 hours in seconds

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { challenge, code } = await parseBody(req);
  if (!challenge || !code) return json(res, 400, { error: 'Missing fields' });

  const ch = await kvGet(`challenge:${challenge}`);
  if (!ch) return json(res, 401, { error: 'Challenge expired — please log in again' });

  const cfg = await getAdminCfg({ kvGet, kvSet });
  if (!verifyTOTP(cfg.totpSecret, code)) {
    await new Promise(r => setTimeout(r, 400));
    return json(res, 401, { error: 'Invalid code' });
  }

  await kvDel(`challenge:${challenge}`);
  const iat = Math.floor(Date.now() / 1000);
  const session = signJWT({ sub: 'admin', iat, exp: iat + SESSION_TTL });
  json(res, 200, { session });
};
