const { signJWT }       = require('../_lib/auth');
const { cors, json, parseBody } = require('../_lib/helpers');

const SESSION_TTL = 8 * 3600;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { password } = await parseBody(req);
    if (!password) return json(res, 400, { error: 'Password required' });

    const adminPassword = process.env.ADMIN_PASSWORD || 'BlandAdmin2024!';
    if (password !== adminPassword) {
      await new Promise(r => setTimeout(r, 600));
      return json(res, 401, { error: 'Incorrect password' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'dev-secret-set-JWT_SECRET-in-vercel';
    const iat = Math.floor(Date.now() / 1000);
    const session = signJWT({ sub: 'admin', iat, exp: iat + SESSION_TTL }, jwtSecret);
    json(res, 200, { session });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
