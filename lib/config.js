const shared = require('../public/assets/config.js');

module.exports = Object.assign({}, shared, {
  SITE_URL: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  FROM_EMAIL: process.env.FROM_EMAIL || '',
  WINDOW_MS: shared.windowMin * 60 * 1000,
  OPEN_MS: shared.openHours * 60 * 60 * 1000
});
