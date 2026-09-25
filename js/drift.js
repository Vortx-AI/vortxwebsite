/* drift.js: catch a number an agent got wrong, before a person reads it.
 *
 * A draft cites a token and states a number. emem answers two questions, live:
 *   guard   POST /v1/guard/verdict  would this draft pass? a signed allow or deny, with the reason code and the fix
 *   echo    POST /v1/echo_verify    is the number the one signed: verbatim, rounded, or wrong?
 * and this page checks the echo's receipt itself (ed25519, and that it names the fact).
 * The fact is the Cubbon Park reading the hero decodes, unless the hero has decoded another.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('drift');
  if (!root || !window.vx) return;
  var EMEM = 'https://emem.dev', form = root.querySelector('form'), ta = root.querySelector('textarea'), log = root.querySelector('.vlog');
  var TOKEN = root.getAttribute('data-token');
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function line(v, n, kv, st, where) {
    var li = el('li', 'is-' + (st || 'ok')); li.appendChild(el('b', 'v', v)); li.appendChild(el('span', 'n', n));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; var i = el('i', 'kv'); i.appendChild(el('span', 'k', k)); i.appendChild(el('span', 'x', String(kv[k]))); li.appendChild(i); });
    if (where) li.appendChild(el('em', null, where));
    log.appendChild(li);
  }
  async function post(path, body) {
    var r = await fetch(EMEM + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('emem.dev answered ' + r.status);
    return r.json();
  }
  function draft(value) { return 'Cubbon Park in Bengaluru has an NDVI of ' + value + ' [' + TOKEN + ']'; }
  async function check(text) {
    log.innerHTML = '';
    var tok = (text.match(/emem:fact:[A-Za-z0-9.]+:[a-z2-7]{52}/) || [])[0];
    var num = (text.replace(/\[[^\]]*\]/g, ' ').match(/-?\d+(?:\.\d+)?/) || [])[0];
    if (!tok || !num) { line('stop', 'the draft', { why: !tok ? 'cite an emem:fact: token in it' : 'state a number in it' }, 'fail'); return; }
    line('read', 'the draft', { number: num, token: tok.slice(0, 34) + '…' }, 'info', 'this browser');
    try {
      var g = await post('/v1/guard/verdict', { texts: [text] });
      line('guard', 'would it pass?', { verdict: g.action, code: g.code || '', fix: g.fix || '' }, g.action === 'allow' ? 'ok' : 'fail', 'emem.dev');
      var e = await post('/v1/echo_verify', { token: tok, claimed_value: num });
      var said = e.matches ? 'verbatim ✓' : e.drift === 'rounded' ? 'rounded' : 'a different number';
      line('echo', 'is it the signed number?', { wrote: num, signed: e.resolved_value_verbatim, verdict: said }, e.matches ? 'ok' : e.drift === 'rounded' ? 'warn' : 'fail', 'emem.dev');
      var v = e.receipt ? ememVerify.verifyReceipt(e.receipt) : { ok: false }, bound = v.ok && (e.receipt.fact_cids || []).indexOf(tok.split(':').pop()) >= 0;
      line('verify', 'the answer itself', { receipt: v.ok ? 'ed25519 ✓' : 'INVALID', names: bound ? 'this fact ✓' : 'NO' }, bound ? 'ok' : 'fail', 'this browser');
    } catch (err) { line('stop', 'check', { why: vx.why(err, 'emem.dev') }, 'fail'); }
  }
  form.addEventListener('submit', function (ev) { ev.preventDefault(); check(ta.value); });
  root.querySelectorAll('[data-claim]').forEach(function (b) {
    b.addEventListener('click', function () { ta.value = draft(b.getAttribute('data-claim')); check(ta.value); });
  });
  ta.value = draft('0.81');
  // run the first check once it is on screen, so the section shows a real verdict
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); check(ta.value); } }, { rootMargin: '100px' });
    io.observe(root);
  }
})();
