// Spam limits. Each refused attempt is logged (as a 'blocked_*' event) so the admin page can show who is hitting the limits.
// `who` is what the person typed (email, phone), kept so you can recognize a pattern or unblock a real customer by calling them.
const store = require('./store');
const { bad } = require('./http');

const on = () => process.env.RATE_LIMITS !== 'off';
async function block(kind, device, who, message) {
  await store.insertEvent({ name: 'blocked_' + kind, device: device || null, source: String(who || '').slice(0, 120) || null }).catch(e => console.error('Could not log a blocked attempt: ' + e.message));
  throw bad(message, 429);
}

// For the admin page: blocked attempts in the last 7 days, grouped by who and what.
async function recent() {
  const DAY = 864e5, rows = await store.eventsNamed(new Date(Date.now() - 7 * DAY).toISOString(), ['blocked_request', 'blocked_signup', 'blocked_link']);
  const by = {};
  rows.forEach(r => {
    const k = r.name + '|' + (r.source || r.device || '');
    const g = by[k] || (by[k] = { kind: r.name.replace('blocked_', ''), who: r.source || 'Unknown (connection ' + String(r.device || '').slice(0, 6) + ')', count: 0, day: 0, last_at: r.created_at });
    g.count++; if (r.created_at > g.last_at) g.last_at = r.created_at;
    if (Date.now() - new Date(r.created_at).getTime() < DAY) g.day++;
  });
  return Object.values(by).sort((a, b) => (a.last_at < b.last_at ? 1 : -1)).slice(0, 40);
}

module.exports = { on, block, recent };
