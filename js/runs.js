/* runs.js: keep the file, send the token. One real published sample per device, end to end, live.
 *
 * Every step runs now, in this browser, against the real source and emem.dev:
 *   capture  the file, still where the device left it: its size read from the source (HEAD)
 *   encode   the note: fetched, hashed to its name, its Merkle root rebuilt from every row
 *   send     the token, emem:tree:<cid>#row=<i>: a few dozen bytes instead of the file
 *   decode   @emem proves that row belongs: GET /v1/tree/<cid>?row=<i>, log2(n) hashes walked to the root
 *   check    the row's bytes, read from the source by range and hashed here; if the source refuses
 *            browsers, emem hashes them next to the data (POST /v1/range_hash) and this page checks its
 *            signature instead, and says so
 * A device trace runs the same way: resolve, verify against its profile, recheck its chain and signature.
 * Samples are ememdemo's own (vortx-ai.github.io/ememdemo); pictures are their thumb.v1 images.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('run'), E = window.vxEngine;
  if (!root || !window.vx || !E) return;
  var $ = function (s) { return root.querySelector(s); };
  var log = $('.run-log'), sum = $('.run-sum'), pic = $('.run-pic'), cap = $('.run-cap'), again = $('[data-run-again]'), open = $('[data-run-note]'), copy = $('[data-run-copy]');
  var RUNS = {};
  root.querySelectorAll('[data-run]').forEach(function (b) {
    RUNS[b.getAttribute('data-run')] = { cid: b.getAttribute('data-cid'), label: b.getAttribute('data-label') || '', trace: b.getAttribute('data-trace'), camera: b.hasAttribute('data-camera'), who: b.getAttribute('data-who') || '' };
  });
  var cur = null, gen = 0, catalog = null, thumbs = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function showSample(key) {
    var r = RUNS[key], x = catalog && catalog.filter(function (i) { return i.cid === r.cid; })[0], t = thumbs[r.cid];
    pic.className = 'run-pic'; pic.style.backgroundImage = ''; pic.style.removeProperty('--n'); pic.innerHTML = '';
    if (t) { pic.style.backgroundImage = 'url(' + t.file + ')'; if (t.frames > 1) { pic.classList.add('is-sprite'); pic.style.setProperty('--n', t.frames); } }
    else if (!r.trace) { pic.classList.add('is-none'); pic.appendChild(el('span', null, 'no saved picture')); }
    else { pic.classList.add('is-trace'); pic.appendChild(el('span', null, 'a device trace has no picture: it is the device’s own signed record of what ran')); }
    cap.innerHTML = '';
    if (x) {
      cap.appendChild(el('strong', null, x.title));
      cap.appendChild(el('span', null, [r.who, x.kv.src].filter(Boolean).join(' · ')));
      cap.appendChild(el('span', 'run-line', x.verb + ' ' + x.kind + ' · ' + (x.kv.by || '').replace('-', ' ')));
    } else if (r.trace) {
      cap.appendChild(el('strong', null, 'A device’s execution trace'));
      cap.appendChild(el('span', null, r.who));
    }
    if (open) { open.href = r.cid ? E.NOTE(r.cid) : 'https://emem.dev/v1/trace_resolve'; open.hidden = !r.cid; }
    if (copy) copy.hidden = !x;
    if (copy && x) copy.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(x.line).then(function () { copy.textContent = 'copied'; setTimeout(function () { copy.textContent = 'copy the agent line'; }, 1400); }); };
    return x;
  }
  // the decoded picture takes the saved one's place, with what it is
  function showLive(node, tag) {
    pic.className = 'run-pic is-tile'; pic.style.backgroundImage = ''; pic.innerHTML = ''; pic.appendChild(node);
    if (tag) pic.appendChild(el('span', 'run-tag', tag));
  }
  function retag(t) { var s = pic.querySelector('.run-tag'); if (s) s.textContent = t; }
  function done() { root.classList.remove('is-running'); if (again) again.disabled = false; }
  // the result first: checks passed, what stayed, what moved, how much less an agent reads
  var verdict = $('.run-verdict');
  function judge(R, x, out) {
    if (!verdict) return;
    var nt = x && E.tokOf(x.kv.tok), rt = x && E.tokOf(x.kv.raw), ok = R.passed === R.checks && R.checks;
    verdict.className = 'run-verdict ' + (ok ? 'is-ok' : 'is-fail'); verdict.innerHTML = '';
    var b = document.createElement('b'); b.textContent = R.passed + '/' + R.checks + (ok ? ' ✓' : ' ✕'); verdict.appendChild(b);
    [out && out.fileB ? vx.fmtSize(out.fileB) + ' stayed put' : '', out && out.tb ? out.tb + ' bytes moved' : '', nt && rt ? Math.round(rt / nt).toLocaleString('en-US') + '× less to read' : ''].filter(Boolean).forEach(function (t) { var sp = document.createElement('span'); sp.textContent = t; verdict.appendChild(sp); });
    (R.notes || []).forEach(function (t) { var sp = document.createElement('span'); sp.className = 'is-note'; sp.textContent = '! ' + t; verdict.appendChild(sp); });
    // the storyline under the hero ends on this result
    var sc = document.querySelector('.st [data-st="score"]');
    if (sc && R.checks) {
      sc.textContent = R.passed + '/' + R.checks + (ok ? ' ✓' : ' ✕'); sc.classList.toggle('is-ok', !!ok); sc.classList.toggle('is-bad', !ok);
      sc.setAttribute('aria-label', R.passed + ' of ' + R.checks + ' checks passed, in this browser: see the run');
      var cp = sc.parentNode.querySelector('span:last-child'); if (cp) cp.textContent = 'just now, in this browser';
    }
  }

  async function run(key) {
    var r = RUNS[key]; if (!r) return;
    var g = ++gen; cur = key;
    root.querySelectorAll('[data-run]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-run') === key ? 'true' : 'false'); });
    log.innerHTML = ''; sum.innerHTML = ''; root.classList.add('is-running'); if (again) again.disabled = true;
    if (verdict) { verdict.className = 'run-verdict'; verdict.innerHTML = '<b>…</b><span>running, live</span>'; }
    var x = showSample(key), R = new E.Run({ log: log, show: showLive, retag: retag, live: function () { return g === gen; } });
    try {
      var out = await E.auto(R, r, x);
      if (g === gen) { E.tally(sum, R, x, out); judge(R, x, out); done(); }
    } catch (e) {
      if (g !== gen) return;
      R.line('stop', key, { why: vx.why(e, 'a source') }, 'fail', null); done();
      // a source that did not answer is not a failed check: say so, and check nothing
      if (verdict) { verdict.className = 'run-verdict is-off'; verdict.innerHTML = ''; var b = document.createElement('b'); b.textContent = '—'; verdict.appendChild(b); var sp = document.createElement('span'); sp.textContent = 'not checked: ' + vx.why(e, 'a source'); verdict.appendChild(sp); }
    }
  }

  root.querySelectorAll('[data-run]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-run')); }); });
  if (again) again.addEventListener('click', function () { run(cur); });

  function start() {
    Promise.all([window.vxCatalog || Promise.resolve([]), fetch('/data/thumbs.json').then(function (r) { return r.json(); }).catch(function () { return { thumbs: [] }; })]).then(function (res) {
      catalog = res[0]; (res[1].thumbs || []).forEach(function (t) { if (t.record) thumbs[t.record] = t; });
      var first = root.querySelector('[data-run][aria-selected="true"]') || root.querySelector('[data-run]');
      run(first.getAttribute('data-run'));
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '200px' });
    io.observe(root);
  } else start();
})();
