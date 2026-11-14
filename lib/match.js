// Connecting a homeowner with one contractor. Used when the homeowner taps "Choose", and when we book
// the first pro automatically for them. Returns the chosen alert, or null if the request was already matched.
const C = require('./config');
const store = require('./store');
const mail = require('./mail');
const E = require('./emails');

const live = a => a.response === 'accepted' && a.outcome !== 'no_show';
// Name and address are only needed once someone is chosen, so homeowners can send the request before typing them.
const hasDetails = r => !!(r.name && r.address);
// Auto-booking: the first pro who says "Within 1 hour" at or under the homeowner's fee limit.
const autoQualifies = (r, a) => !!r.auto_pick && a.arrival === C.arrivals[0] && (r.auto_max_fee == null || a.visit_fee <= r.auto_max_fee);

async function match(r, picked, alerts, auto) {
  const matched = await store.matchRequest(r.id, picked.id, picked.contractor_id);
  if (!matched) return null;
  const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
  const winner = cs[picked.contractor_id];
  // During the free launch nothing is charged and each pro's free leads are saved for when fees start.
  const free = C.freeLaunch || winner.free_leads_left > 0;
  const fee = free ? 0 : C.leadFee;
  const freeLeft = C.freeLaunch ? winner.free_leads_left : Math.max(0, winner.free_leads_left - 1);
  if (!C.freeLaunch && winner.free_leads_left > 0) await store.updateContractor(winner.id, { free_leads_left: freeLeft });
  const chosen = await store.updateAlert(picked.id, { outcome: 'chosen', lead_fee: fee });
  const others = alerts.filter(a => a.id !== picked.id && live(a));
  // The others who said yes stay on standby for a while, in case the chosen pro doesn't work out.
  await Promise.all(others.map(a => store.updateAlert(a.id, { outcome: 'standby', lead_fee: 0 })));
  await mail.sendAll([
    E.contractorChosen(winner, r, chosen, fee, freeLeft),
    E.homeownerMatched(r, winner, chosen, auto),
    E.adminMatched(r, winner, chosen, fee)
  ].concat(others.map(a => E.contractorFilled(cs[a.contractor_id], r))));
  return chosen;
}

// If the homeowner asked us to book automatically, pick the earliest qualifying yes (if any).
async function tryAutoMatch(r) {
  if (!r.auto_pick || r.status !== 'open' || !hasDetails(r)) return null;
  const alerts = await store.alertsForRequest(r.id);
  const first = alerts.filter(a => live(a) && autoQualifies(r, a)).sort((a, b) => new Date(a.responded_at) - new Date(b.responded_at))[0];
  return first ? match(r, first, alerts, true) : null;
}

module.exports = { match, tryAutoMatch, live, hasDetails, autoQualifies };
