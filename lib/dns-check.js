// Looks up the public DNS records that decide whether your emails reach inboxes or spam folders.
// Resend sends as your domain using three records: DKIM (a signature), SPF (who may send), and DMARC (what to do with fakes).
// Gmail and Yahoo increasingly reject or spam-folder mail from domains without them.
const dns = require('dns').promises;

const FREE = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com'];
const domainOf = from => ((String(from || '').match(/@([^>\s]+)/) || [])[1] || '').toLowerCase().replace(/\.$/, '');
// example.com for mail.example.com (good enough for .com, .net, .org style domains)
const parentOf = d => d.split('.').slice(-2).join('.');

// TXT values at a name: [] when there are none, null when the lookup itself failed (so we don't call a record missing when DNS was just slow).
async function txt(name, resolve) {
  try { return (await resolve(name)).map(parts => [].concat(parts).join('')); }
  catch (e) { return ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(e.code) ? [] : null; }
}

// Returns [{ label, state: 'ok' | 'warn' | 'bad', detail, fix }]
async function check(from, adminEmail, resolve = n => dns.resolveTxt(n)) {
  const d = domainOf(from), out = [], add = (label, state, detail, fix) => out.push({ label, state, detail, fix: fix || '' });
  if (!d) return out;
  if (FREE.includes(d)) {
    add('Sender domain', 'bad', 'FROM_EMAIL uses ' + d + '. Mail sent through Resend from a free mailbox address fails the checks inboxes run, so it is rejected or lands in spam.', 'Use an address at your own domain, like alerts@yourdomain.com, and verify that domain in Resend.');
    return out;
  }
  const [dkim, spf, dmarcHere, dmarcParent] = await Promise.all([txt('resend._domainkey.' + d, resolve), txt('send.' + d, resolve), txt('_dmarc.' + d, resolve), parentOf(d) !== d ? txt('_dmarc.' + parentOf(d), resolve) : Promise.resolve([])]);
  const unsure = 'The lookup did not answer. Use "Check again" in a minute.';

  if (dkim == null) add('DKIM signature', 'warn', unsure);
  else if (dkim.some(v => /p=[A-Za-z0-9+/]{20,}/.test(v))) add('DKIM signature', 'ok', 'Found at resend._domainkey.' + d + '. Inboxes can confirm your emails really come from you.');
  else add('DKIM signature', 'bad', 'No DKIM record at resend._domainkey.' + d + '. Without it, job alerts are likely to land in spam.', 'In Resend, open Domains, pick ' + d + ', and copy the record named "resend._domainkey" into your domain host\'s DNS settings.');

  if (spf == null) add('SPF record', 'warn', unsure);
  else if (spf.some(v => /^v=spf1\b/i.test(v))) add('SPF record', 'ok', 'Found at send.' + d + '.');
  else add('SPF record', 'bad', 'No SPF record at send.' + d + '.', 'In Resend, open Domains, pick ' + d + ', and copy the TXT and MX records named "send" into your DNS settings. (If you set a custom return path in Resend, the name is different and this check can be ignored once Resend shows the domain as verified.)');

  const dmarc = dmarcHere && dmarcHere.some(v => /^v=DMARC1/i.test(v)) ? dmarcHere : dmarcParent;
  if (dmarcHere == null || dmarc == null) add('DMARC policy', 'warn', unsure);
  else {
    const rec = dmarc.find(v => /^v=DMARC1/i.test(v));
    if (rec) add('DMARC policy', 'ok', 'Found: ' + rec.slice(0, 90) + (/p=none/i.test(rec) ? '. "p=none" only monitors, which is the right way to start.' : '.'));
    else add('DMARC policy', 'bad', 'No DMARC record for ' + d + '. Gmail and Yahoo treat mail from domains without one as less trustworthy.',
      'Add one TXT record at your domain host. Name: _dmarc' + (parentOf(d) !== d ? '.' + d.split('.').slice(0, -2).join('.') : '') + '   Value: v=DMARC1; p=none;' + (adminEmail ? ' rua=mailto:' + adminEmail : ''));
  }
  return out;
}

module.exports = { check, domainOf };
