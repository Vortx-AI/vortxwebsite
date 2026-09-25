/* reach.js: how far each observer is from the ground, computed now.
 *
 *   mars, L2, moon  vx.eph (lib.js): Meeus ch. 47, Standish elements, the three-body quintic,
 *                   each checked against JPL Horizons before it shipped
 *   orbiters        the same SGP4 states the globe draws (window.vxOrbit, js/orbit.js)
 *   light time      distance / c, one way
 *   profiles        each class's admission rule, read live from emem.dev/v1/substrates
 *   examples        pointer sizes and costs, read live from the ememdemo catalogue
 *   launches        each tracked object's international designator (from its elements)
 *                   and its SATCAT record (CelesTrak; dated snapshot in data/satcat.json)
 * Nothing in this section is typed: every number is recomputed or fetched.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('encode');
  if (!root || !window.vx) return;
  var E = vx.eph, C = E.C_KMS;
  var MAX_LOG = Math.log10(4.1e8); // Mars at its farthest, km: the bar's full length

  function km(n) {
    if (n >= 1e7) return (n / E.AU_KM).toFixed(3) + ' AU';
    return vx.group(Math.round(n)) + ' km';
  }
  function light(s) {
    if (s < 1) return (s * 1000).toFixed(2) + ' ms';
    if (s < 60) return s.toFixed(2) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s - 60 * m);
    return m + ' min ' + r + ' s';
  }
  function set(el, sel, txt) { var x = el.querySelector(sel); if (x && x.textContent !== txt) x.textContent = txt; }
  function bar(el, d) {
    var b = el.querySelector('[data-bar]');
    if (b) b.style.width = Math.max(1.5, Math.min(100, 100 * Math.log10(Math.max(1, d)) / MAX_LOG)).toFixed(1) + '%';
  }

  /* ---------- distances ---------- */
  var BODY = { mars: E.marsKm, l2: E.l2Km, moon: E.moonKm };
  function tick() {
    var now = Date.now();
    root.querySelectorAll('[data-reach]').forEach(function (el) {
      var k = el.getAttribute('data-reach'), d = null, extra = '';
      if (BODY[k]) {
        d = BODY[k](now);
        if (k === 'mars') extra = 'reply ' + light(2 * d / C) + ' round trip';
        if (k === 'mars') set(el, '[data-au]', (d / E.AU_KM).toFixed(4) + ' AU');
      } else if (k === 'orbit' && window.vxOrbit) {
        var want = el.getAttribute('data-short').split(','), st = window.vxOrbit.states(now).filter(function (s) { return want.indexOf(s.short) >= 0; });
        if (!st.length) return;
        var alts = st.map(function (s) { return s.alt; }), lo = Math.min.apply(null, alts), hi = Math.max.apply(null, alts);
        d = (lo + hi) / 2;
        set(el, '[data-dist]', st.length > 1 ? vx.group(Math.round(lo)) + '–' + vx.group(Math.round(hi)) + ' km' : km(d));
        set(el, '[data-light]', 'light ' + light(d / C) + ' · ' + st.map(function (s) { return s.short + ' ' + s.v.toFixed(2) + ' km/s'; }).join(' · '));
        bar(el, d);
        return;
      } else return;
      set(el, '[data-dist]', km(d));
      set(el, '[data-light]', 'light ' + light(d / C) + (extra ? ' · ' + extra : ''));
      bar(el, d);
    });
  }

  /* ---------- admission rules, live ---------- */
  var RULE = { archive_recomputable: 'admitted by recomputing from the public archive', os_trace_required: 'admitted only with the device’s full OS trace', custodial_retention: 'admitted as custody, not capture' };
  function profiles() {
    return fetch('https://emem.dev/v1/substrates').then(function (r) { return r.json(); }).then(function (j) {
      var by = {};
      ((j.registry || {}).substrates || []).forEach(function (s) { by[s.id] = s; });
      root.querySelectorAll('[data-profile]').forEach(function (el) {
        var s = by[el.getAttribute('data-profile')];
        if (!s) { el.classList.add('is-missing'); return; }
        el.classList.add(s.status === 'active' ? 'is-active' : 'is-candidate');
        el.innerHTML = '';
        var id = document.createElement('code'); id.textContent = s.id;
        var st = document.createElement('b'); st.textContent = s.status;
        var ru = document.createElement('span'); ru.textContent = RULE[s.admission] || s.admission;
        el.appendChild(id); el.appendChild(st); el.appendChild(ru);
        var need = s.required_trace_layers || [];
        if (need.length) { var ly = document.createElement('i'); ly.textContent = 'trace: ' + need.join(' '); el.appendChild(ly); }
        el.title = s.title || '';
      });
    }).catch(function () {});
  }

  /* ---------- example pointers, sized from the ememdemo catalogue ---------- */
  function pointers() {
    return fetch('https://vortx-ai.github.io/ememdemo/llms.txt').then(function (r) { return r.text(); }).then(function (txt) {
      root.querySelectorAll('[data-ptr]').forEach(function (el) {
        var cid = el.getAttribute('data-ptr'), line = txt.split('\n').filter(function (l) { return l.indexOf(' ' + cid + ' ') > 0; })[0];
        if (!line) return;
        var kv = {}; line.replace(/(\w+)=(\S+)/g, function (_, k, v) { kv[k] = v; });
        var meta = el.querySelector('[data-ptr-meta]');
        if (meta) meta.textContent = [kv.size || (kv.files ? kv.files + ' files' : ''), kv.src ? 'at ' + kv.src : '', kv.tok ? '→ note ' + kv.tok.replace('~', '≈') + ' tokens' : ''].filter(Boolean).join(' ');
        var t = el.querySelector('[data-ptr-title]');
        if (t && kv.t) t.textContent = kv.t.replace(/_/g, ' ').replace(/,/g, ', ');
      });
    }).catch(function () {});
  }

  /* ---------- launches: what lifted each object the globe tracks ---------- */
  function launches() {
    var box = root.querySelector('[data-launches]');
    if (!box) return;
    Promise.all([
      new Promise(function (res) {
        if (window.vxOrbit && window.vxOrbit.elements()) return res(window.vxOrbit.states());
        document.addEventListener('vx:elements', function () { res(window.vxOrbit ? window.vxOrbit.states() : []); }, { once: true });
      }),
      fetch('/data/satcat.json').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (v) {
      var sats = v[0] || [], cat = v[1] || { records: [], sites: {} }, by = {};
      (cat.records || []).forEach(function (r) { by[r.NORAD_CAT_ID] = r; });
      box.innerHTML = '';
      sats.forEach(function (s) {
        var r = by[s.norad] || {}, li = document.createElement('li');
        var n = s.cospar ? +s.cospar.slice(5, 8) : null;
        li.innerHTML = '<b class="v">launch</b><span class="n"></span>';
        li.children[1].textContent = s.short;
        [['id', s.cospar], ['launch', n ? '#' + n + ' of ' + s.cospar.slice(0, 4) : null], ['date', r.LAUNCH_DATE], ['from', (cat.sites || {})[r.LAUNCH_SITE] || r.LAUNCH_SITE]].forEach(function (p) {
          if (!p[1]) return;
          var i = document.createElement('i'); i.className = 'kv';
          i.innerHTML = '<span class="k"></span><span class="x"></span>'; i.firstChild.textContent = p[0]; i.lastChild.textContent = p[1];
          li.children[1].appendChild(document.createTextNode(' ')); li.children[1].appendChild(i);
        });
        box.appendChild(li);
      });
      var src = root.querySelector('[data-launch-src]');
      if (src && cat.fetched_at) src.textContent = 'id: the international designator in each object’s live elements · date and site: CelesTrak SATCAT, snapshot ' + cat.fetched_at.slice(0, 10);
    });
  }

  /* ---------- boot when the section is near ---------- */
  var timer = 0, started = false;
  function start() {
    if (started) return; started = true;
    tick(); profiles(); pointers(); launches();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { start(); if (!timer) timer = setInterval(tick, 1000); }
      else if (timer) { clearInterval(timer); timer = 0; }
    }, { rootMargin: '200px' }).observe(root);
  } else { start(); setInterval(tick, 1000); }
})();
