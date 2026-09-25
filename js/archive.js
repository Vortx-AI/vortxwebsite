/* archive.js: every memory has a world inside.
 *
 * Reads the live ememdemo catalogue (shared with hero.js) and shows the entries that have a
 * preview image in /assets/observations/<cid>.webp (extracted from each note's thumb.v1 record;
 * provenance in tools/observation-sources.json). Each card compares two numbers the catalogue
 * states: what the source's bytes would cost a model as base64, and what reading the note costs.
 */
(function () {
  'use strict';
  var root = document.getElementById('archive');
  if (!root) return;
  var grid = root.querySelector('.arc'), chips = root.querySelector('.arc-f');
  var NOTE = function (cid) { return 'https://emem.dev/memories/by_attester/ddzmyzhn/' + cid + '.md'; };
  var HAVE = (root.getAttribute('data-previews') || '').split(/\s+/).filter(Boolean);
  var GROUP = { earth: 'Earth', cities: 'Earth', wildlife: 'Earth', mines: 'Earth', disaster: 'Earth', places: 'Earth', space: 'Space', robotics: 'Machines', drones: 'Machines', cameras: 'Machines' };
  function num(s) { var m = String(s || '').replace('~', '').match(/^([\d.]+)([kMB]?)$/); return m ? parseFloat(m[1]) * ({ '': 1, k: 1e3, M: 1e6, B: 1e9 })[m[2]] : null; }
  function tk(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)); }
  var items = [], filter = 'All', MAX = 10;
  function render() {
    var shown = items.filter(function (x) { return filter === 'All' || x.group === filter; }).slice(0, 9);
    // one scale for every card, the largest source shown, so bars compare across cards
    MAX = Math.log10(Math.max.apply(null, [10].concat(items.map(function (x) { return num(x.kv.raw) || num(x.kv.tok) || 0; }))));
    grid.innerHTML = '';
    shown.forEach(function (x) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = NOTE(x.cid); a.target = '_blank'; a.rel = 'noopener';
      var raw = num(x.kv.raw), tok = num(x.kv.tok), max = MAX;
      a.innerHTML = '<div class="im"></div><div class="bd"><strong></strong><span class="src"></span><div class="cost"></div></div>';
      a.firstChild.style.backgroundImage = 'url(/assets/observations/' + x.cid + '.webp)';
      a.querySelector('strong').textContent = x.title;
      a.querySelector('.src').textContent = [x.kv.size || (x.kv.frames ? x.kv.frames + ' frames' : x.kv.facts ? x.kv.facts + ' signed facts' : ''), x.kv.src ? 'at ' + x.kv.src : ''].filter(Boolean).join(' ');
      var cost = a.querySelector('.cost');
      if (raw) cost.innerHTML += '<span><b class="v is-claim">send</b><i><u style="width:' + (100 * Math.log10(raw) / max).toFixed(1) + '%"></u></i><em>≈ ' + tk(raw) + ' tokens</em></span>';
      if (tok) cost.innerHTML += '<span class="is-tok"><b class="v">read</b><i><u style="width:' + Math.max(3, 100 * Math.log10(tok) / max).toFixed(1) + '%"></u></i><em>≈ ' + tk(tok) + ' tokens</em></span>';
      li.appendChild(a); grid.appendChild(li);
    });
  }
  function start() {
    (window.vxCatalog || Promise.reject()).then(function (all) {
      items = all.filter(function (x) { return HAVE.indexOf(x.cid) >= 0; }).map(function (x) { x.group = GROUP[x.sec] || 'Data'; return x; });
      var groups = ['All'].concat(['Earth', 'Space', 'Machines', 'Data'].filter(function (g) { return items.some(function (x) { return x.group === g; }); }));
      chips.innerHTML = '';
      groups.forEach(function (g) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = g;
        b.setAttribute('aria-pressed', g === filter ? 'true' : 'false');
        b.addEventListener('click', function () { filter = g; chips.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); }); render(); });
        chips.appendChild(b);
      });
      render();
    }).catch(function () {});
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else start();
})();
