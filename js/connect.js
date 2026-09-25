/* connect.js: connect a file, a satellite, a robot, a camera.
 *
 *   encode   drop a file: js/encoder.js hashes it in 4 MiB ranges on this device, builds the
 *            pointer.v1 rows and Merkle root, and this page writes the exact note a device
 *            would publish; its 26-character name is blake3(note)[0:16], so the token shown
 *            resolves once that note is published, unchanged
 *   publish  in the emem studio (vortx-ai.github.io/ememdemo) with a key made in the browser,
 *            or from the device itself with `ememdev write`
 *   devices  one recipe per device class, each a real published sample; the run above checks the same one live
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

  /* ---------- the note a device publishes: laid out as ememdemo's pointers, the same as tools/emem_point.py ---------- */
  function sizeText(n) {
    if (n >= 1e9) { var h = Math.floor((n + 5e6) / 1e7); return Math.floor(h / 100) + '.' + String(h % 100).padStart(2, '0') + ' GB'; }
    var mb = n >= 1e6, t = mb ? Math.floor((n + 50000) / 100000) : Math.floor((n + 50) / 100);
    return Math.floor(t / 10) + '.' + (t % 10) + (mb ? ' MB' : ' KB');
  }
  function noteFor(r, where, after) {
    var src = where || ('file:' + r.name + ' (on the device that made it)'), at = 'on the device that made it', all = r.hashed === r.units;
    if (where) { try { at = 'at ' + new URL(where).hostname; } catch (e) {} }
    var out = ['---'].concat(after ? [after] : [], ['emem: pointer.v1', 'source: ' + src, 'bytes: ' + r.size, 'etag: not exposed', 'kind: ' + r.kind,
      'chunks: ' + r.hashed + ' of ' + r.units + ' hashed', 'root: ' + r.root, 'hash: blake3-256 of each chunk\'s bytes', 'order: ' + (all ? 'file order, 4 MiB ranges' : 'a spread of 4 MiB ranges, in file order'), '---', '',
      '# ' + r.name, '',
      '> ' + r.kind + ' ' + at + ', ' + sizeText(r.size) + '. The data stays there; this note is its address and its proofs. Read any chunk from the source by URL and byte range, then check its BLAKE3 hash below. The root is a Merkle tree over (url, offset, length, hash) of every row, in order.', '',
      '- ' + r.units + ' chunks of 4 MiB, ' + (all ? 'every one' : r.hashed + ' of them') + ' hashed on the device that made the file',
      '- nothing uploaded: this note is all that leaves the device', '',
      '## Chunks', '',
      '| what | url (· is the source) | offset | length | blake3 |', '|---|---|---|---|---|']);
    r.rows.forEach(function (x) { out.push('| ' + x.label + ' | · | ' + x.offset + ' | ' + x.length + ' | ' + x.hash + ' |'); });
    return out.join('\n') + '\n';
  }

  /* ---------- drop a file ---------- */
  var drop = $('.drop'), input = drop && drop.querySelector('input'), out = $('.enc'), worker = null, last = null;
  function bar(sel, frac, txt) { var b = out.querySelector(sel); if (!b) return; var u = b.querySelector('u'); u.style.width = Math.min(100, frac * 100).toFixed(4) + '%'; u.style.minWidth = '2px'; b.querySelector('em').textContent = txt; }
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
  // emem's log head, its signature checked here against the pinned key, as the note's after: line
  var EMEM_KEY = '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka', sth = null;
  async function stampLine() {
    if (!sth) {
      var j = await (await fetch(EMEM + '/v1/log/sth')).json(), h = j.sth || j;
      if (h.responder_pubkey_b32 !== EMEM_KEY || !vx.verifySTH(h)) throw new Error('the log head did not verify; not stamping');
      sth = h;
    }
    return 'after: sth ' + sth.tree_size + ' ' + sth.root_b32 + ' ' + sth.signed_at;
  }
  async function show(r) {
    last = r;
    var st = $('#enc-stamp'), after = '';
    if (st && st.checked) { try { after = await stampLine(); } catch (e) { st.checked = false; $('[data-enc="state"]').textContent = String(e.message || e); } }
    var note = noteFor(r, ($('#enc-where') || {}).value, after), bytes = vx.enc.encode(note), cid = vx.cid26(bytes);
    var tok = 'emem:tree:' + cid + '#row=0', noteTok = count(note), rawTok = r.size * RAW;
    $('.enc-prog u').style.width = '100%';
    $('[data-enc="state"]').textContent = 'encoded in ' + (r.ms / 1000).toFixed(1) + ' s · ' + r.kind + ' · ' + r.hashed + ' of ' + r.units + ' ranges hashed · nothing left this device' + (after ? ' · stamped after log head ' + vx.group(sth.tree_size) : '');
    // to scale: the file and what it would cost a model as raw bytes are full bars; the note is a sliver
    bar('.is-file', 1, vx.fmtBytes(r.size) + ', stays here');
    bar('.is-raw', 1, '~' + tk(rawTok) + ' tokens as raw bytes');
    bar('.is-tok', noteTok / rawTok, '~' + tk(noteTok) + ' tokens · ' + Math.round(rawTok / noteTok).toLocaleString('en-US') + '× less');
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
  // no file at hand: encode one this site serves, through exactly the same path as a dropped file
  var ours = $('[data-enc-ours]');
  if (ours) ours.addEventListener('click', function () {
    var u = ours.getAttribute('data-enc-ours'); ours.disabled = true;
    fetch(u).then(function (r) { if (!r.ok) throw new Error('vortx.ai answered ' + r.status); return r.blob(); }).then(function (b) {
      ours.disabled = false; encode(new File([b], u.split('/').pop(), { type: b.type || 'image/webp' }));
    }, function () { ours.disabled = false; });
  });
  var where = $('#enc-where');
  if (where) where.addEventListener('change', function () { if (last) show(last); });
  var stampBox = $('#enc-stamp');
  if (stampBox) stampBox.addEventListener('change', function () { if (last) show(last); });

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
    if (b.getAttribute('data-studio') === 'url') {
      // encode in place needs the file's address first: say so where the address goes
      var inp = $('#enc-url'), u = inp ? inp.value.trim() : '';
      if (!/^https?:\/\/\S+$/i.test(u)) {
        if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.placeholder = 'paste a file’s https:// URL first: a scene, a video, a model…'; inp.focus(); }
        return;
      }
      if (inp) inp.removeAttribute('aria-invalid');
      studio(u); return;
    }
    studio('');
  });
  if (dlg) {
    dlg.addEventListener('close', function () { frame.removeAttribute('src'); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    var x = dlg.querySelector('[data-studio-close]'); if (x) x.addEventListener('click', function () { dlg.close(); });
  }

  /* ---------- devices: each recipe is a real published sample, the same one the run above checks ---------- */
  var DEV = {
    satellite: { file: 'TCI.tif', src: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/P/GQ/2026/5/S2B_43PGQ_20260512_0_L2A/TCI.tif', cid: 'twlpco5kin6qlz5eplt2pjm7n4', like: 'Sentinel-2B’s 351.0 MB scene over Bengaluru, 12 May 2026' },
    telescope: { file: 'weic2205a.tif', src: 'https://esawebb.org/media/archives/images/original/weic2205a.tif', cid: 'wkxa7tcmw2orf7ujjf5yi66dhe', like: 'Webb’s 143.7 MB Cosmic Cliffs' },
    robot: { file: 'file-000.mp4', src: 'https://huggingface.co/datasets/lerobot/aloha_static_coffee/resolve/main/videos/observation.images.cam_high/chunk-000/file-000.mp4', cid: 'qcoylkllqzfqnsinn4af5i2mi4', like: 'the ALOHA arms’ 502.5 MB camera recording' },
    drone: { file: '86052d9a-8c9b-4ca3-a836-02894f322464.tif', src: 'https://oin-hotosm-temp.s3.amazonaws.com/58e86e18cfbcc90010aca440/0/86052d9a-8c9b-4ca3-a836-02894f322464.tif', cid: 'ejvovl6sz7d3sugfcrwwie4rma', like: 'a drone survey of dry lake cracks, on OpenAerialMap' }
  };
  var devKey = 'satellite';
  function device(k) {
    var d = DEV[k]; if (!d) return; devKey = k;
    root.querySelectorAll('[data-dev]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-dev') === k ? 'true' : 'false'); });
    root.querySelectorAll('[data-devfile]').forEach(function (e) { e.textContent = d.file; });
    root.querySelectorAll('[data-devsrc]').forEach(function (e) { e.textContent = d.src; });
    var l = $('[data-devlike]'); if (l) l.textContent = d.like;
    var n = $('[data-devnote]'); if (n) n.href = 'https://emem.dev/memories/by_attester/ddzmyzhn/' + d.cid + '.md';
  }
  root.querySelectorAll('[data-dev]').forEach(function (b) { b.addEventListener('click', function () { device(b.getAttribute('data-dev')); }); });
  // the recipe's sample opens here, in the popup (js/pop.js), and runs end to end
  var devNote = $('[data-devnote]');
  if (devNote) devNote.addEventListener('click', function (e) {
    if (!window.vxPop || !window.vxPop.plain(e) || !window.vxCatalog) return;
    e.preventDefault();
    var cid = DEV[devKey].cid;
    window.vxCatalog.then(function (items) { var x = items.filter(function (i) { return i.cid === cid; })[0]; if (x) window.vxPop.open(x); else window.open(devNote.href, '_blank', 'noopener'); });
  });
  var runBtn = $('[data-devrun]');
  if (runBtn) runBtn.addEventListener('click', function () {
    var t = document.querySelector('#run [data-run="' + devKey + '"]'), sec = document.getElementById('run');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (t) setTimeout(function () { t.click(); }, 350);
  });
  device('satellite');

  /* ---------- copy buttons inside this section ---------- */
  root.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = root.querySelector(b.getAttribute('data-copy-from'));
      if (!src || !navigator.clipboard) return;
      navigator.clipboard.writeText(src.textContent).then(function () { var t = b.textContent; b.textContent = 'copied'; setTimeout(function () { b.textContent = t; }, 1400); });
    });
  });
})();
