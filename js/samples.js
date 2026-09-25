/* samples.js: the catalogue, to the ememdemo standard.
 *
 * Each card is a piece of real-world evidence: its picture, the noun, the verbs applied to it
 * (counted, read from the note itself) and who keeps it. No descriptive prose. Its picture, title
 * and "run it" open it here, in the popup (js/pop.js), where it runs end to end.
 *   line     the live catalogue line (vortx-ai.github.io/ememdemo/llms.txt): verb, kind, size, tok, raw, by
 *   picture  only the image a record's thumb.v1 note carries (data/thumbs.json), never an invented one;
 *            re-checked as it comes into view: the thumb hashes to its name, its of: is this record,
 *            and its image bytes are the file this page shows. Where the site has a sharper picture of
 *            the same file (data/pictures.json, tools/wow_media.py), that one is shown instead, with whose
 *            it is and its licence on it, and re-checked against the name that list gives it
 *   check    the note: base32(blake3(bytes)[0:16]) must equal its name → ✓ note, ✗ name lies, unreachable
 *   verbs    hashed N of M, rooted, placed, stamped …, from the note's own front matter
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('samples');
  if (!root || !window.vx) return;
  var grid = root.querySelector('.sc-grid'), chips = root.querySelector('.sc-f'), more = root.querySelector('[data-more]');
  var NOTE = function (cid) { return 'https://emem.dev/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var GROUP = { earth: 'Earth', disaster: 'Earth', cities: 'Earth', wildlife: 'Earth', mines: 'Earth', government: 'Earth', archives: 'Earth', places: 'Earth',
    space: 'Space', robotics: 'Machines', drones: 'Machines', cameras: 'Machines', gatherings: 'Machines', '3d': 'Machines' };
  var KEEP = { machine: 'machine', 'third-party': 'third party', combined: 'combined', human: 'human' };
  var KEEP_T = { machine: 'signed by a system', 'third party': 'a publisher’s file', combined: 'joined from several', human: 'a person’s file' };
  var filter = root.getAttribute('data-filter') || 'All', items = [], thumbs = {}, pics = {}, expanded = false;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // first, the samples this page already uses: the hero's place, then one per device the run above checks
  var FIRST = ['ia3cqu7ycf455mjs2vue33cnfi', 'twlpco5kin6qlz5eplt2pjm7n4', 'wkxa7tcmw2orf7ujjf5yi66dhe', 'qcoylkllqzfqnsinn4af5i2mi4', 'ejvovl6sz7d3sugfcrwwie4rma', 't7ebh6s6imxrwdmizebnw52nwe'];
  var moreBtn = root.querySelector('[data-more-cards]');

  /* the ememdemo token estimate (emem.mjs count, tok) */
  function count(t) { return Math.max(1, Math.round(1.098 * (t.match(/[A-Za-z]+/g) || []).length + 2.207 * (t.match(/\d+/g) || []).length + 0.569 * (t.match(/[^\w\s]/g) || []).length + 0.325 * (t.match(/\n/g) || []).length)); }
  function tok(n) { return '~' + (n < 1e3 ? Math.round(n) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : n < 1e9 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : (n / 1e9).toFixed(1) + 'B'); }
  function num(s) { var m = String(s || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  function size(s) { return String(s || '').replace(/^(~?[\d.]+)([KMGT]?B)$/, '$1 $2'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function big(x) {
    var k = x.kv;
    if (k.size) return size(k.size);
    if (k.facts) return k.facts + ' facts';
    if (k.n) return k.n + ' cameras';
    if (k.years) return k.years.replace('-', '–');
    if (k.grid) return k.grid.replace('x', '×') + ' squares';
    if (k.steps) return k.steps + ' steps';
    if (k.files) return k.files + ' files';
    if (k.sections) return k.sections + ' sections';
    return x.verb === 'resolve' ? x.kind : 'at source';
  }
  // what the note itself says was done to it
  function verbs(text) {
    var fm = {}, m = text.match(/^---\n([\s\S]*?)\n---/);
    if (m) m[1].split('\n').forEach(function (l) { var i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    var v = [], s = fm.emem || '', n;
    if (s === 'pointer.v1') {
      if ((n = (fm.chunks || '').match(/(\d+) of (\d+)/))) v.push('hashed ' + vx.group(+n[1]) + ' of ' + vx.group(+n[2]));
      if (fm.root) v.push('rooted'); if (fm.chain) v.push('chained'); if (fm.place) v.push('placed'); if (fm.extends) v.push('extended');
    } else if (s === 'directory.v1') {
      v.push('listed ' + (fm.files || '?') + ' files', 'publisher hashes kept'); if (fm.root) v.push('rooted');
    } else if (s === 'world.v1') {
      v.push('sensed ' + (text.match(/ · emem:fact:/g) || []).length + ' facts'); if (fm.bundle) v.push('bundled');
      if ((n = text.match(/echo-verified by emem against its token: (\d+) of (\d+)/))) v.push('echo ' + n[1] + '/' + n[2]);
    } else if (s === 'timelapse.v1') {
      if ((n = (fm.frames || '').match(/(\d+) of (\d+)/))) v.push('framed ' + n[1] + ' of ' + n[2]); if (fm.signed) v.push('cubes signed');
    } else if (s === 'camera.v1') {
      v.push('surveyed ' + (fm.cameras || '?') + ' cameras');
      if ((n = (fm.clips || '').match(/(\d+) of (\d+)/))) v.push('clips ' + n[1] + '/' + n[2] + ' re-hashed');
      if ((n = (fm.sun || '').match(/(\d+) of (\d+)/))) v.push('sun ' + n[1] + '/' + n[2] + ' recomputed');
    } else if (s === 'grid.v1') {
      if (fm.grid) v.push('mapped ' + fm.grid.split(' ')[0]); if ((n = (fm.receipts || '').match(/(\d+) of (\d+)/))) v.push('receipts ' + n[1] + '/' + n[2]);
    } else if (s === 'track.v1') {
      v.push('chained ' + (text.match(/^\d+\. /gm) || []).length + ' steps');
    } else if ((n = text.match(/^- \[[^\]]*\]\(https:\/\/emem\.dev\/memories\//gm))) {
      v.push('cut into ' + n.length + ' sections');
    }
    if (fm.after) v.push('stamped');
    return { list: v, saved: fm.after ? (fm.after.split(' ')[3] || '').slice(0, 10) : '' };
  }

  /* re-check as each card comes into view, four at a time, like the demo */
  var queue = [], busy = 0;
  function pump() {
    while (busy < 4 && queue.length) {
      busy++;
      queue.shift()().then(function () { busy--; pump(); }, function () { busy--; pump(); });
    }
  }
  function state(card, cls, txt, tip) { var s = card.querySelector('.sc-state'); s.className = 'sc-state ' + cls; s.textContent = txt; if (tip) s.title = tip; }
  async function check(x, card) {
    try {
      var nb = (await vx.getBytes(NOTE(x.cid))).bytes, ok = vx.cid26(nb) === x.cid;
      state(card, ok ? 'is-ok' : 'is-bad', ok ? '✓ note' : '✗ name lies', ok ? 'this note hashes to its name, checked in your browser' : 'the bytes do not hash to the name');
      if (!ok) return;
      var r = verbs(vx.dec.decode(nb));
      if (r.list.length) card.querySelector('.sc-verbs').textContent = r.list.join(' · ');
      if (r.saved) card.querySelector('.sc-saved').textContent = 'saved ' + r.saved;
    } catch (e) { state(card, 'is-off', 'unreachable', 'not checked: the source could not be reached, which is not a failed check'); }
  }
  async function picture(t, card) {
    var pic = card.querySelector('.sc-pic');
    try {
      var tb = (await vx.getBytes(NOTE(t.thumb))).bytes, txt = vx.dec.decode(tb);
      var of = (txt.match(/^of:\s*(.+)$/m) || [])[1], b64 = (txt.match(/data:image\/(?:webp|png|jpeg);base64,([A-Za-z0-9+/=]+)/) || [])[1];
      var mine = new Uint8Array(await (await fetch(t.file)).arrayBuffer());
      var img = b64 ? Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }) : null;
      var ok = vx.cid26(tb) === t.thumb && of && of.trim() === t.of && img && img.length === mine.length && img.every(function (b, i) { return b === mine[i]; });
      pic.classList.toggle('is-bad', !ok);
      pic.title = ok ? 'the picture its thumb note carries: the note hashes to its name, names this record, and holds these exact bytes' : 'this picture failed its check, so it is hidden';
    } catch (e) { pic.title = 'picture not re-checked: emem.dev could not be reached'; }
  }

  // the sharper picture: it hashes to the name data/pictures.json gives it, or it is hidden
  async function sharpCheck(w, f, card) {
    var pic = card.querySelector('.sc-pic');
    try {
      var ok = await vx.pictureOk(f);
      pic.classList.toggle('is-bad', !ok);
      pic.title = ok ? w.method + (w.checked ? ' (' + w.checked + ' checked)' : '') + '; this file hashes to the name data/pictures.json gives it' : 'this picture does not hash to its name, so it is hidden';
    } catch (e) { pic.title = 'picture not re-checked: this site could not be reached'; }
  }
  function card(x) {
    var li = el('li', 'sc'), t = thumbs[x.cid], w = pics[x.cid], sharp = w && w.files && w.files['640'], line = x.line;
    var pic = el('a', 'sc-pic'); pic.href = NOTE(x.cid); pic.target = '_blank'; pic.rel = 'noopener'; here(pic, x);
    if (sharp) {
      pic.style.backgroundImage = 'url(' + sharp.path + ')'; pic.classList.add('is-sharp');
      pic.setAttribute('aria-label', x.title + '. ' + w.method + '. ' + w.credit + ', ' + w.licence);
      if (w.files.loop_webm && !reduce) {
        var v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.poster = sharp.path; v.setAttribute('aria-hidden', 'true');
        [['loop_webm', 'video/webm'], ['loop_mp4', 'video/mp4']].forEach(function (f) { if (w.files[f[0]]) { var so = document.createElement('source'); so.src = w.files[f[0]].path; so.type = f[1]; v.appendChild(so); } });
        pic.appendChild(v); if (clips) clips.observe(v);
      }
      pic.appendChild(el('span', 'sc-cr', w.credit + ' · ' + w.licence));
    } else if (t) { pic.style.backgroundImage = 'url(' + t.file + ')'; if (t.frames > 1) { pic.classList.add('is-sprite'); pic.style.setProperty('--n', t.frames); } pic.setAttribute('aria-label', x.title + ', its saved picture'); }
    else { pic.classList.add('is-none'); pic.appendChild(el('span', null, 'no saved picture')); }
    li.appendChild(pic);
    var bd = el('div', 'sc-bd'), head = el('p', 'sc-head');
    head.appendChild(el('span', 'sc-tag', x.verb + ' ' + x.kind));
    var keep = KEEP[x.kv.by] || x.kv.by || ''; if (keep) { var kp = el('span', 'sc-keep', keep); kp.title = KEEP_T[keep] || ''; head.appendChild(kp); }
    head.appendChild(el('span', 'sc-state', 'checking…'));
    bd.appendChild(head);
    var h = el('h3'), a = el('a', null, x.title); a.href = NOTE(x.cid); a.target = '_blank'; a.rel = 'noopener'; here(a, x); h.appendChild(a); bd.appendChild(h);
    var meta = el('p', 'sc-meta'); meta.appendChild(el('span', 'sc-saved')); if (x.kv.src) meta.appendChild(el('span', null, x.kv.src)); bd.appendChild(meta);
    bd.appendChild(el('p', 'sc-big', big(x)));
    var tk = num(x.kv.tok), rw = num(x.kv.raw), tl = el('p', 'sc-tok');
    if (tk) { tl.appendChild(document.createTextNode('agent reads ')); var tb = el('b', null, tok(tk) + ' context tokens'); tb.setAttribute('data-term', 'context tokens'); tl.appendChild(tb); tl.appendChild(document.createTextNode(' (the catalogue line: ' + tok(count(line)) + ')')); }
    if (tk && rw) tl.appendChild(document.createTextNode(' · source ' + tok(rw).slice(1) + ' as raw bytes · ' + Math.round(rw / tk).toLocaleString('en-US') + '× less'));
    bd.appendChild(tl);
    bd.appendChild(el('p', 'sc-verbs', ''));
    var acts = el('p', 'sc-acts'), rn = el('button', 'lk', 'run it'); rn.type = 'button'; here(rn, x);
    var cp = el('button', 'lk', 'copy agent line'); cp.type = 'button';
    cp.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(line).then(function () { cp.textContent = 'copied'; setTimeout(function () { cp.textContent = 'copy agent line'; }, 1400); }); });
    var op = el('a', 'lk', 'note ↗'); op.href = NOTE(x.cid); op.target = '_blank'; op.rel = 'noopener';
    acts.appendChild(rn); acts.appendChild(document.createTextNode(' · ')); acts.appendChild(cp); acts.appendChild(document.createTextNode(' · ')); acts.appendChild(op); bd.appendChild(acts);
    li.appendChild(bd);
    li.vxRun = function () { queue.push(function () { return check(x, li); }); if (sharp) queue.push(function () { return sharpCheck(w, sharp, li); }); else if (t) queue.push(function () { return picture(t, li); }); pump(); };
    return li;
  }
  // a clip plays only while it can be seen
  var clips = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { var v = e.target; if (e.isIntersecting) { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); });
  }, { threshold: .25 }) : null;
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); e.target.vxRun(); } });
  }, { rootMargin: '300px' }) : null;
  // a card opens its sample here, in the popup, stepping through the cards shown (js/pop.js)
  var shown = [];
  function here(node, x) {
    node.addEventListener('click', function (e) {
      if (!window.vxPop || !window.vxPop.plain(e)) return;
      e.preventDefault(); window.vxPop.open(x, shown);
    });
  }
  function render() {
    grid.innerHTML = '';
    var list = items.filter(function (x) { return filter === 'All' || x.group === filter; });
    shown = list;
    var cut = filter === 'All' && !expanded && list.length > FIRST.length;
    (cut ? list.slice(0, FIRST.length) : list).forEach(function (x) {
      var c = card(x); grid.appendChild(c); if (io) io.observe(c); else c.vxRun();
    });
    if (moreBtn) { moreBtn.hidden = !cut; moreBtn.textContent = 'show all ' + list.length; }
  }
  if (moreBtn) moreBtn.addEventListener('click', function () { expanded = true; render(); });
  function start() {
    Promise.all([window.vxCatalog || Promise.reject(new Error('no catalogue')), fetch('/data/thumbs.json').then(function (r) { return r.json(); }).catch(function () { return { thumbs: [] }; }), vx.pictures ? vx.pictures() : {}]).then(function (r) {
      (r[1].thumbs || []).forEach(function (t) { if (t.record) thumbs[t.record] = t; });
      pics = r[2] || {};
      var all = r[0];
      items = all.filter(function (x) { return GROUP[x.sec] && /^[a-z2-7]{26}$/.test(x.cid); }).map(function (x) { x.group = GROUP[x.sec]; return x; });
      // the page's own samples first, then pictures, as the demo leads with them
      var rank = function (x) { var i = FIRST.indexOf(x.cid); return i >= 0 ? i : FIRST.length + (thumbs[x.cid] ? 0 : 1); };
      items.sort(function (a, b) { return rank(a) - rank(b); });
      var groups = ['All'].concat(['Earth', 'Space', 'Machines'].filter(function (g) { return items.some(function (x) { return x.group === g; }); }));
      chips.innerHTML = '';
      groups.forEach(function (g) {
        var b = el('button', 'chip', g); b.type = 'button';
        b.appendChild(el('span', 'chip-n', String(g === 'All' ? items.length : items.filter(function (x) { return x.group === g; }).length)));
        b.setAttribute('aria-pressed', g === filter ? 'true' : 'false');
        b.addEventListener('click', function () { filter = g; chips.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); }); render(); });
        chips.appendChild(b);
      });
      if (more) { var rest = all.length - items.length; more.textContent = rest > 0 ? rest + ' more in the full catalogue: models, medicine, documents, code' : 'the full catalogue'; }
      render();
    }).catch(function () {
      grid.innerHTML = ''; var li = el('li', 'sc-off'); li.textContent = 'the catalogue at vortx-ai.github.io/ememdemo did not answer this browser; open it directly'; grid.appendChild(li);
    });
  }
  if ('IntersectionObserver' in window) {
    var io0 = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io0.disconnect(); start(); } }, { rootMargin: '600px' });
    io0.observe(root);
  } else start();
})();
