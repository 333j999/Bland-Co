// Seed the non-watch inventory (precious metals + jewellery) from the _non-watches
// folder, which the watch seed deliberately skipped. Curated mapping below (the folder
// is a flat grab-bag, so each listing names the file(s) it owns). Uploads originals +
// a card thumbnail to R2 and creates Convex records. Prices left blank (bullion = spot /
// ask). Idempotent by name.
//
// Env: R2_*, CONVEX_URL, CONVEX_BACKEND_SECRET, FFMPEG (optional).
// Usage: node scripts/seed-extras.mjs --dir "C:/path/to/organized-folder" [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import r2lib from '../api/_lib/r2.js';
const { presignR2Put } = r2lib;

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
const dirIdx = args.indexOf('--dir');
const MEDIA_DIR = dirIdx >= 0 ? args[dirIdx + 1] : path.join(os.homedir(), 'Downloads', 'wetransfer_img_4900-jpeg_2026-05-20_1749');
const SRC = path.join(MEDIA_DIR, '_non-watches', 'images');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const R2 = { accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket: process.env.R2_BUCKET };
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const { CONVEX_URL, CONVEX_BACKEND_SECRET } = process.env;

// Curated listings. category: 'metals' | 'jewellery'. files live in _non-watches/images/.
const ITEMS = [
  { slug:'silver-bullion-bars-1kg', name:'Silver Bullion Bars — 1kg', category:'metals',
    description:'999.9 fine silver, 1kg cast bars. LBMA-deliverable refiners. Priced to live spot.',
    condition:'Mint', files:['silver-bars-1kg-1.jpeg','silver-bars-1kg-2.jpeg'] },
  { slug:'gold-bullion-bar-1kg', name:'Gold Bullion Bar — 1kg', category:'metals',
    description:'999.9 fine gold, 1kg cast bar with assay. Priced to live spot.',
    condition:'Mint', files:['gold-bar-1kg.jpeg'] },
  { slug:'silver-and-gold-bars', name:'Assorted Silver & Gold Bars', category:'metals',
    description:'A selection of investment-grade gold and silver bars across denominations. Priced to live spot.',
    condition:'Mint', files:['silver-and-gold-bars.jpeg'] },
  { slug:'gold-sovereigns', name:'Gold Sovereigns', category:'metals',
    description:'Full gold sovereigns — bullion and collectible dates available. Priced to live spot.',
    condition:'Excellent', files:['gold-sovereigns.jpeg','gold-sovereigns-and-jewellery.jpeg'] },
  { slug:'silver-bullion-coins', name:'Silver Bullion Coins', category:'metals',
    description:'1oz silver coins — Britannia, Maple, Eagle and more. Available in tubes.',
    condition:'Mint', files:['silver-bullion-coins.jpeg'] },
  { slug:'diamond-cuban-rope-chains', name:'Diamond Cuban & Rope Chains', category:'jewellery',
    description:'Iced-out Cuban link and rope chains. Various weights and karats — enquire for specs.',
    condition:'Excellent', files:['diamond-cuban-and-rope-chains.jpeg'] },
];

const contentType = f => ({ '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp' }[path.extname(f).toLowerCase()] || 'application/octet-stream');
async function r2Put(localPath, key) {
  const url = presignR2Put({ ...R2, key, expires: 600 });
  const r = await fetch(url, { method:'PUT', body: fs.readFileSync(localPath), headers:{ 'Content-Type': contentType(localPath) } });
  if (!r.ok) throw new Error(`R2 PUT ${r.status} for ${key}`);
  return `${PUBLIC_BASE}/${key}`;
}
function thumb(src, dst) {
  const r = spawnSync(FFMPEG, ['-y','-i',src,'-vf',"scale='if(gt(iw,900),900,iw)':-2",'-q:v','4',dst], { stdio:'ignore' });
  if (r.status !== 0 || !fs.existsSync(dst)) throw new Error(`ffmpeg thumb failed: ${path.basename(src)}`);
}
async function convex(kind, fnPath, cargs) {
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ path: fnPath, args: { ...cargs, secret: CONVEX_BACKEND_SECRET }, format:'json' }) });
  const out = await r.json().catch(()=>({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}

async function main() {
  const need = { R2_ACCOUNT_ID:R2.accountId, R2_ACCESS_KEY_ID:R2.accessKeyId, R2_SECRET_ACCESS_KEY:R2.secretAccessKey, R2_BUCKET:R2.bucket, R2_PUBLIC_BASE_URL:PUBLIC_BASE, CONVEX_URL, CONVEX_BACKEND_SECRET };
  const missing = Object.keys(need).filter(k => !need[k]);
  if (missing.length && !DRY) { console.error('Missing env:', missing.join(', ')); process.exit(1); }
  if (!fs.existsSync(SRC)) { console.error('Not found:', SRC); process.exit(1); }
  console.log(`Source: ${SRC}\nMode: ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  const existing = DRY ? new Set() : new Set((await convex('query','records:list',{resource:'inventory'})).map(r => (r.name||'').toLowerCase()));
  const tmp = os.tmpdir();
  let created = 0;
  for (const it of ITEMS) {
    const files = it.files.map(f => path.join(SRC, f)).filter(fs.existsSync);
    if (!files.length) { console.log(`· skip ${it.name} (no files)`); continue; }
    if (existing.has(it.name.toLowerCase())) { console.log(`· skip ${it.name} (exists)`); continue; }
    console.log(`→ ${it.name} (${it.category}) · ${files.length} photo(s)`);
    if (DRY) { created++; continue; }

    const images = [];
    for (const f of files) { process.stdout.write(`    img ${path.basename(f)} … `); images.push(await r2Put(f, `inventory/${it.slug}/${path.basename(f)}`)); console.log('ok'); }
    const tdst = path.join(tmp, `thumb-${it.slug}.jpg`); thumb(files[0], tdst);
    const thumbUrl = await r2Put(tdst, `inventory/${it.slug}/thumb.jpg`); try { fs.unlinkSync(tdst); } catch {}

    const recId = `inv_${crypto.randomBytes(4).toString('hex')}`;
    const data = { id:recId, name:it.name, category:it.category, status:'available', price:null,
      reference:'', condition:it.condition, paperwork:'—', description:it.description,
      imageUrl: images[0], images, videos:[], thumb: thumbUrl, createdAt: new Date().toISOString() };
    await convex('mutation','records:create',{ resource:'inventory', recId, data });
    console.log(`    ✓ created ${recId}\n`);
    created++;
  }
  console.log(`\nDone. ${created} ${DRY ? 'would be created' : 'created'}.`);
}
main().catch(e => { console.error('\nFailed:', e.message); process.exit(1); });
