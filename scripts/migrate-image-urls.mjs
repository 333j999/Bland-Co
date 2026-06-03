// Rewrites stored media URLs from the old Cloudflare r2.dev dev domain
// (https://pub-xxxx.r2.dev/...) to the custom public domain. The objects already
// live in the same bucket under the same key, so only the host changes.
//
// Dry-run (default):  node scripts/migrate-image-urls.mjs
// Apply changes:      node scripts/migrate-image-urls.mjs --apply

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// load .env.local
for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const NEW_BASE = (process.env.R2_PUBLIC_BASE_URL || 'https://media.blandjewellers.store').replace(/\/+$/, '');
const OLD_HOST = /https:\/\/pub-[a-z0-9]+\.r2\.dev/g;
const APPLY = process.argv.includes('--apply');

const { listRecords, updateRecord } = require('../api/_lib/convex.js');

const RESOURCES = ['inventory', 'valuations', 'testimonials', 'consultations', 'enquiries'];

let scanned = 0, changedRecords = 0, changedUrls = 0;

for (const resource of RESOURCES) {
  let rows;
  try { rows = await listRecords(resource); } catch (e) { console.error(`skip ${resource}: ${e.message}`); continue; }
  for (const rec of rows || []) {
    scanned++;
    const before = JSON.stringify(rec);
    if (!OLD_HOST.test(before)) continue;
    OLD_HOST.lastIndex = 0;
    const after = JSON.parse(before.replace(OLD_HOST, NEW_BASE));
    // count URL changes
    changedUrls += (before.match(OLD_HOST) || []).length;
    OLD_HOST.lastIndex = 0;
    // build a patch of changed top-level keys (excludes Convex internals)
    const patch = {};
    for (const k of Object.keys(after)) {
      if (k === '_id' || k === '_creationTime') continue;
      if (JSON.stringify(rec[k]) !== JSON.stringify(after[k])) patch[k] = after[k];
    }
    changedRecords++;
    console.log(`[${resource}] ${rec.id} — fields: ${Object.keys(patch).join(', ')}`);
    if (APPLY) {
      await updateRecord(rec.id, patch);
      console.log(`   ✓ updated`);
    }
  }
}

console.log(`\nScanned ${scanned} records. ${changedRecords} need rewriting (${changedUrls} URLs).`);
console.log(APPLY ? 'Applied.' : 'Dry run — re-run with --apply to write changes.');
