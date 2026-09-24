/* site.js: what every page does. No framework, no build step.
 *   nav      open/close on small screens; mark the section in view
 *   copy     [data-copy] buttons
 *   log      the transparency-log head, its ed25519 signature checked here
 *   stars    GitHub stars for emem, shown only when GitHub answers
 *   count    live counts from emem (skills, topics, log size, coverage)
 *   release  this site's own content address (.well-known/site-manifest.json)
 *   reveal   legacy .reveal blocks on inner pages
 *   gtag     analytics loads after the page, never before it
 */
/* global vx, gtag */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* nav */
  var nav = document.querySelector('[data-nav]'), tog = document.querySelector('[data-nav-toggle]');
  if (nav && tog) {
    tog.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('is-open'); tog.setAttribute('aria-expanded', 'false'); }); });
  }
  var head = document.querySelector('.vx-top');
  if (head) {
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return; tick = true;
      requestAnimationFrame(function () { head.classList.toggle('is-scrolled', window.scrollY > 8); tick = false; });
    }, { passive: true });
  }
  var links = document.querySelectorAll('.vx-nav a[href^="#"]');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { var s = document.querySelector(a.getAttribute('href')); if (s) map[s.id] = a; });
    var spy = new IntersectionObserver(function (en) {
      en.forEach(function (e) { var a = map[e.target.id]; if (a && e.isIntersecting) { links.forEach(function (x) { x.removeAttribute('aria-current'); }); a.setAttribute('aria-current', 'true'); } });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { spy.observe(document.getElementById(id)); });
  }
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href'); if (id.length < 2) return;
      var t = document.querySelector(id); if (!t) return;
      e.preventDefault(); t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });

  /* copy */
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy'), was = b.textContent;
      var ok = function () { b.textContent = 'copied'; b.classList.add('is-copied'); setTimeout(function () { b.textContent = was; b.classList.remove('is-copied'); }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} document.body.removeChild(ta);
      }
    });
  });

  /* reveal (inner pages still carry .reveal) */
  var rev = document.querySelectorAll('.reveal');
  if (rev.length) {
    if (reduce || !('IntersectionObserver' in window)) rev.forEach(function (e) { e.classList.add('in'); });
    else {
      var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.1 });
      rev.forEach(function (e) { io.observe(e); });
    }
  }

  function setText(sel, v) { document.querySelectorAll(sel).forEach(function (e) { e.textContent = v; e.hidden = false; }); }
  function show(sel) { document.querySelectorAll(sel).forEach(function (e) { e.hidden = false; }); }
  if (!window.fetch) return;

  /* the log head: fetched, then its signature verified here */
  var logEls = document.querySelectorAll('[data-loghead]');
  if (logEls.length) {
    fetch('https://emem.dev/v1/log/sth').then(function (r) { return r.json(); }).then(function (j) {
      var s = j.sth || j, ok = false;
      try { ok = !!(window.vx && window.ememVerifyInternals && vx.verifySTH(s)); } catch (e) { ok = false; }
      logEls.forEach(function (el) {
        el.hidden = false;
        var n = el.querySelector('[data-n]'); if (n) n.textContent = Number(s.tree_size).toLocaleString('en-US');
        var m = el.querySelector('[data-mark]'); if (m) { m.textContent = ok ? 'signed ✓' : 'unchecked'; m.className = ok ? 'is-ok' : 'is-warn'; }
        el.title = ok ? 'emem transparency log: ' + s.tree_size + ' entries. The signed tree head was verified in your browser (ed25519 over blake3 of the emem.translog.sth.v1 preimage), signed ' + s.signed_at + '.' : 'emem transparency log head (signature not checked on this page)';
      });
    }).catch(function () {});
  }

  /* GitHub stars */
  if (document.querySelector('[data-stars]')) {
    fetch('https://api.github.com/repos/Vortx-AI/emem').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      if (typeof j.stargazers_count === 'number') setText('[data-stars]', '★ ' + j.stargazers_count);
    }).catch(function () {});
  }

  /* live counts from emem, each shown only once its source answers */
  function count(sel, v) { document.querySelectorAll(sel).forEach(function (e) { e.textContent = v; var p = e.closest('[data-live]'); if (p) p.hidden = false; }); }
  if (document.querySelector('[data-count]')) {
    fetch('https://emem.dev/.well-known/agent-card.json').then(function (r) { return r.json(); }).then(function (j) {
      if (Array.isArray(j.skills)) count('[data-count="skills"]', j.skills.length);
      if (j.version) count('[data-count="version"]', j.version);
    }).catch(function () {});
    fetch('https://emem.dev/v1/topics').then(function (r) { return r.json(); }).then(function (j) {
      var n = j && j.counts && j.counts.live_total; if (typeof n === 'number') count('[data-count="topics"]', n);
    }).catch(function () {});
    fetch('https://emem.dev/v1/coverage_map.svg').then(function (r) { return r.text(); }).then(function (svg) {
      var d = svg.match(/class="dek"[^>]*>([^<]+)</), n = d && d[1].match(/(\d[\d,]*) cells/); if (n) count('[data-count="bins"]', n[1]);
    }).catch(function () {});
    fetch('https://vortx-ai.github.io/ememdemo/llms.txt').then(function (r) { return r.text(); }).then(function (t) {
      var n = t.split('\n').filter(function (l) { return /^(pointed|listed|framed|sensed|mapped|surveyed|chained|stored|diffed|indexed|resolve|open|pin) /.test(l); }).length;
      if (n) count('[data-count="demo"]', n);
    }).catch(function () {});
  }

  /* this site's release id */
  var rel = document.querySelector('[data-release]');
  if (rel) fetch('/.well-known/site-manifest.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
    if (m && typeof m.cid === 'string' && m.cid.length >= 32) { var a = rel.querySelector('a'); if (a) a.textContent = m.cid; rel.hidden = false; }
  }).catch(function () {});

  /* analytics after load and idle, so it never delays a first paint */
  window.addEventListener('load', function () {
    var go = function () { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=G-D71W1Q8YRZ'; document.head.appendChild(s); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 }); else setTimeout(go, 3000);
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-track]');
    if (a && typeof gtag === 'function') { try { gtag('event', a.getAttribute('data-track'), { link_location: a.getAttribute('data-where') || '' }); } catch (x) {} }
  });
})();
