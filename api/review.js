// POST: the homeowner says how the visit went. One review per request, only after they chose a pro.
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str } = require('../lib/http');

module.exports = wrap({
  async POST({ body }) {
    const r = await store.requestByToken(str(body.token, 64));
    if (!r) throw bad("We couldn't find that request.", 404);
    if (r.status !== 'matched' || !r.chosen_contractor_id) throw bad('You can leave a review once you have chosen a pro.', 409);
    if (r.rating != null) throw bad('You already reviewed this visit. Thank you.', 409);
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) throw bad('Pick 1 to 5 stars.');
    const saved = await store.updateRequest(r.id, { rating, showed_up: body.showed_up !== false, on_time: body.showed_up === false ? null : body.on_time === true ? true : body.on_time === false ? false : null, review: str(body.review, 600) || null, reviewed_at: new Date().toISOString() });
    const c = (await store.contractorsByIds([r.chosen_contractor_id]))[0];
    if (c) await mail.send(E.adminReview(saved, c));
    return { ok: true };
  }
});
