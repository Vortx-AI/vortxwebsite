/* pop.js: open any sample where you are, and run it end to end, live.
 *
 * One dialog for the globe's pins, the hero's cards and the sample cards: the saved picture (its thumb.v1
 * image), then what this browser reads and draws now, the steps as they run (js/engine.js), the counts to
 * scale, and the one line an agent reads instead of the file. ?s=<cid> opens it; Back, Esc or the backdrop
 * close it; the arrows step through the list it was opened from.
 */
/* global vx */
(function () {
  'use strict';
  var E = window.vxEngine;
  if (!window.vx || !E || !document.body) return;
  var el = E.el, KEEP = { machine: 'machine', 'third-party': 'third party', combined: 'combined', human: 'human' };
  var ORDER = ['indices.ndvi', 'copdem30m.elevation_mean', 'weather.temperature_2m', 'cams.pm25', 'hansen.tree_cover_2000', 'modis.lst_day_8day', 'soilgrids.phh2o_0_30cm', 'overture.buildings.count'];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var dlg = el('dialog', 'sp'); dlg.setAttribute('aria-labelledby', 'sp-h');
  dlg.innerHTML =
    '<div class="sp-in">' +
      '<div class="sp-media">' +
        '<div class="sp-pic" role="img"></div><div class="sp-live" hidden></div><span class="sp-tag"></span>' +
        '<div class="sp-mt" role="group" aria-label="Picture"><button type="button" data-v="saved" aria-pressed="true" title="the picture saved with the catalogue">thumbnail</button><button type="button" data-v="live" aria-pressed="false" title="drawn in this browser from bytes that hashed true">decoded here ✓</button></div>' +
        '<button class="sp-go sp-prev" type="button" aria-label="Previous sample">‹</button><button class="sp-go sp-next" type="button" aria-label="Next sample">›</button>' +
      '</div>' +
      '<div class="sp-bd">' +
        '<div class="sp-top"><p class="sc-head"><span class="sc-tag"></span><span class="sc-keep"></span><span class="sc-state">checking…</span></p><span class="sp-n"></span><button class="sp-x" type="button" aria-label="Close">×</button></div>' +
        '<h2 id="sp-h" tabindex="-1"></h2><p class="sp-meta"></p><p class="sp-verdict" aria-live="polite"></p>' +
        '<ol class="vlog sp-log" aria-live="polite"></ol>' +
        '<div class="sp-data"></div><div class="sp-sum"></div>' +
        '<div class="sp-line"><code></code><button class="lk" type="button" data-sp-copy>copy</button></div>' +
        '<p class="sp-acts"><button class="btn btn-sm" type="button" data-sp-again><span class="v">run</span> again</button><button class="btn btn-sm" type="button" data-sp-ask hidden><span class="v">ask</span> @emem about this place</button><a class="lk" data-sp-note target="_blank" rel="noopener">open the note ↗</a></p>' +
        '<div class="sp-ask" hidden><p class="sp-dh" data-sp-q></p><ol class="vlog sp-ask-log" aria-live="polite"></ol><ul class="ask-reads"></ul><p class="ask-ans" aria-live="polite"></p></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dlg);
  var $ = function (s) { return dlg.querySelector(s); };
  var pic = $('.sp-pic'), live = $('.sp-live'), tag = $('.sp-tag'), mt = $('.sp-mt'), log = $('.sp-log'), data = $('.sp-data'), sum = $('.sp-sum');
  var list = [], at = 0, gen = 0, R = null, x = null, after = null, pushed = false, thumbsP = null, exact = '';
  var askBox = $('.sp-ask'), asker = window.vxAsk ? window.vxAsk({ log: $('.sp-ask-log'), reads: askBox.querySelector('.ask-reads'), ans: askBox.querySelector('.ask-ans') }) : null;
  function askReset() { if (asker) asker.stop(); askBox.hidden = true; var b = $('[data-sp-ask]'); b.disabled = false; b.innerHTML = '<span class="v">ask</span> @emem about this place'; }

  function thumbs() {
    return thumbsP || (thumbsP = fetch('/data/thumbs.json').then(function (r) { return r.json(); }).then(function (j) { var m = {}; (j.thumbs || []).forEach(function (t) { if (t.record) m[t.record] = t; }); return m; }).catch(function () { return {}; }));
  }
  // the saved picture stays in front when there is one; a single decoded picture rides beside it as an inset,
  // proof that these bytes were read and drawn here, and a click on it brings it forward
  function simple() { return live.children.length === 1 && /^(CANVAS|IMG|VIDEO)$/.test(live.firstChild.tagName); }
  function view(v) {
    var isLive = v === 'live' && live.firstChild, inset = !isLive && live.firstChild && !pic.classList.contains('is-none') && !!pic.style.backgroundImage && simple();
    live.hidden = !isLive && !inset; live.classList.toggle('is-inset', !!inset); pic.hidden = !!isLive; tag.hidden = !isLive; mt.hidden = !live.firstChild;
    if (inset) { live.title = 'decoded here from the checked bytes: open it'; live.setAttribute('role', 'button'); live.tabIndex = 0; } else { live.removeAttribute('title'); live.removeAttribute('role'); live.removeAttribute('tabindex'); }
    mt.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === (isLive ? 'live' : 'saved') ? 'true' : 'false'); });
  }
  function clearLive() {
    live.querySelectorAll('video').forEach(function (v) { v.pause(); });
    live.querySelectorAll('[src^="blob:"]').forEach(function (m) { URL.revokeObjectURL(m.src); });
    live.innerHTML = ''; tag.textContent = '';
  }
  function show(node, t) {
    clearLive(); live.appendChild(node); tag.textContent = t || '';
    // with a saved picture to show, a single decoded picture waits as an inset; anything richer comes forward
    var hasPic = !pic.classList.contains('is-none') && !!pic.style.backgroundImage;
    view(hasPic && simple() ? 'saved' : 'live');
  }
  // the result first: how many checks passed, here, and how much less an agent reads
  function verdict(R, done) {
    var v = $('.sp-verdict'), k = x && x.kv, nt = k && num(k.tok), rt = k && num(k.raw);
    v.className = 'sp-verdict' + (done ? (R.passed === R.checks && R.checks ? ' is-ok' : ' is-fail') : '');
    v.innerHTML = '';
    v.appendChild(el('b', null, done ? R.passed + '/' + R.checks + (R.passed === R.checks ? ' ✓' : ' ✕') : 'checking ' + R.passed + '/' + R.checks));
    v.appendChild(el('span', null, done ? 'checked in your browser' : 'in your browser, now'));
    if (nt && rt) v.appendChild(el('span', null, Math.round(rt / nt).toLocaleString('en-US') + '× less to read'));
    if (done) (R.notes || []).forEach(function (t) { v.appendChild(el('span', 'is-note', '! ' + t)); });
  }
  function num(v) { var m = String(v || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  function big(k) {
    if (k.size) return k.size.replace(/^(~?[\d.]+)([KMGT]?B)$/, '$1 $2');
    if (k.facts) return k.facts + ' readings';
    if (k.frames) return k.frames + ' frames' + (k.years ? ', ' + k.years.replace('-', '–') : '');
    if (k.grid) return k.grid.replace('x', '×') + ' squares';
    if (k.n) return k.n + ' cameras';
    if (k.files) return k.files + ' files';
    return '';
  }

  // a unit as people write it; the value beside it stays exactly as signed
  var UNIT = { degC: '°C', 'ug/m^3': 'µg/m³', 'm^3/m^3': 'm³/m³', metres_above_sea_level: 'm above sea level', percent_canopy_cover: '% canopy cover', percent: '%', lccs_class: 'LCCS class' };
  function unit(u) { return UNIT[u] || u.replace(/_/g, ' '); }

  /* the panels a note's own data fills: readings to tap and check, files to scale */
  function readings(facts) {
    data.innerHTML = ''; if (!facts.length) return;
    var rank = function (a) { var i = ORDER.indexOf(a.band); return i < 0 ? ORDER.length : i; };
    var all = facts.slice().sort(function (a, b) { return rank(a) - rank(b); }), grid = el('div', 'sp-rds'), more = null;
    data.appendChild(el('p', 'sp-dh', 'tap a reading to check it against its signed fact'));
    all.forEach(function (f, i) {
      var b = el('button', 'sp-rd'); b.type = 'button'; if (i >= 8) b.hidden = true;
      var cut = f.value.indexOf('.') >= 0 ? f.value.indexOf('.') + 4 : f.value.length, v = el('b', null, f.value.slice(0, cut));
      if (f.value.length > cut) v.appendChild(el('span', 'sp-tail', f.value.slice(cut)));
      if (f.unit) v.appendChild(el('small', null, ' ' + unit(f.unit)));
      b.appendChild(el('span', 'k', f.label)); b.appendChild(v); b.appendChild(el('i', null, f.band));
      b.title = f.token; b.setAttribute('data-cid', f.cid);
      b.addEventListener('click', function () {
        if (!R || b.disabled) return; b.disabled = true;
        var mine = R;
        E.echo(mine, f).then(function (ok) { b.classList.add(ok ? 'is-ok' : 'is-bad'); if (mine === R) { E.tally(sum, mine, x, mine.out); verdict(mine, true); } }, function (e) { mine.stop(e, 'emem.dev'); b.disabled = false; });
      });
      grid.appendChild(b);
    });
    data.appendChild(grid);
    if (all.length > 8) { more = el('button', 'lk sp-all', 'all ' + all.length + ' readings'); more.type = 'button'; more.addEventListener('click', function () { grid.querySelectorAll('[hidden]').forEach(function (b) { b.hidden = false; }); more.remove(); }); data.appendChild(more); }
  }
  function files(fs) {
    data.innerHTML = ''; if (!fs.length) return;
    var top = fs.slice().sort(function (a, b) { return b.size - a.size; }).slice(0, 6), max = top[0].size || 1, ul = el('ul', 'sp-files');
    top.forEach(function (f) {
      var li = el('li'); li.appendChild(el('span', 'k', f.path.length > 34 ? '…' + f.path.slice(-33) : f.path));
      var i = el('i'), u = el('u'); u.style.width = Math.max(0.5, 100 * f.size / max).toFixed(2) + '%'; i.appendChild(u); li.appendChild(i);
      li.appendChild(el('em', null, vx.fmtBytes(f.size))); li.title = f.path + ' · ' + f.hash; ul.appendChild(li);
    });
    data.appendChild(el('p', 'sp-dh', 'the largest of ' + fs.length + ' files, to scale'));
    data.appendChild(ul);
  }

  async function paint() {
    x = list[at]; var g = ++gen, k = x.kv; exact = '';
    clearLive(); log.innerHTML = ''; data.innerHTML = ''; sum.innerHTML = '';
    view('saved');
    $('.sc-tag').textContent = x.verb + ' ' + x.kind;
    var kp = KEEP[k.by] || k.by || ''; $('.sc-keep').textContent = kp; $('.sc-keep').hidden = !kp;
    var st = $('.sc-state'); st.className = 'sc-state'; st.textContent = 'checking…';
    $('#sp-h').textContent = x.title;
    var meta = $('.sp-meta'); meta.innerHTML = '';
    [x.at ? x.at[0].toFixed(3) + ', ' + x.at[1].toFixed(3) : '', big(k), k.src || ''].filter(Boolean).forEach(function (t) { meta.appendChild(el('span', null, t)); });
    $('.sp-line code').textContent = x.line;
    $('.sp-n').textContent = list.length > 1 ? (at + 1) + ' / ' + list.length : '';
    dlg.querySelectorAll('.sp-go').forEach(function (b) { b.hidden = list.length < 2; });
    var note = $('[data-sp-note]'); note.href = E.NOTE(x.cid);
    askReset(); $('[data-sp-ask]').hidden = !x.at || !asker;
    // the saved picture: only the one its own thumb note carries
    pic.className = 'sp-pic'; pic.style.backgroundImage = ''; pic.style.removeProperty('--n'); pic.innerHTML = '';
    pic.setAttribute('aria-label', x.title + ', its saved picture');
    var t = (await thumbs())[x.cid]; if (g !== gen) return;
    if (t) { pic.style.backgroundImage = 'url(' + t.file + ')'; if (t.frames > 1 && !reduce) { pic.classList.add('is-sprite'); pic.style.setProperty('--n', t.frames); } else if (t.frames > 1) { pic.classList.add('is-last'); pic.style.setProperty('--n', t.frames); } }
    else { pic.classList.add('is-none'); pic.appendChild(el('span', null, x.verb + ' ' + x.kind)); }
    mt.querySelector('[data-v="saved"]').disabled = !t;
    // then the whole run, live
    R = new E.Run({
      log: log, whole: true, live: function () { return g === gen && dlg.open; }, show: function (n, tg) { if (g === gen) show(n, tg); },
      retag: function (t) { if (g === gen) tag.textContent = t; },
      named: function (ok) { if (g !== gen) return; st.className = 'sc-state ' + (ok ? 'is-ok' : 'is-bad'); st.textContent = ok ? '✓ note' : '✗ name lies'; },
      data: function (kind, v) {
        if (g !== gen) return;
        if (kind === 'readings') readings(v); else if (kind === 'files') files(v);
        else if (kind === 'at') exact = String(v).replace(/\s+/g, '');
        else if (kind === 'outside' || kind === 'newer') v.forEach(function (c) { var b = data.querySelector('.sp-rd[data-cid="' + c + '"]'); if (b) { b.classList.add(kind === 'newer' ? 'is-newer' : 'is-out'); b.hidden = false; } });
      }
    });
    var mine = R, mo = new MutationObserver(function () { if (g === gen) verdict(mine, false); });
    mo.observe(log, { childList: true }); verdict(mine, false);
    try {
      mine.out = await E.auto(mine, { cid: x.cid, label: '' }, x) || {};
      if (g === gen) { E.tally(sum, mine, x, mine.out); verdict(mine, true); }
    } catch (e) {
      if (g !== gen) return;
      mine.stop(e, 'emem.dev');
      if (st.textContent === 'checking…') { st.className = 'sc-state is-off'; st.textContent = 'unreachable'; st.title = 'not checked: the source could not be reached, which is not a failed check'; }
      var v = $('.sp-verdict'); v.className = 'sp-verdict is-off'; v.textContent = 'not checked: ' + vx.why(e, 'emem.dev');
    } finally { mo.disconnect(); }
  }

  /* opening, stepping, closing, and the address bar */
  function url(cid) { var u = new URL(location.href); if (cid) u.searchParams.set('s', cid); else u.searchParams.delete('s'); return u.pathname + u.search + u.hash; }
  // it unfolds from the place that opened it (a pin, a card, a link) and folds back there
  var origin = null, folding = false;
  function unfold(pt) {
    origin = null; dlg.classList.remove('is-unfold', 'is-fold');
    if (!pt || reduce) return;
    var r = dlg.getBoundingClientRect();
    origin = Math.round(pt.x - r.left) + 'px ' + Math.round(pt.y - r.top) + 'px';
    dlg.style.transformOrigin = origin; void dlg.offsetWidth; dlg.classList.add('is-unfold');
  }
  function open(item, from, opts) {
    if (!item) return;
    list = (from && from.length ? from : [item]); at = list.indexOf(item); if (at < 0) { list = [item]; at = 0; }
    if (!dlg.open) {
      document.documentElement.classList.add('sp-open');
      dlg.showModal();
      unfold(opts && opts.from);
      document.dispatchEvent(new CustomEvent('vx:pop', { detail: { open: true, cid: item.cid } }));
      if (new URL(location.href).searchParams.get('s') !== item.cid) { history.pushState({ sp: item.cid }, '', url(item.cid)); pushed = true; } else pushed = false;
    } else history.replaceState(history.state, '', url(item.cid));
    paint();
    setTimeout(function () { var h = $('#sp-h'); if (h && dlg.open) h.focus({ preventScroll: true }); }, 30);
  }
  function step(d) { if (list.length < 2) return; at = (at + d + list.length) % list.length; history.replaceState(history.state, '', url(list[at].cid)); paint(); }
  function close(then) {
    after = then || null;
    if (pushed && history.state && history.state.sp) { pushed = false; history.back(); return; } // popstate finishes the close
    history.replaceState(null, '', url(null)); finish();
  }
  function finish() {
    if (folding) return;
    gen++; pushed = false;
    var end = function () {
      folding = false; dlg.classList.remove('is-fold', 'is-unfold'); clearLive(); askReset();
      if (dlg.open) dlg.close();
      document.documentElement.classList.remove('sp-open');
      document.dispatchEvent(new CustomEvent('vx:pop', { detail: { open: false } }));
      var f = after; after = null; if (f) f();
    };
    if (dlg.open && origin && !reduce) { folding = true; dlg.classList.remove('is-unfold'); void dlg.offsetWidth; dlg.classList.add('is-fold'); setTimeout(end, 230); }
    else end();
  }
  window.addEventListener('popstate', function () {
    var cid = new URL(location.href).searchParams.get('s');
    if (!cid) { if (dlg.open) finish(); return; }
    if (window.vxCatalog) window.vxCatalog.then(function (items) { var it = items.filter(function (i) { return i.cid === cid; })[0]; if (it) open(it, list.indexOf(it) >= 0 ? list : null); });
  });
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
  // however it closed, the address bar and the page follow
  dlg.addEventListener('close', function () { if (document.documentElement.classList.contains('sp-open')) close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  $('.sp-x').addEventListener('click', function () { close(); });
  $('.sp-prev').addEventListener('click', function () { step(-1); });
  $('.sp-next').addEventListener('click', function () { step(1); });
  mt.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) view(b.getAttribute('data-v')); });
  live.addEventListener('click', function () { if (live.classList.contains('is-inset')) view('live'); });
  live.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && live.classList.contains('is-inset')) { e.preventDefault(); view('live'); } });
  $('[data-sp-again]').addEventListener('click', function () { paint(); });
  $('[data-sp-copy]').addEventListener('click', function () {
    var b = $('[data-sp-copy]');
    if (navigator.clipboard && x) navigator.clipboard.writeText(x.line).then(function () { b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1400); });
  });
  // ask @emem about the place this sample is of, here in the popup: the steps and the answer stream in below
  $('[data-sp-ask]').addEventListener('click', function () {
    var it = x, b = $('[data-sp-ask]'); if (!it || !it.at || !asker) return;
    var q = /timelapse/.test(it.kind) ? 'how has this place changed' : /forest/.test(it.kind) ? 'has the forest changed here' : 'what is this place like';
    // the note's own point when it has one: three decimals can land in the next 10 m cell, with other readings
    var place = exact || it.at[0].toFixed(3) + ',' + it.at[1].toFixed(3), mine = gen;
    // the note is a dated snapshot; the answer is today's memory at this place, so its numbers can differ, each with its own date
    askBox.hidden = false; $('[data-sp-q]').textContent = '“' + q + '” · ' + place.replace(',', ', ') + (exact ? ', the note’s own cell' : '') + ' · live from emem.dev, today: readings can be newer than the note’s, and each says when it was measured';
    b.disabled = true; b.innerHTML = '<span class="v">asking</span> @emem…';
    askBox.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    asker.ask(q, place).then(function () {
      if (mine !== gen) return; b.disabled = false; b.innerHTML = '<span class="v">ask</span> again';
      var a = askBox.querySelector('.ask-ans'); if (a.textContent) a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    });
  });

  // an in-page link to a sample opens here, unless the visitor asked for a new tab
  function plain(e) { return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey); }
  window.vxPop = { open: open, plain: plain };

  // ?s=<cid> opens that sample once the catalogue has arrived
  var s0 = new URL(location.href).searchParams.get('s');
  if (s0 && /^[a-z2-7]{26}$/.test(s0) && window.vxCatalog) {
    window.vxCatalog.then(function (items) {
      var it = items.filter(function (i) { return i.cid === s0; })[0]; if (!it) return;
      var east = items.filter(function (i) { return i.at; }).sort(function (a, b) { return a.at[1] - b.at[1]; });
      open(it, east.indexOf(it) >= 0 ? east : null);
    });
  }
})();
