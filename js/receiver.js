/* receiver.js: agent B. A Web Worker: its own thread, its own memory, no DOM.
 *
 * It is handed exactly one thing, the token string, and from it alone it
 *   resolves  the token at emem.dev to a fact and a receipt
 *   hashes    the fact's canonical CBOR and compares it to the cid in the token
 *   verifies  the receipt's ed25519 signature with emem's reference core
 *   reads     only the two tiles it needs, straight from the satellite archive
 *   decodes   them (DEFLATE, predictor 2), projects lat/lng to the scene's UTM grid
 *   recomputes NDVI in f64 and compares it to the signed value, bit for bit
 *   checks    the capture against the satellite's own orbit (SGP4 on public elements)
 * Every value it reports comes from bytes it hashed or fetched itself.
 */
/* global importScripts, vx, ememVerify, satellite */
importScripts('/vendor/emem-verify-core.js', '/vendor/sgp4.js', '/js/lib.js');

var EMEM = 'https://emem.dev';
var TLE_LIVE = 'https://celestrak.org/NORAD/elements/gp.php?NAME=SENTINEL-2&FORMAT=TLE';
var TLE_SNAPSHOT = '/data/tle-sentinel-2.txt';
var RE = 6371.0088;           // mean Earth radius, km (IUGG)
var HALF_SWATH = 145;         // Sentinel-2 MSI swath 290 km (ESA S2 User Handbook)
var MAX_ELEMENT_AGE_D = 20;   // beyond this SGP4 position error approaches the half-swath

var t0 = 0, ledger = null;
function now() { return Math.round(performance.now() - t0); }
function say(verb, noun, kv, state) { postMessage({ type: 'step', verb: verb, noun: noun, kv: kv || {}, state: state || 'ok', t: now() }); }
function fail(verb, noun, why) { say(verb, noun, { why: why }, 'fail'); }

onmessage = function (e) {
  var token = e.data;
  if (typeof token !== 'string') return;
  t0 = performance.now();
  ledger = new vx.Ledger();
  run(token).catch(function (err) { fail('stop', 'run', String(err && err.message || err)); done(false); });
};

function done(ok, extra) {
  postMessage({ type: 'done', ok: ok, t: now(), ledger: ledger.hosts, total: ledger.total, extra: extra || {} });
}

async function run(token) {
  var bytesIn = vx.enc.encode(token).length;
  say('receive', 'token', { bytes: bytesIn, token: token });

  // parse: emem:fact:<cell64>:<fact_cid>, split once after the cell (cell64 is colon-free)
  var m = token.match(/^emem:fact:([^:]+):([a-z2-7]{52})$/);
  if (!m) { fail('parse', 'token', 'not an emem:fact:<cell64>:<fact_cid> token'); return done(false); }
  var cell = m[1], cid = m[2];
  say('parse', 'token', { cell: cell, fact_cid: cid });

  // resolve: the receipt signs the dereference
  var r = await vx.getBytes(EMEM + '/v1/memory_token/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token }) }, ledger);
  var res = JSON.parse(vx.dec.decode(r.bytes));
  if (!res.resolved || !res.receipt) { fail('resolve', 'token', 'emem did not resolve it'); return done(false); }
  say('resolve', 'token', { bytes: r.bytes.length, primitive: res.receipt.primitive, served_at: res.receipt.served_at });

  // hash: the bytes the cid commits to, fetched as canonical CBOR
  var c = await vx.getBytes(EMEM + '/v1/facts/' + cid, { headers: { accept: 'application/cbor' } }, ledger);
  var got = vx.cid52(c.bytes);
  if (got !== cid) { fail('hash', 'fact', 'blake3 is ' + got + ', token names ' + cid); return done(false); }
  say('hash', 'fact', { bytes: c.bytes.length, blake3: got, match: 'token cid' });

  // from here on every value is read out of those hashed bytes, never from JSON
  var f = vx.cborDecode(c.bytes);
  var signer = vx.b32(new Uint8Array(f.signer || []));
  if (f.cell !== cell) { fail('bind', 'cell', 'fact is at ' + f.cell + ', token names ' + cell); return done(false); }

  // verify: ed25519 over the receipt preimage, rebuilt here; and the receipt must name this fact
  var v = ememVerify.verifyReceipt(res.receipt);
  if (!v.ok) { fail('verify', 'receipt', v.state + ': ' + v.why); return done(false); }
  var binds = (res.receipt.fact_cids || []).indexOf(cid) >= 0 && (res.receipt.cells || []).indexOf(cell) >= 0;
  if (!binds) { fail('verify', 'receipt', 'signature is valid but the receipt does not name this cell and cid'); return done(false); }
  say('verify', 'receipt', { ed25519: 'valid', preimage: 'v' + v.preimage_version, signer: v.signer_b32, same_as_fact_signer: signer === v.signer_b32 });

  var d = f.derivation || {}, a = d.args || [], src = (f.sources || [])[0] || {};
  postMessage({ type: 'fact', fact: { band: f.band, value: f.value, confidence: f.confidence, tslot: f.tslot, signed_at: f.signed_at, fn_key: d.fn_key, args: a, captured_at: src.captured_at, source: src.id, signer: signer, cell: cell, cid: cid } });
  if (d.fn_key !== 'sentinel2_l2a_indices_ndvi@1') {
    say('recompute', f.band, { why: 'this page re-derives sentinel2_l2a_indices_ndvi@1 only; fact is ' + d.fn_key }, 'skip');
    return done(true, { recomputed: false });
  }

  var urls = String(src.id || '').split(';').map(function (s) { return s.trim(); });
  var lat = a[0], lng = a[1], scene = a[2], epsg = a[3], samples = a[5] || [], offset = a.length > 12 ? a[12] : 0;
  var zone = vx.epsgZone(epsg);
  if (!zone || urls.length !== 2) { fail('project', 'point', 'unexpected derivation args'); return done(false); }
  var u = vx.utm(lat, lng, zone.zone);
  say('project', 'point', { lat: lat, lng: lng, epsg: epsg, easting_m: u.e.toFixed(3), northing_m: u.n.toFixed(3) });

  // read + decode each band: header, then the one tile under the point
  var names = ['B08', 'B04'], dns = [], totals = [], picked = [];
  for (var i = 0; i < 2; i++) {
    var url = urls[i], host = new URL(url).host;
    var h;
    try { h = await vx.range(url, 0, 16384, ledger); }
    catch (err) { fail('read', names[i] + ' header', host + ': ' + err.message); return done(false); }
    var ifd = await vx.tiffIFD0(h.bytes, async function (o, n) { return (await vx.range(url, o, n, ledger)).bytes; });
    var p = vx.cogProfile(ifd);
    if (p.epsg && p.epsg !== epsg) { fail('read', names[i], 'file is EPSG:' + p.epsg + ', fact says ' + epsg); return done(false); }
    var px = vx.worldToPixel(p, u.e, u.n), t = vx.tileOf(p, px.col, px.row);
    var total = h.total || await vx.headSize(url);
    totals.push(total);
    say('read', names[i] + ' header', { bytes: h.bytes.length, file_bytes: total, px: p.width + 'x' + p.height, tile: p.tileW + 'x' + p.tileH, epsg: p.epsg, host: host });
    var tb = await vx.range(url, t.offset, t.length, ledger, function (n) { postMessage({ type: 'progress', band: names[i], got: n, of: t.length }); });
    var pix = await vx.decodeTile16(p, tb.bytes);
    var dn = pix[t.y * p.tileW + t.x];
    dns.push(dn);
    picked.push({ band: names[i], col: px.col, row: px.row, tile: t.idx, tx: t.x, ty: t.y, w: p.tileW, h: p.tileH });
    say('decode', names[i] + ' tile ' + t.idx, { bytes: t.length, inflated: pix.length * 2, pixel: px.col + ',' + px.row, dn: dn, signed_dn: samples[i] });
    var copy = new Uint16Array(pix);
    postMessage({ type: 'tile', band: names[i], w: p.tileW, h: p.tileH, x: t.x, y: t.y, data: copy.buffer }, [copy.buffer]);
  }
  if (dns[0] !== samples[0] || dns[1] !== samples[1]) {
    fail('compare', 'DN', 'read ' + dns.join('/') + ', signed ' + samples.join('/'));
    return done(false);
  }

  // recompute: reflectance = (DN + offset) x 1e-4 per band, then the ratio, all in f64 (emem-core bands-v0 formula)
  var refl = function (x) { return (x + offset) * 1e-4; };
  var nir = refl(dns[0]), red = refl(dns[1]), ndvi = (nir - red) / (nir + red);
  var exact = ndvi === f.value;
  say('recompute', 'ndvi', { formula: '(B08-B04)/(B08+B04)', dn_offset: offset, value: repr(ndvi), signed: repr(f.value), bits: exact ? 'identical' : 'differ' }, exact ? 'ok' : 'fail');

  // capture: does the satellite's orbit put it over this cell at captured_at?
  var cap = await captureCheck(scene, src.captured_at, lat, lng);

  var source = totals[0] && totals[1] ? totals[0] + totals[1] : null;
  done(exact, { recomputed: true, exact: exact, ndvi: ndvi, dns: dns, picked: picked, source_bytes: source, capture: cap, scene: scene, wire: bytesIn });
}

function repr(x) { return String(x); }

async function loadTLE() {
  try {
    // force-cache: if this browser already holds CelesTrak's answer, read that copy instead of asking again
    // (CelesTrak throttles repeat requests); the bytes are still CelesTrak's, not agent A's
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 6000);
    var r = await vx.getBytes(TLE_LIVE, { cache: 'force-cache', signal: ctl.signal }, ledger);
    clearTimeout(timer);
    var txt = vx.dec.decode(r.bytes);
    if (/^1 \d{5}/m.test(txt)) return { txt: txt, from: 'celestrak.org' };
  } catch (e) { /* rate-limited or offline: fall through */ }
  var s = await vx.getBytes(TLE_SNAPSHOT, {}, ledger);
  return { txt: vx.dec.decode(s.bytes), from: 'vortx.ai snapshot' };
}

function parseTLE(txt) {
  var lines = txt.split(/\r?\n/).map(function (l) { return l.trimEnd(); }).filter(Boolean), out = {};
  for (var i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1][0] === '1' && lines[i + 2][0] === '2') {
      out[lines[i].trim()] = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
      i += 2;
    }
  }
  return out;
}

function ecefOfGeodetic(latDeg, lonDeg, hKm) {
  var a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
  var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180, s = Math.sin(la);
  var N = a / Math.sqrt(1 - e2 * s * s);
  return [(N + hKm) * Math.cos(la) * Math.cos(lo), (N + hKm) * Math.cos(la) * Math.sin(lo), (N * (1 - e2) + hKm) * s];
}
function unit(v) { var n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function toV(o) { return [o.x, o.y, o.z]; }

function stateAt(rec, date) {
  var pv = satellite.propagate(rec, date);
  if (!pv || !pv.position) return null;
  var g = satellite.gstime(date);
  var ecf = satellite.eciToEcf(pv.position, g), geo = satellite.eciToGeodetic(pv.position, g);
  return { ecf: toV(ecf), lat: satellite.degreesLat(geo.latitude), lon: satellite.degreesLong(geo.longitude), alt: geo.height, v: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z), gmst: g };
}

async function captureCheck(scene, capturedAt, lat, lng) {
  var plat = String(scene || '').slice(0, 3);             // S2A / S2B / S2C
  var name = { S2A: 'SENTINEL-2A', S2B: 'SENTINEL-2B', S2C: 'SENTINEL-2C' }[plat];
  var when = new Date(capturedAt);
  if (!name || isNaN(when)) { say('check', 'capture', { why: 'scene ' + scene + ' names no Sentinel-2 platform' }, 'skip'); return null; }
  var tle = await loadTLE(), recs = parseTLE(tle.txt), rec = recs[name];
  if (!rec) { say('check', 'capture', { why: name + ' not in the element set' }, 'skip'); return null; }
  var epochMs = (rec.jdsatepoch + (rec.jdsatepochF || 0) - 2440587.5) * 86400000;
  var ageD = (when.getTime() - epochMs) / 86400000;
  if (Math.abs(ageD) > MAX_ELEMENT_AGE_D) {
    say('check', 'capture', { satellite: name, elements: new Date(epochMs).toISOString().slice(0, 16) + 'Z', gap_days: ageD.toFixed(1), why: 'elements are ' + Math.abs(ageD).toFixed(0) + ' d from the capture; SGP4 error at that range can exceed the ' + HALF_SWATH + ' km half-swath' }, 'skip');
    return { skipped: true, satellite: name, gap_days: ageD };
  }
  var cellE = ecefOfGeodetic(lat, lng, 0), cellU = unit(cellE);
  // closest approach within +/-180 s: coarse 1 s scan, then 0.05 s refine
  function dist(ms) { var s = stateAt(rec, new Date(ms)); if (!s) return Infinity; return Math.acos(Math.min(1, dot(unit(s.ecf), cellU))) * RE; }
  var best = when.getTime(), bd = Infinity, k;
  for (k = -180; k <= 180; k++) { var dd = dist(when.getTime() + k * 1000); if (dd < bd) { bd = dd; best = when.getTime() + k * 1000; } }
  for (k = -20; k <= 20; k++) { var dt = best + k * 50, d2 = dist(dt); if (d2 < bd) { bd = d2; best = dt; } }
  var s = stateAt(rec, new Date(best)), s0 = stateAt(rec, new Date(when.getTime()));
  var a1 = stateAt(rec, new Date(best - 30000)), a2 = stateAt(rec, new Date(best + 30000));
  var plane = unit(cross(unit(a1.ecf), unit(a2.ecf)));
  var crossKm = Math.asin(dot(cellU, plane)) * RE;
  var look = sub(cellE, s.ecf), nadir = unit([-s.ecf[0], -s.ecf[1], -s.ecf[2]]);
  var offNadir = Math.acos(dot(unit(look), nadir)) * 180 / Math.PI;
  // sun elevation at the cell at capture (Vallado low-precision ephemeris, 0.01 deg)
  var jd = when.getTime() / 86400000 + 2440587.5, sp = satellite.sunPos(jd), g = satellite.gstime(when);
  var cg = Math.cos(g), sg = Math.sin(g), rs = sp.rsun;
  var sunE = unit([cg * rs.x + sg * rs.y, -sg * rs.x + cg * rs.y, rs.z]);
  var sunEl = Math.asin(dot(sunE, unit(cellE))) * 180 / Math.PI;
  var dtS = (best - when.getTime()) / 1000;
  var inside = Math.abs(crossKm) <= HALF_SWATH && Math.abs(dtS) <= 60;
  var out = {
    satellite: name, elements_from: tle.from, elements_epoch: new Date(epochMs).toISOString().slice(0, 16) + 'Z', gap_days: +ageD.toFixed(1),
    captured_at: capturedAt, closest_s: +dtS.toFixed(2), alt_km: +s0.alt.toFixed(1), v_kms: +s0.v.toFixed(3),
    sub_lat: +s0.lat.toFixed(3), sub_lon: +s0.lon.toFixed(3), cross_km: +crossKm.toFixed(1), off_nadir_deg: +offNadir.toFixed(2),
    sun_el_deg: +sunEl.toFixed(1), half_swath_km: HALF_SWATH, inside: inside
  };
  say('check', 'capture', { satellite: name, alt_km: out.alt_km, v_kms: out.v_kms, cross_track_km: out.cross_km, closest_approach_s: out.closest_s, off_nadir_deg: out.off_nadir_deg, sun_el_deg: out.sun_el_deg, swath: inside ? 'inside' : 'outside', elements: out.elements_from }, inside ? 'ok' : 'fail');
  return out;
}
