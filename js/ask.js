/* ask.js: ask the world, the way @emem answers inside ChatGPT or Claude.
 *
 * POST /v1/ask with Accept: text/event-stream. Each stage arrives as it completes
 * (located, routed, recalled, scored, answer); the readings are signed facts, not a
 * workflow someone wrote; the final receipt is verified here with the reference core.
 * One asker streams into whichever panel asked: the decode section's form, or a sample's
 * popup (js/pop.js), where "ask @emem here" answers without leaving the sample.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  if (!window.vx) return;
  function age(s) { var d = s / 86400; return d < 1 ? Math.round(s / 3600) + ' h' : d < 60 ? Math.round(d) + ' d' : Math.round(d / 30) + ' mo'; }
  function short(b) { return String(b).split('.').pop().replace(/_/g, ' '); }

  // out: { log, reads, ans } elements; the asker writes only there
  function Asker(out) { this.out = out; this.ctl = null; this.t0 = 0; }
  Asker.prototype.line = function (v, n, kv, state, ms) {
    var li = document.createElement('li'); li.className = 'is-' + (state || 'ok');
    li.innerHTML = '<b class="v"></b><span class="n"></span>'; li.firstChild.textContent = v; li.children[1].textContent = n;
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; var i = document.createElement('i'); i.className = 'kv'; i.innerHTML = '<span class="k"></span><span class="x"></span>'; i.firstChild.textContent = k; i.lastChild.textContent = kv[k]; li.appendChild(i); });
    if (ms != null) { var e = document.createElement('em'); e.textContent = (ms / 1000).toFixed(1) + ' s'; li.appendChild(e); }
    this.out.log.appendChild(li); return li;
  };
  Asker.prototype.stage = function (j) {
    var d = j.detail || {}, ms = j.at_ms, o = this.out, self = this;
    if (j.stage === 'located') { var p = d.place_resolved || {}; this.line('locate', p.label || 'place', { cell: d.cell }, 'ok', ms); }
    else if (j.stage === 'routed') this.line('route', 'the question', { topics: (d.topics || []).slice(0, 4).join(', ') }, 'ok', ms);
    else if (j.stage === 'recalled') this.line('recall', 'signed facts', { facts: j.grounded_total, bands: (d.bands || []).length }, 'ok', ms);
    else if (j.stage === 'splat') {
      var pts = [], seen = {};
      (d.layers || []).forEach(function (L) { (L.points || []).forEach(function (p) { if (typeof p.value === 'number') pts.push(p); }); });
      o.reads.innerHTML = '';
      pts.filter(function (p) { var k = short(p.band) + '|' + (+p.value).toPrecision(3); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 9).forEach(function (p) {
        var li = document.createElement('li'), u = p.unit && p.unit !== 'unitless' && !/_/.test(p.unit) ? ' ' + p.unit : '';
        li.innerHTML = '<b></b> <span></span>';
        li.firstChild.textContent = short(p.band); li.lastChild.textContent = (Math.abs(p.value) >= 100 ? p.value.toFixed(0) : +p.value.toPrecision(3)) + u + (p.age_s ? ' · ' + age(p.age_s) + ' ago' : '');
        o.reads.appendChild(li);
      });
    }
    else if (j.stage === 'scored') this.line('score', 'derived values', { evaluated: d.evaluated, produced: d.produced_a_value }, 'ok', ms);
    else if (j.stage === 'answer') {
      var full = String(d.answer || '').replace(/\s*\(\+\d+ more signed readings\)/, '');
      o.ans.textContent = full.length > 330 ? full.slice(0, full.lastIndexOf(',', 330)) + ' …' : full;
      if (full.length > 330) { var mo = document.createElement('button'); mo.type = 'button'; mo.className = 'lk'; mo.textContent = ' read all'; mo.onclick = function () { o.ans.textContent = full; }; o.ans.appendChild(mo); }
      var rc = d.receipt, v = rc && ememVerify.verifyReceipt(rc);
      this.line('verify', 'the answer’s receipt', { ed25519: v && v.ok ? 'valid' : 'unchecked', facts: (d.fact_cids || []).length }, v && v.ok ? 'ok' : 'skip', performance.now() - self.t0);
      var st = ((d.reasoning || {}).states || []).slice(-1)[0];
      if (st) this.line('cite', 'this answer', { state: st.state.slice(0, 30) + '…' }, 'ok');
    }
    else if (j.stage === 'failed') this.line('stop', 'ask', { why: d.message || d.error || 'the responder could not answer' }, 'fail', ms);
  };
  Asker.prototype.stop = function () { if (this.ctl) this.ctl.abort(); this.ctl = null; };
  // resolves when the answer has streamed in (or the ask stopped); true when an answer arrived
  Asker.prototype.ask = async function (q, place) {
    this.stop();
    var ctl = this.ctl = new AbortController(), o = this.out, self = this, got = false; this.t0 = performance.now();
    o.log.innerHTML = ''; o.ans.textContent = ''; o.reads.innerHTML = '';
    var wait = this.line('ask', '@emem', { q: q, place: place }, 'run');
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
          try { var j = JSON.parse(data); if (j.stage === 'answer') got = true; self.stage(j); } catch (e) {}
        });
      }
    } catch (e) {
      if (e.name === 'AbortError') return false;
      if (wait.className === 'is-run') wait.className = 'is-fail';
      this.line('stop', 'ask', { why: vx.why(e, 'emem.dev') }, 'fail');
    }
    if (this.ctl === ctl) this.ctl = null;
    return got;
  };
  window.vxAsk = function (out) { return new Asker(out); };

  // the decode section's own form
  var root = document.getElementById('decode');
  if (!root) return;
  var form = root.querySelector('.ask-form'), idle = root.querySelector('.ask-idle');
  if (!form) return;
  var A = new Asker({ log: root.querySelector('.ask-out .vlog'), ans: root.querySelector('.ask-ans'), reads: root.querySelector('.ask-reads') });
  function go(q, p) { if (idle) idle.hidden = true; A.ask(q, p); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = form.q.value.trim(), p = form.place.value.trim();
    if (q && p) go(q, p);
  });
  root.querySelectorAll('[data-q]').forEach(function (b) {
    b.addEventListener('click', function () { form.q.value = b.getAttribute('data-q'); form.place.value = b.getAttribute('data-p'); go(form.q.value, form.place.value); });
  });
  // the first time the panel is seen, it asks the question already in the form, so it never sits empty
  var out = root.querySelector('.ask-out'), asked = false;
  form.addEventListener('submit', function () { asked = true; });
  if (out && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return; io.disconnect();
      if (!asked && idle && !idle.hidden) { asked = true; go(form.q.value.trim(), form.place.value.trim()); }
    }, { threshold: 0.35 });
    io.observe(out);
  }
})();
