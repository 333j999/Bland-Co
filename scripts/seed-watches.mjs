// ─────────────────────────────────────────────────────────────────────────────
// Bulk-import organized watch folders into the Bland & Co inventory (Cloudflare R2).
//
// For each "<media-dir>/<watch-slug>/" folder it:
//   1. uploads every file in  images/  to R2 (key: inventory/<slug>/<file>)
//   2. converts every  videos/*.mov → .mp4 (ffmpeg) and uploads to R2
//   3. creates ONE inventory record in Convex with a curated display name, a guide
//      price, the public R2 URLs (images[]/videos[]) and imageUrl = first photo (cover).
//
// Safe to re-run: folders whose curated name already exists in inventory are skipped.
//
// ── Required env (.env.local, or exported) ──
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
//   CONVEX_URL, CONVEX_BACKEND_SECRET
//   (optional) FFMPEG=/path/to/ffmpeg   — defaults to "ffmpeg" on PATH
//
// ── Usage ──
//   node scripts/seed-watches.mjs --dir "C:/path/to/organized-folder" [--dry-run]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import r2lib from '../api/_lib/r2.js';

const { presignR2Put } = r2lib;

// ── tiny .env.local loader (no dependency) ──
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dirIdx = args.indexOf('--dir');
const DEFAULT_DIR = path.join(os.homedir(), 'Downloads', 'wetransfer_img_4900-jpeg_2026-05-20_1749');
const MEDIA_DIR = dirIdx >= 0 ? args[dirIdx + 1] : DEFAULT_DIR;

const R2 = {
  accountId:       process.env.R2_ACCOUNT_ID,
  accessKeyId:     process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket:          process.env.R2_BUCKET,
};
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const { CONVEX_URL, CONVEX_BACKEND_SECRET } = process.env;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// Folders that are NOT a single sellable watch (mixed bags / multi-watch shots).
const SKIP = new Set(['_group-shots', '_non-watches', '_unidentified']);

// Curated display names. Anything not listed falls back to a title-cased slug.
const NAMES = {
  'audemars-piguet-royal-oak-chrono-blue':            'Audemars Piguet Royal Oak Chronograph — Blue Dial',
  'audemars-piguet-royal-oak-chrono-yellow-gold':     'Audemars Piguet Royal Oak Chronograph — Yellow Gold, Blue Dial',
  'audemars-piguet-royal-oak-chrono-yellow-gold-grey':'Audemars Piguet Royal Oak Chronograph — Yellow Gold, Grey Dial',
  'audemars-piguet-royal-oak-openworked':             'Audemars Piguet Royal Oak — Openworked',
  'rolex-datejust-36-everose-silver':                 'Rolex Datejust 36 — Everose Rolesor, Silver Dial',
  'rolex-datejust-41-blue-roman':                     'Rolex Datejust 41 — Blue Roman Dial',
  'rolex-datejust-41-everose-chocolate':              'Rolex Datejust 41 — Everose Rolesor, Chocolate Dial',
  'rolex-datejust-41-everose-sundust':                'Rolex Datejust 41 — Everose Rolesor, Sundust Dial',
  'rolex-datejust-41-mint-green':                     'Rolex Datejust 41 — Mint Green Dial',
  'rolex-datejust-41-two-tone-wimbledon':             'Rolex Datejust 41 — Two-Tone, Wimbledon Dial',
  'rolex-datejust-41-wimbledon-steel':                'Rolex Datejust 41 — Wimbledon Dial',
  'rolex-datejust-mint-green':                        'Rolex Datejust — Mint Green Dial',
  'rolex-day-date-platinum-ice-blue':                 'Rolex Day-Date 40 — Platinum, Ice Blue Dial',
  'rolex-daytona-everose-chocolate':                  'Rolex Cosmograph Daytona — Everose, Chocolate Dial',
  'rolex-daytona-two-tone-black':                     'Rolex Cosmograph Daytona — Two-Tone, Black Dial',
  'rolex-daytona-white-gold-black':                   'Rolex Cosmograph Daytona — White Gold, Black Dial',
  'rolex-daytona-yellow-gold-blue':                   'Rolex Cosmograph Daytona — Yellow Gold, Blue Dial',
  'rolex-gmt-master-ii-batman':                       'Rolex GMT-Master II — "Batman"',
  'rolex-gmt-master-ii-black':                        'Rolex GMT-Master II — Black Bezel',
  'rolex-gmt-master-ii-root-beer':                    'Rolex GMT-Master II — "Root Beer"',
  'rolex-sky-dweller-blue':                           'Rolex Sky-Dweller — Blue Dial',
  'rolex-sky-dweller-mint-green':                     'Rolex Sky-Dweller — Mint Green Dial',
  'rolex-sky-dweller-yellow-gold':                    'Rolex Sky-Dweller — Yellow Gold',
  'rolex-yacht-master-everose':                       'Rolex Yacht-Master 40 — Everose',
};
const titleize = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Approximate UK secondary-market GUIDE prices (£), researched May 2026. Confirm/adjust
// per piece in the admin. Left blank where the exact spec swings the price too much.
const PRICES = {
  'audemars-piguet-royal-oak-chrono-blue': 45000,
  'rolex-datejust-36-everose-silver': 11500, 'rolex-datejust-41-blue-roman': 10500,
  'rolex-datejust-41-everose-chocolate': 13500, 'rolex-datejust-41-everose-sundust': 13500,
  'rolex-datejust-41-mint-green': 12000, 'rolex-datejust-41-two-tone-wimbledon': 12000,
  'rolex-datejust-41-wimbledon-steel': 10000, 'rolex-datejust-mint-green': 10500,
  'rolex-day-date-platinum-ice-blue': 47500, 'rolex-daytona-everose-chocolate': 37500,
  'rolex-daytona-two-tone-black': 16000, 'rolex-daytona-white-gold-black': 40000,
  'rolex-daytona-yellow-gold-blue': 40000, 'rolex-gmt-master-ii-batman': 13000,
  'rolex-gmt-master-ii-black': 13000, 'rolex-gmt-master-ii-root-beer': 14000,
  'rolex-sky-dweller-blue': 17500, 'rolex-sky-dweller-mint-green': 18000,
  'rolex-sky-dweller-yellow-gold': 34000, 'rolex-yacht-master-everose': 23500,
};

const IMG_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const VID_RE = /\.(mov|mp4|webm|m4v)$/i;
const listFiles = (dir, re) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => re.test(f)).sort().map(f => path.join(dir, f))
  : [];
const CT = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp',
             '.gif':'image/gif', '.avif':'image/avif', '.mp4':'video/mp4' };
const contentType = f => CT[path.extname(f).toLowerCase()] || 'application/octet-stream';

// ── R2 upload (presigned PUT, mirrors api/upload-signature.js) ──
async function r2Put(localPath, key) {
  const url = presignR2Put({ ...R2, key, expires: 600 });
  const body = fs.readFileSync(localPath);
  const r = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType(localPath) } });
  if (!r.ok) throw new Error(`R2 PUT ${r.status} for ${key}`);
  return `${PUBLIC_BASE}/${key}`;
}

// Transcode .mov/.webm/.m4v → .mp4 (H.264/AAC, faststart) for cross-browser playback.
function toMp4(src) {
  if (/\.mp4$/i.test(src)) return src;
  const out = path.join(os.tmpdir(), `seed-${path.basename(src).replace(/\.[^.]+$/, '')}.mp4`);
  const r = spawnSync(FFMPEG, ['-y', '-i', src, '-c:v', 'libx264', '-preset', 'veryfast',
                               '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', out], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`ffmpeg failed for ${path.basename(src)} (is ffmpeg installed / on PATH?)`);
  return out;
}

// ── Convex HTTP (mirrors api/_lib/convex.js) ──
async function convex(kind, fnPath, cargs) {
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fnPath, args: { ...cargs, secret: CONVEX_BACKEND_SECRET }, format: 'json' }),
  });
  const out = await r.json().catch(() => ({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}

async function main() {
  const need = { R2_ACCOUNT_ID: R2.accountId, R2_ACCESS_KEY_ID: R2.accessKeyId, R2_SECRET_ACCESS_KEY: R2.secretAccessKey,
                 R2_BUCKET: R2.bucket, R2_PUBLIC_BASE_URL: PUBLIC_BASE, CONVEX_URL, CONVEX_BACKEND_SECRET };
  const missing = Object.keys(need).filter(k => !need[k]);
  if (missing.length && !DRY) { console.error('Missing env vars:', missing.join(', ')); process.exit(1); }
  if (!fs.existsSync(MEDIA_DIR)) { console.error('Media dir not found:', MEDIA_DIR); process.exit(1); }

  console.log(`Media dir : ${MEDIA_DIR}`);
  console.log(`R2 bucket : ${R2.bucket || '(unset)'}  →  ${PUBLIC_BASE || '(unset)'}`);
  console.log(`Mode      : ${DRY ? 'DRY RUN (no uploads, no writes)' : 'LIVE'}\n`);

  let existing = new Set();
  if (!DRY) {
    const rows = await convex('query', 'records:list', { resource: 'inventory' });
    existing = new Set((rows || []).map(r => (r.name || '').toLowerCase()));
  }

  const folders = fs.readdirSync(MEDIA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !SKIP.has(d.name)).map(d => d.name).sort();

  let created = 0, skipped = 0;
  for (const slug of folders) {
    const name = NAMES[slug] || titleize(slug);
    const base = path.join(MEDIA_DIR, slug);
    const imgFiles = listFiles(path.join(base, 'images'), IMG_RE);
    const vidFiles = listFiles(path.join(base, 'videos'), VID_RE);
    if (!imgFiles.length && !vidFiles.length) { console.log(`· skip  ${slug} (no media)`); continue; }
    if (existing.has(name.toLowerCase())) { console.log(`· skip  ${name} (already in inventory)`); skipped++; continue; }

    const priceLabel = (PRICES[slug] != null) ? `£${PRICES[slug].toLocaleString('en-GB')}` : '— (blank)';
    console.log(`→ ${name}\n    ${imgFiles.length} photo(s), ${vidFiles.length} video(s) · ${priceLabel}`);
    if (DRY) { created++; continue; }

    const images = [];
    for (const f of imgFiles) {
      process.stdout.write(`    img ${path.basename(f)} … `);
      images.push(await r2Put(f, `inventory/${slug}/${path.basename(f)}`));
      console.log('ok');
    }
    const videos = [];
    for (const f of vidFiles) {
      process.stdout.write(`    vid ${path.basename(f)} → mp4 … `);
      const mp4 = toMp4(f);
      const keyName = `${path.basename(f).replace(/\.[^.]+$/, '')}.mp4`;
      videos.push(await r2Put(mp4, `inventory/${slug}/${keyName}`));
      if (mp4 !== f) { try { fs.unlinkSync(mp4); } catch {} }
      console.log('ok');
    }

    const recId = `inv_${crypto.randomBytes(4).toString('hex')}`;
    const data = {
      id: recId, name, category: 'watches', status: 'available',
      price: (PRICES[slug] ?? null), reference: '', condition: 'Excellent', paperwork: 'Unknown',
      description: '', imageUrl: images[0] || '', images, videos,
      createdAt: new Date().toISOString(),
    };
    await convex('mutation', 'records:create', { resource: 'inventory', recId, data });
    console.log(`    ✓ created ${recId}\n`);
    created++;
  }

  console.log(`\nDone. ${created} ${DRY ? 'would be created' : 'created'}, ${skipped} skipped.`);
  if (!DRY) console.log('Set prices & condition for each piece in the admin → Inventory.');
}

main().catch(e => { console.error('\nFailed:', e.message); process.exit(1); });
