// POST: step 1 of contractor sign-up. Returns the contractor's private settings link token.
// They stay "pending" until you approve them on the admin page, and get no requests until step 2 (fee and phone) is done.
// Also POST { action: 'invite_click' | 'unsubscribe', inv }: a recruiting invite was opened, or its "no thanks" link was used.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const sms = require('../lib/sms');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, digits, token } = require('../lib/http');

// Recruiting invites carry a private code (inv) that ties a sign-up back to the company you invited.
async function prospect(inv) {
  const t = str(inv, 64);
  return t ? store.prospectByToken(t).catch(() => null) : null;
}

module.exports = wrap({
  async POST({ body }) {
    if (body.action === 'invite_click') {
      const p = await prospect(body.inv);
      if (p && !p.clicked_at) await store.updateProspect(p.id, { clicked_at: new Date().toISOString() });
      return { ok: true, email: p && !p.contractor_id ? p.email || '' : '' };
    }
    if (body.action === 'unsubscribe') {
      const p = await prospect(body.inv);
      if (!p) throw bad("We couldn't find that invite. You won't get more emails from us either way: reply to the email and we'll make sure.", 404);
      if (!p.unsubscribed_at) await store.updateProspect(p.id, { unsubscribed_at: new Date().toISOString() });
      return { ok: true, company: p.company };
    }

    if (body.website) return { token: '' };
    const counties = Array.isArray(body.counties) ? body.counties.filter(c => C.counties.includes(c)) : [];
    const trades = Array.isArray(body.trades) ? Object.keys(C.trades).filter(t => body.trades.includes(t)) : [];
    const c = {
      company: str(body.company, 120), contact: str(body.contact, 80), email: str(body.email, 120).toLowerCase(), mobile: str(body.mobile, 30),
      license: str(body.license, 120).toUpperCase(), counties, trades, alert_hours: C.alertHours[body.alert_hours] ? body.alert_hours : 'any', source: str(body.source, 120) || null
    };
    if (!c.company) throw bad('Enter your company name.');
    if (!c.contact) throw bad('Enter your name so we know who to call.');
    if (!isEmail(c.email)) throw bad('Enter a valid email address. Job alerts go there.');
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
    // Text alerts: a separate box they can leave unchecked.
    const now = new Date().toISOString();
    if (body.sms === true) Object.assign(c, { sms_on: true, sms_consent_at: now, sms_consent_text: C.consent.sms });

    const inv = await prospect(body.inv) || await store.prospectByEmail(c.email).catch(() => null);
    if (inv && !c.source) c.source = 'invite';

    let row;
    try {
      row = await store.insertContractor(Object.assign(c, { manage_token: token(), status: 'pending', free_leads_left: C.freeLeads, consent_at: now, consent_text: C.consent.contractor }));
    } catch (e) {
      if (e.code === '23505') throw bad('That email has already applied. Use the link in your confirmation email to change your settings.', 409);
      throw e;
    }
    if (inv && !inv.contractor_id) await store.updateProspect(inv.id, { contractor_id: row.id, clicked_at: inv.clicked_at || now }).catch(e => console.error('Could not link invite: ' + e.message));
    await Promise.all([mail.sendAll([E.adminSignup(row), E.contractorApplied(row)]), row.sms_on ? sms.send(row.mobile, E.textWelcome(row)) : null]);
    return { token: row.manage_token };
  }
});
