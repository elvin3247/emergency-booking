// Recruiting: where you're thin on pros, your list of companies to invite, and the invites themselves.
// Used by api/admin.js. Nothing here is public.
const C = require('./config');
const store = require('./store');
const mail = require('./mail');
const E = require('./emails');
const { bad, str, isEmail, digits, token, isReady, isPaused, canAlert, tradeOf } = require('./http');

const DAY = 864e5;
const LIVE_TRADES = Object.keys(C.trades).filter(t => Object.keys(C.services).some(k => C.services[k].live && C.services[k].trade === t));
const REINVITE_DAYS = 7, MAX_INVITES = 3, PER_SEND = 100;

// Where a company stands, in plain words. Order matters: the furthest step wins.
function stage(p, c) {
  if (c && c.status === 'approved' && isReady(c)) return 'live';
  if (c) return c.status === 'approved' ? 'approved' : 'applied';
  if (p.unsubscribed_at) return 'unsubscribed';
  if (p.not_interested) return 'not_interested';
  if (p.clicked_at) return 'clicked';
  if (p.invited_at) return 'invited';
  return 'new';
}
// Can we email an invite now? Returns a reason when not.
function blocked(p, c, now = Date.now()) {
  if (c) return 'Already applied';
  if (p.unsubscribed_at) return 'Asked not to be emailed';
  if (p.not_interested) return 'Marked not interested';
  if (!p.email) return 'No email address';
  if (p.invite_count >= MAX_INVITES) return 'Invited ' + MAX_INVITES + ' times already';
  if (p.invited_at && now - new Date(p.invited_at).getTime() < REINVITE_DAYS * DAY) return 'Invited in the last ' + REINVITE_DAYS + ' days';
  return null;
}

// Everything the Recruiting tab shows.
async function view() {
  const [contractors, prospects, recent] = await Promise.all([store.allContractors(), store.allProspects(), store.requestsSince(new Date(Date.now() - 30 * DAY).toISOString())]);
  const alerts = await store.alertsForRequests(recent.map(r => r.id));
  const byId = Object.fromEntries(contractors.map(c => [c.id, c]));
  const alerted = new Set(alerts.map(a => a.request_id));

  // One cell per county and trade: who's live, who's waiting on you, who you could invite, and the demand.
  const supply = {};
  C.counties.forEach(county => {
    supply[county] = {};
    LIVE_TRADES.forEach(t => {
      const here = contractors.filter(c => (c.counties || []).includes(county) && (c.trades || []).includes(t));
      const live = here.filter(c => c.status === 'approved' && isReady(c));
      const pros = prospects.filter(p => (p.counties || []).includes(county) && (p.trades || []).includes(t) && !p.contractor_id);
      const asks = recent.filter(r => r.county === county && tradeOf(r.service) === t);
      supply[county][t] = {
        live: live.length, on_now: live.filter(canAlert).length, paused: live.filter(c => isPaused(c)).length,
        pending: here.filter(c => c.status === 'pending' || (c.status === 'approved' && !isReady(c))).length,
        prospects: pros.filter(p => !p.unsubscribed_at && !p.not_interested).length, uninvited: pros.filter(p => !blocked(p, null) && !p.invited_at).length,
        requests: asks.length, gaps: asks.filter(r => !alerted.has(r.id)).length
      };
    });
  });

  const list = prospects.map(p => {
    const c = p.contractor_id ? byId[p.contractor_id] : null;
    return {
      id: p.id, created_at: p.created_at, company: p.company, contact: p.contact, email: p.email, phone: p.phone, trades: p.trades || [], counties: p.counties || [],
      town: p.town, website: p.website, license: p.license, notes: p.notes, list_name: p.list_name,
      invited_at: p.invited_at, invite_count: p.invite_count || 0, clicked_at: p.clicked_at, stage: stage(p, c), blocked: blocked(p, c)
    };
  });
  const count = s => list.filter(p => p.stage === s).length;
  return {
    trades: LIVE_TRADES, supply, prospects: list,
    totals: { prospects: list.length, invited: list.filter(p => p.invite_count).length, clicked: list.filter(p => p.clicked_at).length, applied: count('applied') + count('approved') + count('live'), live: count('live') },
    can_bulk: !!C.mailingAddress, reinvite_days: REINVITE_DAYS, max_invites: MAX_INVITES
  };
}

// Add companies from a pasted or uploaded list. Rows were already mapped to our fields on the admin page.
// Skips anyone already on the list (same email, or same company and phone) or already signed up.
async function importRows(rows, listName) {
  if (!Array.isArray(rows) || !rows.length) throw bad('There were no rows to add.');
  if (rows.length > 2000) throw bad('Add up to 2,000 companies at a time.');
  const [have, contractors] = await Promise.all([store.allProspects(), store.allContractors()]);
  const emails = new Set(have.map(p => p.email).concat(contractors.map(c => c.email)).filter(Boolean));
  const keys = new Set(have.map(p => (p.company || '').toLowerCase() + '|' + digits(p.phone)));
  const out = [], skipped = { duplicate: 0, signed_up: 0, no_company: 0, no_contact: 0 };
  const signedUp = new Set(contractors.map(c => c.email));
  rows.forEach(r => {
    const company = str(r.company, 120), email = str(r.email, 120).toLowerCase(), phone = str(r.phone, 30);
    if (!company) { skipped.no_company++; return; }
    if (!isEmail(email) && digits(phone).length < 10) { skipped.no_contact++; return; }
    if (email && signedUp.has(email)) { skipped.signed_up++; return; }
    const key = company.toLowerCase() + '|' + digits(phone);
    if ((isEmail(email) && emails.has(email)) || (digits(phone).length >= 10 && keys.has(key))) { skipped.duplicate++; return; }
    if (isEmail(email)) emails.add(email);
    keys.add(key);
    let website = str(r.website, 200);
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    out.push({
      company, contact: str(r.contact, 80) || null, email: isEmail(email) ? email : null, phone: phone || null,
      trades: (Array.isArray(r.trades) ? r.trades : []).filter(t => C.trades[t]), counties: (Array.isArray(r.counties) ? r.counties : []).filter(c => C.counties.includes(c)),
      town: str(r.town, 60) || null, website: website || null, license: str(r.license, 120) || null, notes: str(r.notes, 500) || null,
      list_name: str(listName, 60) || null, token: token()
    });
  });
  const added = await store.insertProspects(out);
  return { added: added.length, skipped };
}

// Email invites to the chosen companies, up to 100 a click. Each gets their own private link.
async function invite(ids, note) {
  if (!C.mailingAddress) throw bad('Add your mailing address first: MAILING_ADDRESS in Vercel, or mailingAddress in public/assets/config.js. The law requires it in emails to companies that haven\'t signed up yet.');
  if (!Array.isArray(ids) || !ids.length) throw bad('Pick at least one company to invite.');
  const [all, contractors] = await Promise.all([store.allProspects(), store.allContractors()]);
  const byId = Object.fromEntries(contractors.map(c => [c.id, c]));
  const want = new Set(ids.map(String)), now = Date.now();
  const picked = all.filter(p => want.has(p.id));
  const ok = picked.filter(p => !blocked(p, p.contractor_id ? byId[p.contractor_id] : null, now)).slice(0, PER_SEND);
  const res = await mail.sendBatch(ok.map(p => E.recruitInvite(p, str(note, 400))));
  const sent = ok.slice(0, res.sent || 0), at = new Date(now).toISOString();
  for (const p of sent) await store.updateProspect(p.id, { invited_at: at, invite_count: (p.invite_count || 0) + 1 });
  if (!res.ok && !sent.length) throw bad(res.error || 'The invites could not be sent.', 502);
  return { sent: sent.length, skipped: picked.length - sent.length, error: res.ok ? null : res.error };
}

// Mark after a call, or undo. Notes too.
async function update(id, body) {
  const p = (await store.allProspects()).find(x => x.id === String(id));
  if (!p) throw bad("We couldn't find that company.", 404);
  const patch = {};
  if (typeof body.not_interested === 'boolean') patch.not_interested = body.not_interested;
  if (body.notes != null) patch.notes = str(body.notes, 500) || null;
  if (Array.isArray(body.trades)) patch.trades = body.trades.filter(t => C.trades[t]);
  if (Array.isArray(body.counties)) patch.counties = body.counties.filter(c => C.counties.includes(c));
  if (body.email != null) { const e = str(body.email, 120).toLowerCase(); if (e && !isEmail(e)) throw bad('That email address does not look right.'); patch.email = e || null; }
  await store.updateProspect(p.id, patch);
  return { ok: true };
}

// The one-off invite after a recruiting call: add them to the list (or find them) so the invite is tracked too.
async function inviteOne(email, name, trade, county) {
  email = str(email, 120).toLowerCase();
  if (!isEmail(email)) throw bad('Enter a valid email address.');
  if (await store.contractorByEmail(email)) throw bad('That email has already signed up.');
  let p = await store.prospectByEmail(email);
  if (!p) p = (await store.insertProspects([{ company: str(name, 120) || email, contact: str(name, 80) || null, email, trades: C.trades[trade] ? [trade] : [], counties: C.counties.includes(county) ? [county] : [], list_name: 'Phone calls', token: token() }]))[0];
  if (p.unsubscribed_at) throw bad('They asked not to get emails from us.');
  const r = await mail.send(E.invite(email, str(name, 80), p));
  if (!r.ok) throw bad(r.error || 'The email could not be sent.', 502);
  await store.updateProspect(p.id, { invited_at: new Date().toISOString(), invite_count: (p.invite_count || 0) + 1 });
  return { ok: true };
}

module.exports = { view, importRows, invite, update, inviteOne, LIVE_TRADES };
