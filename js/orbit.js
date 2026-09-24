/* orbit.js: the sky above the memory, computed, not drawn.
 *
 *   satellites  Sentinel-2A, 2B, 2C from public two-line elements (CelesTrak),
 *               propagated with SGP4 (vendor/sgp4.js) every frame
 *   sun         Vallado's low-precision ephemeris (0.01 deg), so the day/night
 *               line and the city lights sit where they are right now
 *   stars       Yale Bright Star Catalogue (V <= 4.6), precessed J2000 -> date,
 *               turned by sidereal time: the sky behind the Earth is the real sky
 *   earth       NASA Blue Marble (day) and Black Marble (night), public domain
 *   next pass   the next daylight pass that puts a place inside the 290 km swath
 * Nothing on this canvas is placed by hand.
 */
/* global satellite, vx */
(function () {
  'use strict';
  var stage = document.getElementById('orbit');
  if (!stage || !window.satellite) return;

  var RE = 6378.137, RMEAN = 6371.0088, HALF_SWATH = 145, DEG = Math.PI / 180;
  var TLE_LIVE = 'https://celestrak.org/NORAD/elements/gp.php?NAME=SENTINEL-2&FORMAT=TLE';
  var TLE_SNAPSHOT = '/data/tle-sentinel-2.txt';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var sky = stage.querySelector('[data-sky]'), glc = stage.querySelector('[data-earth]'), over = stage.querySelector('[data-over]');
  var readout = document.querySelector('[data-orbit-readout]');
  var S = {
    sats: [], stars: [], place: null, follow: null, warp: 1, simAt: Date.now(), realAt: performance.now(),
    lat0: 13, lon0: 78, d: 3.25, tanHalf: Math.tan(23 * DEG), dragging: false, dirty: true, lastTrack: 0,
    elements: null, visible: true, dpr: Math.min(window.devicePixelRatio || 1, 1.75), W: 0, H: 0, next: null
  };

  /* ---------- time ---------- */
  function simNow() { return S.simAt + (performance.now() - S.realAt) * S.warp; }
  function setWarp(w) { S.simAt = simNow(); S.realAt = performance.now(); S.warp = w; }

  /* ---------- vectors ---------- */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function ll(latDeg, lonDeg) { var la = latDeg * DEG, lo = lonDeg * DEG; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }

  /* ---------- camera ---------- */
  function camera() {
    var n0 = ll(S.lat0, S.lon0), pos = scale(n0, S.d), fwd = scale(n0, -1);
    var Z = Math.abs(S.lat0) > 89.5 ? [1, 0, 0] : [0, 0, 1];
    var up = norm(sub(Z, scale(fwd, dot(Z, fwd)))), right = cross(fwd, up);
    return { pos: pos, fwd: fwd, up: up, right: right, f: (S.H / 2) / S.tanHalf };
  }
  function project(cam, P) {
    var v = sub(P, cam.pos), z = dot(v, cam.fwd);
    if (z <= 0) return null;
    return { x: S.W / 2 + cam.f * dot(v, cam.right) / z, y: S.H / 2 - cam.f * dot(v, cam.up) / z, z: z };
  }
  function surfaceVisible(cam, P) { return dot(P, cam.pos) > 1.0005; }
  function occluded(cam, P) {
    var d = sub(P, cam.pos), a = dot(d, d), b = 2 * dot(cam.pos, d), c = dot(cam.pos, cam.pos) - 1, h = b * b - 4 * a * c;
    if (h < 0) return false;
    var t = (-b - Math.sqrt(h)) / (2 * a);
    return t > 0 && t < 1;
  }

  /* ---------- sun and sidereal time ---------- */
  function gmst(date) { return satellite.gstime(date); }
  function eciToEcef(v, g) { var c = Math.cos(g), s = Math.sin(g); return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]; }
  function sunEcef(date) {
    var jd = date.getTime() / 86400000 + 2440587.5, sp = satellite.sunPos(jd), r = sp.rsun;
    return norm(eciToEcef([r.x, r.y, r.z], gmst(date)));
  }
  function subsolar(s) { return { lat: Math.asin(s[2]) / DEG, lon: Math.atan2(s[1], s[0]) / DEG }; }

  /* ---------- stars: IAU 1976 precession, J2000 -> mean of date ---------- */
  function precessMatrix(date) {
    var T = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525, as = DEG / 3600;
    var ze = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * as;
    var z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * as;
    var th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * as;
    var cz = Math.cos(ze), sz = Math.sin(ze), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
    return [
      [cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st],
      [sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st],
      [st * cz, -st * sz, ct]
    ];
  }
  function mul(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }
  // B-V to an sRGB tint: Ballesteros (2012) temperature, then a blackbody fit
  function starRGB(bv) {
    var T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100, r, g, b;
    r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
    b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    var cl = function (x) { return Math.max(0, Math.min(255, x | 0)); };
    return 'rgb(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ')';
  }

  /* ---------- elements ---------- */
  function parseTLE(txt) {
    var L = txt.split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ''); }).filter(Boolean), out = [];
    for (var i = 0; i + 2 < L.length; i++) {
      if (L[i + 1][0] === '1' && L[i + 2][0] === '2') {
        var rec = satellite.twoline2satrec(L[i + 1], L[i + 2]);
        var name = L[i].trim(), short = name.replace('SENTINEL-', 'S');
        out.push({ name: name, short: short, rec: rec, norad: +L[i + 1].slice(2, 7), epoch: (rec.jdsatepoch + (rec.jdsatepochF || 0) - 2440587.5) * 86400000, track: [], state: null });
        i += 2;
      }
    }
    return out;
  }
  function cached() { try { var c = JSON.parse(localStorage.getItem('vx-tle') || 'null'); if (c && Date.now() - c.at < 2 * 3600e3) return c; } catch (e) {} return null; }
  function loadElements() {
    var c = cached();
    if (c) return Promise.resolve({ txt: c.txt, from: 'celestrak.org', fetched: c.at });
    // CelesTrak throttles repeat callers; give it a few seconds, then fall back to the dated snapshot
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, 6000);
    return fetch(TLE_LIVE, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (txt) {
      if (!/^1 \d{5}/m.test(txt)) throw new Error('no elements');
      try { localStorage.setItem('vx-tle', JSON.stringify({ at: Date.now(), txt: txt })); } catch (e) {}
      return { txt: txt, from: 'celestrak.org', fetched: Date.now() };
    }).catch(function () {
      return fetch(TLE_SNAPSHOT).then(function (r) { return r.text(); }).then(function (txt) { return { txt: txt, from: 'vortx.ai snapshot (celestrak.org unreachable)', fetched: null }; });
    });
  }
  function stateAt(sat, date) {
    var pv = satellite.propagate(sat.rec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    var g = gmst(date), e = satellite.eciToEcf(pv.position, g), geo = satellite.eciToGeodetic(pv.position, g);
    return { p: [e.x / RE, e.y / RE, e.z / RE], lat: satellite.degreesLat(geo.latitude), lon: satellite.degreesLong(geo.longitude), alt: geo.height, v: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) };
  }
  function computeTracks(t) {
    S.sats.forEach(function (sat) {
      var pts = [];
      for (var k = -45; k <= 45; k += 0.5) {
        var st = stateAt(sat, new Date(t + k * 60000));
        if (st) pts.push({ u: norm(st.p), k: k, sun: 0 });
      }
      var sun = sunEcef(new Date(t));
      pts.forEach(function (q) { q.sun = dot(q.u, sun); });
      sat.track = pts;
    });
    S.lastTrack = t;
  }

  /* ---------- next daylight pass inside the swath ---------- */
  function nextPass(place, from, cb) {
    if (!place || !S.sats.length) return;
    var P = ll(place.lat, place.lng), horizon = 6 * 86400e3, step = 30e3, t = from, best = null, token = {};
    S.nextJob = token;
    var prev = S.sats.map(function () { return { d: Infinity, dd: -1 }; });
    function angKm(sat, tt) { var st = stateAt(sat, new Date(tt)); return st ? Math.acos(Math.min(1, dot(norm(st.p), P))) * RMEAN : Infinity; }
    (function slice() {
      if (S.nextJob !== token) return;
      var end = Math.min(t + 2400 * step, from + horizon);
      for (; t < end; t += step) {
        for (var i = 0; i < S.sats.length; i++) {
          var d = angKm(S.sats[i], t), pr = prev[i];
          if (pr.dd < 0 && d > pr.d && pr.d < HALF_SWATH * 1.3) {
            // a minimum just passed: refine to 1 s, then keep it if it is a daylight pass inside the swath
            var lo = t - 2 * step, hi = t, bt = lo, bd = Infinity;
            for (var q = lo; q <= hi; q += 1000) { var dq = angKm(S.sats[i], q); if (dq < bd) { bd = dq; bt = q; } }
            var sunEl = Math.asin(dot(sunEcef(new Date(bt)), P)) / DEG;
            if (bd <= HALF_SWATH && sunEl > 0 && (!best || bt < best.t)) best = { t: bt, sat: S.sats[i], km: bd, sunEl: sunEl };
          }
          pr.dd = d - pr.d; pr.d = d;
        }
        // time only moves forward, so the first qualifying pass found is the earliest
        if (best) { cb(best); return; }
      }
      if (t >= from + horizon) { cb(null); return; }
      setTimeout(slice, 0);
    })();
  }

  /* ---------- WebGL earth ---------- */
  var gl = null, prog = null, U = {}, tex = { day: null, night: null }, ready = false;
  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'varying vec2 v;uniform vec3 uPos,uFwd,uUp,uRight,uSun;uniform float uTan,uAsp;uniform sampler2D uDay,uNight;',
    'const float PI=3.14159265359;',
    'vec4 tex(sampler2D s,float lon,float lat){',
    '  float u1=fract(lon/(2.*PI)+.5),u2=fract(lon/(2.*PI))-.5;float vv=.5-lat/PI;',
    '  float u=fwidth(u1)<=fwidth(u2)+1e-6?u1:u2;return texture2D(s,vec2(u,vv));}',
    'void main(){',
    '  vec3 rd=normalize(uFwd+v.x*uTan*uAsp*uRight+v.y*uTan*uUp);vec3 ro=uPos;',
    '  float b=dot(ro,rd),c=dot(ro,ro)-1.,h=b*b-c;',
    '  vec3 pc=ro+rd*(-b);float dca=length(pc);',
    '  vec3 atm=vec3(.33,.58,1.);',
    '  if(h<0.){',
    '    float g=clamp(1.-(dca-1.)/.045,0.,1.);g=g*g*g;float lit=smoothstep(-.35,.45,dot(normalize(pc),uSun));',
    '    vec3 col=mix(vec3(.9,.45,.2),atm,smoothstep(-.1,.4,dot(normalize(pc),uSun)))*g*(.08+.92*lit);',
    '    gl_FragColor=vec4(col,g*(.15+.85*lit));return;}',
    '  vec3 n=normalize(ro+rd*(-b-sqrt(h)));',
    '  float lat=asin(clamp(n.z,-1.,1.)),lon=atan(n.y,n.x);',
    '  vec3 day=tex(uDay,lon,lat).rgb,night=tex(uNight,lon,lat).rgb;',
    '  float mu=dot(n,uSun);float dm=smoothstep(-.09,.13,mu);',
    '  vec3 d=day*(.06+1.02*pow(max(mu,0.),.75));',
    '  float ocean=clamp((day.b-day.r*1.05)*6.,0.,1.)*(1.-smoothstep(.25,.45,dot(day,vec3(.33))));',
    '  vec3 rf=reflect(-uSun,n);float gl=pow(max(dot(rf,-rd),0.),90.)*ocean*step(0.,mu);',
    '  vec3 nl=pow(night,vec3(1.35))*vec3(1.35,1.1,.8)*1.6;',
    '  vec3 col=mix(nl,d,dm)+gl*vec3(1.,.93,.8)*.9;',
    '  float rim=pow(1.-max(dot(n,-rd),0.),2.4);',
    '  col+=mix(vec3(.9,.4,.15),atm,smoothstep(-.05,.35,mu))*rim*smoothstep(-.25,.3,mu)*.85;',
    '  gl_FragColor=vec4(col,1.);}'
  ].join('\n');
  function initGL() {
    try { gl = glc.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: true }); } catch (e) { gl = null; }
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return false;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    try {
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { gl = null; return false; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uPos', 'uFwd', 'uUp', 'uRight', 'uSun', 'uTan', 'uAsp', 'uDay', 'uNight'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    gl.uniform1i(U.uDay, 0); gl.uniform1i(U.uNight, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }
  function loadTex(unit, url) {
    return new Promise(function (res, rej) {
      var img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      img.onload = function () {
        var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        res(t);
      };
      img.onerror = rej; img.src = url;
    });
  }
  function drawEarth(cam, sun) {
    if (!gl || !ready) return;
    gl.viewport(0, 0, glc.width, glc.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform3fv(U.uPos, cam.pos); gl.uniform3fv(U.uFwd, cam.fwd); gl.uniform3fv(U.uUp, cam.up); gl.uniform3fv(U.uRight, cam.right);
    gl.uniform3fv(U.uSun, sun); gl.uniform1f(U.uTan, S.tanHalf); gl.uniform1f(U.uAsp, S.W / S.H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 2D layers ---------- */
  var sx = sky.getContext('2d'), ox = over.getContext('2d');
  function drawSky(cam, date) {
    sx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); sx.clearRect(0, 0, S.W, S.H);
    if (!S.stars.length) return;
    var g = gmst(date), M = precessMatrix(date);
    for (var i = 0; i < S.stars.length; i++) {
      var st = S.stars[i], e = eciToEcef(mul(M, st.u), g), z = dot(e, cam.fwd);
      if (z <= 0.2) continue;
      var x = S.W / 2 + cam.f * dot(e, cam.right) / z, y = S.H / 2 - cam.f * dot(e, cam.up) / z;
      if (x < -4 || y < -4 || x > S.W + 4 || y > S.H + 4) continue;
      var r = Math.max(0.35, 1.9 - 0.34 * st.m);
      sx.globalAlpha = Math.max(0.18, Math.min(1, 1.15 - 0.17 * st.m));
      sx.fillStyle = st.c; sx.beginPath(); sx.arc(x, y, r, 0, 2 * Math.PI); sx.fill();
    }
    sx.globalAlpha = 1;
  }
  function trackPath(cam, pts, lift, strokeFn) {
    var seg = [];
    function flush() { if (seg.length > 1) strokeFn(seg); seg = []; }
    for (var i = 0; i < pts.length; i++) {
      var P = scale(pts[i].u, lift);
      if (!surfaceVisible(cam, pts[i].u)) { flush(); continue; }
      var q = project(cam, P); if (!q) { flush(); continue; }
      q.k = pts[i].k; q.sun = pts[i].sun; seg.push(q);
    }
    flush();
  }
  function swathEdges(pts) {
    var a = Math.tan(HALF_SWATH / RMEAN), L = [], R = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i].u, pa = pts[Math.max(0, i - 1)].u, pb = pts[Math.min(pts.length - 1, i + 1)].u;
      var along = norm(sub(pb, pa)), c = norm(cross(p, along));
      L.push({ u: norm(add(p, scale(c, a))), k: pts[i].k, sun: pts[i].sun });
      R.push({ u: norm(sub(p, scale(c, a))), k: pts[i].k, sun: pts[i].sun });
    }
    return [L, R];
  }
  // satellite hues stay clear of the semantic colours (green = verified here, amber = claimed, red = failed)
  var COLORS = { S2A: '#8fb8ff', S2B: '#ff9f7a', S2C: '#cda8ff' };
  var MONO = '';
  function mono() { if (!MONO) MONO = (getComputedStyle(document.documentElement).getPropertyValue('--mono') || '').trim() || 'ui-monospace, monospace'; return MONO; }
  function drawOver(cam, t) {
    ox.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ox.clearRect(0, 0, S.W, S.H);
    ox.lineCap = 'round'; ox.lineJoin = 'round';
    S.sats.forEach(function (sat) {
      var col = COLORS[sat.short] || '#ddd';
      if (sat.track.length) {
        // swath: the 290 km ribbon the imager sweeps; brighter where the ground is sunlit (MSI images in daylight)
        var e = swathEdges(sat.track);
        [e[0], e[1]].forEach(function (edge) {
          trackPath(cam, edge, 1.0005, function (seg) {
            for (var i = 1; i < seg.length; i++) {
              ox.strokeStyle = col; ox.globalAlpha = seg[i].sun > 0 ? 0.32 : 0.07; ox.lineWidth = 0.8;
              ox.beginPath(); ox.moveTo(seg[i - 1].x, seg[i - 1].y); ox.lineTo(seg[i].x, seg[i].y); ox.stroke();
            }
          });
        });
        trackPath(cam, sat.track, 1.001, function (seg) {
          for (var i = 1; i < seg.length; i++) {
            var fut = seg[i].k > 0;
            ox.strokeStyle = col; ox.globalAlpha = (fut ? 0.55 : 0.9) * (seg[i].sun > 0 ? 1 : 0.45); ox.lineWidth = fut ? 1 : 1.6;
            ox.setLineDash(fut ? [3, 4] : []);
            ox.beginPath(); ox.moveTo(seg[i - 1].x, seg[i - 1].y); ox.lineTo(seg[i].x, seg[i].y); ox.stroke();
          }
          ox.setLineDash([]);
        });
      }
      var st = sat.state; if (!st) return;
      var q = project(cam, st.p); if (!q || occluded(cam, st.p)) return;
      var sp = project(cam, norm(st.p));
      if (sp && surfaceVisible(cam, norm(st.p))) { ox.globalAlpha = 0.35; ox.strokeStyle = col; ox.lineWidth = 0.8; ox.beginPath(); ox.moveTo(q.x, q.y); ox.lineTo(sp.x, sp.y); ox.stroke(); }
      ox.globalAlpha = 1;
      var gr = ox.createRadialGradient(q.x, q.y, 0, q.x, q.y, 14); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ox.fillStyle = gr; ox.globalAlpha = 0.5; ox.beginPath(); ox.arc(q.x, q.y, 14, 0, 2 * Math.PI); ox.fill();
      ox.globalAlpha = 1; ox.fillStyle = '#fff'; ox.beginPath(); ox.arc(q.x, q.y, 2.6, 0, 2 * Math.PI); ox.fill();
      ox.font = '600 11px ' + mono(); ox.fillStyle = col;
      ox.fillText(sat.short, q.x + 9, q.y - 8);
    });
    if (S.place) {
      var P = ll(S.place.lat, S.place.lng);
      if (surfaceVisible(cam, P)) {
        var q = project(cam, P);
        ox.globalAlpha = 1; ox.strokeStyle = '#fff'; ox.lineWidth = 1.2;
        ox.beginPath(); ox.arc(q.x, q.y, 5, 0, 2 * Math.PI); ox.stroke();
        ox.beginPath(); ox.moveTo(q.x - 10, q.y); ox.lineTo(q.x - 6, q.y); ox.moveTo(q.x + 6, q.y); ox.lineTo(q.x + 10, q.y);
        ox.moveTo(q.x, q.y - 10); ox.lineTo(q.x, q.y - 6); ox.moveTo(q.x, q.y + 6); ox.lineTo(q.x, q.y + 10); ox.stroke();
        ox.font = '500 11px ' + mono(); ox.fillStyle = '#fff';
        ox.fillText(S.place.name, q.x + 13, q.y + 4);
      }
    }
    ox.globalAlpha = 1;
  }

  /* ---------- 2D fallback: equirectangular map, when WebGL is absent ---------- */
  var flat = null;
  function drawFlat(t) {
    if (!flat) return;
    ox.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ox.clearRect(0, 0, S.W, S.H);
    var w = S.W, h = w / 2, y0 = (S.H - h) / 2;
    ox.drawImage(flat, 0, y0, w, h);
    S.sats.forEach(function (sat) {
      if (!sat.state) return;
      var x = (sat.state.lon + 180) / 360 * w, y = y0 + (90 - sat.state.lat) / 180 * h;
      ox.fillStyle = COLORS[sat.short] || '#fff'; ox.beginPath(); ox.arc(x, y, 3, 0, 2 * Math.PI); ox.fill();
      ox.fillText(sat.short, x + 6, y - 6);
    });
  }

  /* ---------- sizing ---------- */
  function resize() {
    var r = stage.getBoundingClientRect();
    S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    [sky, glc, over].forEach(function (c) { c.width = Math.round(S.W * S.dpr); c.height = Math.round(S.H * S.dpr); c.style.width = S.W + 'px'; c.style.height = S.H + 'px'; });
    // keep the orbit shell (1.124 R) inside the shorter side
    var fitH = Math.asin(1.13 / S.d) * 1.08;
    var aspect = S.W / S.H;
    S.tanHalf = aspect >= 1 ? Math.tan(fitH) : Math.tan(fitH) / aspect;
    S.dirty = true;
  }

  /* ---------- readout (verb lines, recomputed every half second) ---------- */
  function f2(x) { return (Math.abs(x)).toFixed(2); }
  function ns(lat) { return f2(lat) + '°' + (lat >= 0 ? 'N' : 'S'); }
  function ew(lon) { return f2(lon) + '°' + (lon >= 0 ? 'E' : 'W'); }
  function hm(ms) { var s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + ' d ' : '') + (d || h ? h + ' h ' : '') + m + ' min'; }
  function utc(t) { return new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  function setLine(key, html) { var el = readout && readout.querySelector('[data-k="' + key + '"]'); if (el && el.innerHTML !== html) el.innerHTML = html; }
  function updateReadout(t, sun) {
    if (!readout) return;
    S.sats.forEach(function (sat) {
      var st = sat.state; if (!st) return;
      var sunAt = dot(norm(st.p), sun) > 0 ? 'day' : 'night';
      setLine(sat.short, '<b class="v" style="color:' + (COLORS[sat.short] || '#fff') + '">track</b> <span>' + sat.short + '</span> <i>' + ns(st.lat) + ' ' + ew(st.lon) + '</i> <i>alt ' + st.alt.toFixed(1) + ' km</i> <i>v ' + st.v.toFixed(3) + ' km/s</i> <i>' + sunAt + '</i>');
    });
    var ss = subsolar(sun);
    setLine('sun', '<b class="v">light</b> <span>subsolar</span> <i>' + ns(ss.lat) + ' ' + ew(ss.lon) + '</i> <i>' + utc(t) + (S.warp !== 1 ? ' · warp ×' + S.warp : '') + '</i>');
    if (S.elements) {
      var ep = Math.max.apply(null, S.sats.map(function (s) { return s.epoch; }));
      setLine('el', '<b class="v">load</b> <span>elements</span> <i>' + S.elements.from + '</i> <i>epoch ' + utc(ep).slice(0, 16) + '</i> <i>age ' + hm(Date.now() - ep) + '</i>');
    }
    if (S.next && S.place) {
      var n = S.next;
      setLine('next', n.none ? '<b class="v">next</b> <span>pass</span> <i>no daylight pass inside the swath in 6 d</i>' :
        '<b class="v">next</b> <span>' + n.sat.short + ' over ' + S.place.name + '</span> <i>' + utc(n.t).slice(0, 16) + '</i> <i>in ' + hm(n.t - Date.now()) + '</i> <i>' + n.km.toFixed(0) + ' km cross-track</i> <i>sun ' + n.sunEl.toFixed(0) + '°</i>');
    }
  }

  /* ---------- loop ---------- */
  var lastSky = 0, lastRead = 0, raf = 0;
  function frame() {
    raf = 0;
    if (!S.visible || document.hidden) return;
    var t = simNow(), date = new Date(t), cam = camera(), sun = sunEcef(date);
    S.sats.forEach(function (sat) { sat.state = stateAt(sat, date); });
    if (S.follow && S.follow.state && !S.dragging) { S.lat0 = S.follow.state.lat; S.lon0 = S.follow.state.lon; cam = camera(); S.dirty = true; }
    if (Math.abs(t - S.lastTrack) > 20000) computeTracks(t);
    if (gl) drawEarth(cam, sun);
    if (S.dirty || performance.now() - lastSky > 4000) { drawSky(cam, date); lastSky = performance.now(); S.dirty = false; }
    if (gl) drawOver(cam, t); else drawFlat(t);
    if (performance.now() - lastRead > 500) { updateReadout(t, sun); lastRead = performance.now(); }
    schedule();
  }
  // frame budget follows the motion: at x1 a satellite crosses about 0.3 px a second on this globe,
  // so four frames a second are plenty; warps and drags get full frame rate; reduced motion gets one
  function interval() {
    if (S.dragging || S.warp >= 600) return 0;
    if (S.warp >= 60) return 33;
    return reduce ? 1000 : 250;
  }
  function schedule() {
    if (raf) return;
    var ms = interval();
    if (!ms) { raf = requestAnimationFrame(frame); return; }
    raf = -1;
    setTimeout(function () { if (raf === -1) raf = requestAnimationFrame(frame); }, ms);
  }
  function kick() { if (raf === -1 || !raf) raf = requestAnimationFrame(frame); }

  /* ---------- interaction ---------- */
  var drag = null;
  over.addEventListener('pointerdown', function (e) { S.user = true; drag = { x: e.clientX, y: e.clientY, lat: S.lat0, lon: S.lon0 }; S.dragging = true; S.follow = null; over.setPointerCapture(e.pointerId); markControls(); });
  over.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var k = 0.25 * (3.25 / S.d);
    S.lon0 = drag.lon - (e.clientX - drag.x) * k;
    S.lat0 = Math.max(-85, Math.min(85, drag.lat + (e.clientY - drag.y) * k));
    S.dirty = true; kick();
  });
  function endDrag() { drag = null; S.dragging = false; }
  over.addEventListener('pointerup', endDrag); over.addEventListener('pointercancel', endDrag);
  over.addEventListener('dblclick', function () { if (S.place) { S.lat0 = S.place.lat; S.lon0 = S.place.lng; S.follow = null; S.dirty = true; markControls(); kick(); } });
  over.addEventListener('keydown', function (e) {
    var m = { ArrowLeft: [0, -5], ArrowRight: [0, 5], ArrowUp: [5, 0], ArrowDown: [-5, 0] }[e.key];
    if (!m) return; e.preventDefault(); S.follow = null; S.lat0 = Math.max(-85, Math.min(85, S.lat0 + m[0])); S.lon0 += m[1]; S.dirty = true; markControls(); kick();
  });
  function markControls() {
    document.querySelectorAll('[data-orbit-follow]').forEach(function (b) { b.setAttribute('aria-pressed', S.follow && S.follow.short === b.getAttribute('data-orbit-follow') ? 'true' : 'false'); });
    document.querySelectorAll('[data-orbit-warp]').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-orbit-warp') === S.warp ? 'true' : 'false'); });
    document.querySelectorAll('[data-orbit-hold]').forEach(function (b) { b.setAttribute('aria-pressed', !S.follow ? 'true' : 'false'); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-orbit-follow],[data-orbit-warp],[data-orbit-hold]');
    if (!b) return;
    S.user = true;
    if (b.hasAttribute('data-orbit-follow')) { var s = S.sats.filter(function (x) { return x.short === b.getAttribute('data-orbit-follow'); })[0]; if (s) S.follow = s; }
    if (b.hasAttribute('data-orbit-warp')) setWarp(+b.getAttribute('data-orbit-warp'));
    if (b.hasAttribute('data-orbit-hold')) { S.follow = null; if (S.place) { S.lat0 = S.place.lat; S.lon0 = S.place.lng; } }
    S.dirty = true; markControls(); kick();
  });

  // the handoff tells the sky which place it is looking at
  function setPlace(p) {
    S.place = p; S.next = null;
    if (!S.follow) { S.lat0 = p.lat; S.lon0 = p.lng; }
    S.dirty = true; kick();
    nextPass(p, Date.now(), function (best) { S.next = best || { none: true }; lastRead = 0; kick(); });
  }
  document.addEventListener('vx:place', function (e) { if (e.detail) setPlace(e.detail); });

  /* ---------- boot ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { S.visible = en[0].isIntersecting; if (S.visible) kick(); }, { rootMargin: '120px' }).observe(stage);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  window.addEventListener('resize', function () { resize(); kick(); });
  resize();

  var big = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) > 1600;
  var hasGL = initGL();
  var texDay = '/assets/earth/day-1024.webp', texNight = '/assets/earth/night-1024.webp';
  if (hasGL) {
    Promise.all([loadTex(0, texDay), loadTex(1, texNight)]).then(function () {
      ready = true; stage.classList.add('is-lit'); kick();
      if (big) Promise.all([loadTex(0, '/assets/earth/day-2048.webp'), loadTex(1, '/assets/earth/night-2048.webp')]).then(kick).catch(function () {});
    }).catch(function () { stage.classList.add('is-lit'); });
  } else {
    stage.classList.add('is-flat', 'is-lit');
    flat = new Image(); flat.onload = kick; flat.src = texDay;
  }
  fetch('/data/stars.json').then(function (r) { return r.json(); }).then(function (j) {
    S.stars = j.stars.map(function (s) {
      var ra = s[0] * DEG, de = s[1] * DEG;
      return { u: [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)], m: s[2], c: starRGB(s[3]) };
    });
    S.dirty = true; kick();
  }).catch(function () {});
  loadElements().then(function (el) {
    S.elements = el; S.sats = parseTLE(el.txt);
    stage.setAttribute('data-sats', S.sats.map(function (s) { return s.short; }).join(' '));
    computeTracks(simNow());
    // open on the satellite over the day side (the optical imager works in daylight), until the visitor steers
    if (!S.user) {
      var d0 = new Date(simNow()), sun0 = sunEcef(d0), pick = null, best = 0;
      S.sats.forEach(function (sat) { var st = stateAt(sat, d0); if (st) { var el = dot(norm(st.p), sun0); if (el > best) { best = el; pick = sat; } } });
      if (pick) S.follow = pick;
    }
    if (S.place) setPlace(S.place);
    markControls(); kick();
    document.dispatchEvent(new CustomEvent('vx:elements', { detail: { from: el.from, sats: S.sats.map(function (s) { return { name: s.name, norad: s.norad, epoch: s.epoch }; }) } }));
  });
  // default place until the handoff names one
  var def = stage.getAttribute('data-place');
  if (def) { var p = def.split(','); setPlace({ name: p[0], lat: +p[1], lng: +p[2] }); }
  markControls();
  kick();
})();
