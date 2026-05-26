// Talks to Convex over its HTTP function API. No Convex SDK at runtime, so the Vercel
// functions stay dependency-free (same approach the old Upstash kv.js used).
//
// Every call carries a shared secret that the Convex functions verify, so the database
// is reachable only by this backend. Both values come from env vars — never from git:
//   CONVEX_URL              e.g. https://your-deployment.convex.cloud
//   CONVEX_BACKEND_SECRET   must match BACKEND_SECRET set on the Convex deployment

const BASE   = process.env.CONVEX_URL;
const SECRET = process.env.CONVEX_BACKEND_SECRET;

async function call(kind, path, args) {
  if (!BASE)   throw new Error('CONVEX_URL env var is not set');
  if (!SECRET) throw new Error('CONVEX_BACKEND_SECRET env var is not set');
  const r = await fetch(`${BASE}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: { ...args, secret: SECRET }, format: 'json' }),
  });
  const out = await r.json().catch(() => ({}));
  if (out.status !== 'success') throw new Error(out.errorMessage || `Convex ${kind} failed`);
  return out.value;
}

// Per-resource records
const listRecords   = (resource)             => call('query',    'records:list',   { resource });
const getRecord     = (recId)                => call('query',    'records:get',    { recId });
const createRecord  = (resource, recId, data) => call('mutation', 'records:create', { resource, recId, data });
const updateRecord  = (recId, patch)         => call('mutation', 'records:update', { recId, patch });
const removeRecord  = (recId)                => call('mutation', 'records:remove', { recId });

// Singleton key/value (settings)
const kvGet = (key)        => call('query',    'kv:get', { key });
const kvSet = (key, value) => call('mutation', 'kv:set', { key, value });
const kvDel = (key)        => call('mutation', 'kv:remove', { key });

module.exports = {
  listRecords, getRecord, createRecord, updateRecord, removeRecord,
  kvGet, kvSet, kvDel,
};
