// GET: which counties have approved contractors, for the home page. Returns statuses only, never names.
const C = require('../lib/config');
const store = require('../lib/store');
const { wrap, withinHours } = require('../lib/http');

module.exports = wrap({
  async GET() {
    const list = await store.approvedContractors();
    const counties = {};
    C.counties.forEach(name => {
      const here = list.filter(c => c.counties.includes(name));
      counties[name] = here.some(c => withinHours(c.alert_hours)) ? 'now' : here.length ? 'later' : 'none';
    });
    // Only show a fee range once there are enough contractors for it to mean something.
    const fees = list.map(c => c.visit_fee);
    return { counties, visit_fee: fees.length >= 3 ? { min: Math.min.apply(null, fees), max: Math.max.apply(null, fees) } : null };
  }
});
