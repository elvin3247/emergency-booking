// A contractor's private page (/pro?t=...): their jobs and what they owe, plus setup, pausing, settings, and their public profile.
// The link is the only key, so it never shows customer details. Each job links to its own job page for that.
const C = require('../lib/config');
const store = require('../lib/store');
const sms = require('../lib/sms');
const E = require('../lib/emails');
const { wrap, bad, str, digits, isEmail, withinHours, pauseUntil, isReady, isPaused, openedAt } = require('../lib/http');

async function load(t) {
  const c = await store.contractorByManageToken(str(t, 64));
  if (!c) throw bad("We couldn't find your settings. Use the link in your confirmation or alert email.", 404);
  return c;
}
// One line per job, in words a contractor would use.
function jobStatus(a, r) {
  if (a.outcome === 'no_show') return [a.confirmed_at || a.eta_status ? 'Customer reported no-show' : 'Customer switched pros (not confirmed)', 'bad'];
  if (a.outcome === 'standby' && r.status === 'matched' && Date.now() - new Date(r.matched_at).getTime() < C.standbyMin * 60000) return ['On standby', 'info'];
  if (r.status === 'canceled') return a.outcome === 'chosen' ? ['Won, then customer canceled', 'wait'] : ['Customer canceled', 'plain'];
  if (a.outcome === 'chosen') return [a.job_result === 'done' ? 'Won, job done' : a.job_result ? 'Won, closed out' : 'Won', 'ok'];
  if (a.outcome === 'not_chosen' || a.outcome === 'standby') return ['Customer chose someone else', 'plain'];
  if (r.status === 'matched') return [a.response === 'declined' ? 'You passed' : 'Filled by someone else', 'plain'];
  const open = Date.now() - openedAt(r) <= C.OPEN_MS;
  if (a.response === 'accepted') return open ? ['You said yes, waiting on customer', 'wait'] : ['Closed, not chosen', 'plain'];
  if (a.response === 'declined') return ['You passed', 'plain'];
  return open ? ['New, not answered yet', 'info'] : ['Closed, no answer', 'plain'];
}
async function jobs(c) {
  const alerts = await store.alertsForContractor(c.id, 100);
  const rs = Object.fromEntries((await store.requestsByIds([...new Set(alerts.map(a => a.request_id))])).map(r => [r.id, r]));
  return alerts.filter(a => rs[a.request_id]).map(a => {
    const r = rs[a.request_id], s = jobStatus(a, r);
    return { at: a.created_at, token: a.token, service: r.service, problem: r.problem, county: r.county, zip: r.zip, status: s[0], tone: s[1],
      arrival: a.arrival, visit_fee: a.visit_fee, lead_fee: a.outcome === 'chosen' || a.outcome === 'no_show' ? a.lead_fee || 0 : 0, paid: !!a.paid_at, fee_review: !!a.fee_review, job_result: a.job_result || null };
  });
}
const view = c => ({
  company: c.company, contact: c.contact, email: c.email, status: c.status, counties: c.counties, trades: c.trades || ['hvac'],
  visit_fee: c.visit_fee, business_phone: c.business_phone, alert_hours: c.alert_hours,
  paused_until: isPaused(c) ? c.paused_until : null, in_hours: withinHours(c.alert_hours),
  free_leads_left: c.free_leads_left, setup_complete: isReady(c), id: c.id,
  about: c.about || '', years_in_business: c.years_in_business, website: c.website || '', extra_emails: c.extra_emails || [],
  mobile: c.mobile || '', sms_on: !!c.sms_on, sms_off_reason: c.sms_on ? null : c.sms_off_reason || null, sms_ready: sms.on()
});
const full = async c => Object.assign(view(c), { jobs: await jobs(c) });

module.exports = wrap({
  async GET({ query }) { return full(await load(query.t)); },

  async POST({ body }) {
    const c = await load(body.t);
    if (body.action === 'pause') {
      if (!['morning', 'monday', 'off', 'resume'].includes(body.until)) throw bad('Choose how long to pause.');
      const until = pauseUntil(body.until);
      return full(await store.updateContractor(c.id, { paused_until: until ? until.toISOString() : null }));
    }
    if (body.action === 'settings') {
      const p = {};
      const fee = Math.round(Number(body.visit_fee));
      if (body.visit_fee === '' || body.visit_fee == null || !(fee >= 0 && fee <= 1000)) throw bad('Enter the visit fee customers will see, in dollars.');
      p.visit_fee = fee;
      if (digits(body.business_phone).length < 10) throw bad('Enter the 10-digit business phone customers should call.');
      p.business_phone = str(body.business_phone, 30);
      if (C.alertHours[body.alert_hours]) p.alert_hours = body.alert_hours;
      if (Array.isArray(body.counties)) {
        const counties = body.counties.filter(x => C.counties.includes(x));
        if (!counties.length) throw bad('Pick at least one county you serve.');
        p.counties = counties;
      }
      if (Array.isArray(body.trades)) {
        const trades = Object.keys(C.trades).filter(x => body.trades.includes(x));
        if (!trades.length) throw bad('Pick the kind of work you do.');
        p.trades = trades;
      }
      return full(await store.updateContractor(c.id, p));
    }
    if (body.action === 'profile') {
      // What homeowners see on the company's profile page, plus who else gets the alert emails.
      const years = body.years_in_business === '' || body.years_in_business == null ? null : Math.round(Number(body.years_in_business));
      if (years != null && !(years >= 0 && years <= 150)) throw bad('Enter years in business as a number.');
      let website = str(body.website, 200);
      if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
      if (website && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(website)) throw bad('That website address does not look right.');
      const extra = (Array.isArray(body.extra_emails) ? body.extra_emails : []).map(e => str(e, 120).toLowerCase()).filter(Boolean);
      if (extra.length > 3) throw bad('Add up to 3 extra alert emails.');
      const badEmail = extra.find(e => !isEmail(e));
      if (badEmail) throw bad(badEmail + ' is not a valid email address.');
      return full(await store.updateContractor(c.id, { about: str(body.about, 600) || null, years_in_business: years, website: website || null, extra_emails: extra.filter(e => e !== c.email) }));
    }
    if (body.action === 'texts') {
      // Text alerts on or off. Turning them on needs the opt-in box, and sends one confirmation text.
      if (body.on !== true) return full(await store.updateContractor(c.id, { sms_on: false, sms_off_reason: 'Turned off by you' }));
      if (body.consent !== true) throw bad('Check the box to agree to job alert texts.');
      if (!sms.e164(body.mobile)) throw bad('Enter a 10-digit US mobile number.');
      const saved = await store.updateContractor(c.id, { mobile: str(body.mobile, 30), sms_on: true, sms_off_reason: null, sms_consent_at: new Date().toISOString(), sms_consent_text: C.consent.sms });
      await sms.send(saved.mobile, E.textWelcome(saved));
      return full(saved);
    }
    throw bad('Unknown action.');
  }
});
