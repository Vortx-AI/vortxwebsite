/* agents.js: many agents, one memory. Three things a visitor checks here, live from emem.dev:
 *   relay    emem's own recording of one signed reading passed 24 hops between two model families, once as
 *            words and once as a token (GET /data/relay-recording.json, drawn as recorded). On request, emem
 *            judges every distinct number the agents wrote (POST /v1/echo_verify, each receipt checked here),
 *            and the token is resolved: its fact's bytes hashed to their name, its receipt verified
 *   note     a note two agents wrote for each other, checked three ways: named by its bytes
 *            (base32(blake3(content)[0:16]) == file_cid), signed by its author (ed25519 over the
 *            emem.memory_write v2 preimage, body_hash == blake3(content)), and in the public log (an RFC 6962
 *            inclusion path over blake3, leaf = blake3(0x00|entry), node = blake3(0x01|l|r), up to the root of
 *            the signed tree head). Change one character and the checks say what broke
 *   channel  who has written to the agent channel (GET /v1/agents): counts and when each was last seen,
 *            never their words, which stay on emem.dev
 * Model output is data: it is printed as text, never as markup, and never followed.
 */
/* global vx, ememVerify */
(function () {
  'use strict';
  var root = document.getElementById('agents');
  if (!root || !window.fetch || !window.vx) return;
  var EMEM = 'https://emem.dev', KEY = '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka';
  var NOTE = '/memories/by_attester/k572x7go/a2a-emem-standard-v2-consolidated-2026-07-19.md';
  var $ = function (s) { return root.querySelector(s); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function get(path, opt) {
    return fetch(EMEM + path, opt).then(function (r) {
      if (!r.ok) { var e = new Error('emem.dev answered ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function post(path, body) { return get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  function why(e) { return vx.why(e, 'emem.dev'); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function ago(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
  }
  // a receipt emem signed, checked here against its pinned key, and bound to the fact it names
  function signed(rc, cid) { var v = rc ? ememVerify.verifyReceipt(rc) : { ok: false }; return !!(v.ok && rc.responder_pubkey_b32 === KEY && (!cid || (rc.fact_cids || []).indexOf(cid) >= 0)); }

  /* ---------- pass it on: the recording, drawn as recorded ---------- */
  var R = null, read = $('[data-hop-read]'), btn = $('[data-relay-check]'), out = $('[data-relay-out]');
  function short(model) { return String(model || '').split('/').pop(); }
  // how far a sentence kept the reading: its number against the signed value, its place against the cell id
  function judge(h, exact, cell) {
    var tail = cell.split('.').slice(1).join('.');
    var place = h.text.indexOf(cell) >= 0 ? 'kept' : tail && h.text.indexOf(tail) >= 0 ? 'cut' : 'gone';
    var v = typeof h.value === 'number' ? h.value : null, value = v === null ? 'none' : v === exact ? 'exact' : 'rounded';
    if (value === 'rounded') { var dp = (String(v).split('.')[1] || '').length, f = Math.pow(10, dp); if (Math.round(v * f) !== Math.round(exact * f)) value = 'wrong'; }
    return { place: place, value: value };
  }
  function lane(key, hops, fill) {
    var ol = $('[data-hops="' + key + '"]'); if (!ol) return;
    ol.textContent = '';
    hops.forEach(function (h) {
      var j = fill(h), li = el('li'), b = el('button', 'hop ' + j.cls, String(h.hop));
      b.type = 'button'; b.setAttribute('aria-label', 'Hop ' + h.hop + ', ' + short(h.model) + ': ' + j.label);
      var show = function () {
        if (!read) return;
        read.textContent = '';
        read.appendChild(el('b', null, 'Hop ' + h.hop + ' · ' + short(h.model) + (key === 'words' ? ' wrote' : ' passed on')));
        read.appendChild(document.createTextNode(' ')); read.appendChild(el('q', null, h.text));
        read.appendChild(document.createTextNode(' ')); read.appendChild(el('span', 'hop-j', j.label));
      };
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show); b.addEventListener('click', show);
      li.appendChild(b); ol.appendChild(li);
    });
  }
  function relay() {
    get('/data/relay-recording.json').then(function (d) {
      R = d;
      var exact = d.exact_value, cell = d.cell, words = d.prose_chain || [], toks = d.token_chain || [];
      var fams = []; words.forEach(function (h) { if (fams.indexOf(short(h.model)) < 0) fams.push(short(h.model)); });
      var src = $('[data-relay-src]');
      var band = /^indices\./.test(d.band || '') ? d.band.split('.')[1].toUpperCase() : (d.band || 'one band');
      if (src) src.textContent = 'emem’s own recording, ' + day(d.recorded_at) + ': one signed reading, ' + band + ' at ' + d.place + ', passed between ' + fams.join(' and ') + ', taking turns. Every frame is what the named model wrote, at temperature 0.';
      lane('words', words, function (h) {
        var j = judge(h, exact, cell);
        var cls = j.place !== 'kept' ? 'is-lost' : j.value === 'exact' ? 'is-ok' : 'is-drift';
        var label = (h.value != null ? String(h.value) : 'no number') + (j.value === 'exact' ? ', exact' : j.value === 'rounded' ? ', rounded' : j.value === 'wrong' ? ', wrong' : '') + (j.place === 'kept' ? '; place kept' : j.place === 'cut' ? '; the place lost part of its name' : '; no place at all');
        return { cls: cls, label: label };
      });
      lane('token', toks, function (h) {
        var ok = h.token_intact === true && h.text.indexOf(d.token) >= 0;
        return { cls: ok ? 'is-ok' : 'is-lost', label: ok ? 'the token, intact' : 'the token, broken' };
      });
      // what happened to the words, found in the recording itself, not typed here
      var first = function (f) { for (var i = 0; i < words.length; i++) if (f(words[i])) return words[i]; return null; };
      var r1 = first(function (h) { return typeof h.value === 'number' && h.value !== exact; });
      var r3 = first(function (h) { return typeof h.value === 'number' && (String(h.value).split('.')[1] || '').length <= 3; });
      var cut = first(function (h) { return judge(h, exact, cell).place === 'cut'; });
      var gone = first(function (h) { return judge(h, exact, cell).place === 'gone'; });
      var said = [];
      if (r1) said.push(String(exact) + ' became ' + r1.value + ' at hop ' + r1.hop + (r3 && r3 !== r1 ? ' and ' + r3.value + ' at hop ' + r3.hop : '') + '.');
      if (cut || gone) said.push('The place ' + (cut ? 'lost part of its name at hop ' + cut.hop : '') + (cut && gone ? ' and ' : '') + (gone ? 'was gone by hop ' + gone.hop : '') + '.');
      var sw = $('[data-lane-say="words"]'); if (sw) sw.textContent = said.length ? said.join(' ') : 'every hop kept the reading.';
      var intact = toks.filter(function (h) { return h.token_intact === true && h.text.indexOf(d.token) >= 0; }).length;
      var st = $('[data-lane-say="token"]'); if (st) st.textContent = (intact === toks.length ? 'intact at all ' + toks.length + ' hops' : 'intact at ' + intact + ' of ' + toks.length + ' hops') + '; it names ' + String(d.fact_cid).slice(0, 8) + '…, the signed fact.';
      if (btn) btn.disabled = false;
    }).catch(function (e) { if (read) read.textContent = 'The recording did not load: ' + why(e) + '. It lives at emem.dev/data/relay-recording.json.'; });
  }
  function relayCheck() {
    if (!R || !btn) return;
    btn.disabled = true; out.textContent = 'asking emem…';
    var seen = {}, vals = [];
    (R.prose_chain || []).forEach(function (h) { if (typeof h.value === 'number' && !seen[h.value]) { seen[h.value] = 1; vals.push(String(h.value)); } });
    var echo = vals.map(function (v) { return post('/v1/echo_verify', { token: R.token, claimed_value: v }).then(function (j) { return { v: v, j: j }; }); });
    var tok = post('/v1/echo_verify', { token: R.token, claimed_value: String(R.exact_value) });
    var bytes = fetch(EMEM + '/v1/facts/' + R.fact_cid, { headers: { accept: 'application/cbor' } }).then(function (r) { if (!r.ok) throw new Error('emem.dev answered ' + r.status); return r.arrayBuffer(); });
    Promise.all([Promise.all(echo), tok, bytes]).then(function (r) {
      out.textContent = '';
      var w = el('p', 'rc-line'); w.appendChild(el('b', null, 'emem on the words'));
      r[0].forEach(function (x) {
        var d = x.j.matches ? 'matches' : (x.j.drift || 'wrong'), ok = signed(x.j.receipt, R.fact_cid);
        var s = el('span', 'rc-v is-' + (x.j.matches ? 'ok' : d === 'rounded' ? 'drift' : 'bad'), '“' + x.v + '” ' + d + (ok ? ' · signed ✓' : ' · receipt unchecked'));
        w.appendChild(s);
      });
      out.appendChild(w);
      var t = r[1], hashOk = vx.cid52(new Uint8Array(r[2])) === R.fact_cid, sigOk = signed(t.receipt, R.fact_cid);
      var k = el('p', 'rc-line'); k.appendChild(el('b', null, 'emem on the token'));
      var v = t.resolved_value_verbatim != null ? String(t.resolved_value_verbatim) : '';
      k.appendChild(el('span', 'rc-v is-' + (t.matches && hashOk && sigOk ? 'ok' : 'bad'), v + (t.matches ? ', the value the agents were given' : ', not the value recorded')));
      k.appendChild(el('span', 'rc-v is-' + (hashOk ? 'ok' : 'bad'), hashOk ? 'its bytes hash to its name ✓' : 'its bytes do not hash to its name'));
      k.appendChild(el('span', 'rc-v is-' + (sigOk ? 'ok' : 'bad'), sigOk ? 'signature ✓' : 'signature did not check'));
      out.appendChild(k);
      btn.disabled = false; btn.textContent = 'Check again';
    }).catch(function (e) { out.textContent = 'Not checked just now: ' + why(e) + '.'; btn.disabled = false; });
  }
  if (btn) btn.addEventListener('click', relayCheck);

  /* ---------- a note two agents wrote for each other, checked three ways ---------- */
  var N = null, body = $('[data-note-body]'), checks = $('[data-note-checks]'), tamper = $('[data-note-tamper]');
  function mark(k, st, text) { var li = checks && checks.querySelector('[data-k="' + k + '"]'); if (!li) return; li.className = 'is-' + st; li.querySelector('span').textContent = text; }
  // the memory_write preimage, v2 when the block says so (v1 kept for notes signed before it)
  function author(a, content) {
    if (!a || a.caller_signed !== true || !a.sig_b32 || !a.attester_pubkey_b32 || !a.body_hash_hex) return { ok: null };
    var bodyOk = vx.hex(vx.blake3(vx.enc.encode(content))) === a.body_hash_hex, raw = vx.fromHex(a.body_hash_hex);
    var build = function (v, base) {
      var p = [vx.enc.encode(v === 2 ? 'emem.memory_write.v2|' : 'emem.memory_write|'), vx.enc.encode(a.verb || ''), vx.enc.encode('|'), vx.enc.encode(a.signed_path || ''), vx.enc.encode('|'), raw];
      if (v === 2) { p.push(vx.enc.encode('|')); p.push(vx.enc.encode(base)); }
      return vx.blake3(vx.cat.apply(null, p));
    };
    var tries = a.preimage_version === 2 ? [[2, a.base]] : a.preimage_version === 1 ? [[1, null]] : [[2, 'absent'], [1, null]];
    var sigOk = tries.some(function (t) { return !(t[0] === 2 && typeof t[1] !== 'string') && vx.edVerify(a.sig_b32, build(t[0], t[1]), a.attester_pubkey_b32); });
    return { ok: sigOk && bodyOk, sigOk: sigOk, bodyOk: bodyOk };
  }
  // RFC 6962 inclusion, folded here: the path from this entry's leaf must end at the signed root
  function walk(leaf, m, size, path, rootB32) {
    if (!(m < size)) return false;
    var node = function (l, r) { return vx.blake3(vx.cat(new Uint8Array([1]), l, r)); };
    var fn = m, sn = size - 1, acc = leaf, i = 0;
    while (sn > 0) {
      if (i >= path.length) return false;
      var sib = vx.unb32(path[i++]);
      if (fn % 2 === 1 || fn === sn) { acc = node(sib, acc); while (fn % 2 === 0 && fn !== 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); } }
      else acc = node(acc, sib);
      fn = Math.floor(fn / 2); sn = Math.floor(sn / 2);
    }
    return i === path.length && vx.b32(acc) === rootB32;
  }
  function inLog(entryB32) {
    return get('/v1/log/inclusion?entry_hash=' + encodeURIComponent(entryB32)).then(function (p) {
      var sth = p.sth || {}, headOk = sth.responder_pubkey_b32 === KEY && vx.verifySTH(sth);
      var leaf = vx.blake3(vx.cat(new Uint8Array([0]), vx.unb32(p.entry_hash_b32)));
      var ok = headOk && p.entry_hash_b32 === entryB32 && vx.b32(leaf) === p.leaf_hash_b32 && p.tree_size === sth.tree_size && p.root_b32 === sth.root_b32 &&
        walk(leaf, p.leaf_index, p.tree_size, p.audit_path_b32 || [], p.root_b32);
      return { ok: ok, index: p.leaf_index, size: p.tree_size, steps: (p.audit_path_b32 || []).length };
    });
  }
  function show(content, at) {
    if (!body) return;
    body.textContent = '';
    if (at == null) { body.textContent = content; return; }
    body.appendChild(document.createTextNode(content.slice(0, at)));
    body.appendChild(el('mark', null, content.charAt(at)));
    body.appendChild(document.createTextNode(content.slice(at + 1)));
  }
  function run(content, changed) {
    var nameOk = vx.cid26(vx.enc.encode(content)) === N.file_cid;
    mark('name', nameOk ? 'ok' : 'bad', nameOk ? 'blake3 of these bytes is its name, ' + N.file_cid.slice(0, 8) + '… ✓' : 'these bytes hash to ' + vx.cid26(vx.enc.encode(content)).slice(0, 8) + '…, not to its name');
    var a = author(N.authorship, content), who = (N.authorship && N.authorship.attester_pubkey_b32 || '').slice(0, 8);
    if (a.ok === null) mark('author', 'off', 'this note carries no signature of its writer’s own');
    else mark('author', a.ok ? 'ok' : 'bad', a.ok ? 'ed25519 by ' + who + '…, over exactly these bytes ✓' : a.sigOk ? 'the signature holds, but for other bytes than these' : 'the signature did not check');
    mark('log', 'run', 'folding the path to the signed head…');
    var entry = changed ? vx.b32(vx.blake3(vx.enc.encode(content))) : N.log && N.log.entry_hash_b32;
    if (!entry) { mark('log', 'off', 'no log entry is named for this note'); return; }
    inLog(entry).then(function (r) {
      mark('log', r.ok ? 'ok' : 'bad', r.ok ? 'entry ' + vx.group(r.index) + ' of ' + vx.group(r.size) + ', ' + r.steps + ' hashes to the signed head ✓' : 'the path did not reach the signed head');
    }).catch(function (e) { mark('log', e.status === 404 ? 'bad' : 'off', e.status === 404 ? 'the log holds no entry for these bytes' : 'not checked just now: ' + why(e)); });
  }
  function note() {
    get(NOTE, { headers: { accept: 'application/json' } }).then(function (m) {
      if (typeof m.content !== 'string' || !m.file_cid) throw new Error('the note came back without its content');
      N = m; show(m.content); run(m.content, false);
      if (tamper) tamper.disabled = false;
    }).catch(function (e) { mark('name', 'off', 'not checked just now: ' + why(e)); mark('author', 'off', '–'); mark('log', 'off', '–'); });
  }
  if (tamper) tamper.addEventListener('click', function () {
    if (!N) return;
    var on = tamper.getAttribute('aria-pressed') !== 'true';
    tamper.setAttribute('aria-pressed', on ? 'true' : 'false'); tamper.textContent = on ? 'Put it back' : 'Change one character';
    if (!on) { show(N.content); run(N.content, false); return; }
    // the first letter after the title, swapped for its neighbour in the alphabet
    var c = N.content, at = c.search(/\n[^\n#]*[a-z]/); at = at < 0 ? 0 : c.slice(at).search(/[a-z]/) + at;
    var ch = c.charAt(at), sw = ch === 'z' ? 'y' : String.fromCharCode(ch.charCodeAt(0) + 1);
    var t = c.slice(0, at) + sw + c.slice(at + 1);
    show(t, at); run(t, true);
  });

  /* ---------- the channel: who writes, and when, never what ---------- */
  function channel() {
    get('/v1/agents').then(function (d) {
      var a = Array.isArray(d.agents) ? d.agents : [];
      var put = function (k, v) { var e = $('[data-chan="' + k + '"]'); if (e) e.textContent = vx.group(v); };
      put('agents', typeof d.count === 'number' ? d.count : a.length);
      put('notes', a.reduce(function (n, x) { return n + (+x.notes || 0); }, 0));
      put('signed', a.reduce(function (n, x) { return n + (+x.caller_signed_notes || 0); }, 0));
      var ol = $('[data-chan-recent]'); if (!ol) return;
      ol.textContent = '';
      a.slice(0, 5).forEach(function (x) {
        var li = el('li');
        li.appendChild(el('code', null, x.prefix));
        li.appendChild(el('span', null, vx.group(+x.notes || 0) + ' notes'));
        li.appendChild(el('span', x.key_status === 'proven_by_signature' ? 'is-ok' : '', x.key_status === 'proven_by_signature' ? 'key proven by signature' : 'key is emem’s claim'));
        li.appendChild(el('time', null, ago(x.last_seen)));
        ol.appendChild(li);
      });
    }).catch(function (e) { var ol = $('[data-chan-recent]'); if (ol) { ol.textContent = ''; ol.appendChild(el('li', 'is-off', 'The roster did not load: ' + why(e) + '.')); } });
  }

  // all three wait until the chapter is near; nothing here is asked for on a visit that never scrolls this far
  var started = false;
  function go() { if (started) return; started = true; relay(); note(); channel(); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else go();
})();
