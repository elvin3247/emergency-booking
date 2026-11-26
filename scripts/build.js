// Generates the search-friendly pages and stamps shared tags into the hand-written ones.
// Run `npm run build` after changing public/assets/config.js (brand, siteUrl) or scripts/content.js,
// then commit the result. Vercel serves the output as-is; there is no build step on deploy.
const fs = require('fs');
const path = require('path');
const C = require('../public/assets/config.js');
const GUIDES = require('./content.js');
const TRIAGE = require('./triage.js');
const GEO = require('../public/assets/geo.js'); // { states: { NJ: 'New Jersey' }, counties: { NJ: ['Atlantic County', ...] } }
const PUB = path.join(__dirname, '..', 'public');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Your live address: siteUrl in config.js, or SITE_URL when Vercel runs the build. Without one there is no sitemap or canonical links.
const base = (C.siteUrl || process.env.SITE_URL || '').replace(/\/$/, '');
const abs = p => (base ? base + p : '');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const write = (rel, text) => { const f = path.join(PUB, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const ld = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
const org = () => Object.assign({ '@type': 'Organization', name: C.brand }, base ? { url: base } : {});
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => Object.assign({ '@type': 'ListItem', position: i + 1, name: it[0] }, it[1] && base ? { item: abs(it[1]) } : {})) });
const sitemap = [];

const HEAD = `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#E9EDF1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/styles.css">`;

// Services and trades that are switched on in config.js.
const SERVICES = Object.keys(C.services);
const LIVE = SERVICES.filter(k => C.services[k].live);
const LIVE_TRADES = Object.keys(C.trades).filter(t => LIVE.some(k => C.services[k].trade === t));
const servicesOf = trade => SERVICES.filter(k => C.services[k].trade === trade);
const problemsOf = service => Object.keys(C.problems).filter(k => C.problems[k][2].includes(service));
const icon = k => '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + C.icons[k] + '</svg></span>';
const list = arr => (arr.length < 3 ? arr.join(' and ') : arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1]);
const LIVE_NAMES = list(LIVE.map(k => C.services[k].name.toLowerCase()));
// Search wording for each trade's county pages.
const COPY = {
  hvac: { what: 'HVAC repair', h1: 'Emergency HVAC repair', ask: 'No heat or no cooling?', who: 'HVAC company' },
  plumbing: { what: 'plumber', h1: 'Emergency plumber', ask: 'Burst pipe, backed-up drain, or no hot water?', who: 'plumbing company' },
  electrical: { what: 'electrician', h1: 'Emergency electrician', ask: 'Lost power in part of the house, or a breaker that keeps tripping?', who: 'electrical company' },
  appliance: { what: 'appliance repair', h1: 'Emergency appliance repair', ask: 'Fridge, washer, dryer, or oven quit?', who: 'appliance repair company' }
};
const cap = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());

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
<script src="/assets/site.js"></script>
</body>
</html>
`;
}

// The booking card: service chips, the problem, and a ZIP code. A plain GET form, so it works even before the scripts load.
function bookBar(o) {
  o = o || {};
  const first = o.service || LIVE[0];
  const chips = SERVICES.map(k => {
    const s = C.services[k];
    if (o.liveOnly && !s.live) return '';
    return '<label class="chip" for="b-s-' + k + '"><input type="radio" id="b-s-' + k + '" name="s" value="' + k + '"' + (s.live ? (k === first ? ' checked' : '') : ' disabled') + '><span>' + esc(s.name) + (s.live ? '' : '<em>Soon</em>') + '</span></label>';
  }).filter(Boolean).join('\n          ');
  const groups = LIVE.map(k => '<optgroup label="' + esc(C.services[k].name) + '">' + problemsOf(k).map(p => '<option value="' + p + '"' + (p === o.problem && k === first ? ' selected' : '') + '>' + esc(C.problems[p][0]) + '</option>').join('') + '</optgroup>').join('');
  return `<form class="book" id="book" action="/request" method="get" novalidate${o.county ? ' data-county="' + esc(o.county) + '"' : ''}${o.service ? ' data-service="' + o.service + '"' : ''}${o.problem ? ' data-problem' : ''}>
        <fieldset class="svc"><legend>What kind of help do you need?</legend>
          ${chips}
        </fieldset>
        <div class="bar">
          <div><label for="b-problem">What's wrong</label><select id="b-problem" name="p">${groups}</select></div>
          <div class="z"><label for="b-zip">ZIP code</label><input type="text" id="b-zip" name="zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="postal-code" placeholder="5 digits" required></div>
          <input type="hidden" name="county" value="${esc(o.county || '')}">
          <button class="btn" type="submit">Find who can come</button>
        </div>
        <p class="err" id="b-err" role="alert" hidden></p>
        <p class="foot"><b id="b-cov" role="status"></b>Free for homeowners. Smell gas, see sparks, or hear a CO alarm? Leave the house and call 911 first.</p>
      </form>`;
}

// "Where in the house?" on the home page: a cutaway drawing with a pin for each problem, plus the same problems as a plain list (what search engines read).
// PINS: problem -> [x, y of the thing in the drawing, x, y of the pin]. A problem with no pin still shows in the list.
const PINS = {
  leak: [376, 117, 410, 124], toilet: [135, 214, 166, 190], 'burst-pipe': [262, 262, 300, 236], thermostat: [402, 317, 436, 298], clog: [184, 334, 198, 302],
  'no-heat': [110, 430, 58, 430], noise: [204, 396, 238, 402], 'no-hot-water': [306, 420, 338, 400], 'wh-leak': [320, 494, 356, 470], sump: [420, 456, 420, 420], 'no-cooling': [547, 336, 547, 306],
  // Electrical and appliances: drawn now, pinned once those services are switched on.
  breaker: [296, 306, 320, 298], 'power-out': [370, 290, 354, 318], outlet: [322, 251, 336, 216],
  fridge: [96, 336, 58, 336], kitchen: [214, 360, 234, 322], laundry: [215, 458, 215, 427]
};
const HOUSE_ART = `<rect x="0" y="380" width="600" height="140" fill="url(#soil)" class="soil"/><line x1="0" y1="380" x2="600" y2="380" class="ground"/>
<rect x="392" y="52" width="26" height="60" class="chim"/><polygon points="66,150 280,34 494,150" class="roof"/><circle cx="160" cy="128" r="10" class="win"/>
<rect x="90" y="150" width="380" height="350" class="shell"/><line x1="90" y1="270" x2="470" y2="270" class="floor"/><line x1="90" y1="380" x2="470" y2="380" class="floor"/>
<line x1="250" y1="150" x2="250" y2="380" class="wall"/>
<rect x="300" y="100" width="76" height="34" rx="3" class="eq hv"/><line x1="300" y1="117" x2="200" y2="117" class="duct"/><line x1="200" y1="117" x2="200" y2="150" class="duct"/><path d="M332 136 q-3 6 0 9 q3 -3 0 -9z" class="drop"/>
<rect x="112" y="226" width="30" height="34" rx="4" class="fx"/><rect x="108" y="214" width="38" height="14" rx="3" class="fx"/><rect x="176" y="236" width="62" height="24" rx="10" class="fx"/>
<rect x="350" y="232" width="96" height="28" rx="4" class="fx soft"/><rect x="350" y="220" width="22" height="14" rx="3" class="fx soft"/>
<line x1="262" y1="500" x2="262" y2="190" class="pipe"/><line x1="262" y1="190" x2="230" y2="190" class="pipe"/><path d="M262 262 l-12 -8 M262 262 l-14 2 M262 262 l-10 10 M262 262 l12 -8 M262 262 l14 2" class="spray"/><ellipse cx="300" cy="273" rx="26" ry="4" class="stain"/>
<rect x="134" y="338" width="102" height="42" class="fx soft"/><rect x="146" y="332" width="44" height="8" rx="2" class="fx"/><path d="M168 324 v-14 h10" class="pipe thin"/>
<rect x="96" y="292" width="34" height="88" rx="3" class="eq ap"/><line x1="96" y1="322" x2="130" y2="322" class="wall"/><line x1="124" y1="300" x2="124" y2="314" class="wall"/>
<rect x="198" y="346" width="32" height="28" rx="2" class="fx"/><line x1="203" y1="352" x2="225" y2="352" class="wall"/>
<rect x="272" y="290" width="24" height="34" rx="2" class="eq el"/><line x1="278" y1="298" x2="290" y2="298" class="wall"/><line x1="278" y1="306" x2="290" y2="306" class="wall"/><line x1="278" y1="314" x2="290" y2="314" class="wall"/>
<line x1="370" y1="272" x2="370" y2="282" class="wall"/><circle cx="370" cy="288" r="6" class="bulb"/>
<rect x="317" y="244" width="10" height="14" rx="2" class="fx"/>
<rect x="386" y="306" width="16" height="22" rx="3" class="fx hv"/><rect x="300" y="350" width="120" height="30" rx="8" class="fx soft"/>
<rect x="110" y="404" width="64" height="86" rx="4" class="eq hv"/><rect x="122" y="452" width="40" height="18" rx="2" class="flame"/><path d="M186 396 q6 -6 12 0 q6 6 12 0" class="noise"/>
<rect x="192" y="444" width="46" height="46" rx="3" class="eq ap"/><circle cx="215" cy="468" r="12" class="fan"/>
<rect x="262" y="408" width="48" height="84" rx="20" class="eq wh"/><ellipse cx="300" cy="494" rx="34" ry="5" class="puddle"/>
<rect x="392" y="456" width="56" height="44" class="pit"/><rect x="408" y="462" width="24" height="26" rx="3" class="eq pl"/>
<rect x="508" y="336" width="78" height="44" rx="4" class="eq cl"/><circle cx="547" cy="358" r="14" class="fan"/>`;
// Service pages beyond the trade pages: water heaters get their own county pages, since people search for them on their own.
// Each one uses its trade's pros (water heaters: plumbers) for live coverage.
const SVC_PAGES = {
  'water-heater': { slug: 'water-heater', name: 'Water heaters', h1: 'Emergency water heater repair', what: 'water heater repair', ask: 'No hot water, or a leaking tank?', pros: 'water heater pros', who: 'plumbing or water heater company' }
};
const LIVE_SVC_PAGES = Object.keys(SVC_PAGES).filter(k => C.services[k] && C.services[k].live);
// Where a group of problems lists its pros by county: its own service pages if it has them, otherwise its trade's.
const hubFor = k => LIVE_SVC_PAGES.includes(k) ? ['/' + SVC_PAGES[k].slug, SVC_PAGES[k].name + ' by state'] : C.services[k].trade === 'hvac' ? ['/hvac', 'HVAC pros by state'] : ['/' + C.trades[C.services[k].trade].slug, cap(C.trades[C.services[k].trade].pros) + ' by state'];

// Live problems, grouped the way homeowners think: heating and cooling together, every other service on its own.
function problemGroups() {
  const groups = [], order = Object.keys(C.problems);
  SERVICES.filter(k => C.services[k].live).forEach(k => {
    const t = C.services[k].trade, name = t === 'hvac' ? 'Heating and cooling' : C.services[k].name;
    let g = groups.find(x => x.name === name);
    if (!g) { const hub = hubFor(k); groups.push(g = { name, k, hub: hub[0], hubText: hub[1], probs: [] }); }
    order.forEach(p => { if (p !== 'other' && C.problems[p][2][0] === k && !g.probs.includes(p)) g.probs.push(p); });
  });
  groups.forEach(g => g.probs.sort((a, z) => order.indexOf(a) - order.indexOf(z)));
  return groups;
}
const probHref = p => '/request?s=' + C.problems[p][2][0] + '&amp;p=' + p;
// The cutaway drawing. pinHref decides where a pin goes: the request form on the home page, the problem's section on the guide.
function houseSvg(probs, pinHref, id) {
  const pins = probs.filter(p => PINS[p]).map(p => {
    const [ox, oy, x, y] = PINS[p];
    return '<a href="' + pinHref(p) + '" class="pin t-' + C.problems[p][2][0] + '" data-k="' + p + '" data-x="' + x + '" data-y="' + y + '" aria-label="' + esc(C.problems[p][0]) + '"><line x1="' + ox + '" y1="' + oy + '" x2="' + x + '" y2="' + y + '" class="lead"/><circle cx="' + ox + '" cy="' + oy + '" r="3" class="anchor"/><circle cx="' + x + '" cy="' + y + '" r="22" class="hit"/><circle cx="' + x + '" cy="' + y + '" r="11" class="ring"/><circle cx="' + x + '" cy="' + y + '" r="4" class="dot"/></a>';
  }).join('');
  return `<svg class="house" viewBox="0 0 600 520" role="img" aria-labelledby="${id}-t"><title id="${id}-t">Cutaway of a house showing where each problem happens</title><defs><pattern id="${id}-soil" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" class="hatch"/></pattern></defs>
${HOUSE_ART.replace('url(#soil)', 'url(#' + id + '-soil)')}
${pins}</svg>
          <p class="flag" aria-hidden="true"></p>
          <p class="tip">Hover or tap a spot to see the problem.</p>`;
}
const houseSection = () => {
  const groups = problemGroups();
  const rows = groups.map(g => '<div class="hg t-' + g.k + '"><h3>' + esc(g.name) + '</h3><ul>' +
    g.probs.map(p => '<li><a href="' + probHref(p) + '" data-k="' + p + '"><b>' + esc(C.problems[p][0]) + '</b><span>' + esc(C.problems[p][1]) + '</span></a></li>').join('') +
    '</ul><a class="hub" href="' + g.hub + '">' + esc(g.hubText) + '</a></div>').join('\n          ');
  const soon = SERVICES.filter(k => !C.services[k].live).map(k => C.services[k].name.toLowerCase());
  return `<div class="hx" data-house>
        <div class="hx-text">
          <h2>Where in the house?</h2>
          <p class="sub">Point to the trouble. Every spot is a problem our pros fix, and each one opens a request with it filled in.</p>
          <div class="hlist">
          ${rows}
          </div>
          <p class="soon">${soon.length ? esc(list(soon).replace(/^./, c => c.toUpperCase())) + ' ' + (soon.length > 1 ? 'are' : 'is') + ' coming soon. ' : ''}Not sure how urgent it is? <a href="/whats-wrong">See what to do first for each problem</a>.</p>
        </div>
        <div class="hx-art">
          ${houseSvg(groups.flatMap(g => g.probs), probHref, 'hs')}
        </div>
      </div>`;
};

const problemRows = (trade, county) => servicesOf(trade).filter(k => C.services[k].live).map(k => problemsOf(k).filter(p => p !== 'other' && C.problems[p][2][0] === k).map(p => {
  const P = C.problems[p], q = '/request?s=' + k + '&amp;p=' + p + (county ? '&amp;county=' + encodeURIComponent(county) : '');
  return '<div class="r"><a class="main" href="' + q + '"><b>' + esc(P[0]) + '</b><span>' + esc(P[1]) + '</span></a>' + (GUIDES[p] ? '<a class="quick" href="/help/' + p + '">Quick checks</a>' : '') + '<a class="arrow" href="' + q + '" aria-label="Request help: ' + esc(P[0]) + '">&rarr;</a></div>';
}).join('\n        ')).join('\n        ');

const HOW = `<ol class="how">
        <li><span class="n">1</span><b>Pick the service and your ZIP</b><span>Tell us what's wrong. It takes about a minute.</span></li>
        <li><span class="n">2</span><b>Nearby pros say yes</b><span>Each one who's free sends an arrival time and visit fee.</span></li>
        <li><span class="n">3</span><b>You choose one</b><span>Compare up to ${C.maxOffers}. Only the one you pick gets your name, number, and address.</span></li>
      </ol>`;
// The home page version of "How it works": three steps, each with a small picture. Companies are made up.
const STORY = `<ol class="story">
        <li><div class="pic" aria-hidden="true"><div class="mini-tk"><div class="mt-row"><small>What's wrong</small>No heat</div><div class="mt-row"><small>ZIP code</small>07059</div></div></div>
          <span class="n">1</span><h3>Tell us what broke</h3><p>Pick the problem and your ZIP. It takes about a minute, and you don't sign up.</p></li>
        <li><div class="pic" aria-hidden="true"><div class="mini-of"><span class="t">45 min</span><span><b>Example Plumbing Co.</b><small>$95 visit, license on file</small></span></div><div class="mini-of"><span class="t">90 min</span><span><b>Sample Pipe and Drain</b><small>$79 visit, license on file</small></span></div></div>
          <span class="n">2</span><h3>Free pros say yes</h3><p>Licensed pros in your county who can come send an arrival time and a visit fee. Up to ${C.maxOffers} offers.</p></li>
        <li><div class="pic" aria-hidden="true"><div class="mini-of picked"><span class="t">45 min</span><span><b>Example Plumbing Co.</b><small>Calling you now</small></span><em class="mini-stamp">Booked</em></div></div>
          <span class="n">3</span><h3>You choose one</h3><p>Only the pro you pick gets your name, number, and address. They call to confirm.</p></li>
      </ol>`;
const PRO_TERMS = () => '<ul class="terms">' + (C.freeLaunch ? '<li>Free during our launch, no lead fees</li>' : '<li>First ' + C.freeLeads + ' chosen leads free, then $' + C.leadFee + ' only when a customer picks you</li>') + '<li>No monthly fee or contract</li><li>Only you get the customer\'s details</li></ul>';
const LEGEND = '<div class="legend" id="legend" hidden><span><i class="dot now"></i>On call now</span><span><i class="dot later"></i>Signed up, off hours now</span><span><i class="dot"></i>Recruiting, you can still ask</span></div>';

// ---- Location pages: one index per service (/hvac, /plumbing, /water-heater) and one page per state (/plumbing/texas) ----
// Each state page lists every county in the state in a searchable finder. Typing a ZIP or tapping a county shows who is
// signed up there, on the same page, so there's no separate page per county (3,100 near-identical pages would hurt in search).
const stateSlug = st => slug(GEO.states[st]);
const STATES = Object.keys(GEO.states).sort((a, b) => GEO.states[a].localeCompare(GEO.states[b]));
const stateGrid = (root, trade, follow) => '<div class="states"' + (trade ? ' data-trade="' + trade + '"' : '') + '>\n        ' + STATES.map(st => '<a href="' + root + '/' + stateSlug(st) + '" data-state="' + st + '"' + (follow ? ' data-follow="' + stateSlug(st) + '"' : '') + '><i class="dot"></i><b>' + esc(GEO.states[st]) + '</b><span class="n"></span></a>').join('\n        ') + '\n      </div>';
// What the old county pages were called, so links to them still land somewhere useful.
const REDIRECTS = [];
function locationPages(o) {
  // o: { slug, name, h1, ask, what, who, pros, trade, service, rows(county), extra }
  const root = '/' + o.slug, T = C.trades[o.trade];
  fs.rmSync(path.join(PUB, o.slug), { recursive: true, force: true });
  REDIRECTS.push({ source: root + '/:county(.+)-county-nj', destination: root + '/new-jersey#:county-county', permanent: true });
  STATES.forEach(st => {
    const name = GEO.states[st], list = GEO.counties[st], p = root + '/' + stateSlug(st);
    const others = [].concat(LIVE_TRADES.filter(t => C.trades[t].slug !== o.slug).map(t => [C.trades[t].slug, C.trades[t].name]), LIVE_SVC_PAGES.filter(k => SVC_PAGES[k].slug !== o.slug).map(k => [SVC_PAGES[k].slug, SVC_PAGES[k].name]));
    const kinds = [...new Set(list.map(c => (c.match(/ (County|Parish|Borough|Census Area|Municipality|city)$/i) || [, 'area'])[1].toLowerCase()))];
    const unit = kinds[0] === 'parish' ? 'parishes' : kinds[0] === 'county' ? 'counties' : 'areas';
    write(o.slug + '/' + stateSlug(st) + '.html', shell({
      path: p, title: cap(o.h1) + ' in ' + name,
      desc: o.ask + ' Licensed ' + o.pros + ' in ' + name + ' who are free reply with an arrival time and visit fee. Check any of ' + list.length + ' ' + unit + ' by name or ZIP. Free for homeowners, open 24/7.',
      ld: [
        { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Emergency ' + o.what, name: o.h1 + ' in ' + name, provider: org(), areaServed: { '@type': 'State', name: name } },
        crumbsLd([['Home', '/'], [o.name, root], [name]])
      ]
    }, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="${root}">${esc(o.name)}</a> / ${esc(name)}</nav>
      <h1>${esc(o.h1)} in ${esc(name)}</h1>
      <p class="lede">${esc(o.ask)} Tell us what's wrong. Licensed ${esc(o.pros)} near you who are free reply with an arrival time and visit fee. You pick one.</p>
      ${bookBar({ service: o.service })}
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>Who's on call in ${esc(name)}</h2>
      <p class="sub">Type your ZIP code or ${unit === 'parishes' ? 'parish' : 'county'}, or pick from the list, to see which ${esc(o.pros)} are signed up there.</p>
      <div class="finder" data-finder data-st="${st}" data-trade="${o.trade}" data-service="${o.service}">
        <div class="finder-top"><label class="vh" for="fq">ZIP code or county</label><input type="search" id="fq" data-q placeholder="ZIP code or ${unit === 'parishes' ? 'parish' : 'county'} name" autocomplete="off">${LEGEND}</div>
        <div class="card" data-panel hidden></div>
        <p class="notice warn" data-empty hidden></p>
        <ul class="clist">
          ${list.map(c => '<li><a href="/request?s=' + o.service + '&amp;county=' + encodeURIComponent(c + ', ' + st) + '" id="' + slug(c) + '" data-cov="' + esc(c + ', ' + st) + '"><i class="dot"></i>' + esc(c) + '</a></li>').join('\n          ')}
        </ul>
      </div>
      <p class="sub">${list.length} ${unit} in ${esc(name)}. No dot next to yours? You can still <a href="/request?s=${o.service}">send a request</a>, and we'll tell you right away what we can do. Run ${/^[aeiou]/i.test(o.who) ? 'an' : 'a'} ${esc(o.who)} in ${esc(name)}? <a href="/contractors">Apply to get emergency requests here.</a></p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>What's wrong?</h2>
      <div class="rows">
        ${o.rows('')}
      </div>
    </div>
  </section>
${o.extra || ''}  <section class="sec">
    <div class="wrap">
      <h2>How it works</h2>
      ${HOW}
      <p class="sub" style="margin-top:20px">No one free within ${C.windowMin} minutes? We say so and show ${esc(o.pros)} you can call directly.</p>
      ${others.length ? '<p class="also"><span class="sub">Also in ' + esc(name) + ':</span>' + others.map(x => '<a href="/' + x[0] + '/' + stateSlug(st) + '">' + esc(x[1]) + '</a>').join('') + '</p>' : ''}
    </div>
  </section>`, { bodyClass: 'inner', sticky: true }));
  });
  // The index: every state, lit up where pros are signed up.
  write(o.slug + '.html', shell({
    path: root, title: cap(o.h1) + ' Near You, by State',
    desc: o.ask + ' See where licensed ' + o.pros + ' are taking emergency requests right now, in all 50 states and DC.',
    ld: [crumbsLd([['Home', '/'], [o.name]])]
  }, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / ${esc(o.name)}</nav>
      <h1>${esc(o.h1)} near you</h1>
      <p class="lede">${esc(o.ask)} Send a request now and licensed ${esc(o.pros)} nearby answer with a time and a price. Or pick your state to see who's on call.</p>
      ${bookBar({ service: o.service })}
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>Pick your state</h2>
      ${LEGEND}
      ${stateGrid(root, o.trade)}
      <p class="sub" style="margin-top:20px">Your state not lit up yet? <a href="/request?s=${o.service}">Send a request anyway</a> and we'll tell you right away what we can do.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>What's wrong?</h2>
      <div class="rows">
        ${o.rows('')}
      </div>
    </div>
  </section>`, { sticky: true }));
}

// Remove pages for trades and services that have been switched off since the last build.
Object.keys(C.trades).forEach(t => { if (!LIVE_TRADES.includes(t)) { fs.rmSync(path.join(PUB, C.trades[t].slug), { recursive: true, force: true }); fs.rmSync(path.join(PUB, C.trades[t].slug + '.html'), { force: true }); } });
Object.keys(SVC_PAGES).filter(k => !LIVE_SVC_PAGES.includes(k)).forEach(k => { fs.rmSync(path.join(PUB, SVC_PAGES[k].slug), { recursive: true, force: true }); fs.rmSync(path.join(PUB, SVC_PAGES[k].slug + '.html'), { force: true }); });

LIVE_TRADES.forEach(trade => {
  const T = C.trades[trade], K = COPY[trade];
  locationPages({ slug: T.slug, name: T.name, h1: K.h1, ask: K.ask, what: K.what, who: K.who, pros: T.pros, trade, service: servicesOf(trade).find(k => C.services[k].live), rows: county => problemRows(trade, county) });
});
LIVE_SVC_PAGES.forEach(k => {
  const S = SVC_PAGES[k], trade = C.services[k].trade;
  const probs = problemsOf(k).filter(p => p !== 'other' && C.problems[p][2][0] === k);
  const rows = county => probs.map(p => {
    const P = C.problems[p], q = '/request?s=' + k + '&amp;p=' + p + (county ? '&amp;county=' + encodeURIComponent(county) : '');
    return '<div class="r"><a class="main" href="' + q + '"><b>' + esc(P[0]) + '</b><span>' + esc(P[1]) + '</span></a>' + (GUIDES[p] ? '<a class="quick" href="/help/' + p + '">Quick checks</a>' : '') + '<a class="arrow" href="' + q + '" aria-label="Request help: ' + esc(P[0]) + '">&rarr;</a></div>';
  }).join('\n        ');
  // What to do first, from the triage guide.
  const firstAid = probs.filter(p => TRIAGE.problems[p]).map(p => {
    const t = TRIAGE.problems[p];
    return '<div class="card"><h3>' + esc(C.problems[p][0]) + '</h3><p class="sub"><b>Call now if:</b> ' + esc(t.now.join(' ')) + '</p><p class="sub"><b>Usually can wait:</b> ' + esc(t.wait) + '</p><p class="sub"><b>First:</b> ' + esc(t.first.join(' ')) + '</p></div>';
  }).join('');
  locationPages({ slug: S.slug, name: S.name, h1: S.h1, ask: S.ask, what: S.what, who: S.who, pros: S.pros, trade, service: k, rows,
    extra: `  <section class="sec">
    <div class="wrap">
      <h2>Before the pro arrives</h2>
      <p class="sub">What can't wait, what usually can, and what to do first. If you smell gas, leave the house and call 911 or your gas utility from outside.</p>
      <div class="two">${firstAid}</div>
      <p class="sub">Helpful to have ready: whether the tank is gas or electric, its size in gallons, and the brand and age from the label.</p>
    </div>
  </section>
` });
});
// Old New Jersey county links go to the New Jersey page, opened at that county. Kept in vercel.json.
(function () {
  const f = path.join(__dirname, '..', 'vercel.json'), v = JSON.parse(fs.readFileSync(f, 'utf8'));
  v.redirects = REDIRECTS;
  const out = JSON.stringify(v, null, 2) + '\n';
  if (out !== fs.readFileSync(f, 'utf8')) fs.writeFileSync(f, out);
})();

// ---- The "What's wrong?" guide: /whats-wrong ----
// Every live problem, grouped by where it happens in the house, with when it can't wait and what to do first.
(function () {
  const live = problemGroups().flatMap(g => g.probs).filter(p => TRIAGE.problems[p]);
  const svc = p => C.problems[p][2][0];
  const section = a => {
    const here = live.filter(p => TRIAGE.problems[p].area === a.key);
    if (!here.length) return '';
    return `  <section class="sec" id="${a.key}">
    <div class="wrap">
      <h2>${esc(a.name)}</h2>
      <p class="sub">${esc(a.intro)}</p>
      <div class="triage">
        ${here.map(p => {
          const t = TRIAGE.problems[p], hub = hubFor(svc(p));
          return '<article class="tri t-' + svc(p) + '" id="' + p + '"><h3>' + esc(C.problems[p][0]) + '</h3><p class="sub">' + esc(C.problems[p][1]) + '.</p>' +
            '<div class="tri-now"><b>Call a pro now if</b><ul>' + t.now.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
            '<p class="tri-wait"><b>Usually can wait:</b> ' + esc(t.wait) + '</p>' +
            '<div class="tri-first"><b>Do this first</b><ol>' + t.first.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>' +
            '<p class="tri-links"><a class="btn sm" href="' + probHref(p) + '">Get help with this now</a>' + (GUIDES[p] ? '<a href="/help/' + p + '">All quick checks</a>' : '') + '<a href="' + hub[0] + '">' + esc(hub[1]) + '</a></p></article>';
        }).join('\n        ')}
      </div>
    </div>
  </section>`;
  };
  const toc = TRIAGE.areas.filter(a => live.some(p => TRIAGE.problems[p].area === a.key)).map(a => '<li><b><a href="#' + a.key + '">' + esc(a.name) + '</a></b><ul>' + live.filter(p => TRIAGE.problems[p].area === a.key).map(p => '<li><a href="#' + p + '" data-k="' + p + '"><b>' + esc(C.problems[p][0]) + '</b></a></li>').join('') + '</ul></li>').join('');
  write('whats-wrong.html', shell({
    path: '/whats-wrong', title: "What's Wrong? Home Repair Emergencies, Room by Room",
    desc: 'No heat, a burst pipe, a leaking water heater, or a sump pump that stopped? Find the problem by where it is in the house, see if it can wait, and what to do first.',
    ld: [
      Object.assign({ '@context': 'https://schema.org', '@type': 'Article', headline: "What's wrong? A room-by-room guide to home repair emergencies", author: org(), publisher: org() }, base ? { mainEntityOfPage: abs('/whats-wrong') } : {}),
      crumbsLd([['Home', '/'], ["What's wrong?"]])
    ]
  }, `  <section class="hero sm">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / What's wrong?</nav>
      <h1>What's wrong? Find it by where it is.</h1>
      <p class="lede">Pick the spot in the house. For each problem: when it can't wait, when it usually can, and the safe first steps while help is on the way.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <div class="notice crit"><b>Smell gas, see smoke, or is a carbon monoxide alarm sounding?</b> Leave the house now, then call 911 or your gas utility from outside.</div>
      <div class="hx guide-map" data-house>
        <div class="hx-text"><h2>Jump to a problem</h2><ul class="toc">${toc}</ul></div>
        <div class="hx-art">
          ${houseSvg(live, p => '#' + p, 'ww')}
        </div>
      </div>
    </div>
  </section>
${TRIAGE.areas.map(section).join('\n')}
  <section class="sec">
    <div class="wrap">
      <h2>Need someone now?</h2>
      <p class="lede" style="margin-bottom:16px">Licensed local pros who are free reply with an arrival time and visit fee. Free for homeowners.</p>
      ${bookBar({}).replace('class="book"', 'class="book solo"')}
      <p class="small sub" style="margin-top:16px">This guide is general information, not a diagnosis. If anything seems unsafe, stop and call a licensed professional.</p>
    </div>
  </section>`, { bodyClass: 'inner', sticky: true }));
})();

// ---- Troubleshooting guides: /help/<problem> ----
const li = arr => arr.map(x => '<li>' + esc(x) + '</li>').join('');
const GKEYS = Object.keys(GUIDES).filter(k => C.problems[k] && C.services[C.problems[k][2][0]].live);
Object.keys(GUIDES).filter(k => !GKEYS.includes(k)).forEach(k => fs.rmSync(path.join(PUB, 'help', k + '.html'), { force: true }));
GKEYS.forEach(k => {
  const g = GUIDES[k], p = '/help/' + k;
  const others = GKEYS.filter(x => x !== k).map(x => '<a href="/help/' + x + '">' + esc(C.problems[x][0]) + '</a>').join('');
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
      <div class="notice crit"><b>${esc(g.danger || 'Smell gas, or is a carbon monoxide alarm sounding?')}</b> Skip this page. Leave the house, then call 911${g.danger ? '' : " or your gas utility's emergency line"} from outside.</div>
      <ol class="checks">
        ${g.checks.map(c => '<li><b>' + esc(c[0]) + '</b><p>' + esc(c[1]) + '</p></li>').join('\n        ')}
      </ol>
      <div class="two">
        <div class="card"><h3>Stop and call a pro if</h3><ul class="plain">${li(g.stop)}</ul></div>
        <div class="card"><h3>While you wait</h3><ul class="plain">${li(g.meanwhile)}</ul></div>
      </div>
      <p class="small sub">These are general checks, not a diagnosis. If anything seems unsafe, stop and call a licensed professional.</p>
    </div>
  </section>
  <section class="sec">
    <div class="wrap">
      <h2>Still not working? See who can come.</h2>
      <p class="lede" style="margin-bottom:16px">Licensed local pros who are free reply with an arrival time and visit fee. Free for homeowners.</p>
      ${bookBar({ problem: k, service: C.problems[k][2][0] }).replace('class="book"', 'class="book solo"')}
      <p class="also" style="margin-top:24px"><span class="sub">Other quick checks:</span>${others}</p>
    </div>
  </section>`, { bodyClass: 'inner', sticky: true }));
});

write('help.html', shell({
  path: '/help', title: 'Home Repair Quick Checks: What to Try Before You Call',
  desc: 'Safe, tool-free checks for no heat, no cooling, leaks, clogs, no hot water, and more, plus when to stop and call a licensed pro.',
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
        ${GKEYS.map(k => '<div class="r"><a class="main" href="/help/' + k + '"><b>' + esc(C.problems[k][0]) + '</b><span>' + esc(GUIDES[k].checks.length + ' checks · ' + C.problems[k][1]) + '</span></a><a class="arrow" href="/help/' + k + '" aria-label="' + esc(C.problems[k][0]) + ' checks">&rarr;</a></div>').join('\n        ')}
      </div>
    </div>
  </section>`));

// ---- Hand-written pages: stamp the shared head, brand, and home page blocks ----
const PAGES = {
  'index.html': { path: '/', title: 'Emergency Home Repair Near You, Open 24/7', desc: 'Home emergency? Pick ' + LIVE_NAMES + ', and licensed local pros who are free reply with an arrival time and visit fee. You choose. Free for homeowners.' },
  'contractors.html': { path: '/contractors', title: C.freeLaunch ? 'Free Emergency Repair Leads for Licensed Local Pros' : 'Emergency Repair Leads: Pay Only When Chosen', desc: 'HVAC, plumbing, electrical, and appliance pros: get emergency requests in the counties and hours you choose. ' + (C.freeLaunch ? 'Free during our launch: no lead fees, no monthly fee.' : 'First ' + C.freeLeads + ' chosen leads free, then $' + C.leadFee + ' only when a customer picks you. No monthly fee.') },
  'request.html': { path: '/request', title: 'Request Emergency Home Repair', desc: 'Tell us what\'s wrong and we\'ll alert licensed local pros who can come. Takes about a minute.' },
  'status.html': { title: 'Your request', noindex: true },
  'respond.html': { title: 'Job request', noindex: true },
  'terms.html': { title: 'Terms', noindex: true },
  'privacy.html': { title: 'Privacy policy', noindex: true },
  'pro.html': { title: 'Your contractor settings', noindex: true },
  'admin.html': { title: 'Admin', noindex: true },
  'company.html': { title: 'Company profile', noindex: true },
  'find.html': { title: 'Find your request', noindex: true },
  'unsubscribe.html': { title: 'No more emails', noindex: true },
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
    html = block(html, 'book', '      ' + bookBar({ liveOnly: true }));
    html = block(html, 'services', '      ' + houseSection());
    html = block(html, 'counties', '      ' + stateGrid('/' + C.trades[LIVE_TRADES[0]].slug, '', true));
    html = block(html, 'how', '      ' + STORY);
    html = block(html, 'proterms', '        ' + PRO_TERMS());
    const soon = SERVICES.filter(k => !C.services[k].live).map(k => C.services[k].name.toLowerCase());
    const up = t => t.charAt(0).toUpperCase() + t.slice(1);
    html = html.replace(/(<span id="hero-services">)[^<]*/, '$1' + esc(up(LIVE_NAMES)) + ' repair.');
    html = html.replace(/(<p id="faq-services">)[^<]*/, '$1' + esc(up(LIVE_NAMES)) + ' repair today.' + (soon.length ? ' ' + esc(up(list(soon))) + ' ' + (soon.length > 1 ? 'are' : 'is') + ' coming as licensed pros sign up.' : ''));
    const faq = [];
    html.replace(/<details><summary>([\s\S]*?)<\/summary><p[^>]*>([\s\S]*?)<\/p><\/details>/g, (_, q, a) => { faq.push({ '@type': 'Question', name: q.replace(/<[^>]+>/g, '').trim(), acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '').trim() } }); });
    m.ld = [
      Object.assign({ '@context': 'https://schema.org' }, org()),
      { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Emergency home repair', name: 'Emergency ' + LIVE_NAMES + ' repair', provider: org(), areaServed: { '@type': 'Country', name: 'United States' }, hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' } },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }
    ];
  }
  html = block(html, 'seo', seo(m));
  html = block(html, 'head', HEAD);
  fs.writeFileSync(f, html);
});

// ---- ZIP lookup for the browser, robots.txt, sitemap.xml ----
write('robots.txt', 'User-agent: *\nDisallow: /api/\nDisallow: /status\nDisallow: /respond\nDisallow: /pro\nDisallow: /admin\nDisallow: /unsubscribe\n' + (base ? 'Sitemap: ' + abs('/sitemap.xml') + '\n' : ''));
if (base) write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemap.sort().map(p => '  <url><loc>' + abs(p) + '</loc></url>').join('\n') + '\n</urlset>\n');
else if (fs.existsSync(path.join(PUB, 'sitemap.xml'))) fs.unlinkSync(path.join(PUB, 'sitemap.xml'));

// First steps for each problem, for the request status page ("While you wait, do this first"). From scripts/triage.js.
fs.writeFileSync(path.join(PUB, 'assets', 'first-steps.js'), '// Built from scripts/triage.js by npm run build. Edit the wording there.\nwindow.FIRST_STEPS = ' +
  JSON.stringify(Object.fromEntries(Object.keys(TRIAGE.problems).filter(p => C.problems[p]).map(p => [p, { first: TRIAGE.problems[p].first, guide: !!GUIDES[p] }]))) + ';\n');

// Cache busting: stamp each page's links to the shared styles and scripts with a short fingerprint of the file,
// like /assets/styles.css?v=3f9a1c2b. Browsers may keep these files for a while (see vercel.json), so a changed file
// must get a new address or visitors would see old styles. Runs on every build, so just run npm run build before pushing.
(function () {
  const crypto = require('crypto');
  const names = ['styles.css', 'site.js', 'config.js', 'geo.js', 'first-steps.js'];
  const v = Object.fromEntries(names.map(n => [n, crypto.createHash('sha1').update(fs.readFileSync(path.join(PUB, 'assets', n))).digest('hex').slice(0, 8)]));
  const re = new RegExp('"/assets/(' + names.map(n => n.replace('.', '\\.')).join('|') + ')(\\?v=[0-9a-f]*)?"', 'g');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return walk(f);
    if (!e.name.endsWith('.html')) return;
    const html = fs.readFileSync(f, 'utf8'), out = html.replace(re, (m, n) => '"/assets/' + n + '?v=' + v[n] + '"');
    if (out !== html) fs.writeFileSync(f, out);
  });
  walk(PUB);
})();

console.log('Built ' + sitemap.length + ' indexable pages for "' + C.brand + '"' + (base ? ' at ' + base : ' (no siteUrl set, so no sitemap or canonical links yet)') + '.');
