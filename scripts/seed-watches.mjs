// ─────────────────────────────────────────────────────────────────────────────
// Bulk-import organized watch folders into the Bland & Co inventory.
//
// For each "<media-dir>/<watch-slug>/" folder it:
//   1. uploads every file in  images/  (and the cover) to Cloudinary (resource_type=image)
//   2. uploads every file in  videos/  to Cloudinary (resource_type=video)
//   3. creates ONE inventory record in Convex with a curated display name, the
//      uploaded URLs (images[]/videos[]) and imageUrl = first photo (the cover).
//
// It is safe to re-run: folders whose curated name already exists in inventory are
// skipped. Price is left blank on purpose — fill it in later via the admin.
//
// ── Required env (put in .env.local, or export before running) ──
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   CONVEX_URL, CONVEX_BACKEND_SECRET
//
// ── Usage ──
//   node scripts/seed-watches.mjs --dir "C:/path/to/organized-folder" [--dry-run]
//   (defaults --dir to the WeTransfer folder under the current user's Downloads)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

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

// ── args ──
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dirIdx = args.indexOf('--dir');
const DEFAULT_DIR = path.join(os.homedir(), 'Downloads', 'wetransfer_img_4900-jpeg_2026-05-20_1749');
const MEDIA_DIR = dirIdx >= 0 ? args[dirIdx + 1] : DEFAULT_DIR;

const { CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: KEY, CLOUDINARY_API_SECRET: SECRET,
        CONVEX_URL, CONVEX_BACKEND_SECRET } = process.env;

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
// per piece in the admin — these don't account for the specific year/condition/papers.
// Left out (null) where the exact spec swings the price too much to call: the yellow-gold
// AP chronographs and the AP Openworked grail.
const PRICES = {
  'audemars-piguet-royal-oak-chrono-blue':            45000,
  'rolex-datejust-36-everose-silver':                 11500,
  'rolex-datejust-41-blue-roman':                     10500,
  'rolex-datejust-41-everose-chocolate':              13500,
  'rolex-datejust-41-everose-sundust':                13500,
  'rolex-datejust-41-mint-green':                     12000,
  'rolex-datejust-41-two-tone-wimbledon':             12000,
  'rolex-datejust-41-wimbledon-steel':                10000,
  'rolex-datejust-mint-green':                        10500,
  'rolex-day-date-platinum-ice-blue':                 47500,
  'rolex-daytona-everose-chocolate':                  37500,
  'rolex-daytona-two-tone-black':                     16000,
  'rolex-daytona-white-gold-black':                   40000,
  'rolex-daytona-yellow-gold-blue':                   40000,
  'rolex-gmt-master-ii-batman':                       13000,
  'rolex-gmt-master-ii-black':                        13000,
  'rolex-gmt-master-ii-root-beer':                    14000,
  'rolex-sky-dweller-blue':                           17500,
  'rolex-sky-dweller-mint-green':                     18000,
  'rolex-sky-dweller-yellow-gold':                    34000,
  'rolex-yacht-master-everose':                       23500,
};

const IMG_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const VID_RE = /\.(mov|mp4|webm|m4v)$/i;
const listFiles = (dir, re) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => re.test(f)).sort().map(f => path.join(dir, f))
  : [];

// ── Cloudinary signed upload (mirrors api/upload-signature.js) ──
async function cloudinaryUpload(filePath, kind) {
  const resourceType = kind === 'video' ? 'video' : 'image';
  const folder = 'bland-co/inventory';
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${SECRET}`).digest('hex');

  const fd = new FormData();
  const buf = fs.readFileSync(filePath);
  fd.append('file', new Blob([buf]), path.basename(filePath));
  fd.append('api_key', KEY);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);

  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`, { method: 'POST', body: fd });
  const out = await r.json();
  if (!out.secure_url) throw new Error(out.error?.message || `Cloudinary ${resourceType} upload failed`);
  return out.secure_url;
}

// ── Convex HTTP (mirrors api/_lib/convex.js) ──
async function convex(kind, fnPath, cargs) {
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fnPath, args: { ...cargs, secret: CONVEX_BACKEND_SECRET }, format: 'json' }),
  });
  const out = await r.json().catch(() => ({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}

async function main() {
  const missing = ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','CONVEX_URL','CONVEX_BACKEND_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length && !DRY) { console.error('Missing env vars:', missing.join(', ')); process.exit(1); }
  if (!fs.existsSync(MEDIA_DIR)) { console.error('Media dir not found:', MEDIA_DIR); process.exit(1); }

  console.log(`Media dir : ${MEDIA_DIR}`);
  console.log(`Mode      : ${DRY ? 'DRY RUN (no uploads, no writes)' : 'LIVE'}\n`);

  // Existing names → skip duplicates (idempotent re-runs).
  let existing = new Set();
  if (!DRY) {
    const rows = await convex('query', 'records:list', { resource: 'inventory' });
    existing = new Set((rows || []).map(r => (r.name || '').toLowerCase()));
  }

  const folders = fs.readdirSync(MEDIA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !SKIP.has(d.name))
    .map(d => d.name).sort();

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
    for (const f of imgFiles) { process.stdout.write(`    img ${path.basename(f)} … `); images.push(await cloudinaryUpload(f, 'image')); console.log('ok'); }
    const videos = [];
    for (const f of vidFiles) { process.stdout.write(`    vid ${path.basename(f)} … `); videos.push(await cloudinaryUpload(f, 'video')); console.log('ok'); }

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
