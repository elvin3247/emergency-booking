// POST: a contractor applies. They stay "pending" until you approve them in Supabase.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, digits } = require('../lib/http');

module.exports = wrap({
  async POST({ body }) {
    if (body.website) return { ok: true };
    const counties = Array.isArray(body.counties) ? body.counties.filter(c => C.counties.includes(c)) : [];
    const c = {
      company: str(body.company, 120), contact: str(body.contact, 80), email: str(body.email, 120).toLowerCase(), mobile: str(body.mobile, 30),
      business_phone: str(body.business_phone, 30), license: str(body.license, 40).toUpperCase(), counties, visit_fee: Math.round(Number(body.visit_fee)),
      alert_hours: C.alertHours[body.alert_hours] ? body.alert_hours : 'any'
    };
    if (!c.company) throw bad('Enter your company name.');
    if (!isEmail(c.email)) throw bad('Enter a valid email address. Job alerts go there for now.');
    if (digits(c.mobile).length < 10) throw bad('Enter a 10-digit mobile number.');
    if (digits(c.business_phone).length < 10) throw bad('Enter the 10-digit business phone customers should call.');
    if (c.license.length < 6) throw bad('Enter your NJ HVACR license number. We check it with the state board.');
    if (!counties.length) throw bad('Pick at least one county you serve.');
    if (body.visit_fee === '' || body.visit_fee == null || !(c.visit_fee >= 0 && c.visit_fee <= 1000)) throw bad('Enter the visit fee customers will see, in dollars.');
    if (body.consent !== true) throw bad('Check the box to agree to alerts and the lead terms.');

    let row;
    try {
      row = await store.insertContractor(Object.assign(c, { status: 'pending', free_leads_left: C.freeLeads, consent_at: new Date().toISOString(), consent_text: C.consent.contractor }));
    } catch (e) {
      if (e.code === '23505') throw bad('That email has already applied. Reply to our confirmation email if you need to change anything.', 409);
      throw e;
    }
    await mail.sendAll([E.adminSignup(row), E.contractorApplied(row)]);
    return { ok: true };
  }
});
