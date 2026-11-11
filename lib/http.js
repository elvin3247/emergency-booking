const crypto = require('crypto');
const C = require('./config');

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const digits = v => String(v || '').replace(/\D/g, '');
const token = () => crypto.randomBytes(18).toString('base64url');

// Wraps a { GET, POST } map into a Vercel function with JSON errors.
function wrap(handlers) {
  return async (req, res) => {
    try {
      const h = handlers[req.method];
      if (!h) {
        res.setHeader('Allow', Object.keys(handlers).join(', '));
        return res.status(405).json({ error: 'Method not allowed' });
      }
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
      const out = await h({ body, query: req.query || {} });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? 'Something went wrong on our side. Please try again.' : e.message });
    }
  };
}

// Is "now" inside a contractor's chosen alert hours? Uses New Jersey time.
function withinHours(pref, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour').value) % 24;
  const weekend = ['Sat', 'Sun'].includes(parts.find(p => p.type === 'weekday').value);
  if (pref === 'day') return hour >= 7 && hour < 22;
  if (pref === 'weekday') return !weekend && hour >= 7 && hour < 18;
  if (pref === 'nights') return weekend || hour < 7 || hour >= 18;
  return true;
}

// What a contractor can do with an alert right now.
function alertState(alert, request, acceptedCount) {
  if (request.status === 'matched') return alert.outcome === 'chosen' ? 'chosen' : 'filled';
  if (Date.now() - new Date(request.created_at).getTime() > C.OPEN_MS) return 'closed';
  if (alert.response === 'accepted') return 'accepted';
  if (acceptedCount >= C.maxOffers) return 'full';
  return alert.response === 'declined' ? 'declined' : 'open';
}

module.exports = { bad, str, isEmail, digits, token, wrap, withinHours, alertState };
