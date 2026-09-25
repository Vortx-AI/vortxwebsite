/* hero.js: the Earth, and what it remembers, around it.
 *
 *   pins     every Earth observation in the live ememdemo catalogue, at its own at=lat,lng; a pin opens
 *            its sample here, in the popup (js/pop.js), where it runs end to end
 *   ring     one sample per device (telescope, satellite, camera, drone, robot, and the Moon and Mars
 *            tonight), each tethered to where it observed: Hubble's image to Hubble, where it is now.
 *            A card is a pill until it is opened; each finds its own place around the Earth, clear of
 *            the words and of each other, and can be dragged anywhere; the page remembers where
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
  var PHONE = window.matchMedia ? matchMedia('(max-width: 900px)') : { matches: false };
  var NS = 'http://www.w3.org/2000/svg';
  // the hero clips what spills past its edges; a browser without overflow: clip could still scroll it sideways to show
  // a focused card, and every position on the stage would slide with it
  root.addEventListener('scroll', function () { if (root.scrollLeft || root.scrollTop) { root.scrollLeft = 0; root.scrollTop = 0; } });

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
  var ringEl = root.querySelector('[data-ring]'), ring = ringEl ? [].slice.call(ringEl.querySelectorAll('.hc')) : [];
  var card = root.querySelector('.hd-card'), hd = root.querySelector('.hd');
  var pins = [], cards = ring.concat(card && card.hasAttribute('data-cid') ? [card] : []);
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
    clearTimeout(peekT); peeking = null;
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
  var east = [], featured = cards.map(function (c) { return c.getAttribute('data-cid'); }).filter(Boolean), known = false;
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
      b.addEventListener('click', function () { if (b.vxPile && b.vxPile.length > 1) pick(b, b.vxPile); else openFromPlace(x, east); });
      pinsEl.appendChild(b);
      pins.push({ item: x, el: b, lead: featured.indexOf(x.cid) >= 0 });
    });
    // each memory lands where it was observed, one after another; then the pins settle
    setTimeout(function () { pins.forEach(function (p) { p.el.classList.remove('is-landing'); }); }, 900 + placed.length * 90 + 1200);
    cards.forEach(function (c) {
      var cid = c.getAttribute('data-cid'); if (!cid) return;
      var x = items.filter(function (i) { return i.cid === cid; })[0];
      if (!x) return;
      c.vxItem = x;
      var a = c.querySelector('a.hc-main');
      // on a phone the strip sits under the globe, out of its view: the sample opens at once, where the tap was
      if (a) a.addEventListener('click', function (e) { if (window.vxPop && window.vxPop.plain(e)) { e.preventDefault(); if (x.at && !PHONE.matches) openFromPlace(x, east, c); else openHere(x, x.at ? east : null, c); } });
      var meta = c.querySelector('[data-meta]');
      if (meta) {
        // the ememdemo token line, from the catalogue's own fields
        var parts = [], tk = num(x.kv.tok), rw = num(x.kv.raw);
        if (x.kv.size) parts.push(x.kv.size.replace(/(\d)([A-Z])/, '$1 $2'));
        else if (x.kv.years) parts.push(x.kv.years.replace('-', '–'));
        if (tk) parts.push('agent reads <b>' + x.kv.tok + ' context tokens</b>');
        if (tk && rw) parts.push(Math.round(rw / tk).toLocaleString('en-US') + '× less');
        meta.innerHTML = parts.join(' · ');
      }
      checkNote(c, cid);
    });
    known = true; settle();
    tick();
  }).catch(function () { known = true; settle(); });

  function num(v) { var m = String(v || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  // each card re-checks its note as the page loads: base32(blake3(bytes)[0:16]) must equal its name
  function checkNote(c, cid) {
    var body = c.querySelector('.hc-more'); if (!body) return;
    // the check leads the credit line; it is in the markup already, so the card's size does not change when it lands
    var b = body.querySelector('.hc-ck');
    if (!b) { b = document.createElement('i'); b.className = 'hc-ck'; b.textContent = 'checking'; body.appendChild(b); }
    vx.getBytes(NOTE(cid)).then(function (r) {
      var ok = vx.cid26(r.bytes) === cid;
      b.textContent = ok ? '✓ note' : '✗ name lies'; b.className = 'hc-ck ' + (ok ? 'is-ok' : 'is-bad');
      b.title = ok ? 'this note hashes to its name, checked in your browser' : 'the bytes do not hash to the name';
    }).catch(function () { b.textContent = 'unreachable'; b.title = 'not checked: emem.dev could not be reached, which is not a failed check'; });
  }
  // places observed a few kilometres apart land on the same pixels: those pins become one, marked with
  // how many it holds, and a click on it lists them (a featured memory leads its pile)
  var PILE = 20, picker = null;
  function pile() {
    var order = pins.filter(function (p) { return p.s; }).sort(function (a, b) { return (b.lead ? 1 : 0) - (a.lead ? 1 : 0); }), heads = [];
    pins.forEach(function (p) { p.pile = null; });
    order.forEach(function (p) {
      var h = heads.filter(function (q) { return Math.hypot(q.s.x - p.s.x, q.s.y - p.s.y) < PILE; })[0];
      if (h) h.pile.push(p); else { p.pile = [p]; heads.push(p); }
    });
    pins.forEach(function (p) {
      var n = p.pile ? p.pile.length : 0, merged = !!p.s && !p.pile;
      p.el.classList.toggle('is-merged', merged);
      p.el.classList.toggle('is-pile', n > 1);
      p.el.vxPile = n > 1 ? p.pile.map(function (q) { return q.item; }) : null;
      var label = n > 1 ? p.item.title + ' and ' + (n - 1) + ' more here' : p.item.title;
      var aria = n > 1 ? n + ' memories here: ' + p.pile.map(function (q) { return q.item.title; }).join('; ') + '. List them' : p.item.title + ', open it';
      if (p.el.firstChild.textContent !== label) p.el.firstChild.textContent = label;
      if (p.el.getAttribute('aria-label') !== aria) p.el.setAttribute('aria-label', aria);
      if (n > 1) p.el.setAttribute('data-n', n); else p.el.removeAttribute('data-n');
      if (merged) p.el.tabIndex = -1; else p.el.removeAttribute('tabindex');
    });
    if (picker) { if (!picker.pin.vxPile || picker.pin.classList.contains('is-far')) unpick(); else at(picker); }
  }
  function at(pk) {
    var r = pk.pin.getBoundingClientRect(), sb = stage.getBoundingClientRect(), left = r.left - sb.left + r.width / 2;
    pk.box.style.top = (r.top - sb.top + r.height / 2) + 'px';
    if (left > sb.width / 2) { pk.box.style.left = ''; pk.box.style.right = (sb.width - left + 16) + 'px'; } else { pk.box.style.right = ''; pk.box.style.left = (left + 16) + 'px'; }
  }
  function pick(pin, list) {
    if (picker && picker.pin === pin) { unpick(); return; }
    unpick();
    var box = document.createElement('div'); box.className = 'h3o-pick'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', list.length + ' memories at this spot');
    var h = document.createElement('p'); h.className = 'h3o-pick-h'; h.innerHTML = '<b class="v">open</b> '; h.appendChild(document.createTextNode(list.length + ' memories, observed here'));
    box.appendChild(h);
    list.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button';
      var t = document.createElement('span'); t.textContent = x.title; b.appendChild(t);
      var k = document.createElement('i'); k.textContent = [x.verb, x.kind].filter(Boolean).join(' '); b.appendChild(k);
      b.addEventListener('click', function () { unpick(); openFromPlace(x, east); });
      box.appendChild(b);
    });
    stage.appendChild(box); pin.classList.add('is-open'); pin.setAttribute('aria-expanded', 'true');
    picker = { box: box, pin: pin }; at(picker);
    var first = box.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }
  function unpick() {
    if (!picker) return;
    picker.box.remove(); picker.pin.classList.remove('is-open'); picker.pin.setAttribute('aria-expanded', 'false');
    picker = null;
  }
  document.addEventListener('click', function (e) { if (picker && !picker.box.contains(e.target) && !picker.pin.contains(e.target)) unpick(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && picker) { var p = picker.pin; unpick(); p.focus({ preventScroll: true }); } });
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
    if (!laid && window.vxOrbit.size().W > 1) settle();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    pins.forEach(function (p) {
      var s = onStage(window.vxOrbit.screen(p.item.at[0], p.item.at[1]));
      var far = !s || !s.front;
      p.el.classList.toggle('is-far', far);
      if (s) { p.el.style.left = s.x + 'px'; p.el.style.top = s.y + 'px'; p.el.classList.toggle('is-l', s.x > box.width / 2); }
      p.s = far ? null : s;
    });
    pile();
    if (getComputedStyle(svg).display === 'none') return;
    var inSky = stage.classList.contains('is-sky');
    cards.forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (!r.width || c.classList.contains('is-out') || (c.classList.contains('hc') && !c.classList.contains('is-placed'))) return; // not on the stage: no tether
      if (inSky && !c.hasAttribute('data-sky')) return; // the Earth has turned away from where these point
      var target = null, isSat = false;
      if (c.vxItem && c.vxItem.at) { var s = onStage(window.vxOrbit.screen(c.vxItem.at[0], c.vxItem.at[1])); if (s && s.front) target = s; }
      var sat = c.getAttribute('data-sat');
      if (sat) { target = onStage(window.vxOrbit.sat(sat)); isSat = true; var w = c.querySelector('[data-where]'); if (w) w.textContent = target ? 'Hubble is there now, in orbit' : 'Hubble is behind the Earth now'; }
      var far = !target && !!c.vxItem && !!c.vxItem.at;
      if (far !== c.classList.contains('is-far')) { c.classList.toggle('is-far', far); if (far) c.title = 'Its place is on the far side of the Earth now: point at this card to turn the Earth there'; else c.removeAttribute('title'); }
      if (!target) return;
      var rr = { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
      var a = nearestOnRect(rr, target), mx = (a.x + target.x) / 2, my = (a.y + target.y) / 2 - 24;
      svg.appendChild(el('path', { d: 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + target.x.toFixed(1) + ' ' + target.y.toFixed(1), 'class': (isSat ? 'is-sat' : '') + (c === hot ? ' is-hot' : '') }));
      svg.appendChild(el('circle', { cx: target.x.toFixed(1), cy: target.y.toFixed(1), r: isSat ? 8 : 5, 'class': c === hot ? 'is-hot' : '' }));
    });
    if (skyKey && skyEl) drawSky(box); else if (obj.style.opacity !== '0') obj.style.opacity = 0;
    if (flight) drawFlight();
  }

  /* ---------- the ring: each card finds its own place, opens, closes, and goes where it is dragged ---------- */
  var copy = root.querySelector('.h3o-copy'), foot = root.querySelector('.h3o-foot'), tidy = root.querySelector('[data-tidy]');
  var KEY = 'vx.hero.v2', saved = {}, laid = false, hot = null, zTop = 10;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
  function keep() { try { if (Object.keys(saved).length) localStorage.setItem(KEY, JSON.stringify(saved)); else localStorage.removeItem(KEY); } catch (e) {} if (tidy) tidy.hidden = !Object.keys(saved).length; }
  function idOf(c) { return c === hd ? 'decode' : c.getAttribute('data-cid'); }
  function isOpen(c) { return c === hd ? !hd.classList.contains('is-shut') : c.classList.contains('is-open'); }
  function setOpen(c, on) {
    if (c === hd) hd.classList.toggle('is-shut', !on); else c.classList.toggle('is-open', on);
    var t = c.querySelector('.hc-tog'); if (t) t.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function stageBox() { var b = stage.getBoundingClientRect(); return { W: b.width, H: b.height, l: b.left, t: b.top }; }
  function put(c, x, y) {
    var b = stageBox(), w = c.offsetWidth, h = c.offsetHeight;
    x = Math.max(8, Math.min(b.W - w - 8, x)); y = Math.max(8, Math.min(b.H - h - 8, y));
    c.vxAt = { x: x, y: y };
    c.style.setProperty('--x', Math.round(x) + 'px'); c.style.setProperty('--y', Math.round(y) + 'px');
    if (c === hd) hd.classList.add('is-placed');
  }
  function raise(c) { c.style.zIndex = ++zTop; }
  function byDefault(c) { return c === hd || c.hasAttribute('data-open'); }
  // only what the viewer changed is kept: a card back in its own state, where the page put it, is forgotten
  function remember(c) {
    var b = stageBox(), s = {};
    if (isOpen(c) !== byDefault(c)) s.open = isOpen(c);
    if (c.vxMoved && c.vxAt) { s.open = isOpen(c); s.x = +(c.vxAt.x / b.W).toFixed(4); s.y = +(c.vxAt.y / b.H).toFixed(4); }
    if (Object.keys(s).length) saved[idOf(c)] = s; else { delete saved[idOf(c)]; c.vxUser = false; }
    keep();
  }
  // where the Earth is on the stage, and how big; without the globe (its scripts did not load), the middle of the stage
  function geo() {
    var O = window.vxOrbit, b = stageBox();
    if (O && O.radius && O.size().W > 1) { var z = O.size(); return { x: off.x + z.W * z.cx, y: off.y + z.H * z.cy, R: O.radius() }; }
    return { x: b.W * .57, y: b.H * .56, R: Math.min(b.W, b.H) * .3 };
  }
  // which way a card wants to sit: toward its pin, when that is in view; else where it says. A satellite moves,
  // so its card keeps its own place and only its tether follows it: the ring is the same on every visit
  function prefer(c, g) {
    var O = window.vxOrbit, s = null;
    if (!O || c.hasAttribute('data-sat')) return parseFloat(c.getAttribute('data-at')) || 0;
    if (c.vxItem && c.vxItem.at) { s = onStage(O.screen(c.vxItem.at[0], c.vxItem.at[1])); if (s && !s.front) s = null; }
    if (s && Math.hypot(s.x - g.x, s.y - g.y) > 24) return Math.atan2(s.y - g.y, s.x - g.x) * 180 / Math.PI;
    return parseFloat(c.getAttribute('data-at')) || 0;
  }
  // the point a card's tether runs to, if it has one in view now
  function aim(c) {
    var O = window.vxOrbit, s = null; if (!O) return null;
    if (c.hasAttribute('data-sat')) s = onStage(O.sat(c.getAttribute('data-sat')));
    else if (c.vxItem && c.vxItem.at) { s = onStage(O.screen(c.vxItem.at[0], c.vxItem.at[1])); if (s && !s.front) s = null; }
    return s;
  }
  // does the segment p-q pass through the box? (Liang-Barsky)
  function cuts(p, q, t) {
    var dx = q.x - p.x, dy = q.y - p.y, a = 0, b = 1, P = [-dx, dx, -dy, dy], Q = [p.x - t.l, t.r - p.x, p.y - t.t, t.b - p.y];
    for (var i = 0; i < 4; i++) {
      if (!P[i]) { if (Q[i] < 0) return false; continue; }
      var r = Q[i] / P[i];
      if (P[i] < 0) { if (r > b) return false; if (r > a) a = r; } else { if (r < a) return false; if (r < b) b = r; }
    }
    return b - a > .02;
  }
  // around the Earth, nearest first: the angle a card wants, then a little either side, then a little further out;
  // a place whose tether would cross another card, or sit across another card's tether, costs more
  function layout() {
    if (!ring.length) return;
    if (PHONE.matches) { ring.forEach(function (c) { c.classList.remove('is-out'); c.classList.add('is-placed'); }); if (hd) hd.classList.remove('is-placed'); return; }
    var b = stageBox(); if (!b.W) return;
    var g = geo(), R = g.R, taken = [], lines = [];
    var rect = function (e, m) { var r = e.getBoundingClientRect(); return { l: r.left - b.l - m, t: r.top - b.t - m, r: r.right - b.l + m, b: r.bottom - b.t + m }; };
    if (copy) taken.push(rect(copy, 14));
    // the orbit strip fills in after the cards are placed, and can wrap to two lines: keep the whole band clear
    if (foot) { var fr = rect(foot, 6); fr.t = Math.min(fr.t, b.H - 52); fr.l = Math.min(fr.l, 12); fr.r = Math.max(fr.r, b.W - 12); taken.push(fr); }
    if (hd) { var sh = saved.decode; if (hd.vxMoved && sh && isFinite(sh.x)) put(hd, sh.x * b.W, sh.y * b.H); taken.push(rect(hd, 12)); }
    ring.forEach(function (c) {
      var s = saved[idOf(c)];
      if (c.vxMoved && s && isFinite(s.x)) { c.classList.remove('is-out'); put(c, s.x * b.W, s.y * b.H); taken.push(rect(c, 8)); var m = aim(c); if (m) lines.push([{ x: c.vxAt.x + c.offsetWidth / 2, y: c.vxAt.y + c.offsetHeight / 2 }, m]); }
    });
    var todo = ring.filter(function (c) { return !c.vxMoved; });
    todo.forEach(function (c) { if (!c.vxUser) setOpen(c, c.hasAttribute('data-open')); });
    // the big ones first, then the ones with a tether to draw, then the rest (sorted in the loop below)
    function hits(q) { return taken.some(function (t) { return q.r > t.l && q.l < t.r && q.b > t.t && q.t < t.b; }); }
    function find(c) {
      var w = c.offsetWidth, h = c.offsetHeight, p = prefer(c, g), m = c.vxAim, best = null;
      for (var pass = 0; pass < 2 && !best; pass++) {
        var r0 = R * (pass ? .88 : 1.1), pen = pass ? 60 : 0;
        for (var k = 0; k <= 180; k += 5) {
          for (var sg = 1; sg >= -1; sg -= 2) {
            if (!k && sg < 0) continue;
            var a = (p + sg * k) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), sup = Math.abs(ca) * w / 2 + Math.abs(sa) * h / 2;
            for (var e = 0; e <= 280; e += 20) {
              var d = r0 + sup + e, x = g.x + d * ca - w / 2, y = g.y + d * sa - h / 2, q = { l: x, t: y, r: x + w, b: y + h };
              if (x < 12 || y < 12 || q.r > b.W - 12 || q.b > b.H - 12 || hits(q)) continue;
              var sc = k + e * .15 + pen, mid = { x: x + w / 2, y: y + h / 2 };
              if (m && taken.some(function (t) { return cuts(mid, m, t); })) sc += 45;
              if (lines.some(function (l) { return cuts(l[0], l[1], q); })) sc += 45;
              if (!best || sc < best.s) best = { l: x, t: y, w: w, h: h, s: sc };
              break;
            }
          }
          if (best && best.s <= k + pen) break; // nothing further round can beat it
        }
      }
      return best;
    }
    // every device on the stage beats a big picture: when one is left off, the default-open cards close, last first
    var base = taken.slice(), baseLines = lines.slice(), auto = todo.filter(function (c) { return !c.vxUser && c.hasAttribute('data-open'); });
    for (var tries = 0; tries <= auto.length; tries++) {
      taken = base.slice(); lines = baseLines.slice();
      auto.forEach(function (c, i) { setOpen(c, i < auto.length - tries); });
      todo.forEach(function (c) { c.vxAim = c.hasAttribute('data-sat') ? null : aim(c); });
      todo.sort(function (a, c) { return (isOpen(c) - isOpen(a)) || ((c.vxAim ? 1 : 0) - (a.vxAim ? 1 : 0)) || (ring.indexOf(a) - ring.indexOf(c)); });
      var out = 0;
      todo.forEach(function (c) {
        var f = find(c);
        // no good room to open it here: it waits as a pill instead
        if (isOpen(c) && !c.vxUser && (!f || f.s > 60)) { setOpen(c, false); var f2 = find(c); if (f2 || !f) f = f2; else setOpen(c, true); }
        if (!f) { c.classList.add('is-out'); out++; return; }
        c.classList.remove('is-out');
        put(c, f.l, f.t);
        taken.push({ l: f.l - 10, t: f.t - 10, r: f.l + f.w + 10, b: f.t + f.h + 10 });
        if (c.vxAim) lines.push([{ x: f.l + f.w / 2, y: f.t + f.h / 2 }, c.vxAim]);
      });
      if (!out) break;
    }
    if (!laid) {
      laid = true;
      void stage.offsetWidth;
      // the devices land around the Earth one after another
      requestAnimationFrame(function () {
        ring.forEach(function (c, i) { c.style.setProperty('--d', (reduce ? 0 : .15 + i * .07).toFixed(2) + 's'); c.classList.add('is-placed'); });
        setTimeout(function () { ring.forEach(function (c) { c.style.removeProperty('--d'); }); tick(); }, 1400);
      });
    }
    tick();
  }
  // first placement: once the globe has a size and the catalogue has said where each pin is (or has taken too long)
  var slow = false;
  setTimeout(function () { slow = true; settle(); }, 2500);
  function settle() { if (!laid && (known || slow) && (slow || (window.vxOrbit && window.vxOrbit.size().W > 1))) layout(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (laid) layout(); });
  var reT = 0;
  window.addEventListener('resize', function () { clearTimeout(reT); reT = setTimeout(function () { if (laid) layout(); else settle(); }, 150); });
  if (PHONE.addEventListener) PHONE.addEventListener('change', function () { if (laid) layout(); });

  // open or close a card; it grows away from the Earth, keeping the corner nearest it where it was, and closing
  // puts it back where it was before it opened
  function flip(c) {
    var was = c.getBoundingClientRect(), b = stageBox(), on = !isOpen(c), home = !on && c.vxBefore;
    c.vxUser = true; setOpen(c, on);
    if (home) put(c, home.x, home.y);
    else if (!PHONE.matches && c.vxAt && (c !== hd || hd.classList.contains('is-placed'))) {
      if (on) c.vxBefore = { x: c.vxAt.x, y: c.vxAt.y };
      var now = c.getBoundingClientRect(), g = geo();
      var mx = was.left - b.l + was.width / 2, my = was.top - b.t + was.height / 2;
      put(c, mx < g.x ? c.vxAt.x + was.width - now.width : c.vxAt.x, my < g.y ? c.vxAt.y + was.height - now.height : c.vxAt.y);
    }
    if (!on) c.vxBefore = null;
    if (c.hasAttribute('data-planet')) planets();
    raise(c); remember(c); tick();
  }
  // a drag moves the card and says so; a press that does not move is still a click
  function draggable(c, handle) {
    var st = null;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.pointerType === 'touch' || PHONE.matches) return;
      if (e.target.closest('.hc-tog, [data-decode], [data-layers]')) return;
      var b = stageBox(), r = c.getBoundingClientRect();
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, l: r.left - b.l, t: r.top - b.t, on: false };
    });
    handle.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.on) {
        if (Math.hypot(dx, dy) < 5) return;
        st.on = true; c.classList.add('is-drag'); raise(c); unpeek();
        try { handle.setPointerCapture(e.pointerId); } catch (x) {}
      }
      put(c, st.l + dx, st.t + dy); tick();
    });
    function end(e) {
      if (!st || e.pointerId !== st.id) return;
      var moved = st.on; st = null;
      if (!moved) return;
      c.classList.remove('is-drag'); c.vxMoved = true; c.vxBefore = null; remember(c);
      c.vxDragged = true; setTimeout(function () { c.vxDragged = false; }, 0);
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dragstart', function (e) { e.preventDefault(); });
    handle.addEventListener('click', function (e) { if (c.vxDragged) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }
  ring.concat(hd ? [hd] : []).forEach(function (c) {
    var s = saved[idOf(c)];
    if (s && typeof s.open === 'boolean') { c.vxUser = true; setOpen(c, s.open); } else setOpen(c, byDefault(c));
    if (s && isFinite(s.x) && isFinite(s.y)) c.vxMoved = true;
    var t = c.querySelector('.hc-tog');
    if (t) t.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); flip(c); });
    draggable(c, c === hd ? card.querySelector('h2') : c);
    c.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') { hot = c; tick(); } });
    c.addEventListener('pointerleave', function () { if (hot === c) { hot = null; tick(); } });
  });
  keep();
  if (tidy) tidy.addEventListener('click', function () {
    saved = {}; keep();
    ring.concat(hd ? [hd] : []).forEach(function (c) { c.vxMoved = false; c.vxUser = false; c.vxBefore = null; c.style.zIndex = ''; setOpen(c, byDefault(c)); });
    if (hd) { hd.classList.remove('is-placed'); hd.style.removeProperty('--x'); hd.style.removeProperty('--y'); }
    planets(); layout();
  });

  // a card whose place is on the far side of the Earth: pointing at it turns the Earth until it is in view
  var peekT = 0, peeking = null;
  function peek(c) {
    var x = c.vxItem, O = window.vxOrbit;
    if (!x || !x.at || !O || !O.focus || PHONE.matches || stage.classList.contains('is-focus') || stage.classList.contains('is-sky')) return;
    clearTimeout(peekT);
    if (peeking === c) return;
    if (!c.classList.contains('is-far')) return;
    peeking = c; O.focus(x.at[0], x.at[1], 900);
  }
  function unpeek() {
    clearTimeout(peekT);
    if (!peeking) return;
    peekT = setTimeout(function () { peeking = null; if (!stage.classList.contains('is-focus') && window.vxOrbit) window.vxOrbit.release(900); }, 380);
  }
  ring.forEach(function (c) {
    if (c.hasAttribute('data-sky') || c.hasAttribute('data-sat')) return;
    c.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch' && !c.classList.contains('is-drag')) peek(c); });
    c.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') unpeek(); });
    c.addEventListener('focusin', function () { peek(c); });
    c.addEventListener('focusout', unpeek);
  });

  // the robot's own camera plays while it can be seen, and never for a reader who asked for less motion
  root.querySelectorAll('.hc-pic video').forEach(function (v) {
    if (reduce || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); });
    }, { threshold: .2 }).observe(v);
  });

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
    } else if (k !== 'mars') { var im = node.querySelector('.hc-pic'); if (im) obj.style.backgroundImage = im.style.backgroundImage; }
  }
  // where every object lands: one clear spot, low and to the right, just off the limb, whatever the screen
  function spot() {
    var O = window.vxOrbit, z = O.size(), R = O.radius ? O.radius() : z.H * .33, a = 38 * Math.PI / 180;
    return { x: z.W * z.cx + 1.32 * R * Math.cos(a), y: z.H * z.cy + 1.32 * R * Math.sin(a) };
  }
  function locate(node) {
    var k = node.getAttribute('data-sky'), O = window.vxOrbit;
    if (!SKY[k] || !O || !O.lookToward || stage.classList.contains('is-focus') || node.classList.contains('is-drag') || PHONE.matches) return;
    clearTimeout(skyT); skyEl = node;
    if (skyKey === k) return;
    skyKey = k; skyAt = 0; dress(node, k); stage.classList.add('is-sky'); if (back) back.hidden = false;
    // the Earth turns until the object is in view; then the reticle locks on
    O.lookToward(SKY[k], 950, function () {
      if (skyKey !== k) return;
      skyAt = performance.now();
      (function step() { tick(); if (skyKey === k && performance.now() - skyAt < LOCK + 60) requestAnimationFrame(step); })();
    }, spot());
  }
  function unlocate() {
    clearTimeout(skyT);
    skyT = setTimeout(home, 380);
  }
  function home() { if (back) back.hidden = true; if (!skyKey) return; skyKey = null; skyEl = null; skyAt = 0; obj.style.opacity = 0; stage.classList.remove('is-sky'); if (window.vxOrbit) window.vxOrbit.release(1000); tick(); }
  var back = root.querySelector('[data-sky-back]');
  if (back) back.addEventListener('click', function () { clearTimeout(skyT); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); home(); });
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
  function hook() { if (window.vxOrbit) { window.vxOrbit.onframe(tick); settle(); } else setTimeout(hook, 200); }
  hook();

  /* ---------- Mars and the Moon, now ---------- */
  function light(s) { if (s < 60) return s.toFixed(2) + ' s'; var m = Math.floor(s / 60); return m + ' min ' + Math.round(s - 60 * m) + ' s'; }
  function drawMoon(cv, k, waxing) {
    if (!cv) return;
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
    if (m) { var d = vx.eph.marsKm(now); put(m, 'far', (d / 1e6).toFixed(1) + ' million km away'); put(m, 'note', 'light takes ' + light(d / vx.eph.C_KMS) + ' from Mars now'); }
    if (mo) {
      var dm = vx.eph.moonKm(now), ph = vx.eph.moonPhase(now);
      put(mo, 'far', vx.group(Math.round(dm)) + ' km away');
      put(mo, 'note', 'tonight: ' + Math.round(ph.lit * 100) + '% lit, ' + (ph.waxing ? 'waxing' : 'waning') + ', computed here');
      drawMoon(mo.querySelector('canvas'), ph.lit, ph.waxing);
    }
  }
  planets(); setInterval(planets, 60000);

  /* ---------- @emem decodes one live token ---------- */
  var flight = null;
  async function jpost(path, body) { var r = await fetch(EMEM + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('emem.dev answered ' + r.status); return r.json(); }
  function set(k, v) { var e = card.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = v; }
  // the heading says only what has happened: decoding while the token is in flight, decoded once it lands
  function head(h, st) { set('head', '@emem ' + h); set('state', st); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  async function decode() {
    if (!card) return;
    var cell = card.getAttribute('data-cell'), place = card.getAttribute('data-place');
    head('decoding', '…');
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
        head('decoded', '· just now');
        card.classList.toggle('is-bad', !(hashOk && sigOk));
      };
      window.vxLastToken = tok;
      head('decoding', '· ' + vx.enc.encode(tok).length + ' bytes in flight');
      fly(sat, show);
    } catch (e) {
      head('not reached', '· offline'); set('meta', vx.why(e, 'emem.dev') + ' · decode again to retry'); set('check', '');
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
  var FULL = { S2A: 'Sentinel-2A', S2B: 'Sentinel-2B', S2C: 'Sentinel-2C', HST: 'the Hubble Space Telescope', ISS: 'the International Space Station' };
  function strip() {
    if (!live || !window.vxOrbit || !window.vxOrbit.elements()) return;
    var st = window.vxOrbit.states(), el2 = window.vxOrbit.elements(), ep = Math.max.apply(null, st.map(function (s) { return s.epoch; }));
    var age = (Date.now() - ep) / 3600e3;
    live.innerHTML = st.map(function (s) { return '<span title="' + (FULL[s.short] || s.short) + ', ' + Math.round(s.alt) + ' km up now"><span class="dot" style="background:' + (COL[s.short] || '#fff') + '"></span>' + s.short + ' <i>' + Math.round(s.alt) + ' km</i></span>'; }).join('') +
      '<span title="positions propagated with SGP4 in this browser, from ' + (el2.from.indexOf('snapshot') >= 0 ? 'a dated snapshot of the published orbital elements' : 'orbital elements fetched from CelesTrak') + '">computed here from orbits <i>' + (age < 48 ? age.toFixed(0) + ' h' : (age / 24).toFixed(0) + ' d') + ' old</i></span>';
  }
  setInterval(strip, 2000); document.addEventListener('vx:elements', strip);
})();
