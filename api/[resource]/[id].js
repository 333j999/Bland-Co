const { checkSession }                          = require('../_lib/auth');
const { getRecord, updateRecord, removeRecord } = require('../_lib/convex');
const { cors, json, parseBody }                 = require('../_lib/helpers');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });

  const { resource, id } = req.query;
  if (!RESOURCES.includes(resource)) return json(res, 404, { error: 'Unknown resource' });

  if (req.method === 'GET') {
    const item = await getRecord(id);
    return item ? json(res, 200, item) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'PUT') {
    const payload = await parseBody(req);
    const updated = await updateRecord(id, { ...payload, id, updatedAt: new Date().toISOString() });
    return updated ? json(res, 200, updated) : json(res, 404, { error: 'Not found' });
  }

  if (req.method === 'DELETE') {
    const removed = await removeRecord(id);
    return removed ? json(res, 200, removed) : json(res, 404, { error: 'Not found' });
  }

  json(res, 405, { error: 'Method not allowed' });
};
