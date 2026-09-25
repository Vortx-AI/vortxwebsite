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
  var EMEM = 'https://emem.dev', form = root.querySelector('form'), ta = root.querySelector('textarea'), log = root.querySelector('.vlog'), say = root.querySelector('.drift-say');
  // emem's codes, in words; the code itself is still printed, verbatim
  var WORDS = { PROV_VALUE: 'the number is not the one signed', correct_value: 'quote the signed value' };
  function verdict(cls, head, rest) {
    if (!say) return;
    say.className = 'drift-say ' + cls; say.textContent = '';
    say.appendChild(el('b', null, head)); if (rest) say.appendChild(document.createTextNode(' ' + rest));
  }
  var TOKEN = root.getAttribute('data-token');
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function line(v, n, kv, st, where) {
    var li = el('li', 'is-' + (st || 'ok')); li.appendChild(el('b', 'v', v)); li.appendChild(el('span', 'n', n));
    Object.keys(kv || {}).forEach(function (k) { if (kv[k] == null || kv[k] === '') return; li.appendChild(vx.kv(k, kv[k])); });
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
    log.innerHTML = ''; verdict('', 'checking…', '');
    var tok = (text.match(/emem:fact:[A-Za-z0-9.]+:[a-z2-7]{52}/) || [])[0];
    var num = (text.replace(/\[[^\]]*\]/g, ' ').match(/-?\d+(?:\.\d+)?/) || [])[0];
    if (!tok || !num) { var need = !tok ? 'cite an emem:fact: token in it' : 'state a number in it'; line('stop', 'the draft', { why: need }, 'fail'); verdict('is-off', 'nothing to check:', need); return; }
    line('read', 'the draft', { number: num, token: tok.slice(0, 34) + '…' }, 'info', 'this browser');
    try {
      // a wrong number stopped here is the check working: marked as caught, not as a fault
      var g = await post('/v1/guard/verdict', { texts: [text] });
      line('guard', 'would it pass?', { verdict: g.action, code: g.code || '', fix: g.fix || '' }, g.action === 'allow' ? 'ok' : 'warn', 'emem.dev');
      var e = await post('/v1/echo_verify', { token: tok, claimed_value: num });
      var said = e.matches ? 'verbatim ✓' : e.drift === 'rounded' ? 'rounded' : 'a different number';
      line('echo', 'is it the signed number?', { wrote: num, signed: e.resolved_value_verbatim, verdict: said }, e.matches ? 'ok' : 'warn', 'emem.dev');
      var v = e.receipt ? ememVerify.verifyReceipt(e.receipt) : { ok: false }, bound = v.ok && (e.receipt.fact_cids || []).indexOf(tok.split(':').pop()) >= 0;
      line('verify', 'the answer itself', { receipt: v.ok ? 'ed25519 ✓' : 'INVALID', names: bound ? 'this fact ✓' : 'NO' }, bound ? 'ok' : 'fail', 'this browser');
      if (!bound) verdict('is-bad', 'not trusted:', 'the answer’s own signature did not check out here');
      else if (e.matches) verdict('is-ok', 'passes ✓', 'the draft quotes the signed value, ' + e.resolved_value_verbatim + ', verbatim');
      else if (g.action !== 'allow') verdict('is-caught', 'caught ✓', 'the draft says ' + num + '; the signed value is ' + e.resolved_value_verbatim + '. The guard stops it before a person reads it: ' + (WORDS[g.code] || g.code || 'denied') + (g.fix ? ', so ' + (WORDS[g.fix] || g.fix) : '') + '.');
      else verdict('is-caught', 'caught: rounded', 'the draft says ' + num + '; the signed value is ' + e.resolved_value_verbatim + '. The guard lets it through; the echo marks it rounded, so an agent that needs the exact number knows.');
    } catch (err) { line('stop', 'check', { why: vx.why(err, 'emem.dev') }, 'fail'); verdict('is-off', 'not checked:', vx.why(err, 'emem.dev')); }
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
