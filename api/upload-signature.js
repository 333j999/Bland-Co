// Issues a short-lived Cloudinary upload authorisation so the browser can upload
// a file directly WITHOUT any Cloudinary key, secret, or preset living in the
// front-end. The API secret never leaves the server.
//
// Preferred (signed) mode — set in the environment:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Fallback (unsigned) mode — if no secret is set but a preset is:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET
//
// kind=image  → public (used by the valuation form on sell.html)
// kind=video  → admin session required (used by admin hero-video upload)

const crypto = require('crypto');
const { checkSession } = require('./_lib/auth');
const { cors, json } = require('./_lib/helpers');

const CLOUD  = process.env.CLOUDINARY_CLOUD_NAME || 'dshvvjpsg';
const KEY    = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;
// Unsigned preset kept server-side as a working default so uploads don't break before
// the signed-mode secret is configured. An unsigned preset is not a secret, but it now
// lives on the backend rather than in client code. Prefer signed mode in production.
const PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'bland_co_unsigned';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const kind = String((req.query && req.query.kind) || 'image').toLowerCase();
  const resourceType = kind === 'video' ? 'video' : 'image';

  // Video upload is part of admin settings — require a valid session.
  if (resourceType === 'video' && !checkSession(req)) {
    return json(res, 401, { error: 'Unauthorised' });
  }

  // Scope uploads to predictable folders so they can't sprawl across the account.
  const folder = resourceType === 'video' ? 'bland-co/site' : 'bland-co/valuations';

  // ── Preferred: signed upload (secret stays here on the server) ──
  if (KEY && SECRET) {
    const timestamp = Math.round(Date.now() / 1000);
    // Cloudinary signs every upload param except file/cloud_name/resource_type/api_key,
    // alphabetically sorted. We only send folder + timestamp.
    const toSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(toSign + SECRET).digest('hex');
    return json(res, 200, {
      mode: 'signed',
      cloudName: CLOUD,
      apiKey: KEY,
      timestamp,
      folder,
      signature,
      resourceType,
    });
  }

  // ── Fallback: unsigned preset, but sourced from server env (not hard-coded client-side) ──
  if (PRESET) {
    return json(res, 200, {
      mode: 'unsigned',
      cloudName: CLOUD,
      uploadPreset: PRESET,
      folder,
      resourceType,
    });
  }

  return json(res, 500, {
    error: 'Uploads are not configured. Set CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (preferred), or CLOUDINARY_UPLOAD_PRESET, in the environment.',
  });
};
