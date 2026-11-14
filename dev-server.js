// Local preview without Vercel, Supabase, or Resend:  npm run dev  then open http://localhost:3000
// Data lives in memory, contractors are auto-approved, and emails and texts are printed here instead of sent.
// The admin page is at http://localhost:3000/admin with the key "demo". Works the same on Mac, Windows, and Linux.
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    const file = path.join(__dirname, 'api', u.pathname.slice(5).replace(/[^a-z-]/g, '') + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"Not found"}'); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    return require(file)(req, res);
  }
  const rel = path.normalize(u.pathname === '/' ? '/index.html' : u.pathname);
  const file = [path.join(PUB, rel), path.join(PUB, rel + '.html')].find(f => f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(path.join(PUB, '404.html')).pipe(res); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

if (require.main === module) {
  // Local defaults (anything already set in the terminal wins). Set here instead of in package.json so it works on Windows too.
  const defaults = { STORE: 'memory', AUTO_APPROVE: '1', ADMIN_EMAIL: 'admin@example.com', ADMIN_KEY: 'demo' };
  Object.keys(defaults).forEach(k => { if (process.env[k] == null) process.env[k] = defaults[k]; });
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log('Preview running at http://localhost:' + port + (process.env.STORE === 'memory' ? '  (test data only, nothing is saved; admin key: ' + process.env.ADMIN_KEY + ')' : '')));
}
module.exports = server;
