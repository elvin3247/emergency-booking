// The contractor's job page. GET ?t= reads the job; POST accepts, declines, sends an on-my-way update, or records how the job went.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, alertState } = require('../lib/http');
const { tryAutoMatch } = require('../lib/match');
const { tick } = require('../lib/tick');

async function load(t) {
  const alert = await store.alertByToken(str(t, 64));
  if (!alert) throw bad("We couldn't find that request. Check the link in your alert.", 404);
  const request = await store.requestById(alert.request_id);
  const contractor = (await store.contractorsByIds([alert.contractor_id]))[0];
  const all = await store.alertsForRequest(request.id);
  const accepted = all.filter(a => a.response === 'accepted' && a.outcome !== 'no_show');
  return { alert, request, contractor, accepted, state: alertState(alert, request, accepted.length) };
}

async function view({ alert: a, request: r, contractor, state }) {
  const out = {
    state, company: contractor.company,
    request: { service: r.service, problem: r.problem, zip: r.zip, county: r.county, timing: r.timing, system: r.system, note: r.note },
    photos: ['no_show', 'canceled'].includes(state) ? [] : await store.photoUrls(r.photos || []),
    mine: { arrival: a.arrival, visit_fee: a.visit_fee == null ? contractor.visit_fee : a.visit_fee },
    free_leads_left: contractor.free_leads_left, manage: contractor.manage_token
  };
  if (state === 'chosen') {
    out.customer = { name: r.name, phone: r.phone, email: r.email, address: r.address };
    out.eta = { status: a.eta_status || null, min: a.eta_min || null, at: a.eta_at || null };
    out.confirmed = !!(a.confirmed_at || a.eta_status);
  }
  if (state === 'chosen' || state === 'chosen_canceled') {
    out.lead_fee = a.lead_fee; out.job_result = a.job_result || null; out.fee_review = !!a.fee_review;
  }
  return out;
}

const RESULTS = { done: 'Job done', canceled: 'Customer canceled when I got there or before', no_contact: "Couldn't reach the customer" };

module.exports = wrap({
  async GET({ query }) {
    const ctx = await load(query.t);
    if (await tick(ctx.request, await store.alertsForRequest(ctx.request.id))) return view(await load(query.t));
    return view(ctx);
  },

  async POST({ body }) {
    const ctx = await load(body.t);
    const { alert, request, contractor, accepted, state } = ctx;
    const now = new Date().toISOString();
    if (body.action === 'accept') {
      if (state === 'accepted') return view(ctx);
      if (state !== 'open' && state !== 'declined') throw bad(state === 'full' ? 'This request already has ' + C.maxOffers + ' contractors.' : 'This request is no longer open.', 409);
      if (!C.arrivals.includes(body.arrival)) throw bad('Choose when you can arrive.');
      const fee = Math.round(Number(body.visit_fee));
      if (!(fee >= 0 && fee <= 1000)) throw bad('Enter your visit fee in dollars.');
      ctx.alert = await store.updateAlert(alert.id, { response: 'accepted', responded_at: now, arrival: body.arrival, visit_fee: fee });
      ctx.state = 'accepted';
      // If the homeowner asked us to book automatically and this yes qualifies, it's a match right now.
      if (await tryAutoMatch(request)) return view(await load(body.t));
      if (!accepted.length) await mail.send(E.homeownerFirstOffer(request, contractor, ctx.alert));
    } else if (body.action === 'decline') {
      if (!['open', 'accepted', 'declined', 'full'].includes(state)) throw bad('This request is no longer open.', 409);
      ctx.alert = await store.updateAlert(alert.id, { response: 'declined', responded_at: now });
      ctx.state = 'declined';
    } else if (body.action === 'eta') {
      // "On my way", "Running late", "I'm here": updates the homeowner's page, and emails them for the first two.
      if (state !== 'chosen') throw bad('You can send updates once the customer has chosen you.', 409);
      if (alert.job_result) throw bad('You already closed out this job.', 409);
      const status = ['on_way', 'late', 'arrived'].includes(body.status) ? body.status : null;
      const min = Math.round(Number(body.minutes));
      if (!status) throw bad('Choose an update.');
      if (status !== 'arrived' && !(min >= 5 && min <= 240)) throw bad('Choose about how many minutes away you are.');
      ctx.alert = await store.updateAlert(alert.id, Object.assign({ eta_status: status, eta_min: status === 'arrived' ? null : min, eta_at: now }, alert.confirmed_at ? {} : { confirmed_at: now }));
      if (status !== 'arrived') await mail.send(E.homeownerEta(request, contractor, ctx.alert));
    } else if (body.action === 'confirm') {
      // "I've talked to the customer": stops the homeowner from being offered another pro.
      if (state !== 'chosen') throw bad('Only the chosen contractor can confirm.', 409);
      if (!alert.confirmed_at) ctx.alert = await store.updateAlert(alert.id, { confirmed_at: now });
    } else if (body.action === 'result') {
      // How the job went. Anything but "done" puts the lead fee in front of you to decide.
      if (state !== 'chosen' && state !== 'chosen_canceled') throw bad('Only the chosen contractor can close out this job.', 409);
      if (!RESULTS[body.result]) throw bad('Choose how the job went.');
      if (alert.job_result) throw bad('You already closed out this job.', 409);
      const review = body.result !== 'done' && alert.lead_fee > 0;
      ctx.alert = await store.updateAlert(alert.id, Object.assign({ job_result: body.result, job_result_at: now }, review ? { fee_review: true } : {}));
      if (review) await mail.send(E.adminFlag('Lead fee review', request, contractor, ctx.alert, 'The contractor marked this job "' + RESULTS[body.result] + '" and the lead fee is waiting on your decision. Waive it or keep it on the admin page.'));
    } else throw bad('Unknown action.');
    return view(ctx);
  }
});
