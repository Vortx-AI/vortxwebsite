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
 * The pipeline above the result draws from the run's own lines as they are written: each stage shows
 * the number that step produced, labelled by what it is, and turns green only when its check passed.
 * Samples are ememdemo's own (vortx-ai.github.io/ememdemo); pictures are their thumb.v1 images.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('run'), E = window.vxEngine;
  if (!root || !window.vx || !E) return;
  var $ = function (s) { return root.querySelector(s); };
  var log = $('.run-log'), sum = $('.run-sum'), pic = $('.run-pic'), cap = $('.run-cap'), again = $('[data-run-again]'), open = $('[data-run-note]'), copy = $('[data-run-copy]');
  var pipe = $('.pipe'), STAGES = ['capture', 'encode', 'send', 'decode', 'check'];
  var RUNS = {};
  root.querySelectorAll('[data-run]').forEach(function (b) {
    RUNS[b.getAttribute('data-run')] = { cid: b.getAttribute('data-cid'), label: b.getAttribute('data-label') || '', trace: b.getAttribute('data-trace'), camera: b.hasAttribute('data-camera'), who: b.getAttribute('data-who') || '' };
  });
  var cur = null, gen = 0, catalog = null, thumbs = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- the pipeline: five stages, filled by the run ---------- */
  function stage(k) { return pipe && pipe.querySelector('[data-pp="' + k + '"]'); }
  function paint(li, x, unit, y) {
    var X = li.querySelector('[data-pp-x]'), Y = li.querySelector('[data-pp-y]');
    X.textContent = x || '–';
    if (unit) X.appendChild(el('small', null, ' ' + unit));
    Y.textContent = '';
    (y || []).filter(Boolean).forEach(function (t, i) {
      if (i) Y.appendChild(document.createTextNode(' · '));
      // a passed check reads in green; everything else is plain
      if (/✓/.test(t)) Y.appendChild(el('b', null, t)); else Y.appendChild(document.createTextNode(t));
    });
  }
  function reset() {
    if (!pipe) return;
    pipe.style.setProperty('--p', 0);
    STAGES.forEach(function (k) { var li = stage(k); if (!li) return; li.className = 'pp'; paint(li, '', '', []); });
    var first = stage('capture'); if (first) first.classList.add('is-now');
  }
  function short(t) { t = String(t || ''); return t.length > 34 ? t.replace(/^(emem:[a-z]+:.{8}).*?(#.*)?$/, function (m, a, b) { return a + '…' + (b || ''); }) : t; }
  function lead(s) { return String(s || '').split(' of ')[0]; }
  // what each step produced, as a number with its label, and the rest in a line under it
  function show(v, n, kv, x) {
    var k = Object.keys(kv), rest = function (skip) { return k.filter(function (q) { return skip.indexOf(q) < 0; }).map(function (q) { return q + ' ' + kv[q]; }); };
    var nt = x && E.tokOf(x.kv.tok);
    if (v === 'capture') {
      if (kv.file && /not published/.test(kv.file)) return ['—', '', ['its source does not publish the size', kv.at ? 'stays at ' + kv.at : '']];
      if (kv.file) return [kv.file, '', [kv.at ? 'stays at ' + kv.at : 'stays where it is']];
      if (kv.readings) return [String(kv.readings), 'readings', [kv.layers ? kv.layers + ' layers' : '', kv.at]];
      if (kv.frames) return [String(kv.frames), 'frames', [kv.from && kv.to ? kv.from + ' to ' + kv.to : '']];
      if (kv.squares) return [String(kv.squares), 'squares', [kv.maps ? kv.maps + ' maps' : '']];
      if (kv.files) return [String(kv.files), 'files', [kv.size, kv.kind]];
      if (kv.camera) return [kv.camera, '', [kv.captured]];
      if (kv.platform) return [kv.platform, '', [kv.layers ? 'layers: ' + kv.layers : '']];
    }
    if (v === 'encode') {
      var pieces = kv.hashed ? kv.hashed + ' pieces fingerprinted' : kv.rows ? kv.rows + ' pieces' : kv.cameras != null ? kv.cameras + ' cameras' : '';
      var y = [pieces, kv.name ? 'named ' + kv.name : '', kv.root ? 'root ' + kv.root : kv.chain ? 'chain ' + kv.chain : ''];
      // a model reads the note, not the file: its size in context tokens, from the catalogue line
      if (nt) return [E.tk(nt), 'context tokens', ['the note, for a model to read'].concat(y)];
      return [kv.hashed ? lead(kv.hashed) : kv.rows || '1', kv.hashed || kv.rows ? 'pieces' : 'note', y.slice(1)];
    }
    if (v === 'send') {
      var t = kv.token != null ? kv.token : kv.tokens + ' tokens';
      return [String(kv.bytes), 'bytes', [short(t)]];
    }
    if (v === 'decode') {
      if (kv.hashes) return [lead(kv.hashes.replace(' to the root', '')), 'hashes', [kv.row, 'to the root ' + (/✓/.test(kv.match || '') ? '✓' : kv.match)]];
      if (kv.holds) return [lead(kv.holds), 'readings', ['signature ' + kv.signature, 'name ' + kv.name]];
      if (kv.signed) return [kv.signed, 'signed', rest(['signed'])];
      if (kv.chain) return ['chain', '', [kv.chain]];
      if (kv.read) return [kv.read, '', rest(['read'])];
      if (kv.verdict) return [kv.verdict, '', ['profile ' + kv.profile]];
    }
    if (v === 'check') {
      if (kv.read) { var of = String(kv.read).split(' of '); return [of[0], '', [of[1] ? 'of ' + of[1] : '', kv.blake3 ? 'blake3 ' + kv.blake3 : '', kv.signature ? 'signature ' + kv.signature : '', kv.by || '']]; }
      if (kv.events) return [String(kv.events), 'events', ['signature ' + kv.signature]];
      if (kv.verdict) return [kv.verdict, '', [kv.signed ? 'signed ' + kv.signed : '', kv.receipt ? 'receipt ' + kv.receipt : '']];
      if (kv.signature) return [kv.signature, '', rest(['signature'])];
    }
    return [k.length ? String(kv[k[0]]) : n, '', rest(k.slice(0, 1))];
  }
  function step(key, x) {
    return function (v, n, kv, st) {
      if (!pipe || key !== cur) return;
      if (v === 'see') { seen(kv, st); return; }
      var i = STAGES.indexOf(v);
      if (v === 'stop') i = STAGES.findIndex(function (k) { return !/is-(done|fail)/.test(stage(k).className); });
      if (i < 0) return;
      var li = stage(STAGES[i]); if (!li) return;
      var bad = st === 'fail' || li.classList.contains('is-fail');
      li.classList.remove('is-now', 'is-done');
      // a source that did not answer is not a failed check: the stage waits, and says why
      if (v === 'stop') { li.classList.add('is-off'); paint(li, '—', '', ['not reached: ' + kv.why]); }
      else { li.classList.add(bad ? 'is-fail' : 'is-done'); var o = show(v, n, kv, x); paint(li, o[0], o[1], o[2]); }
      var furthest = -1; STAGES.forEach(function (k, j) { if (stage(k).classList.contains('is-done')) furthest = j; });
      pipe.style.setProperty('--p', Math.max(0, furthest) / (STAGES.length - 1));
      STAGES.forEach(function (k) { stage(k).classList.remove('is-now'); });
      var next = STAGES.slice(i + 1).map(stage).filter(function (s) { return s && !/is-(done|fail)/.test(s.className); })[0];
      if (next && !bad && v !== 'stop') next.classList.add('is-now');
    };
  }
  // stages a record does not have (a trace has no note to encode) say so, rather than wait for ever
  function settle() {
    if (!pipe) return;
    STAGES.forEach(function (k) {
      var li = stage(k); li.classList.remove('is-now');
      if (!/is-(done|fail)/.test(li.className)) { li.classList.add('is-skip'); paint(li, '—', '', ['not needed for this record']); }
    });
  }
  function seen(kv, st) {
    var s = cap && cap.querySelector('.run-seen'); if (!s) return;
    var parts = [kv.tile || kv.picture || kv.rows || '', kv.note || kv.stats || ''].filter(Boolean);
    s.textContent = 'Decoded here from the checked bytes' + (parts.length ? ': ' + parts.join(' · ') : '');
    s.classList.toggle('is-bad', st === 'fail'); s.vxSeen = true;
  }

  function showSample(key) {
    var r = RUNS[key], x = catalog && catalog.filter(function (i) { return i.cid === r.cid; })[0], t = thumbs[r.cid];
    pic.className = 'run-pic'; pic.style.backgroundImage = ''; pic.style.removeProperty('--n'); pic.innerHTML = '';
    if (t) { pic.style.backgroundImage = 'url(' + t.file + ')'; if (t.frames > 1) { pic.classList.add('is-sprite'); pic.style.setProperty('--n', t.frames); } }
    else if (!r.trace) { pic.classList.add('is-none'); pic.appendChild(el('span', null, 'no saved picture')); }
    else { pic.classList.add('is-trace'); pic.appendChild(el('span', null, 'a device trace has no picture: it is the device’s own signed record of what ran')); }
    cap.innerHTML = '';
    if (x) {
      cap.appendChild(el('strong', null, 'What the agent sees'));
      cap.appendChild(el('span', null, [x.title, r.who].filter(Boolean).join(' · ')));
      cap.appendChild(el('span', 'run-seen', 'the saved picture, until the bytes are checked'));
    } else if (r.trace) {
      cap.appendChild(el('strong', null, 'A device’s execution trace'));
      cap.appendChild(el('span', null, r.who));
    }
    if (open) { open.href = r.cid ? E.NOTE(r.cid) : 'https://emem.dev/v1/trace_resolve'; open.hidden = !r.cid; }
    if (copy) copy.hidden = !x;
    if (copy && x) copy.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(x.line).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy the agent line'; }, 1400); }); };
    return x;
  }
  // the decoded picture takes the saved one's place, with what it is
  function showLive(node, tag) {
    pic.className = 'run-pic is-tile'; pic.style.backgroundImage = ''; pic.innerHTML = ''; pic.appendChild(node);
    if (tag) pic.appendChild(el('span', 'run-tag', tag));
  }
  function retag(t) { var s = pic.querySelector('.run-tag'); if (s) s.textContent = t; }
  function done() { root.classList.remove('is-running'); if (again) again.disabled = false; }
  // the result, in words: how many checks passed here, and how much less a model reads
  var verdict = $('.run-verdict');
  function judge(R, x) {
    if (!verdict) return;
    var nt = x && E.tokOf(x.kv.tok), rt = x && E.tokOf(x.kv.raw), ok = R.passed === R.checks && R.checks;
    verdict.className = 'run-verdict ' + (ok ? 'is-ok' : 'is-fail'); verdict.innerHTML = '';
    verdict.appendChild(el('b', null, R.passed + '/' + R.checks + (ok ? ' ✓' : ' ✕')));
    verdict.appendChild(el('span', null, ok ? 'checks passed in this browser' : 'checks passed in this browser; the others failed'));
    if (nt && rt) verdict.appendChild(el('span', 'run-less', Math.round(rt / nt).toLocaleString('en-US') + '× less for a model to read than the raw file'));
    (R.notes || []).forEach(function (t) { verdict.appendChild(el('span', 'is-note', '! ' + t)); });
    if (sum) { sum.innerHTML = ''; sum.appendChild(el('p', 'run-score', vx.fmtBytes(R.L.total) + ' fetched in all, from ' + Object.keys(R.L.hosts).join(', '))); }
    // a run that checks its piece without drawing it says so, rather than leave the placeholder
    var s = cap && cap.querySelector('.run-seen'); if (s && !s.vxSeen) s.textContent = 'The saved picture: this run checks the piece’s bytes; it does not draw them';
  }

  async function run(key) {
    var r = RUNS[key]; if (!r) return;
    var g = ++gen; cur = key;
    root.querySelectorAll('[data-run]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-run') === key ? 'true' : 'false'); });
    log.innerHTML = ''; if (sum) sum.innerHTML = ''; root.classList.add('is-running'); if (again) again.disabled = true;
    if (verdict) { verdict.className = 'run-verdict'; verdict.innerHTML = '<b>…</b><span>running, live</span>'; }
    reset();
    var x = showSample(key), R = new E.Run({ log: log, show: showLive, retag: retag, live: function () { return g === gen; }, step: step(key, x) });
    try {
      await E.auto(R, r, x);
      if (g === gen) { settle(); judge(R, x); done(); }
    } catch (e) {
      if (g !== gen) return;
      R.line('stop', key, { why: vx.why(e, 'a source') }, 'fail', null); done();
      STAGES.forEach(function (k) { var li = stage(k); if (li) li.classList.remove('is-now'); });
      // a source that did not answer is not a failed check: say so, and check nothing
      if (verdict) { verdict.className = 'run-verdict is-off'; verdict.innerHTML = ''; verdict.appendChild(el('b', null, '—')); verdict.appendChild(el('span', null, 'not checked: ' + vx.why(e, 'a source'))); }
    }
  }

  root.querySelectorAll('[data-run]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-run')); }); });
  if (again) again.addEventListener('click', function () { run(cur); });

  function start() {
    // the catalogue only names the sample; if it does not answer, the run still runs, and says what did not answer
    Promise.all([(window.vxCatalog || Promise.resolve([])).catch(function () { return []; }), fetch('/data/thumbs.json').then(function (r) { return r.json(); }).catch(function () { return { thumbs: [] }; })]).then(function (res) {
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
