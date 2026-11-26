// GET: where approved contractors are signed up, for the home page and state pages. Statuses only, never names.
// Only counties with at least one pro are listed; anything missing means "none yet".
//   ?zip=07059      also returns where that ZIP is: { zip, county, state, town } (or place: null if we don't know the ZIP)
//   ?county=Somerset County, NJ   also returns the public list of approved contractors there. &trade=plumbing narrows it.
const C = require('../lib/config');
const store = require('../lib/store');
const geo = require('../lib/geo');
const { licText, wrap, str, isReady, canAlert } = require('../lib/http');
const speed = require('../lib/speed');
const { sweep } = require('../lib/tick');

module.exports = wrap({
  async GET({ query }) {
    // Visitors looking at coverage also move along any request waiting on a timed step (at most once a minute).
    try { await sweep(); } catch (e) { console.error('sweep failed', e.message); }
    const place = query.zip != null ? geo.zip(str(query.zip, 5)) : undefined;
    const county = str(query.county, 60) || (place ? place.county : ''), trade = C.trades[query.trade] ? query.trade : '';
    const pros = query.county && geo.valid(county) ? (await store.contractorsForCounty(county, trade)).filter(isReady).map(c => ({ id: c.id, company: c.company, license: licText(c), trades: c.trades })) : undefined;
    const list = (await store.approvedContractors()).filter(isReady);
    const status = here => (here.some(canAlert) ? 'now' : here.length ? 'later' : 'none');
    // counties: any trade. trades: the same, split by trade, so the page can say "plumbers on call in Morris County".
    const counties = {}, trades = {}, states = {}, by = {};
    Object.keys(C.trades).forEach(t => { trades[t] = {}; });
    list.forEach(c => (c.counties || []).forEach(name => { if (geo.valid(name)) (by[name] = by[name] || []).push(c); }));
    Object.keys(by).forEach(name => {
      const here = by[name], st = geo.stateOf(name);
      counties[name] = status(here);
      // states: how many counties in each state have a pro, for the state grid.
      states[st] = states[st] || { covered: 0, now: 0, total: geo.counties[st].length };
      states[st].covered++; if (counties[name] === 'now') states[st].now++;
      Object.keys(C.trades).forEach(t => { const s = status(here.filter(c => (c.trades || []).includes(t))); if (s !== 'none') trades[t][name] = s; });
    });
    // Only show a fee range once there are enough contractors for it to mean something.
    const fees = list.map(c => c.visit_fee);
    return { place, counties, trades, states, speed: await speed.all(), contractors: pros, visit_fee: fees.length >= 3 ? { min: Math.min.apply(null, fees), max: Math.max.apply(null, fees) } : null };
  }
});
