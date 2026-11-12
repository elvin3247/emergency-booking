// POST: a homeowner creates a request and matching contractors are alerted.
// GET ?token=: the homeowner's request page reads its current state.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, digits, token, isReady, canAlert } = require('../lib/http');

module.exports = wrap({
  async POST({ body }) {
    if (body.website) return { token: 'ok' }; // hidden field only bots fill in
    const r = {
      problem: str(body.problem, 30), zip: str(body.zip, 5), county: str(body.county, 30), timing: str(body.timing, 40), system: str(body.system, 40),
      note: str(body.note, 500), name: str(body.name, 80), phone: str(body.phone, 30), email: str(body.email, 120).toLowerCase(), address: str(body.address, 160), source: str(body.source, 120) || null
    };
    if (!C.problems[r.problem]) throw bad('Choose the problem you need help with.');
    if (!/^\d{5}$/.test(r.zip)) throw bad('Enter a 5-digit ZIP code.');
    if (!/^0[78]/.test(r.zip)) throw bad("We're only in New Jersey for now. NJ ZIP codes start with 07 or 08.");
    if (!C.counties.includes(r.county)) throw bad('Choose your county.');
    if (!C.timings.includes(r.timing)) r.timing = C.timings[0];
    if (!C.systems.includes(r.system)) r.system = C.systems[0];
    if (!r.name) throw bad('Enter your name so the contractor knows who to ask for.');
    if (digits(r.phone).length < 10) throw bad('Enter a 10-digit phone number.');
    if (!isEmail(r.email)) throw bad('Enter a valid email address. We send your updates there.');
    if (!r.address) throw bad('Enter the street address where the work is needed.');
    if (body.consent !== true) throw bad('Check the box so we can contact you about this request.');

    const row = await store.insertRequest(Object.assign(r, { token: token(), status: 'open', consent_at: new Date().toISOString(), consent_text: C.consent.homeowner }));
    const matches = (await store.contractorsForCounty(r.county)).filter(canAlert);
    const alerts = await store.insertAlerts(matches.map(c => ({ request_id: row.id, contractor_id: c.id, token: token(), response: 'none' })));
    const byId = Object.fromEntries(matches.map(c => [c.id, c]));
    await mail.sendAll(alerts.map(a => E.contractorAlert(byId[a.contractor_id], row, a)).concat([E.homeownerReceived(row, alerts.length), E.adminNewRequest(row, matches)]));
    return { token: row.token };
  },

  async GET({ query }) {
    const r = await store.requestByToken(str(query.token, 64));
    if (!r) throw bad("We couldn't find that request. Check the link in your email.", 404);
    const alerts = await store.alertsForRequest(r.id);
    const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
    const created = new Date(r.created_at).getTime(), now = Date.now();
    const offer = a => ({ id: a.id, company: cs[a.contractor_id].company, license: cs[a.contractor_id].license, arrival: a.arrival, visit_fee: a.visit_fee, secs: Math.max(0, Math.round((new Date(a.responded_at).getTime() - created) / 1000)) });
    const accepted = alerts.filter(a => a.response === 'accepted').sort((a, b) => new Date(a.responded_at) - new Date(b.responded_at));
    const state = r.status === 'matched' ? 'matched' : now - created > C.OPEN_MS ? 'closed' : 'open';
    const out = {
      state, now, window_ends: created + C.WINDOW_MS, alerted: alerts.length,
      request: { problem: r.problem, zip: r.zip, county: r.county, timing: r.timing, address: r.address },
      offers: state === 'open' ? accepted.slice(0, C.maxOffers).map(offer) : []
    };
    if (state === 'matched') {
      const a = alerts.find(x => x.id === r.chosen_alert_id);
      out.chosen = Object.assign(offer(a), { phone: cs[a.contractor_id].business_phone });
    } else if (!accepted.length && (!alerts.length || now > out.window_ends)) {
      // Nobody confirmed: be honest and give numbers to call directly.
      out.backup = (await store.contractorsForCounty(r.county)).filter(isReady).slice(0, 5).map(c => ({ company: c.company, phone: c.business_phone, license: c.license }));
    }
    return out;
  }
});
