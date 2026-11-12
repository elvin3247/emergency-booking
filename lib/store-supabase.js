const { createClient } = require('@supabase/supabase-js');

let client;
function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}
async function run(query) {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

module.exports = {
  insertContractor: row => run(db().from('contractors').insert(row).select().single()),
  // Approved contractors covering a county, optionally only those in one trade.
  contractorsForCounty: (county, trade) => {
    let q = db().from('contractors').select('*').eq('status', 'approved').contains('counties', [county]);
    if (trade) q = q.contains('trades', [trade]);
    return run(q);
  },
  contractorsByIds: ids => (ids.length ? run(db().from('contractors').select('*').in('id', ids)) : Promise.resolve([])),
  approvedContractors: () => run(db().from('contractors').select('counties, trades, alert_hours, visit_fee, business_phone, paused_until').eq('status', 'approved')),
  contractorByManageToken: t => run(db().from('contractors').select('*').eq('manage_token', t).maybeSingle()),
  updateContractor: (id, patch) => run(db().from('contractors').update(patch).eq('id', id).select().single()),

  insertRequest: row => run(db().from('requests').insert(row).select().single()),
  requestByToken: token => run(db().from('requests').select('*').eq('token', token).maybeSingle()),
  requestById: id => run(db().from('requests').select('*').eq('id', id).maybeSingle()),
  // Marks a request matched only if it is still open, so two clicks can't both win.
  matchRequest: async (id, alertId) => {
    const rows = await run(db().from('requests').update({ status: 'matched', chosen_alert_id: alertId, matched_at: new Date().toISOString() }).eq('id', id).eq('status', 'open').select());
    return rows[0] || null;
  },

  insertAlerts: rows => (rows.length ? run(db().from('alerts').insert(rows).select()) : Promise.resolve([])),
  alertsForRequest: requestId => run(db().from('alerts').select('*').eq('request_id', requestId)),
  alertByToken: token => run(db().from('alerts').select('*').eq('token', token).maybeSingle()),
  updateAlert: (id, patch) => run(db().from('alerts').update(patch).eq('id', id).select().single())
};
