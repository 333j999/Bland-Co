const { createHmac, pbkdf2Sync, timingSafeEqual, randomBytes, randomUUID } = require('crypto');

// ── Base32 + TOTP (RFC 6238) ──────────────────────────────────────────────────

function b32Decode(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0;
  const out = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const idx = alpha.indexOf(c);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function genBase32Secret() {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(randomBytes(20), b => alpha[b % 32]).join('');
}

function calcTOTP(secret, w = 0) {
  const t = Math.floor(Date.now() / 1000 / 30) + w;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(t));
  const h = createHmac('sha1', b32Decode(secret)).update(msg).digest();
  const o = h[19] & 0x0f;
  const n = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000;
  return n.toString().padStart(6, '0');
}

function verifyTOTP(secret, token) {
  const t = (token ?? '').trim();
  if (!/^\d{6}$/.test(t)) return false;
  return [-1, 0, 1].some(w => calcTOTP(secret, w) === t);
}

// ── JWT (HS256, stateless) ────────────────────────────────────────────────────

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
  try {
    const s = process.env.JWT_SECRET;
    if (!s) return null;
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) return null;
    const [h, b, sig] = parts;
    const expected = b64url(createHmac('sha256', s).update(`${h}.${b}`).digest());
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Admin config (stored in KV) ───────────────────────────────────────────────

async function getAdminCfg({ kvGet, kvSet }) {
  let cfg = await kvGet('admin:config');
  if (!cfg) {
    const salt = randomBytes(32).toString('hex');
    const defaultPw = 'BlandAdmin2024!';
    cfg = {
      passwordHash:  pbkdf2Sync(defaultPw, salt, 100_000, 64, 'sha512').toString('hex'),
      passwordSalt:  salt,
      totpSecret:    genBase32Secret(),
      setupComplete: false,
    };
    await kvSet('admin:config', cfg);
    console.log('First run: default password is BlandAdmin2024! — complete 2FA setup at /login.html');
  }
  return cfg;
}

function checkPassword(password, cfg) {
  const ah = pbkdf2Sync(password, cfg.passwordSalt, 100_000, 64, 'sha512').toString('hex');
  try { return timingSafeEqual(Buffer.from(cfg.passwordHash, 'hex'), Buffer.from(ah, 'hex')); }
  catch { return false; }
}

function checkSession(req) {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return false;
  return verifyJWT(h.slice(7)) !== null;
}

module.exports = {
  genBase32Secret, verifyTOTP, signJWT, verifyJWT,
  getAdminCfg, checkPassword, checkSession, randomUUID,
};
