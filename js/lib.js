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
 *   merkle     the pointer.v1 root: leaf = blake3(url | u64 offset | u64 length | hash)
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
  // segments: [[tag, Uint8Array], ...] in tag order; returns the blake3 digest ed25519 signs
  function preimage(domain, segments) {
    var d = enc.encode(domain), parts = [enc.encode('emem.preimage.v1\0'), u32le(d.length), d];
    for (var i = 0; i < segments.length; i++) parts.push(new Uint8Array([segments[i][0]]), u32le(segments[i][1].length), segments[i][1]);
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
    parsePointer: parsePointer, merkleRoot: merkleRoot, fmtBytes: bytes, group: group, enc: enc, dec: dec
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
