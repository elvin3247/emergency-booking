// Shared on every page: header, footer, helpers, the booking card, live coverage, and visit tracking.
(function () {
  var S = window.SITE;
  var byId = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  window.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  window.mmss = function (sec) { sec = Math.max(0, sec); return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0'); };
  window.api = async function (path, body) {
    var res;
    try {
      res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    } catch (e) { throw new Error("We couldn't reach the server. Check your connection and try again."); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  };

  // Where did this visitor come from? A partner link (?ref=name), an ad (?utm_source=...), or another site.
  // Saved with each request and sign-up so you can see which channels work.
  (function () {
    var q = new URLSearchParams(location.search), src = '';
    if (q.get('ref')) src = 'ref:' + q.get('ref');
    else if (q.get('utm_source')) src = 'utm:' + [q.get('utm_source'), q.get('utm_medium') || '', q.get('utm_campaign') || ''].join('/');
    else if (!LS.get('src') && document.referrer) { try { var h = new URL(document.referrer).hostname; if (h !== location.hostname) src = 'site:' + h; } catch (e) {} }
    if (src) LS.set('src', src.slice(0, 120));
  })();
  window.siteSource = function () { return LS.get('src') || ''; };

  // Page views and a few key actions, through Vercel Web Analytics (no cookies).
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (S.analytics === 'vercel' && !local) {
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var a = document.createElement('script'); a.defer = true; a.src = '/_vercel/insights/script.js'; document.head.appendChild(a);
  }
  // If a script on one of our pages fails on someone's device, tell the server (at most 3 per page view) so it shows on the admin page.
  var errSent = 0;
  function sendErr(msg, at) {
    if (errSent++ >= 3 || !msg) return;
    try { fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'js_error', msg: String(msg).slice(0, 300), page: location.pathname, at: String(at || '').slice(0, 200) }) }).catch(function () {}); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    // Only our own scripts: browser add-ons and blocked third-party scripts are not our bugs.
    if (e && e.message && e.filename && e.filename.indexOf(location.origin) === 0) sendErr(e.message, e.filename.replace(location.origin, '') + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    if (r && r.name && r.name !== 'Error' && r.stack && r.stack.indexOf(location.origin) >= 0) sendErr(r.message || r, 'promise');
  });
  // Steps of the journey go to our own database (shown as a funnel on the admin page), since Vercel's free plan
  // doesn't keep custom events. They also go to Vercel Analytics, which records them on a paid plan.
  window.track = function (name) {
    try { if (window.va) window.va('event', { name: name }); } catch (e) {}
    try { fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, source: LS.get('src') || null }) }).catch(function () {}); } catch (e) {}
  };

  // The request someone started on this device, so they can find it again.
  // Returning homeowners: their contact details stay on this device so the next request is quicker.
  window.ME = {
    get: function () { try { return JSON.parse(LS.get('me') || '{}') || {}; } catch (e) { return {}; } },
    save: function (d) { var m = window.ME.get(); Object.keys(d).forEach(function (k) { if (d[k]) m[k] = d[k]; }); LS.set('me', JSON.stringify(m)); },
    clear: function () { LS.del('me'); }
  };
  window.rememberRequest = function (token) { LS.set('req', JSON.stringify({ t: token, at: Date.now() })); };
  var open = null; try { open = JSON.parse(LS.get('req') || 'null'); } catch (e) {}
  if (open && Date.now() - open.at > S.openHours * 3600000) { LS.del('req'); open = null; }

  var slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var liveTrades = []; Object.keys(S.services).forEach(function (k) { var t = S.services[k].trade; if (S.services[k].live && liveTrades.indexOf(t) < 0) liveTrades.push(t); });
  window.svcIcon = function (k) { return '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (S.icons[k] || '') + '</svg></span>'; };

  var hdr = byId('site-header');
  if (hdr) hdr.innerHTML =
    (open && !/^\/(status|respond)/.test(location.pathname) ? '<div class="openreq"><div class="wrap"><span>You have a request in progress on this device.</span><a class="btn sm dark" href="/status?t=' + encodeURIComponent(open.t) + '">View your request</a></div></div>' : '') +
    '<header class="hdr"><div class="wrap"><a class="brand" href="/"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>' + esc(S.brand) + '</a>' +
    '<nav class="nav" aria-label="Main"><a class="hide-sm" href="/#services">Services</a><a class="hide-sm" href="/#how">How it works</a><a class="hide-sm" href="/help">Quick checks</a><a class="hide-sm" href="/contractors">For pros</a>' +
    '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu">Menu</button><a class="btn sm" href="/request">Get help now</a></nav></div>' +
    // Phone menu: the links that don't fit in the header on small screens.
    '<div class="menu" id="menu" hidden><div class="wrap"><a class="btn menu-cta" href="/request">Get help now</a><a href="/#services">Services</a><a href="/#how">How it works</a><a href="/help">Quick checks</a><a href="/find">Find my request</a><a href="/contractors">For pros</a></div></div></header>';
  // Phones: show the bottom "Get help now" button only after the booking form scrolls out of view.
  var bookEl = byId('book');
  if (bookEl && 'IntersectionObserver' in window) {
    document.body.classList.add('has-book');
    new IntersectionObserver(function (es) { document.body.classList.toggle('past-book', !es[0].isIntersecting && es[0].boundingClientRect.top < 0); }).observe(bookEl);
  }
  var mb = document.querySelector('.menu-btn');
  if (mb) mb.addEventListener('click', function () { var m = byId('menu'), open = m.hidden; m.hidden = !open; mb.setAttribute('aria-expanded', String(open)); mb.textContent = open ? 'Close' : 'Menu'; });
  var ftr = byId('site-footer');
  if (ftr) ftr.innerHTML = '<footer class="ftr"><div class="wrap"><span>' + esc(S.brand) + ' connects homeowners across the US with independent, licensed local pros. We don\'t perform the work.</span>' +
    '<nav aria-label="Footer">' + liveTrades.map(function (t) { return '<a href="/' + S.trades[t].slug + '">' + esc(S.trades[t].name) + ' by state</a>'; }).join('') + (S.services['water-heater'] && S.services['water-heater'].live ? '<a href="/water-heater">Water heaters by state</a>' : '') + '<a href="/whats-wrong">What\'s wrong?</a><a href="/help">Quick checks</a><a href="/find">Find my request</a><a href="/contractors">For pros</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>' +
    '<span class="credit">County and ZIP code data from the US Census Bureau.</span></div></footer>';
  document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.brand; });
  if (document.title.indexOf(S.brand) < 0) document.title = document.title + ' | ' + S.brand;

  // Booking card and live coverage (home page, state pages, and guides).
  var book = byId('book'), covEls = document.querySelectorAll('[data-cov]'), stateEls = document.querySelectorAll('[data-state]'), finder = document.querySelector('[data-finder]'), COV = null;
  var update = function () {};
  var service = function () { var r = book && book.querySelector('input[name=s]:checked'); return r ? r.value : ''; };
  // Which county a ZIP is in, asked from the server once per ZIP. window.zipPlace('07059').then(function (place) { ... }); place is null for a ZIP we don't know.
  var PLACES = {};
  window.zipPlace = function (z) {
    if (!/^\d{5}$/.test(z)) return Promise.resolve(null);
    if (!(z in PLACES)) PLACES[z] = window.api('/api/coverage?zip=' + z).then(function (d) { COV = d; return d.place || null; }).catch(function () { delete PLACES[z]; return undefined; });
    return PLACES[z];
  };
  var statusOf = function (county, t) { return (COV && ((t && COV.trades[t]) || COV.counties)[county]) || 'none'; };
  var paint = function () {
    if (!COV) return;
    var grid = document.querySelector('[data-trade]');
    var t = book ? (S.services[service()] || {}).trade : grid ? grid.getAttribute('data-trade') : '';
    covEls.forEach(function (el) {
      var s = statusOf(el.getAttribute('data-cov'), t), dot = el.querySelector('.dot');
      if (dot) dot.className = 'dot' + (s !== 'none' ? ' ' + s : '');
      el.classList.toggle('has', s !== 'none');
    });
    // State tiles: lit when any county in the state has a pro (for this page's trade, if it has one).
    stateEls.forEach(function (el) {
      var st = el.getAttribute('data-state'), by = (t && COV.trades[t]) || COV.counties, n = 0, now = false;
      Object.keys(by).forEach(function (c) { if (c.slice(-2) === st) { n++; if (by[c] === 'now') now = true; } });
      var dot = el.querySelector('.dot'), note = el.querySelector('.n');
      if (dot) dot.className = 'dot' + (now ? ' now' : n ? ' later' : '');
      if (note) note.textContent = n ? n + (n === 1 ? ' county' : ' counties') : '';
      // On the home page the tile follows the service picked in the booking card.
      if (t && el.hasAttribute('data-follow')) el.setAttribute('href', '/' + S.trades[t].slug + '/' + el.getAttribute('data-follow'));
    });
    var live = byId('live-count');
    if (live) { var cs = Object.keys(COV.counties).length, ss = Object.keys(COV.states || {}).length; live.textContent = cs ? 'Pros are signed up in ' + cs + (cs === 1 ? ' county' : ' counties') + ' across ' + ss + (ss === 1 ? ' state' : ' states') + ' so far.' : 'We\'re signing up pros now. You can send a request from anywhere in the US.'; }
  };
  // The list of pros in one county (state pages), filled into `box`.
  var showPros = function (box, county, t) {
    var T = S.trades[t] || { pro: 'contractor', pros: 'contractors', license: 'License' };
    box.innerHTML = '<p class="sub">Checking who\'s signed up...</p>';
    return window.api('/api/coverage?county=' + encodeURIComponent(county) + (t ? '&trade=' + t : '')).then(function (d) {
      var list = d.contractors || [], st = ((t && d.trades[t]) || d.counties)[county] || 'none';
      box.innerHTML = list.length
        ? '<p><span class="pill ' + (st === 'now' ? 'ok' : 'wait') + '">' + (st === 'now' ? 'On call now' : 'Off hours right now') + '</span></p>' +
          list.map(function (c) { return '<div class="card"><b>' + esc(c.company) + '</b><span class="sub small">' + esc(T.license) + ' ' + esc(c.license) + ' · <a href="/company?id=' + encodeURIComponent(c.id) + '">See profile</a></span></div>'; }).join('') +
          '<p class="small sub">Send a request and the ones who are free will answer with an arrival time and visit fee.</p>'
        : '<div class="notice warn">No ' + esc(T.pro) + ' has joined in ' + esc(county) + ' yet. You can still send a request, and we\'ll tell you right away what we can do.</div>';
    }).catch(function () { box.innerHTML = '<p class="sub">We couldn\'t load the list just now. You can still send a request.</p>'; });
  };
  if (book) {
    var zip = book.elements.zip, county = book.elements.county, sel = book.elements.p, fixed = book.getAttribute('data-county') || '', covEl = byId('b-cov'), err = byId('b-err'), hit = null, hitZip = '';
    // Show only the problems that belong to the chosen service.
    var problems = function (keep) {
      var s = service();
      sel.innerHTML = Object.keys(S.problems).filter(function (k) { return S.problems[k][2].indexOf(s) > -1; }).map(function (k) { return '<option value="' + k + '">' + esc(S.problems[k][0]) + '</option>'; }).join('');
      if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
    };
    update = function () {
      var z = zip.value.trim();
      if (/^\d{5}$/.test(z) && z !== hitZip) {
        // Ask the server where this ZIP is, then come back here.
        covEl.className = ''; covEl.textContent = '';
        window.zipPlace(z).then(function (place) { if (zip.value.trim() === z && place !== undefined) { hit = place; hitZip = z; paint(); update(); } });
        return;
      }
      if (!/^\d{5}$/.test(z)) { hit = null; hitZip = ''; }
      var c = hit ? hit.county : hitZip ? '' : fixed;
      county.value = c || '';
      if (hitZip && !hit) { covEl.className = 'none'; covEl.textContent = 'We don\'t have that ZIP code on file. Go ahead, and you can pick your county on the next step.'; return; }
      var t = S.trades[(S.services[service()] || {}).trade];
      if (!c || !COV || !t) { covEl.textContent = ''; return; }
      var s = statusOf(c, S.services[service()].trade), where = (hit && hit.town ? hit.town + ', ' : '') + c;
      covEl.className = s;
      covEl.textContent = s === 'now' ? where + ': ' + t.pros + ' on call now.'
        : s === 'later' ? where + ': ' + t.pros + ' signed up, but none on call this hour. We\'ll show you who to call.'
        : where + ': no ' + t.pro + ' signed up yet. You can still send a request.';
    };
    // Start on the page's own service if it has one. Otherwise heating, or cooling from May through September.
    if (!zip.value && /^\d{5}$/.test(window.ME.get().zip || '')) zip.value = window.ME.get().zip;
    var want = book.getAttribute('data-service') || '', keep = sel.value, month = new Date().getMonth();
    if (!want && !book.hasAttribute('data-problem')) want = month >= 4 && month <= 8 ? 'cooling' : 'heating';
    var radio = want && book.querySelector('input[name=s][value="' + want + '"]:not(:disabled)');
    if (radio) radio.checked = true;
    problems(book.hasAttribute('data-problem') ? keep : '');
    book.addEventListener('change', function (e) { if (e.target.name === 's') { problems(); update(); paint(); } });
    zip.addEventListener('input', function () { err.hidden = true; update(); });
    book.addEventListener('submit', function (e) {
      var z = zip.value.trim();
      if (!/^\d{5}$/.test(z)) { e.preventDefault(); err.textContent = 'Enter your 5-digit ZIP code.'; err.hidden = false; zip.focus(); return; }
      window.track('request_started');
    });
  }
  // State pages: a searchable list of every county in the state. Type a county or a ZIP; tap a county to see who's signed up there.
  if (finder) {
    var q = finder.querySelector('[data-q]'), items = finder.querySelectorAll('[data-cov]'), panel = finder.querySelector('[data-panel]'), empty = finder.querySelector('[data-empty]'), ft = finder.getAttribute('data-trade') || '', fs = finder.getAttribute('data-service') || '', fstate = finder.getAttribute('data-st');
    var open = function (key, town) {
      items.forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-cov') === key); });
      panel.hidden = false;
      panel.innerHTML = '<div class="split"><h3>' + esc(key.replace(/, [A-Z]{2}$/, '')) + (town ? ' <span class="sub small">(' + esc(town) + ')</span>' : '') + '</h3><a class="btn sm" href="/request?' + (fs ? 's=' + fs + '&' : '') + 'county=' + encodeURIComponent(key) + '">Request help here</a></div><div class="stack" data-list></div>';
      showPros(panel.querySelector('[data-list]'), key, ft);
      if (history.replaceState) history.replaceState(null, '', '#' + slug(key.replace(/, [A-Z]{2}$/, '')));
    };
    var filter = function () {
      var v = q.value.trim().toLowerCase(), shown = 0;
      if (/^\d{5}$/.test(v)) {
        window.zipPlace(v).then(function (place) {
          if (q.value.trim() !== v) return;
          if (place && place.state === fstate) { items.forEach(function (el) { el.parentNode.hidden = el.getAttribute('data-cov') !== place.county; }); empty.hidden = true; open(place.county, place.town); }
          else { items.forEach(function (el) { el.parentNode.hidden = true; }); panel.hidden = true; empty.hidden = false; empty.innerHTML = place ? esc(v) + ' is in ' + esc(place.county) + '. <a href="/request?' + (fs ? 's=' + fs + '&' : '') + 'zip=' + v + '">Send a request there</a>.' : 'We don\'t have that ZIP code on file. Try the county name.'; }
        });
        return;
      }
      if (/^\d+$/.test(v)) return;
      items.forEach(function (el) { var hide = !!v && el.textContent.toLowerCase().indexOf(v) < 0; el.parentNode.hidden = hide; if (!hide) shown++; });
      empty.hidden = shown > 0; if (!shown) empty.textContent = 'No county in this state matches that. Check the spelling, or type a ZIP code.';
    };
    q.addEventListener('input', filter);
    finder.addEventListener('click', function (e) { var b = e.target.closest('[data-cov]'); if (b) { e.preventDefault(); open(b.getAttribute('data-cov')); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    // A link like /plumbing/texas#travis-county opens that county.
    var h = location.hash.slice(1);
    if (h) items.forEach(function (el) { if (el.id === h) open(el.getAttribute('data-cov')); });
  }
  if (book || covEls.length || stateEls.length) {
    window.api('/api/coverage').then(function (d) {
      if (!COV) COV = d;
      var legend = byId('legend'); if (legend) legend.hidden = false;
      paint(); update();
    }).catch(function () {});
  }
})();

// Photos: shrink on the phone before sending (about 1600px, JPEG), so uploads are quick even on a weak signal.
window.shrinkPhoto = function (file) {
  return new Promise(function (resolve, reject) {
    if (!/^image\//.test(file.type)) return reject(new Error('That file is not a photo.'));
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('We could not read that photo. Try a JPG or PNG.')); };
    img.src = url;
  });
};
window.uploadPhotos = async function (token, files, max) {
  var sent = 0, errors = [];
  for (var i = 0; i < files.length && sent < max; i++) {
    try { await window.api('/api/requests', { token: token, action: 'photo', data: await window.shrinkPhoto(files[i]) }); sent++; }
    catch (e) { errors.push(e.message); }
  }
  return { sent: sent, error: errors[0] || '' };
};
window.photoGrid = function (urls) { return urls && urls.length ? '<div class="photos">' + urls.map(function (u, i) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Photo ' + (i + 1) + ' from the homeowner" loading="lazy"></a>'; }).join('') + '</div>' : ''; };

// "Where in the house?" (home page and /whats-wrong): hovering or focusing a pin or a problem lights up both, with a label over the pin.
document.querySelectorAll('[data-house]').forEach(function (box) {
  var svg = box.querySelector('.house'), flag = box.querySelector('.flag');
  if (!svg || !flag) return;
  function on(k, v) {
    box.querySelectorAll('[data-k="' + k + '"]').forEach(function (e) { e.classList.toggle('on', v); });
    var pin = svg.querySelector('.pin[data-k="' + k + '"]'), name = box.querySelector('[data-k="' + k + '"] b');
    if (v && pin && name) {
      var r = svg.getBoundingClientRect(), pr = svg.parentNode.getBoundingClientRect(), sc = r.width / 600;
      flag.textContent = name.textContent;
      flag.style.left = (r.left - pr.left + pin.getAttribute('data-x') * sc) + 'px';
      flag.style.top = (r.top - pr.top + pin.getAttribute('data-y') * sc) + 'px';
      flag.classList.add('show');
    } else flag.classList.remove('show');
  }
  box.querySelectorAll('[data-k]').forEach(function (e) {
    var k = e.getAttribute('data-k');
    ['mouseenter', 'focus'].forEach(function (ev) { e.addEventListener(ev, function () { on(k, true); }); });
    ['mouseleave', 'blur'].forEach(function (ev) { e.addEventListener(ev, function () { on(k, false); }); });
  });
});

// County picker, used wherever someone chooses where they are or where they work (request form, pro sign-up, pro settings, admin).
// Counties are always written like "Somerset County, NJ". The state and county lists load only when a picker is used.
//   var p = countyPicker(element, { multi: true, value: ['Somerset County, NJ'], id: 'cp' });   p.get() -> array (multi) or string
window.loadGeo = function () {
  if (window.GEO) return Promise.resolve(window.GEO);
  if (!window._geo) window._geo = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/assets/geo.js'; s.onload = function () { ok(window.GEO); }; s.onerror = function () { window._geo = null; no(new Error('We couldn\'t load the list of counties. Check your connection and reload.')); }; document.head.appendChild(s); });
  return window._geo;
};
window.countyPicker = function (el, o) {
  o = o || {};
  var id = o.id || 'cp', picked = [].concat(o.value || []).filter(Boolean), state = o.state || (picked[0] ? picked[0].slice(-2) : ''), q = '';
  var esc = window.esc, api = { get: function () { return o.multi ? picked.slice() : picked[0] || ''; }, set: function (v) { picked = [].concat(v || []).filter(Boolean); if (picked[0]) state = picked[0].slice(-2); draw(); }, ready: null };
  function draw() {
    var G = window.GEO; if (!G) return;
    var states = Object.keys(G.states).sort(function (a, b) { return G.states[a] < G.states[b] ? -1 : 1; });
    var h = '<div class="cp"><div class="row"><div><label for="' + id + '-st">State</label><select id="' + id + '-st" data-cp="state"><option value="">Choose your state</option>' +
      states.map(function (s) { return '<option value="' + s + '"' + (s === state ? ' selected' : '') + '>' + esc(G.states[s]) + '</option>'; }).join('') + '</select></div>';
    var list = state ? G.counties[state] : [];
    if (!o.multi) {
      h += '<div><label for="' + id + '-co">County</label><select id="' + id + '-co" data-cp="county"' + (state ? '' : ' disabled') + '><option value="">' + (state ? 'Choose your county' : 'Pick a state first') + '</option>' +
        list.map(function (c) { var k = c + ', ' + state; return '<option value="' + esc(k) + '"' + (picked[0] === k ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div></div>';
    } else {
      h += '<div><label for="' + id + '-q">Find a county</label><input type="search" id="' + id + '-q" data-cp="q" value="' + esc(q) + '" placeholder="Type to narrow the list"' + (state ? '' : ' disabled') + '></div></div>';
      if (state) {
        var here = list.filter(function (c) { return !q || c.toLowerCase().indexOf(q.toLowerCase()) > -1; }), all = list.every(function (c) { return picked.indexOf(c + ', ' + state) > -1; });
        h += '<div class="chips cp-list" role="group" aria-label="Counties in ' + esc(G.states[state]) + '">' + here.map(function (c, i) { var k = c + ', ' + state; return '<label class="chip" for="' + id + '-c' + i + '"><input type="checkbox" id="' + id + '-c' + i + '" data-cp="c" value="' + esc(k) + '"' + (picked.indexOf(k) > -1 ? ' checked' : '') + '><span>' + esc(c) + '</span></label>'; }).join('') + '</div>' +
          '<p class="small"><button class="quiet" type="button" data-cp="all">' + (all ? 'Clear all of ' : 'Pick all of ') + esc(G.states[state]) + '</button></p>';
      }
      var other = picked.filter(function (k) { return k.slice(-2) !== state; });
      h += '<p class="small sub" data-cp-sum>' + (picked.length ? '<b>' + picked.length + ' picked.</b> ' + (other.length ? 'In other states: ' + esc(other.join('; ')) + '. Switch the state above to change those.' : '') : 'Pick every county you serve. Work across a state line? Pick one state, then switch states and pick more.') + '</p></div>';
    }
    var focusQ = document.activeElement && document.activeElement.getAttribute('data-cp') === 'q', pos = focusQ ? document.activeElement.selectionStart : 0;
    el.innerHTML = h;
    if (focusQ) { var n = el.querySelector('[data-cp=q]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
  }
  el.addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-cp');
    if (k === 'state') { state = e.target.value; q = ''; if (!o.multi) picked = []; draw(); }
    else if (k === 'county') picked = e.target.value ? [e.target.value] : [];
    else if (k === 'c') { var v = e.target.value, i = picked.indexOf(v); if (e.target.checked && i < 0) picked.push(v); if (!e.target.checked && i > -1) picked.splice(i, 1); var sum = el.querySelector('[data-cp-sum] b'); if (sum) sum.textContent = picked.length + ' picked.'; else draw(); }
    if (k && o.onChange) o.onChange(api.get());
  });
  el.addEventListener('input', function (e) { if (e.target.getAttribute('data-cp') === 'q') { q = e.target.value; draw(); } });
  el.addEventListener('click', function (e) {
    if (!e.target.closest('[data-cp=all]')) return;
    var list = window.GEO.counties[state].map(function (c) { return c + ', ' + state; }), all = list.every(function (k) { return picked.indexOf(k) > -1; });
    picked = picked.filter(function (k) { return list.indexOf(k) < 0; }); if (!all) picked = picked.concat(list);
    draw(); if (o.onChange) o.onChange(api.get());
  });
  el.innerHTML = '<p class="sub small">Loading the list of counties...</p>';
  api.ready = window.loadGeo().then(draw).catch(function (x) { el.innerHTML = '<p class="err">' + esc(x.message) + '</p>'; });
  return api;
};
