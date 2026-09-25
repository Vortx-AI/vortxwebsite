/* lib.js: the science the page runs, with no library it did not vendor.
 *
 * Shared by the page (window) and the receiving agent (a Web Worker), so both
 * compute with the same code:
 *   b32        base32 lowercase unpadded, the encoding every emem id uses
 *   cbor       a reader for the canonical CBOR a fact_cid commits to
 *   net        fetch that counts every byte by host (the ledger)
 *   tiff       IFD parser for classic and BigTIFF, enough for a COG
 *   tile       DEFLATE through the browser's DecompressionStream + TIFF predictor 2
 *   utm        WGS84 to UTM, the Snyder (1987) series emem's Rust sampler uses
 *   preimage   emem.preimage.v1 streams, for objects the verifier core has no entry point for
 *   merkle     the pointer.v1 root: leaf = blake3(url | u64 offset | u64 length | hash); emem:tree paths
 *   cbor-out   a canonical CBOR writer (serde declaration order), for re-deriving signed records
 *   trace      emem.os_trace.v1: segment chain, merkle v1 root, trace_cid, the device's signature
 *   ids        entity_cid and bundle_cid from their preimages; the EMEMGRD1 field grid
 *   eph        Moon (Meeus ch. 47), Mars (Standish elements), Sun-Earth L2 (three-body quintic)
 * blake3 and ed25519 come from vendor/emem-verify-core.js (noble, self-tested
 * against the Rust signer's golden vectors).
 */
(function (root) {
  'use strict';

  var enc = new TextEncoder();
  var dec = new TextDecoder();
  function core() {
    var I = root.ememVerifyInternals;
    if (!I) throw new Error('emem-verify-core not loaded');
    return I;
  }

  /* ---------- base32 (RFC 4648 alphabet, lowercase, no padding) ---------- */
  var A = 'abcdefghijklmnopqrstuvwxyz234567';
  function b32(u8) {
    var s = '', bits = 0, v = 0;
    for (var i = 0; i < u8.length; i++) {
      v = (v << 8) | u8[i]; bits += 8;
      while (bits >= 5) { s += A[(v >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) s += A[(v << (5 - bits)) & 31];
    return s;
  }
  function unb32(s) {
    var out = [], bits = 0, v = 0;
    for (var i = 0; i < s.length; i++) {
      var c = A.indexOf(s[i]);
      if (c < 0) throw new Error('not base32: ' + s[i]);
      v = (v << 5) | c; bits += 5;
      if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0'); return s; }
  function blake3(u8) { return core().blake3(u8); }
  // emem names: a fact_cid is the full 32-byte digest (52 chars); a note cid is the first 16 bytes (26 chars)
  function cid52(u8) { return b32(blake3(u8)); }
  function cid26(u8) { return b32(blake3(u8).slice(0, 16)); }
  function cat() {
    var n = 0, i; for (i = 0; i < arguments.length; i++) n += arguments[i].length;
    var r = new Uint8Array(n), o = 0;
    for (i = 0; i < arguments.length; i++) { r.set(arguments[i], o); o += arguments[i].length; }
    return r;
  }

  /* ---------- CBOR reader (RFC 8949), enough for a signed fact ---------- */
  function cborDecode(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), p = 0;
    function uint(ai) {
      if (ai < 24) return ai;
      if (ai === 24) return dv.getUint8(p++);
      if (ai === 25) { var a = dv.getUint16(p); p += 2; return a; }
      if (ai === 26) { var b = dv.getUint32(p); p += 4; return b; }
      if (ai === 27) { var c = dv.getBigUint64(p); p += 8; return c <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(c) : c; }
      throw new Error('cbor: indefinite lengths are not canonical');
    }
    function half(h) {
      var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
      if (e === 31) return f ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + f / 1024);
    }
    function item() {
      var ib = dv.getUint8(p++), mt = ib >> 5, ai = ib & 31, n, i, out;
      switch (mt) {
        case 0: return uint(ai);
        case 1: n = uint(ai); return typeof n === 'bigint' ? -1n - n : -1 - n;
        case 2: n = uint(ai); out = u8.slice(p, p + n); p += n; return out;
        case 3: n = uint(ai); out = dec.decode(u8.subarray(p, p + n)); p += n; return out;
        case 4: n = uint(ai); out = []; for (i = 0; i < n; i++) out.push(item()); return out;
        case 5: n = uint(ai); out = {}; for (i = 0; i < n; i++) { var k = item(); out[k] = item(); } return out;
        case 6: uint(ai); return item();
        case 7:
          if (ai === 20) return false;
          if (ai === 21) return true;
          if (ai === 22 || ai === 23) return null;
          if (ai === 25) { var h = dv.getUint16(p); p += 2; return half(h); }
          if (ai === 26) { var f = dv.getFloat32(p); p += 4; return f; }
          if (ai === 27) { var d = dv.getFloat64(p); p += 8; return d; }
          throw new Error('cbor: simple value ' + ai);
      }
    }
    var v = item();
    if (p !== u8.length) throw new Error('cbor: ' + (u8.length - p) + ' trailing bytes');
    return v;
  }

  /* ---------- net: fetch with a byte ledger ---------- */
  function hostOf(url) { try { return new URL(url, root.location && root.location.href).host; } catch (e) { return 'unknown'; } }
  function Ledger() { this.hosts = {}; this.total = 0; }
  Ledger.prototype.add = function (url, n) {
    var h = hostOf(url);
    this.hosts[h] = (this.hosts[h] || 0) + n; this.total += n;
  };
  // read a body while counting bytes as they arrive
  async function readBody(res, url, ledger, onProgress, cap) {
    if (!res.body || !res.body.getReader) {
      var b = new Uint8Array(await res.arrayBuffer());
      if (ledger) ledger.add(url, b.length);
      return b;
    }
    var rd = res.body.getReader(), parts = [], got = 0;
    for (;;) {
      var r = await rd.read();
      if (r.done) break;
      parts.push(r.value); got += r.value.length;
      if (ledger) ledger.add(url, r.value.length);
      if (onProgress) onProgress(got);
      if (cap && got >= cap) { rd.cancel().catch(function () {}); break; }
    }
    var out = new Uint8Array(got), o = 0;
    for (var i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }
  async function getBytes(url, opts, ledger, onProgress) {
    var res = await fetch(url, opts || {});
    if (!res.ok) throw Object.assign(new Error(hostOf(url) + ' answered ' + res.status), { status: res.status });
    return { bytes: await readBody(res, url, ledger, onProgress), res: res };
  }
  // exactly [offset, offset+length) from a source that honours Range; refuses a longer or shifted answer
  async function range(url, offset, length, ledger, onProgress) {
    var res = await fetch(url, { headers: { range: 'bytes=' + offset + '-' + (offset + length - 1) } });
    if (res.status !== 206) {
      if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
      throw new Error(hostOf(url) + ' answered ' + res.status + ', not 206 Partial Content');
    }
    var cr = (res.headers.get('content-range') || '').match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    if (cr && +cr[1] !== offset) throw new Error('range starts at ' + cr[1] + ', asked ' + offset);
    var b = await readBody(res, url, ledger, onProgress, length + 1);
    if (b.length !== length) throw new Error('got ' + b.length + ' bytes for a ' + length + '-byte range');
    return { bytes: b, total: cr && cr[3] !== '*' ? +cr[3] : null, etag: res.headers.get('etag') };
  }

  // total size of a remote file. Content-Length is on the CORS safelist; Content-Range is not,
  // so a browser cannot read the total off a 206 unless the server exposes it. HEAD carries no body.
  async function headSize(url) {
    try {
      var r = await fetch(url, { method: 'HEAD' });
      var n = +r.headers.get('content-length');
      return r.ok && n > 0 ? n : null;
    } catch (e) { return null; }
  }

  /* ---------- TIFF / COG ---------- */
  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
  // parse the first IFD; fetchMore(offset, length) supplies bytes outside the header buffer
  async function tiffIFD0(head, fetchMore) {
    var dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    var bo = String.fromCharCode(head[0], head[1]);
    if (bo !== 'II' && bo !== 'MM') throw new Error('not a TIFF');
    var le = bo === 'II', magic = dv.getUint16(2, le), big = magic === 43;
    if (magic !== 42 && !big) throw new Error('TIFF magic ' + magic);
    var ifd = big ? Number(dv.getBigUint64(8, le)) : dv.getUint32(4, le);
    var n = big ? Number(dv.getBigUint64(ifd, le)) : dv.getUint16(ifd, le);
    var es = big ? 20 : 12, base = ifd + (big ? 8 : 2), inline = big ? 8 : 4, tags = {};
    for (var i = 0; i < n; i++) {
      var e = base + i * es;
      var tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le);
      var count = big ? Number(dv.getBigUint64(e + 4, le)) : dv.getUint32(e + 4, le);
      var size = (TYPE_SIZE[type] || 1) * count, voff = e + (big ? 12 : 8), src = dv, at = voff;
      if (size > inline) {
        var off = big ? Number(dv.getBigUint64(voff, le)) : dv.getUint32(voff, le);
        if (off + size <= head.length) at = off;
        else { var more = await fetchMore(off, size); src = new DataView(more.buffer, more.byteOffset, more.byteLength); at = 0; }
      }
      tags[tag] = readVals(src, at, type, count, le);
    }
    return { little: le, bigtiff: big, tags: tags };
  }
  function readVals(dv, at, type, count, le) {
    var out = [], i;
    if (type === 2) { for (i = 0; i < count; i++) out.push(dv.getUint8(at + i)); return String.fromCharCode.apply(null, out).replace(/\0+$/, ''); }
    for (i = 0; i < count; i++) {
      switch (type) {
        case 1: case 7: out.push(dv.getUint8(at + i)); break;
        case 6: out.push(dv.getInt8(at + i)); break;
        case 3: out.push(dv.getUint16(at + 2 * i, le)); break;
        case 8: out.push(dv.getInt16(at + 2 * i, le)); break;
        case 4: out.push(dv.getUint32(at + 4 * i, le)); break;
        case 9: out.push(dv.getInt32(at + 4 * i, le)); break;
        case 11: out.push(dv.getFloat32(at + 4 * i, le)); break;
        case 12: out.push(dv.getFloat64(at + 8 * i, le)); break;
        case 16: out.push(Number(dv.getBigUint64(at + 8 * i, le))); break;
        case 17: out.push(Number(dv.getBigInt64(at + 8 * i, le))); break;
        default: out.push(null);
      }
    }
    return out;
  }
  // the fields a single-pixel read needs, named
  function cogProfile(ifd) {
    var t = ifd.tags, gk = t[34735] || [], epsg = null;
    for (var i = 4; i + 3 < gk.length; i += 4) if (gk[i] === 3072) epsg = gk[i + 3];
    var p = {
      width: t[256][0], height: t[257][0], bits: (t[258] || [0])[0], compression: (t[259] || [1])[0],
      predictor: (t[317] || [1])[0], spp: (t[277] || [1])[0], planar: (t[284] || [1])[0],
      tileW: t[322] && t[322][0], tileH: t[323] && t[323][0], offsets: t[324], counts: t[325],
      scale: t[33550], tie: t[33922], epsg: epsg, nodata: t[42113] || null, little: ifd.little, bigtiff: ifd.bigtiff
    };
    if (!p.tileW || !p.offsets) throw new Error('not tiled: a strip TIFF is not a COG');
    p.tileCols = Math.ceil(p.width / p.tileW);
    return p;
  }
  // emem_fetch::cog::world_to_pixel, verbatim: round(i + (x - X)/sx), round(j + (Y - y)/sy)
  function worldToPixel(p, x, y) {
    var col = Math.round(p.tie[0] + (x - p.tie[3]) / p.scale[0]);
    var row = Math.round(p.tie[1] + (p.tie[4] - y) / p.scale[1]);
    return { col: col, row: row };
  }
  function tileOf(p, col, row) {
    var tc = Math.floor(col / p.tileW), tr = Math.floor(row / p.tileH);
    var idx = tr * p.tileCols + tc;
    return { idx: idx, tc: tc, tr: tr, x: col - tc * p.tileW, y: row - tr * p.tileH, offset: p.offsets[idx], length: p.counts[idx] };
  }
  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser has no DecompressionStream');
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  // one 16-bit single-band tile: inflate, then undo horizontal differencing
  async function decodeTile16(p, compressed) {
    if (p.compression !== 8 && p.compression !== 32946) throw new Error('compression ' + p.compression + ' (only DEFLATE is read here)');
    if (p.bits !== 16 || p.spp !== 1) throw new Error(p.bits + '-bit x ' + p.spp + ' samples (16-bit single band expected)');
    var raw = await inflate(compressed), w = p.tileW, h = p.tileH;
    if (raw.length < w * h * 2) throw new Error('tile inflated to ' + raw.length + ' bytes, expected ' + (w * h * 2));
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), px = new Uint16Array(w * h), le = p.little;
    for (var i = 0; i < w * h; i++) px[i] = dv.getUint16(2 * i, le);
    if (p.predictor === 2) {
      for (var r = 0; r < h; r++) { var b = r * w; for (var c = 1; c < w; c++) px[b + c] = (px[b + c] + px[b + c - 1]) & 0xffff; }
    } else if (p.predictor !== 1) throw new Error('predictor ' + p.predictor);
    return px;
  }

  /* ---------- WGS84 -> UTM (Snyder 1987 eq. 8-1..8-13, k0 = 0.9996) ----------
     The same series, constants and operation order as emem-fetch/src/proj.rs,
     so the easting/northing a browser computes lands on the same pixel. */
  function utm(latDeg, lonDeg, zone) {
    var a = 6378137.0, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
    var lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    var phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180;
    var sp = Math.sin(phi), cp = Math.cos(phi), tp = Math.tan(phi);
    var N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, Aa = cp * (lam - lon0);
    var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * phi)
      + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * phi)
      - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * phi));
    var A3 = Aa * Aa * Aa, A4 = A3 * Aa, A5 = A4 * Aa, A6 = A5 * Aa;
    var E = k0 * N * (Aa + (1 - T + C) * A3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5 / 120) + 500000;
    var Nn = k0 * (M + N * tp * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * A4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6 / 720));
    if (latDeg < 0) Nn += 10000000;
    return { e: E, n: Nn };
  }
  function epsgZone(epsg) {
    if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, south: false };
    if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, south: true };
    return null;
  }

  /* ---------- emem.preimage.v1 ---------- */
  function u32le(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
  function u64be(n) { var b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; }
  // segments: [[tag, Uint8Array], ...] in tag order; returns the blake3 digest ed25519 signs.
  // A segment whose value is an array of strings is a list segment: tag, u32le count, then u32le length + bytes per item.
  function preimage(domain, segments) {
    var d = enc.encode(domain), parts = [enc.encode('emem.preimage.v1\0'), u32le(d.length), d];
    for (var i = 0; i < segments.length; i++) {
      var tag = new Uint8Array([segments[i][0]]), val = segments[i][1];
      if (Array.isArray(val)) {
        parts.push(tag, u32le(val.length));
        val.forEach(function (s) { var b = enc.encode(s); parts.push(u32le(b.length), b); });
      } else parts.push(tag, u32le(val.length), val);
    }
    return blake3(cat.apply(null, parts));
  }
  function edVerify(sigB32, digest, pubB32) {
    var I = core();
    try { return !!I.ed.verify(unb32(sigB32), digest, unb32(pubB32)); } catch (e) { return false; }
  }
  // the transparency-log head: domain emem.translog.sth.v1 {1 tree_size u64be, 2 root, 3 signed_at, 4 responder_pubkey}
  function verifySTH(s) {
    var d = preimage('emem.translog.sth.v1', [[1, u64be(s.tree_size)], [2, unb32(s.root_b32)], [3, enc.encode(s.signed_at)], [4, unb32(s.responder_pubkey_b32)]]);
    return edVerify(s.signature_b32, d, s.responder_pubkey_b32);
  }
  // POST /v1/range_hash: domain emem.range_hash.v1 {1 url, 2 offset, 3 length, 4 blake3, 5 etag, 6 fetched_at, 7 responder_pubkey, 8 fetched_url}
  function verifyRangeHash(r) {
    var rc = r.receipt || {};
    var d = preimage('emem.range_hash.v1', [[1, enc.encode(r.url)], [2, u64be(r.offset)], [3, u64be(r.length)], [4, unb32(r.blake3_b32)],
      [5, enc.encode(r.etag || 'absent')], [6, enc.encode(r.fetched_at)], [7, unb32(rc.responder_pubkey_b32)], [8, enc.encode(r.fetched_url || r.url)]]);
    return edVerify(rc.signature_b32, d, rc.responder_pubkey_b32);
  }

  /* ---------- pointer.v1 ---------- */
  function parsePointer(text) {
    var fm = {}, m = text.match(/^---\n([\s\S]*?)\n---/);
    if (m) m[1].split('\n').forEach(function (l) { var i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    var rows = [], re = /^\| ([^|]+) \| (\S+) \| (\d+) \| (\d+) \| ([^|]+) \|(?: ([^|]*) \|)?$/gm, r;
    var zero = b32(new Uint8Array(32));
    while ((r = re.exec(text))) {
      if (r[1] === 'what' || /^-+$/.test(r[1])) continue;
      var h = r[5].trim(), ok = /^[a-z2-7]{52}$/.test(h);
      rows.push({ label: r[1].trim(), url: r[2] === '·' ? '' : r[2], offset: +r[3], length: +r[4], hash: ok ? h : zero, absent: !ok, stats: (r[6] || '').trim() });
    }
    return { fm: fm, rows: rows };
  }
  function merkleRoot(rows) {
    var l = rows.map(function (c) { return blake3(cat(enc.encode(c.url || ''), u64be(c.offset), u64be(c.length), unb32(c.hash))); });
    if (!l.length) return '';
    while (l.length > 1) {
      var n = [];
      for (var i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? blake3(cat(l[i], l[i + 1])) : l[i]);
      l = n;
    }
    return b32(l[0]);
  }
  // emem:tree: one row's audit path to the note's root, log2(n) hashes instead of the whole table
  function treeLeaf(row) { return blake3(cat(enc.encode(row.url || ''), u64be(row.offset), u64be(row.length), unb32(row.hash))); }
  function treeWalk(leaf, path) {
    var h = leaf;
    path.forEach(function (st) { var s = unb32(st.hash_b32); h = st.side === 'left' ? blake3(cat(s, h)) : blake3(cat(h, s)); });
    return b32(h);
  }

  /* ---------- canonical CBOR writer ----------
     ciborium's output for serde structs: maps in field declaration order (JS objects keep
     insertion order for these keys), unsigned integers in the shortest head, text, arrays.
     Absent Option fields are simply not set. */
  function cborHead(major, n) {
    var m = major << 5;
    if (n < 24) return new Uint8Array([m | n]);
    if (n < 256) return new Uint8Array([m | 24, n]);
    if (n < 65536) return new Uint8Array([m | 25, n >> 8, n & 255]);
    if (n < 4294967296) return new Uint8Array([m | 26, n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    var b = new Uint8Array(9); b[0] = m | 27; new DataView(b.buffer).setBigUint64(1, BigInt(n)); return b;
  }
  function cborEnc(v) {
    var parts = [];
    (function w(x) {
      if (typeof x === 'number') {
        if (!Number.isSafeInteger(x) || x < 0) throw new Error('cbor: expected an unsigned integer, got ' + x);
        parts.push(cborHead(0, x));
      } else if (typeof x === 'string') { var s = enc.encode(x); parts.push(cborHead(3, s.length), s); }
      else if (x instanceof Uint8Array) parts.push(cborHead(2, x.length), x);
      else if (Array.isArray(x)) { parts.push(cborHead(4, x.length)); x.forEach(w); }
      else if (x && typeof x === 'object') { var k = Object.keys(x); parts.push(cborHead(5, k.length)); k.forEach(function (key) { w(key); w(x[key]); }); }
      else throw new Error('cbor: cannot encode ' + typeof x);
    })(v);
    return cat.apply(null, parts);
  }
  function fromHex(h) { var o = new Uint8Array(h.length >> 1); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }

  /* ---------- merkle v1: leaves blake3(0x00 | leaf), nodes blake3(0x01 | l | r), an odd node pairs with itself ---------- */
  function merkleV1(leaves) {
    if (!leaves.length) return new Uint8Array(32);
    var l = leaves.map(function (x) { return blake3(cat(new Uint8Array([0]), x)); });
    while (l.length > 1) {
      var n = [];
      for (var i = 0; i < l.length; i += 2) n.push(blake3(cat(new Uint8Array([1]), l[i], l[i + 1] || l[i])));
      l = n;
    }
    return l[0];
  }

  /* ---------- emem.os_trace.v1: a device's execution evidence, re-derived ----------
     Field order is emem-trace/src/schema.rs; the preimage is emem_attest::os_trace_preimage_v1.
     Checked against the golden vector /v1/verifier_spec publishes. */
  function traceSeg(s) {
    var o = { layer: s.layer, seq: s.seq, clock_start_ns: s.clock_start_ns, clock_end_ns: s.clock_end_ns, event_count: s.event_count, log_digest: s.log_digest };
    if (s.prev_digest != null) o.prev_digest = s.prev_digest;
    o.encoding = s.encoding;
    return o;
  }
  function traceDev(d) { return { device_key: Array.from(d.device_key), key_epoch: d.key_epoch, substrate_profile: d.substrate_profile, platform: d.platform, os: d.os, kernel: d.kernel, boot_id: d.boot_id }; }
  function traceOut(o) { var r = { payload_digest: o.payload_digest }; if (o.band != null) r.band = o.band; r.emitted_at_ns = o.emitted_at_ns; r.layer = o.layer; return r; }
  function checkTrace(t) {
    var r = { layers: t.segments.map(function (s) { return s.layer; }), events: 0, chain: true, digests: [] };
    t.segments.forEach(function (s, i) {
      r.events += s.event_count;
      if (s.seq !== i || (i === 0 ? s.prev_digest != null : s.prev_digest !== b32(r.digests[i - 1]))) r.chain = false;
      r.digests.push(blake3(cborEnc(traceSeg(s))));
    });
    r.root = b32(merkleV1(r.digests)); r.rootOk = r.root === t.trace_root;
    var win = new Uint8Array(16), dv = new DataView(win.buffer);
    dv.setBigUint64(0, BigInt(t.window_start_ns), true); dv.setBigUint64(8, BigInt(t.window_end_ns), true);
    var segs = [[1, enc.encode(t.schema)], [2, blake3(cborEnc(traceDev(t.device)))], [3, enc.encode(t.device.substrate_profile)], [4, win],
      [5, unb32(t.trace_root)], [6, t.outputs.map(function (o) { return b32(blake3(cborEnc(traceOut(o)))); })]];
    if (t.prev_trace_cid != null) segs.push([7, enc.encode(t.prev_trace_cid)]);
    var whole = { schema: t.schema, device: traceDev(t.device), window_start_ns: t.window_start_ns, window_end_ns: t.window_end_ns,
      segments: t.segments.map(traceSeg), outputs: t.outputs.map(traceOut), trace_root: t.trace_root };
    if (t.prev_trace_cid != null) whole.prev_trace_cid = t.prev_trace_cid;
    whole.signature = Array.from(t.signature);
    r.cid = cid52(cborEnc(whole));
    try { r.sigOk = !!core().ed.verify(Uint8Array.from(t.signature), preimage('os_trace', segs), Uint8Array.from(t.device.device_key)); } catch (e) { r.sigOk = false; }
    r.deviceKey = b32(Uint8Array.from(t.device.device_key));
    return r;
  }

  /* ---------- identities that hash a preimage, truncated to 16 bytes ---------- */
  // emem-primitives entity.rs: an external anchor wins (gers > osm > wikidata > anchor), else cell64|kind|label, normalised
  function normText(s) { return String(s).trim().split(/\s+/).join(' ').toLowerCase(); }
  function entityCid(e) {
    var x = e.external_ids || e.ext || {}, best = null;
    ['gers', 'osm', 'wikidata'].some(function (k) { if (x[k] && String(x[k]).trim()) { best = k + ':' + String(x[k]).trim(); return true; } return false; });
    if (!best && x.anchor && String(x.anchor).trim()) best = String(x.anchor).trim();
    return cid26(enc.encode(best ? 'emem.entity.v1|ext|' + best : 'emem.entity.v1|loc|' + e.cell64 + '|' + normText(e.kind) + '|' + normText(e.label)));
  }
  // memory_bundle.rs: "emem.memory_bundle.v1|" purpose "\n", then cell|band|tslot|fact_cid "\n" per citation
  function bundleCid(citations, purpose) {
    var s = 'emem.memory_bundle.v1|' + (purpose || '') + '\n';
    citations.forEach(function (c) { s += c.cell + '|' + c.band + '|' + c.resolved_tslot + '|' + (c.fact_cid || '') + '\n'; });
    return cid26(enc.encode(s));
  }

  /* ---------- emem-grid-f32.v1: the bytes an artifact_cid hashes (emem-codec grid.rs) ---------- */
  function gridDecode(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var g = { magic: dec.decode(u8.subarray(0, 8)), w: dv.getUint32(8, true), h: dv.getUint32(12, true), epsg: dv.getUint32(16, true),
      y0: dv.getFloat64(24, true), x0: dv.getFloat64(32, true), dy: dv.getFloat64(40, true), dx: dv.getFloat64(48, true), ch: dv.getUint32(56, true) || 1 };
    var n = g.w * g.h * g.ch;
    if (g.magic !== 'EMEMGRD1' || u8.length !== 64 + 4 * n) throw new Error('not an EMEMGRD1 grid of ' + g.w + '×' + g.h);
    g.data = new Float32Array(n);
    for (var i = 0; i < n; i++) g.data[i] = dv.getFloat32(64 + 4 * i, true);
    return g;
  }

  /* ---------- where things are: ephemerides, checked against JPL Horizons ----------
     moon  Meeus, Astronomical Algorithms ch. 47, distance series (Table 47.A): within 5 km of DE441
     mars  JPL approximate Keplerian elements, 1800-2050 (Standish): about 0.01 %
     L2    the Sun-(Earth+Moon) collinear point, from the restricted three-body quintic */
  var DEG = Math.PI / 180, AU_KM = 149597870.7, C_KMS = 299792.458;
  function jcent(ms) { return (ms / 86400000 + 2440587.5 - 2451545.0) / 36525; }
  var MOON_R = [[0,0,1,0,-20905355],[2,0,-1,0,-3699111],[2,0,0,0,-2955968],[0,0,2,0,-569925],[0,1,0,0,48888],[0,0,0,2,-3149],
    [2,0,-2,0,246158],[2,-1,-1,0,-152138],[2,0,1,0,-170733],[2,-1,0,0,-204586],[0,1,-1,0,-129620],[1,0,0,0,108743],
    [0,1,1,0,104755],[2,0,0,-2,10321],[0,0,1,-2,79661],[4,0,-1,0,-34782],[0,0,3,0,-23210],[4,0,-2,0,-21636],
    [2,1,-1,0,24208],[2,1,0,0,30824],[1,0,-1,0,-8379],[1,1,0,0,-16675],[2,-1,1,0,-12831],[2,0,2,0,-10445],
    [4,0,0,0,-11650],[2,0,-3,0,14403],[0,1,-2,0,-7003],[2,-1,-2,0,10056],[1,0,1,0,6322],[2,-2,0,0,-9884],
    [0,1,2,0,5751],[2,-2,-1,0,-4950],[2,0,1,-2,4130],[4,-1,-1,0,-3958],[3,0,-1,0,3258],[2,1,1,0,2616],
    [4,-1,-2,0,-1897],[0,2,-1,0,-2117],[2,2,-1,0,2354],[4,0,1,0,-1423],[0,0,4,0,-1117],[4,-1,0,0,-1571],
    [1,0,-2,0,-1739],[0,0,2,-2,-4421],[0,2,1,0,1165],[2,0,-1,-2,8752]];
  function moonKm(ms) {
    var T = jcent(ms), T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    var F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    var E = 1 - 0.002516 * T - 0.0000074 * T2, s = 0;
    MOON_R.forEach(function (r) { s += r[4] * Math.pow(E, Math.abs(r[1])) * Math.cos((r[0] * D + r[1] * M + r[2] * Mp + r[3] * F) * DEG); });
    return 385000.56 + s / 1000;
  }
  // the Moon's phase: Meeus eq. 48.4 for the phase angle, from the same fundamental arguments
  function moonPhase(ms) {
    var T = jcent(ms), T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    var s = function (x) { return Math.sin(x * DEG); };
    var i = 180 - D - 6.289 * s(Mp) + 2.100 * s(M) - 1.274 * s(2 * D - Mp) - 0.658 * s(2 * D) - 0.214 * s(2 * Mp) - 0.110 * s(D);
    var d = ((D % 360) + 360) % 360;
    return { lit: (1 + Math.cos(i * DEG)) / 2, waxing: d < 180, age: d };
  }
  var KEP = { // [a au, e, I deg, L deg, long. perihelion deg, long. node deg], then rates per Julian century
    emb: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]]
  };
  function helio(body, ms) {
    var T = jcent(ms), k = KEP[body], x = k[0].map(function (v, i) { return v + k[1][i] * T; });
    var a = x[0], e = x[1], I = x[2] * DEG, O = x[5] * DEG, w = (x[4] - x[5]) * DEG, M = ((((x[3] - x[4]) % 360) + 540) % 360 - 180) * DEG, E = M + e * Math.sin(M);
    for (var i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var px = a * (Math.cos(E) - e), py = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w), cI = Math.cos(I), sI = Math.sin(I);
    return [(cw * cO - sw * sO * cI) * px + (-sw * cO - cw * sO * cI) * py, (cw * sO + sw * cO * cI) * px + (-sw * sO + cw * cO * cI) * py, sw * sI * px + cw * sI * py];
  }
  function marsKm(ms) { var a = helio('mars', ms), b = helio('emb', ms); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * AU_KM; }
  function l2Km(ms) {
    var GMS = 1.32712440018e20, GME = 3.986004418e14, GMM = 4.9028e12, mu = (GME + GMM) / (GMS + GME + GMM), g = Math.cbrt(mu / 3);
    for (var i = 0; i < 30; i++) {
      var f = Math.pow(g, 5) + (3 - mu) * Math.pow(g, 4) + (3 - 2 * mu) * g * g * g - mu * g * g - 2 * mu * g - mu;
      g -= f / (5 * Math.pow(g, 4) + 4 * (3 - mu) * g * g * g + 3 * (3 - 2 * mu) * g * g - 2 * mu * g - 2 * mu);
    }
    var b = helio('emb', ms);
    return g * Math.hypot(b[0], b[1], b[2]) * AU_KM;
  }

  /* ---------- formatting ---------- */
  function bytes(n) {
    if (n == null || !isFinite(n)) return '?';
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i];
  }
  function group(n) { return Number(n).toLocaleString('en-US'); }

  root.vx = {
    hostOf: hostOf, b32: b32, unb32: unb32, hex: hex, blake3: blake3, cid52: cid52, cid26: cid26, cat: cat,
    cborDecode: cborDecode, Ledger: Ledger, getBytes: getBytes, range: range, headSize: headSize,
    tiffIFD0: tiffIFD0, cogProfile: cogProfile, worldToPixel: worldToPixel, tileOf: tileOf, inflate: inflate, decodeTile16: decodeTile16,
    utm: utm, epsgZone: epsgZone, preimage: preimage, edVerify: edVerify, verifySTH: verifySTH, verifyRangeHash: verifyRangeHash,
    parsePointer: parsePointer, merkleRoot: merkleRoot, treeLeaf: treeLeaf, treeWalk: treeWalk,
    cborEnc: cborEnc, fromHex: fromHex, merkleV1: merkleV1, checkTrace: checkTrace, entityCid: entityCid, bundleCid: bundleCid, gridDecode: gridDecode,
    eph: { moonKm: moonKm, moonPhase: moonPhase, marsKm: marsKm, l2Km: l2Km, AU_KM: AU_KM, C_KMS: C_KMS },
    fmtBytes: bytes, group: group, enc: enc, dec: dec,
    // a fetch that never reached its server says so in words; any other error keeps its own message
    why: function (e, host) { var m = String((e && e.message) || e); return /failed to fetch|networkerror|load failed/i.test(m) ? (host || 'the server') + ' did not answer this browser' : m; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
