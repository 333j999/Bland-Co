// Issues a short-lived Cloudflare R2 presigned PUT URL so the browser can upload a file
// directly to the bucket WITHOUT any R2 key or secret living in the front-end. The secret
// never leaves the server; the browser receives only a time-limited URL + the public URL
// the file will be served from.
//
// Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//               R2_PUBLIC_BASE_URL  (e.g. https://pub-xxxx.r2.dev or a custom domain)
//
// kind=image  → public (used by the valuation form on sell.html and the admin)
// kind=video  → admin session required

const { checkSession }           = require('./_lib/auth');
const { cors, json }             = require('./_lib/helpers');
const { presignR2Put, buildKey } = require('./_lib/r2');

const ACCOUNT     = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET      = process.env.R2_BUCKET;
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const kind = String(q.kind || 'image').toLowerCase();
  const resourceType = kind === 'video' ? 'video' : 'image';

  // Video upload is part of admin work — require a valid session.
  if (resourceType === 'video' && !checkSession(req)) {
    return json(res, 401, { error: 'Unauthorised' });
  }

  if (!ACCOUNT || !ACCESS_KEY || !SECRET_KEY || !BUCKET || !PUBLIC_BASE) {
    return json(res, 500, { error: 'Uploads are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL.' });
  }

  const folder = resourceType === 'video' ? 'videos' : 'images';
  const key = buildKey(folder, q.filename || q.name || '');
  const uploadUrl = presignR2Put({ accountId: ACCOUNT, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY, bucket: BUCKET, key, expires: 600 });

  return json(res, 200, {
    provider: 'r2',
    method: 'PUT',
    uploadUrl,
    publicUrl: `${PUBLIC_BASE}/${key}`,
    key,
    resourceType,
  });
};
