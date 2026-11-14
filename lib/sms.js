// Text messages through Twilio. Texting stays off until these are set in Vercel:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and a sender: TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM (+1 number).
// US carriers only deliver business texts from a registered sender (10DLC or a verified toll-free number), so register first.
// A failed text never fails the request. Email always goes out too, so a missed text is never a missed job.
const { digits } = require('./http');

const outbox = []; // filled only on a local preview without Twilio (STORE=memory), so tests can read texts
const on = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM));

// US numbers only: 10 digits, or 11 starting with 1.
function e164(v) {
  const d = digits(v);
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

// Twilio error codes that mean "stop texting this number": opted out (21610), not a valid number (21211), not a mobile (21614).
const DEAD = { 21610: 'They replied STOP', 21211: 'Not a valid phone number', 21614: 'Not a mobile number' };

// Returns { ok, sent, error, code, dead } and never throws.
async function send(to, body) {
  const num = e164(to);
  if (!num) return { ok: false, error: 'Not a valid US phone number', dead: DEAD[21211] };
  if (!on()) {
    if (process.env.STORE === 'memory') { outbox.push({ to: num, body }); console.log('[text not sent, Twilio not set up] to ' + num + ': ' + body); }
    return { ok: false, sent: false, error: 'Texting is not set up yet' };
  }
  const form = new URLSearchParams({ To: num, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', process.env.TWILIO_FROM);
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(process.env.TWILIO_ACCOUNT_SID) + '/Messages.json', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    if (r.ok) return { ok: true, sent: true };
    const data = await r.json().catch(() => ({}));
    console.error('Twilio error ' + r.status + ' (' + (data.code || '') + ') for ' + num + ': ' + (data.message || ''));
    return { ok: false, sent: false, code: data.code, error: data.message || 'Twilio error ' + r.status, dead: DEAD[data.code] };
  } catch (e) {
    console.error('Twilio request failed for ' + num + ': ' + e.message);
    return { ok: false, sent: false, error: e.message };
  }
}

// Is the account real and the keys right? Used by the launch checklist.
async function checkAccount() {
  if (!on()) return { ok: false, error: 'Not set up' };
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(process.env.TWILIO_ACCOUNT_SID) + '.json', {
      headers: { Authorization: 'Basic ' + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64') }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.message || 'Twilio said ' + r.status };
    return { ok: data.status === 'active', status: data.status, type: data.type };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { on, send, e164, checkAccount, outbox };
