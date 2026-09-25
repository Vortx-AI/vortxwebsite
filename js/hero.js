/* hero.js: the Earth, and what it remembers, around it.
 *
 *   pins     every Earth observation in the live ememdemo catalogue, at its own at=lat,lng; a pin opens
 *            its sample here, in the popup (js/pop.js), where it runs end to end
 *   cards    featured memories, each tethered to its pin; Hubble's image to Hubble, where it is now; each
 *            opens in the popup too, and a middle-click still opens the note itself
 *   planets  Mars (distance, light time) and the Moon (distance, phase) from vx.eph, recomputed now
 *   decode   @emem decodes one live token: recall, mint, resolve, hash the CBOR, verify the receipt,
 *            all in this browser; then the token's path from its place to @emem is drawn once
 *   live     the satellites on the globe, their altitudes, and where their elements came from
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('hero');
  if (!root || !window.vx) return;
  var stage = root.querySelector('.h3o-stage'), svg = root.querySelector('.h3o-links'), pinsEl = root.querySelector('.h3o-pins');
  var EMEM = 'https://emem.dev', NOTE = function (cid) { return EMEM + '/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- the catalogue, shared with the archive below ---------- */
  function parse(txt) {
    var out = [], sec = null, on = false;
    txt.split('\n').forEach(function (l) {
      if (/^signer /.test(l)) { on = true; return; }
      if (!on) return;
      if (/^# /.test(l)) { sec = l.slice(2).trim(); return; }
      var p = l.trim().split(/\s+/);
      if (p.length < 3 || !/^[a-z2-7]{26}$/.test(p[2])) return;
      var kv = {}; p.slice(3).forEach(function (x) { var i = x.indexOf('='); if (i > 0) kv[x.slice(0, i)] = x.slice(i + 1); });
      var at = (kv.at || '').split(',').map(Number);
      out.push({ sec: sec, line: l.trim(), verb: p[0], kind: p[1], cid: p[2], kv: kv, title: (kv.t || '').replace(/_/g, ' ').replace(/,(?=\S)/g, ', '), at: at.length === 2 && at.every(isFinite) ? at : null });
    });
    return out;
  }
  window.vxCatalog = window.vxCatalog || fetch('https://vortx-ai.github.io/ememdemo/llms.txt').then(function (r) { return r.text(); }).then(parse);

  /* ---------- pins and tethers ---------- */
  var pins = [], cards = [].slice.call(root.querySelectorAll('.hc[data-cid], .hc[data-sat], .hd-card[data-cid]'));
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  // a pin or a card opens its sample here, in the popup (js/pop.js); the note itself stays one click further
  function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function openHere(x, list, from) {
    if (!window.vxPop) { window.open(NOTE(x.cid), '_blank', 'noopener'); return; }
    window.vxPop.open(x, list && list.indexOf(x) >= 0 ? list : null, from ? { from: centre(from) } : null);
  }
  // the Earth turns to the place first, a column of light leaves it, and the sample unfolds from there
  function openFromPlace(x, list, fallback) {
    var pin = pins.filter(function (p) { return p.item === x; })[0], O = window.vxOrbit;
    if (reduce || !x.at || !pin || !O || !O.focus || !window.vxPop || getComputedStyle(pinsEl).display === 'none') { openHere(x, list, pin && !pin.el.classList.contains('is-far') ? pin.el : fallback); return; }
    stage.classList.add('is-focus'); pin.el.classList.add('is-picked');
    O.focus(x.at[0], x.at[1], 700, function () {
      rise(x);
      setTimeout(function () { openHere(x, list, pin.el); }, 260);
    });
  }
  function rise(x) {
    var s = onStage(window.vxOrbit.screen(x.at[0], x.at[1])); if (!s || !s.front) return;
    var d = document.createElement('i'); d.className = 'h3o-rise'; d.setAttribute('aria-hidden', 'true');
    d.style.left = s.x + 'px'; d.style.top = s.y + 'px'; stage.appendChild(d);
    setTimeout(function () { d.remove(); }, 1400);
  }
  document.addEventListener('vx:pop', function (e) {
    if (e.detail && e.detail.open) return;
    pins.forEach(function (p) { p.el.classList.remove('is-picked'); });
    if (stage.classList.contains('is-focus')) { stage.classList.remove('is-focus'); if (window.vxOrbit && window.vxOrbit.release) window.vxOrbit.release(800); }
  });
  var east = [];
  window.vxCatalog.then(function (items) {
    // the popup's arrows travel west to east, around the globe
    var placed = items.filter(function (x) { return x.at; });
    east = placed.slice().sort(function (a, b) { return a.at[1] - b.at[1]; });
    placed.forEach(function (x, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'h3o-pin is-far' + (reduce ? '' : ' is-landing');
      b.setAttribute('aria-label', x.title + ', open it');
      b.innerHTML = '<span></span><i class="h3o-beam" aria-hidden="true"></i>'; b.firstChild.textContent = x.title;
      b.style.setProperty('--d', (0.25 + i * 0.09).toFixed(2) + 's');
      b.addEventListener('click', function () { openFromPlace(x, east); });
      pinsEl.appendChild(b);
      pins.push({ item: x, el: b });
    });
    // each memory lands where it was observed, one after another; then the pins settle
    setTimeout(function () { pins.forEach(function (p) { p.el.classList.remove('is-landing'); }); }, 900 + placed.length * 90 + 1200);
    cards.forEach(function (c) {
      var cid = c.getAttribute('data-cid'); if (!cid) return;
      var x = items.filter(function (i) { return i.cid === cid; })[0];
      if (!x) return;
      c.vxItem = x;
      if (c.tagName === 'A') {
        if (!c.getAttribute('href')) c.setAttribute('href', NOTE(cid));
        c.addEventListener('click', function (e) { if (window.vxPop && window.vxPop.plain(e)) { e.preventDefault(); if (x.at) openFromPlace(x, east, c); else openHere(x, null, c); } });
      }
      var meta = c.querySelector('[data-meta]');
      if (meta) {
        // the ememdemo token line, from the catalogue's own fields
        var parts = [], tk = num(x.kv.tok), rw = num(x.kv.raw);
        if (x.kv.size) parts.push(x.kv.size.replace(/(\d)([A-Z])/, '$1 $2'));
        else if (x.kv.years) parts.push(x.kv.years.replace('-', '–'));
        if (tk) parts.push('agent reads <b>' + x.kv.tok + ' tokens</b>');
        if (tk && rw) parts.push(Math.round(rw / tk).toLocaleString('en-US') + '× less');
        meta.innerHTML = parts.join(' · ');
      }
      checkNote(c, cid);
    });
    tick();
  }).catch(function () {});

  function num(v) { var m = String(v || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  // each card re-checks its note as the page loads: base32(blake3(bytes)[0:16]) must equal its name
  function checkNote(c, cid) {
    var body = c.querySelector('.hc-body'); if (!body) return;
    var b = document.createElement('i'); b.className = 'hc-ck'; b.textContent = 'checking'; body.appendChild(b);
    vx.getBytes(NOTE(cid)).then(function (r) {
      var ok = vx.cid26(r.bytes) === cid;
      b.textContent = ok ? '✓ note' : '✗ name lies'; b.className = 'hc-ck ' + (ok ? 'is-ok' : 'is-bad');
      b.title = ok ? 'this note hashes to its name, checked in your browser' : 'the bytes do not hash to the name';
    }).catch(function () { b.textContent = 'unreachable'; b.title = 'not checked: emem.dev could not be reached, which is not a failed check'; });
  }
  function nearestOnRect(r, p) {
    var x = Math.max(r.left, Math.min(p.x, r.right)), y = Math.max(r.top, Math.min(p.y, r.bottom));
    if (x > r.left && x < r.right && y > r.top && y < r.bottom) {
      var d = [p.x - r.left, r.right - p.x, p.y - r.top, r.bottom - p.y], m = Math.min.apply(null, d);
      if (m === d[0]) x = r.left; else if (m === d[1]) x = r.right; else if (m === d[2]) y = r.top; else y = r.bottom;
    }
    return { x: x, y: y };
  }
  // the globe's own coordinates, moved onto the stage: on a phone the globe sits below the headline
  var globe = document.getElementById('orbit'), off = { x: 0, y: 0 };
  function onStage(s) { return s && { x: s.x + off.x, y: s.y + off.y, front: s.front }; }
  function tick() {
    if (!window.vxOrbit || !svg) return;
    var box = stage.getBoundingClientRect();
    if (!box.width) return;
    var gb = globe ? globe.getBoundingClientRect() : box;
    off = { x: gb.left - box.left, y: gb.top - box.top };
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    pins.forEach(function (p) {
      var s = onStage(window.vxOrbit.screen(p.item.at[0], p.item.at[1]));
      var far = !s || !s.front;
      p.el.classList.toggle('is-far', far);
      if (s) { p.el.style.left = s.x + 'px'; p.el.style.top = s.y + 'px'; p.el.classList.toggle('is-l', s.x > box.width / 2); }
      p.s = far ? null : s;
    });
    if (getComputedStyle(svg).display === 'none') return;
    var inSky = stage.classList.contains('is-sky');
    cards.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (!r.width) return; // hidden at this width: no card, no tether
      if (inSky && !c.hasAttribute('data-sky')) return; // the Earth has turned away from where these point
      var target = null, isSat = false;
      if (c.vxItem && c.vxItem.at) { var s = onStage(window.vxOrbit.screen(c.vxItem.at[0], c.vxItem.at[1])); if (s && s.front) target = s; }
      var sat = c.getAttribute('data-sat');
      if (sat) { target = onStage(window.vxOrbit.sat(sat)); isSat = true; var w = c.querySelector('[data-where]'); if (w) w.textContent = target ? 'there it is now, in orbit' : 'on the far side of the Earth right now'; }
      c.classList.toggle('is-far', !target && !!c.vxItem && !!c.vxItem.at);
      if (!target) return;
      var rr = { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
      var a = nearestOnRect(rr, target), mx = (a.x + target.x) / 2, my = (a.y + target.y) / 2 - 24;
      svg.appendChild(el('path', { d: 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + target.x.toFixed(1) + ' ' + target.y.toFixed(1), 'class': isSat ? 'is-sat' : '' }));
      svg.appendChild(el('circle', { cx: target.x.toFixed(1), cy: target.y.toFixed(1), r: isSat ? 8 : 5 }));
    });
    if (skyKey && skyEl) drawSky(box); else if (obj.style.opacity !== '0') obj.style.opacity = 0;
    if (flight) drawFlight();
  }

  /* ---------- the sky: each space card knows where its object truly is, now ---------- */
  var SKY = {
    M51: { ra: 202.4696, dec: 47.1953, name: 'M51, the Whirlpool', far: '31 million light-years' },
    NGC3324: { ra: 159.3333, dec: -58.6167, name: 'NGC 3324, Carina', far: '7,600 light-years' },
    mars: { mars: true, name: 'Mars' },
    moon: { moon: true, name: 'the Moon' }
  };
  var skyKey = null, skyEl = null, skyT = 0, skyAt = 0, LOCK = reduce ? 0 : 700;
  // the card's own picture rides inside the reticle, at the object's true place (the position is true; the size is not)
  var obj = document.createElement('i'); obj.className = 'h3o-obj'; obj.setAttribute('aria-hidden', 'true'); stage.appendChild(obj);
  function farOf(k) {
    if (k === 'mars') return (vx.eph.marsKm(Date.now()) / 1e6).toFixed(1) + ' million km';
    if (k === 'moon') return vx.group(Math.round(vx.eph.moonKm(Date.now()))) + ' km';
    return SKY[k].far;
  }
  function dress(node, k) {
    obj.className = 'h3o-obj' + (k === 'mars' ? ' is-mars' : ''); obj.style.backgroundImage = ''; obj.innerHTML = '';
    if (k === 'moon') {
      var cv = document.createElement('canvas'); obj.appendChild(cv);
      var ph = vx.eph.moonPhase(Date.now()); requestAnimationFrame(function () { drawMoon(cv, ph.lit, ph.waxing); });
    } else if (k !== 'mars') { var im = node.querySelector('.hc-img'); if (im) obj.style.backgroundImage = im.style.backgroundImage; }
  }
  // where every object lands: one clear spot, low and to the right, just off the limb, whatever the screen
  function spot() {
    var O = window.vxOrbit, z = O.size(), R = O.radius ? O.radius() : z.H * .33, a = 38 * Math.PI / 180;
    return { x: z.W * z.cx + 1.32 * R * Math.cos(a), y: z.H * z.cy + 1.32 * R * Math.sin(a) };
  }
  function locate(node) {
    var k = node.getAttribute('data-sky'), O = window.vxOrbit;
    if (!SKY[k] || !O || !O.lookToward || stage.classList.contains('is-focus')) return;
    clearTimeout(skyT); skyEl = node;
    if (skyKey === k) return;
    skyKey = k; skyAt = 0; dress(node, k); stage.classList.add('is-sky');
    // the Earth turns until the object is in view; then the reticle locks on
    O.lookToward(SKY[k], 950, function () {
      if (skyKey !== k) return;
      skyAt = performance.now();
      (function step() { tick(); if (skyKey === k && performance.now() - skyAt < LOCK + 60) requestAnimationFrame(step); })();
    }, spot());
  }
  function unlocate() {
    clearTimeout(skyT);
    skyT = setTimeout(function () { if (!skyKey) return; skyKey = null; skyEl = null; skyAt = 0; obj.style.opacity = 0; stage.classList.remove('is-sky'); if (window.vxOrbit) window.vxOrbit.release(1000); tick(); }, 380);
  }
  root.querySelectorAll('[data-sky]').forEach(function (node) {
    node.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') locate(node); });
    node.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') unlocate(); });
    node.addEventListener('focusin', function () { locate(node); });
    node.addEventListener('focusout', unlocate);
  });
  function drawSky(box) {
    var sp = window.vxOrbit && window.vxOrbit.sky && window.vxOrbit.sky(SKY[skyKey]);
    if (!sp || sp.off) { obj.style.opacity = 0; return; }
    var p = onStage(sp), g = el('g', { 'class': 'sk' + (sp.hidden ? ' is-hidden' : '') });
    // turning: a wide, faint ring rides in with the object; arrived: it closes, the ticks slide in, the words fade up
    var t = !skyAt ? 0 : LOCK ? Math.min(1, (performance.now() - skyAt) / LOCK) : 1, e = 1 - Math.pow(1 - t, 3), R0 = 17 + 26 * (1 - e);
    g.appendChild(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: R0.toFixed(1), 'class': 'sk-ring', opacity: (.3 + .7 * e).toFixed(2) }));
    obj.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)'; obj.style.opacity = sp.hidden ? (.35 * e).toFixed(2) : e.toFixed(2);
    if (skyAt) {
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) { var a = R0 + 4, b = R0 + 10; g.appendChild(el('line', { x1: (p.x + d[0] * a).toFixed(1), y1: (p.y + d[1] * a).toFixed(1), x2: (p.x + d[0] * b).toFixed(1), y2: (p.y + d[1] * b).toFixed(1), 'class': 'sk-tick', opacity: e.toFixed(2) })); });
      var l1 = SKY[skyKey].name, l2 = sp.hidden ? 'behind the Earth from here' : farOf(skyKey) + ' · where it is now';
      // the words go on whichever side has room
      var wide = Math.max(l1.length * 7.4, l2.length * 6.4), right = p.x + R0 + 16 + wide < box.width - 12, x = right ? p.x + R0 + 16 : p.x - R0 - 16, fade = Math.max(0, (t - .4) / .6).toFixed(2);
      var t1 = el('text', { x: x.toFixed(1), y: (p.y - 3).toFixed(1), 'class': 'sk-l', 'text-anchor': right ? 'start' : 'end', opacity: fade }); t1.textContent = l1; g.appendChild(t1);
      var t2 = el('text', { x: x.toFixed(1), y: (p.y + 12).toFixed(1), 'class': 'sk-l2', 'text-anchor': right ? 'start' : 'end', opacity: fade }); t2.textContent = l2; g.appendChild(t2);
      var r = skyEl.getBoundingClientRect();
      if (r.width) {
        var rr = { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top }, a2 = nearestOnRect(rr, p), dx = p.x - a2.x, dy = p.y - a2.y, dd = Math.hypot(dx, dy) || 1;
        // the tether stops at the ring, not at the picture
        g.appendChild(el('path', { d: 'M' + a2.x.toFixed(1) + ' ' + a2.y.toFixed(1) + ' L' + (p.x - dx / dd * (R0 + 2)).toFixed(1) + ' ' + (p.y - dy / dd * (R0 + 2)).toFixed(1), 'class': 'sk-t', opacity: e.toFixed(2) }));
      }
    }
    svg.appendChild(g);
  }
  function hook() { if (window.vxOrbit) window.vxOrbit.onframe(tick); else setTimeout(hook, 200); }
  hook();
  window.addEventListener('resize', function () { setTimeout(tick, 60); });

  /* ---------- Mars and the Moon, now ---------- */
  function light(s) { if (s < 60) return s.toFixed(2) + ' s'; var m = Math.floor(s / 60); return m + ' min ' + Math.round(s - 60 * m) + ' s'; }
  function drawMoon(cv, k, waxing) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), S = cv.clientWidth || 48;
    cv.width = S * dpr; cv.height = S * dpr;
    var c = cv.getContext('2d'), r = S / 2 - 2, cx = S / 2, cy = S / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#16191e'; c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI); c.fill();
    var g = c.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r);
    g.addColorStop(0, '#f1efe9'); g.addColorStop(1, '#9d9a92');
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI); c.clip();
    c.fillStyle = g; c.beginPath();
    // the lit half, on the side the Sun is: right while waxing, left while waning (as seen from the north)
    c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing); c.closePath(); c.fill();
    var rx = r * Math.abs(2 * k - 1);
    c.fillStyle = k >= 0.5 ? g : '#16191e';
    c.beginPath(); c.ellipse(cx, cy, Math.max(0.01, rx), r, 0, 0, 2 * Math.PI); c.fill();
    c.restore();
  }
  function planets() {
    var now = Date.now(), m = root.querySelector('[data-planet="mars"]'), mo = root.querySelector('[data-planet="moon"]');
    var put = function (e, k, v) { var x = e.querySelector('[data-p="' + k + '"]'); if (x) x.textContent = v; };
    if (m) { var d = vx.eph.marsKm(now); put(m, 'far', (d / 1e6).toFixed(1) + ' million km away'); put(m, 'note', 'light takes ' + light(d / vx.eph.C_KMS)); }
    if (mo) {
      var dm = vx.eph.moonKm(now), ph = vx.eph.moonPhase(now);
      put(mo, 'far', vx.group(Math.round(dm)) + ' km away');
      put(mo, 'note', Math.round(ph.lit * 100) + '% lit, ' + (ph.waxing ? 'waxing' : 'waning'));
      drawMoon(mo.querySelector('canvas'), ph.lit, ph.waxing);
    }
  }
  planets(); setInterval(planets, 60000);

  /* ---------- @emem decodes one live token ---------- */
  var card = root.querySelector('.hd-card'), flight = null;
  async function jpost(path, body) { var r = await fetch(EMEM + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('emem.dev answered ' + r.status); return r.json(); }
  function set(k, v) { var e = card.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = v; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  async function decode() {
    if (!card) return;
    var cell = card.getAttribute('data-cell'), place = card.getAttribute('data-place');
    set('state', 'decoding…');
    try {
      var rc = await jpost('/v1/recall', { cell: cell, bands: ['indices.ndvi'] });
      var cap = function (f) { return ((f.sources || [])[0] || {}).captured_at || ''; };
      var facts = (rc.facts || []).filter(function (f) { return f.band === 'indices.ndvi' && typeof f.value === 'number' && f.fact_cid; }).sort(function (a, b) { return cap(b) < cap(a) ? -1 : 1; });
      if (!facts.length) throw new Error('no reading at this cell yet');
      var f = facts[0], tok = 'emem:fact:' + cell + ':' + f.fact_cid;
      var res = await jpost('/v1/memory_token/resolve', { token: tok });
      var cb = new Uint8Array(await (await fetch(EMEM + '/v1/facts/' + f.fact_cid, { headers: { accept: 'application/cbor' } })).arrayBuffer());
      var hashOk = vx.cid52(cb) === f.fact_cid, v = ememVerify.verifyReceipt(res.receipt), sigOk = v.ok && (res.receipt.fact_cids || []).indexOf(f.fact_cid) >= 0;
      var src = (vx.cborDecode(cb).sources || [])[0] || {}, sat = (String(src.id || '').match(/S2[ABC]/) || [''])[0];
      // printed verbatim: an agent that writes 0.756 has rounded, and echo_verify says so.
      // It is written when the token reaches @emem, not before: the flight is the decode
      var vs = String(f.value), ve = card.querySelector('[data-d="val"]');
      var show = function () {
        reveal(ve, vs);
        var mt = card.querySelector('[data-d="meta"]'); mt.textContent = '';
        [place, [day(src.captured_at), sat ? 'Sentinel-' + sat.slice(1) : ''].filter(Boolean).join(' · ')].forEach(function (t, i) { if (i) mt.appendChild(document.createTextNode(' · ')); var sp = document.createElement('span'); sp.textContent = t; mt.appendChild(sp); });
        var ck = card.querySelector('[data-d="check"]');
        if (hashOk && sigOk) ck.innerHTML = '<span>bytes ✓ · signature ✓</span> <span>checked in this browser</span>';
        else ck.textContent = 'check failed: ' + (!hashOk ? 'hash' : 'signature');
        var tb = card.querySelector('[data-d="tok"]');
        tb.textContent = tok + ' · '; var n = document.createElement('span'); n.textContent = vx.enc.encode(tok).length + ' bytes'; tb.appendChild(n);
        set('state', 'just now');
        card.classList.toggle('is-bad', !(hashOk && sigOk));
      };
      window.vxLastToken = tok;
      set('state', 'decoding · ' + vx.enc.encode(tok).length + ' bytes in flight');
      fly(sat, show);
    } catch (e) {
      set('state', 'offline'); set('meta', vx.why(e, 'emem.dev') + ' · decode again to retry'); set('check', '');
    }
  }
  // the token's path: from the place it names to @emem, drawn once; the value is written on arrival
  function fly(sat, done) {
    if (reduce) { if (done) done(); hit(); return; }
    flight = { t0: performance.now(), sat: sat };
    (function step() {
      if (!flight) return;
      tick();
      if (performance.now() - flight.t0 < 1700) requestAnimationFrame(step); else { flight = null; tick(); if (done) done(); hit(); }
    })();
  }
  // the signed value arrives with the token, verbatim from the first frame: it only comes into focus;
  // the first three decimals bright, the rest of the value dimmer
  function reveal(ve, vs) {
    var cut = vs.indexOf('.') >= 0 ? vs.indexOf('.') + 4 : vs.length;
    ve.title = 'the signed value, verbatim: ' + vs;
    ve.textContent = ''; ve.appendChild(document.createTextNode(vs.slice(0, cut)));
    var tail = document.createElement('span'); tail.className = 'hd-tail'; tail.textContent = vs.slice(cut); ve.appendChild(tail);
    ve.classList.remove('is-in'); void ve.offsetWidth; ve.classList.add('is-in');
  }
  function hit() { card.classList.add('is-hit'); setTimeout(function () { card.classList.remove('is-hit'); }, 1600); }
  function drawFlight() {
    var box = stage.getBoundingClientRect(), bot = root.querySelector('.hd-bot');
    var from = null, pin = pins.filter(function (p) { return p.item.cid === card.getAttribute('data-cid'); })[0];
    if (pin && pin.s) from = pin.s;
    if (!from && flight.sat && window.vxOrbit) from = onStage(window.vxOrbit.sat(flight.sat));
    if (!from || !bot) return;
    var b = bot.getBoundingClientRect(), to = { x: b.left - box.left + b.width * .5, y: b.top - box.top + b.height * .32 };
    var t = Math.min(1, (performance.now() - flight.t0) / 1700), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 80;
    var x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x, y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y;
    svg.appendChild(el('path', { d: 'M' + from.x + ' ' + from.y + ' Q' + cx + ' ' + cy + ' ' + to.x + ' ' + to.y, 'class': 'is-sat', style: 'stroke: rgba(61,220,151,.45)' }));
    svg.appendChild(el('circle', { cx: x, cy: y, r: 4, 'class': 'pk' }));
    var lb = el('text', { x: x + 8, y: y - 8, 'class': 'pk-l' }); lb.textContent = window.vxLastToken ? vx.enc.encode(window.vxLastToken).length + ' B' : 'token';
    svg.appendChild(lb);
  }
  var again = root.querySelector('[data-decode]');
  if (again) again.addEventListener('click', decode);
  var layers = root.querySelector('[data-layers]');
  if (layers) layers.addEventListener('click', function () {
    window.vxCatalog.then(function (items) { var x = items.filter(function (i) { return i.cid === card.getAttribute('data-cid'); })[0]; if (x) openFromPlace(x, east, layers); });
  });
  // decode once the globe has drawn, so the path has somewhere to start
  var started = false;
  function go() { if (started) return; started = true; setTimeout(decode, 900); }
  document.addEventListener('vx:elements', go);
  setTimeout(go, 4000);

  /* ---------- the live strip ---------- */
  var live = root.querySelector('[data-live-orbits]'), COL = { S2A: '#8fb8ff', S2B: '#ff9f7a', S2C: '#cda8ff', HST: '#f2f4f7', ISS: '#b9c3cf' };
  function strip() {
    if (!live || !window.vxOrbit || !window.vxOrbit.elements()) return;
    var st = window.vxOrbit.states(), el2 = window.vxOrbit.elements(), ep = Math.max.apply(null, st.map(function (s) { return s.epoch; }));
    var age = (Date.now() - ep) / 3600e3;
    live.innerHTML = st.map(function (s) { return '<span><span class="dot" style="background:' + (COL[s.short] || '#fff') + '"></span>' + s.short + ' <i>' + Math.round(s.alt) + ' km</i></span>'; }).join('') +
      '<span>orbits: ' + (el2.from.indexOf('snapshot') >= 0 ? 'dated snapshot' : 'CelesTrak') + ', <i>' + (age < 48 ? age.toFixed(0) + ' h' : (age / 24).toFixed(0) + ' d') + ' old</i> · SGP4 in this browser</span>';
  }
  setInterval(strip, 2000); document.addEventListener('vx:elements', strip);
})();
