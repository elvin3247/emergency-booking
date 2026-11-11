// The contractor's response page. GET ?t= reads the job; POST accepts or declines it.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, alertState } = require('../lib/http');

async function load(t) {
  const alert = await store.alertByToken(str(t, 64));
  if (!alert) throw bad("We couldn't find that request. Check the link in your alert.", 404);
  const request = await store.requestById(alert.request_id);
  const contractor = (await store.contractorsByIds([alert.contractor_id]))[0];
  const all = await store.alertsForRequest(request.id);
  const accepted = all.filter(a => a.response === 'accepted');
  return { alert, request, contractor, accepted, state: alertState(alert, request, accepted.length) };
}

function view({ alert, request: r, contractor, state }) {
  const out = {
    state, company: contractor.company,
    request: { problem: r.problem, zip: r.zip, county: r.county, timing: r.timing, system: r.system, note: r.note },
    mine: { arrival: alert.arrival, visit_fee: alert.visit_fee == null ? contractor.visit_fee : alert.visit_fee },
    free_leads_left: contractor.free_leads_left
  };
  if (state === 'chosen') {
    out.customer = { name: r.name, phone: r.phone, email: r.email, address: r.address };
    out.lead_fee = alert.lead_fee;
  }
  return out;
}

module.exports = wrap({
  async GET({ query }) { return view(await load(query.t)); },

  async POST({ body }) {
    const ctx = await load(body.t);
    const { alert, request, contractor, accepted, state } = ctx;
    if (body.action === 'accept') {
      if (state === 'accepted') return view(ctx);
      if (state !== 'open' && state !== 'declined') throw bad(state === 'full' ? 'This request already has ' + C.maxOffers + ' contractors.' : 'This request is no longer open.', 409);
      if (!C.arrivals.includes(body.arrival)) throw bad('Choose when you can arrive.');
      const fee = Math.round(Number(body.visit_fee));
      if (!(fee >= 0 && fee <= 1000)) throw bad('Enter your visit fee in dollars.');
      ctx.alert = await store.updateAlert(alert.id, { response: 'accepted', responded_at: new Date().toISOString(), arrival: body.arrival, visit_fee: fee });
      ctx.state = 'accepted';
      if (!accepted.length) await mail.send(E.homeownerFirstOffer(request, contractor, ctx.alert));
    } else if (body.action === 'decline') {
      if (!['open', 'accepted', 'declined', 'full'].includes(state)) throw bad('This request is no longer open.', 409);
      ctx.alert = await store.updateAlert(alert.id, { response: 'declined', responded_at: new Date().toISOString() });
      ctx.state = 'declined';
    } else throw bad('Unknown action.');
    return view(ctx);
  }
});
