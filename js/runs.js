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
  var root = document.getElementById('run');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev', NOTE = function (cid) { return EMEM + '/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var $ = function (s) { return root.querySelector(s); };
  var log = $('.run-log'), sum = $('.run-sum'), pic = $('.run-pic'), cap = $('.run-cap'), again = $('[data-run-again]'), open = $('[data-run-note]'), copy = $('[data-run-copy]');
  var RUNS = {};
  root.querySelectorAll('[data-run]').forEach(function (b) {
    RUNS[b.getAttribute('data-run')] = { cid: b.getAttribute('data-cid'), label: b.getAttribute('data-label') || '', trace: b.getAttribute('data-trace'), camera: b.hasAttribute('data-camera'), who: b.getAttribute('data-who') || '' };
  });
  var cur = null, gen = 0, catalog = null, thumbs = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function line(v, n, kv, st, where, ms) {
    var li = el('li', 'is-' + (st || 'ok'));
    li.appendChild(el('b', 'v', v)); li.appendChild(el('span', 'n', n));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; var i = el('i', 'kv'); i.appendChild(el('span', 'k', k)); i.appendChild(el('span', 'x', String(kv[k]))); li.appendChild(i); });
    if (where || ms != null) li.appendChild(el('em', null, [where, ms != null ? (ms / 1000).toFixed(1) + ' s' : ''].filter(Boolean).join(' · ')));
    log.appendChild(li); return li;
  }
  function tokOf(v) { var m = String(v || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  function tk(n) { return '~' + (n < 1e3 ? Math.round(n) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : n < 1e9 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : (n / 1e9).toFixed(1) + 'B'); }
  function bar(label, frac, txt, cls) {
    var r = el('div', 'run-bar ' + (cls || '')); r.appendChild(el('span', 'k', label));
    var i = el('i'), u = el('u'); u.style.width = Math.min(100, frac * 100).toFixed(4) + '%'; u.style.minWidth = '2px'; i.appendChild(u); r.appendChild(i);
    r.appendChild(el('em', null, txt)); return r;
  }
  function stale(g) { return g !== gen; }
  function cat2(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; }
  function chain(rows) { return rows.reduce(function (p, c) { return vx.b32(vx.blake3(cat2(vx.unb32(p), vx.unb32(c.hash)))); }, vx.b32(new Uint8Array(32))); }

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
    if (open) { open.href = r.cid ? NOTE(r.cid) : EMEM + '/v1/trace_resolve'; open.hidden = !r.cid; }
    if (copy) copy.hidden = !x;
    if (copy && x) copy.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(x.line).then(function () { copy.textContent = 'copied'; setTimeout(function () { copy.textContent = 'copy the agent line'; }, 1400); }); };
    return x;
  }

  async function runPointer(r, x, g) {
    var t0 = performance.now(), ms = function () { return Math.round(performance.now() - t0); }, L = new vx.Ledger(), checks = 0, passed = 0;
    var ok = function (b) { checks++; if (b) passed++; return b; };
    // encode: the note, hashed to its name, its root rebuilt
    var nb = (await vx.getBytes(NOTE(r.cid), {}, L)).bytes; if (stale(g)) return;
    var P = vx.parsePointer(vx.dec.decode(nb)), fm = P.fm, rows = P.rows, src = fm.source, host = vx.hostOf(src);
    // capture: the file is still where the device left it (a feed's source is its playlist, so its size is the note's)
    var fb = String(fm.bytes || ''), about = /^about/.test(fb), noteB = +(fb.match(/\d+/) || [])[0] || null;
    var have = fm.chain ? null : await vx.headSize(src); if (stale(g)) return;
    var fileB = have || noteB;
    line('capture', x ? x.title : 'the file', { file: fileB ? (about && !have ? 'about ' : '') + vx.fmtBytes(fileB) : 'size not published', kind: fm.kind, at: host }, 'info', have ? host + ', now' : 'the note', ms());
    // a feed is chained instead of rooted: each link hashes the previous link with the next segment
    var chained = !!fm.chain, rt = chained ? chain(rows) : vx.merkleRoot(rows);
    var named = ok(vx.cid26(nb) === r.cid), rooted = ok(rt === (chained ? fm.chain : fm.root));
    line('encode', 'the note, not the file', { rows: vx.group(rows.length), hashed: (fm.chunks || '').replace(' hashed', ''), name: named ? 'blake3 ✓' : 'LIES', [chained ? 'chain' : 'root']: rooted ? 'rebuilt ✓' : 'NO' }, named && rooted ? 'ok' : 'fail', 'this browser', ms());
    if (!named || !rooted) return finish(r, x, fileB, null, checks, passed, L);
    var row = rows.findIndex(function (w) { return w.label === r.label; });
    if (row < 0) row = rows.findIndex(function (w, i) { return i > 0 && !w.absent; });
    var w = rows[row], token = 'emem:tree:' + r.cid + '#row=' + row, tb = vx.enc.encode(token).length;
    line('send', 'the token', { token: token, bytes: tb }, 'info', 'to any agent', ms());
    if (chained) {
      // decode: a chain has no audit path; its links up to this segment are rebuilt from the note
      var upto = chain(rows.slice(0, row + 1)), fromHere = rows.slice(row + 1).reduce(function (p, c) { return vx.b32(vx.blake3(cat2(vx.unb32(p), vx.unb32(c.hash)))); }, upto), linked = ok(fromHere === fm.chain);
      line('decode', '@emem reads ' + w.label, { link: short(upto, 12), chain: linked ? 'continues to the head ✓' : 'NO' }, linked ? 'ok' : 'fail', 'this browser', ms());
    } else {
      // decode: @emem proves the row sits under the note's root
      var tj = JSON.parse(vx.dec.decode((await vx.getBytes(EMEM + '/v1/tree/' + r.cid + '?row=' + row, {}, L)).bytes)); if (stale(g)) return;
      var leaf = vx.b32(vx.treeLeaf(w)), walked = vx.treeWalk(vx.unb32(leaf), tj.path || []), proved = ok(walked === fm.root && leaf === tj.leaf_b32);
      line('decode', '@emem proves row ' + row, { row: w.label, hashes: (tj.path || []).length + ' to the root', match: proved ? 'root ✓' : 'NO' }, proved ? 'ok' : 'fail', 'emem.dev, walked here', ms());
    }
    // check: the row's own bytes
    var url = w.url || src;
    try {
      var rr = await vx.range(url, w.offset, w.length, L); if (stale(g)) return;
      if (!fileB && rr.total) fileB = rr.total;
      var h = vx.cid52(rr.bytes), same = ok(h === w.hash);
      line('check', 'the bytes of row ' + row, { read: vx.fmtBytes(w.length) + (fileB ? ' of ' + vx.fmtBytes(fileB) : ''), from: vx.hostOf(url), blake3: same ? 'matches the row ✓' : 'NO' }, same ? 'ok' : 'fail', 'your browser read it', ms());
      if (same) { var seen = await see(src, rows, w, rr.bytes, g, ms, L).catch(function () { return null; }); if (seen != null) ok(seen); }
    } catch (e) {
      var body = JSON.stringify({ url: url, offset: w.offset, length: w.length });
      var rh = JSON.parse(vx.dec.decode((await vx.getBytes(EMEM + '/v1/range_hash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body }, L)).bytes)); if (stale(g)) return;
      var sig = vx.verifyRangeHash(rh), same2 = ok(sig && rh.blake3_b32 === w.hash);
      line('check', 'the bytes of row ' + row, { read: vx.fmtBytes(w.length) + (fileB ? ' of ' + vx.fmtBytes(fileB) : ''), at: vx.hostOf(url), by: 'emem, next to the data', signature: sig ? 'valid ✓' : 'INVALID', blake3: rh.blake3_b32 === w.hash ? 'matches the row ✓' : 'NO' }, same2 ? 'ok' : 'fail', vx.hostOf(url) + ' refuses browsers', ms());
    }
    finish(r, x, fileB, tb, checks, passed, L);
  }

  // every image file directory in a TIFF header, classic or BigTIFF; values that lie outside the header are left out
  function ifds(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), le = u8[0] === 0x49, big = dv.getUint16(2, le) === 43, out = [];
    var SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
    var at = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le), guard = 0;
    while (at && at + 8 < u8.length && guard++ < 64) {
      var n = big ? Number(dv.getBigUint64(at, le)) : dv.getUint16(at, le), es = big ? 20 : 12, base = at + (big ? 8 : 2), tags = {};
      for (var i = 0; i < n && base + (i + 1) * es <= u8.length; i++) {
        var e = base + i * es, tag = dv.getUint16(e, le), ty = dv.getUint16(e + 2, le), cnt = big ? Number(dv.getBigUint64(e + 4, le)) : dv.getUint32(e + 4, le);
        var size = (SZ[ty] || 1) * cnt, vo = e + (big ? 12 : 8), p = size <= (big ? 8 : 4) ? vo : (big ? Number(dv.getBigUint64(vo, le)) : dv.getUint32(vo, le));
        if (p + size > u8.length) continue;
        var vals = [];
        for (var k = 0; k < cnt; k++) {
          var q = p + k * (SZ[ty] || 1);
          vals.push(ty === 3 ? dv.getUint16(q, le) : ty === 4 ? dv.getUint32(q, le) : ty === 16 ? Number(dv.getBigUint64(q, le)) : dv.getUint8(q));
        }
        tags[tag] = vals;
      }
      out.push(tags);
      var nx = base + n * es;
      at = nx + (big ? 8 : 4) <= u8.length ? (big ? Number(dv.getBigUint64(nx, le)) : dv.getUint32(nx, le)) : 0;
    }
    return out;
  }

  // see: decode the tile the check just verified, with the header row the note also hashed, and
  // recompute the note's own stats from the pixels (mean RGB over valid pixels, the share valid)
  async function see(src, rows, w, bytes, g, ms, L) {
    var h0 = rows[0];
    if (!h0 || h0.absent || !/header/.test(h0.label) || !/tile/.test(w.label)) return;
    var head = (await vx.range(h0.url || src, h0.offset, h0.length, L)).bytes; if (stale(g)) return;
    if (vx.cid52(head) !== h0.hash) return;
    // every level has its own directory and tile size: use the one whose tile table holds this row
    var all = ifds(head), t = all.filter(function (d) { return (d[324] || []).indexOf(w.offset) >= 0; })[0];
    // a JPEG tile carries its own size, so the first directory's shared tables decode it even when
    // its level's tile table lies outside the header row
    if (!t) { t = all[0]; if (!t || (t[259] || [])[0] !== 7) return; }
    var comp = t[259][0], W = t[322] && t[322][0], H = t[323] && t[323][0], spp = (t[277] || [1])[0], bits = (t[258] || [8])[0], pred = (t[317] || [1])[0];
    if (!W || bits !== 8 || spp < 3) return;
    var cv = el('canvas'), cx = cv.getContext('2d'), n = 0, sum3 = [0, 0, 0], id;
    cv.width = W; cv.height = H;
    if (comp === 8) {
      var raw = await vx.inflate(bytes), row = W * spp;
      if (pred === 2) for (var y = 0; y < H; y++) for (var i = y * row + spp; i < (y + 1) * row; i++) raw[i] = (raw[i] + raw[i - spp]) & 255;
      id = cx.createImageData(W, H);
      for (var p = 0, q = 0; p < W * H; p++, q += spp) {
        var R = raw[q], G = raw[q + 1], B = raw[q + 2];
        id.data[4 * p] = R; id.data[4 * p + 1] = G; id.data[4 * p + 2] = B; id.data[4 * p + 3] = 255;
        if (R || G || B) { n++; sum3[0] += R; sum3[1] += G; sum3[2] += B; }
      }
      cx.putImageData(id, 0, 0);
    } else if (comp === 7 && t[347] && typeof createImageBitmap === 'function') {
      // a JPEG tile: the file's shared tables (minus their end marker) and the tile (minus its start marker)
      var tb = Uint8Array.from(t[347]), jp = new Uint8Array(tb.length - 2 + bytes.length - 2);
      jp.set(tb.subarray(0, tb.length - 2), 0); jp.set(bytes.subarray(2), tb.length - 2);
      var bm = await createImageBitmap(new Blob([jp], { type: 'image/jpeg' })); if (stale(g)) return;
      W = cv.width = bm.width; H = cv.height = bm.height;
      cx.drawImage(bm, 0, 0); id = cx.getImageData(0, 0, W, H);
      for (var k = 0; k < W * H; k++) { var r0 = id.data[4 * k], g0 = id.data[4 * k + 1], b0 = id.data[4 * k + 2]; if (r0 || g0 || b0) { n++; sum3[0] += r0; sum3[1] += g0; sum3[2] += b0; } }
    } else return;
    if (!n || stale(g)) return;
    // an overview tile is partly padding: show only the pixels that hold the image
    var d4 = id.data, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) { var o = 4 * (yy * W + xx); if (d4[o] + d4[o + 1] + d4[o + 2] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
    if (x1 > x0 && y1 > y0 && (x1 - x0 + 1) * (y1 - y0 + 1) < W * H) {
      var cw = x1 - x0 + 1, ch = y1 - y0 + 1, c2 = el('canvas'); c2.width = cw; c2.height = ch;
      c2.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch); cv = c2;
    }
    var mean = sum3.map(function (v) { return Math.round(v / n); }), share = Math.round(100 * n / (W * H));
    var m = /mean RGB (\d+), (\d+), (\d+) · (\d+)% valid/.exec(w.stats || ''), kv = { tile: W + '×' + H + ' px', 'mean RGB': mean.join(', '), valid: share + '%' }, st = 'ok';
    if (m) { var same = [+m[1], +m[2], +m[3]].every(function (v, i) { return Math.abs(v - mean[i]) <= 1; }) && Math.abs(+m[4] - share) <= 1; kv.note = same ? 'says the same ✓' : 'says ' + m[1] + ', ' + m[2] + ', ' + m[3]; st = same ? 'ok' : 'fail'; }
    line('see', 'what the agent sees', kv, st, 'decoded here', ms());
    pic.className = 'run-pic is-tile'; pic.style.backgroundImage = ''; pic.innerHTML = ''; pic.appendChild(cv);
    var tag = el('span', 'run-tag', w.label + ' · ' + vx.fmtBytes(bytes.length) + ' read, checked, decoded here'); pic.appendChild(tag);
    return st === 'ok';
  }

  /* a street camera: the clip, its signature, and the sun, all rechecked here */
  var GEOQA_KEY = 'yQOKkNB+c+zl9kxxanwcNTZLgtHBsLvQH+q8pECrm/Q=';
  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; return JSON.stringify(v); }
  async function sha256(u8) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  async function runCamera(r, x, g) {
    var t0 = performance.now(), ms = function () { return Math.round(performance.now() - t0); }, L = new vx.Ledger(), checks = 0, passed = 0;
    var ok = function (b) { checks++; if (b) passed++; return b; };
    var nb = (await vx.getBytes(NOTE(r.cid), {}, L)).bytes; if (stale(g)) return;
    var text = vx.dec.decode(nb), named = ok(vx.cid26(nb) === r.cid);
    var rows = text.split('\n').filter(function (l) { return /^\| /.test(l) && /\/v1\/perception\/clips\//.test(l); }).map(function (l) {
      var c = l.split('|').map(function (v) { return v.trim(); }).slice(1);
      return { place: c[0], cell: c[1], camera: c[2], captured: c[3], counted: c[4], sun: c[5], clip: c[6], sha256: c[7], blake3: c[8] };
    });
    var w = rows.filter(function (v) { return v.place === r.label; })[0] || rows[0];
    line('capture', w.place + ', a TfL traffic camera', { camera: w.camera.replace('tfl_jamcam:tfl-JamCams_', 'JamCam '), captured: w.captured + ' UTC', counted: w.counted }, 'info', 'the note', ms());
    line('encode', 'the note, not the clips', { cameras: rows.length, name: named ? 'blake3 ✓' : 'LIES' }, named ? 'ok' : 'fail', 'this browser', ms());
    if (!named) return finish(r, x, null, null, checks, passed, L);
    var tb = r.cid.length;
    line('send', 'the note’s name', { token: r.cid, bytes: tb }, 'info', 'to any agent', ms());
    // decode: the clip itself, hashed two ways against the note's row
    var clip = (await vx.getBytes(w.clip, {}, L)).bytes; if (stale(g)) return;
    var sh = await sha256(clip), b3 = vx.cid52(clip), same = ok(sh === w.sha256 && b3 === w.blake3);
    line('decode', 'the clip', { read: vx.fmtBytes(clip.length), sha256: sh === w.sha256 ? '✓' : 'NO', blake3: b3 === w.blake3 ? '✓' : 'NO' }, same ? 'ok' : 'fail', 'emem.dev, hashed here', ms());
    // check: geo.qa's signature over the clip's record, and the sun recomputed from what it signs
    var rc = JSON.parse(vx.dec.decode((await vx.getBytes(EMEM + '/v1/perception/verify/clip/' + sh, {}, L)).bytes)); if (stale(g)) return;
    var p = rc.payload || {}, msg = vx.enc.encode(canon(p)), keyOk = rc.pubkey_b64 === GEOQA_KEY;
    var sigOk = ok(keyOk && p.clip_sha256 === sh && vx.edVerify(vx.b32(b64(rc.signature_b64)), msg, vx.b32(b64(rc.pubkey_b64))));
    var sp = vx.eph.sun(Date.parse(p.captured_at), +p.lat, +p.lng), stated = (w.sun.match(/([\d.]+)°\/([\d.]+)°/) || []);
    var sunOk = ok(stated.length && Math.abs(sp.el - +stated[1]) <= 0.1 && Math.abs(sp.az - +stated[2]) <= 0.1);
    line('check', 'geo.qa’s signature and the sun', { signature: sigOk ? 'valid ✓' : 'INVALID', binds: 'camera, place, time, bytes', sun: sp.el.toFixed(2) + '°/' + sp.az.toFixed(2) + '°', note: sunOk ? 'says the same ✓' : 'says ' + (stated[0] || '?') }, sigOk && sunOk ? 'ok' : 'fail', 'recomputed here', ms());
    if (same) {
      var v = el('video'); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.src = URL.createObjectURL(new Blob([clip], { type: 'video/mp4' }));
      pic.className = 'run-pic is-tile'; pic.style.backgroundImage = ''; pic.innerHTML = ''; pic.appendChild(v);
      pic.appendChild(el('span', 'run-tag', w.place + ' · ' + w.captured + ' UTC · the checked bytes, playing'));
      v.play && v.play().catch(function () {});
    }
    finish(r, x, clip.length, tb, checks, passed, L);
  }

  async function runTrace(r, g) {
    var t0 = performance.now(), ms = function () { return Math.round(performance.now() - t0); }, checks = 0, passed = 0, L = new vx.Ledger();
    var post = async function (p, b) { var s = JSON.stringify(b); return JSON.parse(vx.dec.decode((await vx.getBytes(EMEM + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: s }, L)).bytes)); };
    var tb = vx.enc.encode(r.trace).length;
    var res = await post('/v1/trace_resolve', { token: r.trace }); if (stale(g)) return;
    var t = res.trace; checks++; if (res.resolved) passed++;
    line('capture', 'what the device ran, signed by the device', { platform: t.device.platform, layers: t.segments.map(function (x) { return x.layer; }).join(', ') }, res.resolved ? 'ok' : 'fail', 'emem.dev', ms());
    line('send', 'the token', { token: r.trace, bytes: tb }, 'info', 'to any agent', ms());
    var v = await post('/v1/trace_verify', { trace: t, profile: t.device.substrate_profile }); if (stale(g)) return;
    checks++; if (v.verdict === 'admit') passed++;
    line('decode', 'against its profile', { profile: t.device.substrate_profile, verdict: v.verdict }, v.verdict === 'admit' ? 'ok' : 'fail', 'emem.dev', ms());
    var c = vx.checkTrace(t), good = c.chain && c.rootOk && c.sigOk && c.cid === r.trace.slice(11);
    checks++; if (good) passed++;
    line('check', 'chain, root and the device’s own signature', { events: vx.group(c.events), signature: c.sigOk ? 'valid ✓' : 'INVALID' }, good ? 'ok' : 'fail', 'this browser', ms());
    finish(r, null, null, tb, checks, passed, L);
  }

  function finish(r, x, fileB, tb, checks, passed, L) {
    sum.innerHTML = '';
    // to scale: next to the file, the token is a sliver
    if (fileB && tb) {
      sum.appendChild(bar('the file', 1, vx.fmtBytes(fileB) + ', stays put', 'is-file'));
      sum.appendChild(bar('what moved', tb / fileB, tb + ' bytes, the token', 'is-tok'));
    }
    var nt = x && tokOf(x.kv.tok), rt = x && tokOf(x.kv.raw);
    if (nt && rt) {
      sum.appendChild(bar('file to a model', 1, tk(rt) + ' tokens as raw bytes', 'is-raw'));
      sum.appendChild(bar('note to a model', nt / rt, tk(nt) + ' tokens · ' + Math.round(rt / nt).toLocaleString('en-US') + '× less', 'is-tok'));
    }
    if ((fileB && tb) || (nt && rt)) sum.appendChild(el('p', 'run-scale', 'bars to scale'));
    var s = el('p', 'run-score ' + (passed === checks ? 'is-ok' : 'is-fail'));
    s.textContent = passed + ' of ' + checks + ' checks passed in your browser · ' + vx.fmtBytes(L.total) + ' fetched in all, from ' + Object.keys(L.hosts).join(', ');
    sum.appendChild(s);
    root.classList.remove('is-running');
    if (again) again.disabled = false;
  }

  async function run(key) {
    var r = RUNS[key]; if (!r) return;
    var g = ++gen; cur = key;
    root.querySelectorAll('[data-run]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-run') === key ? 'true' : 'false'); });
    log.innerHTML = ''; sum.innerHTML = ''; root.classList.add('is-running'); if (again) again.disabled = true;
    var x = showSample(key);
    try { if (r.trace) await runTrace(r, g); else if (r.camera) await runCamera(r, x, g); else await runPointer(r, x, g); }
    catch (e) { if (!stale(g)) { line('stop', key, { why: vx.why(e, 'a source') }, 'fail'); root.classList.remove('is-running'); if (again) again.disabled = false; } }
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
