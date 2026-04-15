const sb = (path) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
  });

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const [invR, enqR, valR, tesR, conR] = await Promise.all([
    sb('/inventory?select=*'),
    sb('/enquiries?select=*'),
    sb('/valuations?select=*'),
    sb('/testimonials?select=*'),
    sb('/consultations?select=*'),
  ]);

  const [invRows, enqRows, valRows, tesRows, conRows] = await Promise.all([
    invR.json(), enqR.json(), valR.json(), tesR.json(), conR.json(),
  ]);

  const flat = (rows) => (Array.isArray(rows) ? rows : []).map(({ id, data }) => ({ id, ...data }));
  const inv = flat(invRows), enq = flat(enqRows), val = flat(valRows), tes = flat(tesRows), con = flat(conRows);
  const today = new Date().toISOString().slice(0, 10);

  res.writeHead(200);
  res.end(JSON.stringify({
    inventory: {
      total:     inv.length,
      available: inv.filter(i => i.status === 'available').length,
      reserved:  inv.filter(i => i.status === 'reserved').length,
      sold:      inv.filter(i => i.status === 'sold').length,
    },
    enquiries: {
      total:     enq.length,
      new:       enq.filter(e => e.status === 'new').length,
      contacted: enq.filter(e => e.status === 'contacted').length,
      closed:    enq.filter(e => e.status === 'closed').length,
    },
    valuations: {
      total:   val.length,
      pending: val.filter(v => v.status === 'pending').length,
      offered: val.filter(v => v.status === 'offered').length,
    },
    testimonials: {
      total:   tes.length,
      visible: tes.filter(t => t.visible).length,
    },
    consultations: {
      total:     con.length,
      pending:   con.filter(c => c.status === 'pending').length,
      confirmed: con.filter(c => c.status === 'confirmed').length,
      today:     con.filter(c => c.preferredDate === today).length,
    },
  }));
};
