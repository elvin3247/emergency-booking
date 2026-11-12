// POST: step 1 of contractor sign-up. Returns the contractor's private settings link token.
// They stay "pending" until you approve them in Supabase, and get no requests until step 2 (fee and phone) is done.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, digits, token } = require('../lib/http');

module.exports = wrap({
  async POST({ body }) {
    if (body.website) return { token: '' };
    const counties = Array.isArray(body.counties) ? body.counties.filter(c => C.counties.includes(c)) : [];
    const trades = Array.isArray(body.trades) ? Object.keys(C.trades).filter(t => body.trades.includes(t)) : [];
    const c = {
      company: str(body.company, 120), contact: str(body.contact, 80), email: str(body.email, 120).toLowerCase(), mobile: str(body.mobile, 30),
      license: str(body.license, 120).toUpperCase(), counties, trades, alert_hours: C.alertHours[body.alert_hours] ? body.alert_hours : 'any', source: str(body.source, 120) || null
    };
    if (!c.company) throw bad('Enter your company name.');
    if (!c.contact) throw bad('Enter your name so we know who to call.');
    if (!isEmail(c.email)) throw bad('Enter a valid email address. Job alerts go there for now.');
    if (digits(c.mobile).length < 10) throw bad('Enter a 10-digit mobile number.');
    if (!trades.length) throw bad('Pick the kind of work you do.');
    if (c.license.length < 6) throw bad('Enter your New Jersey license number. We check it with the state before you get requests.');
    if (!counties.length) throw bad('Pick at least one county you serve.');
    // Step 2 fields are optional here (filled in on the settings page), but checked if sent.
    if (body.visit_fee != null && body.visit_fee !== '') {
      c.visit_fee = Math.round(Number(body.visit_fee));
      if (!(c.visit_fee >= 0 && c.visit_fee <= 1000)) throw bad('Enter your visit fee in dollars.');
    }
    if (body.business_phone) {
      if (digits(body.business_phone).length < 10) throw bad('Enter the 10-digit business phone customers should call.');
      c.business_phone = str(body.business_phone, 30);
    }
    if (body.consent !== true) throw bad('Check the box to agree to alerts and the lead terms.');

    let row;
    try {
      row = await store.insertContractor(Object.assign(c, { manage_token: token(), status: 'pending', free_leads_left: C.freeLeads, consent_at: new Date().toISOString(), consent_text: C.consent.contractor }));
    } catch (e) {
      if (e.code === '23505') throw bad('That email has already applied. Use the link in your confirmation email to change your settings.', 409);
      throw e;
    }
    await mail.sendAll([E.adminSignup(row), E.contractorApplied(row)]);
    return { token: row.manage_token };
  }
});
