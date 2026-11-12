// End-to-end check of the booking logic against the in-memory store:  npm test
const assert = require('assert');
process.env.SITE_URL = 'http://localhost:3999';
process.env.ADMIN_EMAIL = 'admin@example.com';
const server = require('../dev-server');
const mail = require('../lib/mail');
const store = require('../lib/store');
const base = 'http://localhost:3999';
const call = async (p, body) => { const r = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, data: await r.json() }; };
const linkTo = to => { const m = mail.outbox.filter(x => x.to === to && /respond\?t=/.test(x.html)).pop(); return m.html.match(/respond\?t=([\w-]+)/)[1]; };
const contractor = (n, counties) => ({ company: 'Test Co ' + n, contact: 'Pat', email: 'c' + n + '@example.com', mobile: '908-555-010' + n, business_phone: '908-555-020' + n, license: '19HC0000000' + n, counties, visit_fee: 80 + n, alert_hours: 'any', consent: true });
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
    assert.strictEqual((await call('/api/alerts?t=' + t[0])).data.state, 'filled');
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
    assert.strictEqual(som.contractors.length, 4); assert.deepStrictEqual(Object.keys(som.contractors[0]).sort(), ['company', 'license'], 'county list shows name and license only');

    // Visitor source is saved with the request
    r = await call('/api/requests', request({ source: 'ref:agent-smith' }));
    assert.strictEqual(store._tables.requests.find(x => x.token === r.data.token).source, 'ref:agent-smith');
    assert.ok(mail.outbox.some(m => m.to === 'admin@example.com' && /ref:agent-smith/.test(m.html)), 'admin email shows the source');
    // Two-step sign-up: no requests until setup is finished; pause and resume
    const signup = await call('/api/contractors', { company: 'Step Co', contact: 'Lee', email: 'step@example.com', mobile: '908-555-0177', license: '19HC00009999', counties: ['Somerset'], consent: true });
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

    console.log('All booking flow checks passed.');
  } finally { server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
