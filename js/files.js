/* files.js: files stay where they live; pointers travel.
 *
 * Reads the live ememdemo catalogue (vortx-ai.github.io/ememdemo/llms.txt),
 * one verb line per object. For a pointer (pointer.v1) the page checks, here:
 *   hash   the note: base32(blake3(note)[0:16]) must equal its name
 *   root   rebuild the Merkle root over every chunk row and compare
 *   read   one chunk straight from the source by HTTP Range, blake3 it,
 *          compare with the row. If the source refuses cross-origin reads,
 *          ask emem to hash those bytes next to the data (POST /v1/range_hash)
 *          and verify that signature instead, saying which path was taken.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('files');
  if (!root || !window.vx) return;
  var CATALOG = 'https://vortx-ai.github.io/ememdemo/llms.txt';
  var NOTE = function (cid) { return 'https://emem.dev/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var FEATURED = root.getAttribute('data-featured');
  var listEl = root.querySelector('[data-files]'), sumEl = root.querySelector('[data-files-sum]'), chips = root.querySelector('[data-files-chips]');
  var featEl = root.querySelector('[data-feature]');
  var items = [], filter = 'space';

  // sizes carry byte units (238.1MB); tok and raw carry count suffixes (~5.3k, ~151M, ~19.4B = billion)
  function bytesOf(s) {
    var m = String(s || '').replace(/^~/, '').match(/^([\d.]+)(B|KB|MB|GB|TB)$/);
    return m ? parseFloat(m[1]) * ({ B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 })[m[2]] : null;
  }
  function countOf(s) {
    var m = String(s || '').replace(/^~/, '').match(/^([\d.]+)([kMB]?)$/);
    return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null;
  }
  function parse(txt) {
    var out = [], sec = null, started = false;
    txt.split('\n').forEach(function (l) {
      if (/^signer /.test(l)) { started = true; return; }
      if (!started) return;
      if (/^# /.test(l)) { sec = l.slice(2).trim(); return; }
      var p = l.trim().split(/\s+/);
      if (p.length < 3) return;
      var kv = {};
      p.slice(3).forEach(function (x) { var i = x.indexOf('='); if (i > 0) kv[x.slice(0, i)] = x.slice(i + 1); });
      out.push({ sec: sec, verb: p[0], kind: p[1], ref: p[2], kv: kv, title: (kv.t || '').replace(/_/g, ' ').replace(/,(?=\S)/g, ', '), size: bytesOf(kv.size), tok: countOf(kv.tok), raw: countOf(kv.raw) });
    });
    return out;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function kvI(k, v) { return vx.kv(k, v); }
  function short(n) { if (n == null) return '?'; if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return String(Math.round(n)); }

  function summarise() {
    var ptr = items.filter(function (x) { return x.verb === 'pointed' || x.verb === 'listed'; });
    var size = ptr.reduce(function (s, x) { return s + (x.size || 0); }, 0);
    var tok = ptr.reduce(function (s, x) { return s + (x.tok || 0); }, 0);
    var raw = ptr.reduce(function (s, x) { return s + (x.raw || 0); }, 0);
    if (!sumEl) return;
    sumEl.innerHTML = '';
    [['count', ptr.length + ' pointers', 'in the live catalogue'], ['address', vx.fmtBytes(size), 'of files, left at their sources'],
      ['read', '~' + short(tok) + ' context tokens', 'to fetch every pointer note'], ['skip', '~' + short(raw) + ' context tokens', 'the same bytes would cost as base64']]
      .forEach(function (r) {
        var li = el('li'); li.appendChild(el('b', 'v', r[0])); li.appendChild(el('span', 'n', r[1])); li.appendChild(el('span', 'd', r[2])); sumEl.appendChild(li);
      });
    var li = el('li', 'is-ratio'); li.appendChild(el('b', 'v', 'ratio'));
    li.appendChild(el('span', 'n', raw && tok ? Math.round(raw / tok).toLocaleString('en-US') + '×' : '?'));
    li.appendChild(el('span', 'd', 'fewer context tokens than handing a model the files; computed from the catalogue’s own tok and raw fields'));
    sumEl.appendChild(li);
  }

  function renderChips() {
    if (!chips) return;
    var secs = []; items.forEach(function (x) { if (x.sec && secs.indexOf(x.sec) < 0) secs.push(x.sec); });
    chips.innerHTML = '';
    ['all'].concat(secs).forEach(function (s) {
      var b = el('button', 'chip', s); b.type = 'button'; b.setAttribute('aria-pressed', s === filter ? 'true' : 'false');
      var n = s === 'all' ? items.length : items.filter(function (x) { return x.sec === s; }).length;
      b.appendChild(el('span', 'chip-n', String(n)));
      b.addEventListener('click', function () { filter = s; renderChips(); renderList(); });
      chips.appendChild(b);
    });
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    items.filter(function (x) { return filter === 'all' || x.sec === filter; }).forEach(function (x) {
      var li = el('li', 'fl-row');
      var head = el('div', 'fl-line');
      head.appendChild(el('b', 'v', x.verb));
      head.appendChild(el('span', 'n', x.kind));
      head.appendChild(el('span', 't', x.title || x.ref));
      if (x.size) head.appendChild(kvI('size', vx.fmtSize(x.size)));
      if (x.kv.hashed) head.appendChild(kvI('hashed', x.kv.hashed));
      if (x.kv.src) head.appendChild(kvI('src', x.kv.src));
      if (x.tok) head.appendChild(kvI('tok', '~' + short(x.tok)));
      if (x.raw) head.appendChild(kvI('raw', '~' + short(x.raw)));
      li.appendChild(head);
      if (x.raw && x.tok) {
        var bar = el('div', 'fl-bar'), mx = Math.log10(x.raw), ti = el('i', 'fl-tok'), ri = el('i', 'fl-raw');
        ri.style.width = '100%'; ti.style.width = Math.max(0.8, 100 * Math.log10(Math.max(1, x.tok)) / mx).toFixed(1) + '%';
        bar.appendChild(ri); bar.appendChild(ti); bar.title = 'log10 context tokens: raw bytes vs the pointer note';
        li.appendChild(bar);
      }
      var acts = el('div', 'fl-acts');
      var isRef = /^[a-z2-7]{26}$/.test(x.ref);
      if (isRef) { var a = el('a', 'lk', 'read note'); a.href = NOTE(x.ref); a.target = '_blank'; a.rel = 'noopener'; acts.appendChild(a); }
      if (x.verb === 'pointed' && isRef) {
        var b = el('button', 'lk', 'check here'); b.type = 'button';
        b.addEventListener('click', function () { var box = li.querySelector('.vlog') || li.appendChild(el('ol', 'vlog')); check(x.ref, box, b); });
        acts.appendChild(b);
      }
      li.appendChild(acts);
      listEl.appendChild(li);
    });
  }

  function say(box, verb, noun, kv, st, t) {
    var li = el('li', 'is-' + (st || 'ok'));
    li.appendChild(el('b', 'v', verb)); li.appendChild(el('span', 'n', noun));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] != null && kv[k] !== '') li.appendChild(kvI(k, String(kv[k]))); });
    if (t != null) li.appendChild(el('em', null, t + ' ms'));
    box.appendChild(li);
  }

  async function check(cid, box, btn) {
    if (btn) btn.disabled = true;
    box.innerHTML = '';
    var t0 = performance.now(), ms = function () { return Math.round(performance.now() - t0); }, L = new vx.Ledger();
    try {
      var nb = (await vx.getBytes(NOTE(cid), {}, L)).bytes;
      say(box, 'fetch', 'note', { cid: cid, bytes: vx.group(nb.length) }, 'ok', ms());
      var got = vx.cid26(nb);
      say(box, 'hash', 'note', { 'blake3[0:16]': got, match: got === cid ? 'its name' : 'NO' }, got === cid ? 'ok' : 'fail', ms());
      if (got !== cid) return;
      var P = vx.parsePointer(vx.dec.decode(nb)), rows = P.rows, fm = P.fm;
      var r = vx.merkleRoot(rows);
      say(box, 'rebuild', 'root', { leaves: rows.length, root: r, match: r === fm.root ? 'the note' : 'NO' }, r === fm.root ? 'ok' : 'fail', ms());
      if (r !== fm.root) return;
      var src = fm.source, total = +fm.bytes || null;
      // the smallest hashed chunk that is not the header: little to download, still a real piece of the file
      var c = rows.filter(function (x) { return !x.absent; }).sort(function (a, b) { return a.length - b.length; })[0];
      if (!c) { say(box, 'read', 'chunk', { why: 'no hashed chunk' }, 'skip', ms()); return; }
      var url = c.url || src, host = vx.hostOf(url);
      try {
        var rr = await vx.range(url, c.offset, c.length, L);
        var h = vx.cid52(rr.bytes);
        say(box, 'read', 'chunk', { what: c.label, bytes: vx.group(c.length), of: total ? vx.group(total) : '?', from: host }, 'ok', ms());
        say(box, 'hash', 'chunk', { blake3: h, match: h === c.hash ? 'the note row' : 'NO' }, h === c.hash ? 'ok' : 'fail', ms());
        if (h === c.hash) say(box, 'prove', 'pointer', { read: vx.group(L.hosts[host] || 0) + ' B of ' + (total ? vx.group(total) : '?') + ' B', moved: '0 B of the file between agents' }, 'ok', ms());
      } catch (e) {
        say(box, 'read', 'chunk', { from: host, why: 'the source refuses cross-origin range reads here (' + (e.message || 'CORS') + ')' }, 'skip', ms());
        var body = JSON.stringify({ url: url, offset: c.offset, length: c.length });
        var rh = JSON.parse(vx.dec.decode((await vx.getBytes('https://emem.dev/v1/range_hash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body }, L)).bytes));
        var sig = vx.verifyRangeHash(rh);
        say(box, 'ask', 'emem range_hash', { bytes: vx.group(c.length), at: host, signature: sig ? 'valid (checked here)' : 'INVALID' }, sig ? 'ok' : 'fail', ms());
        say(box, 'hash', 'chunk', { blake3: rh.blake3_b32, match: rh.blake3_b32 === c.hash ? 'the note row' : 'NO', trust: 'emem’s signature, not your own read' }, rh.blake3_b32 === c.hash && sig ? 'ok' : 'fail', ms());
      }
    } catch (e) {
      say(box, 'stop', 'check', { why: String(e.message || e) }, 'fail', ms());
    } finally { if (btn) btn.disabled = false; }
  }

  // the featured pointer checks itself once it is on screen
  if (featEl && FEATURED) {
    var box = featEl.querySelector('.vlog'), ran = false, run = function () { if (!ran) { ran = true; check(FEATURED, box, featEl.querySelector('[data-recheck]')); } };
    var rb = featEl.querySelector('[data-recheck]'); if (rb) rb.addEventListener('click', function () { check(FEATURED, box, rb); });
    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); run(); } }); io.observe(featEl); } else run();
  }

  fetch(CATALOG).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (txt) {
    items = parse(txt);
    if (!items.some(function (x) { return x.sec === filter; })) filter = 'all';
    summarise(); renderChips(); renderList();
    root.classList.add('is-live');
  }).catch(function () {
    if (listEl) listEl.innerHTML = '<li class="fl-row"><b class="v">skip</b> the catalogue at vortx-ai.github.io/ememdemo did not answer; open it directly.</li>';
  });
})();
