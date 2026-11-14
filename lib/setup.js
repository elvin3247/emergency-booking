// The launch checklist on the admin page: checks each outside service the site depends on, live, and says how to fix what isn't ready.
// Each check: { group, label, state: 'ok' | 'warn' | 'bad', detail, fix }. 'warn' means it works but needs attention before launch.
const C = require('./config');
const store = require('./store');
const sms = require('./sms');
const { isReady } = require('./http');

const HOUR = 36e5;
const ago = iso => { const h = (Date.now() - new Date(iso).getTime()) / HOUR; return h < 1 ? 'less than an hour ago' : h < 48 ? Math.round(h) + ' hours ago' : Math.round(h / 24) + ' days ago'; };
const env = k => !!process.env[k];
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('No answer after ' + ms / 1000 + ' seconds')), ms))]);

async function getJson(url, headers) {
  const r = await timeout(fetch(url, { headers }), 8000);
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, ok: r.ok, data };
}

async function run() {
  const out = [], add = (group, label, state, detail, fix) => out.push({ group, label, state, detail: detail || '', fix: fix || '' });
  const memory = process.env.STORE === 'memory';

  // ---- Your site ----
  add('Your site', 'Brand name', C.brand && C.brand !== 'YourBrand' ? 'ok' : 'warn', 'Showing as "' + C.brand + '".',
    'Change brand in public/assets/config.js, run npm run build, and push. It updates every page and email.');
  const url = process.env.SITE_URL || C.siteUrl;
  if (!url) add('Your site', 'Web address', 'bad', 'Not set, so email links use Vercel\'s own address and there is no sitemap.', 'Set siteUrl in public/assets/config.js to your address (like https://example.com), run npm run build, and push. Also add SITE_URL with the same value in Vercel.');
  else {
    const both = !!process.env.SITE_URL && !!C.siteUrl, same = both && process.env.SITE_URL.replace(/\/$/, '') === C.siteUrl.replace(/\/$/, '');
    add('Your site', 'Web address', both && same ? 'ok' : 'warn', 'Email links go to ' + C.SITE_URL + '.',
      !C.siteUrl ? 'Also set siteUrl in public/assets/config.js and run npm run build, so the sitemap and canonical links are built.' : !process.env.SITE_URL ? 'Also add SITE_URL in Vercel with the same address.' : !same ? 'SITE_URL in Vercel and siteUrl in config.js are different. Make them match.' : '');
    if (!memory) {
      try {
        const r = await timeout(fetch(C.SITE_URL + '/sitemap.xml'), 8000);
        const body = r.ok ? await r.text() : '';
        const n = (body.match(/<loc>/g) || []).length;
        add('Your site', 'Sitemap for Google', r.ok && n ? 'ok' : 'bad', r.ok && n ? n + ' pages listed at ' + C.SITE_URL + '/sitemap.xml.' : 'No sitemap at ' + C.SITE_URL + '/sitemap.xml.',
          r.ok && n ? 'Submit it once in Google Search Console so Google finds every county page.' : 'Set siteUrl in config.js, run npm run build, and push.');
      } catch (e) { add('Your site', 'Sitemap for Google', 'warn', 'Could not reach ' + C.SITE_URL + ': ' + e.message); }
    }
  }
  add('Your site', 'Mailing address for recruiting emails', C.mailingAddress ? 'ok' : 'warn', C.mailingAddress ? C.mailingAddress : 'Not set. Bulk invites stay off until it is.',
    'Set MAILING_ADDRESS in Vercel (or mailingAddress in public/assets/config.js). The law (CAN-SPAM) requires a postal address in emails to companies that haven\'t signed up. A PO box works.');

  // ---- Database ----
  if (memory) add('Database', 'Supabase', 'warn', 'This is a local preview using a stand-in database. Nothing is saved.', '');
  else if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) add('Database', 'Supabase connection', 'bad', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.', 'Add both in Vercel (Settings, Environment Variables), then redeploy.');
  else {
    try {
      const missing = await timeout(store.checkSchema(), 10000);
      add('Database', 'Tables and columns', missing.length ? 'bad' : 'ok', missing.length ? 'Missing or out of date: ' + missing.map(m => m.table).join(', ') + '. (' + missing[0].error + ')' : 'Every table this version needs is there.',
        missing.length ? 'Open Supabase, SQL Editor, paste all of supabase/schema.sql, and run it. It is safe to run again.' : '');
    } catch (e) { add('Database', 'Tables and columns', 'bad', 'Could not reach Supabase: ' + e.message, 'Check the keys in Vercel. A free Supabase project pauses after a quiet week; restore it from the Supabase dashboard.'); }
    try {
      const b = await timeout(store.checkBucket(), 8000);
      add('Database', 'Photo storage', b.ok && !b.public ? 'ok' : 'bad', b.ok ? (b.public ? 'The photos bucket is public. Homeowner photos should be private.' : 'Private "photos" bucket is there.') : 'No "photos" bucket: ' + (b.error || ''),
        b.ok && !b.public ? '' : 'Run supabase/schema.sql again, or in Supabase Storage make the photos bucket private.');
    } catch (e) { add('Database', 'Photo storage', 'bad', e.message); }
  }

  // ---- Email ----
  add('Email', 'Where your alerts go (ADMIN_EMAIL)', C.ADMIN_EMAIL ? 'ok' : 'bad', C.ADMIN_EMAIL || 'Not set, so you won\'t hear about new requests, sign-ups, or the daily summary.', C.ADMIN_EMAIL ? '' : 'Add ADMIN_EMAIL in Vercel.');
  if (!env('RESEND_API_KEY')) add('Email', 'Resend', memory ? 'warn' : 'bad', memory ? 'Local preview: emails are printed to the log instead of sent.' : 'RESEND_API_KEY is missing, so no email goes out.', 'Add RESEND_API_KEY in Vercel.');
  else if (!C.FROM_EMAIL) add('Email', 'Sender address (FROM_EMAIL)', 'bad', 'FROM_EMAIL is missing, so no email goes out.', 'Add FROM_EMAIL in Vercel, like alerts@yourdomain.com.');
  else {
    const domain = (C.FROM_EMAIL.match(/@([^>\s]+)/) || [])[1] || '';
    try {
      const r = await getJson('https://api.resend.com/domains', { Authorization: 'Bearer ' + process.env.RESEND_API_KEY });
      if (r.status === 401 || r.status === 403) add('Email', 'Sending domain', 'warn', 'Your Resend key can send but not look up domains, so this can\'t be checked here.', 'Use "Send a test email" below. If it arrives, you\'re set.');
      else if (!r.ok) add('Email', 'Sending domain', 'warn', 'Resend said ' + r.status + '.', 'Use "Send a test email" below.');
      else {
        const d = ((r.data && r.data.data) || []).find(x => x.name && domain.toLowerCase().endsWith(x.name.toLowerCase()));
        add('Email', 'Sending domain', d && d.status === 'verified' ? 'ok' : 'bad',
          d ? domain + ' is ' + d.status + ' in Resend.' : domain + ' is not added in Resend. Until it is verified, Resend only delivers to your own address.',
          d && d.status === 'verified' ? '' : 'In Resend, add ' + domain + ' under Domains and copy the DNS records it shows into your domain host. Verification usually takes minutes to a few hours.');
      }
    } catch (e) { add('Email', 'Sending domain', 'warn', 'Could not reach Resend: ' + e.message, 'Use "Send a test email" below.'); }
  }

  // ---- Texting ----
  if (!sms.on()) add('Texting', 'Twilio', 'warn', 'Not set up. Pros who opt in get email only until it is.', 'Create a Twilio account, register for business texting (10DLC or toll-free verification), then add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID in Vercel.');
  else {
    const a = await sms.checkAccount();
    add('Texting', 'Twilio account', a.ok ? 'ok' : 'bad', a.ok ? 'Connected (' + (a.type || 'account') + ').' + (a.type === 'Trial' ? ' Trial accounts only text verified numbers.' : '') : 'Twilio said: ' + (a.error || a.status), a.ok ? 'Carriers block texts from unregistered senders. Use "Send a test text" below to confirm delivery.' : 'Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel.');
    add('Texting', 'Sender', process.env.TWILIO_MESSAGING_SERVICE_SID ? 'ok' : 'warn', process.env.TWILIO_MESSAGING_SERVICE_SID ? 'Messaging service set.' : 'Sending from ' + process.env.TWILIO_FROM + '.', process.env.TWILIO_MESSAGING_SERVICE_SID ? '' : 'A messaging service is better: it handles STOP replies and carrier registration in one place.');
  }

  // ---- Daily job ----
  if (!memory) add('Daily job', 'Schedule key (CRON_SECRET)', env('CRON_SECRET') ? 'ok' : 'bad', env('CRON_SECRET') ? 'Set.' : 'Missing, so Vercel\'s daily run is turned away. Review reminders, closed-request emails, photo cleanup, and your morning summary won\'t happen.', 'Add CRON_SECRET in Vercel (any long random text), then redeploy.');
  const last = await store.lastEvent('daily_run').catch(() => null);
  add('Daily job', 'Last run', last && Date.now() - new Date(last.created_at).getTime() < 26 * HOUR ? 'ok' : 'warn', last ? 'Ran ' + ago(last.created_at) + '.' : 'Hasn\'t run yet.',
    last && Date.now() - new Date(last.created_at).getTime() < 26 * HOUR ? 'It also keeps a free Supabase project from pausing.' : 'It runs at 6 or 7am New Jersey time once CRON_SECRET is set. You can run it now with "Run daily tasks now".');

  // ---- Pros ----
  const cs = await store.allContractors();
  const live = cs.filter(c => c.status === 'approved' && isReady(c));
  const trades = Object.keys(C.trades).filter(t => Object.keys(C.services).some(k => C.services[k].live && C.services[k].trade === t));
  trades.forEach(t => {
    const counties = new Set(live.filter(c => (c.trades || []).includes(t)).flatMap(c => c.counties || []));
    const waiting = cs.filter(c => (c.trades || []).includes(t) && (c.status === 'pending' || (c.status === 'approved' && !isReady(c)))).length;
    add('Pros', C.trades[t].name, counties.size >= 21 ? 'ok' : counties.size ? 'warn' : 'bad', live.filter(c => (c.trades || []).includes(t)).length + ' live, covering ' + counties.size + ' of 21 counties.' + (waiting ? ' ' + waiting + ' more waiting on approval or setup.' : ''), counties.size >= 21 ? '' : 'See the Recruiting tab for where you\'re thin.');
  });
  const texting = live.filter(c => c.sms_on).length;
  if (live.length) add('Pros', 'Text alerts on', texting ? 'ok' : 'warn', texting + ' of ' + live.length + ' live pros.', texting === live.length ? '' : 'Pros turn this on from their settings page.');

  const bad = out.filter(x => x.state === 'bad').length, warn = out.filter(x => x.state === 'warn').length;
  return { checks: out, bad, warn, ok: out.length - bad - warn, checked_at: new Date().toISOString(), test_to: { email: C.ADMIN_EMAIL || '' } };
}

module.exports = { run };
