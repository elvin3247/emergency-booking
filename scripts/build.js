// Generates the search-friendly pages and stamps shared tags into the hand-written ones.
// Run `npm run build` after changing public/assets/config.js (brand, siteUrl) or scripts/content.js,
// then commit the result. Vercel serves the output as-is; there is no build step on deploy.
const fs = require('fs');
const path = require('path');
const C = require('../public/assets/config.js');
const GUIDES = require('./content.js');
const ZIPS = require('./nj-zips.json'); // { "07059": [countyIndex, "Warren"] }  Source: GeoNames, CC BY 4.0
const PUB = path.join(__dirname, '..', 'public');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = (C.siteUrl || '').replace(/\/$/, '');
const abs = p => (base ? base + p : '');
const slug = county => county.toLowerCase().replace(/ /g, '-') + '-county-nj';
const write = (rel, text) => { const f = path.join(PUB, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const ld = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
const org = () => Object.assign({ '@type': 'Organization', name: C.brand }, base ? { url: base } : {});
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => Object.assign({ '@type': 'ListItem', position: i + 1, name: it[0] }, it[1] && base ? { item: abs(it[1]) } : {})) });
const sitemap = [];

const HEAD = `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#FFC72C">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/styles.css">`;

function seo(m) {
  const title = m.title + ' | ' + C.brand;
  const out = ['<title>' + esc(title) + '</title>'];
  if (m.desc) out.push('<meta name="description" content="' + esc(m.desc) + '">');
  if (m.noindex) out.push('<meta name="robots" content="noindex">');
  else {
    sitemap.push(m.path);
    if (base) out.push('<link rel="canonical" href="' + abs(m.path) + '">');
    out.push('<meta property="og:type" content="website">', '<meta property="og:site_name" content="' + esc(C.brand) + '">', '<meta property="og:title" content="' + esc(m.title) + '">');
    if (m.desc) out.push('<meta property="og:description" content="' + esc(m.desc) + '">');
    if (base) out.push('<meta property="og:url" content="' + abs(m.path) + '">', '<meta property="og:image" content="' + abs('/assets/og.png') + '">');
    out.push('<meta name="twitter:card" content="summary_large_image">');
    (m.ld || []).forEach(o => out.push(ld(o)));
  }
  return out.join('\n');
}

function shell(m, main, opts) {
  opts = opts || {};
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- seo:start -->
${seo(m)}
<!-- seo:end -->
<!-- head:start -->
${HEAD}
<!-- head:end -->
</head>
<body${opts.bodyClass ? ' class="' + opts.bodyClass + '"' : ''}>
<div id="site-header"></div>
<main>
${main}
</main>
${opts.sticky ? '<div class="sticky-cta"><a class="btn" href="#book">Get help now</a></div>\n' : ''}<div id="site-footer"></div>
<script src="/assets/config.js"></script>
<script src="/assets/nj-zips.js"></script>
<script src="/assets/site.js"></script>
</body>
</html>
`;
}

// The booking bar. A plain GET form, so it works even before the scripts load.
function bookBar(o) {
  o = o || {};
  const opt = (v, t, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t || v) + '</option>';
  return `<form class="book" id="book" action="/request" method="get"${o.county ? ' data-county="' + esc(o.county) + '"' : ''}>
        <div><label for="b-problem">What's wrong</label><select id="b-problem" name="p">${Object.keys(C.problems).map(k => opt(k, C.problems[k][0], k === o.problem)).join('')}</select></div>
        <div><label for="b-zip">ZIP code</label><input type="text" id="b-zip" name="zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="postal-code" placeholder="07059" required></div>
        <div><label for="b-timing">How soon</label><select id="b-timing" name="timing">${C.timings.map(t => opt(t)).join('')}</select></div>
        <input type="hidden" name="county" value="${esc(o.county || '')}">
        <button class="btn" type="submit">Find who can come</button>
        <p class="err" id="b-err" role="alert" hidden></p>
        <p class="foot"><b id="b-cov" role="status"></b> Smell gas or hear a CO alarm? Leave the house and call 911 or your gas utility first.</p>
      </form>`;
}

const problemRows = county => Object.keys(C.problems).map(k => {
  const p = C.problems[k], q = '/request?p=' + k + (county ? '&amp;county=' + encodeURIComponent(county) : '');
  return '<div class="r"><a class="main" href="' + q + '"><b>' + esc(p[0]) + '</b><span>' + esc(p[1]) + '</span></a>' + (GUIDES[k] ? '<a class="quick" href="/help/' + k + '">Quick checks</a>' : '') + '<a class="arrow" href="' + q + '" aria-label="Request help: ' + esc(p[0]) + '">&rarr;</a></div>';
}).join('\n        ') + '\n        <div class="r soon"><span class="main"><b>Plumbing, electrical</b><span>Coming later</span></span></div>';

const countyGrid = () => C.counties.map(c => '<a href="/hvac/' + slug(c) + '" data-cov="' + esc(c) + '"><i class="dot"></i>' + esc(c) + '</a>').join('\n        ');
const HOW = `<ol class="how">
        <li><span class="n">1</span><b>Tell us the problem</b><span>What's wrong, your ZIP, and how soon. About a minute.</span></li>
        <li><span class="n">2</span><b>Contractors say yes</b><span>Each one who's free sends an arrival time and visit fee.</span></li>
        <li><span class="n">3</span><b>You choose</b><span>Compare up to ${C.maxOffers}. Only the one you pick gets your name, number, and address.</span></li>
      </ol>`;

// ---- County pages: /hvac/<county>-county-nj ----
const towns = {};
Object.keys(ZIPS).sort().forEach(z => { const c = C.counties[ZIPS[z][0]], p = ZIPS[z][1]; (towns[c] = towns[c] || {}); (towns[c][p] = towns[c][p] || []).push(z); });

C.counties.forEach(county => {
  const p = '/hvac/' + slug(county), list = towns[county] || {}, names = Object.keys(list).sort();
  const m = {
    path: p,
    title: 'Emergency HVAC Repair in ' + county + ' County, NJ: See Who Can Come',
    desc: 'No heat or no AC in ' + county + ' County? Licensed New Jersey HVAC contractors who are free reply with an arrival time and visit fee. Free for homeowners, open 24/7.',
    ld: [
      { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Emergency HVAC repair', name: 'Emergency HVAC repair in ' + county + ' County, NJ', provider: org(), areaServed: { '@type': 'AdministrativeArea', name: county + ' County, New Jersey' } },
      crumbsLd([['Home', '/'], ['Service areas', '/hvac'], [county + ' County']])
    ]
  };
  write('hvac/' + slug(county) + '.html', shell(m, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/hvac">Service areas</a> / ${esc(county)} County</nav>
      <h1>Emergency HVAC repair in ${esc(county)} County, NJ</h1>
      <p class="lede">No heat or no cooling? Tell us what's wrong. Licensed contractors who cover ${esc(county)} County and are free reply with an arrival time and visit fee. You pick one.</p>
      ${bookBar({ county })}
    </div>
  </section>
  <section class="sec">
    <div class="wrap two">
      <div class="stack">
        <h2>Contractors in ${esc(county)} County</h2>
        <div class="stack" data-county-pros="${esc(county)}"><p class="sub">Checking who's signed up...</p></div>
        <p class="sub">Run an HVAC company in ${esc(county)} County? <a href="/contractors">Apply to get emergency requests here.</a></p>
      </div>
      <div class="stack">
        <h2>Towns we cover</h2>
        <p class="sub">Every ${esc(county)} County ZIP code can send a request.</p>
        <ul class="towns">${names.map(n => '<li>' + esc(n) + ' <span>' + list[n].join(', ') + '</span></li>').join('')}</ul>
      </div>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>What's wrong?</h2>
      <div class="rows">
        ${problemRows(county)}
      </div>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>How it works</h2>
      ${HOW}
      <p class="sub" style="margin-top:20px">No one free within ${C.windowMin} minutes? We say so and show contractors you can call directly.</p>
    </div>
  </section>`, { bodyClass: 'home', sticky: true }));
});

// ---- Service areas index: /hvac ----
write('hvac.html', shell({
  path: '/hvac', title: 'Emergency HVAC Repair by County in New Jersey',
  desc: 'See where licensed HVAC contractors are taking emergency requests right now, in all 21 New Jersey counties.',
  ld: [crumbsLd([['Home', '/'], ['Service areas']])]
}, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Service areas</nav>
      <h1>Emergency HVAC repair across New Jersey</h1>
      <p class="lede">We're adding licensed contractors county by county. This page shows who's on call right now.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <div class="legend" id="legend" hidden><span><i class="dot now"></i>On call now</span><span><i class="dot later"></i>Signed up, off hours now</span><span><i class="dot"></i>Recruiting, you can still ask</span></div>
      <div class="counties">
        ${countyGrid()}
      </div>
      <p class="sub" style="margin-top:20px">Don't see your county lit up? <a href="/request">Send a request anyway</a> and we'll tell you right away what we can do.</p>
    </div>
  </section>`));

// ---- Troubleshooting guides: /help/<problem> ----
const li = arr => arr.map(x => '<li>' + esc(x) + '</li>').join('');
Object.keys(GUIDES).forEach(k => {
  const g = GUIDES[k], p = '/help/' + k;
  const others = Object.keys(GUIDES).filter(x => x !== k).map(x => '<a href="/help/' + x + '">' + esc(C.problems[x][0]) + '</a>').join(' · ');
  write('help/' + k + '.html', shell({
    path: p, title: g.title.replace(/\b[a-z]/g, (c, i) => (i === 0 ? c.toUpperCase() : c)), desc: g.desc,
    ld: [
      Object.assign({ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, author: org(), publisher: org() }, base ? { mainEntityOfPage: abs(p) } : {}),
      crumbsLd([['Home', '/'], ['Quick checks', '/help'], [C.problems[k][0]]])
    ]
  }, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/help">Quick checks</a> / ${esc(C.problems[k][0])}</nav>
      <h1>${esc(g.h1)}</h1>
      <p class="lede">${esc(g.intro)}</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap guide">
      <div class="notice crit"><b>Smell gas, or is a carbon monoxide alarm sounding?</b> Skip this page. Leave the house, then call 911 or your gas utility's emergency line from outside.</div>
      <ol class="checks">
        ${g.checks.map(c => '<li><b>' + esc(c[0]) + '</b><p>' + esc(c[1]) + '</p></li>').join('\n        ')}
      </ol>
      <div class="two">
        <div class="card"><h3>Stop and call a pro if</h3><ul class="plain">${li(g.stop)}</ul></div>
        <div class="card"><h3>While you wait</h3><ul class="plain">${li(g.meanwhile)}</ul></div>
      </div>
      <p class="small sub">These are general checks, not a diagnosis. If anything seems unsafe, stop and call a licensed contractor.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>Still not working? See who can come.</h2>
      <p class="lede" style="margin-bottom:8px">Licensed New Jersey contractors who are free reply with an arrival time and visit fee. Free for homeowners.</p>
      ${bookBar({ problem: k }).replace('class="book"', 'class="book solo"')}
      <p class="sub" style="margin-top:24px">Other quick checks: ${others}</p>
    </div>
  </section>`, { bodyClass: 'home', sticky: true }));
});

write('help.html', shell({
  path: '/help', title: 'HVAC Quick Checks: What to Try Before You Call',
  desc: 'Safe, tool-free checks for no heat, no cooling, leaks, strange noises, and dead thermostats, plus when to stop and call a licensed contractor.',
  ld: [crumbsLd([['Home', '/'], ['Quick checks']])]
}, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Quick checks</nav>
      <h1>Quick checks before you call</h1>
      <p class="lede">A dead battery or a tripped breaker shouldn't cost you a visit fee. Pick your problem for safe checks that need no tools.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <div class="rows">
        ${Object.keys(GUIDES).map(k => '<div class="r"><a class="main" href="/help/' + k + '"><b>' + esc(C.problems[k][0]) + '</b><span>' + esc(GUIDES[k].checks.length + ' checks · ' + C.problems[k][1]) + '</span></a><a class="arrow" href="/help/' + k + '" aria-label="' + esc(C.problems[k][0]) + ' checks">&rarr;</a></div>').join('\n        ')}
      </div>
    </div>
  </section>`));

// ---- Hand-written pages: stamp the shared head, brand, and home page blocks ----
const PAGES = {
  'index.html': { path: '/', title: 'Emergency HVAC Repair in New Jersey, 24/7: See Who Can Come', desc: 'No heat or no AC? Tell us what\'s wrong and licensed New Jersey HVAC contractors who are free reply with an arrival time and visit fee. You choose. Free for homeowners.' },
  'contractors.html': { path: '/contractors', title: 'Emergency HVAC Leads in New Jersey: Pay Only When Chosen', desc: 'Get emergency HVAC requests in the New Jersey counties and hours you choose. First ' + C.freeLeads + ' chosen leads free, then $' + C.leadFee + ' only when a customer picks you. No monthly fee.' },
  'request.html': { path: '/request', title: 'Request Emergency HVAC Help in New Jersey', desc: 'Tell us what\'s wrong and we\'ll alert licensed New Jersey HVAC contractors who can come. Takes about a minute.' },
  'status.html': { title: 'Your request', noindex: true },
  'respond.html': { title: 'Job request', noindex: true },
  'terms.html': { title: 'Terms', noindex: true },
  'privacy.html': { title: 'Privacy policy', noindex: true },
  'pro.html': { title: 'Your contractor settings', noindex: true },
  '404.html': { title: 'Page not found', noindex: true }
};
const block = (html, name, inner) => {
  const re = new RegExp('(<!-- ' + name + ':start -->)[\\s\\S]*?(<!-- ' + name + ':end -->)');
  if (!re.test(html)) throw new Error('Missing ' + name + ' markers');
  return html.replace(re, (_, a, b) => a + '\n' + inner + '\n' + b);
};
Object.keys(PAGES).forEach(file => {
  const f = path.join(PUB, file);
  let html = fs.readFileSync(f, 'utf8').replace(/(<span data-brand>)[^<]*(<\/span>)/g, '$1' + esc(C.brand) + '$2');
  const m = PAGES[file];
  if (file === 'index.html') {
    html = block(html, 'book', '      ' + bookBar());
    html = block(html, 'rows', '        ' + problemRows());
    html = block(html, 'counties', '        ' + countyGrid());
    html = block(html, 'how', '      ' + HOW);
    const faq = [];
    html.replace(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g, (_, q, a) => { faq.push({ '@type': 'Question', name: q.replace(/<[^>]+>/g, '').trim(), acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '').trim() } }); });
    m.ld = [
      Object.assign({ '@context': 'https://schema.org' }, org()),
      { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Emergency HVAC repair', name: 'Emergency heating and cooling repair', provider: org(), areaServed: { '@type': 'State', name: 'New Jersey' }, hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' } },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }
    ];
  }
  html = block(html, 'seo', seo(m));
  html = block(html, 'head', HEAD);
  fs.writeFileSync(f, html);
});

// ---- ZIP lookup for the browser, robots.txt, sitemap.xml ----
write('assets/nj-zips.js', '// New Jersey ZIP codes: [county index in SITE.counties, place name]. Data from GeoNames (geonames.org), CC BY 4.0.\nwindow.NJ_ZIPS=' + JSON.stringify(ZIPS) + ';\n');
write('robots.txt', 'User-agent: *\nDisallow: /api/\nDisallow: /status\nDisallow: /respond\nDisallow: /pro\n' + (base ? 'Sitemap: ' + abs('/sitemap.xml') + '\n' : ''));
if (base) write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemap.sort().map(p => '  <url><loc>' + abs(p) + '</loc></url>').join('\n') + '\n</urlset>\n');
else if (fs.existsSync(path.join(PUB, 'sitemap.xml'))) fs.unlinkSync(path.join(PUB, 'sitemap.xml'));

console.log('Built ' + sitemap.length + ' indexable pages for "' + C.brand + '"' + (base ? ' at ' + base : ' (no siteUrl set, so no sitemap or canonical links yet)') + '.');
