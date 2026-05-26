const { checkSession, randomUUID }     = require('./_lib/auth');
const { listRecords, createRecord }    = require('./_lib/convex');
const { cors, json, parseBody }        = require('./_lib/helpers');
const { sendSubmissionEmails }         = require('./_lib/email');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];
// Resources the public website needs to read. Everything else (customer enquiries,
// valuations, consultations) is admin-only and requires a session — these hold PII.
const PUBLIC_GET  = ['inventory', 'testimonials'];
// Public website forms may create these without a session.
const PUBLIC_POST = ['valuations', 'enquiries', 'consultations'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  const { resource } = req.query;
  if (!RESOURCES.includes(resource)) return json(res, 404, { error: 'Unknown resource' });

  if (req.method === 'GET') {
    if (!PUBLIC_GET.includes(resource) && !checkSession(req)) {
      return json(res, 401, { error: 'Unauthorised' });
    }
    const data = await listRecords(resource);
    return json(res, 200, data);
  }

  const isPublicPost = req.method === 'POST' && PUBLIC_POST.includes(resource);
  if (!isPublicPost && !checkSession(req)) return json(res, 401, { error: 'Unauthorised' });

  if (req.method === 'POST') {
    const payload = await parseBody(req);
    const recId = `${resource.slice(0, 3)}_${randomUUID().slice(0, 8)}`;
    const item = { ...payload, id: recId, createdAt: new Date().toISOString() };
    await createRecord(resource, recId, item);
    if (PUBLIC_POST.includes(resource)) {
      sendSubmissionEmails(resource, item).catch(() => {}); // fire-and-forget
    }
    return json(res, 201, item);
  }

  json(res, 405, { error: 'Method not allowed' });
};
