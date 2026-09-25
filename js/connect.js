/* connect.js: connect a file, a satellite, a robot, a camera.
 *
 *   encode   drop a file: js/encoder.js hashes it in 4 MiB ranges on this device, builds the
 *            pointer.v1 rows and Merkle root, and this page writes the exact note a device
 *            would publish; its 26-character name is blake3(note)[0:16], so the token shown
 *            resolves once that note is published, unchanged
 *   publish  in the emem studio (vortx-ai.github.io/ememdemo) with a key made in the browser,
 *            or from the device itself with `ememdev write`
 *   devices  one recipe per device class; the trace check runs live at emem.dev and again here
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('connect');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev', STUDIO = 'https://vortx-ai.github.io/ememdemo/';
  var $ = function (s) { return root.querySelector(s); };

  /* ---------- token estimates, the ememdemo rules (emem.mjs count, RAW) ---------- */
  function count(t) { return Math.max(1, Math.round(1.098 * (t.match(/[A-Za-z]+/g) || []).length + 2.207 * (t.match(/\d+/g) || []).length + 0.569 * (t.match(/[^\w\s]/g) || []).length + 0.325 * (t.match(/\n/g) || []).length)); }
  var RAW = 0.634; // tokens per byte when a file's bytes are handed to a model as base64
  function tk(n) { return n < 1000 ? String(Math.round(n)) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : n < 1e9 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : (n / 1e9).toFixed(1) + 'B'; }

  /* ---------- the note a device publishes ---------- */
  function noteFor(r, where) {
    var src = where || ('file:' + r.name + ' (on the device that made it)');
    var fm = ['---', 'emem: pointer.v1', 'source: ' + src, 'bytes: ' + r.size, 'etag: not exposed', 'kind: ' + (r.mime || 'file'),
      'chunks: ' + r.hashed + ' of ' + r.units + ' hashed', 'root: ' + r.root, 'hash: blake3-256 of each chunk\'s bytes', 'order: file order, 4 MiB ranges', '---', '',
      '# ' + r.name, '', '> ' + r.size.toLocaleString('en-US') + ' bytes at its source. The data stays there; this note is its address and its proofs. Read any range from the source, then check its BLAKE3 hash below. The root is a Merkle tree over (url, offset, length, hash) of every row, in order.', '',
      '| what | url | offset | length | blake3 |', '|---|---|---|---|---|'];
    r.rows.forEach(function (x) { fm.push('| ' + x.label + ' | · | ' + x.offset + ' | ' + x.length + ' | ' + (x.absent ? 'not hashed yet' : x.hash) + ' |'); });
    return fm.join('\n') + '\n';
  }

  /* ---------- drop a file ---------- */
  var drop = $('.drop'), input = drop && drop.querySelector('input'), out = $('.enc'), worker = null, last = null;
  function bar(sel, frac, txt) { var b = out.querySelector(sel); if (!b) return; b.querySelector('u').style.width = Math.max(1.5, Math.min(100, frac * 100)).toFixed(1) + '%'; b.querySelector('em').textContent = txt; }
  function encode(file) {
    if (!file) return;
    if (worker) worker.terminate();
    out.classList.add('is-on');
    $('[data-enc="name"]').textContent = file.name + ' · ' + vx.fmtBytes(file.size);
    $('[data-enc="state"]').textContent = 'hashing on this device…';
    $('.enc-prog u').style.width = '0%';
    $('[data-enc="addr"]').textContent = '…';
    worker = new Worker('/js/encoder.js');
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'progress') { $('.enc-prog u').style.width = (100 * m.done / m.of).toFixed(1) + '%'; $('[data-enc="state"]').textContent = 'hashed ' + vx.fmtBytes(m.read) + ' · nothing uploaded'; }
      if (m.type === 'done') show(m);
    };
    worker.postMessage({ file: file });
  }
  function show(r) {
    last = r;
    var note = noteFor(r, ($('#enc-where') || {}).value), bytes = vx.enc.encode(note), cid = vx.cid26(bytes);
    var tok = 'emem:tree:' + cid + '#row=0', noteTok = count(note), rawTok = r.size * RAW;
    $('.enc-prog u').style.width = '100%';
    $('[data-enc="state"]').textContent = 'encoded in ' + (r.ms / 1000).toFixed(1) + ' s · ' + r.hashed + ' of ' + r.units + ' ranges hashed · nothing left this device';
    var max = Math.log10(Math.max(rawTok, r.size, 10));
    bar('.is-file', Math.log10(Math.max(1, r.size)) / max, vx.fmtBytes(r.size));
    bar('.is-raw', Math.log10(Math.max(1, rawTok)) / max, '≈ ' + tk(rawTok) + ' tokens');
    bar('.is-tok', Math.log10(Math.max(1, noteTok)) / max, '≈ ' + tk(noteTok) + ' tokens');
    $('[data-enc="addr"]').textContent = tok;
    $('[data-enc="root"]').textContent = 'root ' + r.root;
    var a = $('[data-enc="note"]');
    if (a) { a.href = URL.createObjectURL(new Blob([note], { type: 'text/markdown' })); a.download = r.name.replace(/[^\w.-]+/g, '_') + '.md'; }
    var c = $('[data-enc="cli"]');
    if (c) c.textContent = 'ememdev write --path /memories/by_attester/<you>/' + r.name.replace(/[^\w.-]+/g, '_') + '.md --body-file ' + r.name.replace(/[^\w.-]+/g, '_') + '.md';
  }
  if (drop && input) {
    input.addEventListener('change', function () { encode(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0]) encode(e.dataTransfer.files[0]); });
  }
  var where = $('#enc-where');
  if (where) where.addEventListener('change', function () { if (last) show(last); });

  /* ---------- the studio, embedded ---------- */
  var dlg = document.getElementById('studio'), frame = dlg && dlg.querySelector('iframe'), ext = dlg && dlg.querySelector('[data-studio-ext]');
  function studio(s) {
    var href = STUDIO + (s ? '?s=' + encodeURIComponent(s) : '');
    if (!dlg || typeof dlg.showModal !== 'function') { window.open(href, '_blank', 'noopener'); return; }
    frame.src = href; if (ext) ext.href = href; dlg.showModal();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-studio]');
    if (!b) return;
    e.preventDefault();
    var fromUrl = b.getAttribute('data-studio') === 'url' ? ($('#enc-url') || {}).value : '';
    studio((fromUrl || '').trim());
  });
  if (dlg) {
    dlg.addEventListener('close', function () { frame.removeAttribute('src'); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    var x = dlg.querySelector('[data-studio-close]'); if (x) x.addEventListener('click', function () { dlg.close(); });
  }

  /* ---------- devices ---------- */
  var DEV = {
    satellite: { file: 'pass-0042.tif', what: 'each downlinked scene, or each tile of it' },
    robot: { file: 'shift-12.mcap', what: 'each recorded run, one row per sensor chunk' },
    drone: { file: 'flight-07.mp4', what: 'each flight video, one row per keyframe group' },
    camera: { file: 'cam3-0925.mp4', what: 'each stream segment, as it closes' },
    machine: { file: 'telemetry-0925.jsonl', what: 'each log or telemetry file' }
  };
  function device(k) {
    var d = DEV[k]; if (!d) return;
    root.querySelectorAll('[data-dev]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-dev') === k ? 'true' : 'false'); });
    root.querySelectorAll('[data-devfile]').forEach(function (e) { e.textContent = d.file; });
    var w = $('[data-devwhat]'); if (w) w.textContent = d.what;
  }
  root.querySelectorAll('[data-dev]').forEach(function (b) { b.addEventListener('click', function () { device(b.getAttribute('data-dev')); }); });

  /* ---------- a device trace, checked live ---------- */
  var tb = $('[data-trace]'), tlog = $('[data-trace-log]');
  function line(v, n, kv, ok, where) {
    var li = document.createElement('li'); li.className = ok ? 'is-ok' : 'is-fail';
    li.innerHTML = '<b class="v"></b><span class="n"></span>'; li.firstChild.textContent = v; li.children[1].textContent = n;
    Object.keys(kv).forEach(function (k) { var i = document.createElement('i'); i.className = 'kv'; i.innerHTML = '<span class="k"></span><span class="x"></span>'; i.firstChild.textContent = k; i.lastChild.textContent = kv[k]; li.appendChild(i); });
    if (where) { var e = document.createElement('em'); e.textContent = where; li.appendChild(e); }
    tlog.appendChild(li);
  }
  if (tb && tlog) tb.addEventListener('click', async function () {
    tb.disabled = true; tlog.innerHTML = '';
    try {
      var tok = tb.getAttribute('data-trace');
      var r = await (await fetch(EMEM + '/v1/trace_resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok }) })).json();
      var t = r.trace;
      line('resolve', 'a device’s trace', { platform: t.device.platform, layers: t.segments.length }, !!r.resolved, 'emem.dev');
      var v = await (await fetch(EMEM + '/v1/trace_verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: t, profile: t.device.substrate_profile }) })).json();
      line('verify', 'against its profile', { verdict: v.verdict }, v.verdict === 'admit', 'emem.dev');
      var c = vx.checkTrace(t);
      line('recheck', 'chain, root, signature', { events: vx.group(c.events), signature: c.sigOk ? 'the device’s, valid' : 'invalid' }, c.chain && c.rootOk && c.sigOk && c.cid === tok.slice(11), 'this browser');
    } catch (e) { line('stop', 'trace check', { why: vx.why(e, 'emem.dev') }, false); }
    tb.disabled = false;
  });

  /* ---------- copy buttons inside this section ---------- */
  root.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = root.querySelector(b.getAttribute('data-copy-from'));
      if (!src || !navigator.clipboard) return;
      navigator.clipboard.writeText(src.textContent).then(function () { var t = b.textContent; b.textContent = 'copied'; setTimeout(function () { b.textContent = t; }, 1400); });
    });
  });
})();
