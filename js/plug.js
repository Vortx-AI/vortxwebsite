/* plug.js: every way into @emem, each one asked as the page opens.
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
  function fail(k, host) { return function (e) { put(k, 'off', 'not reached: ' + (window.vx ? vx.why(e, host) : host + ' did not answer')); }; }
  function json(u, o) { return fetch(u, o).then(function (r) { if (!r.ok) throw new Error(new URL(u).host + ' answered ' + r.status); return r.json(); }); }
  function start() {
    // MCP: the core loop a client sees on connect, and the whole catalogue behind emem_tools
    Promise.all([
      json(EMEM + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }),
      json(EMEM + '/v1/tools').catch(function () { return null; })
    ]).then(function (r) {
      var core = ((r[0] || {}).result || {}).tools || [], all = r[1] && (Array.isArray(r[1]) ? r[1] : r[1].tools);
      if (!core.length) throw new Error('emem.dev listed no tools');
      put('mcp', 'ok', core.length + ' tools in the core loop' + (all ? ' · ' + all.length + ' in all' : '') + ' · answered now');
    }).catch(fail('mcp', 'emem.dev'));
    // A2A: both cards, as a client reads them
    json(EMEM + '/.well-known/agent-card.json').then(function (j) {
      put('a2a-emem', 'ok', [j.name + ' ' + (j.version || ''), j.protocolVersion ? 'A2A ' + j.protocolVersion : '', (j.skills || []).length + ' skills'].filter(Boolean).join(' · '));
    }).catch(fail('a2a-emem', 'emem.dev'));
    json('/.well-known/agent-card.json').then(function (j) {
      var sk = (j.skills || []).map(function (x) { return x.name || x.id; }).filter(Boolean), at = j.url ? new URL(j.url).host : '';
      put('a2a-vortx', 'ok', [j.name + ' ' + (j.version || ''), j.protocolVersion ? 'A2A ' + j.protocolVersion : '', sk.length + ' skills' + (at ? ', run on ' + at : '')].filter(Boolean).join(' · '));
      var e = root.querySelector('[data-pl="a2a-vortx"]'); if (e) e.title = sk.join(' · ');
    }).catch(fail('a2a-vortx', 'vortx.ai'));
    // REST: one call, and its signature checked here
    json(EMEM + '/v1/log/sth').then(function (j) {
      var s = j.sth || j, ok = window.vx && s.responder_pubkey_b32 === KEY && vx.verifySTH(s);
      put('rest', ok ? 'ok' : 'bad', 'log head ' + Number(s.tree_size).toLocaleString('en-US') + (ok ? ' · ed25519 checked here' : ' · signature did not check'));
    }).catch(fail('rest', 'emem.dev'));
    json(EMEM + '/openapi.json').then(function (j) {
      var n = Object.keys(j.paths || {}).length;
      put('openapi', 'ok', 'OpenAPI ' + (j.openapi || '') + ' · ' + n + ' paths');
    }).catch(fail('openapi', 'emem.dev'));
    // SDKs: the newest release of each, from its own registry
    json('https://pypi.org/pypi/ememdev/json').then(function (j) {
      var v = j.info && j.info.version, f = (j.releases && j.releases[v] || [])[0];
      put('pypi', 'ok', 'ememdev ' + v + (f ? ' · ' + day(f.upload_time_iso_8601 || f.upload_time) : ''));
    }).catch(fail('pypi', 'pypi.org'));
    json('https://registry.npmjs.org/@vortxai%2femem').then(function (j) {
      var v = (j['dist-tags'] || {}).latest;
      put('npm', 'ok', '@vortxai/emem ' + v + (j.time && j.time[v] ? ' · ' + day(j.time[v]) : ''));
    }).catch(fail('npm', 'registry.npmjs.org'));
  }
  // asked once, when the panel comes into view
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else start();
})();
