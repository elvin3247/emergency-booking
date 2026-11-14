// End-to-end check of the booking logic against the in-memory store:  npm test
const assert = require('assert');
process.env.STORE = 'memory';
process.env.AUTO_APPROVE = '1';
process.env.SITE_URL = 'http://localhost:3999';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_KEY = 'test-admin-key';
// The fee checks below run with fees switched on; the free launch is checked at the end.
require('../lib/config').freeLaunch = false;
process.env.RATE_LIMITS = 'off'; // switched on below for the spam-limit checks
const server = require('../dev-server');
const mail = require('../lib/mail');
const store = require('../lib/store');
const base = 'http://localhost:3999';
const call = async (p, body) => { const r = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, data: await r.json() }; };
const linkTo = to => { const m = mail.outbox.filter(x => x.to === to && /respond\?t=/.test(x.html)).pop(); return m.html.match(/respond\?t=([\w-]+)/)[1]; };
const contractor = (n, counties) => ({ company: 'Test Co ' + n, contact: 'Pat', email: 'c' + n + '@example.com', mobile: '908-555-010' + n, business_phone: '908-555-020' + n, license: '19HC0000000' + n, counties, trades: ['hvac'], visit_fee: 80 + n, alert_hours: 'any', consent: true });
const request = extra => Object.assign({ problem: 'no-heat', zip: '07059', county: 'Somerset', timing: 'As soon as possible', system: 'Gas furnace', note: '', name: 'Sam Homeowner', phone: '908-555-0100', email: 'home@example.com', address: '12 Sample Lane', consent: true }, extra);

(async () => {
  await new Promise(r => server.listen(3999, r));
  try {
    // Validation
    assert.strictEqual((await call('/api/requests', request({ zip: '10001' }))).status, 400, 'non-NJ ZIP is rejected');
    assert.strictEqual((await call('/api/requests', request({ consent: false }))).status, 400, 'consent is required');
    assert.strictEqual((await call('/api/contractors', Object.assign(contractor(0, []), {}))).status, 400, 'counties are required');

    // Coverage gap: no contractors yet
    let r = await call('/api/requests', request());
    let s = (await call('/api/requests?token=' + r.data.token)).data;
    assert.strictEqual(s.alerted, 0); assert.deepStrictEqual(s.backup, []);
    assert.ok(mail.outbox.some(m => /COVERAGE GAP/.test(m.subject)), 'admin is told about the gap');

    // Four contractors in Somerset, one elsewhere
    for (let i = 1; i <= 4; i++) assert.strictEqual((await call('/api/contractors', contractor(i, ['Somerset', 'Morris']))).status, 200);
    await call('/api/contractors', contractor(5, ['Bergen']));
    assert.strictEqual((await call('/api/contractors', contractor(1, ['Somerset']))).status, 409, 'duplicate email is rejected');

    r = await call('/api/requests', request());
    const token = r.data.token;
    s = (await call('/api/requests?token=' + token)).data;
    assert.strictEqual(s.alerted, 4, 'only Somerset contractors are alerted'); assert.strictEqual(s.offers.length, 0);

    const t = [1, 2, 3, 4].map(i => linkTo('c' + i + '@example.com'));
    let v = (await call('/api/alerts?t=' + t[0])).data;
    assert.strictEqual(v.state, 'open'); assert.strictEqual(v.customer, undefined, 'customer details are hidden');
    assert.strictEqual((await call('/api/alerts', { t: t[0], action: 'accept', arrival: 'nope', visit_fee: 80 })).status, 400);
    for (const i of [0, 1, 2]) assert.strictEqual((await call('/api/alerts', { t: t[i], action: 'accept', arrival: 'Within 1 hour', visit_fee: 80 + i })).data.state, 'accepted');
    assert.strictEqual((await call('/api/alerts?t=' + t[3])).data.state, 'full', 'fourth contractor sees it is full');
    assert.strictEqual((await call('/api/alerts', { t: t[3], action: 'accept', arrival: 'Within 1 hour', visit_fee: 80 })).status, 409);
    assert.strictEqual(mail.outbox.filter(m => m.to === 'home@example.com' && /can come/.test(m.subject)).length, 1, 'homeowner emailed on first yes only');

    // A contractor withdraws, freeing a slot
    assert.strictEqual((await call('/api/alerts', { t: t[2], action: 'decline' })).data.state, 'declined');
    s = (await call('/api/requests?token=' + token)).data;
    assert.strictEqual(s.offers.length, 2); assert.ok(!JSON.stringify(s).includes('c1@example.com'), 'no contractor email leaks to the homeowner');

    // Homeowner chooses
    assert.strictEqual((await call('/api/choose', { token, offer_id: 'bogus' })).status, 409);
    assert.strictEqual((await call('/api/choose', { token, offer_id: s.offers[1].id })).status, 200);
    assert.strictEqual((await call('/api/choose', { token, offer_id: s.offers[0].id })).status, 409, 'cannot choose twice');
    s = (await call('/api/requests?token=' + token)).data;
    assert.strictEqual(s.state, 'matched'); assert.strictEqual(s.chosen.company, 'Test Co 2'); assert.strictEqual(s.chosen.phone, '908-555-0202');
    v = (await call('/api/alerts?t=' + t[1])).data;
    assert.strictEqual(v.state, 'chosen'); assert.strictEqual(v.customer.phone, '908-555-0100'); assert.strictEqual(v.lead_fee, 0, 'first lead is free'); 
    assert.strictEqual((await call('/api/alerts?t=' + t[0])).data.state, 'standby', 'other pro is on standby');
    assert.strictEqual((await call('/api/alerts?t=' + t[0])).data.customer, undefined);
    assert.ok(mail.outbox.some(m => m.to === 'c1@example.com' && /^Filled/.test(m.subject)));

    // Lead fee starts after the free leads run out
    const c2 = store._tables.contractors.find(c => c.email === 'c2@example.com');
    assert.strictEqual(c2.free_leads_left, 2); c2.free_leads_left = 0;
    r = await call('/api/requests', request());
    const t2 = linkTo('c2@example.com');
    await call('/api/alerts', { t: t2, action: 'accept', arrival: 'Tonight', visit_fee: 95 });
    s = (await call('/api/requests?token=' + r.data.token)).data;
    await call('/api/choose', { token: r.data.token, offer_id: s.offers[0].id });
    assert.strictEqual((await call('/api/alerts?t=' + t2)).data.lead_fee, 50, 'paid lead is $50');

    // No one answers within the window: backup list appears
    r = await call('/api/requests', request());
    store._tables.requests.find(x => x.token === r.data.token).created_at = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    s = (await call('/api/requests?token=' + r.data.token)).data;
    assert.strictEqual(s.state, 'open'); assert.strictEqual(s.backup.length, 4);
    store._tables.requests.find(x => x.token === r.data.token).created_at = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
    assert.strictEqual((await call('/api/requests?token=' + r.data.token)).data.state, 'closed');

    assert.strictEqual((await call('/api/requests?token=missing')).status, 404);

    // Home page coverage check
    const cov = (await call('/api/coverage')).data;
    assert.strictEqual(cov.counties.Somerset, 'now'); assert.strictEqual(cov.counties.Bergen, 'now'); assert.strictEqual(cov.counties.Ocean, 'none');
    assert.deepStrictEqual(cov.visit_fee, { min: 81, max: 85 });
    assert.strictEqual(cov.contractors, undefined);
    const som = (await call('/api/coverage?county=Somerset')).data;
    assert.strictEqual(som.contractors.length, 4); assert.deepStrictEqual(Object.keys(som.contractors[0]).sort(), ['company', 'id', 'license', 'trades'], 'county list shows id, name, license, and trades only');

    // Visitor source is saved with the request
    r = await call('/api/requests', request({ source: 'ref:agent-smith' }));
    assert.strictEqual(store._tables.requests.find(x => x.token === r.data.token).source, 'ref:agent-smith');
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /ref:agent-smith/.test(m.html)), 'admin email shows the source');
    // Two-step sign-up: no requests until setup is finished; pause and resume
    const signup = await call('/api/contractors', { company: 'Step Co', contact: 'Lee', email: 'step@example.com', mobile: '908-555-0177', license: '19HC00009999', counties: ['Somerset'], trades: ['hvac'], consent: true });
    assert.strictEqual(signup.status, 200); const mt = signup.data.token; assert.ok(mt);
    let pro = (await call('/api/pro?t=' + mt)).data;
    assert.strictEqual(pro.setup_complete, false);
    assert.ok(mail.outbox.some(m => m.to === 'step@example.com' && m.html.includes('/pro?t=' + mt) && /Finish your setup/.test(m.html)), 'confirmation email links to setup');
    const alertedNow = async () => { const x = await call('/api/requests', request()); return (await call('/api/requests?token=' + x.data.token)).data.alerted; };
    const base = await alertedNow();
    assert.strictEqual((await call('/api/pro', { t: mt, action: 'settings', visit_fee: '', business_phone: '908-555-0188' })).status, 400);
    pro = (await call('/api/pro', { t: mt, action: 'settings', visit_fee: 99, business_phone: '908-555-0188', alert_hours: 'any' })).data;
    assert.strictEqual(pro.setup_complete, true);
    assert.strictEqual(await alertedNow(), base + 1, 'alerted once setup is done');
    const al = mail.outbox.filter(m => m.to === 'step@example.com' && /respond\?t=/.test(m.html)).pop();
    assert.ok(al.html.includes('/pro?t=' + mt), 'alert email links to the pause page');
    const at = al.html.match(/respond\?t=([\w-]+)/)[1];
    assert.strictEqual((await call('/api/alerts?t=' + at)).data.manage, mt);
    assert.strictEqual((await call('/api/alerts', { t: at, action: 'accept', arrival: 'Within 1 hour', visit_fee: 99 })).data.state, 'accepted', 'one-tap accept');
    pro = (await call('/api/pro', { t: mt, action: 'pause', until: 'monday' })).data;
    assert.ok(new Date(pro.paused_until) > new Date());
    const nj = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).format(new Date(pro.paused_until));
    assert.ok(/^Mon,? 07$/.test(nj.trim()), 'pause ends Monday 7am NJ time, got ' + nj);
    assert.strictEqual(await alertedNow(), base, 'paused contractor is not alerted');
    assert.strictEqual((await call('/api/coverage?county=Somerset')).data.contractors.length, 5, 'paused contractor still listed on county page');
    pro = (await call('/api/pro', { t: mt, action: 'pause', until: 'resume' })).data;
    assert.strictEqual(pro.paused_until, null);
    assert.strictEqual(await alertedNow(), base + 1);
    assert.strictEqual((await call('/api/pro?t=nope')).status, 404);

    // More than heating and cooling: requests go only to the matching trade
    assert.strictEqual((await call('/api/contractors', Object.assign(contractor(7, ['Somerset']), { trades: [] }))).status, 400, 'a trade is required');
    await call('/api/contractors', Object.assign(contractor(8, ['Somerset']), { trades: ['plumbing'] }));
    await call('/api/contractors', Object.assign(contractor(9, ['Somerset']), { trades: ['hvac', 'plumbing'] }));
    const before = mail.outbox.length;
    r = await call('/api/requests', request({ service: 'water-heater', problem: 'no-hot-water' }));
    assert.strictEqual(r.status, 200);
    s = (await call('/api/requests?token=' + r.data.token)).data;
    assert.strictEqual(s.alerted, 2, 'only plumbers are alerted for a water heater'); assert.strictEqual(s.request.service, 'water-heater');
    const sent = mail.outbox.slice(before).filter(m => /respond\?t=/.test(m.html)).map(m => m.to).sort();
    assert.deepStrictEqual(sent, ['c8@example.com', 'c9@example.com']);
    assert.strictEqual(store._tables.requests.find(x => x.token === r.data.token).system, null, 'no HVAC system on a plumbing request');
    assert.strictEqual((await call('/api/requests', request({ service: 'plumbing', problem: 'no-heat' }))).status, 400, 'problem must belong to the service');
    assert.strictEqual((await call('/api/requests', request({ service: 'electrical', problem: 'breaker' }))).status, 400, 'services that are not switched on are refused');
    const cov2 = (await call('/api/coverage?county=Somerset&trade=plumbing')).data;
    assert.strictEqual(cov2.trades.plumbing.Somerset, 'now'); assert.strictEqual(cov2.trades.plumbing.Bergen, 'none'); assert.strictEqual(cov2.trades.electrical.Somerset, 'none');
    assert.strictEqual(cov2.contractors.length, 2, 'county list can be narrowed to one trade');
    pro = (await call('/api/pro', { t: mt, action: 'settings', visit_fee: 99, business_phone: '908-555-0188', trades: ['hvac', 'electrical'] })).data;
    assert.deepStrictEqual(pro.trades, ['hvac', 'electrical']);

    // Reviews: only after a match, once, and a rating shows after enough reviews
    const adm = async (body) => { const x = await fetch('http://localhost:3999/api/admin', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test-admin-key' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, data: await x.json() }; };
    const book = async () => {
      const x = await call('/api/requests', request({ service: 'plumbing', problem: 'clog' }));
      const at8 = mail.outbox.filter(m => m.to === 'c8@example.com' && /respond\?t=/.test(m.html)).pop().html.match(/respond\?t=([\w-]+)/)[1];
      await call('/api/alerts', { t: at8, action: 'accept', arrival: 'Within 1 hour', visit_fee: 88 });
      const st = (await call('/api/requests?token=' + x.data.token)).data;
      return { token: x.data.token, offer: st.offers.find(o => o.company === 'Test Co 8') };
    };
    let job = await book();
    assert.strictEqual(job.offer.rating, null, 'no rating shown before any reviews');
    assert.strictEqual((await call('/api/review', { token: job.token, rating: 5 })).status, 409, 'cannot review before choosing');
    for (let i = 0; i < 3; i++) {
      if (i) job = await book();
      await call('/api/choose', { token: job.token, offer_id: job.offer.id });
      assert.strictEqual((await call('/api/review', { token: job.token, rating: 9 })).status, 400);
      assert.strictEqual((await call('/api/review', { token: job.token, rating: i === 2 ? 2 : 5, showed_up: i !== 2, review: 'Note ' + i })).status, 200);
    }
    assert.strictEqual((await call('/api/review', { token: job.token, rating: 5 })).status, 409, 'one review per request');
    assert.strictEqual((await call('/api/requests?token=' + job.token)).data.reviewed, true);
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /^NO-SHOW reported/.test(m.subject)), 'admin hears about a no-show');
    job = await book();
    assert.deepStrictEqual(job.offer.rating, { avg: 4, count: 3 }, 'rating shows after three reviews');

    // Admin page: locked without the key, then approve, pause, and fees
    assert.strictEqual((await call('/api/admin')).status, 401);
    let a = (await adm()).data;
    assert.ok(a.contractors.length >= 8); assert.ok(a.requests.length > 5);
    const c8 = a.contractors.find(c => c.email === 'c8@example.com');
    assert.deepStrictEqual(c8.reviews, { count: 3, avg: 4 }); assert.strictEqual(c8.owed, 0, 'first three leads were free');
    assert.ok(a.requests.some(x => x.alerted === 0), 'coverage gaps are visible');
    assert.ok(a.requests.some(x => typeof x.first_yes_min === 'number'), 'time to first yes is measured');
    assert.ok(a.fees.length >= 1 && a.fees[0].lead_fee === 50);
    const fee = a.fees.find(f => !f.paid_at);
    assert.strictEqual(a.contractors.find(c => c.email === 'c2@example.com').owed, 50);
    await adm({ action: 'paid', id: fee.id });
    assert.strictEqual((await adm()).data.contractors.find(c => c.email === 'c2@example.com').owed, 0, 'marking paid clears what is owed');
    await adm({ action: 'status', id: c8.id, status: 'paused' });
    assert.strictEqual((await call('/api/coverage?county=Somerset&trade=plumbing')).data.contractors.length, 1, 'paused contractor drops off the site');
    const n = mail.outbox.length;
    await adm({ action: 'status', id: c8.id, status: 'approved' });
    assert.ok(mail.outbox.slice(n).some(m => m.to === 'c8@example.com' && /approved/.test(m.subject)), 'approval emails the contractor');
    assert.strictEqual((await adm({ action: 'status', id: 'nope', status: 'approved' })).status, 404);

    // Spam limit: the same person can't flood requests
    process.env.RATE_LIMITS = 'on';
    const flood = n2 => call('/api/requests', request({ email: 'flood@example.com', phone: '908-555-0999' }));
    for (let i = 10; i < 13; i++) assert.strictEqual((await flood(i)).status, 200);
    assert.strictEqual((await flood(13)).status, 429, 'fourth request in an hour from one email is refused');
    assert.strictEqual((await call('/api/requests', request({ email: 'other@example.com', phone: '(908) 555-0999' }))).status, 429, 'same phone under a new email is refused too');
    process.env.RATE_LIMITS = 'off';

    // ===== Cancel, no-show, photos, on-the-way, job results, dashboard, profiles, link recovery =====
    const T2 = store._tables;
    const approve = email => { T2.contractors.find(c => c.email === email).status = 'approved'; };
    for (const n of [20, 21, 22]) { await call('/api/contractors', Object.assign(contractor(n, ['Hunterdon']), { trades: ['plumbing'] })); approve('c' + n + '@example.com'); }
    const linkFor = (email, kind) => { const m = mail.outbox.filter(x => x.to === email && x.html.includes(kind + '?t=')).pop(); return m && m.html.match(new RegExp(kind + '\\?t=([\\w-]+)'))[1]; };
    const hReq = extra => request(Object.assign({ service: 'plumbing', problem: 'clog', county: 'Hunterdon', zip: '08822', email: 'hunt@example.com', phone: '908-555-0177' }, extra));
    let R = (await call('/api/requests', hReq())).data.token;
    const t20 = linkFor('c20@example.com', 'respond'), t21 = linkFor('c21@example.com', 'respond'), t22 = linkFor('c22@example.com', 'respond');
    assert.ok(t20 && t21 && t22, 'all three Hunterdon plumbers alerted');

    // Photos
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
    assert.strictEqual((await call('/api/requests', { token: R, action: 'photo', data: 'data:text/plain;base64,aGk=' })).status, 400, 'non-photos refused');
    for (let i = 1; i <= 3; i++) assert.strictEqual((await call('/api/requests', { token: R, action: 'photo', data: png })).data.photos, i);
    assert.strictEqual((await call('/api/requests', { token: R, action: 'photo', data: png })).status, 409, 'max 3 photos');
    assert.strictEqual((await call('/api/requests?token=' + R)).data.photos.length, 3, 'homeowner sees photos');
    assert.strictEqual((await call('/api/alerts?t=' + t22)).data.photos.length, 3, 'alerted pro sees photos');

    // Choose, then on-my-way updates
    await call('/api/alerts', { t: t20, action: 'accept', arrival: 'Within 1 hour', visit_fee: 90 });
    await call('/api/alerts', { t: t21, action: 'accept', arrival: '1 to 2 hours', visit_fee: 80 });
    let st = (await call('/api/requests?token=' + R)).data;
    assert.ok(st.offers[0].pro_id, 'offers carry a profile id');
    await call('/api/choose', { token: R, offer_id: st.offers.find(o => o.company === 'Test Co 20').id });
    assert.strictEqual((await call('/api/alerts', { t: t21, action: 'eta', status: 'on_way', minutes: 30 })).status, 409, 'only the chosen pro sends updates');
    assert.strictEqual((await call('/api/alerts', { t: t20, action: 'eta', status: 'on_way', minutes: 2 })).status, 400, 'minutes must make sense');
    await call('/api/alerts', { t: t20, action: 'eta', status: 'on_way', minutes: 30 });
    assert.ok(mail.outbox.some(m => m.to === 'hunt@example.com' && /on the way, about 30 minutes/.test(m.subject)), 'homeowner emailed on my way');
    await call('/api/alerts', { t: t20, action: 'eta', status: 'late', minutes: 45 });
    st = (await call('/api/requests?token=' + R)).data;
    assert.deepStrictEqual([st.chosen.eta.status, st.chosen.eta.min], ['late', 45], 'homeowner page shows running late');

    // No-show: credit the free lead, send it out again to everyone else
    const before20 = T2.contractors.find(c => c.email === 'c20@example.com').free_leads_left;
    const ns = (await call('/api/requests', { token: R, action: 'noshow' })).data;
    assert.strictEqual(ns.alerted, 2, 'sent out again to the other two plumbers');
    assert.strictEqual(T2.contractors.find(c => c.email === 'c20@example.com').free_leads_left, before20 + 1, 'free lead given back');
    assert.ok(mail.outbox.some(m => m.to === 'c21@example.com' && /^Still needed/.test(m.subject)));
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /^NO-SHOW reported/.test(m.subject)));
    st = (await call('/api/requests?token=' + R)).data;
    assert.strictEqual(st.state, 'open'); assert.strictEqual(st.reopened, true); assert.strictEqual(st.offers.length, 0, 'old offers cleared');
    assert.strictEqual((await call('/api/alerts?t=' + t20)).data.state, 'no_show');
    assert.strictEqual((await call('/api/alerts', { t: t20, action: 'accept', arrival: 'Within 1 hour', visit_fee: 90 })).status, 409, 'no-show pro cannot re-offer');
    assert.strictEqual((await call('/api/requests', { token: R, action: 'noshow' })).status, 409, 'cannot report a no-show with nobody chosen');

    // A paid lead, then "couldn't reach the customer" puts the fee up for review
    T2.contractors.find(c => c.email === 'c21@example.com').free_leads_left = 0;
    await call('/api/alerts', { t: t21, action: 'accept', arrival: 'Within 1 hour', visit_fee: 85 });
    st = (await call('/api/requests?token=' + R)).data;
    await call('/api/choose', { token: R, offer_id: st.offers[0].id });
    assert.strictEqual((await call('/api/alerts', { t: t21, action: 'result', result: 'nope' })).status, 400);
    const res = (await call('/api/alerts', { t: t21, action: 'result', result: 'no_contact' })).data;
    assert.strictEqual(res.job_result, 'no_contact'); assert.strictEqual(res.fee_review, true);
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /^Lead fee review/.test(m.subject)));
    assert.strictEqual((await call('/api/alerts', { t: t21, action: 'result', result: 'done' })).status, 409, 'closed out once');
    let adm2 = (await adm()).data;
    const rv = adm2.fees.find(f => f.fee_review);
    assert.ok(rv && rv.job_result === 'no_contact', 'admin sees the fee review');
    await adm({ action: 'keep', id: rv.id });
    assert.ok(!(await adm()).data.fees.find(f => f.id === rv.id).fee_review, 'keep clears the review');

    // Review asks about on-time
    await call('/api/review', { token: R, rating: 4, showed_up: true, on_time: false });
    assert.strictEqual(T2.requests.find(x => x.token === R).on_time, false);

    // Cancel an open request: pros who said yes are told, and nothing else can happen to it
    const R2 = (await call('/api/requests', hReq({ problem: 'toilet' }))).data.token;
    await call('/api/alerts', { t: linkFor('c22@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 70 });
    const t22b = linkFor('c22@example.com', 'respond');
    assert.strictEqual((await call('/api/requests', { token: R2, action: 'cancel', reason: 'I fixed it myself' })).status, 200);
    assert.strictEqual((await call('/api/requests?token=' + R2)).data.state, 'canceled');
    assert.ok(mail.outbox.some(m => m.to === 'c22@example.com' && /^Canceled/.test(m.subject)), 'pro who said yes is told');
    assert.strictEqual((await call('/api/alerts?t=' + t22b)).data.state, 'canceled');
    assert.strictEqual((await call('/api/choose', { token: R2, offer_id: 'x' })).status, 409);
    assert.strictEqual((await call('/api/requests', { token: R2, action: 'photo', data: png })).status, 409);

    // Cancel after choosing: free lead given back to the chosen pro
    const R3 = (await call('/api/requests', hReq({ problem: 'sump' }))).data.token;
    await call('/api/alerts', { t: linkFor('c22@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 70 });
    const t22c = linkFor('c22@example.com', 'respond');
    st = (await call('/api/requests?token=' + R3)).data;
    await call('/api/choose', { token: R3, offer_id: st.offers[0].id });
    const left22 = T2.contractors.find(c => c.email === 'c22@example.com').free_leads_left;
    await call('/api/requests', { token: R3, action: 'cancel', reason: 'I found someone else' });
    assert.strictEqual(T2.contractors.find(c => c.email === 'c22@example.com').free_leads_left, left22 + 1);
    assert.strictEqual((await call('/api/alerts?t=' + t22c)).data.state, 'chosen_canceled');

    // Contractor dashboard and profile
    const m21 = T2.contractors.find(c => c.email === 'c21@example.com').manage_token;
    let pv = (await call('/api/pro?t=' + m21)).data;
    assert.ok(pv.jobs.length >= 3 && pv.jobs.some(j => /^Won/.test(j.status)) && pv.jobs.some(j => j.status === 'Customer canceled'), 'jobs list with plain statuses');
    assert.ok(!JSON.stringify(pv.jobs).includes('hunt@example.com'), 'dashboard never shows customer details');
    assert.strictEqual((await call('/api/pro', { t: m21, action: 'profile', extra_emails: ['not-an-email'] })).status, 400);
    pv = (await call('/api/pro', { t: m21, action: 'profile', about: 'Family plumbers since 1998.', years_in_business: 26, website: 'test21.example.com', extra_emails: ['dispatch@example.com'] })).data;
    assert.strictEqual(pv.website, 'https://test21.example.com'); assert.deepStrictEqual(pv.extra_emails, ['dispatch@example.com']);
    await call('/api/requests', hReq({ problem: 'burst-pipe', email: 'hunt2@example.com', phone: '908-555-0178' }));
    assert.deepStrictEqual(mail.outbox.filter(m => m.to === 'c21@example.com').pop().cc, ['dispatch@example.com'], 'extra alert email copied');
    const prof = (await call('/api/company?id=' + pv.id)).data;
    assert.strictEqual(prof.about, 'Family plumbers since 1998.'); assert.strictEqual(prof.reviews.count, 1); assert.strictEqual(prof.reviews.avg, null, 'no average until enough reviews');
    assert.ok(!('email' in prof) && !('mobile' in prof) && !('manage_token' in prof), 'profile shows nothing private');
    assert.strictEqual((await call('/api/company?id=00000000-0000-0000-0000-000000000000')).status, 404);

    // Email me my link
    let n0 = mail.outbox.length;
    const lk = (await call('/api/links', { email: 'HUNT@example.com' })).data;
    assert.ok(/If that email/.test(lk.message));
    const linkMail = mail.outbox.slice(n0).find(m => m.to === 'hunt@example.com');
    assert.ok(linkMail && linkMail.html.includes('/status?t=' + R), 'request links resent');
    n0 = mail.outbox.length;
    assert.strictEqual((await call('/api/links', { email: 'nobody@example.com' })).data.message, lk.message, 'same answer for unknown emails');
    assert.strictEqual(mail.outbox.length, n0, 'no email for unknown address');
    await call('/api/links', { email: 'c21@example.com' });
    assert.ok(mail.outbox.pop().html.includes('/pro?t=' + m21), 'contractor page link resent');
    process.env.RATE_LIMITS = 'on';
    for (let i = 0; i < 3; i++) await call('/api/links', { email: 'hunt@example.com' });
    n0 = mail.outbox.length; await call('/api/links', { email: 'hunt@example.com' });
    assert.strictEqual(mail.outbox.length, n0, 'link emails limited per hour');
    process.env.RATE_LIMITS = 'off';

    // ===== Alert first, details second; book automatically; typical answer times =====
    for (const n of [30, 31]) { await call('/api/contractors', Object.assign(contractor(n, ['Sussex']), { trades: ['plumbing'] })); approve('c' + n + '@example.com'); }
    const sReq = extra => hReq(Object.assign({ county: 'Sussex', zip: '07860', email: 'sx@example.com', phone: '973-555-0101', name: '', address: '' }, extra));
    let Q = (await call('/api/requests', sReq())).data.token;
    let qs = (await call('/api/requests?token=' + Q)).data;
    assert.strictEqual(qs.needs_details, true, 'request goes out without name and address');
    assert.ok(linkFor('c30@example.com', 'respond'), 'pros alerted right away');
    assert.ok(/One more thing/.test(mail.outbox.filter(m => m.to === 'sx@example.com').pop().html), 'confirmation email asks for the details');
    await call('/api/alerts', { t: linkFor('c30@example.com', 'respond'), action: 'accept', arrival: '1 to 2 hours', visit_fee: 90 });
    qs = (await call('/api/requests?token=' + Q)).data;
    assert.strictEqual((await call('/api/choose', { token: Q, offer_id: qs.offers[0].id })).status, 409, 'cannot choose before giving name and address');
    assert.strictEqual((await call('/api/requests', { token: Q, action: 'details', name: 'Pat', address: '' })).status, 400);
    assert.strictEqual((await call('/api/choose', { token: Q, offer_id: qs.offers[0].id, name: 'Pat Sussex', address: '9 Lake Rd' })).status, 200, 'details can come with the choice');
    assert.strictEqual(T2.requests.find(x => x.token === Q).address, '9 Lake Rd');

    // Book automatically: only a "Within 1 hour" yes at or under the fee limit counts
    Q = (await call('/api/requests', sReq({ problem: 'toilet', name: 'Pat Sussex', address: '9 Lake Rd', auto_pick: true, auto_max_fee: 150 }))).data.token;
    await call('/api/alerts', { t: linkFor('c30@example.com', 'respond'), action: 'accept', arrival: '1 to 2 hours', visit_fee: 90 });
    assert.strictEqual((await call('/api/requests?token=' + Q)).data.state, 'open', 'slower arrival does not auto-book');
    let ac = (await call('/api/alerts', { t: linkFor('c31@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 120 })).data;
    assert.strictEqual(ac.state, 'chosen', 'first qualifying yes is booked on the spot');
    assert.ok(ac.customer && ac.customer.address === '9 Lake Rd', 'pro gets the details immediately');
    assert.ok(mail.outbox.some(m => m.to === 'sx@example.com' && /^Booked for you: Test Co 31/.test(m.subject)));
    assert.ok(mail.outbox.some(m => m.to === 'c30@example.com' && /^Filled/.test(m.subject)), 'the other pro is told');
    Q = (await call('/api/requests', sReq({ problem: 'sump', name: 'Pat Sussex', address: '9 Lake Rd', auto_pick: true, auto_max_fee: 100 }))).data.token;
    await call('/api/alerts', { t: linkFor('c31@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 140 });
    assert.strictEqual((await call('/api/requests?token=' + Q)).data.state, 'open', 'fee over the limit does not auto-book');
    // Auto-book waits for the name and address, then books the moment they arrive
    Q = (await call('/api/requests', sReq({ problem: 'burst-pipe', auto_pick: true }))).data.token;
    await call('/api/alerts', { t: linkFor('c30@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 300 });
    assert.strictEqual((await call('/api/requests?token=' + Q)).data.state, 'open', 'no auto-book without an address');
    assert.strictEqual((await call('/api/requests', { token: Q, action: 'details', name: 'Pat Sussex', address: '9 Lake Rd' })).data.matched, true, 'any fee when no limit set');
    assert.strictEqual((await call('/api/requests?token=' + Q)).data.state, 'matched');

    // Typical answer time: only shown with enough history (5+ requests with a yes in that county and trade)
    const speedLib = require('../lib/speed'); speedLib.reset();
    assert.ok(!((await call('/api/coverage')).data.speed.plumbing || {}).Sussex, 'four Sussex requests is not enough history');
    const Q5 = (await call('/api/requests', sReq({ problem: 'clog', email: 'sx5@example.com', phone: '973-555-0105', name: 'Lee', address: '1 Main St' }))).data.token;
    await call('/api/alerts', { t: linkFor('c30@example.com', 'respond'), action: 'accept', arrival: '2 to 4 hours', visit_fee: 90 });
    speedLib.reset();
    assert.ok((await call('/api/coverage')).data.speed.plumbing.Sussex >= 1, 'five is enough');
    const tq = (await call('/api/requests?token=' + Q5)).data.typical;
    assert.ok(tq && tq.where === 'county' && tq.min >= 1, 'request page gets the typical time');

    // Free launch: nothing charged, and each pro's free leads are kept for when fees start
    const Cfg = require('../lib/config'); Cfg.freeLaunch = true;
    await call('/api/contractors', Object.assign(contractor(40, ['Warren']), { trades: ['plumbing'] })); approve('c40@example.com');
    const W = (await call('/api/requests', hReq({ county: 'Warren', zip: '07882', email: 'wf@example.com', phone: '908-555-0400', problem: 'clog' }))).data.token;
    assert.ok(/no lead fees during our launch/i.test(mail.outbox.filter(m => m.to === 'c40@example.com').pop().html), 'alert says it is free');
    await call('/api/alerts', { t: linkFor('c40@example.com', 'respond'), action: 'accept', arrival: '1 to 2 hours', visit_fee: 90 });
    const wo = (await call('/api/requests?token=' + W)).data.offers[0];
    await call('/api/choose', { token: W, offer_id: wo.id });
    const c40 = T2.contractors.find(c => c.email === 'c40@example.com');
    assert.strictEqual(T2.alerts.find(a => a.id === wo.id).lead_fee, 0, 'no fee charged');
    assert.strictEqual(c40.free_leads_left, 3, 'free leads saved for later');
    assert.ok(/No lead fee: we're free/.test(mail.outbox.find(m => m.to === 'c40@example.com' && /^You were chosen/.test(m.subject)).html));

    // ===== Widen the search, standby pros, confirmation, contact fixes, daily job, funnel, admin tools =====
    const back = (row, field, min) => { row[field] = new Date(Date.now() - min * 60000).toISOString(); };
    const reqRow = tk => T2.requests.find(x => x.token === tk);
    // Hunterdon plumbing: c20-c22 alerted. Nobody answers for 11 minutes.
    let H = (await call('/api/requests', hReq({ problem: 'toilet', email: 'wide@example.com', phone: '908-555-0500', name: 'Wes', address: '5 Elm St' }))).data.token;
    back(reqRow(H), 'created_at', 11);
    let n1 = mail.outbox.length;
    let hs = (await call('/api/requests?token=' + H)).data;
    assert.ok(hs.widened_to.includes('Warren'), 'search widened to neighboring counties');
    const wsent = mail.outbox.slice(n1);
    assert.ok(wsent.some(m => m.to === 'c40@example.com' && /^New toilet problem in /.test(m.subject) && /just outside your counties/.test(m.html)), 'Warren plumber alerted, with the town in the subject');
    assert.ok(wsent.some(m => m.to === 'c21@example.com' && /^Still open, no answers yet/.test(m.subject)), 'first pros nudged');
    assert.ok(/pause=night/.test(wsent.find(m => m.to === 'c40@example.com').html), 'alert has a one-tap pause link');
    n1 = mail.outbox.length; await call('/api/requests?token=' + H);
    assert.strictEqual(mail.outbox.length, n1, 'widening happens once');

    // c40 and c20 say yes; homeowner picks c40, who never confirms
    await call('/api/alerts', { t: linkFor('c40@example.com', 'respond'), action: 'accept', arrival: 'Within 1 hour', visit_fee: 95 });
    const h20 = linkFor('c20@example.com', 'respond');
    await call('/api/alerts', { t: h20, action: 'accept', arrival: '1 to 2 hours', visit_fee: 85 });
    hs = (await call('/api/requests?token=' + H)).data;
    await call('/api/choose', { token: H, offer_id: hs.offers.find(o => o.company === 'Test Co 40').id });
    assert.strictEqual((await call('/api/alerts?t=' + h20)).data.state, 'standby', 'runner-up on standby');
    hs = (await call('/api/requests?token=' + H)).data;
    assert.strictEqual(hs.standby.length, 1); assert.strictEqual(hs.unconfirmed, false, 'not flagged before 10 minutes');
    back(reqRow(H), 'matched_at', 11);
    n1 = mail.outbox.length;
    hs = (await call('/api/requests?token=' + H)).data;
    assert.strictEqual(hs.unconfirmed, true, 'homeowner offered another pro after 10 minutes');
    assert.ok(mail.outbox.slice(n1).some(m => m.to === 'c40@example.com' && /^Please confirm/.test(m.subject)), 'pro asked to confirm');
    assert.ok(mail.outbox.slice(n1).some(m => m.to === 'wide@example.com' && /^Haven't heard from Test Co 40/.test(m.subject) && /1 other pro is still available/.test(m.html)), 'homeowner told they can switch');
    // Switch to the standby pro in one step
    assert.strictEqual((await call('/api/requests', { token: H, action: 'noshow', offer_id: 'nope' })).status, 409);
    assert.strictEqual((await call('/api/requests', { token: H, action: 'noshow', offer_id: hs.standby[0].id })).data.switched, true);
    hs = (await call('/api/requests?token=' + H)).data;
    assert.strictEqual(hs.chosen.company, 'Test Co 20', 'switched to the standby pro');
    assert.strictEqual((await call('/api/alerts?t=' + linkFor('c40@example.com', 'respond'))).data.state, 'no_show');
    assert.ok(mail.outbox.some(m => m.to === 'c40@example.com' && /^Customer switched pros/.test(m.subject)));
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /^Switched pros/.test(m.subject)));
    // The new pro confirms; no more nudges
    assert.strictEqual((await call('/api/alerts', { t: linkFor('c21@example.com', 'respond'), action: 'confirm' })).status, 409, 'only the chosen pro confirms');
    await call('/api/alerts', { t: h20, action: 'confirm' });
    back(reqRow(H), 'matched_at', 31);
    hs = (await call('/api/requests?token=' + H)).data;
    assert.strictEqual(hs.confirmed, true); assert.strictEqual(hs.unconfirmed, false); assert.strictEqual(hs.standby.length, 0, 'standby ends after 30 minutes');

    // Fix a phone typo: the chosen pro gets the correction
    assert.strictEqual((await call('/api/requests', { token: H, action: 'contact', phone: '123', email: 'wide@example.com' })).status, 400);
    await call('/api/requests', { token: H, action: 'contact', phone: '908-555-0599', email: 'wide@example.com' });
    assert.ok(mail.outbox.some(m => m.to === 'c20@example.com' && /^Updated contact info/.test(m.subject) && /908-555-0599/.test(m.html)));

    // Daily job: review reminder, closed-request email, old photos deleted, morning summary. Runs safely twice.
    back(reqRow(H), 'matched_at', 7 * 60);
    const O = (await call('/api/requests', hReq({ county: 'Salem', zip: '08079', problem: 'clog', email: 'old@example.com', phone: '856-555-0101' }))).data.token;
    back(reqRow(O), 'created_at', 13 * 60);
    back(reqRow(R), 'created_at', 91 * 24 * 60);
    const photoCount = reqRow(R).photos.length;
    assert.strictEqual((await call('/api/admin?job=daily')).status, 401, 'daily job is locked');
    process.env.CRON_SECRET = 'cron-test';
    const viaCron = await fetch('http://localhost:3999/api/admin?job=daily', { headers: { authorization: 'Bearer cron-test' } });
    assert.strictEqual(viaCron.status, 200, "Vercel's schedule can run it");
    const d1 = await viaCron.json();
    assert.ok(d1.reminders >= 1 && d1.closed >= 1 && d1.photos === photoCount, JSON.stringify(d1));
    assert.ok(mail.outbox.some(m => m.to === 'wide@example.com' && /^How did Test Co 20 do/.test(m.subject)), 'review reminder');
    assert.ok(mail.outbox.some(m => m.to === 'old@example.com' && /^Sorry, nobody could take your request/.test(m.subject) && /request\?s=plumbing&amp;p=clog|request\?s=plumbing&p=clog/.test(m.html)), 'closed email offers to send again');
    assert.deepStrictEqual(reqRow(R).photos, []); assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /^Yesterday:/.test(m.subject)), 'morning summary');
    const d2 = (await adm({ action: 'daily' })).data;
    assert.strictEqual(d2.reminders + d2.closed + d2.photos, 0, 'nothing sent twice');

    // Funnel events
    await call('/api/track', { name: 'form_opened' }); await call('/api/track', { name: 'form_opened' }); await call('/api/track', { name: 'not-a-step' });
    const fa2 = (await adm()).data.funnel;
    assert.ok(fa2.form_opened >= 1 && !fa2['not-a-step'], 'funnel counts allowed steps by device');

    // Admin tools
    const c21id = T2.contractors.find(c => c.email === 'c21@example.com').id;
    const rcount = (await call('/api/company?id=' + c21id)).data.reviews.count;
    await adm({ action: 'hide_review', id: reqRow(R).id });
    assert.strictEqual((await call('/api/company?id=' + c21id)).data.reviews.count, rcount - 1, 'hidden review drops off the profile');
    await adm({ action: 'hide_review', id: reqRow(R).id, hidden: false });
    assert.strictEqual((await adm({ action: 'edit_contractor', id: c21id, company: 'Test Co 21', license: 'NEW-LIC-1', trades: [], counties: ['Hunterdon'] })).status, 400);
    await adm({ action: 'edit_contractor', id: c21id, company: 'Test Co 21 LLC', license: 'NEW-LIC-1', business_phone: '908-555-0221', trades: ['plumbing', 'hvac'], counties: ['Hunterdon', 'Warren'] });
    const e21 = T2.contractors.find(c => c.id === c21id);
    assert.deepStrictEqual([e21.company, e21.license, e21.trades, e21.counties], ['Test Co 21 LLC', 'NEW-LIC-1', ['hvac', 'plumbing'], ['Hunterdon', 'Warren']]);
    await adm({ action: 'invite', email: 'newpro@example.com', name: 'Jo' });
    assert.ok(/contractors\?ref=invite&(amp;)?inv=[\w-]+/.test(mail.outbox.filter(m => m.to === 'newpro@example.com').pop().html), 'invite link carries the private code that fills in their email');
    assert.strictEqual((await adm({ action: 'invite', email: 'c21@example.com' })).status, 400, 'no invite to someone already signed up');

    // Text alerts: only pros who opted in, and the email always goes too
    const sms = require('../lib/sms'), E = require('../lib/emails');
    const fakeReq = { service: 'heating', problem: 'no-heat', zip: '07059', county: 'Somerset', timing: 'As soon as possible', photos: [] };
    const off = E.contractorAlert({ id: 'x', email: 'x@example.com', mobile: '9085550100', sms_on: false }, fakeReq, { token: 'tok' });
    const on = E.contractorAlert({ id: 'x', email: 'x@example.com', mobile: '9085550100', sms_on: true }, fakeReq, { token: 'tok' });
    assert.ok(!off.text && !off.textTo, 'no text without opt-in');
    assert.ok(on.textTo && /^YourBrand: New job: no heat, Warren, Somerset Co\. \(07059\).*respond\?t=tok.*STOP/.test(on.text) && on.to === 'x@example.com', 'opted-in pro gets the text and the email');
    const sentTexts = sms.outbox.length;
    await mail.send(on);
    assert.strictEqual(sms.outbox.length, sentTexts + 1, 'text goes out alongside the email');
    assert.strictEqual(sms.e164('(908) 555-0100'), '+19085550100'); assert.strictEqual(sms.e164('555-0100'), null);
    const smsSignup = await call('/api/contractors', Object.assign(contractor(77, ['Warren']), { sms: true }));
    const c77 = T2.contractors.find(c => c.email === 'c77@example.com');
    assert.ok(smsSignup.status === 200 && c77.sms_on && /Reply STOP/.test(c77.sms_consent_text), 'sign-up stores the text opt-in and its wording');
    assert.strictEqual((await call('/api/pro', { t: c77.manage_token, action: 'texts', on: true, mobile: '9085550177' })).status, 400, 'turning texts on needs the box checked');
    await call('/api/pro', { t: c77.manage_token, action: 'texts', on: false });
    assert.ok(!T2.contractors.find(c => c.email === 'c77@example.com').sms_on, 'pro can turn texts off');

    // Recruiting list: duplicates skipped, bulk invites need the mailing address, unsubscribes stick
    const imp = (await adm({ action: 'prospects_import', list_name: 'Test list', rows: [{ company: 'Prospect A', email: 'pa@example.com', trades: ['hvac'], counties: ['Warren'] }, { company: 'Prospect A again', email: 'PA@example.com' }, { company: 'No Way To Reach' }, { company: 'Signed Up', email: 'c21@example.com' }] })).data;
    assert.deepStrictEqual([imp.added, imp.skipped.duplicate, imp.skipped.no_contact, imp.skipped.signed_up], [1, 1, 1, 1], 'import skips duplicates, no contact, and pros already signed up');
    const pa = T2.prospects.find(p => p.email === 'pa@example.com');
    const C2 = require('../lib/config'), addr = C2.mailingAddress;
    C2.mailingAddress = '';
    assert.strictEqual((await adm({ action: 'prospects_invite', ids: [pa.id] })).status, 400, 'bulk invites need a mailing address');
    C2.mailingAddress = 'PO Box 9, Warren, NJ 07059';
    assert.strictEqual((await adm({ action: 'prospects_invite', ids: [pa.id] })).data.sent, 1);
    const paMail = mail.outbox.filter(m => m.to === 'pa@example.com').pop();
    assert.ok(/PO Box 9, Warren/.test(paMail.html) && /unsubscribe\?inv=/.test(paMail.html) && paMail.headers['List-Unsubscribe'], 'invite has the address and a no-thanks link');
    assert.strictEqual((await adm({ action: 'prospects_invite', ids: [pa.id] })).data.sent, 0, 'no second invite within 7 days');
    await call('/api/contractors', { action: 'unsubscribe', inv: pa.token });
    T2.prospects.find(p => p.email === 'pa@example.com').invited_at = new Date(Date.now() - 30 * 864e5).toISOString();
    assert.strictEqual((await adm({ action: 'prospects_invite', ids: [pa.id] })).data.sent, 0, 'never invited again after "no thanks"');
    C2.mailingAddress = addr;
    const recView = (await (await fetch('http://localhost:3999/api/admin?view=recruit', { headers: { 'x-admin-key': 'test-admin-key' } })).json());
    assert.ok(recView.supply.Warren && recView.prospects.find(p => p.email === 'pa@example.com').stage === 'unsubscribed', 'recruiting view shows supply and stages');

    // Launch checklist runs in the local preview
    const setup = (await (await fetch('http://localhost:3999/api/admin?view=setup', { headers: { 'x-admin-key': 'test-admin-key' } })).json());
    assert.ok(setup.checks.length > 8 && setup.checks.every(c => ['ok', 'warn', 'bad'].includes(c.state)), 'launch checklist returns every check');
    const Sp = (await call('/api/requests', hReq({ problem: 'clog', email: 'spam@example.com', phone: '908-555-0666' }))).data.token;
    await adm({ action: 'cancel_request', id: reqRow(Sp).id });
    assert.strictEqual((await call('/api/requests?token=' + Sp)).data.state, 'canceled', 'admin can remove a spam request');

    console.log('All booking flow checks passed.');
  } finally { server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
