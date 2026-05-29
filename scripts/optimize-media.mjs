// Post-process seeded inventory media for the storefront:
//   1. Generate a POSTER frame for every video (so video-only cards show a still and the
//      player has a thumbnail) — uploaded as inventory/<slug>/poster-<name>.jpg
//   2. Generate a small CARD THUMBNAIL (≤900px) from each item's cover so the grid loads
//      fast instead of decoding full-size phone photos — inventory/<slug>/thumb.jpg
// Then patch each Convex record with `videoPosters[]` + `thumb` (+ imageUrl fallback).
//
// Reads originals from the organized folders (same --dir as the seed). Idempotent-ish:
// re-running regenerates + overwrites the same R2 keys.
//
// Env: R2_*, CONVEX_URL, CONVEX_BACKEND_SECRET, FFMPEG (optional). Usage:
//   node scripts/optimize-media.mjs --dir "C:/path/to/organized-folder" [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const R2 = { accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket: process.env.R2_BUCKET };
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const { CONVEX_URL, CONVEX_BACKEND_SECRET } = process.env;

const IMG_RE = /\.(jpe?g|png|webp)$/i, VID_RE = /\.(mov|mp4|webm|m4v)$/i;
const listFiles = (dir, re) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).sort().map(f => path.join(dir, f)) : [];

async function convex(kind, fnPath, cargs) {
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fnPath, args: { ...cargs, secret: CONVEX_BACKEND_SECRET }, format: 'json' }) });
  const out = await r.json().catch(() => ({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}
async function r2PutFile(localPath, key) {
  const url = presignR2Put({ ...R2, key, expires: 600 });
  const r = await fetch(url, { method: 'PUT', body: fs.readFileSync(localPath), headers: { 'Content-Type': 'image/jpeg' } });
  if (!r.ok) throw new Error(`R2 PUT ${r.status} for ${key}`);
  return `${PUBLIC_BASE}/${key}`;
}
function posterFromVideo(src, dst) {
  const r = spawnSync(FFMPEG, ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=1000:-2', '-q:v', '3', dst], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(dst)) throw new Error(`ffmpeg poster failed: ${path.basename(src)}`);
}
function thumbFromImage(src, dst) {
  const r = spawnSync(FFMPEG, ['-y', '-i', src, '-vf', "scale='if(gt(iw,900),900,iw)':-2", '-q:v', '4', dst], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(dst)) throw new Error(`ffmpeg thumb failed: ${path.basename(src)}`);
}
const slugFromUrl = (u) => (String(u).match(/\/inventory\/([^/]+)\//) || [])[1];

const rows = await convex('query', 'records:list', { resource: 'inventory' });
console.log(`Media dir: ${MEDIA_DIR}\nMode: ${DRY ? 'DRY RUN' : 'LIVE'} · ${rows.length} rows\n`);
const tmp = os.tmpdir();
let updated = 0;

for (const it of rows) {
  const slug = slugFromUrl(it.imageUrl) || slugFromUrl((it.images || [])[0]) || slugFromUrl((it.videos || [])[0]);
  if (!slug) { console.log(`· skip ${it.name} (no slug)`); continue; }
  const imgs = listFiles(path.join(MEDIA_DIR, slug, 'images'), IMG_RE);
  const vids = listFiles(path.join(MEDIA_DIR, slug, 'videos'), VID_RE);
  const patch = {};

  if ((it.videos || []).length && vids.length) {
    const posters = [];
    for (let i = 0; i < it.videos.length && i < vids.length; i++) {
      const dst = path.join(tmp, `poster-${slug}-${i}.jpg`);
      console.log(`  poster ${slug} #${i} …`);
      if (!DRY) { posterFromVideo(vids[i], dst); posters.push(await r2PutFile(dst, `inventory/${slug}/poster-${i}.jpg`)); try { fs.unlinkSync(dst); } catch {} }
    }
    if (posters.length) patch.videoPosters = posters;
  }

  // Card thumbnail from the cover source (first photo, else first video poster).
  const coverSrc = imgs[0] || vids[0];
  if (coverSrc) {
    const dst = path.join(tmp, `thumb-${slug}.jpg`);
    console.log(`  thumb  ${slug} …`);
    if (!DRY) {
      if (IMG_RE.test(coverSrc)) thumbFromImage(coverSrc, dst); else posterFromVideo(coverSrc, dst);
      patch.thumb = await r2PutFile(dst, `inventory/${slug}/thumb.jpg`);
      try { fs.unlinkSync(dst); } catch {}
    }
  }
  // Video-only items: give them a cover so the card isn't a blank monogram.
  if (!(it.images || []).length && patch.videoPosters && patch.videoPosters[0]) patch.imageUrl = patch.videoPosters[0];

  if (!DRY && Object.keys(patch).length) { await convex('mutation', 'records:update', { recId: it.id, patch }); updated++; console.log(`  ✓ ${it.name}`); }
  else if (DRY) console.log(`  would update ${it.name}: ${Object.keys(patch).join(', ') || '(nothing)'}`);
}
console.log(`\nDone. ${updated} record(s) updated.`);
