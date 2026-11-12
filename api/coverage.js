// GET: which counties have approved contractors, for the home page. Returns statuses only, never names.
const C = require('../lib/config');
const store = require('../lib/store');
const { wrap, str, isReady, canAlert } = require('../lib/http');

module.exports = wrap({
  async GET({ query }) {
    // ?county=Somerset adds the public list of approved contractors there (name and license only).
    const county = str(query.county, 30);
    const pros = C.counties.includes(county) ? (await store.contractorsForCounty(county)).filter(isReady).map(c => ({ company: c.company, license: c.license })) : undefined;
    const list = (await store.approvedContractors()).filter(isReady);
    const counties = {};
    C.counties.forEach(name => {
      const here = list.filter(c => c.counties.includes(name));
      counties[name] = here.some(canAlert) ? 'now' : here.length ? 'later' : 'none';
    });
    // Only show a fee range once there are enough contractors for it to mean something.
    const fees = list.map(c => c.visit_fee);
    return { counties, contractors: pros, visit_fee: fees.length >= 3 ? { min: Math.min.apply(null, fees), max: Math.max.apply(null, fees) } : null };
  }
});
