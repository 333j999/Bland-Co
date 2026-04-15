// Sessions are stateless JWTs — logout is handled client-side by clearing localStorage.
// This endpoint exists so the existing admin.html logout button has a valid target.
const { cors, json } = require('../_lib/helpers');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  json(res, 200, { ok: true });
};
