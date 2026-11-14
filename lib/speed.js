// How fast pros usually say yes, by county and trade, from the last 60 days of real requests.
// Shown to homeowners so they know what to expect. Kept in memory for 10 minutes between calls.
const C = require('./config');
const store = require('./store');

const MIN_SAMPLES = 5; // below this, a "usual" time would be a guess, so we don't show one
let cache = null;

const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

async function table() {
  if (cache && Date.now() - cache.at < 600000) return cache.data;
  const rows = await store.answerTimes(new Date(Date.now() - 60 * 864e5).toISOString());
  // First yes per request, in minutes.
  const first = {};
  rows.forEach(x => {
    const start = new Date(x.reopened_at || x.created_at).getTime(), ms = new Date(x.responded_at).getTime() - start;
    if (ms < 0 || ms > C.OPEN_MS) return;
    const k = x.request_id;
    if (!first[k] || ms < first[k].ms) first[k] = { ms, county: x.county, trade: (C.services[x.service] || { trade: 'hvac' }).trade };
  });
  const groups = {};
  Object.values(first).forEach(f => { [f.trade + '|' + f.county, f.trade + '|NJ'].forEach(k => (groups[k] = groups[k] || []).push(f.ms / 60000)); });
  const data = {};
  Object.keys(groups).forEach(k => { if (groups[k].length >= MIN_SAMPLES) data[k] = Math.max(1, Math.round(median(groups[k]))); });
  cache = { at: Date.now(), data };
  return data;
}

// { min, where: 'county' | 'nj' } or null when there isn't enough history yet.
async function typical(trade, county) {
  const d = await table();
  if (d[trade + '|' + county]) return { min: d[trade + '|' + county], where: 'county' };
  if (d[trade + '|NJ']) return { min: d[trade + '|NJ'], where: 'nj' };
  return null;
}
async function all() {
  const d = await table(), out = {};
  Object.keys(d).forEach(k => { const [t, c] = k.split('|'); (out[t] = out[t] || {})[c] = d[k]; });
  return out;
}
const reset = () => { cache = null; };

module.exports = { typical, all, reset, MIN_SAMPLES };
