/* engine.js: one published sample, end to end, live, in this browser.
 *
 * The run section and the sample popup show the same steps, from the same code:
 *   pointer.v1    capture, encode (the note hashes to its name, its root rebuilt), send (the token),
 *                 decode (@emem's audit path walked to the root), check (the row's bytes, read by range),
 *                 see (decoded here: one tile, a whole overview level stitched, or the photo itself)
 *   camera.v1     the clip re-hashed two ways, geo.qa's signature, the sun recomputed, the clip played
 *   world.v1      the bundle signed and recomputed, every reading inside it, one reading echoed verbatim
 *   grid.v1       each map's bundle signed and recomputed, every square a member, drawn from the note
 *   timelapse.v1  the three cubes signed, the first and last frames painted from pixels that hash to their names
 *   directory.v1  the listing's root rebuilt, one small file re-hashed against its publisher's hash
 * A step that cannot run says why. Nothing is shown as checked that was not.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  if (!window.vx) return;
  var EMEM = 'https://emem.dev', KEY = '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka';
  var GEOQA_KEY = 'yQOKkNB+c+zl9kxxanwcNTZLgtHBsLvQH+q8pECrm/Q=';
  var NOTE = function (cid) { return EMEM + '/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var BUDGET = 4.5e6, PIXELS = 2.2e6; // the most a popup reads, and draws, to show a whole picture

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function cat2(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; }
  function link(p, c) { return vx.b32(vx.blake3(cat2(vx.unb32(p), vx.unb32(c.hash)))); }
  function chain(rows) { return rows.reduce(link, vx.b32(new Uint8Array(32))); }
  function tokOf(v) { var m = String(v || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  function tk(n) { return '~' + (n < 1e3 ? Math.round(n) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : n < 1e9 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : (n / 1e9).toFixed(1) + 'B'); }
  function front(text) {
    var f = {}, m = text.match(/^---\n([\s\S]*?)\n---/);
    if (m) m[1].split('\n').forEach(function (l) { var i = l.indexOf(':'); if (i > 0) f[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    return f;
  }
  function json(u8) { return JSON.parse(vx.dec.decode(u8)); }
  function signedByEmem(rc) { var v = rc ? ememVerify.verifyReceipt(rc) : { ok: false }; return v.ok && rc.responder_pubkey_b32 === KEY; }
  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; return JSON.stringify(v); }
  async function digest(algo, u8) { return Array.from(new Uint8Array(await crypto.subtle.digest(algo, u8))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function pool(jobs, n) {
    var i = 0, out = new Array(jobs.length);
    function next() { if (i >= jobs.length) return Promise.resolve(); var k = i++; return jobs[k]().then(function (v) { out[k] = v; return next(); }); }
    var w = []; for (var j = 0; j < Math.min(n, jobs.length); j++) w.push(next());
    return Promise.all(w).then(function () { return out; });
  }

  /* ---------- a run: where its lines and pictures go, and whether it is still wanted ---------- */
  function Run(o) {
    o = o || {};
    this.log = o.log; this.live = o.live || function () { return true; };
    this.show = o.show || function () {}; this.retag = o.retag || function () {}; this.data = o.data || function () {}; this.named = o.named || function () {};
    this.whole = !!o.whole; this.t0 = performance.now(); this.L = new vx.Ledger(); this.checks = 0; this.passed = 0; this.cache = {};
  }
  Run.prototype.ms = function () { return Math.round(performance.now() - this.t0); };
  Run.prototype.ok = function (b) { this.checks++; if (b) this.passed++; return b; };
  Run.prototype.stale = function () { return !this.live(); };
  Run.prototype.line = function (v, n, kv, st, where) {
    var li = el('li', 'is-' + (st || 'ok'));
    li.appendChild(el('b', 'v', v)); li.appendChild(el('span', 'n', n));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; var i = el('i', 'kv'); i.appendChild(el('span', 'k', k)); i.appendChild(el('span', 'x', String(kv[k]))); li.appendChild(i); });
    if (where !== null) li.appendChild(el('em', null, [where, (this.ms() / 1000).toFixed(1) + ' s'].filter(Boolean).join(' · ')));
    if (this.log) this.log.appendChild(li);
    return li;
  };
  Run.prototype.stop = function (e, host) { return this.line('stop', 'this step', { why: vx.why(e, host || 'a source') }, 'fail', null); };
  // one row's bytes, read once per run
  Run.prototype.row = async function (url, w) {
    var k = url + '#' + w.offset;
    if (!this.cache[k]) this.cache[k] = vx.range(url, w.offset, w.length, this.L);
    return this.cache[k];
  };
  Run.prototype.post = async function (path, body) {
    return json((await vx.getBytes(EMEM + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, this.L)).bytes);
  };
  Run.prototype.get = async function (path) { return json((await vx.getBytes(EMEM + path, {}, this.L)).bytes); };

  /* ---------- pointer.v1 ---------- */
  // the row to prove: the one asked for; else the smallest overview's first tile, which holds the whole picture;
  // else the first hashed row after the header
  function pickRow(rows, label) {
    var i = label ? rows.findIndex(function (w) { return w.label === label; }) : -1;
    if (i >= 0) return i;
    var top = -1, lv = -1;
    rows.forEach(function (w, k) { var m = /^level (\d+) tile 0,0$/.exec(w.label); if (m && !w.absent && +m[1] > lv) { lv = +m[1]; top = k; } });
    if (top >= 0) return top;
    i = rows.findIndex(function (w, k) { return k > 0 && !w.absent; });
    return i >= 0 ? i : 0;
  }
  async function pointer(R, r, x, nb) {
    nb = nb || (await vx.getBytes(NOTE(r.cid), {}, R.L)).bytes; if (R.stale()) return {};
    var P = vx.parsePointer(vx.dec.decode(nb)), fm = P.fm, rows = P.rows, src = fm.source, host = vx.hostOf(src);
    // capture: the file is still where the device left it (a feed's source is its playlist, so its size is the note's)
    var fb = String(fm.bytes || ''), about = /^about/.test(fb), noteB = +(fb.match(/\d+/) || [])[0] || null;
    var have = fm.chain ? null : await vx.headSize(src); if (R.stale()) return {};
    var out = { fileB: have || noteB, tb: null };
    R.line('capture', x ? x.title : 'the file', { file: out.fileB ? (about && !have ? 'about ' : '') + vx.fmtSize(out.fileB) : 'size not published', kind: fm.kind, at: host }, 'info', have ? host + ', now' : 'the note');
    // encode: the note hashes to its name; a feed is chained instead of rooted
    var chained = !!fm.chain, rt = chained ? chain(rows) : vx.merkleRoot(rows);
    var named = R.ok(vx.cid26(nb) === r.cid), rooted = R.ok(rt === (chained ? fm.chain : fm.root)); R.named(named);
    R.line('encode', 'the note, not the file', { rows: vx.group(rows.length), hashed: (fm.chunks || '').replace(' hashed', ''), name: named ? 'blake3 ✓' : 'LIES', [chained ? 'chain' : 'root']: rooted ? 'rebuilt ✓' : 'NO' }, named && rooted ? 'ok' : 'fail', 'this browser');
    if (!named || !rooted) return out;
    var row = pickRow(rows, r.label), w = rows[row], token = 'emem:tree:' + r.cid + '#row=' + row;
    out.tb = vx.enc.encode(token).length;
    R.line('send', 'the token', { token: token, bytes: out.tb }, 'info', 'to any agent');
    if (chained) {
      // decode: a chain has no audit path; its links up to this segment are rebuilt from the note
      var upto = chain(rows.slice(0, row + 1)), linked = R.ok(rows.slice(row + 1).reduce(link, upto) === fm.chain);
      R.line('decode', '@emem reads ' + w.label, { link: short(upto, 12), chain: linked ? 'continues to the head ✓' : 'NO' }, linked ? 'ok' : 'fail', 'this browser');
    } else {
      var tj = await R.get('/v1/tree/' + r.cid + '?row=' + row); if (R.stale()) return out;
      var leaf = vx.b32(vx.treeLeaf(w)), proved = R.ok(vx.treeWalk(vx.unb32(leaf), tj.path || []) === fm.root && leaf === tj.leaf_b32);
      R.line('decode', '@emem proves row ' + row, { row: w.label, hashes: (tj.path || []).length + ' to the root', match: proved ? 'root ✓' : 'NO' }, proved ? 'ok' : 'fail', 'emem.dev, walked here');
    }
    // check: the row's own bytes, from the source; if it refuses browsers, emem hashes them next to the data
    var url = w.url || src;
    try {
      var rr = await R.row(url, w); if (R.stale()) return out;
      if (!out.fileB && rr.total) out.fileB = rr.total;
      var same = R.ok(vx.cid52(rr.bytes) === w.hash);
      R.line('check', 'the bytes of row ' + row, { read: vx.fmtBytes(w.length) + (out.fileB ? ' of ' + vx.fmtSize(out.fileB) : ''), from: vx.hostOf(url), blake3: same ? 'matches the row ✓' : 'NO' }, same ? 'ok' : 'fail', 'your browser read it');
      if (same) {
        var seen = await see(R, fm, src, rows, w, rr.bytes).catch(function (e) { if (!R.stale()) R.line('see', 'not drawn', { why: vx.why(e, vx.hostOf(src)) }, 'info', null); return null; });
        if (seen != null) R.ok(seen);
      }
    } catch (e) {
      if (R.stale()) return out;
      var rh = await R.post('/v1/range_hash', { url: url, offset: w.offset, length: w.length }); if (R.stale()) return out;
      var sig = vx.verifyRangeHash(rh), same2 = R.ok(sig && rh.blake3_b32 === w.hash);
      R.line('check', 'the bytes of row ' + row, { read: vx.fmtBytes(w.length) + (out.fileB ? ' of ' + vx.fmtSize(out.fileB) : ''), at: vx.hostOf(url), by: 'emem, next to the data', signature: sig ? 'valid ✓' : 'INVALID', blake3: rh.blake3_b32 === w.hash ? 'matches the row ✓' : 'NO' }, same2 ? 'ok' : 'fail', vx.hostOf(url) + ' refuses browsers');
    }
    return out;
  }

  // every image file directory in a TIFF header, classic or BigTIFF; values that lie outside the header are left out
  function ifds(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), le = u8[0] === 0x49, big = dv.getUint16(2, le) === 43, out = [];
    var SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
    var at = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le), guard = 0;
    while (at && at + 8 < u8.length && guard++ < 64) {
      var n = big ? Number(dv.getBigUint64(at, le)) : dv.getUint16(at, le), es = big ? 20 : 12, base = at + (big ? 8 : 2), tags = { le: le };
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

  // one tile's pixels: 8-bit colour or grey, 16-bit grey, deflate or none; JPEG through the browser's own decoder
  async function decodeTile(d, bytes, tw, th) {
    var comp = (d[259] || [1])[0], spp = (d[277] || [1])[0], bits = (d[258] || [8])[0], pred = (d[317] || [1])[0];
    if (comp === 7) {
      if (typeof createImageBitmap !== 'function') return null;
      var jp = bytes;
      if (d[347]) { // the file's shared tables (minus their end marker), then the tile (minus its start marker)
        var tb = Uint8Array.from(d[347]); jp = new Uint8Array(tb.length - 2 + bytes.length - 2);
        jp.set(tb.subarray(0, tb.length - 2), 0); jp.set(bytes.subarray(2), tb.length - 2);
      }
      var bm = await createImageBitmap(new Blob([jp], { type: 'image/jpeg' }));
      var cv = el('canvas'); cv.width = bm.width; cv.height = bm.height;
      var cx = cv.getContext('2d'); cx.drawImage(bm, 0, 0);
      return { rgba: cx.getImageData(0, 0, bm.width, bm.height).data, w: bm.width, h: bm.height, grey: false };
    }
    if (comp !== 8 && comp !== 32946 && comp !== 1) return null;
    var raw = comp === 1 ? bytes.slice() : await vx.inflate(bytes), n = tw * th;
    if (bits === 8 && (spp === 1 || spp >= 3)) {
      var row = tw * spp; if (raw.length < row * th) return null;
      if (pred === 2) for (var y = 0; y < th; y++) for (var i = y * row + spp; i < (y + 1) * row; i++) raw[i] = (raw[i] + raw[i - spp]) & 255;
      var o = new Uint8ClampedArray(4 * n);
      for (var p = 0, q = 0; p < n; p++, q += spp) { var R0 = raw[q], G0 = spp >= 3 ? raw[q + 1] : R0, B0 = spp >= 3 ? raw[q + 2] : R0; o[4 * p] = R0; o[4 * p + 1] = G0; o[4 * p + 2] = B0; o[4 * p + 3] = 255; }
      return { rgba: o, w: tw, h: th, grey: spp === 1, v: spp === 1 ? raw.subarray(0, n) : null };
    }
    if (bits === 16 && spp === 1) {
      if (raw.length < 2 * n) return null;
      var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), v = new Uint16Array(n);
      for (var k = 0; k < n; k++) v[k] = dv.getUint16(2 * k, d.le);
      if (pred === 2) for (var yy = 0; yy < th; yy++) for (var xx = 1; xx < tw; xx++) v[yy * tw + xx] = (v[yy * tw + xx] + v[yy * tw + xx - 1]) & 0xffff;
      return { v: v, w: tw, h: th, grey: true, deep: true };
    }
    return null;
  }
  // the note's own stats for a tile, recomputed from its pixels: mean RGB and the share valid, or mean, min and max
  function stats(t) {
    var n = 0, s = [0, 0, 0], lo = Infinity, hi = -Infinity, N = t.w * t.h;
    if (t.v) { for (var i = 0; i < N; i++) { var a = t.v[i]; if (a) { n++; s[0] += a; if (a < lo) lo = a; if (a > hi) hi = a; } } }
    else for (var k = 0; k < N; k++) { var r = t.rgba[4 * k], g = t.rgba[4 * k + 1], b = t.rgba[4 * k + 2]; if (r || g || b) { n++; s[0] += r; s[1] += g; s[2] += b; } }
    return { n: n, share: Math.round(100 * n / N), mean: s.map(function (x) { return n ? x / n : 0; }), lo: lo, hi: hi };
  }
  function agrees(st, note) {
    var m = /mean RGB (\d+), (\d+), (\d+) · (\d+)% valid/.exec(note || '');
    if (m) return { said: m[1] + ', ' + m[2] + ', ' + m[3], same: [+m[1], +m[2], +m[3]].every(function (v, i) { return Math.abs(v - Math.round(st.mean[i])) <= 1; }) && Math.abs(+m[4] - st.share) <= 1 };
    m = /^mean ([\d.]+) · sd [\d.]+ · min (\d+) · max (\d+)(?: · (\d+)% valid)?/.exec(note || '');
    if (m) return { said: 'mean ' + m[1], same: near(st.mean[0], m[1]) && near(st.lo, m[2]) && near(st.hi, m[3]) && Math.abs((m[4] ? +m[4] : 100) - st.share) <= 1 };
    return null;
  }
  // the note prints four significant figures (13227 is printed 13230): agree to within one unit of the last one printed
  function near(v, printed) { var p = +printed, u = p ? Math.pow(10, Math.floor(Math.log10(Math.abs(p))) - 3) : 1; return Math.abs(v - p) <= u + 1e-9; }
  // grey 16-bit pixels become visible through one stretch for the whole picture (2nd to 98th percentile of valid values)
  function stretch(tiles) {
    var s = [];
    tiles.forEach(function (t) { if (t && t.deep) for (var i = 0; i < t.v.length; i += 7) if (t.v[i]) s.push(t.v[i]); });
    s.sort(function (a, b) { return a - b; });
    var lo = s[Math.floor(s.length * .02)] || 0, hi = s[Math.floor(s.length * .98)] || 1;
    tiles.forEach(function (t) {
      if (!t || !t.deep) return;
      var o = new Uint8ClampedArray(4 * t.v.length);
      for (var i = 0; i < t.v.length; i++) { var g = t.v[i] ? 255 * Math.pow(Math.max(0, Math.min(1, (t.v[i] - lo) / (hi - lo || 1))), .8) : 0; o[4 * i] = o[4 * i + 1] = o[4 * i + 2] = g; o[4 * i + 3] = 255; }
      t.rgba = o;
    });
  }
  // show only the pixels that hold the image: an overview is partly padding
  function crop(cv) {
    var cx = cv.getContext('2d'), W = cv.width, H = cv.height, d4 = cx.getImageData(0, 0, W, H).data, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var o = 4 * (y * W + x); if (d4[o] + d4[o + 1] + d4[o + 2] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (!(x1 > x0 && y1 > y0) || (x1 - x0 + 1) * (y1 - y0 + 1) >= W * H) return cv;
    var c2 = el('canvas'); c2.width = x1 - x0 + 1; c2.height = y1 - y0 + 1;
    c2.getContext('2d').drawImage(cv, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
    return c2;
  }
  function paintTile(cv, t, x, y) { var id = new ImageData(t.rgba, t.w, t.h); var c = el('canvas'); c.width = t.w; c.height = t.h; c.getContext('2d').putImageData(id, 0, 0); cv.getContext('2d').drawImage(c, x, y); }

  // see: decode what the check just verified, with the header row the note also hashed
  async function see(R, fm, src, rows, w, bytes) {
    if (R.whole && /JPEG|photograph|PNG/i.test(fm.kind || '')) return photo(R, fm, src, rows);
    var h0 = rows[0];
    if (!h0 || h0.absent || !/header/.test(h0.label)) return;
    var head = (await R.row(h0.url || src, h0)).bytes; if (R.stale()) return;
    if (vx.cid52(head) !== h0.hash) return;
    var all = ifds(head);
    if (R.whole && await level(R, src, rows, all)) return; // drawn and counted there
    if (!/tile/.test(w.label)) return;
    // every level has its own directory and tile size: use the one whose tile table holds this row
    var d = all.filter(function (t) { return (t[324] || []).indexOf(w.offset) >= 0; })[0];
    // a JPEG tile carries its own size, so the first directory's shared tables decode it even when
    // its level's tile table lies outside the header row
    if (!d) { d = all[0]; if (!d || (d[259] || [])[0] !== 7) return; }
    var tw = d[322] && d[322][0], th = d[323] && d[323][0];
    if (!tw) return;
    var t = await decodeTile(d, bytes, tw, th); if (!t || R.stale()) return;
    if (t.deep) stretch([t]);
    var st = stats(t); if (!st.n) return;
    var cv = el('canvas'); cv.width = t.w; cv.height = t.h; paintTile(cv, t, 0, 0); cv = crop(cv);
    var a = agrees(st, w.stats), kv = { tile: t.w + '×' + t.h + ' px' }, ok = true;
    if (t.grey) kv.mean = +st.mean[0].toFixed(1); else kv['mean RGB'] = st.mean.map(Math.round).join(', ');
    kv.valid = st.share + '%';
    if (a) { kv.note = a.same ? 'says the same ✓' : 'says ' + a.said; ok = a.same; }
    R.line('see', 'what the agent sees', kv, ok ? 'ok' : 'fail', 'decoded here');
    R.show(cv, w.label + ' · ' + vx.fmtBytes(bytes.length) + ' read, checked, decoded here');
    return a ? ok : undefined;
  }

  // a whole overview level: every one of its tiles is a row of the note, so all of it can be read and checked
  async function level(R, src, rows, dirs) {
    var at = {}; rows.forEach(function (w) { if (!w.absent) at[w.offset] = w; });
    var best = null;
    dirs.forEach(function (d) {
      var offs = d[324], cnts = d[325], W = d[256] && d[256][0], H = d[257] && d[257][0], tw = d[322] && d[322][0], th = d[323] && d[323][0];
      if (!offs || !cnts || !W || !tw || (d[262] || [2])[0] === 4) return; // no tiles, or a transparency mask
      var comp = (d[259] || [1])[0], spp = (d[277] || [1])[0], bits = (d[258] || [8])[0];
      if ([1, 7, 8, 32946].indexOf(comp) < 0 || !((bits === 8 && (spp === 1 || spp >= 3)) || (bits === 16 && spp === 1))) return;
      var all = offs.every(function (o, k) { return !cnts[k] || (at[o] && at[o].length === cnts[k]); });
      var total = cnts.reduce(function (a, b) { return a + b; }, 0);
      if (!all || total > BUDGET || offs.length > 64 || W * H > PIXELS) return;
      if (!best || W * H > best.W * best.H) best = { d: d, W: W, H: H, tw: tw, th: th, offs: offs, cnts: cnts, total: total };
    });
    if (!best || best.offs.length < 2) return null;
    var b = best, across = Math.ceil(b.W / b.tw), same = 0, statsN = 0, statsOk = 0, got = 0;
    var n = b.offs.filter(function (o, k) { return b.cnts[k]; }).length;
    // the picture builds in front of you: each tile is drawn the moment its bytes hash true, edged green
    var cv = el('canvas'); cv.width = b.W; cv.height = b.H; cv.className = 'eg-build';
    var g0 = cv.getContext('2d'); g0.fillStyle = '#05080d'; g0.fillRect(0, 0, b.W, b.H);
    R.show(cv, '0 of ' + n + ' tiles · reading by range');
    var tiles = await pool(b.offs.map(function (o, k) {
      return function () {
        if (!b.cnts[k] || R.stale()) return Promise.resolve(null);
        var w = at[o];
        return R.row(w.url || src, w).then(function (rr) {
          if (vx.cid52(rr.bytes) !== w.hash) return null;
          same++;
          return decodeTile(b.d, rr.bytes, b.tw, b.th).then(function (t) {
            if (!t || R.stale()) return t;
            t.row = w;
            if (t.deep) stretch([t]); // its own stretch until the whole picture's is known
            var x = (k % across) * b.tw, y = Math.floor(k / across) * b.th;
            paintTile(cv, t, x, y);
            g0.strokeStyle = 'rgba(61, 220, 151, .9)'; g0.lineWidth = Math.max(2, b.W / 260); g0.strokeRect(x + g0.lineWidth / 2, y + g0.lineWidth / 2, Math.min(b.tw, b.W - x) - g0.lineWidth, Math.min(b.th, b.H - y) - g0.lineWidth);
            R.retag(++got + ' of ' + n + ' tiles · each blake3 ✓ as it lands');
            return t;
          });
        });
      };
    }), 4);
    if (R.stale()) return;
    stretch(tiles);
    g0.fillStyle = '#05080d'; g0.fillRect(0, 0, b.W, b.H);
    tiles.forEach(function (t, k) {
      if (!t || !t.rgba) return;
      paintTile(cv, t, (k % across) * b.tw, Math.floor(k / across) * b.th);
      var a = agrees(stats(t), t.row.stats); if (a) { statsN++; if (a.same) statsOk++; }
    });
    var allRead = R.ok(same === n);
    var kv = { tiles: same + ' of ' + n + (allRead ? ' ✓' : ''), read: vx.fmtBytes(b.total), picture: b.W + '×' + b.H + ' px' };
    if (statsN) { kv.stats = statsOk + ' of ' + statsN + ' say the same' + (statsOk === statsN ? ' ✓' : ''); R.ok(statsOk === statsN); }
    var good = allRead && statsOk === statsN;
    R.line('see', 'the whole picture, read now', kv, good ? 'ok' : 'fail', 'every tile hashed and decoded here');
    R.show(crop(cv), n + ' tiles · ' + vx.fmtBytes(b.total) + ' read by range, every blake3 ✓, drawn here');
    return true;
  }

  // a photograph the note hashes whole: every row read, checked, and the picture drawn from those bytes
  async function photo(R, fm, src, rows) {
    var sz = +(String(fm.bytes || '').match(/^\d+$/) || [])[0], ord = rows.filter(function (w) { return !w.absent; }).slice().sort(function (a, b) { return a.offset - b.offset; });
    var end = 0, whole = ord.every(function (w) { var ok = w.offset === end && !w.url; end += w.length; return ok; }) && end === sz;
    if (!whole || sz > BUDGET) return;
    var parts = await pool(ord.map(function (w) { return function () { return R.row(src, w).then(function (rr) { return vx.cid52(rr.bytes) === w.hash ? rr.bytes : null; }); }; }), 4);
    if (R.stale()) return;
    var good = R.ok(parts.every(Boolean));
    R.line('see', 'the photo itself', { rows: parts.filter(Boolean).length + ' of ' + ord.length + (good ? ' ✓' : ''), read: vx.fmtBytes(sz) }, good ? 'ok' : 'fail', 'drawn from the checked bytes');
    if (!good) return;
    var img = el('img'); img.alt = ''; img.decoding = 'async'; img.className = 'eg-wipe';
    img.src = URL.createObjectURL(new Blob(parts, { type: /PNG/i.test(fm.kind) ? 'image/png' : 'image/jpeg' }));
    R.show(img, 'the photo · ' + vx.fmtBytes(sz) + ' read from ' + vx.hostOf(src) + ', every row ✓');
    return undefined;
  }

  /* ---------- camera.v1: a street camera's clip, its signature and the sun, all rechecked here ---------- */
  async function camera(R, r, x, nb) {
    nb = nb || (await vx.getBytes(NOTE(r.cid), {}, R.L)).bytes; if (R.stale()) return {};
    var text = vx.dec.decode(nb), named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    var rows = text.split('\n').filter(function (l) { return /^\| /.test(l) && /\/v1\/perception\/clips\//.test(l); }).map(function (l) {
      var c = l.split('|').map(function (v) { return v.trim(); }).slice(1);
      return { place: c[0], cell: c[1], camera: c[2], captured: c[3], counted: c[4], sun: c[5], clip: c[6], sha256: c[7], blake3: c[8] };
    });
    var w = rows.filter(function (v) { return v.place === r.label; })[0] || rows[0], out = { fileB: null, tb: r.cid.length };
    if (!w) { R.line('encode', 'the note', { name: named ? 'blake3 ✓' : 'LIES', cameras: 0 }, 'fail', 'this browser'); return out; }
    R.line('capture', w.place + ', a TfL traffic camera', { camera: w.camera.replace('tfl_jamcam:tfl-JamCams_', 'JamCam '), captured: w.captured + ' UTC', counted: w.counted }, 'info', 'the note');
    R.line('encode', 'the note, not the clips', { cameras: rows.length, name: named ? 'blake3 ✓' : 'LIES' }, named ? 'ok' : 'fail', 'this browser');
    if (!named) return out;
    R.line('send', 'the note’s name', { token: r.cid, bytes: out.tb }, 'info', 'to any agent');
    // decode: the clip itself, hashed two ways against the note's row
    var clip = (await vx.getBytes(w.clip, {}, R.L)).bytes; if (R.stale()) return out;
    out.fileB = clip.length;
    var sh = await digest('SHA-256', clip), b3 = vx.cid52(clip), same = R.ok(sh === w.sha256 && b3 === w.blake3);
    R.line('decode', 'the clip', { read: vx.fmtBytes(clip.length), sha256: sh === w.sha256 ? '✓' : 'NO', blake3: b3 === w.blake3 ? '✓' : 'NO' }, same ? 'ok' : 'fail', 'emem.dev, hashed here');
    // check: geo.qa's signature over the clip's record, and the sun recomputed from what it signs
    var rc = await R.get('/v1/perception/verify/clip/' + sh); if (R.stale()) return out;
    var p = rc.payload || {}, msg = vx.enc.encode(canon(p)), keyOk = rc.pubkey_b64 === GEOQA_KEY;
    var sigOk = R.ok(keyOk && p.clip_sha256 === sh && vx.edVerify(vx.b32(b64(rc.signature_b64)), msg, vx.b32(b64(rc.pubkey_b64))));
    var sp = vx.eph.sun(Date.parse(p.captured_at), +p.lat, +p.lng), stated = (w.sun.match(/([\d.]+)°\/([\d.]+)°/) || []);
    var sunOk = R.ok(stated.length && Math.abs(sp.el - +stated[1]) <= 0.1 && Math.abs(sp.az - +stated[2]) <= 0.1);
    R.line('check', 'geo.qa’s signature and the sun', { signature: sigOk ? 'valid ✓' : 'INVALID', binds: 'camera, place, time, bytes', sun: sp.el.toFixed(2) + '°/' + sp.az.toFixed(2) + '°', note: sunOk ? 'says the same ✓' : 'says ' + (stated[0] || '?') }, sigOk && sunOk ? 'ok' : 'fail', 'recomputed here');
    if (same) {
      var v = el('video'); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.src = URL.createObjectURL(new Blob([clip], { type: 'video/mp4' }));
      R.show(v, w.place + ' · ' + w.captured + ' UTC · the checked bytes, playing');
      if (v.play) v.play().catch(function () {});
    }
    R.data('cameras', rows);
    return out;
  }

  /* ---------- a device's execution trace ---------- */
  async function trace(R, r) {
    var tb = vx.enc.encode(r.trace).length;
    var res = await R.post('/v1/trace_resolve', { token: r.trace }); if (R.stale()) return {};
    var t = res.trace; R.ok(res.resolved);
    R.line('capture', 'what the device ran, signed by the device', { platform: t.device.platform, layers: t.segments.map(function (s) { return s.layer; }).join(', ') }, res.resolved ? 'ok' : 'fail', 'emem.dev');
    R.line('send', 'the token', { token: r.trace, bytes: tb }, 'info', 'to any agent');
    var v = await R.post('/v1/trace_verify', { trace: t, profile: t.device.substrate_profile }); if (R.stale()) return {};
    R.ok(v.verdict === 'admit');
    R.line('decode', 'against its profile', { profile: t.device.substrate_profile, verdict: v.verdict }, v.verdict === 'admit' ? 'ok' : 'fail', 'emem.dev');
    var c = vx.checkTrace(t), good = R.ok(c.chain && c.rootOk && c.sigOk && c.cid === r.trace.slice(11));
    R.line('check', 'chain, root and the device’s own signature', { events: vx.group(c.events), signature: c.sigOk ? 'valid ✓' : 'INVALID' }, good ? 'ok' : 'fail', 'this browser');
    return { tb: tb };
  }

  /* ---------- world.v1: every layer at one place, bound into one bundle ---------- */
  function readings(text) {
    var out = [], sec = '', re = /^- (.+?) \(([A-Za-z0-9_.]+)\): (-?[\d.]+(?:e-?\d+)?)(?: ([^·\n]+?))? · (emem:fact:[A-Za-z0-9.]+:([a-z2-7]{52}))$/;
    text.split('\n').forEach(function (l) {
      if (/^## /.test(l)) { sec = l.slice(3).trim(); return; }
      var m = re.exec(l); if (m) out.push({ sec: sec, label: m[1], band: m[2], value: m[3], unit: (m[4] || '').trim(), token: m[5], cid: m[6] });
    });
    return out;
  }
  async function echo(R, f) {
    var e = await R.post('/v1/echo_verify', { token: f.token, claimed_value: f.value }); if (R.stale()) return false;
    var ok = R.ok(!!e.matches && signedByEmem(e.receipt) && (e.receipt.fact_cids || []).indexOf(f.cid) >= 0);
    R.line('check', f.label, { note: f.value + (f.unit ? ' ' + f.unit : ''), signed: e.resolved_value_verbatim, verdict: e.matches ? 'verbatim ✓' : (e.drift || 'different'), receipt: signedByEmem(e.receipt) ? 'ed25519 ✓' : 'INVALID' }, ok ? 'ok' : 'fail', 'emem.dev, checked here');
    return ok;
  }
  async function world(R, r, x, nb) {
    var text = vx.dec.decode(nb), f = front(text), facts = readings(text), named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    var layers = facts.reduce(function (s, a) { if (s.indexOf(a.sec) < 0) s.push(a.sec); return s; }, []).length;
    R.line('capture', (f.place || (x && x.title) || '').split(',')[0], { readings: facts.length, layers: layers, at: f.at }, 'info', 'the note');
    R.line('encode', 'the note, not the readings', { name: named ? 'blake3 ✓' : 'LIES' }, named ? 'ok' : 'fail', 'this browser');
    R.data('readings', facts);
    if (!named || !f.bundle) return {};
    var tb = vx.enc.encode(f.bundle).length;
    R.line('send', 'one token for every reading', { token: f.bundle, bytes: tb }, 'info', 'to any agent');
    var j = await R.get('/v1/memory_bundle/' + f.bundle); if (R.stale()) return { tb: tb };
    var signed = signedByEmem(j.receipt), cidOk = vx.bundleCid(j.citations || [], j.purpose) === f.bundle.split(':').pop();
    var out = facts.filter(function (a) { return (j.fact_cids || []).indexOf(a.cid) < 0; }), inside = facts.length - out.length, good = R.ok(signed && cidOk && !out.length);
    // a reading the bundle does not hold is named, with the one the bundle holds for that layer instead
    var held = out.map(function (a) { var c = (j.citations || []).filter(function (c) { return c.band === a.band; })[0]; return a.band + (c ? ', the bundle holds ' + (c.resolved_tslot ? 'the ' + new Date(c.resolved_tslot * 864e5).toISOString().slice(0, 10) + ' reading' : 'another reading') : ''); });
    R.line('decode', '@emem opens the bundle', { signature: signed ? 'ed25519 ✓' : 'INVALID', name: cidOk ? 'recomputed ✓' : 'NO', readings: inside + ' of ' + facts.length + ' inside' + (out.length ? '' : ' ✓'), outside: held.slice(0, 3).join(', ') }, good ? 'ok' : 'fail', 'emem.dev, checked here');
    R.data('outside', out.map(function (a) { return a.cid; }));
    var pick = facts.filter(function (a) { return a.band === 'indices.ndvi'; })[0] || facts[0];
    if (pick) await echo(R, pick);
    return { tb: tb };
  }

  /* ---------- grid.v1: a place as squares, one signed bundle per map ---------- */
  function squares(text, bands) {
    var out = [];
    text.split('\n').forEach(function (l) {
      var m = /^\| (\d+),(\d+) \| ([A-Za-z0-9.]+) \| (.+) \|$/.exec(l); if (!m) return;
      var v = m[4].split('|').map(function (s) { s = s.trim(); return s === '—' || s === '' ? null : s; });
      out.push({ r: +m[1], c: +m[2], cell: m[3], v: bands.map(function (b, i) { return v[i]; }) });
    });
    return out;
  }
  var NAME = { 'indices.ndvi': 'greenness', 'modis.lst_day_8day': 'ground heat', 'overture.buildings.count': 'buildings', 'hansen.tree_cover_2000': 'tree cover 2000', 'hansen.loss_year': 'year lost' };
  var RAMP = { 'indices.ndvi': [[120, 72, 40], [196, 170, 90], [40, 150, 70]], 'modis.lst_day_8day': [[40, 90, 200], [240, 210, 90], [215, 50, 40]], 'hansen.tree_cover_2000': [[70, 50, 30], [150, 160, 80], [30, 120, 60]], 'hansen.loss_year': [[30, 60, 40], [230, 170, 60], [230, 60, 50]] };
  function heat(sq, bi, band, sweep) {
    var n = 1 + Math.max.apply(null, sq.map(function (s) { return Math.max(s.r, s.c); })), S = 30, cv = el('canvas'); cv.width = cv.height = n * S;
    var vals = sq.map(function (s) { return s.v[bi] == null ? null : +s.v[bi]; }).filter(function (v) { return v != null && isFinite(v); }).sort(function (a, b) { return a - b; });
    var lo = vals[0], hi = vals[vals.length - 1], g = cv.getContext('2d'), ramp = RAMP[band] || [[20, 24, 30], [110, 120, 140], [240, 240, 235]];
    g.fillStyle = '#06090d'; g.fillRect(0, 0, cv.width, cv.height);
    var paint = function (s) {
      var v = s.v[bi] == null ? null : +s.v[bi];
      if (v == null || !isFinite(v)) { g.fillStyle = '#10141a'; } else {
        var t = hi > lo ? (v - lo) / (hi - lo) : .5, a = t < .5 ? ramp[0] : ramp[1], b = t < .5 ? ramp[1] : ramp[2], u = t < .5 ? t * 2 : t * 2 - 1;
        g.fillStyle = 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * u); }).join(',') + ')';
      }
      g.fillRect(s.c * S + 1, s.r * S + 1, S - 2, S - 2);
    };
    // swept in along the diagonals, a square at a time, as the note's rows are read
    var order = sq.slice().sort(function (a, b) { return a.r + a.c - b.r - b.c; });
    if (!sweep || !window.requestAnimationFrame || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) order.forEach(paint);
    else { var i = 0, per = Math.ceil(order.length / 26); (function step() { for (var k = 0; k < per && i < order.length; k++) paint(order[i++]); if (i < order.length) requestAnimationFrame(step); })(); }
    return { cv: cv, lo: lo, hi: hi };
  }
  async function grid(R, r, x, nb) {
    var text = vx.dec.decode(nb), f = front(text), bands = (f.bands || '').split(/\s+/).filter(Boolean), sq = squares(text, bands), named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    R.line('capture', (f.place || '').split(',')[0] || (x && x.title), { squares: sq.length, grid: (f.grid || '').split(',')[0], maps: bands.length }, 'info', 'the note');
    R.line('encode', 'the note, not the maps', { name: named ? 'blake3 ✓' : 'LIES' }, named ? 'ok' : 'fail', 'this browser');
    if (!named) return {};
    // see: every map drawn from the note, one chip per band
    var box = el('div', 'eg-maps'), pic = el('div', 'eg-map'), chips = el('div', 'eg-chips'), key = el('p', 'eg-key');
    var first = true, draw = function (bi) {
      var h = heat(sq, bi, bands[bi], first); first = false; pic.innerHTML = ''; pic.appendChild(h.cv);
      key.textContent = bands[bi] + ' · ' + (h.lo != null ? +h.lo.toPrecision(4) + ' → ' + +h.hi.toPrecision(4) : 'no values');
      chips.querySelectorAll('button').forEach(function (b, i) { b.setAttribute('aria-pressed', i === bi ? 'true' : 'false'); });
    };
    bands.forEach(function (b, i) { var c = el('button', 'chip', NAME[b] || b.split('.').pop().replace(/_/g, ' ')); c.type = 'button'; c.addEventListener('click', function () { draw(i); }); chips.appendChild(c); });
    box.appendChild(pic); box.appendChild(chips); box.appendChild(key); draw(0);
    R.show(box, sq.length + ' squares, drawn from the note whose name just checked');
    var toks = bands.map(function (b) { return f['bundle ' + b]; }).filter(Boolean), tb = toks.reduce(function (a, t) { return a + vx.enc.encode(t).length; }, 0);
    R.line('send', 'one token per map', { tokens: toks.length, bytes: tb }, 'info', 'to any agent');
    var js = await Promise.all(toks.map(function (t) { return R.get('/v1/memory_bundle/' + t); })); if (R.stale()) return { tb: tb };
    var nSig = 0, nCid = 0, members = 0, rowsWith = 0;
    js.forEach(function (j, i) {
      if (signedByEmem(j.receipt)) nSig++;
      if (vx.bundleCid(j.citations || [], j.purpose) === toks[i].split(':').pop()) nCid++;
      var cells = {}; (j.cells || []).forEach(function (c) { cells[c] = 1; });
      sq.forEach(function (s) { if (s.v[i] != null) { rowsWith++; if (cells[s.cell]) members++; } });
    });
    var good = R.ok(nSig === toks.length && nCid === toks.length && members === rowsWith);
    R.line('decode', '@emem opens each map', { signed: nSig + ' of ' + toks.length + (nSig === toks.length ? ' ✓' : ''), names: nCid === toks.length ? 'recomputed ✓' : nCid + ' of ' + toks.length, squares: members + ' of ' + rowsWith + ' inside' + (members === rowsWith ? ' ✓' : '') }, good ? 'ok' : 'fail', 'emem.dev, checked here');
    // check: the centre square's first map, echoed back verbatim
    var mid = sq.filter(function (s) { return s.v[0] != null; }).sort(function (a, b) { return Math.abs(a.r - 5.5) + Math.abs(a.c - 5.5) - Math.abs(b.r - 5.5) - Math.abs(b.c - 5.5); })[0];
    var cite = mid && (js[0].citations || []).filter(function (c) { return c.cell === mid.cell; })[0];
    if (cite) await echo(R, { label: 'square ' + mid.r + ',' + mid.c + ', ' + bands[0], value: mid.v[0], unit: '', token: cite.memory_token, cid: cite.fact_cid });
    return { tb: tb };
  }

  /* ---------- timelapse.v1: one square of Earth, year after year, from signed pixels ---------- */
  function paint(frames) {
    var lims = [0, 1, 2].map(function (b) {
      var v = []; frames.forEach(function (f) { var px = f[b].data; for (var i = 0; i < px.length; i += 17) if (isFinite(px[i]) && px[i] > 0) v.push(px[i]); });
      v.sort(function (a, c) { return a - c; }); return [v[Math.floor(v.length * .02)] || 0, v[Math.floor(v.length * .98)] || 1];
    });
    return frames.map(function (f) {
      var w = f[0].w, h = f[0].h, cv = el('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d'), img = g.createImageData(w, h);
      for (var i = 0; i < w * h; i++) { for (var b = 0; b < 3; b++) { var lo = lims[b][0], hi = lims[b][1], v = f[b].data[i]; img.data[i * 4 + b] = isFinite(v) ? Math.max(0, Math.min(255, 255 * Math.pow(Math.max(0, (v - lo) / (hi - lo || 1)), .8))) : 0; } img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0); return cv;
    });
  }
  // a frame from whichever of its bands have arrived; each band stretched on its own
  function bandsCanvas(bands) {
    var g0 = bands.filter(Boolean)[0]; if (!g0) return el('canvas');
    var w = g0.w, h = g0.h, cv = el('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d'), img = cx.createImageData(w, h);
    var lim = bands.map(function (b) {
      if (!b) return null; var v = [];
      for (var i = 0; i < b.data.length; i += 17) if (isFinite(b.data[i]) && b.data[i] > 0) v.push(b.data[i]);
      v.sort(function (a, c) { return a - c; }); return [v[Math.floor(v.length * .02)] || 0, v[Math.floor(v.length * .98)] || 1];
    });
    for (var i = 0; i < w * h; i++) {
      for (var k = 0; k < 3; k++) { var b = bands[k], L = lim[k], v = b && b.data[i]; img.data[i * 4 + k] = b && isFinite(v) ? Math.max(0, Math.min(255, 255 * Math.pow(Math.max(0, (v - L[0]) / (L[1] - L[0] || 1)), .8))) : 0; }
      img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0); return cv;
  }
  // two frames, one over the other: drag to see what changed
  function slider(a, b, da, db) {
    var box = el('div', 'eg-cmp'), top = el('div', 'eg-cmp-top'), r = el('input'), la = el('span', 'eg-cmp-a', da), lb = el('span', 'eg-cmp-b', db);
    box.appendChild(a); top.appendChild(b); box.appendChild(top); box.appendChild(la); box.appendChild(lb);
    r.type = 'range'; r.min = 0; r.max = 100; r.value = 50; r.setAttribute('aria-label', 'drag between ' + da + ' and ' + db);
    var set = function () { top.style.clipPath = 'inset(0 0 0 ' + r.value + '%)'; box.style.setProperty('--at', r.value + '%'); };
    r.addEventListener('input', set); box.appendChild(r); set();
    return box;
  }
  async function reel(R, r, x, nb) {
    var text = vx.dec.decode(nb), f = front(text), named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    var cubes = (f.cubes || '').split(/\s+/).filter(Boolean), frames = [];
    text.split('\n').forEach(function (l) { var m = /^\| (\d{4}-\d{2}-\d{2}) \| (\S+) \| (emem:raster:\S+) \| (emem:raster:\S+) \| (emem:raster:\S+) \|$/.exec(l); if (m) frames.push({ date: m[1], scene: m[2], t: [m[3], m[4], m[5]] }); });
    R.line('capture', (f.place || (x && x.title) || '').split(',').slice(0, 2).join(','), { frames: frames.length, from: (frames[0] || {}).date, to: (frames[frames.length - 1] || {}).date }, 'info', 'the note');
    R.line('encode', 'the note, not the pixels', { name: named ? 'blake3 ✓' : 'LIES' }, named ? 'ok' : 'fail', 'this browser');
    if (!named || cubes.length !== 3 || frames.length < 2) return {};
    var tb = cubes.reduce(function (a, t) { return a + vx.enc.encode(t).length; }, 0);
    R.line('send', 'three tokens, one per colour', { tokens: 3, bytes: tb }, 'info', 'to any agent');
    var recs = await Promise.all(cubes.map(function (t) { return R.post('/v1/cube/resolve', { token: t }); })); if (R.stale()) return { tb: tb };
    var mem = recs.map(function (c) { return (c.derivation || c.record || c).members || []; }), nSig = recs.filter(function (c) { return signedByEmem(c.receipt); }).length;
    var find = function (b, t) { return mem[b].filter(function (m) { return m.raster_token === t; })[0]; };
    var inCube = frames.filter(function (fr) { return fr.t.every(function (t, b) { return find(b, t); }); }).length, good = R.ok(nSig === 3 && inCube === frames.length);
    R.line('decode', '@emem opens the three cubes', { signed: nSig + ' of 3' + (nSig === 3 ? ' ✓' : ''), frames: inCube + ' of ' + frames.length + ' are their members' + (inCube === frames.length ? ' ✓' : '') }, good ? 'ok' : 'fail', 'emem.dev, checked here');
    if (!good) return { tb: tb };
    // check: the first and last frames' pixels, fetched by name; each must hash to it
    var ends = [frames[0], frames[frames.length - 1]], got = 0, bytes = 0, early = [null, null, null], NAMES = ['red', 'green', 'blue'];
    var grids = await pool([0, 1, 2, 3, 4, 5].map(function (k) {
      var fr = ends[k / 3 | 0], m = find(k % 3, fr.t[k % 3]);
      return function () {
        return vx.getBytes(EMEM + '/v1/artifacts/' + m.artifact_cid, {}, R.L).then(function (res) {
          bytes += res.bytes.length; if (vx.cid52(res.bytes) !== m.artifact_cid) return null; got++;
          var gd = vx.gridDecode(res.bytes);
          if (k < 3 && !R.stale()) { early[k] = gd; R.show(bandsCanvas(early), ends[0].date + ' · ' + NAMES.map(function (nm, i) { return nm + (early[i] ? ' ✓' : ' …'); }).join(' · ')); }
          return gd;
        });
      };
    }), 3);
    if (R.stale()) return { tb: tb };
    var allOk = R.ok(got === 6);
    R.line('check', 'the pixels of ' + ends[0].date.slice(0, 4) + ' and ' + ends[1].date.slice(0, 4), { read: vx.fmtBytes(bytes), bands: '3 each', blake3: got + ' of 6 match their names' + (allOk ? ' ✓' : '') }, allOk ? 'ok' : 'fail', 'emem.dev, hashed here');
    if (!allOk) return { tb: tb };
    var cv = paint([grids.slice(0, 3), grids.slice(3, 6)]);
    R.line('see', 'what changed', { from: ends[0].date, to: ends[1].date, picture: cv[0].width + '×' + cv[0].height + ' px' }, 'info', 'painted here');
    R.show(slider(cv[0], cv[1], ends[0].date, ends[1].date), ends[0].date + ' ↔ ' + ends[1].date + ' · signed pixels, painted here · drag');
    return { tb: tb };
  }

  /* ---------- directory.v1: a folder's listing, its root, and one file checked against its publisher ---------- */
  async function folder(R, r, x, nb) {
    var text = vx.dec.decode(nb), f = front(text), named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    var files = [], re = /^\| (.+?) \| (https?:\/\/\S+) \| (\d+) \| (\S+) \|$/gm, m;
    while ((m = re.exec(text))) files.push({ path: m[1].replace(/%7C/g, '|'), url: m[2], size: +m[3], hash: m[4] });
    var leaves = files.map(function (a) { return { url: a.url, offset: 0, length: a.size, hash: vx.b32(vx.blake3(vx.enc.encode(a.path + '\n' + a.size + '\n' + a.hash))) }; });
    var rooted = R.ok(!!f.root && vx.merkleRoot(leaves) === f.root);
    R.line('capture', vx.hostOf(f.source || ''), { files: files.length, size: vx.fmtBytes(+f.bytes || 0), kind: f.kind }, 'info', 'the note');
    R.line('encode', 'the listing, not the files', { name: named ? 'blake3 ✓' : 'LIES', root: rooted ? 'rebuilt ✓' : 'NO' }, named && rooted ? 'ok' : 'fail', 'this browser');
    R.data('files', files);
    if (!named) return {};
    R.line('send', 'the note’s name', { token: r.cid, bytes: r.cid.length }, 'info', 'to any agent');
    // check: the smallest file whose publisher hash this browser can compute, read now and hashed
    var pick = files.filter(function (a) { return /^(sha256|git-sha1):/.test(a.hash) && a.size <= 2e6 && a.size > 0; }).sort(function (a, b) { return a.size - b.size; })[0];
    if (!pick) return { tb: r.cid.length };
    var body = (await vx.getBytes(pick.url, {}, R.L)).bytes; if (R.stale()) return { tb: r.cid.length };
    var algo = pick.hash.split(':')[0], want = pick.hash.split(':')[1];
    var got = algo === 'sha256' ? await digest('SHA-256', body) : await digest('SHA-1', cat2(vx.enc.encode('blob ' + body.length + '\0'), body));
    var ok = R.ok(got === want && body.length === pick.size);
    R.line('check', pick.path, { read: vx.fmtBytes(body.length), from: vx.hostOf(pick.url), [algo]: got === want ? 'matches the listing ✓' : 'NO' }, ok ? 'ok' : 'fail', 'your browser read it');
    return { fileB: +f.bytes || null, tb: r.cid.length };
  }

  /* ---------- any other note: its name ---------- */
  function any(R, r, x, nb) {
    var named = R.ok(vx.cid26(nb) === r.cid); R.named(named);
    R.line('encode', 'the note', { name: named ? 'blake3 ✓' : 'LIES', schema: front(vx.dec.decode(nb)).emem || 'none' }, named ? 'ok' : 'fail', 'this browser');
    if (named) R.line('send', 'the note’s name', { token: r.cid, bytes: r.cid.length }, 'info', 'to any agent');
    return { tb: r.cid.length };
  }

  // one sample, whatever its schema
  async function auto(R, r, x) {
    if (r.trace) return trace(R, r);
    var nb = (await vx.getBytes(NOTE(r.cid), {}, R.L)).bytes; if (R.stale()) return {};
    var s = front(vx.dec.decode(nb)).emem || '';
    var run = { 'pointer.v1': pointer, 'camera.v1': camera, 'world.v1': world, 'grid.v1': grid, 'timelapse.v1': reel, 'directory.v1': folder }[s] || any;
    return run(R, r, x, nb);
  }

  /* ---------- the tally: bars to scale, and how many checks passed ---------- */
  function bar(label, frac, txt, cls) {
    var r = el('div', 'run-bar ' + (cls || '')); r.appendChild(el('span', 'k', label));
    var i = el('i'), u = el('u'); u.style.width = Math.min(100, frac * 100).toFixed(4) + '%'; u.style.minWidth = '2px'; i.appendChild(u); r.appendChild(i);
    r.appendChild(el('em', null, txt)); return r;
  }
  function tally(box, R, x, out) {
    box.innerHTML = ''; out = out || {};
    // to scale: next to the file, the token is a sliver
    if (out.fileB && out.tb) {
      box.appendChild(bar('the file', 1, vx.fmtSize(out.fileB) + ', stays put', 'is-file'));
      box.appendChild(bar('what moved', out.tb / out.fileB, out.tb + ' bytes, the token', 'is-tok'));
    }
    var nt = x && tokOf(x.kv.tok), rt = x && tokOf(x.kv.raw);
    if (nt && rt) {
      box.appendChild(bar('file to a model', 1, tk(rt) + ' tokens as raw bytes', 'is-raw'));
      box.appendChild(bar('note to a model', nt / rt, tk(nt) + ' tokens · ' + Math.round(rt / nt).toLocaleString('en-US') + '× less', 'is-tok'));
    }
    if ((out.fileB && out.tb) || (nt && rt)) box.appendChild(el('p', 'run-scale', 'bars to scale'));
    var s = el('p', 'run-score ' + (R.passed === R.checks ? 'is-ok' : 'is-fail'));
    s.textContent = R.passed + ' of ' + R.checks + ' checks passed in your browser · ' + vx.fmtBytes(R.L.total) + ' fetched in all, from ' + Object.keys(R.L.hosts).join(', ');
    box.appendChild(s);
  }

  window.vxEngine = { NOTE: NOTE, Run: Run, auto: auto, pointer: pointer, camera: camera, trace: trace, echo: echo, tally: tally, tokOf: tokOf, tk: tk, front: front, el: el };
})();
