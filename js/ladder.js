/* ladder.js: verbs before prose. Every verb on vortx.ai means one thing; click one to read it.
 *
 *   rung 0  the line as shown: verb, noun, fact, picture
 *   rung 1  what the verb (or a term: in a log line, or marked data-term in the text) means, from the site's words
 *   rung 2  every word, in the note itself
 *
 * The words live in one note, served at /prose/<cid>.md and named by its own hash: base32 of the
 * first 16 bytes of its blake3, the way emem names a note. A page carries only that name
 * (<html data-words>), a few dozen bytes. The note is fetched the first time someone asks for a
 * meaning, hashed here, and shown only if the bytes match the name: the page hands you a token,
 * not the prose, and you decode it when you need it. tools/gen_words.py keeps the name current
 * and fails CI when a verb on the site has no meaning.
 */
/* global vx */
(function () {
  'use strict';
  var cid = document.documentElement.getAttribute('data-words');
  if (!cid || !window.fetch) return;
  var URL_ = '/prose/' + cid + '.md', note = null, pop = null, at = null;
  var NOT = 'a, button, summary, label, select, input, textarea, .btn, .chip';

  // the note, read once: groups of ### entries, each with its aliases
  function words() {
    if (note) return note;
    note = fetch(URL_).then(function (r) { if (!r.ok) throw new Error('vortx.ai answered ' + r.status); return r.arrayBuffer(); }).then(function (buf) {
      var u8 = new Uint8Array(buf), named = window.vx && vx.cid26 ? vx.cid26(u8) === cid : null;
      var verbs = {}, terms = {}, group = '', e = null;
      var put = function () { if (!e) return; e.text = e.lines.join(' '); var m = e.group === 'terms' ? terms : verbs; [e.name].concat(e.also).forEach(function (k) { m[k] = e; }); e = null; };
      new TextDecoder().decode(u8).split('\n').forEach(function (l) {
        if (l.indexOf('## ') === 0) { put(); group = l.slice(3).trim(); }
        else if (l.indexOf('### ') === 0) { put(); e = { name: l.slice(4).trim().toLowerCase(), group: group, lines: [], also: [] }; }
        else if (e && l.indexOf('also:') === 0) e.also = l.slice(5).split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
        else if (e && l.trim()) e.lines.push(l.trim());
      });
      put();
      if (named) mark(terms);
      return { verbs: verbs, terms: terms, named: named, size: u8.length };
    });
    note.catch(function () { note = null; });
    return note;
  }
  // once the words are in, the terms a log line uses become readable too
  var known = null;
  function mark(terms) {
    known = terms;
    document.querySelectorAll('.kv .k').forEach(function (k) { if (terms[k.textContent.trim().toLowerCase()]) k.classList.add('is-word'); });
  }
  new MutationObserver(function (ms) {
    if (!known) return;
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.querySelectorAll) n.querySelectorAll('.kv .k').forEach(function (k) { if (known[k.textContent.trim().toLowerCase()]) k.classList.add('is-word'); }); }); });
  }).observe(document.body, { childList: true, subtree: true });

  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function close() { if (pop) { pop.remove(); pop = null; } if (at) { at.classList.remove('is-asked'); at = null; } }
  function place(target) {
    var r = target.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
    pop.style.width = w + 'px';
    var x = Math.max(12, Math.min(r.left, innerWidth - w - 12)), below = r.bottom + 8, h = pop.offsetHeight;
    pop.style.left = x + 'px';
    pop.style.top = (below + h > innerHeight - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : below) + 'px';
  }
  function show(target, word, kind) {
    close();
    at = target; at.classList.add('is-asked');
    pop = el('div', 'ld-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'What “' + word + '” means');
    var head = el('p', 'ld-w'); head.appendChild(el('b', kind === 'term' ? 'ld-t' : 'v', word)); pop.appendChild(head);
    var m = el('p', 'ld-m', 'reading the site’s words…'); pop.appendChild(m);
    var src = el('p', 'ld-s'); pop.appendChild(src);
    (target.closest('dialog[open]') || document.body).appendChild(pop); place(target); // a modal dialog is its own top layer
    words().then(function (W) {
      if (!pop || at !== target) return;
      if (W.named === false) { m.textContent = '✗ the words note does not hash to its name, so no meaning is shown'; m.className = 'ld-m is-bad'; return; }
      var e = (kind === 'term' ? W.terms[word] || W.verbs[word] : W.verbs[word] || W.terms[word]) || (kind === 'term' && /s$/.test(word) && W.terms[word.slice(0, -1)]);
      m.textContent = e ? e.text : 'no meaning for “' + word + '” in the site’s words yet';
      src.textContent = '';
      src.appendChild(document.createTextNode((W.named ? '✓ ' : '') + 'the site’s words · ' + (W.size / 1024).toFixed(1) + ' kB, fetched once · ' + (W.named ? 'named by its blake3, checked here' : 'not checked here') + ' · '));
      var a = el('a', 'lk', 'every word'); a.href = URL_; src.appendChild(a);
      if (W.named) src.classList.add('is-ok');
      place(target);
    }, function (err) {
      if (!pop || at !== target) return;
      m.textContent = 'not reached: ' + (window.vx && vx.why ? vx.why(err, 'vortx.ai') : 'vortx.ai did not answer'); m.className = 'ld-m is-off';
    });
  }

  document.addEventListener('click', function (e) {
    if (pop && pop.contains(e.target)) return;
    var t = e.target.closest && e.target.closest('.v, .kv .k.is-word, [data-term]');
    if (!t || (!t.classList.contains('k') && t.closest(NOT)) || t.closest('.ld-pop')) { close(); return; }
    var word = (t.getAttribute('data-term') || t.textContent).trim().toLowerCase();
    if (!word || /^emem:/.test(word)) { close(); return; }
    if (at === t) { close(); return; }
    show(t, word, t.classList.contains('k') || t.hasAttribute('data-term') ? 'term' : 'verb');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // what reading costs: this page as text, against the top rung an agent can start from, and the words it
  // fetches only on demand (about four characters a token; the sizes are pinned by tools/gen_words.py)
  function tok(n) { n = Math.round(n / 4); return n < 1000 ? String(n) : (n / 1000).toFixed(1) + 'k'; }
  function meter() {
    var foot = document.querySelector('.vx-foot .wrap'), main = document.querySelector('main'); if (!foot || !main || foot.querySelector('.reading')) return;
    var top = +document.documentElement.getAttribute('data-llms-size'), size = +document.documentElement.getAttribute('data-words-size');
    var p = el('p', 'reading'), seg = function (v, parts) { var sp = el('span'); sp.appendChild(el('b', 'v', v)); parts.forEach(function (x) { sp.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); p.appendChild(sp); };
    var a = el('a', 'lk', 'llms.txt'); a.href = '/llms.txt';
    var w = el('a', 'lk', 'the site’s words'); w.href = URL_;
    var n = el('span', null, '…');
    seg('read', [' as an agent: this page ≈ ', n, ' context tokens of text, counted when you reach this line']);
    seg('start', [' at ', a, ', ≈ ' + (top ? tok(top) : '…') + ', then one rung at a time']);
    seg('keep', [' ', w, ' aside, ≈ ' + (size ? tok(size) : '…') + ': a page carries their 26-character name, and decodes them when you click a verb']);
    var base = foot.querySelector('.base'); foot.insertBefore(p, base || null);
    // the live sections fill in as they are seen, so the page is counted when its end is, and again each time
    var count = function () { n.textContent = tok(main.innerText.length); };
    count();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { if (en[0].isIntersecting) count(); }).observe(p);
  }
  setTimeout(function () { (window.requestIdleCallback || setTimeout)(meter); }, 1500);
  addEventListener('scroll', function () { if (pop && at) place(at); }, { passive: true, capture: true });
  addEventListener('resize', close);
})();
