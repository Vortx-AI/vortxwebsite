/* mission.js: the plan, with the part of the payload that already runs.
 *   rule      a device's reading counts only inside the device's own signed record of what its computer did
 *             while it captured (emem.os_trace.v1). emem publishes a telescope trace built with a public
 *             throwaway key (GET /v1/verifier_spec, os_trace_v1_device_side.golden_vector); this page sends it
 *             to the stateless verifier as signed (POST /v1/trace_verify), then with one byte changed, prints
 *             the verdict and every reason emem names, and rebuilds the same checks here (vx.checkTrace)
 *   profiles  how many kinds of device the rule knows, and which are in orbit or aimed at the sky, with their
 *             status as emem states it (GET /v1/substrates, registry.substrates[])
 * Nothing here writes; the verifier keeps nothing.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.querySelector('[data-payload]');
  if (!root || !window.fetch || !window.vx) return;
  var EMEM = 'https://emem.dev', gold = null;
  var $ = function (s) { return root.querySelector(s); };
  var out = $('[data-trace-out]'), btns = root.querySelectorAll('[data-trace]');
  function why(e) { return vx.why(e, 'emem.dev'); }
  function get(path, opt) { return fetch(EMEM + path, opt).then(function (r) { if (!r.ok) throw new Error('emem.dev answered ' + r.status); return r.json(); }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // emem-trace's reject reasons (crates/emem-trace/src/verify.rs), said plainly; any other code prints as emem wrote it
  function layerAt(t, seq) { var s = (t.segments || [])[seq]; return s ? s.layer.replace(/_/g, ' ') + ' window' : 'window ' + seq; }
  function reason(x, t) {
    switch (x.code) {
      case 'chain_broken': return x.seq > 0 ? 'the chain breaks at the ' + layerAt(t, x.seq) + ', which carries the fingerprint of the ' + layerAt(t, x.seq - 1) + ' as captured; that window no longer matches it' : 'the first window claims a window before it';
      case 'root_mismatch': return 'the root the device signed no longer matches its windows';
      case 'signature_invalid': return 'the device’s signature does not cover these bytes';
      case 'missing_layer': return 'a layer this kind of device must record is missing: ' + String(x.layer || '').replace(/_/g, ' ');
      case 'output_unbound': return 'the reading is not among the outputs the trace recorded';
      case 'profile_mismatch': return 'the trace names another kind of device';
      case 'schema_mismatch': return 'this is not an emem.os_trace.v1 record';
      case 'admission_not_trace_based': return 'this kind of source is not admitted by trace';
      default: return x.code;
    }
  }
  function mark(ok) { return ok ? ' ✓' : ' ✕'; }
  function say(v, t, changed) {
    out.textContent = '';
    if (changed) out.appendChild(el('span', 'ms-lab-chg', changed + ' '));
    var r = v.report || {}, reasons = Array.isArray(r.reasons) ? r.reasons : [], admit = v.verdict === 'admit';
    out.appendChild(el('b', admit ? 'is-ok' : 'is-bad', admit ? 'emem admits it ✓' : 'emem refuses it ✕'));
    var said = v.error ? String(v.error) : reasons.length ? reasons.map(function (x) { return reason(x, t); }).join('; ') : admit ? 'every check passed: the windows chain, the root rebuilds from them, and the device signed that root' : '';
    if (said) out.appendChild(document.createTextNode('. ' + said.charAt(0).toUpperCase() + said.slice(1) + '.'));
    // the same checks, rebuilt in this browser from the bytes it sent, so neither verdict has to be taken on trust
    var c; try { c = vx.checkTrace(t); } catch (e) { c = null; }
    if (c) {
      var mine = el('span', 'ms-lab-mine');
      mine.textContent = 'Rebuilt in this browser: windows chain' + mark(c.chain) + ' · root from the windows' + mark(c.rootOk) + ' · device signature over its root' + mark(c.sigOk) +
        (admit && r.trace_cid ? ' · trace id ' + (c.cid === r.trace_cid ? 'matches emem’s' + mark(true) : 'differs from emem’s' + mark(false)) : '') +
        (c.sigOk && !c.rootOk ? '. The signature still holds for the root the device signed; these windows no longer rebuild it.' : '');
      out.appendChild(mine);
    }
  }
  function check(mode) {
    if (!gold) return;
    var trace = JSON.parse(JSON.stringify(gold)), changed = '';
    // one byte: a window's event count, one higher, as if its log had been edited after capture (1000 → 1001 is one byte of CBOR)
    if (mode === 'one-byte' && trace.segments && trace.segments[2]) {
      var s = trace.segments[2], was = +s.event_count || 0;
      s.event_count = was + 1;
      changed = 'Changed: the ' + layerAt(trace, 2) + '’s event count, ' + vx.group(was) + ' → ' + vx.group(was + 1) + '.';
    }
    btns.forEach(function (b) { b.disabled = true; });
    out.textContent = 'asking emem’s verifier…';
    get('/v1/trace_verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: trace.device && trace.device.substrate_profile, trace: trace }) })
      .then(function (v) { say(v, trace, changed); }).catch(function (e) { out.textContent = 'Not checked just now: ' + why(e) + '.'; })
      .then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { check(b.getAttribute('data-trace')); }); });
  function start() {
    get('/v1/verifier_spec').then(function (s) {
      var g = s && s.os_trace_v1_device_side && s.os_trace_v1_device_side.golden_vector;
      if (!g || !g.trace) throw new Error('the verifier spec carries no test trace');
      gold = g.trace;
      var p = $('[data-trace-dev]'), n = (gold.segments || []).length;
      if (p) p.textContent = (gold.device && gold.device.substrate_profile) + ', ' + n + ' capture windows, ' + (gold.outputs || []).length + ' reading';
      btns.forEach(function (b) { b.disabled = false; });
    }).catch(function (e) { out.textContent = 'The test trace did not load: ' + why(e) + '.'; });
    get('/v1/substrates').then(function (s) {
      var list = ((s && s.registry && s.registry.substrates) || []).filter(function (x) { return x && x.id; });
      var up = list.filter(function (x) { return /^(orbital|observatory|space)\./.test(x.id); });
      var cand = up.filter(function (x) { return x.status === 'candidate'; }).length;
      var e = $('[data-profiles]');
      if (e && list.length) e.textContent = 'emem knows ' + list.length + ' kinds of device. In orbit or aimed at the sky: ' + (up.length ? up.map(function (x) { return x.id; }).join(', ') : 'none yet') +
        (up.length && cand === up.length ? ', each still a candidate profile' : up.length && cand ? ', ' + cand + ' of them still candidates' : '') + '.';
    }).catch(function () {});
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else start();
})();
