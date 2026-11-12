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
  window.track = function (name) { try { if (window.va) window.va('event', { name: name }); } catch (e) {} };

  // The request someone started on this device, so they can find it again.
  window.rememberRequest = function (token) { LS.set('req', JSON.stringify({ t: token, at: Date.now() })); };
  var open = null; try { open = JSON.parse(LS.get('req') || 'null'); } catch (e) {}
  if (open && Date.now() - open.at > S.openHours * 3600000) { LS.del('req'); open = null; }

  var slug = function (county) { return county.toLowerCase().replace(/ /g, '-') + '-county-nj'; };
  var liveTrades = []; Object.keys(S.services).forEach(function (k) { var t = S.services[k].trade; if (S.services[k].live && liveTrades.indexOf(t) < 0) liveTrades.push(t); });
  window.svcIcon = function (k) { return '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (S.icons[k] || '') + '</svg></span>'; };

  var hdr = byId('site-header');
  if (hdr) hdr.innerHTML =
    (open && !/^\/(status|respond)/.test(location.pathname) ? '<div class="openreq"><div class="wrap"><span>You have a request in progress on this device.</span><a class="btn sm dark" href="/status?t=' + encodeURIComponent(open.t) + '">View your request</a></div></div>' : '') +
    '<header class="hdr"><div class="wrap"><a class="brand" href="/"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>' + esc(S.brand) + '</a>' +
    '<nav class="nav" aria-label="Main"><a class="hide-sm" href="/#services">Services</a><a class="hide-sm" href="/#how">How it works</a><a class="hide-sm" href="/help">Quick checks</a><a class="hide-sm" href="/contractors">For pros</a><a class="btn sm" href="/request">Get help now</a></nav></div></header>';
  var ftr = byId('site-footer');
  if (ftr) ftr.innerHTML = '<footer class="ftr"><div class="wrap"><span>' + esc(S.brand) + ' connects New Jersey homeowners with independent, licensed local pros. We don\'t perform the work.</span>' +
    '<nav aria-label="Footer">' + liveTrades.map(function (t) { return '<a href="/' + S.trades[t].slug + '">' + esc(S.trades[t].name) + ' by county</a>'; }).join('') + '<a href="/help">Quick checks</a><a href="/contractors">For pros</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>' +
    '<span class="credit">ZIP code data from <a href="https://www.geonames.org/" rel="noopener">GeoNames</a>, CC BY 4.0.</span></div></footer>';
  document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.brand; });
  if (document.title.indexOf(S.brand) < 0) document.title = document.title + ' | ' + S.brand;

  // Booking card and live coverage (home page, county pages, and guides).
  var book = byId('book'), covEls = document.querySelectorAll('[data-cov]'), pros = document.querySelector('[data-county-pros]'), COV = null;
  var update = function () {};
  var service = function () { var r = book && book.querySelector('input[name=s]:checked'); return r ? r.value : ''; };
  var paint = function () {
    if (!COV) return;
    var grid = document.querySelector('.counties[data-trade]');
    var t = book ? (S.services[service()] || {}).trade : grid ? grid.getAttribute('data-trade') : '', by = (t && COV.trades[t]) || COV.counties;
    covEls.forEach(function (el) {
      var c = el.getAttribute('data-cov'), dot = el.querySelector('.dot');
      if (dot) dot.className = 'dot' + (by[c] !== 'none' ? ' ' + by[c] : '');
      if (t && el.hasAttribute('data-follow')) el.setAttribute('href', '/' + S.trades[t].slug + '/' + slug(c));
    });
    document.querySelectorAll('[data-pin]').forEach(function (el) {
      var mine = COV.trades[el.getAttribute('data-pin')] || {};
      el.classList.toggle('on', Object.keys(mine).some(function (c) { return mine[c] === 'now'; }));
    });
  };
  if (book) {
    var zip = book.elements.zip, county = book.elements.county, sel = book.elements.p, fixed = book.getAttribute('data-county') || '', covEl = byId('b-cov'), err = byId('b-err');
    var lookup = function () { return window.NJ_ZIPS ? window.NJ_ZIPS[zip.value.trim()] : null; };
    // Show only the problems that belong to the chosen service.
    var problems = function (keep) {
      var s = service();
      sel.innerHTML = Object.keys(S.problems).filter(function (k) { return S.problems[k][2].indexOf(s) > -1; }).map(function (k) { return '<option value="' + k + '">' + esc(S.problems[k][0]) + '</option>'; }).join('');
      if (keep && sel.querySelector('option[value="' + keep + '"]')) sel.value = keep;
    };
    update = function () {
      var z = zip.value.trim(), hit = lookup(), c = hit ? S.counties[hit[0]] : fixed;
      county.value = c || '';
      if (/^\d{5}$/.test(z) && !/^0[78]/.test(z)) { covEl.className = 'none'; covEl.textContent = "That's not a New Jersey ZIP code. We're only in NJ for now."; return; }
      var t = S.trades[(S.services[service()] || {}).trade];
      if (!c || !COV || !t) { covEl.textContent = ''; return; }
      var s = COV.trades[(S.services[service()]).trade][c], where = (hit ? hit[1] + ', ' : '') + c + ' County';
      covEl.className = s;
      covEl.textContent = s === 'now' ? where + ': ' + t.pros + ' on call now.'
        : s === 'later' ? where + ': ' + t.pros + ' signed up, but none on call this hour. We\'ll show you who to call.'
        : where + ': no ' + t.pro + ' signed up yet. You can still send a request.';
    };
    // Start on the page's own service if it has one. Otherwise heating, or cooling from May through September.
    var want = book.getAttribute('data-service') || '', keep = sel.value, month = new Date().getMonth();
    if (!want && !book.hasAttribute('data-problem')) want = month >= 4 && month <= 8 ? 'cooling' : 'heating';
    var radio = want && book.querySelector('input[name=s][value="' + want + '"]:not(:disabled)');
    if (radio) radio.checked = true;
    problems(book.hasAttribute('data-problem') ? keep : '');
    book.addEventListener('change', function (e) { if (e.target.name === 's') { problems(); update(); paint(); } });
    zip.addEventListener('input', function () { err.hidden = true; update(); });
    book.addEventListener('submit', function (e) {
      var z = zip.value.trim(), msg = !/^\d{5}$/.test(z) ? 'Enter your 5-digit ZIP code.' : !/^0[78]/.test(z) ? "We're only in New Jersey for now. NJ ZIP codes start with 07 or 08." : '';
      if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; zip.focus(); return; }
      update(); window.track('request_started');
    });
  }
  if (book || covEls.length || pros) {
    var where = pros ? pros.getAttribute('data-county-pros') : '', ptrade = pros ? pros.getAttribute('data-trade') || '' : '';
    window.api('/api/coverage' + (where ? '?county=' + encodeURIComponent(where) + (ptrade ? '&trade=' + ptrade : '') : '')).then(function (d) {
      COV = d;
      var legend = byId('legend'); if (legend) legend.hidden = false;
      paint(); update();
      if (pros) {
        var list = d.contractors || [], s = ((ptrade && d.trades[ptrade]) || d.counties)[where], T = S.trades[ptrade] || { pro: 'contractor', license: 'License' };
        pros.innerHTML = list.length
          ? '<p><span class="pill ' + (s === 'now' ? 'ok' : 'wait') + '">' + (s === 'now' ? 'On call now' : 'Off hours right now') + '</span></p>' +
            list.map(function (c) { return '<div class="card"><b>' + esc(c.company) + '</b><span class="sub small">' + esc(T.license) + ' ' + esc(c.license) + '</span></div>'; }).join('') +
            '<p class="small sub">Send a request and the ones who are free will answer with an arrival time and visit fee.</p>'
          : '<div class="notice warn">No ' + esc(T.pro) + ' has joined in ' + esc(where) + ' County yet. You can still send a request, and we\'ll tell you right away what we can do.</div>';
      }
    }).catch(function () { if (pros) pros.innerHTML = '<p class="sub">We couldn\'t load the list just now. You can still send a request.</p>'; });
  }
})();
