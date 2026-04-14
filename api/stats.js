const { checkSession } = require('./_lib/auth');
const { kvGet }        = require('./_lib/kv');
const { cors, json }   = require('./_lib/helpers');

const RESOURCES = ['inventory', 'enquiries', 'valuations', 'testimonials', 'consultations'];
const read = async r => (await kvGet(`data:${r}`)) ?? [];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (!checkSession(req)) return json(res, 401, { error: 'Unauthorised' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const [inv, enq, val, tes, con] = await Promise.all(RESOURCES.map(read));
  json(res, 200, {
    inventory:     { total: inv.length, available: inv.filter(i=>i.status==='available').length, reserved: inv.filter(i=>i.status==='reserved').length, sold: inv.filter(i=>i.status==='sold').length },
    enquiries:     { total: enq.length, new: enq.filter(e=>e.status==='new').length, contacted: enq.filter(e=>e.status==='contacted').length, closed: enq.filter(e=>e.status==='closed').length },
    valuations:    { total: val.length, pending: val.filter(v=>v.status==='pending').length, offered: val.filter(v=>v.status==='offered').length },
    testimonials:  { total: tes.length, visible: tes.filter(t=>t.visible).length },
    consultations: { total: con.length, pending: con.filter(c=>c.status==='pending').length, confirmed: con.filter(c=>c.status==='confirmed').length, today: con.filter(c=>c.preferredDate===new Date().toISOString().slice(0,10)).length },
  });
};
