const { createHmac, timingSafeEqual, randomUUID } = require('crypto');

// ── JWT (HS256, stateless) ────────────────────────────────────────────────────
// The signing secret comes only from the JWT_SECRET env var. There is deliberately
// NO hard-coded fallback: on a public repo a committed fallback would let anyone forge
// admin sessions. If JWT_SECRET is unset, signing throws and verification fails closed.

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJWT(payload) {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const b = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', s).update(`${h}.${b}`).digest());
  return `${h}.${b}.${sig}`;
}

function verifyJWT(token) {
  const s = process.env.JWT_SECRET;
  if (!s) return null; // fail closed — no secret means no valid sessions
  try {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) return null;
    const [h, b, sig] = parts;
    const expected = b64url(createHmac('sha256', s).update(`${h}.${b}`).digest());
    const a = Buffer.from(expected);
    const c = Buffer.from(sig);
    if (a.length !== c.length || !timingSafeEqual(a, c)) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function checkSession(req) {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return false;
  return verifyJWT(h.slice(7)) !== null;
}

module.exports = { signJWT, verifyJWT, checkSession, randomUUID };
