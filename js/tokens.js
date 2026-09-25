/* tokens.js: the emem token family, each member resolved and checked here.
 *
 * Every card names one real token. When the card scrolls into view this file
 * resolves it at emem.dev, then re-derives what the token commits to with this
 * page's own code (js/lib.js, vendor/emem-verify-core.js):
 *   fact        blake3 of the canonical CBOR equals the fact_cid; the receipt verifies
 *   cell        an address, not a digest: centre and extent; nothing to hash until a fact hangs on it
 *   entity      entity_cid recomputed from its anchor (cell64 | kind | label)
 *   bundle      bundle_cid recomputed from the citation list; the receipt verifies
 *   raster      artifact bytes hash to artifact_cid; the anchor pixels match the record
 *   cube        each slice is a raster, checked the same way; the receipt verifies
 *   rasterset   one member's receipt verified here; the set's own cid is recomputed at emem.dev
 *   trace       segment chain, merkle root, trace_cid and the DEVICE's ed25519 signature
 *   attestation the live platform registry, and why no token exists yet
 *   state       blake3 of the stored CBOR equals the address, walked back through the answer
 *   tree        note cid, root over every row, the row's leaf, and log2(n) hashes to the root
 * Each line says where its check ran: in this browser, or at emem.dev.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('tokens');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev';

  /* ---------- net ---------- */
  async function req(path, opt) {
    var r = await fetch(path.indexOf('http') === 0 ? path : EMEM + path, opt || {});
    var b = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw Object.assign(new Error(new URL(r.url).host + ' answered ' + r.status), { status: r.status, bytes: b });
    return { bytes: b, res: r };
  }
  async function json(path, body) {
    var r = await req(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { json: JSON.parse(vx.dec.decode(r.bytes)), n: r.bytes.length, res: r.res };
  }

  /* ---------- lines ---------- */
  function short(s, n) { s = String(s); n = n || 14; return s.length > n + 2 ? s.slice(0, n) + '…' : s; }
  function add(log, verb, noun, kv, state, where) {
    var li = document.createElement('li');
    li.className = 'is-' + (state || 'ok');
    li.innerHTML = '<b class="v"></b><span class="n"></span>';
    li.firstChild.textContent = verb; li.children[1].textContent = noun;
    Object.keys(kv || {}).forEach(function (k) {
      if (kv[k] === undefined || kv[k] === null || kv[k] === '') return;
      var i = document.createElement('i'); i.className = 'kv';
      i.innerHTML = '<span class="k"></span><span class="x"></span>';
      i.firstChild.textContent = k; i.lastChild.textContent = typeof kv[k] === 'number' && k === 'bytes' ? vx.group(kv[k]) : String(kv[k]);
      li.appendChild(i);
    });
    if (where) { var e = document.createElement('em'); e.textContent = where; li.appendChild(e); }
    log.appendChild(li);
    return li;
  }
  var HERE = 'this browser', THERE = 'emem.dev';
  function receipt(log, rc, needCid, needCell) {
    var v = ememVerify.verifyReceipt(rc);
    var binds = (!needCid || (rc.fact_cids || []).indexOf(needCid) >= 0) && (!needCell || (rc.cells || []).indexOf(needCell) >= 0);
    add(log, 'verify', 'receipt', { ed25519: v.ok ? 'valid' : v.state, preimage: v.ok ? 'v' + v.preimage_version : null, signer: v.ok ? short(v.signer_b32, 8) : null, binds: needCid || needCell ? (binds ? 'yes' : 'no') : null },
      v.ok && binds ? 'ok' : 'fail', HERE);
    return v.ok && binds;
  }

  /* ---------- the checks, one per shape ---------- */
  var CHECK = {
    fact: async function (tok, log) {
      var m = tok.match(/^emem:fact:([^:]+):([a-z2-7]{52})$/), cell = m[1], cid = m[2];
      var r = await json('/v1/memory_token/resolve', { token: tok });
      var f = r.json.fact || {};
      add(log, 'resolve', 'token', { bytes: r.n, band: f.band, value: f.value }, r.json.resolved ? 'ok' : 'fail', THERE);
      var c = await req('/v1/facts/' + cid, { headers: { accept: 'application/cbor' } }), h = vx.cid52(c.bytes);
      add(log, 'hash', 'canonical CBOR', { bytes: c.bytes.length, blake3: short(h), match: h === cid ? 'fact_cid' : 'NO' }, h === cid ? 'ok' : 'fail', HERE);
      var ok = h === cid && receipt(log, r.json.receipt, cid, cell);
      var src = ((vx.cborDecode(c.bytes).sources || [])[0] || {});
      if (src.captured_at) add(log, 'read', 'source', { captured: src.captured_at.slice(0, 10), scene: short(src.id, 22) }, 'ok', HERE);
      return ok;
    },
    cell: async function (tok, log, card) {
      var cell = tok.slice('emem:cell:'.length);
      var r = await json('/v1/cells/' + encodeURIComponent(cell) + '/info'), c = r.json.centre || {}, s = r.json.approx_size_m || {};
      add(log, 'locate', 'centre', { lat: (+c.lat_deg).toFixed(5), lng: (+c.lng_deg).toFixed(5), size: (+s.lat).toFixed(2) + ' × ' + (+s.lng).toFixed(2) + ' m' }, 'ok', THERE);
      var k = await json('/v1/cells/' + encodeURIComponent(cell));
      var n = (k.json.facts || []).length;
      add(log, 'count', 'facts on this address', { facts: n, why: n ? null : 'an address, not a digest: nothing to hash until a fact hangs on it' }, n ? 'ok' : 'skip', THERE);
      var img = card.querySelector('[data-scene]');
      if (img && !(navigator.connection && navigator.connection.saveData)) {
        var p = await req('/v1/cells/' + encodeURIComponent(cell) + '/scene.png');
        var url = URL.createObjectURL(new Blob([p.bytes], { type: 'image/png' }));
        img.onload = function () { URL.revokeObjectURL(url); }; img.src = url; img.hidden = false;
        add(log, 'look', 'from orbit', { scene: short(p.res.headers.get('x-emem-scene-item-id') || '', 20), date: (p.res.headers.get('x-emem-scene-datetime') || '').slice(0, 10), cloud: p.res.headers.get('x-emem-scene-cloud-cover') ? (+p.res.headers.get('x-emem-scene-cloud-cover')).toFixed(0) + '%' : null }, 'ok', THERE);
      }
      return true;
    },
    entity: async function (tok, log) {
      var cid = tok.slice('emem:entity:'.length);
      var r = await json('/v1/entity/' + cid), e = r.json.entity || {};
      add(log, 'resolve', 'identity', { bytes: r.n, kind: e.kind, label: e.label }, r.json.resolved !== false ? 'ok' : 'fail', THERE);
      var got = vx.entityCid(e);
      add(log, 'derive', 'entity_cid', { from: 'cell64|kind|label', blake3: got, match: got === cid ? 'token' : 'NO' }, got === cid ? 'ok' : 'fail', HERE);
      return got === cid && receipt(log, r.json.receipt);
    },
    bundle: async function (tok, log) {
      var r = await json('/v1/memory_bundle/' + encodeURIComponent(tok)), b = r.json, cid = tok.slice('emem:bundle:'.length);
      var bands = (b.citations || []).map(function (c) { return c.band; });
      add(log, 'resolve', 'bundle', { bytes: r.n, facts: bands.length, bands: bands.map(function (x) { return x.split('.').pop(); }).join(', ') }, 'ok', THERE);
      var got = vx.bundleCid(b.citations || [], b.purpose);
      add(log, 'derive', 'bundle_cid', { from: 'citation list', blake3: got, match: got === cid ? 'token' : 'NO' }, got === cid ? 'ok' : 'fail', HERE);
      return got === cid && receipt(log, b.receipt);
    },
    raster: async function (tok, log, card) {
      var r = await json('/v1/raster/resolve', { token: tok }), d = r.json.derivation || {}, a = r.json.artifact || {};
      var src = (d.sources || [])[0] || {};
      add(log, 'resolve', 'field', { bytes: r.n, band: r.json.band, captured: (src.captured_at || '').slice(0, 10), grid: d.artifact ? d.artifact.grid.width + '×' + d.artifact.grid.height + ' @ ' + d.artifact.grid.dx + ' m' : null }, 'ok', THERE);
      var g = await rasterBytes(a, d, log);
      if (g) draw(card.querySelector('[data-grid]'), g);
      return !!g && receipt(log, r.json.receipt);
    },
    cube: async function (tok, log, card) {
      var r = await json('/v1/cube/resolve', { token: tok }), d = r.json.derivation || {}, mem = d.members || [];
      add(log, 'resolve', 'field over time', { bytes: r.n, band: r.json.band, slices: mem.length, dates: mem.map(function (x) { return (x.captured_at || '').slice(0, 10); }).join(' → ') }, 'ok', THERE);
      var ok = receipt(log, r.json.receipt), grids = [];
      for (var i = 0; i < mem.length && i < 4; i++) {
        var mr = await json('/v1/raster/resolve', { token: mem[i].raster_token });
        var g = await rasterBytes(mr.json.artifact || {}, mr.json.derivation || {}, log, 'slice ' + (i + 1));
        ok = ok && !!g; if (g) grids.push(g);
      }
      var cv = card.querySelector('[data-grid]');
      if (grids.length === 2 && cv) drawDiff(cv, grids[0], grids[1], log);
      return ok;
    },
    rasterset: async function (tok, log) {
      var r = await json('/v1/raster_bundle/resolve', { token: tok }), s = r.json, mem = s.members || [];
      var bands = {}, dates = {};
      mem.forEach(function (x) { bands[x.band] = 1; dates[x.tslot] = 1; });
      add(log, 'resolve', 'set', { bytes: r.n, members: mem.length, bands: Object.keys(bands).map(function (b) { return b.replace('s2.', ''); }).join(' '), dates: Object.keys(dates).length }, 'ok', THERE);
      add(log, 'derive', 'bundle_cid', { from: 'member derivation cids + purpose', match: s.verified ? 'token' : 'NO' }, s.verified ? 'ok' : 'fail', THERE);
      var one = (s.rebound || [])[0] || mem[0];
      var mr = await json('/v1/raster/resolve', { token: one.token });
      add(log, 'resolve', 'one member', { band: mr.json.band, bytes: mr.n, field: vx.fmtBytes(((mr.json.derivation || {}).artifact || {}).byte_len) }, 'ok', THERE);
      return !!s.verified && receipt(log, mr.json.receipt);
    },
    trace: async function (tok, log) {
      var r = await json('/v1/trace_resolve', { token: tok }), t = r.json.trace, cid = tok.slice('emem:trace:'.length);
      add(log, 'resolve', 'execution trace', { bytes: r.n, profile: t.device.substrate_profile, platform: t.device.platform }, r.json.resolved ? 'ok' : 'fail', THERE);
      var c = vx.checkTrace(t);
      add(log, 'chain', 'segments', { layers: c.layers.join(' '), events: vx.group(c.events), links: c.chain ? 'unbroken' : 'BROKEN' }, c.chain ? 'ok' : 'fail', HERE);
      add(log, 'root', 'merkle v1', { root: short(c.root), match: c.rootOk ? 'trace_root' : 'NO' }, c.rootOk ? 'ok' : 'fail', HERE);
      add(log, 'hash', 'whole trace', { blake3: short(c.cid), match: c.cid === cid ? 'token' : 'NO' }, c.cid === cid ? 'ok' : 'fail', HERE);
      add(log, 'verify', 'device signature', { ed25519: c.sigOk ? 'valid' : 'INVALID', key: short(c.deviceKey, 8), signer: 'the device, not emem' }, c.sigOk ? 'ok' : 'fail', HERE);
      return c.chain && c.rootOk && c.cid === cid && c.sigOk;
    },
    attestation: async function (tok, log) {
      var r = await json('/v1/device_platforms'), reg = r.json.registry || {}, pl = reg.platforms || [];
      // a vendor anchor vouches for hardware; an operator anchor only for machines its operator runs
      var vend = 0, vendLive = 0, opLive = 0;
      pl.forEach(function (p) {
        (p.trust_anchors || []).forEach(function (a) {
          if (p.family === 'operator_vouched') { if (!a.provisional) opLive++; }
          else { vend++; if (!a.provisional) vendLive++; }
        });
      });
      add(log, 'list', 'hardware roots', { platforms: pl.length, families: (reg.families || []).length }, 'ok', THERE);
      add(log, 'count', 'published anchors', { vendor: vendLive + ' of ' + vend, operator: opLive }, 'ok', THERE);
      add(log, 'wait', 'a maker-attested token', { why: vendLive ? null : 'every vendor anchor is provisional and whitelists nothing yet; the live anchor is an operator\u2019s, claiming no hardware root. The first published vendor anchor mints the first manufacturer-backed emem:attestation:' }, vendLive ? 'ok' : 'skip', THERE);
      return 'claim';
    },
    state: async function (tok, log) {
      var cid = tok.slice('emem:state:'.length), n = 0, ok = true;
      while (cid && n < 6) {
        var r = await json('/v1/state/' + cid), rec = r.json;
        var b = vx.fromHex(rec.canonical_cbor_hex || ''), got = vx.cid52(b), s = vx.cborDecode(b);
        var facts = (s.derived_from || []).filter(function (x) { return x.as === 'fact'; }).length;
        add(log, n ? 'walk' : 'hash', s.kind + ' stage', { bytes: b.length, blake3: short(got), match: got === cid ? 'address' : 'NO', facts: facts || null }, got === cid ? 'ok' : 'fail', HERE);
        ok = ok && got === cid;
        var prev = (s.derived_from || []).filter(function (x) { return x.as === 'own_state'; })[0];
        cid = prev && prev.cid; n++;
      }
      return ok;
    },
    tree: async function (tok, log) {
      var m = tok.match(/^emem:tree:([a-z2-7]{26})#row=(\d+)$/), fcid = m[1], row = +m[2];
      var note = await req(EMEM + '/memories/by_attester/ddzmyzhn/' + fcid + '.md'), nc = vx.cid26(note.bytes);
      var p = vx.parsePointer(vx.dec.decode(note.bytes)), root2 = vx.merkleRoot(p.rows);
      add(log, 'hash', 'pointer note', { bytes: note.bytes.length, cid: nc, match: nc === fcid ? 'token' : 'NO' }, nc === fcid ? 'ok' : 'fail', HERE);
      add(log, 'root', 'every row', { rows: p.rows.length, root: short(root2), match: root2 === p.fm.root ? 'note root' : 'NO' }, root2 === p.fm.root ? 'ok' : 'fail', HERE);
      var t = await json('/v1/tree/' + fcid + '?row=' + row), leaf = vx.b32(vx.treeLeaf(p.rows[row]));
      var walked = vx.treeWalk(vx.unb32(leaf), t.json.path || []);
      add(log, 'walk', 'row ' + row + ' to root', { hashes: (t.json.path || []).length, of: p.rows.length + ' rows', match: walked === p.fm.root && leaf === t.json.leaf_b32 ? 'root' : 'NO' }, walked === p.fm.root ? 'ok' : 'fail', HERE);
      var rw = p.rows[row];
      add(log, 'point', 'the chunk', { source: vx.hostOf(p.fm.source), offset: vx.group(rw.offset), length: vx.group(rw.length), file: vx.fmtBytes(+p.fm.bytes) }, 'ok', HERE);
      return nc === fcid && root2 === p.fm.root && walked === p.fm.root;
    }
  };

  // a raster's bytes: hash to artifact_cid, decode EMEMGRD1, check the record's anchor pixels
  async function rasterBytes(a, d, log, label) {
    if (!a.url) { add(log, 'fetch', 'field', { why: 'artifact evicted; the record pins its rebuild' }, 'skip', THERE); return null; }
    var b = await req(a.url), h = vx.cid52(b.bytes);
    var g = null, anchorsOk = 0, anchors = d.anchors || [];
    try { g = vx.gridDecode(b.bytes); anchors.forEach(function (x) { if (g.data[x.row * g.w + x.col] === x.value) anchorsOk++; }); } catch (e) {}
    var ok = h === a.artifact_cid && g && anchorsOk === anchors.length;
    add(log, 'hash', label || 'field bytes', { bytes: b.bytes.length, match: h === a.artifact_cid ? 'artifact_cid' : 'NO', anchors: anchorsOk + '/' + anchors.length + ' px' }, ok ? 'ok' : 'fail', HERE);
    return ok ? g : null;
  }
  function stretch(g) {
    var v = Array.prototype.filter.call(g.data, function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
    return [v[Math.floor(v.length * 0.02)], v[Math.floor(v.length * 0.98)]];
  }
  function draw(cv, g) {
    if (!cv) return;
    var lo = stretch(g), ctx = cv.getContext('2d'), img = ctx.createImageData(g.w, g.h);
    cv.width = g.w; cv.height = g.h;
    for (var i = 0; i < g.w * g.h; i++) {
      var x = g.data[i], k = isFinite(x) ? Math.max(0, Math.min(255, 255 * (x - lo[0]) / (lo[1] - lo[0]))) : 0;
      img.data[i * 4] = k * 0.86; img.data[i * 4 + 1] = k * 0.93; img.data[i * 4 + 2] = k; img.data[i * 4 + 3] = isFinite(x) ? 255 : 0;
    }
    ctx.putImageData(img, 0, 0); cv.hidden = false;
  }
  // the change between two verified slices: blue where reflectance fell, amber where it rose
  function drawDiff(cv, a, b, log) {
    if (a.w !== b.w || a.h !== b.h) return;
    var d = new Float32Array(a.w * a.h), m = 0, s = 0, n = 0;
    for (var i = 0; i < d.length; i++) { d[i] = b.data[i] - a.data[i]; if (isFinite(d[i])) { m = Math.max(m, Math.abs(d[i])); s += d[i]; n++; } }
    var ctx = cv.getContext('2d'), img = ctx.createImageData(a.w, a.h);
    cv.width = a.w; cv.height = a.h;
    for (var j = 0; j < d.length; j++) {
      var t = m ? d[j] / m : 0, o = j * 4;
      img.data[o] = t > 0 ? 60 + 195 * t : 30; img.data[o + 1] = 40 + 90 * Math.abs(t); img.data[o + 2] = t < 0 ? 60 - 195 * t : 30; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); cv.hidden = false;
    add(log, 'diff', 'slice 2 − slice 1', { pixels: vx.group(n), mean: (s / n).toFixed(1) + ' DN', max: m.toFixed(0) + ' DN' }, 'ok', HERE);
  }

  /* ---------- run the cards in order, as they come into view ---------- */
  var queue = Promise.resolve();
  function run(card) {
    if (card.getAttribute('data-state')) return;
    card.setAttribute('data-state', 'run');
    var kind = card.getAttribute('data-kind'), tok = card.getAttribute('data-token'), log = card.querySelector('.vlog');
    if (kind === 'fact' && window.vxLastToken) { tok = window.vxLastToken; var tc = card.querySelector('.tk-tok'); if (tc) tc.textContent = tok; }
    queue = queue.then(async function () {
      log.innerHTML = '';
      var t0 = performance.now(), res;
      try { res = await CHECK[kind](tok, log, card); } catch (e) { add(log, 'stop', kind, { why: String(e.message || e) }, 'fail'); res = false; }
      card.setAttribute('data-state', res === 'claim' ? 'claim' : res ? 'ok' : 'fail');
      var mark = card.querySelector('[data-mark]');
      if (mark) mark.textContent = res === 'claim' ? 'waiting' : res ? 'checked · ' + Math.round(performance.now() - t0) + ' ms' : 'failed';
    });
  }
  var cards = root.querySelectorAll('[data-kind][data-token]');
  cards.forEach(function (c) {
    var b = c.querySelector('[data-recheck]');
    if (b) b.addEventListener('click', function () { c.removeAttribute('data-state'); run(c); });
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }); }, { rootMargin: '0px 0px 120px 0px' });
    cards.forEach(function (c) { io.observe(c); });
  } else cards.forEach(run);
  // the handoff above mints a fresh fact token; the fact card re-checks that one when it arrives
  document.addEventListener('vx:token', function (e) {
    var c = root.querySelector('[data-kind="fact"]');
    if (!c || !e.detail || !e.detail.token) return;
    c.setAttribute('data-token', e.detail.token);
    var tc = c.querySelector('.tk-tok'); if (tc) tc.textContent = e.detail.token;
    if (c.getAttribute('data-state')) { c.removeAttribute('data-state'); run(c); }
  });
})();
