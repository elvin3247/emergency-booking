// POST { name }: records one step of the homeowner or contractor journey, for the funnel on the admin page.
// Vercel's free plan doesn't keep custom analytics events, so they're stored here instead. No personal details.
const store = require('../lib/store');
const { wrap, str, deviceHash } = require('../lib/http');

const ALLOWED = ['request_started', 'form_opened', 'request_submitted', 'details_added', 'photo_added', 'offer_alerts_on', 'request_canceled', 'no_show_reported', 'switched_pro', 'review_sent', 'links_requested', 'contact_fixed',
  'pro_apply_started', 'pro_applied', 'pro_texts_on', 'pro_confirmed', 'pro_eta_on_way', 'pro_eta_late', 'pro_eta_arrived', 'pro_result_done', 'pro_result_canceled', 'pro_result_no_contact'];

module.exports = wrap({
  async POST({ body, headers }) {
    const name = str(body.name, 40);
    if (ALLOWED.includes(name)) await store.insertEvent({ name, device: deviceHash(headers), source: str(body.source, 60) || null });
    return { ok: true };
  }
});
