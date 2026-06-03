// Sets the CORS policy on the Cloudflare R2 bucket so the browser can PUT files
// directly to a presigned URL from sell.html / the admin. Without this, R2 returns
// no Access-Control-Allow-Origin header on the preflight and the upload fails.
//
// Run: node scripts/set-r2-cors.mjs        (reads keys from .env.local / env)
//
// Two paths, auto-selected:
//   1. If CLOUDFLARE_API_TOKEN is set → Cloudflare native R2 API (needs the
//      "Workers R2 Storage: Edit" permission). This is the easiest path.
//   2. Otherwise → the S3-compatible PutBucketCors API signed with SigV4. This
//      requires the R2 S3 token to have ADMIN ("Admin Read & Write") permission;
//      an object-only token returns 403 AccessDenied.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- load .env.local (simple parser) so the script works standalone ---
for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const ACCESS  = process.env.R2_ACCESS_KEY_ID;
const SECRET  = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET  = process.env.R2_BUCKET;

if (!ACCOUNT || !ACCESS || !SECRET || !BUCKET) {
  console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in env (.env.local).');
  process.exit(1);
}

// Origins allowed to upload. Add/remove as needed.
const ORIGINS = [
  'https://www.blandjewellers.store',
  'https://blandjewellers.store',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// Shared policy, expressed once as a plain object.
const RULE = {
  AllowedOrigins: ORIGINS,
  AllowedMethods: ['PUT', 'GET', 'HEAD'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3600,
};

// ---- Path 1: Cloudflare native R2 API (preferred — only needs an R2-Edit token) ----
if (process.env.CLOUDFLARE_API_TOKEN) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/cors`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rules: [RULE] }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`✓ R2 CORS policy set on bucket "${BUCKET}" via Cloudflare API.`);
    console.log(`  Allowed origins:\n    ${ORIGINS.join('\n    ')}`);
    process.exit(0);
  }
  console.error(`✗ Cloudflare API PutCors failed: HTTP ${res.status}`);
  console.error(text);
  process.exit(1);
}

// ---- Path 2: S3-compatible PutBucketCors (needs an Admin R2 S3 token) ----
const corsXml =
  '<CORSConfiguration>' +
  '<CORSRule>' +
  ORIGINS.map(o => `<AllowedOrigin>${o}</AllowedOrigin>`).join('') +
  RULE.AllowedMethods.map(m => `<AllowedMethod>${m}</AllowedMethod>`).join('') +
  '<AllowedHeader>*</AllowedHeader>' +
  '<ExposeHeader>ETag</ExposeHeader>' +
  `<MaxAgeSeconds>${RULE.MaxAgeSeconds}</MaxAgeSeconds>` +
  '</CORSRule>' +
  '</CORSConfiguration>';

const host    = `${ACCOUNT}.r2.cloudflarestorage.com`;
const region  = 'auto';
const service = 's3';

const hmac      = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();
const sha256hex = (buf)      => crypto.createHash('sha256').update(buf).digest('hex');

const body        = Buffer.from(corsXml, 'utf8');
const payloadHash = sha256hex(body);
const contentMd5  = crypto.createHash('md5').update(body).digest('base64');
const contentType = 'application/xml';

const amzDate   = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
const dateStamp = amzDate.slice(0, 8);
const scope     = `${dateStamp}/${region}/${service}/aws4_request`;

const canonicalUri   = `/${encodeURIComponent(BUCKET)}`;
const canonicalQuery = 'cors=';
const canonicalHeaders =
  `content-md5:${contentMd5}\n` +
  `content-type:${contentType}\n` +
  `host:${host}\n` +
  `x-amz-content-sha256:${payloadHash}\n` +
  `x-amz-date:${amzDate}\n`;
const signedHeaders = 'content-md5;content-type;host;x-amz-content-sha256;x-amz-date';

const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(Buffer.from(canonicalRequest, 'utf8'))].join('\n');

const kDate    = hmac('AWS4' + SECRET, dateStamp);
const kRegion  = hmac(kDate, region);
const kService = hmac(kRegion, service);
const kSigning = hmac(kService, 'aws4_request');
const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

const authorization =
  `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

const res = await fetch(`https://${host}${canonicalUri}?cors`, {
  method: 'PUT',
  headers: {
    'Authorization': authorization,
    'Content-MD5': contentMd5,
    'Content-Type': contentType,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
  },
  body,
});

const text = await res.text();
if (res.ok) {
  console.log(`✓ R2 CORS policy set on bucket "${BUCKET}".`);
  console.log(`  Allowed origins:\n    ${ORIGINS.join('\n    ')}`);
} else {
  console.error(`✗ PutBucketCors failed: HTTP ${res.status}`);
  console.error(text);
  if (res.status === 403) {
    console.error('\nThis R2 S3 token is object-scoped and cannot edit bucket config.');
    console.error('Fix it with EITHER of these (no code change needed):');
    console.error('  • Cloudflare dashboard → R2 → bland-co-media → Settings → CORS Policy →');
    console.error('    paste the contents of scripts/cors.json, save. Done in ~30s.');
    console.error('  • Or set CLOUDFLARE_API_TOKEN (Workers R2 Storage: Edit) in .env.local and');
    console.error('    re-run this script — it will use the Cloudflare API path automatically.');
  }
  process.exit(1);
}
