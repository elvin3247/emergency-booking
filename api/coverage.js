// GET: where approved contractors are signed up, for the home page and county pages. Statuses only, never names.
const C = require('../lib/config');
const store = require('../lib/store');
const { wrap, str, isReady, canAlert } = require('../lib/http');

module.exports = wrap({
  async GET({ query }) {
    // ?county=Somerset adds the public list of approved contractors there (name, trades, and license only). &trade=plumbing narrows it.
    const county = str(query.county, 30), trade = C.trades[query.trade] ? query.trade : '';
    const pros = C.counties.includes(county) ? (await store.contractorsForCounty(county, trade)).filter(isReady).map(c => ({ company: c.company, license: c.license, trades: c.trades })) : undefined;
    const list = (await store.approvedContractors()).filter(isReady);
    const status = here => (here.some(canAlert) ? 'now' : here.length ? 'later' : 'none');
    // counties: any trade. trades: the same, split by trade, so the page can say "plumbers on call in Morris County".
    const counties = {}, trades = {};
    Object.keys(C.trades).forEach(t => { trades[t] = {}; });
    C.counties.forEach(name => {
      const here = list.filter(c => c.counties.includes(name));
      counties[name] = status(here);
      Object.keys(C.trades).forEach(t => { trades[t][name] = status(here.filter(c => (c.trades || []).includes(t))); });
    });
    // Only show a fee range once there are enough contractors for it to mean something.
    const fees = list.map(c => c.visit_fee);
    return { counties, trades, contractors: pros, visit_fee: fees.length >= 3 ? { min: Math.min.apply(null, fees), max: Math.max.apply(null, fees) } : null };
  }
});
