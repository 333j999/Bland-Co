// Upstash Redis via REST API — no npm required
// Requires env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// (Auto-provided by Vercel when you add Upstash from the Storage marketplace)

async function kvExec(...command) {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
  });
  const [item] = await r.json();
  return item.result;
}

async function kvGet(key) {
  const v = await kvExec('GET', key);
  return v == null ? null : JSON.parse(v);
}

async function kvSet(key, value, exSeconds) {
  const cmd = ['SET', key, JSON.stringify(value)];
  if (exSeconds) cmd.push('EX', exSeconds);
  return kvExec(...cmd);
}

async function kvDel(key) {
  return kvExec('DEL', key);
}

module.exports = { kvGet, kvSet, kvDel };
