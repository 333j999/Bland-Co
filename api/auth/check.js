const { checkSession } = require('../_lib/auth');
const { cors, json }   = require('../_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const ok = checkSession(req);
  json(res, ok ? 200 : 401, { ok });
};
