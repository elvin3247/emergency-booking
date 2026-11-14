// The once-a-day job (Vercel's free plan allows one scheduled run a day; see vercel.json).
// It also keeps the Supabase database awake, since free projects pause after a quiet week.
const C = require('./config');
const store = require('./store');
const mail = require('./mail');
const E = require('./emails');
const { sweep } = require('./tick');

const DAY = 864e5, iso = t => new Date(t).toISOString();

async function daily() {
  const now = Date.now();
  const s = { requests: 0, matched: 0, gaps: 0, noshows: 0, reviews: 0, pending: 0, reminders: 0, closed: 0, photos: 0, swept: 0 };
  s.swept = await sweep(true);

  // Review reminders: visits matched between 6 hours and 7 days ago with no review yet. Once per request.
  for (const r of await store.requestsMatchedBetween(iso(now - 7 * DAY), iso(now - 6 * 3600000))) {
    if (r.rating != null || r.review_reminded_at || !r.chosen_contractor_id) continue;
    if (!await store.claimRequest(r.id, 'review_reminded_at')) continue;
    const c = (await store.contractorsByIds([r.chosen_contractor_id]))[0];
    if (c) { await mail.send(E.homeownerReviewReminder(r, c)); s.reminders++; }
  }

  // Requests that closed with nobody chosen: tell the homeowner and offer to send it again. Once per request.
  for (const r of await store.openRequestsBefore(iso(now - C.OPEN_MS), iso(now - 7 * DAY))) {
    if (r.closed_notified_at || !await store.claimRequest(r.id, 'closed_notified_at')) continue;
    await mail.send(E.homeownerClosed(r)); s.closed++;
  }

  // Delete old photos, as the privacy policy promises.
  for (const r of await store.requestsWithPhotosBefore(iso(now - C.keepPhotosDays * DAY))) {
    await store.deletePhotos(r.photos); await store.updateRequest(r.id, { photos: [] }); s.photos += r.photos.length;
  }

  // Yesterday in numbers, for your morning email.
  const y = await store.requestsSince(iso(now - DAY));
  const alerts = await store.alertsForRequests(y.map(r => r.id));
  s.requests = y.length;
  s.matched = y.filter(r => r.status === 'matched').length;
  s.gaps = y.filter(r => !alerts.some(a => a.request_id === r.id)).length;
  s.noshows = alerts.filter(a => a.outcome === 'no_show').length;
  s.reviews = y.filter(r => r.rating != null).length;
  s.pending = (await store.allContractors()).filter(c => c.status === 'pending').length;
  s.todo = s.pending + s.gaps;
  if (C.ADMIN_EMAIL) await mail.send(E.adminSummary(s));
  // So the launch checklist can show the daily job is really running.
  await store.insertEvent({ name: 'daily_run', device: null, source: null }).catch(() => {});
  return s;
}

module.exports = { daily };
