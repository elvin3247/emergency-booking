// Backups of the lists you can't rebuild: contractors and the recruiting list, as spreadsheet (CSV) files.
// Emailed to you every Monday by the daily job, and downloadable anytime from the admin page.
// Private links (manage tokens, invite codes) are left out, so a forwarded backup can't be used to change anyone's settings.
const store = require('./store');

const CONTRACTOR_COLS = ['created_at', 'company', 'contact', 'email', 'extra_emails', 'mobile', 'business_phone', 'license', 'trades', 'counties', 'status',
  'alert_hours', 'paused_until', 'visit_fee', 'free_leads_left', 'sms_on', 'website', 'years_in_business', 'source'];
const PROSPECT_COLS = ['created_at', 'company', 'contact', 'email', 'phone', 'trades', 'counties', 'town', 'website', 'license', 'notes', 'list_name',
  'invited_at', 'invite_count', 'clicked_at', 'unsubscribed_at', 'not_interested', 'contractor_id'];

// One spreadsheet cell. Lists become "a; b". A leading = + - @ is neutralized so a spreadsheet never runs it as a formula.
function cell(v) {
  if (v == null) return '';
  let s = Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csv = (rows, cols) => [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\r\n') + '\r\n';

async function build() {
  const [contractors, prospects] = await Promise.all([store.allContractors(), store.allProspects()]);
  const day = new Date().toISOString().slice(0, 10);
  return {
    day, counts: { contractors: contractors.length, prospects: prospects.length },
    files: [
      { filename: 'contractors-' + day + '.csv', csv: csv(contractors, CONTRACTOR_COLS) },
      { filename: 'recruiting-list-' + day + '.csv', csv: csv(prospects, PROSPECT_COLS) }
    ]
  };
}

// Monday, Eastern time, when the weekly backup goes out.
const isBackupDay = (d = new Date()) => d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Mon';

module.exports = { build, csv, cell, isBackupDay };
