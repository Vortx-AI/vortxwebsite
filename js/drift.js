/* drift.js: catch a number an agent got wrong, before a person reads it.
 *
 * A draft cites a token and states a number. emem answers two questions, live:
 *   guard   POST /v1/guard/verdict  would this draft pass? a signed allow or deny, with the reason code and the fix
 *   echo    POST /v1/echo_verify    is the number the one signed: verbatim, rounded, or wrong?
 * and this page checks the echo's receipt itself (ed25519, and that it names the fact).
 * Two drafts are checked side by side as the section comes into view: one that paraphrased (0.81, or the
 * rounded 0.767 on request) and one that cited the signed value verbatim. A third box takes any draft.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('drift');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev', TOKEN = root.getAttribute('data-token');
  // emem's codes, in words; the code itself is still printed, verbatim, in the steps
  var WORDS = { PROV_VALUE: 'the number is not the one signed', correct_value: 'quote the signed value' };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function draft(value) { return 'Cubbon Park in Bengaluru has an NDVI of ' + value + ' [' + TOKEN + ']'; }
  async function post(path, body) {
    var r = await fetch(EMEM + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('emem.dev answered ' + r.status);
    return r.json();
  }

  // one box: where its verdict and its steps are written
  function Box(node) { this.node = node; this.say = node.querySelector('.drift-say'); this.log = node.querySelector('.drift-log'); this.gen = 0; }
  Box.prototype.verdict = function (cls, head, rest) {
    var s = this.say; if (!s) return;
    s.className = 'drift-say ' + cls; s.textContent = '';
    s.appendChild(el('b', null, head)); if (rest) s.appendChild(document.createTextNode(' ' + rest));
  };
  Box.prototype.line = function (v, n, kv, st, where) {
    if (!this.log) return;
    var li = el('li', 'is-' + (st || 'ok')); li.appendChild(el('b', 'v', v)); li.appendChild(el('span', 'n', n));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; li.appendChild(vx.kv(k, kv[k])); });
    if (where) li.appendChild(el('em', null, where));
    this.log.appendChild(li);
  };
  Box.prototype.check = async function (text) {
    var g = ++this.gen, self = this, live = function () { return g === self.gen; };
    if (this.log) this.log.innerHTML = '';
    this.node.removeAttribute('data-v');
    this.verdict('is-run', 'Checking…', 'asking emem.dev');
    var tok = (text.match(/emem:fact:[A-Za-z0-9.]+:[a-z2-7]{52}/) || [])[0];
    var num = (text.replace(/\[[^\]]*\]/g, ' ').match(/-?\d+(?:\.\d+)?/) || [])[0];
    if (!tok || !num) { var need = !tok ? 'cite an emem:fact: token in it' : 'state a number in it'; this.line('stop', 'the draft', { why: need }, 'fail'); this.verdict('is-off', 'Nothing to check:', need + '.'); return; }
    this.line('read', 'the draft', { number: num, token: tok.slice(0, 34) + '…' }, 'info', 'this browser');
    try {
      // a wrong number stopped here is the check working: marked as caught, not as a fault
      var gv = await post('/v1/guard/verdict', { texts: [text] }); if (!live()) return;
      this.line('guard', 'would it pass?', { verdict: gv.action, code: gv.code || '', fix: gv.fix || '' }, gv.action === 'allow' ? 'ok' : 'warn', 'emem.dev');
      var e = await post('/v1/echo_verify', { token: tok, claimed_value: num }); if (!live()) return;
      var said = e.matches ? 'verbatim ✓' : e.drift === 'rounded' ? 'rounded' : 'a different number';
      // the quoted number, the card's mark and its title take what it turned out to be: signed, rounded, or wrong
      var kind = e.matches ? 'ok' : e.drift === 'rounded' ? 'rounded' : 'wrong';
      this.node.setAttribute('data-v', kind);
      var h = this.node.querySelector('h3');
      if (h && this.node.hasAttribute('data-case')) {
        h.querySelector('i').textContent = { ok: '✓', rounded: '≈', wrong: '✕' }[kind];
        var t = h.querySelector('span'); if (t) t.textContent = { ok: 'An agent, citing', rounded: 'An agent, rounding', wrong: 'An agent, paraphrasing' }[kind];
      }
      this.line('echo', 'is it the signed number?', { wrote: num, signed: e.resolved_value_verbatim, verdict: said }, e.matches ? 'ok' : 'warn', 'emem.dev');
      var v = e.receipt ? ememVerify.verifyReceipt(e.receipt) : { ok: false }, bound = v.ok && (e.receipt.fact_cids || []).indexOf(tok.split(':').pop()) >= 0;
      this.line('verify', 'the answer itself', { receipt: v.ok ? 'ed25519 ✓' : 'INVALID', names: bound ? 'this fact ✓' : 'NO' }, bound ? 'ok' : 'fail', 'this browser');
      if (!bound) this.verdict('is-bad', 'Not trusted:', 'the answer’s own signature did not check out here.');
      else if (e.matches) this.verdict('is-ok', 'Passes ✓', 'The number is the one signed, ' + e.resolved_value_verbatim + ', quoted verbatim. Anyone can check the signature, offline, with no key.');
      else if (gv.action !== 'allow') this.verdict('is-bad', 'Blocked ✕', 'The draft says ' + num + '; the signed value is ' + e.resolved_value_verbatim + '. emem’s guard stops the draft before a person reads it: ' + (WORDS[gv.code] || gv.code || 'denied') + (gv.fix ? ', so ' + (WORDS[gv.fix] || gv.fix) : '') + '.');
      else this.verdict('is-caught', 'Flagged ≈', 'The draft says ' + num + '; the signed value is ' + e.resolved_value_verbatim + '. The guard lets a rounding through, and the echo marks it rounded, so an agent that needs the exact number knows.');
    } catch (err) { if (!live()) return; this.line('stop', 'check', { why: vx.why(err, 'emem.dev') }, 'fail'); this.verdict('is-off', 'Not checked:', vx.why(err, 'emem.dev') + '.'); }
  };

  // the two drafts, side by side
  var cases = [].slice.call(root.querySelectorAll('[data-case]')).map(function (a) {
    var b = new Box(a), mark = a.querySelector('[data-case-v]');
    b.run = function () { b.check(draft(a.getAttribute('data-case'))); };
    a.querySelectorAll('[data-claim]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = btn.getAttribute('data-claim');
        a.setAttribute('data-case', c); if (mark) mark.textContent = c;
        a.querySelectorAll('[data-claim]').forEach(function (o) { o.setAttribute('aria-pressed', o === btn ? 'true' : 'false'); });
        b.run();
      });
    });
    return b;
  });
  // and any draft of your own
  var own = root.querySelector('.case-own'), form = own && own.querySelector('form'), ta = own && own.querySelector('textarea');
  if (form && ta) {
    var ob = new Box(own);
    ta.value = draft('0.767');
    form.addEventListener('submit', function (ev) { ev.preventDefault(); ob.check(ta.value); });
  }
  // both drafts are checked once they are on screen, so the section shows real verdicts, not a promise
  function start() { cases.forEach(function (b) { b.run(); }); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '100px' });
    io.observe(root);
  } else start();
})();
