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
    // the button says what it will do: open the menu, or close it
    var shut = function () { nav.classList.remove('is-open'); tog.setAttribute('aria-expanded', 'false'); tog.textContent = 'Menu'; };
    tog.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      tog.setAttribute('aria-expanded', open ? 'true' : 'false'); tog.textContent = open ? 'Close' : 'Menu';
    });
    nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', shut); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { shut(); tog.focus(); } });
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
    // a link marks the section it leads to while that section crosses the middle of the screen, and nothing
    // is marked above the first one (an alias anchor stands for the section it sits in)
    var map = new Map(), inside = new Set();
    links.forEach(function (a) { var s = document.querySelector(a.getAttribute('href')); if (s && s.classList.contains('alias')) s = s.closest('section'); if (s) map.set(s, a); });
    var spy = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) inside.add(e.target); else inside.delete(e.target); });
      var on = null; map.forEach(function (a, s) { if (!on && inside.has(s)) on = a; });
      links.forEach(function (x) { if (x === on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach(function (a, s) { spy.observe(s); });
  }
  // the paid sessions are retired: an old ?tier= link lands on the chapter that replaced them
  if (/[?&]tier=/.test(location.search)) { var bw = document.getElementById('build'); if (bw) window.addEventListener('load', function () { bw.scrollIntoView({ block: 'start' }); }); }
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
    // a bare "copy" says what it copies, so a list of buttons can be told apart
    if (!b.hasAttribute('aria-label') && /^copy$/i.test(b.textContent.trim())) {
      var hd = b.closest('.codeblock-head'), what = hd && hd.querySelector('span') ? hd.querySelector('span').textContent.trim() : '', t = b.getAttribute('data-copy');
      b.setAttribute('aria-label', 'Copy' + (what ? ' from ' + what : '') + ': ' + (t.length > 56 ? t.slice(0, 55) + '…' : t));
    }
    b.addEventListener('click', function () {
      if (b.classList.contains('is-copied')) return;
      var text = b.getAttribute('data-copy'), was = b.innerHTML;
      var ok = function () { b.textContent = /^[A-Z]/.test(b.textContent.trim()) ? 'Copied' : 'copied'; b.classList.add('is-copied'); setTimeout(function () { b.innerHTML = was; b.classList.remove('is-copied'); }, 1500); };
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
        var m = el.querySelector('[data-mark]'); if (m) { m.textContent = ok ? '✓' : 'unchecked'; m.className = ok ? 'is-ok' : 'is-warn'; }
        var w = el.querySelector('[data-lh]'); if (w) w.hidden = false;
        el.title = ok ? 'emem’s public log holds ' + Number(s.tree_size).toLocaleString('en-US') + ' records. The signature on its head was checked in your browser (ed25519), signed ' + s.signed_at + '.' : 'emem’s public log (its signature was not checked on this page)';
      });
      var sinceEls = document.querySelectorAll('[data-logsince]');
      if (ok && sinceEls.length) since(s, sinceEls);
    }).catch(function () {});
  }

  /* since this browser last saw the log: the head it remembered must be a prefix of the head now, proved by an
     RFC 6962 consistency proof folded here over blake3 (node = blake3(0x01|l|r)). A first visit proves nothing,
     and says so; the remembered head never leaves this browser */
  var LOGPIN = '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka', LOGKEY = 'vx.loghead.v1';
  function sameBytes(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function consistent(m, r1, n, r2, proof) {
    if (m === 0 || m > n) return false;
    if (m === n) return proof.length === 0 && sameBytes(r1, r2);
    var node = function (l, r) { return vx.blake3(vx.cat(new Uint8Array([1]), l, r)); };
    var p = proof.slice(), fn = m - 1, sn = n - 1;
    if ((m & (m - 1)) === 0) p.unshift(r1);
    if (!p.length) return false;
    while (fn % 2 === 1) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
    var fr = p[0], sr = p[0];
    for (var i = 1; i < p.length; i++) {
      if (sn === 0) return false;
      if (fn % 2 === 1 || fn === sn) {
        fr = node(p[i], fr); sr = node(p[i], sr);
        while (fn % 2 === 0 && fn !== 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
      } else sr = node(sr, p[i]);
      fn = Math.floor(fn / 2); sn = Math.floor(sn / 2);
    }
    return sn === 0 && sameBytes(fr, r1) && sameBytes(sr, r2);
  }
  function since(s, els) {
    if (s.responder_pubkey_b32 !== LOGPIN || !window.vx) return;
    var prev = null; try { prev = JSON.parse(localStorage.getItem(LOGKEY) || 'null'); } catch (e) { prev = null; }
    var keep = function () { try { localStorage.setItem(LOGKEY, JSON.stringify({ tree_size: s.tree_size, root_b32: s.root_b32, seen_at: new Date().toISOString() })); } catch (e) {} };
    var say = function (cls, t) { els.forEach(function (e) { e.hidden = false; e.classList.remove('is-ok', 'is-bad'); if (cls) e.classList.add(cls); e.textContent = t; }); };
    var when = function (iso) { var d = new Date(iso); return isNaN(d) ? 'your last visit' : d.toUTCString().slice(5, 16) + ', ' + d.toUTCString().slice(17, 22) + ' UTC'; };
    var grew = function (n) { return Number(n).toLocaleString('en-US'); };
    if (!prev || !prev.tree_size || !prev.root_b32) { keep(); say('', 'This browser now remembers the log’s signed head. Come back later, and it will prove the log only grew.'); return; }
    if (prev.tree_size > s.tree_size) { say('is-bad', 'The log is shorter than when this browser saw it on ' + when(prev.seen_at) + '.'); return; }
    if (prev.tree_size === s.tree_size) {
      if (prev.root_b32 === s.root_b32) say('is-ok', 'Unchanged since ' + when(prev.seen_at) + ' ✓');
      else say('is-bad', 'Same length as on ' + when(prev.seen_at) + ', but a different root: history changed.');
      return;
    }
    fetch('https://emem.dev/v1/log/consistency?first=' + prev.tree_size + '&second=' + s.tree_size).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (c) {
      var fine = c.first_root_b32 === prev.root_b32 && c.second_root_b32 === s.root_b32 &&
        consistent(prev.tree_size, vx.unb32(prev.root_b32), s.tree_size, vx.unb32(s.root_b32), (c.consistency_proof_b32 || []).map(vx.unb32));
      if (fine) { say('is-ok', 'Since ' + when(prev.seen_at) + ' it grew by ' + grew(s.tree_size - prev.tree_size) + ', and the proof that it only grew checks here ✓'); keep(); }
      else say('is-bad', 'The proof that the log only grew since ' + when(prev.seen_at) + ' did not check.');
    }).catch(function () {});
  }

  /* GitHub stars: not shown in the top bar any more (a count is not a check); kept for pages that ask with data-stars-show */
  if (document.querySelector('[data-stars][data-stars-show]')) {
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

  /* any sample named on a page re-checks its note as it loads, as the ememdemo gallery does:
     base32(blake3(bytes)[0:16]) must equal the note's name */
  if (window.vx) document.querySelectorAll('[data-note-check]').forEach(function (e) {
    var cid = e.getAttribute('data-note-check');
    fetch('https://emem.dev/memories/by_attester/ddzmyzhn/' + cid + '.md').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (b) {
      var ok = vx.cid26(new Uint8Array(b)) === cid;
      e.textContent = ok ? '✓ note' : '✗ name lies'; e.classList.add(ok ? 'is-ok' : 'is-bad');
      e.title = ok ? 'this note hashes to its name, checked in your browser' : 'the bytes do not hash to the name';
    }).catch(function () { e.textContent = 'unreachable'; e.title = 'not checked: emem.dev could not be reached, which is not a failed check'; });
  });

  /* this site's release id */
  var rel = document.querySelector('[data-release]');
  if (rel) fetch('/.well-known/site-manifest.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
    if (m && typeof m.cid === 'string' && m.cid.length >= 32) { var a = rel.querySelector('a'); if (a) a.textContent = m.cid; rel.hidden = false; }
  }).catch(function () {});

  /* analytics after load and idle, so it never delays a first paint; never for a browser that asks not to be
     tracked (Global Privacy Control or Do Not Track), and never with ad signals (the consent defaults in <head>) */
  var optout = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  if (!optout) window.addEventListener('load', function () {
    var go = function () { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=G-D71W1Q8YRZ'; document.head.appendChild(s); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 }); else setTimeout(go, 3000);
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-track]');
    if (a && typeof gtag === 'function') { try { gtag('event', a.getAttribute('data-track'), { link_location: a.getAttribute('data-where') || '' }); } catch (x) {} }
  });
})();
