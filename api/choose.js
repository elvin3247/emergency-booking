// POST: the homeowner picks one contractor. Details are exchanged and the lead fee is recorded.
const store = require('../lib/store');
const { wrap, bad, str } = require('../lib/http');
const { match, live, hasDetails } = require('../lib/match');

module.exports = wrap({
  async POST({ body }) {
    let r = await store.requestByToken(str(body.token, 64));
    if (!r) throw bad("We couldn't find that request.", 404);
    if (r.status === 'canceled') throw bad('This request was canceled.', 409);
    if (r.status !== 'open') throw bad('You already chose a contractor for this request.', 409);
    // Name and address can be sent along with the choice, for homeowners who skipped them earlier.
    if (!hasDetails(r) && str(body.name, 80) && str(body.address, 160)) r = await store.updateRequest(r.id, { name: str(body.name, 80), address: str(body.address, 160) });
    if (!hasDetails(r)) throw bad('Add your name and the street address first, so the pro knows where to go.', 409);
    const alerts = await store.alertsForRequest(r.id);
    const picked = alerts.find(a => a.id === body.offer_id && live(a));
    if (!picked) throw bad('That contractor is no longer available. Please pick another.', 409);
    const chosen = await match(r, picked, alerts, false);
    if (!chosen) throw bad('You already chose a contractor for this request.', 409);
    return { ok: true };
  }
});
