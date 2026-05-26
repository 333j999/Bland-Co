// One-time import of the seed data in data/*.json into Convex.
// Run AFTER `npx convex dev` has provisioned the deployment and you've set the env vars:
//   CONVEX_URL=...                (printed by convex dev / in .env.local as CONVEX_URL)
//   CONVEX_BACKEND_SECRET=...     (same value as BACKEND_SECRET on the Convex deployment)
//
//   CONVEX_URL=... CONVEX_BACKEND_SECRET=... node scripts/migrate-to-convex.mjs
//
// Run once on an empty deployment — it inserts, it does not de-duplicate.

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CONVEX_URL;
const SECRET = process.env.CONVEX_BACKEND_SECRET;
const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];

if (!BASE || !SECRET) {
  console.error('Set CONVEX_URL and CONVEX_BACKEND_SECRET in the environment first.');
  process.exit(1);
}

async function mutation(path, args) {
  const r = await fetch(`${BASE}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: { ...args, secret: SECRET }, format: 'json' }),
  });
  const out = await r.json();
  if (out.status !== 'success') throw new Error(out.errorMessage || 'mutation failed');
  return out.value;
}

for (const resource of RESOURCES) {
  let items = [];
  try {
    items = JSON.parse(await readFile(join(ROOT, 'data', `${resource}.json`), 'utf8'));
  } catch {
    console.log(`(skip ${resource} — no seed file)`);
    continue;
  }
  let n = 0;
  for (const item of items) {
    const recId = item.id || `${resource.slice(0, 3)}_${Math.random().toString(36).slice(2, 10)}`;
    await mutation('records:create', { resource, recId, data: { ...item, id: recId } });
    n++;
  }
  console.log(`seeded ${n} ${resource}`);
}
console.log('Done.');
