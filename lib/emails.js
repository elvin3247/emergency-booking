const C = require('./config');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = body => '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#15151A;max-width:520px">' + body + '<p style="color:#5B5E6A;font-size:13px;margin-top:28px">' + esc(C.brand) + '</p></div>';
const btn = (url, label) => '<p><a href="' + url + '" style="background:#4A2FE0;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">' + esc(label) + '</a></p>';
const rows = pairs => '<table style="border-collapse:collapse">' + pairs.filter(p => p[1]).map(p => '<tr><td style="padding:2px 14px 2px 0;color:#5B5E6A;vertical-align:top">' + esc(p[0]) + '</td><td style="padding:2px 0"><b>' + esc(p[1]) + '</b></td></tr>').join('') + '</table>';
const problem = r => (C.problems[r.problem] || [r.problem])[0];
const statusUrl = r => C.SITE_URL + '/status?t=' + r.token;
const respondUrl = a => C.SITE_URL + '/respond?t=' + a.token;
const manageUrl = c => C.SITE_URL + '/pro?t=' + c.manage_token;
const pauseLine = c => '<p style="font-size:14px;color:#5B5E6A">Busy? <a href="' + manageUrl(c) + '" style="color:#15151A">Pause alerts or change your settings</a>.</p>';
const service = r => (C.services[r.service] || {}).name;
const tradeNames = c => (c.trades || []).map(t => C.trades[t].name).join(', ');
const jobFacts = r => rows([['Service', service(r)], ['Problem', problem(r)], ['Where', r.county + ' County, ZIP ' + r.zip], ['When', r.timing], ['System', r.system], ['Notes', r.note]]);

module.exports = {
  contractorAlert: (c, r, a) => ({
    to: c.email,
    subject: 'New ' + problem(r).toLowerCase() + ' request in ' + r.county + ' County (' + r.zip + ')',
    html: wrap('<p>A homeowner near you needs help. Can you take it?</p>' + jobFacts(r) + btn(respondUrl(a), 'Tap to say you can come') +
      '<p style="font-size:14px;color:#5B5E6A">Up to ' + C.maxOffers + ' contractors can respond. You pay only if the customer chooses you. Saying no costs nothing.</p>' + pauseLine(c))
  }),
  homeownerReceived: (r, alerted) => ({
    to: r.email,
    subject: 'We got your request: ' + problem(r).toLowerCase(),
    html: wrap('<p>Hi ' + esc(r.name) + ',</p><p>' + (alerted
      ? 'We alerted ' + alerted + ' licensed contractor' + (alerted === 1 ? '' : 's') + ' who cover' + (alerted === 1 ? 's' : '') + ' ' + esc(r.county) + ' County. Answers appear on your request page as they come in.'
      : 'We don\'t have a ' + ((C.trades[(C.services[r.service] || {}).trade] || {}).pro || 'contractor') + ' signed up for ' + esc(r.county) + ' County at this hour yet. Your request page has more, and our team has been told.') +
      '</p>' + btn(statusUrl(r), 'Open your request page') + '<p style="font-size:14px;color:#5B5E6A">If you smell gas or a carbon monoxide alarm is sounding, leave the house and call 911 or your gas utility from outside.</p>')
  }),
  homeownerFirstOffer: (r, c, a) => ({
    to: r.email,
    subject: c.company + ' can come: ' + a.arrival.toLowerCase(),
    html: wrap('<p>' + esc(c.company) + ' said yes to your request.</p>' + rows([['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee]]) +
      '<p>Choose them now, or wait a few minutes to see if others respond.</p>' + btn(statusUrl(r), 'See who can come'))
  }),
  homeownerMatched: (r, c, a) => ({
    to: r.email,
    subject: 'You\'re connected with ' + c.company,
    html: wrap('<p>' + esc(c.company) + ' has your details and will contact you to confirm.</p>' +
      rows([['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee + ', paid to the contractor'], ['Their phone', c.business_phone], ['License', c.license]]) + btn(statusUrl(r), 'View your request'))
  }),
  contractorChosen: (c, r, a, fee, freeLeft) => ({
    to: c.email,
    subject: 'You were chosen: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer chose you. Please call them now to confirm your arrival.</p>' +
      rows([['Customer', r.name], ['Phone', r.phone], ['Email', r.email], ['Address', r.address + ', ' + r.zip], ['Problem', problem(r)], ['System', r.system], ['Notes', r.note], ['You offered', a.arrival + ', $' + a.visit_fee + ' visit fee']]) +
      '<p>' + (fee ? 'Lead fee for this job: $' + fee + '. We\'ll invoice you.' : 'This lead is free. Free leads left: ' + freeLeft + '.') + '</p>' + btn(respondUrl(a), 'Open the job page'))
  }),
  contractorFilled: (c, r) => ({
    to: c.email,
    subject: 'Filled: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer went with another contractor for this request. There\'s no charge. Thanks for answering.</p>')
  }),
  adminNewRequest: (r, matches) => ({
    to: C.ADMIN_EMAIL,
    subject: (matches.length ? '' : 'COVERAGE GAP: ') + 'New request, ' + problem(r) + ', ' + r.county + ' ' + r.zip,
    html: wrap('<p>' + (matches.length ? 'Alerted ' + matches.length + ': ' + matches.map(c => esc(c.company)).join(', ') + '.' : '<b>No approved contractor covers this county at this hour.</b> Nobody was alerted.') + '</p>' +
      jobFacts(r) + rows([['Customer', r.name], ['Phone', r.phone], ['Email', r.email], ['Address', r.address], ['Came from', r.source || 'Direct or unknown']]) + btn(statusUrl(r), 'Customer\'s request page'))
  }),
  adminMatched: (r, c, a, fee) => ({
    to: C.ADMIN_EMAIL,
    subject: 'Matched: ' + c.company + ' for ' + r.zip + ' (lead fee $' + fee + ')',
    html: wrap(rows([['Contractor', c.company], ['Customer', r.name], ['Problem', problem(r)], ['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee], ['Lead fee owed', '$' + fee]]))
  }),
  adminSignup: c => ({
    to: C.ADMIN_EMAIL,
    subject: 'Contractor applied: ' + c.company,
    html: wrap('<p>Check the license with the state board for each trade listed (HVACR, master plumbers, or electrical contractors), then set <b>status</b> to <b>approved</b> in the Supabase contractors table.</p>' +
      rows([['Company', c.company], ['Contact', c.contact], ['Does', tradeNames(c)], ['License', c.license], ['Email', c.email], ['Mobile', c.mobile], ['Business phone', c.business_phone], ['Counties', c.counties.join(', ')], ['Visit fee', c.visit_fee == null ? '' : '$' + c.visit_fee], ['Alert hours', C.alertHours[c.alert_hours]], ['Came from', c.source || 'Direct or unknown']]))
  }),
  contractorApplied: c => ({
    to: c.email,
    subject: 'We got your application',
    html: wrap('<p>Thanks for applying, ' + esc(c.contact || c.company) + '. We check your New Jersey license before you receive any requests.</p>' +
      (c.visit_fee == null || !c.business_phone ? '<p>One more step: add your visit fee and the business phone customers should call.</p>' + btn(manageUrl(c), 'Finish your setup') : btn(manageUrl(c), 'Your settings')) +
      '<p style="font-size:14px;color:#5B5E6A">Keep this email. The link is how you pause alerts or change your settings later. No password needed, so don\'t share it.</p>')
  })
};
