// POST { email }: "Email me my link". Sends the private links for that email's recent requests and contractor page.
// The answer is the same whether or not we know the email, so nobody can use this to find out who has used the site.
const C = require('../lib/config');
const store = require('../lib/store');
const mail = require('../lib/mail');
const E = require('../lib/emails');
const { wrap, bad, str, isEmail, deviceHash } = require('../lib/http');

const DONE = { ok: true, message: 'If that email has a request or a contractor account with us, we just sent the links to it. Check your spam folder if you don\'t see it in a few minutes.' };

module.exports = wrap({
  async POST({ body, headers }) {
    if (body.website) return DONE;
    const email = str(body.email, 120).toLowerCase();
    if (!isEmail(email)) throw bad('Enter the email address you used.');
    const device = deviceHash(headers);
    if (process.env.RATE_LIMITS !== 'off') {
      const since = new Date(Date.now() - 3600000).toISOString();
      if (await store.countLinkSends(since, { email }) >= 3) return DONE;
      if (device && await store.countLinkSends(since, { device }) >= 10) throw bad('Too many tries from this connection. Please wait an hour and try again.', 429);
    }
    await store.logLinkSend({ email, device });
    const requests = await store.requestsByEmail(email, new Date(Date.now() - 30 * 864e5).toISOString());
    const c = await store.contractorByEmail(email);
    if (requests.length || c) await mail.send(E.links(email, requests.slice(0, 10), c));
    return DONE;
  }
});
