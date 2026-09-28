/* mission.js: the plan, with the part of the payload that already runs.
 *   rule      a device's reading counts only inside the device's own signed record of what its computer did
 *             while it captured (emem.os_trace.v1). emem publishes a telescope trace built with a public
 *             throwaway key (GET /v1/verifier_spec, os_trace_v1_device_side.golden_vector); this page sends it
 *             to the stateless verifier as signed (POST /v1/trace_verify), then with one byte changed, and
 *             prints the verdict and every reason emem names
 *   profiles  how many kinds of device the rule knows, and which of them look up (GET /v1/substrates)
 * Nothing here writes; the verifier keeps nothing.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.querySelector('[data-payload]');
  if (!root || !window.fetch) return;
  var EMEM = 'https://emem.dev', gold = null;
  var $ = function (s) { return root.querySelector(s); };
  var out = $('[data-trace-out]'), btns = root.querySelectorAll('[data-trace]');
  function why(e) { return window.vx ? vx.why(e, 'emem.dev') : 'emem.dev did not answer'; }
  function get(path, opt) { return fetch(EMEM + path, opt).then(function (r) { if (!r.ok) throw new Error('emem.dev answered ' + r.status); return r.json(); }); }
  var WORDS = {
    chain_broken: 'the chain of capture windows is broken', root_mismatch: 'the trace root no longer matches its windows',
    signature_invalid: 'the device’s signature does not cover these bytes', output_unbound: 'the reading is not bound inside the trace',
    profile_mismatch: 'the trace names another kind of device', schema_mismatch: 'not an emem.os_trace.v1 record',
    admission_not_trace_based: 'this kind of source is not admitted by trace'
  };
  function say(v) {
    var r = v.report || {}, reasons = Array.isArray(r.reasons) ? r.reasons : [];
    out.textContent = '';
    var b = document.createElement('b'); b.className = v.verdict === 'admit' ? 'is-ok' : 'is-bad';
    b.textContent = v.verdict === 'admit' ? 'admitted ✓' : 'refused ✕';
    out.appendChild(b);
    var t = reasons.length ? reasons.map(function (x) { return (WORDS[x.code] || x.code) + (x.seq != null ? ' (window ' + x.seq + ')' : ''); }).join('; ') : v.verdict === 'admit' ? 'every check passed: its windows chain, its root rebuilds, its device signed it' : '';
    if (t) out.appendChild(document.createTextNode(' ' + t));
    if (r.trace_cid) { var c = document.createElement('code'); c.textContent = ' emem:trace:' + r.trace_cid.slice(0, 10) + '…'; out.appendChild(c); }
  }
  function check(mode) {
    if (!gold) return;
    var trace = JSON.parse(JSON.stringify(gold));
    // one byte: the third window's event count, one higher, as if a log had been edited after capture
    if (mode === 'one-byte' && trace.segments && trace.segments[2]) trace.segments[2].event_count = (+trace.segments[2].event_count || 0) + 1;
    btns.forEach(function (b) { b.disabled = true; });
    out.textContent = 'asking emem’s verifier…';
    get('/v1/trace_verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: trace.device && trace.device.substrate_profile, trace: trace }) })
      .then(say).catch(function (e) { out.textContent = 'Not checked just now: ' + why(e) + '.'; })
      .then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { check(b.getAttribute('data-trace')); }); });
  function start() {
    get('/v1/verifier_spec').then(function (s) {
      var g = s && s.os_trace_v1_device_side && s.os_trace_v1_device_side.golden_vector;
      if (!g || !g.trace) throw new Error('the verifier spec carries no test trace');
      gold = g.trace;
      var p = $('[data-trace-dev]'); if (p) p.textContent = (gold.device && gold.device.substrate_profile) + ', ' + (gold.segments || []).length + ' windows, ' + ((gold.outputs || []).length) + ' reading';
      btns.forEach(function (b) { b.disabled = false; });
    }).catch(function (e) { out.textContent = 'The test trace did not load: ' + why(e) + '.'; });
    get('/v1/substrates').then(function (s) {
      var list = (s && s.registry && s.registry.substrates) || (s && s.substrates) || [];
      var ids = list.map(function (x) { return typeof x === 'string' ? x : x.id || x.profile || ''; }).filter(Boolean);
      var up = ids.filter(function (id) { return /^(orbital|observatory|space)\./.test(id); });
      var e = $('[data-profiles]');
      if (e && ids.length) e.textContent = 'emem knows ' + ids.length + ' kinds of device; the ones that look up: ' + (up.length ? up.join(', ') : 'none yet') + '.';
    }).catch(function () {});
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else start();
})();
