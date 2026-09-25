/* press.js: the newsroom, checked as it loads.
 *
 * Each dated entry names the record that owns its date, and this page re-reads that record now:
 *   changelog  emem's CHANGELOG.md on GitHub: "## [x.y.z] - date"
 *   mcpreg     the official MCP Registry: the version's publishedAt
 *   ghmcp      the GitHub MCP Registry: the server's created_at
 *   pypi, npm  the first upload, the package's created time
 *   zenodo     the record's publication_date
 *   hf         a Hugging Face model or Space's createdAt
 *   dify       the Dify Marketplace plugin's created_at
 *   commit     the commit that first linked a listing: its committer date
 *   mulesoft   MuleSoft's Anypoint Exchange: the asset's createdDate
 *   vimeo      a Vimeo video's upload_date, from Vimeo's own oEmbed record
 *   tool       a tool that must be live on emem.dev now
 * A record that says another date is a failed check; a record that does not answer is not checked, and says so.
 * The numbers at the top are read live too.
 */
(function () {
  'use strict';
  var root = document.querySelector('.nr');
  if (!root) return;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function day(d) { var p = String(d).split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return 'the source'; } }
  function why(e, host) { var m = String((e && e.message) || e); return /failed to fetch|networkerror|load failed/i.test(m) ? host + ' did not answer' : m; }

  /* ---------- show: all, or one kind ---------- */
  var chips = root.querySelectorAll('[data-f]'), rows = [].slice.call(root.querySelectorAll('.tl-list > li'));
  function show(f) {
    chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-f') === f ? 'true' : 'false'); });
    var month = null, any = false;
    rows.forEach(function (li) {
      if (li.classList.contains('tl-m')) { if (month) month.hidden = !any; month = li; any = false; return; }
      var on = f === 'all' || li.getAttribute('data-kind') === f; li.hidden = !on; if (on) any = true;
    });
    if (month) month.hidden = !any;
  }
  // a filter with nothing to show is not offered
  chips.forEach(function (c) { var f = c.getAttribute('data-f'); if (f !== 'all' && !rows.some(function (li) { return li.getAttribute('data-kind') === f; })) c.hidden = true; });
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-f'); show(f);
      history.replaceState(null, '', f === 'all' ? location.pathname + '#timeline' : location.pathname + '#' + (f === 'listing' ? 'listings' : f === 'video' ? 'videos' : f));
    });
  });
  var h0 = location.hash.slice(1), map = { emem: 'emem', eudr: 'eudr', listings: 'listing', research: 'research', vortx: 'vortx', videos: 'video' };
  if (map[h0]) { show(map[h0]); var tl = document.getElementById('timeline'); if (tl) tl.scrollIntoView(); }

  /* ---------- videos: the platform's player loads only when asked, in place ---------- */
  root.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.vd[data-embed]'); if (!b) return;
    var f = document.createElement('iframe'), u = b.getAttribute('data-embed');
    f.src = u + (u.indexOf('?') < 0 ? '?' : '&') + 'autoplay=1&dnt=1'; f.title = b.getAttribute('aria-label').replace(/^Play: /, '');
    f.allow = 'autoplay; fullscreen; picture-in-picture'; f.setAttribute('allowfullscreen', ''); f.className = 'vd-f' + (b.classList.contains('vd-lg') ? ' vd-lg' : '');
    b.replaceWith(f);
  });

  /* ---------- the records that own the dates ---------- */
  var cache = {};
  function get(u, text) {
    if (!cache[u]) cache[u] = fetch(u, { headers: { accept: text ? 'text/plain' : 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(hostOf(u) + ' answered ' + r.status);
      return text ? r.text() : r.json();
    });
    return cache[u];
  }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var SRC = {
    changelog: function (c) {
      return get('https://raw.githubusercontent.com/Vortx-AI/emem/main/CHANGELOG.md', true).then(function (t) {
        var m = new RegExp('^## \\[' + esc(c.version) + '\\] [-—] (\\d{4}-\\d{2}-\\d{2})', 'm').exec(t);
        return { who: 'the emem changelog', date: m && m[1] };
      });
    },
    mcpreg: function (c) {
      return get('https://registry.modelcontextprotocol.io/v0/servers?search=' + encodeURIComponent(c.name) + '&limit=100').then(function (j) {
        var s = (j.servers || []).filter(function (x) { var v = x.server || x; return v.name === c.name && v.version === c.version; })[0];
        var m = s && s._meta && s._meta['io.modelcontextprotocol.registry/official'];
        return { who: 'the MCP Registry', date: m && m.publishedAt && m.publishedAt.slice(0, 10) };
      });
    },
    ghmcp: function (c) { return get('https://api.mcp.github.com/v0/servers/' + c.id).then(function (j) { var s = j.server || j; return { who: 'the GitHub MCP Registry', date: s.created_at && s.created_at.slice(0, 10) }; }); },
    pypi: function (c) {
      return get('https://pypi.org/pypi/' + c.pkg + '/json').then(function (j) {
        var t = Object.keys(j.releases || {}).map(function (k) { var f = j.releases[k][0]; return f && f.upload_time; }).filter(Boolean).sort()[0];
        return { who: 'PyPI', date: t && t.slice(0, 10) };
      });
    },
    npm: function (c) { return get('https://registry.npmjs.org/' + c.pkg.replace('/', '%2f')).then(function (j) { return { who: 'npm', date: j.time && j.time.created && j.time.created.slice(0, 10) }; }); },
    zenodo: function (c) { return get('https://zenodo.org/api/records/' + c.id).then(function (j) { return { who: 'Zenodo', date: j.metadata && j.metadata.publication_date }; }); },
    hf: function (c) { return get('https://huggingface.co/api/models/' + c.model).then(function (j) { return { who: 'Hugging Face', date: j.createdAt && j.createdAt.slice(0, 10) }; }); },
    hfspace: function (c) { return get('https://huggingface.co/api/spaces/' + c.id).then(function (j) { return { who: 'Hugging Face', date: j.createdAt && j.createdAt.slice(0, 10) }; }); },
    dify: function (c) { return get('https://marketplace.dify.ai/api/v1/plugins/' + c.plugin).then(function (j) { var p = (j.data || {}).plugin || {}; return { who: 'the Dify Marketplace', date: p.created_at && p.created_at.slice(0, 10) }; }); },
    commit: function (c) { return get('https://api.github.com/repos/' + c.repo + '/commits/' + c.sha).then(function (j) { var d = j.commit && j.commit.committer && j.commit.committer.date; return { who: 'GitHub', date: d && d.slice(0, 10) }; }); },
    vimeo: function (c) { return get('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent('https://vimeo.com/' + c.id)).then(function (j) { return { who: 'Vimeo', date: j.upload_date && j.upload_date.slice(0, 10) }; }); },
    mulesoft: function (c) { return get('https://anypoint.mulesoft.com/exchange/api/v2/assets?search=emem&limit=20').then(function (j) { var a = (Array.isArray(j) ? j : []).filter(function (x) { return x.assetId === c.asset; })[0]; return { who: 'MuleSoft Exchange', date: a && a.createdDate && a.createdDate.slice(0, 10) }; }); },
    tool: function (c) { return get('https://emem.dev/v1/tools').then(function (j) { var t = j.tools || j; return { who: 'emem.dev', live: (Array.isArray(t) ? t : []).some(function (x) { return x.name === c.name; }), name: c.name }; }); }
  };
  var HOST = { changelog: 'raw.githubusercontent.com', mcpreg: 'registry.modelcontextprotocol.io', ghmcp: 'api.mcp.github.com', pypi: 'pypi.org', npm: 'registry.npmjs.org', zenodo: 'zenodo.org', hf: 'huggingface.co', hfspace: 'huggingface.co', dify: 'marketplace.dify.ai', commit: 'api.github.com', tool: 'emem.dev', mulesoft: 'anypoint.mulesoft.com', vimeo: 'vimeo.com' };

  var done = 0, okN = 0, sum = root.querySelector('[data-checked]');
  function check(li) {
    var want = li.getAttribute('data-date'), specs = [];
    try { specs = JSON.parse(li.getAttribute('data-check')); } catch (e) { return Promise.resolve(); }
    var out = li.querySelector('.tl-ck');
    return Promise.all(specs.map(function (c) {
      var f = SRC[c.src]; if (!f) return Promise.resolve({ st: 'off', t: 'no reader for ' + c.src });
      return f(c).then(function (r) {
        if ('live' in r) return r.live ? { st: 'ok', t: r.name + ' is live on ' + r.who + ' now' } : { st: 'bad', t: r.name + ' is not on ' + r.who };
        if (!r.date) return { st: 'bad', t: r.who + ' has no such record' };
        return r.date === want ? { st: 'ok', t: r.who + ' says ' + day(r.date) } : { st: 'bad', t: r.who + ' says ' + day(r.date) };
      }, function (e) { return { st: 'off', t: 'not checked: ' + why(e, HOST[c.src]) }; });
    })).then(function (rs) {
      var st = rs.some(function (r) { return r.st === 'bad'; }) ? 'bad' : rs.every(function (r) { return r.st === 'ok'; }) ? 'ok' : 'off';
      out.className = 'tl-ck is-' + st;
      out.textContent = (st === 'ok' ? '✓ ' : st === 'bad' ? '✗ ' : '') + rs.map(function (r) { return r.t; }).join(' · ');
      li.classList.add('is-' + st);
      done++; if (st === 'ok') { okN++; if (sum) sum.textContent = okN; }
    });
  }
  // four at a time, newest first, so the top of the page settles first
  var todo = rows.filter(function (li) { return li.hasAttribute('data-check'); }), busy = 0;
  function pump() { while (busy < 4 && todo.length) { busy++; check(todo.shift()).then(next, next); } }
  function next() { busy--; pump(); }
  pump();

  /* ---------- the listing wall: each date that a record owns, marked when it agrees ---------- */
  var byDate = {};
  rows.forEach(function (li) { if (li.hasAttribute('data-check') && /^(listing|research|video)$/.test(li.getAttribute('data-kind'))) byDate[li.getAttribute('data-date')] = li; });
  var wall = [].slice.call(root.querySelectorAll('.ls-grid time[datetime], .wv time[datetime]'));
  var obs = new MutationObserver(function () {
    wall.forEach(function (t) { var li = byDate[t.getAttribute('datetime')]; if (li && li.classList.contains('is-ok')) t.classList.add('is-ok'); });
  });
  rows.forEach(function (li) { obs.observe(li, { attributes: true, attributeFilter: ['class'] }); });

  /* ---------- the numbers, live ---------- */
  function put(k, v) {
    var b = root.querySelector('[data-live="' + k + '"]'); if (!b || v == null || !isFinite(v)) return;
    b.classList.add('is-live');
    if (reduce) { b.textContent = Number(v).toLocaleString('en-US'); return; }
    var t0 = performance.now();
    (function step(t) { var p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); b.textContent = Math.round(v * e).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); })(t0);
  }
  get('https://registry.modelcontextprotocol.io/v0/servers?search=' + encodeURIComponent('io.github.Vortx-AI/emem') + '&limit=100').then(function (j) { put('releases', (j.servers || []).filter(function (x) { return (x.server || x).name === 'io.github.Vortx-AI/emem'; }).length); }).catch(function () {});
  get('https://emem.dev/v1/tools').then(function (j) { var t = j.tools || j; put('tools', Array.isArray(t) ? t.length : null); }).catch(function () {});
  get('https://emem.dev/v1/log/sth').then(function (j) { put('log', +((j.sth || j).tree_size)); }).catch(function () {});
  get('https://marketplace.dify.ai/api/v1/plugins/vortx-ai/emem').then(function (j) { put('dify', +(((j.data || {}).plugin || {}).install_count)); }).catch(function () {});
  get('https://api.github.com/repos/Vortx-AI/emem').then(function (j) { put('stars', +j.stargazers_count); }).catch(function () {});
})();
