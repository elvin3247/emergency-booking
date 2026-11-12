// A contractor's private settings page (/pro?t=...): finish setup, pause or resume alerts, change fee, phone, hours, counties.
// The link is the only key, so it never shows the customer data of past jobs.
const C = require('../lib/config');
const store = require('../lib/store');
const { wrap, bad, str, digits, withinHours, pauseUntil, isReady, isPaused } = require('../lib/http');

async function load(t) {
  const c = await store.contractorByManageToken(str(t, 64));
  if (!c) throw bad("We couldn't find your settings. Use the link in your confirmation or alert email.", 404);
  return c;
}
const view = c => ({
  company: c.company, contact: c.contact, email: c.email, status: c.status, counties: c.counties,
  visit_fee: c.visit_fee, business_phone: c.business_phone, alert_hours: c.alert_hours,
  paused_until: isPaused(c) ? c.paused_until : null, in_hours: withinHours(c.alert_hours),
  free_leads_left: c.free_leads_left, setup_complete: isReady(c)
});

module.exports = wrap({
  async GET({ query }) { return view(await load(query.t)); },

  async POST({ body }) {
    const c = await load(body.t);
    if (body.action === 'pause') {
      if (!['morning', 'monday', 'off', 'resume'].includes(body.until)) throw bad('Choose how long to pause.');
      const until = pauseUntil(body.until);
      return view(await store.updateContractor(c.id, { paused_until: until ? until.toISOString() : null }));
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
      return view(await store.updateContractor(c.id, p));
    }
    throw bad('Unknown action.');
  }
});
