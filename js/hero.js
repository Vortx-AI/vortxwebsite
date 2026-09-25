/* hero.js: the Earth, and what it remembers, around it.
 *
 *   pins     every Earth observation in the live ememdemo catalogue, at its own at=lat,lng
 *   cards    featured memories, each tethered to its pin; Hubble's image to Hubble, where it is now
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
      out.push({ sec: sec, verb: p[0], kind: p[1], cid: p[2], kv: kv, title: (kv.t || '').replace(/_/g, ' ').replace(/,(?=\S)/g, ', '), at: at.length === 2 && at.every(isFinite) ? at : null });
    });
    return out;
  }
  window.vxCatalog = window.vxCatalog || fetch('https://vortx-ai.github.io/ememdemo/llms.txt').then(function (r) { return r.text(); }).then(parse);

  /* ---------- pins and tethers ---------- */
  var pins = [], cards = [].slice.call(root.querySelectorAll('.hc[data-cid], .hc[data-sat], .hd-card[data-cid]'));
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  window.vxCatalog.then(function (items) {
    items.filter(function (x) { return x.at; }).forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'h3o-pin is-far';
      b.setAttribute('aria-label', x.title + ', open its memory');
      b.innerHTML = '<span></span>'; b.firstChild.textContent = x.title;
      b.addEventListener('click', function () { window.open(NOTE(x.cid), '_blank', 'noopener'); });
      pinsEl.appendChild(b);
      pins.push({ item: x, el: b });
    });
    cards.forEach(function (c) {
      var cid = c.getAttribute('data-cid'); if (!cid) return;
      var x = items.filter(function (i) { return i.cid === cid; })[0];
      if (!x) return;
      c.vxItem = x;
      if (!c.getAttribute('href')) c.setAttribute('href', NOTE(cid));
      var meta = c.querySelector('[data-meta]');
      if (meta) {
        var parts = [];
        if (x.kv.size) parts.push(x.kv.size.replace(/(\d)([A-Z])/, '$1 $2') + ' at source');
        else if (x.kv.frames) parts.push(x.kv.frames + ' frames' + (x.kv.years ? ' · ' + x.kv.years.replace('-', '–') : ''));
        if (x.kv.tok) parts.push('agent reads <b>' + x.kv.tok.replace('~', '≈') + ' tokens</b>');
        meta.innerHTML = parts.join(' · ');
      }
    });
    tick();
    // the three verbs below the hero use one real file from the same catalogue
    var how = document.getElementById('how'), hx = how && items.filter(function (i) { return i.cid === how.getAttribute('data-cid'); })[0];
    if (hx) {
      var put = function (k, v) { var e = how.querySelector('[data-how="' + k + '"]'); if (e && v) e.textContent = v; };
      var tok = 'emem:tree:' + hx.cid + '#row=0';
      put('size', (hx.kv.size || '').replace(/(\d)([A-Z])/, '$1 $2'));
      put('src', hx.kv.src ? 'at ' + hx.kv.src : null);
      put('bytes', vx.enc.encode(tok).length + ' B');
      put('token', tok);
      put('tok', hx.kv.tok ? hx.kv.tok.replace('~', '≈') + ' tokens' : null);
    }
  }).catch(function () {});

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
    cards.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (!r.width) return; // hidden at this width: no card, no tether
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
    if (flight) drawFlight();
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
      set('val', (+f.value).toFixed(3));
      var mt = card.querySelector('[data-d="meta"]'); mt.textContent = '';
      [place, [day(src.captured_at), sat ? 'Sentinel-' + sat.slice(1) : ''].filter(Boolean).join(' · ')].forEach(function (t, i) { if (i) mt.appendChild(document.createTextNode(' · ')); var sp = document.createElement('span'); sp.textContent = t; mt.appendChild(sp); });
      var ck = card.querySelector('[data-d="check"]');
      if (hashOk && sigOk) ck.innerHTML = '<span>bytes ✓ · signature ✓</span> <span>checked in this browser</span>';
      else ck.textContent = 'check failed: ' + (!hashOk ? 'hash' : 'signature');
      var tb = card.querySelector('[data-d="tok"]');
      tb.textContent = tok + ' · '; var n = document.createElement('span'); n.textContent = vx.enc.encode(tok).length + ' bytes'; tb.appendChild(n);
      set('state', 'just now');
      card.classList.toggle('is-bad', !(hashOk && sigOk));
      window.vxLastToken = tok;
      fly(sat);
    } catch (e) {
      set('state', 'offline'); set('meta', vx.why(e, 'emem.dev') + ' · decode again to retry'); set('check', '');
    }
  }
  // the token's path: from the place it names to @emem, drawn once
  function fly(sat) {
    if (reduce) { hit(); return; }
    flight = { t0: performance.now(), sat: sat };
    (function step() {
      if (!flight) return;
      tick();
      if (performance.now() - flight.t0 < 1700) requestAnimationFrame(step); else { flight = null; tick(); hit(); }
    })();
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
