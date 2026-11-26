// When something breaks on the live site, save it and email you, so you hear about it before your customers do.
// Server errors: saved, and emailed at most once an hour for the same problem. Browser errors (a script failing on
// someone's phone): saved and shown on the admin page, never emailed, since browser add-ons cause plenty of noise.
// Nothing here may throw: a failing error reporter must never make the original problem worse.
const C = require('./config');

const HOUR = 36e5;
const lastSent = {}; // fallback throttle for when the database itself is what's down
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

async function report(err, where) {
  try {
    const store = require('./store'), mail = require('./mail'), E = require('./emails');
    const route = clean(where, 80) || 'unknown', message = clean(err && err.message || err, 300) || 'Unknown error';
    const row = { kind: 'server', route, message, key: route + ': ' + message.slice(0, 120), stack: String(err && err.stack || '').slice(0, 2000) };
    let before = null;
    try { before = await store.countErrors(new Date(Date.now() - HOUR).toISOString(), row.key); await store.insertError(row); } catch (e) { console.error('Could not save the error: ' + e.message); }
    const quiet = before == null ? Date.now() - (lastSent[row.key] || 0) < HOUR : before > 0;
    if (quiet || !C.ADMIN_EMAIL) return;
    lastSent[row.key] = Date.now();
    await mail.send(E.adminError(row));
  } catch (e) { console.error('Error report failed: ' + (e && e.message)); }
}

// A script error from a visitor's browser. Capped so a broken page or a bot can't flood the table.
async function browser(body, device) {
  try {
    const store = require('./store');
    const message = clean(body.msg, 300), page = clean(body.page, 80).split('?')[0];
    if (!message || /^Script error\.?$/i.test(message) || !/^\//.test(page)) return;
    const since = new Date(Date.now() - HOUR).toISOString(), key = 'browser ' + page + ': ' + message.slice(0, 120);
    if (await store.countErrors(since, null, 'browser') >= 40 || await store.countErrors(since, key) >= 5) return;
    await store.insertError({ kind: 'browser', route: page, message, key, stack: clean(body.at, 200), device });
  } catch (e) { console.error('Could not save a browser error: ' + (e && e.message)); }
}

// For the admin page: the last 7 days, grouped so one repeating problem is one line.
async function recent() {
  const store = require('./store');
  const rows = await store.errorsSince(new Date(Date.now() - 7 * 24 * HOUR).toISOString());
  const by = {};
  rows.forEach(r => {
    const g = by[r.key] || (by[r.key] = { kind: r.kind, route: r.route, message: r.message, count: 0, last_at: r.created_at, first_at: r.created_at, day: 0 });
    g.count++; if (r.created_at > g.last_at) g.last_at = r.created_at; if (r.created_at < g.first_at) g.first_at = r.created_at;
    if (Date.now() - new Date(r.created_at).getTime() < 24 * HOUR) g.day++;
  });
  return Object.values(by).sort((a, b) => (a.last_at < b.last_at ? 1 : -1)).slice(0, 40);
}

module.exports = { report, browser, recent };
