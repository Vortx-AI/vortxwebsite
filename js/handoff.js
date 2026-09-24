/* handoff.js: agent A, the wire, and what agent B sends back.
 *
 * Agent A (this tab) recalls a signed NDVI fact at a place and mints its
 * token. The only thing that crosses to agent B (js/receiver.js, a Web
 * Worker) is that token string: postMessage(token). Everything B reports it
 * fetched or computed itself. This file draws: the two verb logs, the wire,
 * the decoded tile, the 10 m pixel, the capture geometry, the byte ledger.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('handoff');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev';
  var $ = function (s) { return root.querySelector(s); };
  var logA = $('[data-log="a"]'), logB = $('[data-log="b"]'), wire = $('[data-wire]'), packet = $('[data-packet]');
  var goBtn = $('[data-handoff]'), tileCv = $('[data-tile]'), zoomCv = $('[data-zoom]'), capFig = $('[data-capture]'), ledgerEl = $('[data-ledger]');
  var status = $('[data-status]');
  var state = { place: null, token: null, fact: null, running: false, worker: null, tiles: {}, t0: 0 };
  var saveData = navigator.connection && navigator.connection.saveData;

  /* ---------- verb log ---------- */
  var SHOW = { // which keys each verb prints, in order: verbs first, values after
    recall: ['band', 'cell', 'facts', 'bytes'], pick: ['captured_at', 'scene', 'value'], mint: ['token', 'bytes'], send: ['bytes', 'to'],
    locate: ['place', 'cell'], receive: ['bytes'], parse: ['cell', 'fact_cid'], resolve: ['bytes', 'primitive'],
    hash: ['bytes', 'blake3', 'match'], verify: ['ed25519', 'preimage', 'signer', 'same_as_fact_signer'],
    project: ['epsg', 'easting_m', 'northing_m'], read: ['bytes', 'file_bytes', 'px', 'tile', 'host'],
    decode: ['bytes', 'inflated', 'pixel', 'dn', 'signed_dn'], recompute: ['formula', 'value', 'signed', 'bits'],
    check: ['satellite', 'alt_km', 'v_kms', 'cross_track_km', 'closest_approach_s', 'off_nadir_deg', 'sun_el_deg', 'swath', 'elements', 'gap_days'],
    stop: ['why'], compare: ['why'], bind: ['why']
  };
  function fmt(k, v) {
    if (typeof v === 'number' && (k === 'bytes' || k === 'file_bytes' || k === 'inflated')) return vx.group(v);
    return String(v);
  }
  function line(log, m) {
    var li = document.createElement('li');
    li.className = 'is-' + m.state;
    var b = document.createElement('b'); b.className = 'v'; b.textContent = m.verb; li.appendChild(b);
    var n = document.createElement('span'); n.className = 'n'; n.textContent = m.noun; li.appendChild(n);
    var keys = SHOW[m.verb] || Object.keys(m.kv);
    keys.forEach(function (k) {
      if (m.kv[k] === undefined || m.kv[k] === null || m.kv[k] === '') return;
      var i = document.createElement('i'); i.className = 'kv';
      var kk = document.createElement('span'); kk.className = 'k'; kk.textContent = k;
      var vv = document.createElement('span'); vv.className = 'x'; vv.textContent = fmt(k, m.kv[k]);
      i.appendChild(kk); i.appendChild(vv); li.appendChild(i);
    });
    if (m.kv.why && keys.indexOf('why') < 0) { var w = document.createElement('i'); w.className = 'why'; w.textContent = m.kv.why; li.appendChild(w); }
    if (typeof m.t === 'number') { var t = document.createElement('em'); t.textContent = m.t + ' ms'; li.appendChild(t); }
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }
  function clear(log) { while (log.firstChild) log.removeChild(log.firstChild); }
  function setStatus(txt, cls) { if (status) { status.textContent = txt; status.className = 'ho-status ' + (cls || ''); } }

  /* ---------- agent A ---------- */
  async function post(url, body) {
    var r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var txt = await r.text();
    if (!r.ok) throw new Error(new URL(url).host + ' answered ' + r.status);
    return { json: JSON.parse(txt), bytes: new TextEncoder().encode(txt).length };
  }
  async function prepare(place) {
    state.place = place; state.token = null; state.fact = null;
    clear(logA); clear(logB); resetGround();
    goBtn.disabled = true; wire.classList.remove('is-sent', 'is-flying');
    packet.textContent = '';
    document.dispatchEvent(new CustomEvent('vx:place', { detail: { name: place.name, lat: place.lat, lng: place.lng } }));
    var t0 = performance.now(), ms = function () { return Math.round(performance.now() - t0); };
    try {
      if (!place.cell) {
        var loc = await post(EMEM + '/v1/locate', { place: place.name });
        place.cell = loc.json.cell;
        if (loc.json.centre) { place.lat = +loc.json.centre.lat || place.lat; place.lng = +(loc.json.centre.lng || loc.json.centre.lon) || place.lng; }
        line(logA, { verb: 'locate', noun: 'place', kv: { place: loc.json.place_label || place.name, cell: place.cell }, state: 'ok', t: ms() });
        document.dispatchEvent(new CustomEvent('vx:place', { detail: { name: place.name, lat: place.lat, lng: place.lng } }));
      }
      setStatus('agent A is recalling a signed fact at ' + place.name + '…');
      var rc = await post(EMEM + '/v1/recall', { cell: place.cell, bands: ['indices.ndvi'] });
      var facts = (rc.json.facts || []).filter(function (f) { return f.band === 'indices.ndvi' && typeof f.value === 'number' && f.fact_cid; });
      line(logA, { verb: 'recall', noun: 'signed facts', kv: { band: 'indices.ndvi', cell: place.cell, facts: facts.length, bytes: rc.bytes }, state: facts.length ? 'ok' : 'fail', t: ms() });
      if (!facts.length) { setStatus('no NDVI fact at this cell yet: emem found no clear Sentinel-2 pixel here', 'is-fail'); return; }
      var cap = function (f) { return ((f.sources || [])[0] || {}).captured_at || ''; };
      facts.sort(function (x, y) { return cap(y) < cap(x) ? -1 : cap(y) > cap(x) ? 1 : 0; });
      var f = facts[0], args = (f.derivation || {}).args || [];
      line(logA, { verb: 'pick', noun: 'newest', kv: { captured_at: cap(f), scene: args[2], value: f.value }, state: 'ok', t: ms() });
      var token = 'emem:fact:' + place.cell + ':' + f.fact_cid;
      state.token = token; state.fact = f;
      line(logA, { verb: 'mint', noun: 'token', kv: { token: token, bytes: new TextEncoder().encode(token).length }, state: 'ok', t: ms() });
      packet.textContent = token;
      goBtn.disabled = false;
      setStatus('ready: agent A holds the fact; agent B holds nothing yet');
    } catch (e) {
      line(logA, { verb: 'stop', noun: 'recall', kv: { why: String(e.message || e) }, state: 'fail', t: ms() });
      setStatus('emem did not answer: ' + (e.message || e), 'is-fail');
    }
  }

  /* ---------- the wire ---------- */
  function send() {
    if (!state.token || state.running) return;
    state.running = true; goBtn.disabled = true; state.tiles = {};
    clear(logB); resetGround();
    if (state.worker) state.worker.terminate();
    var w;
    try { w = new Worker('/js/receiver.js'); } catch (e) { setStatus('this browser cannot start a Web Worker', 'is-fail'); state.running = false; return; }
    state.worker = w;
    var bytes = new TextEncoder().encode(state.token).length;
    line(logA, { verb: 'send', noun: 'token', kv: { bytes: bytes, to: 'agent B (Web Worker, separate thread and memory)' }, state: 'ok' });
    wire.classList.remove('is-sent'); void wire.offsetWidth; wire.classList.add('is-flying');
    setStatus('on the wire: ' + bytes + ' bytes, the token and nothing else');
    w.onmessage = onB;
    w.onerror = function (e) { line(logB, { verb: 'stop', noun: 'worker', kv: { why: e.message || 'worker error' }, state: 'fail' }); finish(false); };
    w.postMessage(state.token);   // the whole handoff
    setTimeout(function () { wire.classList.remove('is-flying'); wire.classList.add('is-sent'); }, 900);
  }
  function onB(e) {
    var m = e.data;
    if (m.type === 'step') { line(logB, m); if (m.state === 'fail') setStatus(m.verb + ' ' + m.noun + ' failed: ' + (m.kv.why || ''), 'is-fail'); }
    else if (m.type === 'fact') { state.bfact = m.fact; }
    else if (m.type === 'progress') { setStatus('agent B is reading ' + m.band + ' from the archive: ' + vx.fmtBytes(m.got) + ' of ' + vx.fmtBytes(m.of)); }
    else if (m.type === 'tile') { state.tiles[m.band] = m; drawTile(); }
    else if (m.type === 'done') finish(m.ok, m);
  }
  function finish(ok, m) {
    state.running = false; goBtn.disabled = !state.token;
    if (state.worker) { state.worker.terminate(); state.worker = null; }
    if (!m) return;
    var x = m.extra || {};
    if (ok && x.exact) setStatus('agent B rebuilt the signed number from raw satellite bytes: ' + x.ndvi + ', bit for bit', 'is-ok');
    else if (ok) setStatus('agent B verified the token; this fact is not re-derived here', 'is-ok');
    drawLedger(m);
    if (x.capture) drawCapture(x.capture);
    root.classList.add('is-done');
  }

  /* ---------- ground: the decoded tile and the 10 m pixel ---------- */
  var STOPS = [[-1, [22, 38, 84]], [-0.1, [52, 88, 140]], [0, [128, 116, 96]], [0.15, [176, 156, 102]], [0.3, [196, 190, 98]], [0.45, [140, 186, 76]], [0.6, [76, 154, 58]], [0.75, [34, 118, 44]], [1, [10, 76, 28]]];
  var LUT = (function () {
    var lut = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var v = -1 + 2 * i / 255, j = 0;
      while (j < STOPS.length - 2 && v > STOPS[j + 1][0]) j++;
      var a = STOPS[j], b = STOPS[j + 1], t = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0])));
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * t;
    }
    return lut;
  })();
  function resetGround() {
    [tileCv, zoomCv].forEach(function (c) { if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); });
    if (capFig) capFig.innerHTML = '';
    if (ledgerEl) ledgerEl.innerHTML = '';
    root.classList.remove('is-done', 'has-tile');
    var cap = $('[data-tile-cap]'); if (cap) cap.textContent = '';
  }
  function drawTile() {
    var nir = state.tiles.B08, red = state.tiles.B04;
    if (!nir || !tileCv) return;
    var w = nir.w, h = nir.h, a = new Uint16Array(nir.data), b = red ? new Uint16Array(red.data) : null;
    var ctx = tileCv.getContext('2d'), img = ctx.createImageData(w, h), px = img.data;
    tileCv.width = w; tileCv.height = h;
    for (var i = 0, o = 0; i < w * h; i++, o += 4) {
      var n = a[i];
      if (!n) { px[o + 3] = 0; continue; }
      if (b) {
        var r = b[i], v = (n - r) / (n + r), k = Math.max(0, Math.min(255, Math.round((v + 1) * 127.5))) * 3;
        px[o] = LUT[k]; px[o + 1] = LUT[k + 1]; px[o + 2] = LUT[k + 2];
      } else { var g = Math.min(255, n / 22); px[o] = px[o + 1] = px[o + 2] = g; }
      px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var x = nir.x, y = nir.y;
    // 31 x 31 pixels around the cell, nearest-neighbour, copied before any marker is drawn on the tile
    if (zoomCv) {
      var z = zoomCv.getContext('2d'), R = 15, S = zoomCv.width / (2 * R + 1);
      z.imageSmoothingEnabled = false; z.clearRect(0, 0, zoomCv.width, zoomCv.height);
      z.drawImage(tileCv, x - R, y - R, 2 * R + 1, 2 * R + 1, 0, 0, zoomCv.width, zoomCv.height);
      z.strokeStyle = 'rgba(0,0,0,.22)'; z.lineWidth = 1;
      for (var g2 = 0; g2 <= 2 * R + 1; g2++) { z.beginPath(); z.moveTo(g2 * S, 0); z.lineTo(g2 * S, zoomCv.height); z.moveTo(0, g2 * S); z.lineTo(zoomCv.width, g2 * S); z.stroke(); }
      z.strokeStyle = '#fff'; z.lineWidth = 2; z.strokeRect(R * S + 1, R * S + 1, S - 2, S - 2);
    }
    // then mark the pixel the fact names
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 60, y); ctx.lineTo(x - 18, y); ctx.moveTo(x + 18, y); ctx.lineTo(x + 60, y);
    ctx.moveTo(x, y - 60); ctx.lineTo(x, y - 18); ctx.moveTo(x, y + 18); ctx.lineTo(x, y + 60); ctx.stroke();
    ctx.strokeRect(x - 16, y - 16, 32, 32);
    root.classList.add('has-tile');
    var cap = $('[data-tile-cap]');
    if (cap) {
      var dn = a[y * w + x], dr = b ? b[y * w + x] : null;
      cap.textContent = (b ? 'NDVI from the two decoded tiles' : 'B08 near-infrared, decoded') + ' · tile ' + w + '×' + h + ' px = ' + (w * 10 / 1000).toFixed(2) + ' km · pixel (' + x + ',' + y + ') in tile · B08 ' + dn + (dr !== null ? ' · B04 ' + dr : '') + ' · 1 px = 10 m';
    }
  }

  /* ---------- capture geometry: a true-scale cross-section ---------- */
  function drawCapture(c) {
    if (!capFig) return;
    if (c.skipped) {
      capFig.innerHTML = '<p class="ho-skip"><b class="v">skip</b> orbit check · ' + c.satellite + ' elements are ' + Math.abs(c.gap_days).toFixed(0) + ' d from this capture; SGP4 error at that range can exceed the half-swath, so no geometry is drawn.</p>';
      return;
    }
    var W = 600, H = 860, cx = W / 2, km = 1, alt = c.alt_km, y0 = H - 40;
    function X(k) { return cx + k * km; }
    function Y(a) { return y0 - a * km; }
    var R = 6371, pts = [];
    for (var k = -300; k <= 300; k += 10) pts.push(X(k) + ',' + (y0 + (k * k) / (2 * R)).toFixed(2));
    var sw = c.half_swath_km, ok = c.inside;
    capFig.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cross-section at capture: satellite ' + alt + ' km up, cell ' + c.cross_km + ' km cross-track">' +
      '<polyline points="' + pts.join(' ') + '" class="cg-ground"/>' +
      '<polygon points="' + X(0) + ',' + Y(alt) + ' ' + X(-sw) + ',' + y0 + ' ' + X(sw) + ',' + y0 + '" class="cg-swath"/>' +
      '<line x1="' + X(0) + '" y1="' + Y(alt) + '" x2="' + X(0) + '" y2="' + y0 + '" class="cg-nadir"/>' +
      '<line x1="' + X(0) + '" y1="' + Y(alt) + '" x2="' + X(c.cross_km) + '" y2="' + y0 + '" class="cg-look ' + (ok ? 'is-ok' : 'is-fail') + '"/>' +
      '<circle cx="' + X(0) + '" cy="' + Y(alt) + '" r="7" class="cg-sat"/>' +
      '<circle cx="' + X(c.cross_km) + '" cy="' + y0 + '" r="6" class="cg-cell"/>' +
      '<text x="' + (X(0) + 14) + '" y="' + (Y(alt) + 4) + '">' + c.satellite.replace('SENTINEL-', 'S') + ' · ' + alt + ' km</text>' +
      '<text x="' + (X(0) + 10) + '" y="' + (Y(alt / 2)) + '">nadir</text>' +
      '<text x="' + X(c.cross_km) + '" y="' + (y0 + 26) + '" text-anchor="middle">cell · ' + c.cross_km + ' km</text>' +
      '<text x="' + X(-sw) + '" y="' + (y0 - 10) + '" text-anchor="middle">−' + sw + '</text>' +
      '<text x="' + X(sw) + '" y="' + (y0 - 10) + '" text-anchor="middle">+' + sw + ' km</text>' +
      '</svg>' +
      '<ul class="cg-kv">' +
      '<li><b class="v">fly</b> ' + c.satellite + ' <i>alt ' + alt + ' km</i> <i>v ' + c.v_kms + ' km/s</i></li>' +
      '<li><b class="v">pass</b> closest approach <i>' + (c.closest_s >= 0 ? '+' : '') + c.closest_s + ' s</i> from captured_at</li>' +
      '<li><b class="v">look</b> off-nadir <i>' + c.off_nadir_deg + '°</i> cross-track <i>' + c.cross_km + ' km</i> of ±' + sw + '</li>' +
      '<li><b class="v">light</b> sun <i>' + c.sun_el_deg + '°</i> above the cell</li>' +
      '<li><b class="v">load</b> elements <i>' + c.elements_from + '</i> epoch <i>' + c.elements_epoch + '</i> <i>' + Math.abs(c.gap_days) + ' d</i> from capture</li>' +
      '</ul>';
  }

  /* ---------- ledger: what moved, on a log scale ---------- */
  function drawLedger(m) {
    if (!ledgerEl) return;
    var x = m.extra || {}, hosts = m.ledger || {}, src = x.source_bytes || 0;
    var archive = Object.keys(hosts).filter(function (h) { return /sentinel-cogs|amazonaws/.test(h); }).reduce(function (s, h) { return s + hosts[h]; }, 0);
    var rows = [
      ['files', 'at the archive (B08 + B04)', src],
      ['read', 'by agent B, from the archive', archive],
      ['read', 'by agent B, from emem.dev', hosts['emem.dev'] || 0],
      ['read', 'by agent B, orbital elements', (hosts['celestrak.org'] || 0) + (hosts[location.host] || 0)],
      ['send', 'agent A → agent B', x.wire || (state.token ? new TextEncoder().encode(state.token).length : 0)]
    ].filter(function (r) { return r[2] > 0; });
    var max = Math.log10(Math.max.apply(null, rows.map(function (r) { return r[2]; })));
    ledgerEl.innerHTML = rows.map(function (r) {
      var w = Math.max(1.5, 100 * Math.log10(Math.max(1, r[2])) / max), pct = src ? (100 * r[2] / src) : 0;
      return '<div class="lg-row"><b class="v">' + r[0] + '</b><span class="lg-n">' + r[1] + '</span><span class="lg-bar"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="lg-x">' + vx.group(r[2]) + ' B' + (src && r[0] !== 'files' ? ' · ' + (pct < 0.01 ? pct.toExponential(1) : pct.toFixed(2)) + '%' : '') + '</span></div>';
    }).join('') + '<p class="lg-foot">bar length is log<sub>10</sub>(bytes). ' + (src ? 'Agent B read ' + (100 * archive / src).toFixed(2) + '% of the files, from their source; zero bytes of imagery passed between the agents.' : '') + '</p>';
  }

  /* ---------- controls ---------- */
  root.querySelectorAll('[data-place]').forEach(function (b) {
    b.addEventListener('click', function () {
      root.querySelectorAll('[data-place]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      prepare({ name: b.getAttribute('data-place'), cell: b.getAttribute('data-cell'), lat: +b.getAttribute('data-lat'), lng: +b.getAttribute('data-lng') });
    });
  });
  var form = $('[data-locate]');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = (form.querySelector('input').value || '').trim();
    if (!q) return;
    root.querySelectorAll('[data-place]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    prepare({ name: q, cell: null, lat: 0, lng: 0 });
  });
  goBtn.addEventListener('click', send);

  // start with the first place; hand off once the section is on screen (not on Save-Data)
  var first = root.querySelector('[data-place][aria-pressed="true"]') || root.querySelector('[data-place]');
  var booted = false;
  function boot() {
    if (booted) return; booted = true;
    if (!first) return;
    prepare({ name: first.getAttribute('data-place'), cell: first.getAttribute('data-cell'), lat: +first.getAttribute('data-lat'), lng: +first.getAttribute('data-lng') }).then(function () {
      if (!saveData && state.token && root.getAttribute('data-autorun') !== 'off') send();
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); boot(); } }, { rootMargin: '0px 0px -25% 0px' });
    io.observe(root);
  } else boot();
})();
