/* trust.js: the chain from photon to prompt, each link read live.
 *
 *   log      the transparency log head, signature checked by js/site.js ([data-loghead])
 *   witness  who co-signed which prefix of that log (/v1/log/witnesses), including how far
 *            behind the freshest independent co-signature is
 *   device   devices that chose to be listed, and the hardware roots emem whitelists
 *   tier     the write ladder in emem's own words (/v1/enlist)
 *   score    the public benchmark's own statements, costs included (/v1/scoreboard)
 * Text in quotes is the endpoint's, not ours.
 */
(function () {
  'use strict';
  var root = document.getElementById('trust');
  if (!root) return;
  var EMEM = 'https://emem.dev';
  function j(path) { return fetch(EMEM + path).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function fill(key, parts) {
    var el = root.querySelector('[data-trust="' + key + '"]');
    if (!el) return;
    el.innerHTML = '';
    parts.forEach(function (p) {
      if (p == null) return;
      var i = document.createElement(p.q ? 'q' : 'i');
      i.className = p.q ? 'said' : 'kv';
      if (p.q) i.textContent = p.q;
      else { i.innerHTML = '<span class="k"></span><span class="x"></span>'; i.firstChild.textContent = p[0]; i.lastChild.textContent = p[1]; }
      el.appendChild(i);
      el.appendChild(document.createTextNode(' '));
    });
    el.closest('li') && el.closest('li').classList.add('is-live');
  }
  function g(n) { return Number(n).toLocaleString('en-US'); }
  function start() {
    j('/v1/log/witnesses').then(function (w) {
      fill('witness', [['independent keys', g(w.independent_witness_count)], ['co-signatures', g(w.independent_cosignature_count)],
        ['freshest', g(w.freshest_independent_witness_entries_behind) + ' entries behind the head'], ['head independently witnessed', w.head_is_independently_witnessed ? 'yes' : 'not yet']]);
    }).catch(function () {});
    Promise.all([j('/v1/devices'), j('/v1/device_platforms')]).then(function (v) {
      var reg = (v[1].registry || {}), pl = reg.platforms || [], vend = 0, vendLive = 0, opLive = 0;
      pl.forEach(function (p) {
        (p.trust_anchors || []).forEach(function (a) {
          if (p.family === 'operator_vouched') { if (!a.provisional) opLive++; } else { vend++; if (!a.provisional) vendLive++; }
        });
      });
      fill('device', [['listed devices', g(v[0].count)], ['hardware platforms', g(pl.length)], ['families', g((reg.families || []).length)],
        ['vendor anchors published', g(vendLive) + ' of ' + g(vend)], ['operator anchors', g(opLive)]]);
    }).catch(function () {});
    j('/v1/enlist').then(function (e) {
      fill('tier', [{ q: e.principle }, { q: e.reads }]);
    }).catch(function () {});
    j('/v1/scoreboard').then(function (s) {
      var t = (s.tests || []), by = {};
      t.forEach(function (x) { by[x.id] = x; });
      var lr = by.longrun || t[0], cp = by.compaction;
      fill('score', [['turn', g(s.turn)], ['models', (s.models || []).length], ['running', s.running ? 'yes' : 'no'],
        lr ? { q: lr.headline } : null, lr && lr.costs_us ? { q: lr.costs_us } : null, cp ? { q: cp.headline } : null]);
    }).catch(function () {});
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px' });
    io.observe(root);
  } else start();
})();
