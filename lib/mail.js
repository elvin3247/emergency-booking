// Sends email through Resend, and the matching text message when the message has one (see lib/sms.js).
// A failed email or text never fails the request; it is logged instead.
// send() returns { ok, error } so the launch checklist can show what happened.
const C = require('./config');
const sms = require('./sms');
const outbox = []; // filled only when RESEND_API_KEY is missing (local dev and tests)

// A pro message can carry `text` (the SMS) and `textTo` (their mobile). If the number is dead (they replied STOP,
// or it isn't a mobile), texts are switched off for that contractor so we stop trying.
async function text(msg) {
  if (!msg.text || !msg.textTo) return;
  const r = await sms.send(msg.textTo, msg.text);
  if (r.dead && msg.textFor) {
    try { await require('./store').updateContractor(msg.textFor, { sms_on: false, sms_off_reason: r.dead }); } catch (e) { console.error('Could not switch off texts for ' + msg.textFor + ': ' + e.message); }
  }
}

const payload = msg => Object.assign({ from: C.FROM_EMAIL, to: [msg.to], subject: msg.subject, html: msg.html }, msg.cc && msg.cc.length ? { cc: msg.cc } : {}, msg.headers ? { headers: msg.headers } : {});
const logOnly = msg => {
  outbox.push(msg);
  const link = (msg.html.match(/href="([^"]+)"/) || [])[1];
  console.log('[email not sent, no RESEND_API_KEY] to ' + msg.to + (msg.cc && msg.cc.length ? ' (cc ' + msg.cc.join(', ') + ')' : '') + ': ' + msg.subject + (link ? '\n  link: ' + link : ''));
};

async function sendEmail(msg) {
  if (!process.env.RESEND_API_KEY) { logOnly(msg); return { ok: true, logged: true }; }
  if (!C.FROM_EMAIL) { console.error('FROM_EMAIL is not set in Vercel, so no email can be sent. Email to ' + msg.to + ' was dropped: ' + msg.subject); return { ok: false, error: 'FROM_EMAIL is not set in Vercel' }; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(msg))
    });
    if (r.ok) return { ok: true };
    const t = await r.text();
    console.error('Resend error ' + r.status + ' for ' + msg.to + ': ' + t);
    let m = t; try { m = JSON.parse(t).message || t; } catch (e) {}
    return { ok: false, error: 'Resend said: ' + m };
  } catch (e) {
    console.error('Resend request failed for ' + msg.to + ': ' + e.message);
    return { ok: false, error: e.message };
  }
}

async function send(msg) {
  if (!msg || !msg.to) { if (msg) await text(msg); return { ok: false, error: 'No email address' }; }
  const [out] = await Promise.all([sendEmail(msg), text(msg)]);
  return out;
}

const sendAll = msgs => Promise.all(msgs.map(send));

// Many emails at once (recruiting invites). Resend takes up to 100 per call, which also stays under its rate limit.
// Returns how many went out.
async function sendBatch(msgs) {
  msgs = msgs.filter(m => m && m.to);
  if (!process.env.RESEND_API_KEY) { msgs.forEach(logOnly); return { ok: true, sent: msgs.length }; }
  if (!C.FROM_EMAIL) return { ok: false, sent: 0, error: 'FROM_EMAIL is not set in Vercel' };
  let sent = 0;
  for (let i = 0; i < msgs.length; i += 100) {
    const part = msgs.slice(i, i + 100);
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(part.map(payload))
      });
      if (!r.ok) { const t = await r.text(); console.error('Resend batch error ' + r.status + ': ' + t); return { ok: false, sent, error: 'Resend said ' + r.status + ': ' + t.slice(0, 200) }; }
      sent += part.length;
    } catch (e) { return { ok: false, sent, error: e.message }; }
  }
  return { ok: true, sent };
}

module.exports = { send, sendAll, sendBatch, outbox };
