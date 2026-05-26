const { signJWT }               = require('../_lib/auth');
const { cors, json, parseBody } = require('../_lib/helpers');
const { timingSafeEqual }       = require('crypto');

const SESSION_TTL = 8 * 3600; // 8 hours in seconds

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { password } = await parseBody(req);
    if (!password) return json(res, 400, { error: 'Password required' });

    // No committed defaults: both must be provided via env (Vercel project settings).
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || !process.env.JWT_SECRET) {
      return json(res, 503, { error: 'Admin login is not configured. Set ADMIN_PASSWORD and JWT_SECRET.' });
    }

    if (!safeEqual(password, adminPassword)) {
      await new Promise(r => setTimeout(r, 600)); // slow down brute force
      return json(res, 401, { error: 'Incorrect password' });
    }

    const iat = Math.floor(Date.now() / 1000);
    const session = signJWT({ sub: 'admin', iat, exp: iat + SESSION_TTL });
    json(res, 200, { session });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
