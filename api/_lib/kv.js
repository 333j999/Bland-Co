// Vercel KV (Upstash Redis) via REST API — no npm required
// Requires env vars: KV_REST_API_URL, KV_REST_API_TOKEN
// (Auto-provided by Vercel when you link a KV database to your project)

async function kvExec(...command) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
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
