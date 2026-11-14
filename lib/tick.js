// Timed steps for a request. There's no every-minute timer on Vercel's free plan, so these run whenever
// someone looks at the request (the homeowner's page refreshes every few seconds), on any coverage lookup,
// and once a day. Each step runs once: claimRequest stamps it before anything is sent.
const C = require('./config');
const store = require('./store');
const mail = require('./mail');
const E = require('./emails');
const { canAlert, tradeOf, openedAt, token } = require('./http');

async function tick(r, alerts) {
  const now = Date.now(), msgs = [];
  let changed = false;

  // No yes after a few minutes: nudge the pros who haven't answered, and alert pros in neighboring counties.
  const age = now - openedAt(r);
  const anyYes = alerts.some(a => a.response === 'accepted' && a.outcome !== 'no_show');
  if (r.status === 'open' && !r.widened_at && !anyYes && age >= C.widenMin * 60000 && age <= C.OPEN_MS && await store.claimRequest(r.id, 'widened_at')) {
    const trade = tradeOf(r.service) || 'hvac';
    const already = new Set(alerts.map(a => a.contractor_id)), pool = {};
    for (const county of C.neighbors[r.county] || []) {
      (await store.contractorsForCounty(county, trade)).filter(canAlert).forEach(c => { if (!already.has(c.id)) pool[c.id] = c; });
    }
    const added = await store.insertAlerts(Object.keys(pool).map(id => ({ request_id: r.id, contractor_id: id, token: token(), response: 'none' })));
    added.forEach(a => msgs.push(E.contractorAlert(pool[a.contractor_id], r, a, false, true)));
    const waiting = alerts.filter(a => a.response === 'none' && !a.outcome);
    const cs = Object.fromEntries((await store.contractorsByIds(waiting.map(a => a.contractor_id))).map(c => [c.id, c]));
    waiting.filter(a => cs[a.contractor_id] && canAlert(cs[a.contractor_id])).forEach(a => msgs.push(E.contractorReminder(cs[a.contractor_id], r, a)));
    changed = true;
  }

  // Chosen pro hasn't confirmed or sent an update: remind them, and tell the homeowner they can pick another.
  if (r.status === 'matched' && r.chosen_alert_id && !r.confirm_nudged_at) {
    const a = alerts.find(x => x.id === r.chosen_alert_id);
    if (a && !a.confirmed_at && !a.eta_status && now - new Date(r.matched_at).getTime() >= C.confirmMin * 60000 && await store.claimRequest(r.id, 'confirm_nudged_at')) {
      const c = (await store.contractorsByIds([a.contractor_id]))[0];
      const standby = alerts.filter(x => x.outcome === 'standby').length;
      msgs.push(E.contractorConfirmNudge(c, r, a), E.homeownerUnconfirmed(r, c, standby));
      changed = true;
    }
  }
  if (msgs.length) await mail.sendAll(msgs);
  return changed;
}

// Run the timed steps for every recent request. Throttled so busy pages don't repeat it constantly.
let lastSweep = 0;
async function sweep(force) {
  if (!force && Date.now() - lastSweep < 60000) return 0;
  lastSweep = Date.now();
  const rs = await store.activeRequests(new Date(Date.now() - C.OPEN_MS - 3600000).toISOString());
  let n = 0;
  for (const r of rs) { if (await tick(r, await store.alertsForRequest(r.id))) n++; }
  return n;
}

module.exports = { tick, sweep };
