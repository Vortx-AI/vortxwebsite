/* geoqa.js: geo.qa's public cameras, now.
 *
 * GET https://emem.dev/v1/perception/cards: twelve London traffic cameras geo.qa reads, each with its
 * newest retained clip, that clip's sha256, and what a named detector counted in it. The clip and its
 * record are signed by geo.qa (checked live in the camera run on the home page); the counts are the
 * detector's reading and are not signed, so this list says so.
 */
(function () {
  'use strict';
  var box = document.querySelector('[data-geoqa-cards]');
  if (!box) return;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(iso) { var s = (Date.now() - Date.parse(iso)) / 1000; return s < 90 ? Math.round(s) + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; }
  fetch('https://emem.dev/v1/perception/cards').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    box.innerHTML = '';
    (d.places || []).forEach(function (p) {
      var li = el('li', 'is-info'), c = p.counts || {}, what = Object.keys(c).sort().map(function (k) { return c[k] + ' ' + k; }).join(', ');
      li.appendChild(el('b', 'v', 'watch'));
      var n = el('span', 'n'); n.appendChild(el('strong', null, p.slug.replace(/-/g, ' '))); n.appendChild(document.createTextNode(' · ' + p.camera_name));
      li.appendChild(n);
      [['counted', what || 'nothing in frame'], ['clip', p.newest ? ago(p.newest) : ''], ['sha256', (p.clip_sha256 || '').slice(0, 12) + '…']].forEach(function (kv) {
        if (!kv[1]) return; var i = el('i', 'kv'); i.appendChild(el('span', 'k', kv[0])); i.appendChild(el('span', 'x', kv[1])); li.appendChild(i);
      });
      box.appendChild(li);
    });
    var note = document.querySelector('[data-geoqa-note]');
    if (note && d.places && d.places[0]) note.textContent = 'counts: ' + d.places[0].detector_fn_id + ', a detector’s reading, not signed · clips and their records: signed by geo.qa';
  }).catch(function () { box.innerHTML = '<li><b class="v">skip</b><span class="n">emem.dev did not answer this browser; open <a class="lk" href="https://emem.dev/v1/perception/cards">the cards</a> directly</span></li>'; });
})();
