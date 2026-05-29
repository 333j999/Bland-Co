// Presign a Cloudflare R2 (S3-compatible) PUT URL using AWS SigV4 query-string auth.
// No AWS SDK — keeps the serverless functions dependency-free. The R2 secret stays on
// the server; the browser only ever receives a short-lived presigned URL.
//
// Required env (set in Vercel + .env.local):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL

const crypto = require('crypto');

const hmac      = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = (str)      => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
// RFC3986 — encodeURIComponent leaves !*'() unescaped; S3 wants them escaped.
const enc       = (s) => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath   = (p) => p.split('/').map(enc).join('/');

// Returns a presigned PUT URL valid for `expires` seconds. Only `host` is signed, so the
// client may send any Content-Type. Payload is unsigned (UNSIGNED-PAYLOAD).
function presignR2Put({ accountId, accessKeyId, secretAccessKey, bucket, key, expires = 600 }) {
  const host    = `${accountId}.r2.cloudflarestorage.com`;
  const region  = 'auto';
  const service = 's3';
  const amzDate   = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope     = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encPath(bucket)}/${encPath(key)}`;

  const q = {
    'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
    'X-Amz-Credential':    `${accessKeyId}/${scope}`,
    'X-Amz-Date':          amzDate,
    'X-Amz-Expires':       String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(q).sort().map(k => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kDate    = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// Build a tidy, collision-resistant object key, e.g. images/9f3a2b-img-0229.jpeg
function buildKey(folder, filename) {
  const id   = crypto.randomBytes(4).toString('hex');
  const safe = String(filename || '').toLowerCase().replace(/[^a-z0-9.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80);
  return `${folder}/${id}${safe ? '-' + safe : ''}`;
}

module.exports = { presignR2Put, buildKey };
