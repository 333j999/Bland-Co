const { signJWT }       = require('../_lib/auth');
const { cors, json, parseBody } = require('../_lib/helpers');

const SESSION_TTL = 8 * 3600;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { password } = await parseBody(req);
  if (!password) return json(res, 400, { error: 'Password required' });

  // Password stored in ADMIN_PASSWORD env var; falls back to default
  const adminPassword = process.env.ADMIN_PASSWORD || 'BlandAdmin2024!';
  if (password !== adminPassword) {
    await new Promise(r => setTimeout(r, 600));
    return json(res, 401, { error: 'Incorrect password' });
  }

  const iat = Math.floor(Date.now() / 1000);
  const session = signJWT({ sub: 'admin', iat, exp: iat + SESSION_TTL });
  json(res, 200, { session });
};
