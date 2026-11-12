// In-memory stand-in for Supabase, for `npm run dev` and `npm test`. Never used in production.
const crypto = require('crypto');
const T = { contractors: [], requests: [], alerts: [] };
const add = (table, row, defaults) => { const r = Object.assign({ id: crypto.randomUUID(), created_at: new Date().toISOString() }, defaults, row); T[table].push(r); return r; };
const patch = (table, id, p) => Object.assign(T[table].find(r => r.id === id), p);
const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

module.exports = {
  insertContractor: async row => {
    if (T.contractors.some(c => c.email === row.email)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
    const r = add('contractors', row, { status: 'pending', free_leads_left: 3 });
    if (process.env.AUTO_APPROVE === '1') r.status = 'approved'; // dev convenience only
    return copy(r);
  },
  contractorsForCounty: async county => copy(T.contractors.filter(c => c.status === 'approved' && c.counties.includes(county))),
  contractorsByIds: async ids => copy(T.contractors.filter(c => ids.includes(c.id))),
  approvedContractors: async () => copy(T.contractors.filter(c => c.status === 'approved').map(c => ({ counties: c.counties, alert_hours: c.alert_hours, visit_fee: c.visit_fee, business_phone: c.business_phone, paused_until: c.paused_until }))),
  contractorByManageToken: async t => copy(T.contractors.find(c => c.manage_token === t) || null),
  updateContractor: async (id, p) => copy(patch('contractors', id, p)),

  insertRequest: async row => copy(add('requests', row, { status: 'open' })),
  requestByToken: async token => copy(T.requests.find(r => r.token === token) || null),
  requestById: async id => copy(T.requests.find(r => r.id === id) || null),
  matchRequest: async (id, alertId) => {
    const r = T.requests.find(x => x.id === id && x.status === 'open');
    return r ? copy(Object.assign(r, { status: 'matched', chosen_alert_id: alertId, matched_at: new Date().toISOString() })) : null;
  },

  insertAlerts: async rows => copy(rows.map(r => add('alerts', r, { response: 'none' }))),
  alertsForRequest: async requestId => copy(T.alerts.filter(a => a.request_id === requestId)),
  alertByToken: async token => copy(T.alerts.find(a => a.token === token) || null),
  updateAlert: async (id, p) => copy(patch('alerts', id, p)),
  _tables: T
};
