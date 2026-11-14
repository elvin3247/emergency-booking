const shared = require('../public/assets/config.js');

module.exports = Object.assign({}, shared, {
  // Links in emails. Set SITE_URL in Vercel. Falls back to siteUrl in config.js, then Vercel's own address.
  SITE_URL: (process.env.SITE_URL || shared.siteUrl ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '') ||
    (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '') || 'http://localhost:3000').replace(/\/$/, ''),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_KEY: process.env.ADMIN_KEY || '',
  FROM_EMAIL: process.env.FROM_EMAIL || '',
  // Test-only: shorten the timers on a local preview (for example WIDEN_MIN=0.1). Leave these unset in Vercel.
  widenMin: Number(process.env.WIDEN_MIN) || shared.widenMin,
  confirmMin: Number(process.env.CONFIRM_MIN) || shared.confirmMin,
  standbyMin: Number(process.env.STANDBY_MIN) || shared.standbyMin,
  WINDOW_MS: shared.windowMin * 60 * 1000,
  OPEN_MS: shared.openHours * 60 * 60 * 1000
});
