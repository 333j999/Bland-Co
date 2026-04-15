import { createServer }                                          from 'http';
import { readFile, writeFile, mkdir }                           from 'fs/promises';
import { extname, join }                                        from 'path';
import { fileURLToPath }                                        from 'url';
import { randomUUID, pbkdf2Sync, randomBytes,
         createHmac, timingSafeEqual }                          from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT      = 3000;
const DATA_DIR  = join(__dirname, 'data');

await mkdir(DATA_DIR, { recursive: true });

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];
for (const r of RESOURCES) {
  const p = join(DATA_DIR, `${r}.json`);
  try { await readFile(p); } catch { await writeFile(p, '[]'); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const readData  = async (r) => JSON.parse(await readFile(join(DATA_DIR, `${r}.json`), 'utf8'));
const writeData = async (r, d) => writeFile(join(DATA_DIR, `${r}.json`), JSON.stringify(d, null, 2));

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
};

const bodyJSON = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  req.on('error', reject);
});

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// ── Admin Config (password + TOTP secret) ─────────────────────────────────────
// To change the password:
//   1. Generate a new hash: node -e "const {pbkdf2Sync,randomBytes}=require('crypto');
//      const salt=randomBytes(32).toString('hex');
//      const hash=pbkdf2Sync('YOUR_NEW_PASSWORD',salt,100000,64,'sha512').toString('hex');
//      console.log(JSON.stringify({passwordHash:hash,passwordSalt:salt}))"
//   2. Update passwordHash + passwordSalt in admin-config.json
//   Alternatively manage via Supabase Storage / Secrets and write the file on deploy.

const CONFIG_PATH = join(__dirname, 'admin-config.json');
let adminCfg;

try {
  adminCfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
} catch {
  // First run — generate secure defaults
  const salt = randomBytes(32).toString('hex');
  const defaultPw = 'BlandAdmin2024!';
  adminCfg = {
    passwordHash:  pbkdf2Sync(defaultPw, salt, 100_000, 64, 'sha512').toString('hex'),
    passwordSalt:  salt,
    totpSecret:    genBase32Secret(),
    setupComplete: false,
  };
  await writeFile(CONFIG_PATH, JSON.stringify(adminCfg, null, 2));
  console.log('\n  !! First-run setup detected');
  console.log(`  Default password : ${defaultPw}`);
  console.log('  Visit http://localhost:' + PORT + '/login.html to configure 2FA\n');
}

// ── TOTP — RFC 6238 / HOTP — RFC 4226 ────────────────────────────────────────

function genBase32Secret() {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(randomBytes(20), b => alpha[b % 32]).join('');
}

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

function calcTOTP(secret, windowOffset = 0) {
  const t = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(t));
  const h = createHmac('sha1', b32Decode(secret)).update(msg).digest();
  const o = h[19] & 0x0f;
  const n = ((h[o] & 0x7f) << 24 | h[o+1] << 16 | h[o+2] << 8 | h[o+3]) % 1_000_000;
  return n.toString().padStart(6, '0');
}

function verifyTOTP(secret, token) {
  const t = (token ?? '').trim();
  if (!/^\d{6}$/.test(t)) return false;
  return [-1, 0, 1].some(w => calcTOTP(secret, w) === t);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const sessions   = new Map(); // sessionToken  → { at }
const challenges = new Map(); // challengeToken → { at }

const SESSION_TTL   = 8 * 3600 * 1000;   // 8 hours
const CHALLENGE_TTL = 5 * 60  * 1000;    // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions)   if (now - v.at > SESSION_TTL)   sessions.delete(k);
  for (const [k, v] of challenges) if (now - v.at > CHALLENGE_TTL) challenges.delete(k);
}, 60_000);

function checkSession(req) {
  const h = (req.headers.authorization ?? '');
  if (!h.startsWith('Bearer ')) return false;
  const s = sessions.get(h.slice(7));
  if (!s) return false;
  if (Date.now() - s.at > SESSION_TTL) { sessions.delete(h.slice(7)); return false; }
  return true;
}

// ── Stats helper ──────────────────────────────────────────────────────────────

const getStats = async () => {
  const [inv, enq, val, tes, con] = await Promise.all(RESOURCES.map(readData));
  return {
    inventory:     { total: inv.length, available: inv.filter(i=>i.status==='available').length, reserved: inv.filter(i=>i.status==='reserved').length, sold: inv.filter(i=>i.status==='sold').length },
    enquiries:     { total: enq.length, new: enq.filter(e=>e.status==='new').length, contacted: enq.filter(e=>e.status==='contacted').length, closed: enq.filter(e=>e.status==='closed').length },
    valuations:    { total: val.length, pending: val.filter(v=>v.status==='pending').length, offered: val.filter(v=>v.status==='offered').length },
    testimonials:  { total: tes.length, visible: tes.filter(t=>t.visible).length },
    consultations: { total: con.length, pending: con.filter(c=>c.status==='pending').length, confirmed: con.filter(c=>c.status==='confirmed').length, today: con.filter(c=>c.preferredDate===new Date().toISOString().slice(0,10)).length },
  };
};

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const method = req.method.toUpperCase();
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { urlPath = req.url.split('?')[0]; }

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  // ── Auth API (/api/auth/*) — no session required ──────────────────────────

  if (urlPath.startsWith('/api/auth/')) {
    const sub = urlPath.slice(9); // e.g. 'login', 'verify', 'check'

    // GET /api/auth/check
    if (sub === 'check' && method === 'GET') {
      return json(res, checkSession(req) ? 200 : 401, { ok: checkSession(req) });
    }

    // POST /api/auth/logout
    if (sub === 'logout' && method === 'POST') {
      const h = req.headers.authorization ?? '';
      if (h.startsWith('Bearer ')) sessions.delete(h.slice(7));
      return json(res, 200, { ok: true });
    }

    // GET /api/auth/setup  — returns OTPAuth URI + raw secret (only before setup complete)
    if (sub === 'setup' && method === 'GET') {
      if (adminCfg.setupComplete) return json(res, 403, { error: 'Setup already complete' });
      const issuer  = 'Bland+%26+Co+Admin';
      const account = 'admin';
      const uri = `otpauth://totp/${issuer}:${account}?secret=${adminCfg.totpSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      return json(res, 200, { uri, secret: adminCfg.totpSecret });
    }

    // POST /api/auth/complete-setup  — verify first TOTP code then lock setup
    if (sub === 'complete-setup' && method === 'POST') {
      if (adminCfg.setupComplete) return json(res, 403, { error: 'Setup already complete' });
      const { code } = await bodyJSON(req);
      if (!verifyTOTP(adminCfg.totpSecret, code)) return json(res, 401, { error: 'Invalid code — try again' });
      adminCfg.setupComplete = true;
      await writeFile(CONFIG_PATH, JSON.stringify(adminCfg, null, 2));
      return json(res, 200, { ok: true });
    }

    // POST /api/auth/login  — step 1: password → challenge token
    if (sub === 'login' && method === 'POST') {
      const { password } = await bodyJSON(req);
      if (!password) return json(res, 400, { error: 'Password required' });

      const attemptHash = pbkdf2Sync(password, adminCfg.passwordSalt, 100_000, 64, 'sha512').toString('hex');
      const storedBuf   = Buffer.from(adminCfg.passwordHash, 'hex');
      const attemptBuf  = Buffer.from(attemptHash, 'hex');

      let match = false;
      try { match = timingSafeEqual(storedBuf, attemptBuf); } catch { match = false; }
      if (!match) {
        // Fixed-time delay to frustrate brute-force
        await new Promise(r => setTimeout(r, 600));
        return json(res, 401, { error: 'Incorrect password' });
      }

      const challenge = randomUUID();
      challenges.set(challenge, { at: Date.now() });
      return json(res, 200, { challenge, setupRequired: !adminCfg.setupComplete });
    }

    // POST /api/auth/verify  — step 2: TOTP → session token
    if (sub === 'verify' && method === 'POST') {
      const { challenge, code } = await bodyJSON(req);
      if (!challenge || !code) return json(res, 400, { error: 'Missing fields' });

      const ch = challenges.get(challenge);
      if (!ch || Date.now() - ch.at > CHALLENGE_TTL) return json(res, 401, { error: 'Challenge expired — please log in again' });
      if (!verifyTOTP(adminCfg.totpSecret, code)) {
        await new Promise(r => setTimeout(r, 400));
        return json(res, 401, { error: 'Invalid code' });
      }

      challenges.delete(challenge);
      const session = randomUUID();
      sessions.set(session, { at: Date.now() });
      return json(res, 200, { session });
    }

    return json(res, 404, { error: 'Unknown auth route' });
  }

  // ── Protected API (/api/*) — session required ─────────────────────────────

  if (urlPath.startsWith('/api/')) {
    if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });

    const parts    = urlPath.slice(5).split('/').filter(Boolean);
    const resource = parts[0];
    const id       = parts[1];

    if (resource === 'stats' && method === 'GET') return json(res, 200, await getStats());

    if (!RESOURCES.includes(resource)) return json(res, 404, { error: 'Unknown resource' });

    try {
      const data = await readData(resource);

      if (!id && method === 'GET')  return json(res, 200, data);

      if (!id && method === 'POST') {
        const payload = await bodyJSON(req);
        const item = { id: `${resource.slice(0,3)}_${randomUUID().slice(0,8)}`, ...payload, createdAt: new Date().toISOString() };
        data.push(item);
        await writeData(resource, data);
        return json(res, 201, item);
      }

      if (id && method === 'GET') {
        const item = data.find(i => i.id === id);
        return item ? json(res, 200, item) : json(res, 404, { error: 'Not found' });
      }

      if (id && method === 'PUT') {
        const idx = data.findIndex(i => i.id === id);
        if (idx === -1) return json(res, 404, { error: 'Not found' });
        const payload = await bodyJSON(req);
        data[idx] = { ...data[idx], ...payload, id, updatedAt: new Date().toISOString() };
        await writeData(resource, data);
        return json(res, 200, data[idx]);
      }

      if (id && method === 'DELETE') {
        const idx = data.findIndex(i => i.id === id);
        if (idx === -1) return json(res, 404, { error: 'Not found' });
        const [removed] = data.splice(idx, 1);
        await writeData(resource, data);
        return json(res, 200, removed);
      }

      return json(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: 'Internal server error' });
    }
  }

  // ── Static files ──────────────────────────────────────────────────────────

  if (urlPath === '/') urlPath = '/index.html';
  const filePath = join(__dirname, urlPath);
  const tryRead  = async (p) => { try { return await readFile(p); } catch { return null; } };

  let fileData = await tryRead(filePath);
  let resolved = filePath;
  if (!fileData) { resolved = filePath + '.html'; fileData = await tryRead(resolved); }

  if (!fileData) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  const ct = mime[extname(resolved).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  res.end(fileData);
});

server.listen(PORT, () => {
  console.log(`\n  Bland & Co — Dev Server`);
  console.log(`  Site:  http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/login.html\n`);
});
