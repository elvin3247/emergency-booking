const C = require('./config');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = body => '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#15151A;max-width:520px">' + body + '<p style="color:#5B5E6A;font-size:13px;margin-top:28px">' + esc(C.brand) + '</p></div>';
const btn = (url, label) => '<p><a href="' + url + '" style="background:#4A2FE0;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">' + esc(label) + '</a></p>';
const rows = pairs => '<table style="border-collapse:collapse">' + pairs.filter(p => p[1]).map(p => '<tr><td style="padding:2px 14px 2px 0;color:#5B5E6A;vertical-align:top">' + esc(p[0]) + '</td><td style="padding:2px 0"><b>' + esc(p[1]) + '</b></td></tr>').join('') + '</table>';
const problem = r => (C.problems[r.problem] || [r.problem])[0];
const statusUrl = r => C.SITE_URL + '/status?t=' + r.token;
const respondUrl = a => C.SITE_URL + '/respond?t=' + a.token;
const manageUrl = c => C.SITE_URL + '/pro?t=' + c.manage_token;
const pauseLine = c => '<p style="font-size:14px;color:#5B5E6A">Busy? <a href="' + pauseUrl(c) + '" style="color:#15151A">Pause alerts until 7am</a> · <a href="' + manageUrl(c) + '" style="color:#15151A">Your jobs and settings</a></p>';
const service = r => (C.services[r.service] || {}).name;
const pro = r => (C.trades[(C.services[r.service] || {}).trade] || {}).pro || 'contractor';
const aPro = r => (/^[aeiou]/i.test(pro(r)) ? 'an ' : 'a ') + pro(r);
const tradeNames = c => (c.trades || []).map(t => C.trades[t].name).join(', ');
// Alerts and job emails go to the contractor's main email, with their extra alert emails copied.
// Town name from the ZIP, so pros can tell at a glance whether a job is close.
const ZIPS = require('../scripts/nj-zips.json');
const town = zip => (ZIPS[zip] ? ZIPS[zip][1] : '');
const place = r => (town(r.zip) ? town(r.zip) + ', ' : '') + r.county + ' County';
const pauseUrl = c => manageUrl(c) + '&pause=night';
const proMsg = (c, m) => Object.assign({ to: c.email, cc: (c.extra_emails || []).filter(Boolean) }, m);
const eta = a => a.eta_status === 'arrived' ? 'Arrived' : (a.eta_status === 'late' ? 'Running late, about ' : 'On the way, about ') + a.eta_min + ' minutes';
const jobFacts = r => rows([['Service', service(r)], ['Problem', problem(r)], ['Where', place(r) + ', ZIP ' + r.zip], ['When', r.timing], ['System', r.system], ['Notes', r.note]]);

module.exports = {
  contractorAlert: (c, r, a, again, nearby) => proMsg(c, {
    subject: (again ? 'Still needed: ' : 'New ') + problem(r).toLowerCase() + (town(r.zip) ? ' in ' + town(r.zip) : '') + ' request in ' + r.county + ' County (' + r.zip + ')',
    html: wrap((nearby ? '<p><b>This one is just outside your counties:</b> nobody closer has answered yet.</p>' : '') + '<p>' + (again ? 'This homeowner still needs help. The pro they picked earlier didn\'t make it. Can you come?' : 'A homeowner near you needs help. Can you take it?') + '</p>' + jobFacts(r) + ((r.photos || []).length ? '<p>' + r.photos.length + ' photo' + (r.photos.length === 1 ? '' : 's') + ' on the job page.</p>' : '') + btn(respondUrl(a), 'Tap to say you can come') +
      '<p style="font-size:14px;color:#5B5E6A">Up to ' + C.maxOffers + ' contractors can respond. ' + (C.freeLaunch ? 'There are no lead fees during our launch.' : 'You pay only if the customer chooses you.') + ' Saying no costs nothing.</p>' + pauseLine(c))
  }),
  homeownerReceived: (r, alerted) => ({
    to: r.email,
    subject: 'We got your request: ' + problem(r).toLowerCase(),
    html: wrap('<p>Hi' + (r.name ? ' ' + esc(r.name) : '') + ',</p><p>' + (alerted
      ? 'We alerted ' + alerted + ' licensed contractor' + (alerted === 1 ? '' : 's') + ' who cover' + (alerted === 1 ? 's' : '') + ' ' + esc(r.county) + ' County. Answers appear on your request page as they come in.'
      : 'We don\'t have ' + aPro(r) + ' signed up for ' + esc(r.county) + ' County at this hour yet. Your request page has more, and our team has been told.') +
      '</p>' + (r.name && r.address ? '' : '<p><b>One more thing:</b> add your name and address on your request page so you can choose a pro the moment one says yes.</p>') + btn(statusUrl(r), 'Open your request page') + '<p style="font-size:14px;color:#5B5E6A">If you smell gas or a carbon monoxide alarm is sounding, leave the house and call 911 or your gas utility from outside.</p>')
  }),
  homeownerFirstOffer: (r, c, a) => ({
    to: r.email,
    subject: c.company + ' can come: ' + a.arrival.toLowerCase(),
    html: wrap('<p>' + esc(c.company) + ' said yes to your request.</p>' + rows([['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee]]) +
      '<p>Choose them now, or wait a few minutes to see if others respond.</p>' + btn(statusUrl(r), 'See who can come'))
  }),
  homeownerMatched: (r, c, a, auto) => ({
    to: r.email,
    subject: (auto ? 'Booked for you: ' : 'You\'re connected with ') + c.company,
    html: wrap('<p>' + (auto ? 'As you asked, we booked the first licensed pro who can come within the hour: <b>' + esc(c.company) + '</b>. ' : '') + esc(c.company) + ' has your details and will contact you to confirm.</p>' +
      rows([['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee + ', paid to the contractor'], ['Their phone', c.business_phone], ['License', c.license]]) + btn(statusUrl(r), 'View your request') +
      '<p style="font-size:14px;color:#5B5E6A">After the visit, open the same page and tell us how it went. It takes ten seconds and helps your neighbors pick.</p>')
  }),
  contractorChosen: (c, r, a, fee, freeLeft) => proMsg(c, {
    subject: 'You were chosen: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer chose you. Please call them now to confirm your arrival.</p>' +
      rows([['Customer', r.name], ['Phone', r.phone], ['Email', r.email], ['Address', r.address + ', ' + r.zip], ['Problem', problem(r)], ['System', r.system], ['Notes', r.note], ['You offered', a.arrival + ', $' + a.visit_fee + ' visit fee']]) +
      '<p>' + (fee ? 'Lead fee for this job: $' + fee + '. We\'ll send you an invoice.' : C.freeLaunch ? 'No lead fee: we\'re free for contractors during our launch.' : 'This lead is free. Free leads left: ' + freeLeft + '.') + '</p>' + btn(respondUrl(a), 'Open the job page') +
      '<p style="font-size:14px;color:#5B5E6A">On the job page, tap "On my way" when you leave so the customer knows you\'re coming.</p>')
  }),
  contractorFilled: (c, r) => proMsg(c, {
    subject: 'Filled: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer went with another contractor for this request. There\'s no charge. Thanks for answering.</p><p>You\'re on standby for the next ' + C.standbyMin + ' minutes: if their first choice falls through, they may pick you, and we\'ll email you right away. Nothing to do now.</p>')
  }),
  // Timed steps (see lib/tick.js)
  contractorReminder: (c, r, a) => proMsg(c, {
    subject: 'Still open, no answers yet: ' + problem(r).toLowerCase() + (town(r.zip) ? ' in ' + town(r.zip) : ''),
    html: wrap('<p>Nobody has said yes to this one yet, so the homeowner is still waiting. Can you come?</p>' + jobFacts(r) + btn(respondUrl(a), 'Tap to say you can come') + pauseLine(c))
  }),
  contractorConfirmNudge: (c, r, a) => proMsg(c, {
    subject: 'Please confirm with ' + r.name + ': ' + problem(r).toLowerCase(),
    html: wrap('<p>The customer chose you ' + C.confirmMin + ' minutes ago and hasn\'t heard back yet. Please call them, then tap <b>I\'ve talked to the customer</b> on the job page, or send an "On my way" update.</p><p>If they don\'t hear from you, they can switch to another pro.</p>' + rows([['Customer', r.name], ['Phone', r.phone]]) + btn(respondUrl(a), 'Open the job page'))
  }),
  homeownerUnconfirmed: (r, c, standby) => ({
    to: r.email,
    subject: 'Haven\'t heard from ' + c.company + '?',
    html: wrap('<p>' + esc(c.company) + ' hasn\'t confirmed yet. Give them a call at <b>' + esc(c.business_phone) + '</b>.</p><p>' + (standby ? 'If you can\'t reach them, ' + standby + ' other pro' + (standby === 1 ? ' is' : 's are') + ' still available. You can switch with one tap on your request page.' : 'If you can\'t reach them, you can send your request out again from your request page.') + '</p>' + btn(statusUrl(r), 'Open your request'))
  }),
  contractorReplaced: (c, r, a) => proMsg(c, {
    subject: 'Customer switched pros: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer couldn\'t reach you, so they switched to another pro. Please don\'t head over.</p><p>Next time, tap <b>I\'ve talked to the customer</b> or send an "On my way" update right after you call. That keeps the job yours.</p>')
  }),
  // Daily job (see api/admin.js ?job=daily)
  homeownerReviewReminder: (r, c) => ({
    to: r.email,
    subject: 'How did ' + c.company + ' do?',
    html: wrap('<p>Hi' + (r.name ? ' ' + esc(r.name) : '') + '. How was the visit from ' + esc(c.company) + ' for your ' + esc(problem(r).toLowerCase()) + '?</p><p>It takes ten seconds and helps your neighbors pick the right pro.</p>' + btn(statusUrl(r), 'Leave a quick review'))
  }),
  homeownerClosed: r => ({
    to: r.email,
    subject: 'Sorry, nobody could take your request',
    html: wrap('<p>Hi' + (r.name ? ' ' + esc(r.name) : '') + '. We\'re sorry: no licensed pro near ' + esc(r.zip) + ' was able to take your ' + esc(problem(r).toLowerCase()) + ' request in time, so it has closed.</p><p>If you still need help, you can send it again in a minute. We\'re adding pros in ' + esc(r.county) + ' County every week.</p>' + btn(C.SITE_URL + '/request?s=' + encodeURIComponent(r.service || '') + '&p=' + encodeURIComponent(r.problem) + '&zip=' + encodeURIComponent(r.zip), 'Send it again'))
  }),
  adminSummary: s => ({
    to: C.ADMIN_EMAIL,
    subject: 'Yesterday: ' + s.requests + ' request' + (s.requests === 1 ? '' : 's') + ', ' + s.matched + ' matched' + (s.todo ? ', ' + s.todo + ' need you' : ''),
    html: wrap(rows([['Requests', s.requests], ['Matched', s.matched], ['No one to alert', s.gaps], ['No-shows or switches', s.noshows], ['Reviews', s.reviews], ['Applications waiting', s.pending], ['Review reminders sent', s.reminders], ['Closed with no match (homeowner told)', s.closed], ['Old photos deleted', s.photos]].map(x => [x[0], String(x[1])])) + btn(C.SITE_URL + '/admin', 'Open the admin page'))
  }),
  // Homeowner fixed their phone or email after choosing.
  contactUpdated: (c, r) => proMsg(c, {
    subject: 'Updated contact info: ' + r.name,
    html: wrap('<p>The customer for your ' + esc(problem(r).toLowerCase()) + ' job updated their contact details:</p>' + rows([['Customer', r.name], ['Phone', r.phone], ['Email', r.email], ['Address', r.address]]))
  }),
  // You invited a contractor from the admin page.
  invite: (email, name) => ({
    to: email,
    subject: 'Join ' + C.brand + ': emergency jobs near you' + (C.freeLaunch ? ', free during our launch' : ''),
    html: wrap('<p>Hi' + (name ? ' ' + esc(name) : '') + ',</p><p>Thanks for talking with us. ' + esc(C.brand) + ' sends licensed New Jersey pros emergency requests from homeowners nearby. You say yes with one tap, with your arrival time and visit fee, and the homeowner picks.</p>' +
      '<p>' + (C.freeLaunch ? 'It\'s free during our launch: no lead fees and no monthly fee.' : 'Your first ' + C.freeLeads + ' chosen leads are free, then $' + C.leadFee + ' only when a customer picks you.') + ' Signing up takes about a minute.</p>' + btn(C.SITE_URL + '/contractors?ref=invite&email=' + encodeURIComponent(email), 'Sign up'))
  }),
  contractorCanceled: (c, r, a, chosen) => proMsg(c, {
    subject: 'Canceled: ' + problem(r).toLowerCase() + ' in ' + r.zip,
    html: wrap('<p>The customer canceled this request' + (r.cancel_reason ? ' (' + esc(r.cancel_reason) + ')' : '') + '. ' + (chosen ? 'Please don\'t head over. If you already went out, mark that on the job page and we\'ll review the lead fee.' : 'No charge. Thanks for answering.') + '</p>' + (chosen ? btn(respondUrl(a), 'Open the job page') : ''))
  }),
  contractorNoShow: (c, r, a) => proMsg(c, {
    subject: 'Customer reported you didn\'t arrive: ' + r.zip,
    html: wrap('<p>The customer for this job told us you didn\'t arrive, so we sent the request to other pros. If that\'s not right, reply to this email and tell us what happened.</p>' + rows([['Problem', problem(r)], ['Where', r.county + ' County, ZIP ' + r.zip], ['You offered', a.arrival]]))
  }),
  homeownerEta: (r, c, a) => ({
    to: r.email,
    subject: c.company + ': ' + eta(a).toLowerCase(),
    html: wrap('<p>' + esc(c.company) + ' sent an update: <b>' + esc(eta(a)) + '</b>.</p>' + rows([['Their phone', c.business_phone]]) + btn(statusUrl(r), 'View your request'))
  }),
  // A lead fee or job that needs you to look at it.
  adminFlag: (title, r, c, a, note) => ({
    to: C.ADMIN_EMAIL,
    subject: title + ': ' + c.company + ', ' + r.zip,
    html: wrap('<p>' + esc(note) + '</p>' + rows([['Contractor', c.company], ['Their phone', c.business_phone], ['Customer', r.name], ['Customer phone', r.phone], ['Job', problem(r) + ', ' + r.county + ' ' + r.zip], ['Lead fee', a ? '$' + (a.lead_fee || 0) : '']]) + btn(C.SITE_URL + '/admin', 'Open the admin page'))
  }),
  // "Email me my link": every request in the last 30 days and the pro settings link, in one email.
  links: (email, requests, c) => ({
    to: email,
    subject: 'Your ' + C.brand + ' links',
    html: wrap('<p>Here are the links for ' + esc(email) + '. Each one is private, so don\'t share them.</p>' +
      requests.map(r => '<p><b>' + esc(problem(r)) + '</b>, ' + esc(r.county) + ' County, ' + new Date(r.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) + '<br><a href="' + statusUrl(r) + '" style="color:#4A2FE0">Open this request</a></p>').join('') +
      (c ? '<p><b>' + esc(c.company) + '</b>: your contractor page, with your jobs and settings.</p>' + btn(manageUrl(c), 'Open your contractor page') : '') +
      '<p style="font-size:14px;color:#5B5E6A">Didn\'t ask for this? You can ignore it.</p>')
  }),
  adminNewRequest: (r, matches) => ({
    to: C.ADMIN_EMAIL,
    subject: (matches.length ? '' : 'COVERAGE GAP: ') + 'New request, ' + problem(r) + ', ' + r.county + ' ' + r.zip,
    html: wrap('<p>' + (matches.length ? 'Alerted ' + matches.length + ': ' + matches.map(c => esc(c.company)).join(', ') + '.' : '<b>No approved ' + esc(pro(r)) + ' covers this county at this hour.</b> Nobody was alerted.') + '</p>' +
      jobFacts(r) + rows([['Customer', r.name], ['Phone', r.phone], ['Email', r.email], ['Address', r.address], ['Came from', r.source || 'Direct or unknown']]) + btn(statusUrl(r), 'Customer\'s request page'))
  }),
  adminMatched: (r, c, a, fee) => ({
    to: C.ADMIN_EMAIL,
    subject: 'Matched: ' + c.company + ' for ' + r.zip + ' (lead fee $' + fee + ')',
    html: wrap(rows([['Contractor', c.company], ['Customer', r.name], ['Problem', problem(r)], ['Arrival', a.arrival], ['Visit fee', '$' + a.visit_fee], ['Lead fee owed', '$' + fee]]))
  }),
  contractorApproved: c => ({
    to: c.email,
    subject: 'You\'re approved: requests can start coming',
    html: wrap('<p>Good news, ' + esc(c.contact || c.company) + '. We checked your license and ' + esc(c.company) + ' is approved.</p>' +
      (c.visit_fee == null || !c.business_phone ? '<p>One thing left before requests can reach you: add your visit fee and business phone.</p>' + btn(manageUrl(c), 'Finish your setup') : '<p>Emergency requests in your counties will come to this email. Tap the link in an alert to say when you can get there.</p>' + btn(manageUrl(c), 'Your settings')) +
      '<p style="font-size:14px;color:#5B5E6A">' + (C.freeLaunch ? 'There are no lead fees during our launch. If that ever changes, we\'ll email you at least 30 days ahead.' : 'Your first ' + C.freeLeads + ' chosen leads are free. After that it is $' + C.leadFee + ', only when a customer picks you.') + '</p>')
  }),
  adminReview: (r, c) => ({
    to: C.ADMIN_EMAIL,
    subject: (r.showed_up === false ? 'NO-SHOW reported: ' : r.rating <= 2 ? 'Low rating: ' : 'New review: ') + c.company + ', ' + r.rating + ' of 5',
    html: wrap(rows([['Contractor', c.company], ['Rating', r.rating + ' of 5'], ['Showed up', r.showed_up === false ? 'No' : 'Yes'], ['Comment', r.review], ['Customer', r.name], ['Phone', r.phone], ['Job', problem(r) + ', ' + r.county + ' ' + r.zip]]) +
      (r.showed_up === false ? '<p>If the pro did not show, consider waiving the lead fee and pausing them on the admin page.</p>' : ''))
  }),
  adminSignup: c => ({
    to: C.ADMIN_EMAIL,
    subject: 'Contractor applied: ' + c.company,
    html: wrap('<p>Check the license with the state board for each trade listed (HVACR, master plumbers, or electrical contractors), then approve them on the admin page.</p>' + btn(C.SITE_URL + '/admin', 'Open the admin page') +
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
