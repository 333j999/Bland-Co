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
      // Await the send: a detached promise is dropped once the serverless
      // function freezes after the response, so the email never goes out.
      // Errors are logged (visible in Vercel logs) but never fail the form.
      try {
        await sendSubmissionEmails(resource, item);
      } catch (err) {
        console.error(`[email] ${resource} notification failed:`, err && err.message ? err.message : err);
      }
    }
    return json(res, 201, item);
  }

  json(res, 405, { error: 'Method not allowed' });
};
