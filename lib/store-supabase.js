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
  allContractors: () => run(db().from('contractors').select('*').order('created_at', { ascending: false })),
  updateContractor: (id, patch) => run(db().from('contractors').update(patch).eq('id', id).select().single()),

  insertRequest: row => run(db().from('requests').insert(row).select().single()),
  requestByToken: token => run(db().from('requests').select('*').eq('token', token).maybeSingle()),
  requestById: id => run(db().from('requests').select('*').eq('id', id).maybeSingle()),
  // Marks a request matched only if it is still open, so two clicks can't both win.
  matchRequest: async (id, alertId, contractorId) => {
    const rows = await run(db().from('requests').update({ status: 'matched', chosen_alert_id: alertId, chosen_contractor_id: contractorId, matched_at: new Date().toISOString() }).eq('id', id).eq('status', 'open').select());
    return rows[0] || null;
  },

  // Set a timestamp only if it's still empty, so a timed step (like widening a search) happens once even if two pages trigger it together.
  claimRequest: async (id, field) => (await run(db().from('requests').update({ [field]: new Date().toISOString() }).eq('id', id).is(field, null).select()))[0] || null,
  // Requests that might need a timed step: open or matched, sent in the last 13 hours.
  activeRequests: since => run(db().from('requests').select('*').in('status', ['open', 'matched']).or('created_at.gte.' + since + ',reopened_at.gte.' + since).limit(500)),
  requestsMatchedBetween: (from, to) => run(db().from('requests').select('*').eq('status', 'matched').gte('matched_at', from).lt('matched_at', to).limit(500)),
  openRequestsBefore: async (before, after) => (await run(db().from('requests').select('*').eq('status', 'open').lt('created_at', before).gte('created_at', after).limit(500))).filter(r => (r.reopened_at || r.created_at) < before),
  requestsSince: since => run(db().from('requests').select('*').gte('created_at', since).limit(2000)),
  requestsWithPhotosBefore: before => run(db().from('requests').select('id, photos').lt('created_at', before).neq('photos', '{}').limit(500)),
  deletePhotos: async paths => { if (!paths.length) return; const { error } = await db().storage.from('photos').remove(paths); if (error) throw new Error(error.message); },
  // Funnel events from the site (no personal details, just the step and a scrambled device id).
  insertEvent: row => run(db().from('events').insert(row)),
  eventsSince: since => run(db().from('events').select('name, device').gte('created_at', since).limit(20000)),
  updateRequest: (id, patch) => run(db().from('requests').update(patch).eq('id', id).select().single()),
  recentRequests: limit => run(db().from('requests').select('*').order('created_at', { ascending: false }).limit(limit)),
  // How many requests came from this email, phone, or device since a given time (spam limit).
  countRequestsSince: async (since, f) => {
    const q = v => '"' + String(v).replace(/["\\]/g, '') + '"';
    const or = [f.email && 'email.eq.' + q(f.email), f.phone && 'phone_digits.eq.' + q(f.phone), f.device && 'device.eq.' + q(f.device)].filter(Boolean).join(',');
    const { count, error } = await db().from('requests').select('id', { count: 'exact', head: true }).gte('created_at', since).or(or);
    if (error) throw new Error(error.message);
    return count || 0;
  },
  // Finished reviews for these contractors: [{ chosen_contractor_id, rating }]
  reviewsFor: ids => (ids.length ? run(db().from('requests').select('chosen_contractor_id, rating').in('chosen_contractor_id', ids).not('rating', 'is', null).eq('review_hidden', false)) : Promise.resolve([])),

  alertsForRequests: ids => (ids.length ? run(db().from('alerts').select('*').in('request_id', ids)) : Promise.resolve([])),
  chosenAlerts: () => run(db().from('alerts').select('*').in('outcome', ['chosen', 'no_show']).order('created_at', { ascending: false }).limit(500)),
  // Every yes since a date, with its request's county, service, and start time (for typical answer times).
  answerTimes: async since => (await run(db().from('alerts').select('request_id, responded_at, requests!inner(county, service, created_at, reopened_at)').eq('response', 'accepted').gte('responded_at', since).limit(5000)))
    .map(a => ({ request_id: a.request_id, responded_at: a.responded_at, county: a.requests.county, service: a.requests.service, created_at: a.requests.created_at, reopened_at: a.requests.reopened_at })),
  alertsForContractor: (id, limit) => run(db().from('alerts').select('*').eq('contractor_id', id).order('created_at', { ascending: false }).limit(limit)),
  requestsByIds: ids => (ids.length ? run(db().from('requests').select('*').in('id', ids)) : Promise.resolve([])),
  requestsByEmail: (email, since) => run(db().from('requests').select('*').eq('email', email).gte('created_at', since).order('created_at', { ascending: false }).limit(10)),
  contractorByEmail: email => run(db().from('contractors').select('*').eq('email', email).maybeSingle()),
  // Written reviews for one contractor, newest first.
  reviewDetails: (id, limit) => run(db().from('requests').select('rating, review, reviewed_at, on_time').eq('chosen_contractor_id', id).not('rating', 'is', null).eq('review_hidden', false).order('reviewed_at', { ascending: false }).limit(limit)),
  // "Email me my link" sends, for its own spam limit.
  logLinkSend: row => run(db().from('link_sends').insert(row)),
  countLinkSends: async (since, f) => {
    const q = v => '"' + String(v).replace(/["\\]/g, '') + '"';
    const or = [f.email && 'email.eq.' + q(f.email), f.device && 'device.eq.' + q(f.device)].filter(Boolean).join(',');
    const { count, error } = await db().from('link_sends').select('id', { count: 'exact', head: true }).gte('created_at', since).or(or);
    if (error) throw new Error(error.message);
    return count || 0;
  },
  // Photos live in a private Storage bucket. Anyone who sees them gets a link that expires in an hour.
  savePhoto: async (path, buf, type) => { const { error } = await db().storage.from('photos').upload(path, buf, { contentType: type, upsert: false }); if (error) throw new Error(error.message); },
  photoUrls: async paths => {
    if (!paths || !paths.length) return [];
    const { data, error } = await db().storage.from('photos').createSignedUrls(paths, 3600);
    if (error) throw new Error(error.message);
    return data.map(d => d.signedUrl).filter(Boolean);
  },
  insertAlerts: rows => (rows.length ? run(db().from('alerts').insert(rows).select()) : Promise.resolve([])),
  alertsForRequest: requestId => run(db().from('alerts').select('*').eq('request_id', requestId)),
  alertByToken: token => run(db().from('alerts').select('*').eq('token', token).maybeSingle()),
  updateAlert: (id, patch) => run(db().from('alerts').update(patch).eq('id', id).select().single())
};
