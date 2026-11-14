// POST: a homeowner creates a request and matching contractors are alerted.
// GET ?token=: the homeowner's request page reads its current state.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, digits, token, isReady, canAlert, tradeOf, deviceHash, openedAt } = require('../lib/http');
const { tryAutoMatch, hasDetails, live, match } = require('../lib/match');
const { tick } = require('../lib/tick');
const speed = require('../lib/speed');
const FEE_LIMITS = [100, 150, 200];

const REASONS = ['I fixed it myself', 'I found someone else', 'I no longer need it', 'Other'];
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Things a homeowner can do to a request they already sent. The private link (token) is the key.
async function act(body) {
  const r = await store.requestByToken(str(body.token, 64));
  if (!r) throw bad("We couldn't find that request.", 404);
  const alerts = await store.alertsForRequest(r.id);
  const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
  const now = new Date().toISOString();
  const expired = r.status === 'open' && Date.now() - openedAt(r) > C.OPEN_MS;

  if (body.action === 'details') {
    // Name and address, sent while pros are answering. Needed before anyone can be chosen.
    if (r.status === 'canceled' || expired) throw bad('This request is closed.', 409);
    const name = str(body.name, 80), address = str(body.address, 160);
    if (!name) throw bad('Enter your name so the pro knows who to ask for.');
    if (!address) throw bad('Enter the street address where the work is needed.');
    const saved = await store.updateRequest(r.id, { name, address });
    const auto = await tryAutoMatch(saved);
    return { ok: true, matched: !!auto };
  }

  if (body.action === 'contact') {
    // Fix a typo in phone or email. If a pro was already chosen, they get the corrected details.
    if (r.status === 'canceled' || expired) throw bad('This request is closed.', 409);
    const phone = str(body.phone, 30), email = str(body.email, 120).toLowerCase();
    if (digits(phone).length < 10) throw bad('Enter a 10-digit phone number.');
    if (!isEmail(email)) throw bad('Enter a valid email address.');
    const saved = await store.updateRequest(r.id, { phone, email, phone_digits: digits(phone).slice(-10) });
    if (r.status === 'matched') { const a = alerts.find(x => x.id === r.chosen_alert_id); await mail.send(E.contactUpdated(cs[a.contractor_id], saved)); }
    return { ok: true };
  }

  if (body.action === 'photo') {
    if (r.status === 'canceled' || expired) throw bad('This request is closed, so photos can no longer be added.', 409);
    if ((r.photos || []).length >= C.maxPhotos) throw bad('You can add up to ' + C.maxPhotos + ' photos.', 409);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
    if (!m) throw bad('That file is not a photo we can use. Try a JPG or PNG.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3 * 1024 * 1024) throw bad('That photo is too large. Try a smaller one.');
    const path = r.id + '/' + token() + '.' + PHOTO_TYPES[m[1]];
    await store.savePhoto(path, buf, m[1]);
    const photos = (r.photos || []).concat(path);
    await store.updateRequest(r.id, { photos });
    return { photos: photos.length };
  }

  if (body.action === 'cancel') {
    if (r.status === 'canceled') return { ok: true };
    if (expired) throw bad('This request already closed.', 409);
    const reason = REASONS.includes(body.reason) ? body.reason : 'Other';
    const saved = await store.updateRequest(r.id, { status: 'canceled', canceled_at: now, cancel_reason: reason });
    const msgs = [];
    if (r.status === 'matched') {
      // They had already chosen someone: tell that pro, give back a free lead, and put any paid lead fee in front of you.
      const a = alerts.find(x => x.id === r.chosen_alert_id), c = cs[a.contractor_id];
      const fa = await store.updateAlert(a.id, a.lead_fee > 0 ? { fee_review: true } : {});
      if (!(a.lead_fee > 0) && !C.freeLaunch) await store.updateContractor(c.id, { free_leads_left: (c.free_leads_left || 0) + 1 });
      msgs.push(E.contractorCanceled(c, saved, a, true));
      if (a.lead_fee > 0) msgs.push(E.adminFlag('Canceled after choosing', saved, c, fa, 'The customer canceled after choosing this contractor (' + reason + '). Decide whether to keep the lead fee.'));
    } else {
      alerts.filter(a => a.response === 'accepted' && a.outcome !== 'no_show').forEach(a => msgs.push(E.contractorCanceled(cs[a.contractor_id], saved, a, false)));
    }
    await mail.sendAll(msgs);
    return { ok: true };
  }

  if (body.action === 'noshow') {
    // The pro they chose never came or never confirmed. With offer_id: switch straight to a pro on standby.
    // Without: credit the lead, tell you, and send the request out again.
    if (r.status !== 'matched') throw bad('You can report this once you have chosen a contractor.', 409);
    const a = alerts.find(x => x.id === r.chosen_alert_id), c = cs[a.contractor_id];
    const confirmed = !!(a.confirmed_at || a.eta_status);
    if (body.offer_id) {
      const next = alerts.find(x => x.id === body.offer_id && x.outcome === 'standby');
      if (!next || Date.now() - new Date(r.matched_at).getTime() > C.standbyMin * 60000) throw bad('That pro is no longer on standby. You can send your request out again instead.', 409);
      const fa = await store.updateAlert(a.id, Object.assign({ outcome: 'no_show' }, a.lead_fee > 0 ? { fee_review: true } : {}));
      if (!(a.lead_fee > 0) && !C.freeLaunch) await store.updateContractor(c.id, { free_leads_left: (c.free_leads_left || 0) + 1 });
      const reopened = await store.updateRequest(r.id, { status: 'open', chosen_alert_id: null, chosen_contractor_id: null, matched_at: null, confirm_nudged_at: null });
      const fresh = await store.alertsForRequest(r.id);
      const chosen = await match(reopened, fresh.find(x => x.id === next.id), fresh, false);
      if (!chosen) throw bad('Something changed while you were choosing. Please refresh.', 409);
      await mail.sendAll([confirmed ? E.contractorNoShow(c, r, a) : E.contractorReplaced(c, r, a),
        E.adminFlag(confirmed ? 'NO-SHOW reported' : 'Switched pros', r, c, fa, (confirmed ? 'The customer says this contractor never arrived' : 'This contractor never confirmed, so the customer switched') + ' to ' + cs[next.contractor_id].company + ', who was on standby.' + (a.lead_fee > 0 ? ' The lead fee is waiting on your decision.' : ''))]);
      return { ok: true, switched: true };
    }
    const fa = await store.updateAlert(a.id, Object.assign({ outcome: 'no_show' }, a.lead_fee > 0 ? { fee_review: true } : {}));
    if (!(a.lead_fee > 0) && !C.freeLaunch) await store.updateContractor(c.id, { free_leads_left: (c.free_leads_left || 0) + 1 });
    const reopened = await store.updateRequest(r.id, { status: 'open', chosen_alert_id: null, chosen_contractor_id: null, matched_at: null, reopened_at: now, widened_at: null, confirm_nudged_at: null });
    // Everyone alerted before (except the no-show) starts fresh, and any newly available pros in the county are added.
    const others = alerts.filter(x => x.id !== a.id);
    const reset = await Promise.all(others.map(x => store.updateAlert(x.id, { response: 'none', outcome: null, arrival: null, visit_fee: null, responded_at: null, lead_fee: 0, eta_status: null, eta_min: null, eta_at: null })));
    const pool = (await store.contractorsForCounty(r.county, tradeOf(r.service))).filter(canAlert);
    const fresh = pool.filter(p => p.id !== c.id && !alerts.some(x => x.contractor_id === p.id));
    const added = await store.insertAlerts(fresh.map(p => ({ request_id: r.id, contractor_id: p.id, token: token(), response: 'none' })));
    const ready = Object.fromEntries(pool.map(p => [p.id, p]));
    const msgs = reset.concat(added).filter(x => ready[x.contractor_id]).map(x => E.contractorAlert(ready[x.contractor_id], reopened, x, true));
    msgs.push(confirmed ? E.contractorNoShow(c, r, a) : E.contractorReplaced(c, r, a));
    msgs.push(E.adminFlag('NO-SHOW reported', r, c, fa, 'The customer says this contractor never arrived. We sent the request out again to ' + (msgs.length - 1) + ' pro(s).' + (a.lead_fee > 0 ? ' The lead fee is waiting on your decision.' : C.freeLaunch ? '' : ' Their free lead was given back.')));
    await mail.sendAll(msgs);
    return { ok: true, alerted: msgs.length - 2 };
  }
  throw bad('Unknown action.');
}


module.exports = wrap({
  async POST({ body, headers }) {
    if (body.action) return act(body);
    if (body.website) return { token: 'ok' }; // hidden field only bots fill in
    const r = {
      service: str(body.service, 30), problem: str(body.problem, 30), zip: str(body.zip, 5), county: str(body.county, 30), timing: str(body.timing, 40), system: str(body.system, 40),
      note: str(body.note, 500), name: str(body.name, 80), phone: str(body.phone, 30), email: str(body.email, 120).toLowerCase(), address: str(body.address, 160), source: str(body.source, 120) || null
    };
    if (!C.problems[r.problem]) throw bad('Choose the problem you need help with.');
    if (!r.service) r.service = C.problems[r.problem][2][0];
    if (!C.services[r.service] || !C.problems[r.problem][2].includes(r.service)) throw bad('Choose the kind of help you need.');
    if (!C.services[r.service].live) throw bad("We're not taking " + C.services[r.service].name.toLowerCase() + ' requests yet.');
    const trade = tradeOf(r.service);
    if (!/^\d{5}$/.test(r.zip)) throw bad('Enter a 5-digit ZIP code.');
    if (!/^0[78]/.test(r.zip)) throw bad("We're only in New Jersey for now. NJ ZIP codes start with 07 or 08.");
    if (!C.counties.includes(r.county)) throw bad('Choose your county.');
    if (!C.timings.includes(r.timing)) r.timing = C.timings[0];
    r.system = trade !== 'hvac' ? null : C.systems.includes(r.system) ? r.system : C.systems[0];
    // Name and address can come now or on the request page while pros answer.
    r.name = r.name || null;
    if (digits(r.phone).length < 10) throw bad('Enter a 10-digit phone number.');
    if (!isEmail(r.email)) throw bad('Enter a valid email address. We send your updates there.');
    r.address = r.address || null;
    r.auto_pick = body.auto_pick === true;
    r.auto_max_fee = r.auto_pick && FEE_LIMITS.includes(Number(body.auto_max_fee)) ? Number(body.auto_max_fee) : null;
    if (body.consent !== true) throw bad('Check the box so we can contact you about this request.');

    // Spam limit: a few requests an hour is normal for a real emergency. Dozens is not.
    r.phone_digits = digits(r.phone).slice(-10); r.device = deviceHash(headers);
    if (process.env.RATE_LIMITS !== 'off') {
      const since = new Date(Date.now() - 3600000).toISOString();
      if (await store.countRequestsSince(since, { email: r.email, phone: r.phone_digits }) >= C.limits.perContactHour) throw bad('You already have requests open. Check your email for the link to your request page.', 429);
      if (r.device && await store.countRequestsSince(since, { device: r.device }) >= C.limits.perDeviceHour) throw bad('Too many requests from this connection in the last hour. Please try again later.', 429);
    }

    const row = await store.insertRequest(Object.assign(r, { photos: [], token: token(), status: 'open', consent_at: new Date().toISOString(), consent_text: C.consent.homeowner }));
    const matches = (await store.contractorsForCounty(r.county, trade)).filter(canAlert);
    const alerts = await store.insertAlerts(matches.map(c => ({ request_id: row.id, contractor_id: c.id, token: token(), response: 'none' })));
    const byId = Object.fromEntries(matches.map(c => [c.id, c]));
    await mail.sendAll(alerts.map(a => E.contractorAlert(byId[a.contractor_id], row, a)).concat([E.homeownerReceived(row, alerts.length), E.adminNewRequest(row, matches)]));
    return { token: row.token };
  },

  async GET({ query }) {
    let r = await store.requestByToken(str(query.token, 64));
    if (!r) throw bad("We couldn't find that request. Check the link in your email.", 404);
    let alerts = await store.alertsForRequest(r.id);
    // Timed steps (widen the search, ask the chosen pro to confirm) happen as the homeowner's page refreshes.
    if (await tick(r, alerts)) { r = await store.requestById(r.id); alerts = await store.alertsForRequest(r.id); }
    const cs = Object.fromEntries((await store.contractorsByIds(alerts.map(a => a.contractor_id))).map(c => [c.id, c]));
    const created = new Date(r.created_at).getTime(), opened = openedAt(r), now = Date.now();
    // Star ratings: shown only once a pro has enough reviews for the number to mean something.
    const stars = {};
    (await store.reviewsFor(alerts.map(a => a.contractor_id))).forEach(v => { const s = (stars[v.chosen_contractor_id] = stars[v.chosen_contractor_id] || { n: 0, sum: 0 }); s.n++; s.sum += v.rating; });
    const rating = id => (stars[id] && stars[id].n >= C.minReviews ? { avg: Math.round(stars[id].sum / stars[id].n * 10) / 10, count: stars[id].n } : null);
    const offer = a => ({ id: a.id, pro_id: a.contractor_id, rating: rating(a.contractor_id), company: cs[a.contractor_id].company, license: cs[a.contractor_id].license, arrival: a.arrival, visit_fee: a.visit_fee, secs: Math.max(0, Math.round((new Date(a.responded_at).getTime() - opened) / 1000)) });
    const accepted = alerts.filter(a => a.response === 'accepted' && a.outcome !== 'no_show').sort((a, b) => new Date(a.responded_at) - new Date(b.responded_at));
    const state = r.status === 'canceled' ? 'canceled' : r.status === 'matched' ? 'matched' : now - opened > C.OPEN_MS ? 'closed' : 'open';
    const out = {
      state, now, window_ends: opened + C.WINDOW_MS, widened_to: r.widened_at && state === 'open' ? C.neighbors[r.county] || [] : null, alerted: alerts.filter(a => a.outcome !== 'no_show').length, reopened: !!r.reopened_at,
      photos: state === 'canceled' ? [] : await store.photoUrls(r.photos || []), max_photos: C.maxPhotos,
      request: { service: r.service, problem: r.problem, zip: r.zip, county: r.county, timing: r.timing, address: r.address, phone: r.phone, email: r.email },
      offers: state === 'open' ? accepted.slice(0, C.maxOffers).map(offer) : [],
      needs_details: !hasDetails(r), name: r.name || '', auto_pick: !!r.auto_pick, auto_max_fee: r.auto_max_fee == null ? null : r.auto_max_fee,
      typical: state === 'open' ? await speed.typical(tradeOf(r.service) || 'hvac', r.county) : null
    };
    if (state === 'matched') {
      const a = alerts.find(x => x.id === r.chosen_alert_id);
      out.chosen = Object.assign(offer(a), { phone: cs[a.contractor_id].business_phone, eta: { status: a.eta_status || null, min: a.eta_min || null, at: a.eta_at || null } });
      out.reviewed = r.rating != null;
      // Has the pro been in touch? If not after a few minutes, offer the pros on standby.
      out.confirmed = !!(a.confirmed_at || a.eta_status);
      const since = now - new Date(r.matched_at).getTime();
      out.unconfirmed = !out.confirmed && since >= C.confirmMin * 60000;
      out.standby = since < C.standbyMin * 60000 ? alerts.filter(x => x.outcome === 'standby').map(offer) : [];
      out.standby_ends = new Date(r.matched_at).getTime() + C.standbyMin * 60000;
    } else if (state !== 'canceled' && !accepted.length && (!out.alerted || now > out.window_ends)) {
      // Nobody confirmed: be honest and give numbers to call directly.
      out.backup = (await store.contractorsForCounty(r.county, tradeOf(r.service) || 'hvac')).filter(isReady).slice(0, 5).map(c => ({ company: c.company, phone: c.business_phone, license: c.license }));
    }
    return out;
  }
});
