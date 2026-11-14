// GET ?id=: a contractor's public profile. Approved contractors only, and never anything private.
const C = require('../lib/config');
const store = require('../lib/store');
const { wrap, bad, str } = require('../lib/http');

module.exports = wrap({
  async GET({ query }) {
    const id = str(query.id, 64);
    const c = /^[0-9a-f-]{36}$/i.test(id) && (await store.contractorsByIds([id]))[0];
    if (!c || c.status !== 'approved') throw bad("We couldn't find that company.", 404);
    const reviews = await store.reviewDetails(c.id, 50);
    const timed = reviews.filter(r => r.on_time != null);
    const enough = reviews.length >= C.minReviews;
    return {
      company: c.company, trades: c.trades || ['hvac'], license: c.license, counties: c.counties, about: c.about || '', years_in_business: c.years_in_business, website: c.website || '',
      member_since: c.created_at, business_phone: c.business_phone, visit_fee: c.visit_fee,
      reviews: {
        count: reviews.length,
        avg: enough ? Math.round(reviews.reduce((t, r) => t + r.rating, 0) / reviews.length * 10) / 10 : null,
        on_time: enough && timed.length ? Math.round(timed.filter(r => r.on_time).length / timed.length * 100) : null,
        recent: reviews.filter(r => r.review).slice(0, 5).map(r => ({ rating: r.rating, text: r.review, at: r.reviewed_at }))
      }
    };
  }
});
