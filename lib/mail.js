// Sends email through Resend. A failed email never fails the request; it is logged instead.
const C = require('./config');
const outbox = []; // filled only when RESEND_API_KEY is missing (local dev and tests)

async function send(msg) {
  if (!msg || !msg.to) return;
  if (!process.env.RESEND_API_KEY) {
    outbox.push(msg);
    const link = (msg.html.match(/href="([^"]+)"/) || [])[1];
    console.log('[email not sent, no RESEND_API_KEY] to ' + msg.to + ': ' + msg.subject + (link ? '\n  link: ' + link : ''));
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: C.FROM_EMAIL, to: [msg.to], subject: msg.subject, html: msg.html })
    });
    if (!r.ok) console.error('Resend error ' + r.status + ' for ' + msg.to + ': ' + (await r.text()));
  } catch (e) {
    console.error('Resend request failed for ' + msg.to + ': ' + e.message);
  }
}

const sendAll = msgs => Promise.all(msgs.map(send));

module.exports = { send, sendAll, outbox };
