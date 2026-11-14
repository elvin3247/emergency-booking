// The owner's admin page (/admin). Every call needs the ADMIN_KEY set in Vercel.
// GET: contractors, recent requests, lead fees, coverage gaps, and the funnel. ?view=setup: the launch checklist. ?view=recruit: recruiting.
// POST: approve, pause, or edit a contractor, invite one, cancel a spam request, hide a review, decide lead fees, run the daily job now,
// send test messages, and manage the recruiting list.
// GET ?job=daily is also what Vercel's daily schedule calls, with the CRON_SECRET you set in Vercel.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, requireAdmin, isReady, isPaused } = require('../lib/http');
const crypto = require('crypto');
const { daily } = require('../lib/daily');
const recruit = require('../lib/recruit');
const setup = require('../lib/setup');
const sms = require('../lib/sms');
const isId = v => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const isCron = headers => {
  const want = process.env.CRON_SECRET ? Buffer.from('Bearer ' + process.env.CRON_SECRET) : null, got = Buffer.from(String(headers.authorization || ''));
  return !!want && want.length === got.length && crypto.timingSafeEqual(want, got);
};
// The funnel: unique devices at each tracked step over the last 7 days.
async function funnel() {
  const ev = await store.eventsSince(new Date(Date.now() - 7 * 864e5).toISOString()), out = {};
  ev.forEach(e => { (out[e.name] = out[e.name] || new Set()).add(e.device || Math.random()); });
  Object.keys(out).forEach(k => { out[k] = out[k].size; });
  return out;
}

module.exports = wrap({
  async GET({ headers, query }) {
    if (query.job === 'daily') { if (!isCron(headers)) requireAdmin(headers); return daily(); }
    requireAdmin(headers);
    if (query.view === 'setup') return setup.run();
    if (query.view === 'recruit') return recruit.view();
    const contractors = await store.allContractors();
    const requests = await store.recentRequests(100);
    const alerts = await store.alertsForRequests(requests.map(r => r.id));
    const chosen = await store.chosenAlerts();
    const name = Object.fromEntries(contractors.map(c => [c.id, c.company]));
    const stars = {};
    (await store.reviewsFor(contractors.map(c => c.id))).forEach(v => { const s = (stars[v.chosen_contractor_id] = stars[v.chosen_contractor_id] || { n: 0, sum: 0 }); s.n++; s.sum += v.rating; });
    const now = Date.now();
    return {
      contractors: contractors.map(c => ({
        id: c.id, created_at: c.created_at, company: c.company, contact: c.contact, email: c.email, mobile: c.mobile, business_phone: c.business_phone,
        license: c.license, trades: c.trades || ['hvac'], counties: c.counties, visit_fee: c.visit_fee, alert_hours: c.alert_hours, status: c.status,
        setup_complete: isReady(c), self_paused: isPaused(c), free_leads_left: c.free_leads_left, source: c.source,
        reviews: stars[c.id] ? { count: stars[c.id].n, avg: Math.round(stars[c.id].sum / stars[c.id].n * 10) / 10 } : null,
        owed: chosen.filter(a => a.contractor_id === c.id && a.lead_fee > 0 && !a.paid_at).reduce((t, a) => t + a.lead_fee, 0)
      })),
      requests: requests.map(r => {
        const mine = alerts.filter(a => a.request_id === r.id);
        const yes = mine.filter(a => a.response === 'accepted' && a.responded_at).map(a => new Date(a.responded_at) - new Date(r.created_at));
        return {
          id: r.id, created_at: r.created_at, service: r.service, problem: r.problem, county: r.county, zip: r.zip, timing: r.timing, name: r.name, phone: r.phone, email: r.email, source: r.source, token: r.token,
          state: r.status === 'canceled' ? 'canceled' : r.status === 'matched' ? 'matched' : now - new Date(r.reopened_at || r.created_at).getTime() > C.OPEN_MS ? 'closed' : 'open',
          cancel_reason: r.cancel_reason || null, reopened: !!r.reopened_at, on_time: r.on_time, photos: (r.photos || []).length,
          first_yes_min: yes.length ? Math.round(Math.min.apply(null, yes) / 6000) / 10 : null,
          alerted: mine.length, accepted: mine.filter(a => a.response === 'accepted').length, chosen: name[r.chosen_contractor_id] || null,
          rating: r.rating, showed_up: r.showed_up, review: r.review, review_hidden: !!r.review_hidden
        };
      }),
      fees: chosen.filter(a => a.lead_fee > 0 || a.fee_review).map(a => ({ id: a.id, at: a.responded_at || a.created_at, company: name[a.contractor_id] || 'Unknown', lead_fee: a.lead_fee, paid_at: a.paid_at || null, fee_review: !!a.fee_review, job_result: a.job_result || null, no_show: a.outcome === 'no_show' })),
      lead_fee: C.leadFee, funnel: await funnel()
    };
  },

  async POST({ body, headers }) {
    requireAdmin(headers);
    if (body.action === 'status') {
      if (!['approved', 'paused', 'pending'].includes(body.status)) throw bad('Unknown status.');
      const before = isId(body.id) && (await store.contractorsByIds([str(body.id, 64)]))[0];
      if (!before) throw bad("We couldn't find that contractor.", 404);
      const c = await store.updateContractor(before.id, { status: body.status });
      if (body.status === 'approved' && before.status !== 'approved') await mail.send(E.contractorApproved(c));
      return { ok: true };
    }
    if (['paid', 'unpaid', 'waive', 'keep'].includes(body.action)) {
      const patch = body.action === 'paid' ? { paid_at: new Date().toISOString() } : body.action === 'unpaid' ? { paid_at: null } : body.action === 'keep' ? { fee_review: false } : { lead_fee: 0, paid_at: null, fee_review: false };
      if (!isId(body.id)) throw bad("We couldn't find that lead.", 404);
      await store.updateAlert(str(body.id, 64), patch);
      return { ok: true };
    }
    if (body.action === 'edit_contractor') {
      // Fix what a contractor can't change themselves: company, license, trades, counties, business phone.
      const c = isId(body.id) && (await store.contractorsByIds([str(body.id, 64)]))[0];
      if (!c) throw bad("We couldn't find that contractor.", 404);
      const pick = (all, v) => all.filter(x => (Array.isArray(v) ? v : []).includes(x));
      const trades = pick(Object.keys(C.trades), body.trades), counties = pick(C.counties, body.counties);
      const p = { company: str(body.company, 100), license: str(body.license, 120), business_phone: str(body.business_phone, 30) };
      if (!p.company || !p.license) throw bad('Company and license are required.');
      if (!trades.length || !counties.length) throw bad('Pick at least one trade and one county.');
      await store.updateContractor(c.id, Object.assign(p, { trades, counties }));
      return { ok: true };
    }
    // After a recruiting call: email them a sign-up link with their email filled in. Added to the recruiting list so it's tracked.
    if (body.action === 'invite') return recruit.inviteOne(body.email, body.name, body.trade, body.county);
    // Recruiting list: add from a file, invite in bulk, or mark after a call.
    if (body.action === 'prospects_import') return recruit.importRows(body.rows, body.list_name);
    if (body.action === 'prospects_invite') return recruit.invite(body.ids, body.note);
    if (body.action === 'prospect_update') return recruit.update(body.id, body);
    // Launch checklist: prove email and texts really arrive.
    if (body.action === 'test_email') {
      const to = str(body.to, 120).toLowerCase() || C.ADMIN_EMAIL;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw bad('Enter the email address to send the test to.');
      const r = await mail.send(E.testEmail(to));
      if (!r.ok) throw bad(r.error || 'The test email did not send.', 502);
      return { ok: true, logged: !!r.logged, to };
    }
    if (body.action === 'test_text') {
      if (!sms.e164(body.to)) throw bad('Enter a 10-digit US mobile number.');
      const r = await sms.send(body.to, C.brand + ': Test text from your launch checklist. Texting works.');
      if (!r.ok) throw bad(r.error || 'The test text did not send.', 502);
      return { ok: true };
    }
    if (body.action === 'sample_alert') {
      // What a pro sees for a new request, sent to you. Uses a made-up job; nothing is saved.
      const to = str(body.email, 120).toLowerCase() || C.ADMIN_EMAIL;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw bad('Enter the email address to send the sample to.');
      const phone = str(body.phone, 30);
      if (phone && !sms.e164(phone)) throw bad('Enter a 10-digit US mobile number, or leave it empty.');
      const fake = { id: 'sample', email: to, mobile: phone, sms_on: !!phone, extra_emails: [], manage_token: 'sample', company: 'Sample Co.' };
      const req = { service: 'heating', problem: 'no-heat', zip: '07059', county: 'Somerset', timing: 'As soon as possible', system: 'Gas furnace', note: 'Sample request from your launch checklist', photos: [] };
      const msg = E.contractorAlert(fake, req, { token: 'sample' });
      msg.subject = '[Sample] ' + msg.subject; msg.textFor = null;
      const r = await mail.send(msg);
      if (!r.ok) throw bad(r.error || 'The sample did not send.', 502);
      return { ok: true, texted: !!phone && sms.on() };
    }
    if (body.action === 'cancel_request') {
      // Spam or a test: close it quietly. Pros who said yes are told it's canceled.
      const r = isId(body.id) && await store.requestById(str(body.id, 64));
      if (!r) throw bad("We couldn't find that request.", 404);
      if (r.status === 'canceled') return { ok: true };
      const saved = await store.updateRequest(r.id, { status: 'canceled', canceled_at: new Date().toISOString(), cancel_reason: 'Removed by admin' });
      const alerts = (await store.alertsForRequest(r.id)).filter(a => a.response === 'accepted' && a.outcome !== 'no_show');
      const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
      await mail.sendAll(alerts.map(a => E.contractorCanceled(cs[a.contractor_id], saved, a, a.outcome === 'chosen')));
      return { ok: true };
    }
    if (body.action === 'hide_review') {
      // Hidden reviews drop out of the pro's rating and profile. Reversible.
      const r = isId(body.id) && await store.requestById(str(body.id, 64));
      if (!r || r.rating == null) throw bad("We couldn't find that review.", 404);
      await store.updateRequest(r.id, { review_hidden: body.hidden !== false });
      return { ok: true };
    }
    if (body.action === 'daily') return daily();
    throw bad('Unknown action.');
  }
});
