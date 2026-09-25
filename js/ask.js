/* ask.js: ask the world, the way @emem answers inside ChatGPT or Claude.
 *
 * POST /v1/ask with Accept: text/event-stream. Each stage arrives as it completes
 * (located, routed, recalled, scored, answer); the readings are signed facts, not a
 * workflow someone wrote; the final receipt is verified here with the reference core.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('decode');
  if (!root || !window.vx) return;
  var form = root.querySelector('form'), log = root.querySelector('.vlog'), ans = root.querySelector('.ask-ans'), reads = root.querySelector('.ask-reads'), idle = root.querySelector('.ask-idle');
  var ctl = null, t0 = 0;

  function line(v, n, kv, state, ms) {
    var li = document.createElement('li'); li.className = 'is-' + (state || 'ok');
    li.innerHTML = '<b class="v"></b><span class="n"></span>'; li.firstChild.textContent = v; li.children[1].textContent = n;
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; var i = document.createElement('i'); i.className = 'kv'; i.innerHTML = '<span class="k"></span><span class="x"></span>'; i.firstChild.textContent = k; i.lastChild.textContent = kv[k]; li.appendChild(i); });
    if (ms != null) { var e = document.createElement('em'); e.textContent = (ms / 1000).toFixed(1) + ' s'; li.appendChild(e); }
    log.appendChild(li); return li;
  }
  function age(s) { var d = s / 86400; return d < 1 ? Math.round(s / 3600) + ' h' : d < 60 ? Math.round(d) + ' d' : Math.round(d / 30) + ' mo'; }
  function short(b) { return String(b).split('.').pop().replace(/_/g, ' '); }

  function stage(j) {
    var d = j.detail || {}, ms = j.at_ms;
    if (j.stage === 'located') { var p = d.place_resolved || {}; line('locate', p.label || 'place', { cell: d.cell }, 'ok', ms); }
    else if (j.stage === 'routed') line('route', 'the question', { topics: (d.topics || []).slice(0, 4).join(', ') }, 'ok', ms);
    else if (j.stage === 'recalled') line('recall', 'signed facts', { facts: j.grounded_total, bands: (d.bands || []).length }, 'ok', ms);
    else if (j.stage === 'splat') {
      var pts = [];
      (d.layers || []).forEach(function (L) { (L.points || []).forEach(function (p) { if (typeof p.value === 'number') pts.push(p); }); });
      reads.innerHTML = '';
      var seen = {};
      pts.filter(function (p) { var k = short(p.band) + '|' + (+p.value).toPrecision(3); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 9).forEach(function (p) {
        var li = document.createElement('li'), u = p.unit && p.unit !== 'unitless' && !/_/.test(p.unit) ? ' ' + p.unit : '';
        li.innerHTML = '<b></b> <span></span>';
        li.firstChild.textContent = short(p.band); li.lastChild.textContent = (Math.abs(p.value) >= 100 ? p.value.toFixed(0) : +p.value.toPrecision(3)) + u + (p.age_s ? ' · ' + age(p.age_s) + ' ago' : '');
        reads.appendChild(li);
      });
    }
    else if (j.stage === 'scored') line('score', 'derived values', { evaluated: d.evaluated, produced: d.produced_a_value }, 'ok', ms);
    else if (j.stage === 'answer') {
      var env = d || {};
      var full = String(env.answer || '').replace(/\s*\(\+\d+ more signed readings\)/, '');
      ans.textContent = full.length > 330 ? full.slice(0, full.lastIndexOf(',', 330)) + ' …' : full;
      if (full.length > 330) { var mo = document.createElement('button'); mo.type = 'button'; mo.className = 'lk'; mo.textContent = ' read all'; mo.onclick = function () { ans.textContent = full; }; ans.appendChild(mo); }
      var rc = env.receipt, v = rc && ememVerify.verifyReceipt(rc);
      line('verify', 'the answer’s receipt', { ed25519: v && v.ok ? 'valid' : 'unchecked', facts: (env.fact_cids || []).length }, v && v.ok ? 'ok' : 'skip', performance.now() - t0);
      var st = ((env.reasoning || {}).states || []).slice(-1)[0];
      if (st) line('cite', 'this answer', { state: st.state.slice(0, 30) + '…' }, 'ok');
    }
    else if (j.stage === 'failed') line('stop', 'ask', { why: d.message || d.error || 'the responder could not answer' }, 'fail', ms);
  }

  async function ask(q, place) {
    if (ctl) ctl.abort();
    ctl = new AbortController(); t0 = performance.now();
    log.innerHTML = ''; ans.textContent = ''; reads.innerHTML = ''; if (idle) idle.hidden = true;
    var wait = line('ask', '@emem', { q: q, place: place }, 'run');
    try {
      var r = await fetch('https://emem.dev/v1/ask', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ q: q, place: place }) });
      if (!r.ok || !r.body) throw new Error('emem.dev answered ' + r.status);
      wait.className = 'is-ok';
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) {
        var x = await rd.read();
        if (x.done) break;
        buf += dec.decode(x.value, { stream: true });
        var parts = buf.split('\n\n'); buf = parts.pop();
        parts.forEach(function (blk) {
          var data = blk.split('\n').filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).trim(); }).join('');
          if (!data) return;
          try { stage(JSON.parse(data)); } catch (e) {}
        });
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (wait.className === 'is-run') wait.className = 'is-fail';
      line('stop', 'ask', { why: vx.why(e, 'emem.dev') }, 'fail');
    }
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = form.q.value.trim(), p = form.place.value.trim();
    if (q && p) ask(q, p);
  });
  root.querySelectorAll('[data-q]').forEach(function (b) {
    b.addEventListener('click', function () { form.q.value = b.getAttribute('data-q'); form.place.value = b.getAttribute('data-p'); ask(form.q.value, form.place.value); });
  });
})();
