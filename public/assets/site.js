// Shared header, footer, and small helpers for every page.
(function () {
  var S = window.SITE;
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

  var hdr = document.getElementById('site-header');
  if (hdr) hdr.innerHTML = '<header class="hdr"><div class="wrap"><a class="brand" href="/"><i></i>' + esc(S.brand) + '</a>' +
    '<nav class="nav" aria-label="Main"><a class="hide-sm" href="/#how">How it works</a><a href="/contractors">For contractors</a><a class="btn sm" href="/request">Get help now</a></nav></div></header>';
  var ftr = document.getElementById('site-footer');
  if (ftr) ftr.innerHTML = '<footer class="ftr"><div class="wrap"><span>' + esc(S.brand) + ' connects New Jersey homeowners with independent, licensed HVAC contractors. We don\'t perform the work.</span>' +
    '<nav aria-label="Footer"><a href="/contractors">For contractors</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav></div></footer>';
  document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.brand; });
  document.title = document.title + ' | ' + S.brand;
})();
