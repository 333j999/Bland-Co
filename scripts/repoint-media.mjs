// Re-point inventory media URLs to a new R2 public base (host swap), keeping the object
// path/key intact. Use when the R2 public base URL changes (e.g. you enable a different
// r2.dev URL or attach a custom domain) after records were already seeded.
//
// Rewrites imageUrl + images[] + videos[] on every inventory record whose URL points at an
// R2 host (*.r2.dev or *.r2.cloudflarestorage.com).
//
// Env: CONVEX_URL, CONVEX_BACKEND_SECRET (from .env.local)
// Usage:
//   node scripts/repoint-media.mjs --to https://media.blandco.com [--from https://old-base] [--dry-run]
//   (if --to omitted, uses R2_PUBLIC_BASE_URL from env)

import fs from 'node:fs';
import path from 'node:path';

for (const f of ['.env.local', '.env']) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const TO = (argVal('--to') || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const FROM = (argVal('--from') || '').replace(/\/+$/, '');
const { CONVEX_URL, CONVEX_BACKEND_SECRET } = process.env;

if (!TO) { console.error('No target base. Pass --to <url> or set R2_PUBLIC_BASE_URL.'); process.exit(1); }
if (!CONVEX_URL || !CONVEX_BACKEND_SECRET) { console.error('CONVEX_URL / CONVEX_BACKEND_SECRET missing.'); process.exit(1); }

const isR2 = (u) => /^https?:\/\/[^/]*\.r2\.(dev|cloudflarestorage\.com)/i.test(u || '');
function repoint(u) {
  if (!u) return u;
  if (FROM) return u.startsWith(FROM) ? TO + u.slice(FROM.length) : u;
  if (!isR2(u)) return u;
  return u.replace(/^https?:\/\/[^/]+/, TO); // swap origin, keep /key path
}

async function convex(kind, fnPath, cargs) {
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fnPath, args: { ...cargs, secret: CONVEX_BACKEND_SECRET }, format: 'json' }),
  });
  const out = await r.json().catch(() => ({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}

const rows = await convex('query', 'records:list', { resource: 'inventory' });
console.log(`Target base: ${TO}${FROM ? `  (from ${FROM})` : ''}`);
console.log(`Mode: ${DRY ? 'DRY RUN' : 'LIVE'} · ${rows.length} inventory rows\n`);

let changed = 0;
for (const it of rows) {
  const imageUrl = repoint(it.imageUrl);
  const images = (it.images || []).map(repoint);
  const videos = (it.videos || []).map(repoint);
  const diff = imageUrl !== it.imageUrl
    || JSON.stringify(images) !== JSON.stringify(it.images || [])
    || JSON.stringify(videos) !== JSON.stringify(it.videos || []);
  if (!diff) continue;
  changed++;
  console.log(`${DRY ? 'would update' : 'updating'}: ${it.name}`);
  if (!DRY) await convex('mutation', 'records:update', { recId: it.id, patch: { imageUrl, images, videos } });
}
console.log(`\n${changed} record(s) ${DRY ? 'would change' : 'updated'}.`);
