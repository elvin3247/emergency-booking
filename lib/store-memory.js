// In-memory stand-in for Supabase, for `npm run dev` and `npm test`. Never used in production.
const crypto = require('crypto');
const T = { contractors: [], requests: [], alerts: [], link_sends: [], events: [], files: {} };
const add = (table, row, defaults) => { const r = Object.assign({ id: crypto.randomUUID(), created_at: new Date().toISOString() }, defaults, row); T[table].push(r); return r; };
const patch = (table, id, p) => Object.assign(T[table].find(r => r.id === id), p);
const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

module.exports = {
  insertContractor: async row => {
    if (T.contractors.some(c => c.email === row.email)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
    const r = add('contractors', row, { status: 'pending', free_leads_left: 3, trades: ['hvac'] });
    if (process.env.AUTO_APPROVE === '1') r.status = 'approved'; // dev convenience only
    return copy(r);
  },
  contractorsForCounty: async (county, trade) => copy(T.contractors.filter(c => c.status === 'approved' && c.counties.includes(county) && (!trade || c.trades.includes(trade)))),
  contractorsByIds: async ids => copy(T.contractors.filter(c => ids.includes(c.id))),
  approvedContractors: async () => copy(T.contractors.filter(c => c.status === 'approved').map(c => ({ counties: c.counties, trades: c.trades, alert_hours: c.alert_hours, visit_fee: c.visit_fee, business_phone: c.business_phone, paused_until: c.paused_until }))),
  contractorByManageToken: async t => copy(T.contractors.find(c => c.manage_token === t) || null),
  allContractors: async () => copy(T.contractors),
  updateContractor: async (id, p) => copy(patch('contractors', id, p)),

  insertRequest: async row => copy(add('requests', row, { status: 'open' })),
  requestByToken: async token => copy(T.requests.find(r => r.token === token) || null),
  requestById: async id => copy(T.requests.find(r => r.id === id) || null),
  matchRequest: async (id, alertId, contractorId) => {
    const r = T.requests.find(x => x.id === id && x.status === 'open');
    return r ? copy(Object.assign(r, { status: 'matched', chosen_alert_id: alertId, chosen_contractor_id: contractorId, matched_at: new Date().toISOString() })) : null;
  },

  // Set a timestamp only if it's still empty, so a timed step (like widening a search) happens once even if two pages trigger it together.
  claimRequest: async (id, field) => { const r = T.requests.find(x => x.id === id); if (!r || r[field]) return null; r[field] = new Date().toISOString(); return copy(r); },
  // Requests that might need a timed step: open or matched, sent in the last 13 hours.
  activeRequests: async since => copy(T.requests.filter(r => (r.status === 'open' || r.status === 'matched') && (r.reopened_at || r.created_at) >= since)),
  requestsMatchedBetween: async (from, to) => copy(T.requests.filter(r => r.status === 'matched' && r.matched_at >= from && r.matched_at < to)),
  openRequestsBefore: async (before, after) => copy(T.requests.filter(r => r.status === 'open' && (r.reopened_at || r.created_at) < before && r.created_at >= after)),
  requestsSince: async since => copy(T.requests.filter(r => r.created_at >= since)),
  requestsWithPhotosBefore: async before => copy(T.requests.filter(r => r.created_at < before && (r.photos || []).length)),
  deletePhotos: async paths => { paths.forEach(p => delete T.files[p]); },
  // Funnel events from the site (no personal details, just the step and a scrambled device id).
  insertEvent: async row => { add('events', row); },
  eventsSince: async since => copy((T.events || []).filter(e => e.created_at >= since)),
  updateRequest: async (id, p) => copy(patch('requests', id, p)),
  recentRequests: async limit => copy(T.requests.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit)),
  // How many requests came from this email, phone, or device since a given time (spam limit).
  countRequestsSince: async (since, f) => T.requests.filter(r => r.created_at >= since && ((f.email && r.email === f.email) || (f.phone && r.phone_digits === f.phone) || (f.device && r.device === f.device))).length,
  // Finished reviews for these contractors: [{ chosen_contractor_id, rating }]
  reviewsFor: async ids => copy(T.requests.filter(r => r.rating != null && !r.review_hidden && ids.includes(r.chosen_contractor_id)).map(r => ({ chosen_contractor_id: r.chosen_contractor_id, rating: r.rating }))),

  alertsForRequests: async ids => copy(T.alerts.filter(a => ids.includes(a.request_id))),
  chosenAlerts: async () => copy(T.alerts.filter(a => a.outcome === 'chosen' || a.outcome === 'no_show')),
  // Every yes since a date, with its request's county, service, and start time (for typical answer times).
  answerTimes: async since => copy(T.alerts.filter(a => a.response === 'accepted' && a.responded_at && a.responded_at >= since).map(a => { const r = T.requests.find(x => x.id === a.request_id); return { request_id: a.request_id, responded_at: a.responded_at, county: r.county, service: r.service, created_at: r.created_at, reopened_at: r.reopened_at }; })),
  alertsForContractor: async (id, limit) => copy(T.alerts.filter(a => a.contractor_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit)),
  requestsByIds: async ids => copy(T.requests.filter(r => ids.includes(r.id))),
  requestsByEmail: async (email, since) => copy(T.requests.filter(r => r.email === email && r.created_at >= since)),
  contractorByEmail: async email => copy(T.contractors.find(c => c.email === email) || null),
  // Written reviews for one contractor, newest first.
  reviewDetails: async (id, limit) => copy(T.requests.filter(r => r.rating != null && !r.review_hidden && r.chosen_contractor_id === id).sort((a, b) => new Date(b.reviewed_at) - new Date(a.reviewed_at)).slice(0, limit).map(r => ({ rating: r.rating, review: r.review, reviewed_at: r.reviewed_at, on_time: r.on_time }))),
  // "Email me my link" sends, for its own spam limit.
  logLinkSend: async row => { add('link_sends', row); },
  countLinkSends: async (since, f) => T.link_sends.filter(x => x.created_at >= since && ((f.email && x.email === f.email) || (f.device && x.device === f.device))).length,
  // Photos: kept in memory as data URLs here; Supabase Storage in production.
  savePhoto: async (path, buf, type) => { T.files[path] = 'data:' + type + ';base64,' + buf.toString('base64'); },
  photoUrls: async paths => paths.map(p => T.files[p]).filter(Boolean),
  insertAlerts: async rows => copy(rows.map(r => add('alerts', r, { response: 'none' }))),
  alertsForRequest: async requestId => copy(T.alerts.filter(a => a.request_id === requestId)),
  alertByToken: async token => copy(T.alerts.find(a => a.token === token) || null),
  updateAlert: async (id, p) => { if (!T.alerts.some(a => a.id === id)) throw Object.assign(new Error('Not found'), { status: 404 }); return copy(patch('alerts', id, p)); },
  _tables: T
};
