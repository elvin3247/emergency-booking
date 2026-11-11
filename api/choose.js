// POST: the homeowner picks one contractor. Details are exchanged and the lead fee is recorded.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str } = require('../lib/http');

module.exports = wrap({
  async POST({ body }) {
    const r = await store.requestByToken(str(body.token, 64));
    if (!r) throw bad("We couldn't find that request.", 404);
    if (r.status !== 'open') throw bad('You already chose a contractor for this request.', 409);
    const alerts = await store.alertsForRequest(r.id);
    const picked = alerts.find(a => a.id === body.offer_id && a.response === 'accepted');
    if (!picked) throw bad('That contractor is no longer available. Please pick another.', 409);

    const matched = await store.matchRequest(r.id, picked.id);
    if (!matched) throw bad('You already chose a contractor for this request.', 409);

    const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
    const winner = cs[picked.contractor_id];
    const fee = winner.free_leads_left > 0 ? 0 : C.leadFee;
    const freeLeft = Math.max(0, winner.free_leads_left - 1);
    if (winner.free_leads_left > 0) await store.updateContractor(winner.id, { free_leads_left: freeLeft });
    const chosen = await store.updateAlert(picked.id, { outcome: 'chosen', lead_fee: fee });
    const others = alerts.filter(a => a.id !== picked.id && a.response === 'accepted');
    await Promise.all(others.map(a => store.updateAlert(a.id, { outcome: 'not_chosen', lead_fee: 0 })));

    await mail.sendAll([
      E.contractorChosen(winner, r, chosen, fee, freeLeft),
      E.homeownerMatched(r, winner, chosen),
      E.adminMatched(r, winner, chosen, fee)
    ].concat(others.map(a => E.contractorFilled(cs[a.contractor_id], r))));
    return { ok: true };
  }
});
