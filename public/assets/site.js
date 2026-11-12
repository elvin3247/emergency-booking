// Shared on every page: header, footer, helpers, the booking bar, live coverage, and visit tracking.
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

  var hdr = byId('site-header');
  if (hdr) hdr.innerHTML = '<header class="hdr"><div class="wrap"><a class="brand" href="/"><i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg></i>' + esc(S.brand) + '</a>' +
    '<nav class="nav" aria-label="Main"><a class="hide-sm" href="/#how">How it works</a><a class="hide-sm" href="/help">Quick checks</a><a href="/contractors">For contractors</a><a class="btn sm" href="/request">Get help now</a></nav></div></header>' +
    (open && !/^\/(status|respond)/.test(location.pathname) ? '<div class="openreq"><div class="wrap"><span>You have a request in progress on this device.</span><a class="btn sm dark" href="/status?t=' + encodeURIComponent(open.t) + '">View your request</a></div></div>' : '');
  var ftr = byId('site-footer');
  if (ftr) ftr.innerHTML = '<footer class="ftr"><div class="wrap"><span>' + esc(S.brand) + ' connects New Jersey homeowners with independent, licensed HVAC contractors. We don\'t perform the work.</span>' +
    '<nav aria-label="Footer"><a href="/hvac">Service areas</a><a href="/help">Quick checks</a><a href="/contractors">For contractors</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>' +
    '<span class="credit">ZIP code data from <a href="https://www.geonames.org/" rel="noopener">GeoNames</a>, CC BY 4.0.</span></div></footer>';
  document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.brand; });
  if (document.title.indexOf(S.brand) < 0) document.title = document.title + ' | ' + S.brand;

  // Booking bar and live coverage (home page, county pages, and guides).
  var book = byId('book'), covEls = document.querySelectorAll('[data-cov]'), pros = document.querySelector('[data-county-pros]'), COV = null;
  var update = function () {};
  if (book) {
    var zip = book.elements.zip, county = book.elements.county, fixed = book.getAttribute('data-county') || '', covEl = byId('b-cov'), err = byId('b-err');
    var lookup = function () { return window.NJ_ZIPS ? window.NJ_ZIPS[zip.value.trim()] : null; };
    update = function () {
      var z = zip.value.trim(), hit = lookup(), c = hit ? S.counties[hit[0]] : (z ? '' : fixed) || fixed;
      county.value = hit ? c : fixed;
      if (/^\d{5}$/.test(z) && !/^0[78]/.test(z)) { covEl.className = 'none'; covEl.textContent = "That's not a New Jersey ZIP code. We're only in NJ for now."; return; }
      if (!c || !COV) { covEl.textContent = ''; return; }
      var s = COV.counties[c], where = (hit ? hit[1] + ', ' : '') + c + ' County';
      covEl.className = s;
      covEl.textContent = s === 'now' ? where + ': contractors on call now.'
        : s === 'later' ? where + ': contractors signed up, but none on call this hour. We\'ll show you who to call.'
        : where + ': no contractor yet. You can still send a request.';
    };
    zip.addEventListener('input', function () { err.hidden = true; update(); });
    book.addEventListener('submit', function (e) {
      var z = zip.value.trim(), msg = !/^\d{5}$/.test(z) ? 'Enter your 5-digit ZIP code.' : !/^0[78]/.test(z) ? "We're only in New Jersey for now. NJ ZIP codes start with 07 or 08." : '';
      if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; zip.focus(); return; }
      update(); window.track('request_started');
    });
  }
  if (book || covEls.length || pros) {
    var where = pros ? pros.getAttribute('data-county-pros') : '';
    window.api('/api/coverage' + (where ? '?county=' + encodeURIComponent(where) : '')).then(function (d) {
      COV = d;
      covEls.forEach(function (el) { var s = d.counties[el.getAttribute('data-cov')], dot = el.querySelector('.dot'); if (dot && s !== 'none') dot.classList.add(s); });
      var legend = byId('legend'); if (legend) legend.hidden = false;
      var fee = byId('fee-line');
      if (fee && d.visit_fee) fee.textContent = 'Contractors here charge $' + d.visit_fee.min + (d.visit_fee.max > d.visit_fee.min ? ' to $' + d.visit_fee.max : '') + ' to visit';
      update();
      if (pros) {
        var list = d.contractors || [], s = d.counties[where];
        pros.innerHTML = list.length
          ? '<p><span class="pill ' + (s === 'now' ? 'ok' : 'wait') + '">' + (s === 'now' ? 'On call now' : 'Off hours right now') + '</span></p>' +
            list.map(function (c) { return '<div class="card"><b>' + esc(c.company) + '</b><span class="sub small">NJ HVACR license ' + esc(c.license) + '</span></div>'; }).join('') +
            '<p class="small sub">Send a request and the ones who are free will answer with an arrival time and visit fee.</p>'
          : '<div class="notice warn">No contractor has joined in ' + esc(where) + ' County yet. You can still send a request, and we\'ll tell you right away what we can do.</div>';
      }
    }).catch(function () { if (pros) pros.innerHTML = '<p class="sub">We couldn\'t load the list just now. You can still send a request.</p>'; });
  }
})();
