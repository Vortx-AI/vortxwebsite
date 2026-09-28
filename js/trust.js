/* trust.js: the chain from photon to prompt, each link read live.
 *
 *   build    which code answered: /.well-known/emem.json's operator attestation, its ed25519 checked here over
 *            PreimageV1("emem.operator_attestation.v1"), the commit linked to its public source
 *   log      the transparency log head, signature checked by js/site.js ([data-loghead]), and since the last
 *            visit, a consistency proof folded there too ([data-logsince])
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
      var i;
      if (p.q) { i = document.createElement('q'); i.className = 'said'; i.textContent = p.q; }
      else i = vx.kv(p[0], p[1], el.classList.contains('ch-live') ? ': ' : '=');
      el.appendChild(i);
      el.appendChild(document.createTextNode(' '));
    });
    el.closest('li') && el.closest('li').classList.add('is-live');
  }
  function g(n) { return Number(n).toLocaleString('en-US'); }
  function start() {
    // the running code, signed: every field as its UTF-8 bytes except the key epoch, a u32 big-endian
    j('/.well-known/emem.json').then(function (m) {
      var a = m.operator_attestation || {}, mf = m.manifests || {}, pub = (m.responder || {}).pubkey_b32, e = (+a.key_epoch) >>> 0;
      var u = function (s) { return vx.enc.encode(String(s == null ? '' : s)); };
      var d = vx.preimage('emem.operator_attestation.v1', [[1, u(a.version)], [2, new Uint8Array([e >>> 24 & 255, e >>> 16 & 255, e >>> 8 & 255, e & 255])],
        [3, u(a.attested_at)], [4, u(a.git_commit)], [5, u(a.build_timestamp)], [6, u(a.binary_blake3)], [7, u(mf.bands_cid)], [8, u(mf.registry_cid)]]);
      var ok = pub === '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka' && vx.edVerify(a.signature_b32, d, pub);
      var el = root.querySelector('[data-trust="build"]'); if (!el) return;
      el.innerHTML = '';
      el.appendChild(vx.kv('version', a.version || '?', ': ')); el.appendChild(document.createTextNode(' '));
      var c = document.createElement('a'); c.className = 'lk'; c.target = '_blank'; c.rel = 'noopener';
      c.href = 'https://github.com/Vortx-AI/emem/commit/' + encodeURIComponent(a.git_commit || ''); c.textContent = 'commit ' + String(a.git_commit || '').slice(0, 7);
      el.appendChild(c); el.appendChild(document.createTextNode(' · built ' + (a.build_timestamp || '?') + ' · '));
      var s = document.createElement('span'); s.className = ok ? 'is-ok' : 'is-warn'; s.textContent = ok ? 'signed by emem’s key, checked here ✓' : 'signature not checked'; el.appendChild(s);
      el.appendChild(document.createTextNode(' · the binary’s hash is the operator’s word, not a hardware attestation'));
      el.closest('li') && el.closest('li').classList.add('is-live');
    }).catch(function () {});
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
