/* plug.js: every way into @emem, each one asked live. The MCP row is asked when the panel comes into view;
 * the rest (the larger answers: the whole catalogue, the OpenAPI description) only once "More ways in" is opened.
 *
 *   mcp      POST https://emem.dev/mcp tools/list: the core loop a client loads; /v1/tools for the whole catalogue
 *   a2a      emem's agent card and this site's own, read and summarised: version, protocol, skills, where they run
 *   rest     GET /v1/log/sth: the signed log head, its ed25519 signature checked here against the pinned key
 *   openapi  the REST surface's own description, its path count
 *   sdk      the newest ememdev on PyPI and @vortxai/emem on npm, with their release dates
 * A surface that does not answer says so; nothing here is typed in by hand.
 */
/* global vx */
(function () {
  'use strict';
  var root = document.getElementById('plug');
  if (!root) return;
  var EMEM = 'https://emem.dev', KEY = '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function put(k, st, t) { var e = root.querySelector('[data-pl="' + k + '"]'); if (!e) return; e.className = 'pl-s is-' + st; e.textContent = (st === 'ok' ? '✓ ' : '') + t; }
  // a surface that did not answer says so once, quietly, with a way to ask again; it is not a failed check,
  // and the reason goes in the tooltip, not across the panel
  function fail(k, host, again) {
    return function (e) {
      put(k, 'off', 'no answer just now');
      var s = root.querySelector('[data-pl="' + k + '"]'); if (!s) return;
      s.title = window.vx ? vx.why(e, host) : host + ' did not answer';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lk pl-retry'; b.textContent = 'try again';
      b.addEventListener('click', function () { s.className = 'pl-s'; s.textContent = 'asking again'; again(); });
      s.appendChild(document.createTextNode(' · ')); s.appendChild(b);
    };
  }
  function json(u, o) { return fetch(u, o).then(function (r) { if (!r.ok) throw new Error(new URL(u).host + ' answered ' + r.status); return r.json(); }); }
  // each surface says it is being asked only once it is (the markup is empty, so a page read without scripts never waits for ever)
  function asking(scope) { scope.querySelectorAll('.pl-s').forEach(function (s) { if (!/is-/.test(s.className)) s.textContent = 'asking…'; }); }
  var dev = root.querySelector('.door-dev');
  // MCP: the core loop a client sees on connect
  function core() {
    var s = root.querySelector('[data-pl="mcp"]'); if (s && !/is-/.test(s.className)) s.textContent = 'asking…';
    json(EMEM + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }).then(function (r) {
      var tools = ((r || {}).result || {}).tools || [];
      if (!tools.length) throw new Error('emem.dev listed no tools');
      put('mcp', 'ok', 'answered now · ' + tools.length + ' core tools');
    }).catch(fail('mcp', 'emem.dev', core));
  }
  function more() {
    if (dev) asking(dev);
    // the whole catalogue behind emem_tools, said in the MCP row's title
    json(EMEM + '/v1/tools').then(function (j) {
      var all = Array.isArray(j) ? j : j.tools, e = root.querySelector('[data-pl="mcp"]');
      if (e && all) e.title = all.length + ' tools in the whole catalogue, behind emem_tools';
    }).catch(function () {});
    // A2A: both cards, as a client reads them
    json(EMEM + '/.well-known/agent-card.json').then(function (j) {
      put('a2a-emem', 'ok', [j.name + (j.version ? ' v' + j.version : ''), j.protocolVersion ? 'A2A ' + j.protocolVersion : '', (j.skills || []).length + ' skills'].filter(Boolean).join(' · '));
    }).catch(fail('a2a-emem', 'emem.dev', more));
    json('/.well-known/agent-card.json').then(function (j) {
      var sk = (j.skills || []).map(function (x) { return x.name || x.id; }).filter(Boolean), at = j.url ? new URL(j.url).host : '';
      put('a2a-vortx', 'ok', [j.protocolVersion ? 'A2A ' + j.protocolVersion : '', sk.length + ' skills' + (at ? ', run on ' + at : '')].filter(Boolean).join(' · '));
      var e = root.querySelector('[data-pl="a2a-vortx"]'); if (e) e.title = sk.join(' · ');
    }).catch(fail('a2a-vortx', 'vortx.ai', more));
    // REST: one call, and its signature checked here
    json(EMEM + '/v1/log/sth').then(function (j) {
      var s = j.sth || j, ok = window.vx && s.responder_pubkey_b32 === KEY && vx.verifySTH(s);
      put('rest', ok ? 'ok' : 'bad', 'log head ' + Number(s.tree_size).toLocaleString('en-US') + (ok ? ' · ed25519 checked here' : ' · signature did not check'));
    }).catch(fail('rest', 'emem.dev', more));
    json(EMEM + '/openapi.json').then(function (j) {
      var n = Object.keys(j.paths || {}).length;
      put('openapi', 'ok', 'OpenAPI ' + (j.openapi || '') + ' · ' + n + ' paths');
    }).catch(fail('openapi', 'emem.dev', more));
    // SDKs: the newest release of each, from its own registry
    json('https://pypi.org/pypi/ememdev/json').then(function (j) {
      var v = j.info && j.info.version, f = (j.releases && j.releases[v] || [])[0];
      put('pypi', 'ok', 'ememdev ' + v + (f ? ' · ' + day(f.upload_time_iso_8601 || f.upload_time) : ''));
    }).catch(fail('pypi', 'pypi.org', more));
    json('https://registry.npmjs.org/@vortxai%2femem').then(function (j) {
      var v = (j['dist-tags'] || {}).latest;
      put('npm', 'ok', '@vortxai/emem ' + v + (j.time && j.time[v] ? ' · ' + day(j.time[v]) : ''));
    }).catch(fail('npm', 'registry.npmjs.org', more));
  }
  // the MCP row, once, when the panel comes into view; the rest, once, when it is opened
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); core(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else core();
  if (dev) { var once = false; dev.addEventListener('toggle', function () { if (dev.open && !once) { once = true; more(); } }); if (dev.open) { once = true; more(); } }
  else more();
})();
