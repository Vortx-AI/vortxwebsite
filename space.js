(function () {
  'use strict';

  var BOOT_LINES = [
    '[sys] vortx.ai ground segment ...... ok',
    '[sys] emem protocol v3.1 ........... ok',
    '[sys] ed25519 signer ............... ok',
    '[sys] blake3 integrity ............. ok',
    '[sys] satellite uplink ............. ok',
    '[sys] observatory online ...........'
  ];

  var TEAL = '#c9f58a';
  var BG = '#08090c';
  var STAR_COLORS = ['#ffffff', '#aaccff', '#ffeedd'];
  var FPS_INTERVAL = 1000 / 15;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rand(a, b) { return Math.random() * (b - a) + a; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function makeStars(w, h, count, rMin, rMax, oMin, oMax) {
    var stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: rand(0, w), y: rand(0, h),
        r: rand(rMin, rMax),
        baseO: rand(oMin, oMax), o: 0,
        color: STAR_COLORS[Math.floor(rand(0, STAR_COLORS.length))],
        twinklePhase: rand(0, Math.PI * 2),
        twinkleSpeed: rand(0.5, 2)
      });
    }
    return stars;
  }

  // --- Star field canvas ---
  function initStarField() {
    var canvas = document.createElement('canvas');
    canvas.id = 'space-stars';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    var w, h, farStars, midStars, nearStars, scrollY = 0, lastFrame = 0;
    var warpStart = 0, warping = false;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      farStars = makeStars(w, h * 2, 150, 0.5, 1, 0.3, 0.6);
      midStars = makeStars(w, h * 2, 60, 1, 1.5, 0.4, 0.8);
      nearStars = makeStars(w, h * 2, 20, 1.5, 2, 0.6, 1.0);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', function () { scrollY = window.pageYOffset; }, { passive: true });

    var mo = new MutationObserver(function () {
      if (canvas.classList.contains('warp') && !warping) {
        warping = true;
        warpStart = performance.now();
        setTimeout(function () {
          canvas.classList.remove('warp');
          warping = false;
        }, 600);
      }
    });
    mo.observe(canvas, { attributes: true, attributeFilter: ['class'] });

    var hidden = false;
    document.addEventListener('visibilitychange', function () { hidden = document.hidden; });

    function drawStars(stars, parallax, now) {
      var warpT = warping ? Math.min((now - warpStart) / 600, 1) : 0;
      var cx = w / 2, cy = h / 2;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var sy = s.y - scrollY * parallax;
        sy = ((sy % (h * 2)) + h * 2) % (h * 2) - h * 0.5;
        s.o = s.baseO + Math.sin(s.twinklePhase + now * 0.001 * s.twinkleSpeed) * 0.15;
        ctx.globalAlpha = Math.max(0, Math.min(1, s.o));
        ctx.fillStyle = s.color;

        if (warpT > 0 && !reducedMotion) {
          var dx = s.x - cx, dy = sy - cy;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx = dx / dist, ny = dy / dist;
          var streak = lerp(0, rand(2, 8), warpT);
          ctx.beginPath();
          ctx.moveTo(s.x, sy);
          ctx.lineTo(s.x + nx * streak, sy + ny * streak);
          ctx.lineWidth = s.r;
          ctx.strokeStyle = s.color;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function frame(now) {
      if (hidden) { requestAnimationFrame(frame); return; }
      if (now - lastFrame < FPS_INTERVAL) { requestAnimationFrame(frame); return; }
      lastFrame = now;
      ctx.clearRect(0, 0, w, h);

      if (reducedMotion) {
        drawStars(farStars, 0, 0);
        drawStars(midStars, 0, 0);
        drawStars(nearStars, 0, 0);
        return;
      }

      drawStars(farStars, 0, now);
      drawStars(midStars, 0.02, now);
      drawStars(nearStars, 0.05, now);
      requestAnimationFrame(frame);
    }

    if (reducedMotion) { frame(0); } else { requestAnimationFrame(frame); }
    return canvas;
  }

  // --- Preloader with Vortx planet logo ---
  function initPreloader(starCanvas) {
    var el = document.createElement('div');
    el.id = 'space-preloader';
    el.innerHTML =
      '<canvas id="preloader-stars"></canvas>' +
      '<div id="preloader-content">' +
        '<div id="preloader-planet">' +
          '<div class="planet-glow"></div>' +
          '<img src="assets/vortx-logo.png" alt="" width="120" height="120" draggable="false">' +
          '<div class="planet-ring"></div>' +
        '</div>' +
        '<div id="boot-log"></div>' +
      '</div>';

    var style = document.createElement('style');
    style.textContent =
      '#space-preloader{position:fixed;inset:0;z-index:99999;background:' + BG + ';display:flex;align-items:center;justify-content:center;}' +
      '#preloader-stars{position:absolute;inset:0;}' +
      '#preloader-content{position:relative;z-index:1;text-align:center;display:flex;flex-direction:column;align-items:center;}' +

      '#preloader-planet{position:relative;width:120px;height:120px;margin-bottom:32px;}' +
      '#preloader-planet img{width:120px;height:120px;border-radius:50%;position:relative;z-index:2;' +
        'animation:planet-spin 8s linear infinite;' +
        'box-shadow:0 0 40px rgba(201,245,138,0.15),0 0 80px rgba(201,245,138,0.06),inset -20px -5px 30px rgba(0,0,0,0.5);}' +
      '.planet-glow{position:absolute;inset:-15px;border-radius:50%;z-index:1;' +
        'background:radial-gradient(circle,rgba(201,245,138,0.12) 0%,rgba(201,245,138,0.04) 50%,transparent 70%);' +
        'animation:planet-breathe 3s ease-in-out infinite;}' +
      '.planet-ring{position:absolute;top:50%;left:50%;width:180px;height:50px;margin:-25px 0 0 -90px;z-index:3;' +
        'border:1px solid rgba(201,245,138,0.18);border-radius:50%;' +
        'transform:rotateX(70deg) rotateZ(-20deg);' +
        'animation:ring-spin 6s linear infinite;' +
        'box-shadow:0 0 12px rgba(201,245,138,0.08);}' +

      '@keyframes planet-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
      '@keyframes planet-breathe{0%,100%{opacity:0.6;transform:scale(0.95)}50%{opacity:1;transform:scale(1.05)}}' +
      '@keyframes ring-spin{from{transform:rotateX(70deg) rotateZ(-20deg)}to{transform:rotateX(70deg) rotateZ(340deg)}}' +

      '#boot-log{font-family:monospace;font-size:12px;color:#5a6878;text-align:left;line-height:1.8;min-height:160px;white-space:pre;}' +
      '#boot-log .ok{color:' + TEAL + ';}' +
      '#space-preloader.fade{opacity:0;transition:opacity 0.8s ease;}' +

      '@media(prefers-reduced-motion:reduce){' +
        '#preloader-planet img,.planet-glow,.planet-ring{animation:none!important}' +
        '#space-preloader.fade{transition:none;}' +
      '}';
    document.head.appendChild(style);
    document.body.appendChild(el);

    // Preloader star canvas
    var pc = document.getElementById('preloader-stars');
    var pctx = pc.getContext('2d');
    pc.width = window.innerWidth;
    pc.height = window.innerHeight;
    var pStars = makeStars(pc.width, pc.height, 120, 0.5, 1.2, 0.15, 0.45);
    pStars.forEach(function (s) {
      pctx.globalAlpha = s.baseO;
      pctx.fillStyle = s.color;
      pctx.beginPath();
      pctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      pctx.fill();
    });

    // Boot sequence
    var log = document.getElementById('boot-log');
    var lineIdx = 0;

    function typeLine() {
      if (lineIdx >= BOOT_LINES.length) {
        setTimeout(finishPreloader, 500);
        return;
      }
      var raw = BOOT_LINES[lineIdx];
      var hasOk = raw.endsWith(' ok');
      var text = hasOk ? raw.slice(0, raw.length - 2) : raw;

      var span = document.createElement('span');
      span.textContent = text;
      if (lineIdx > 0) log.appendChild(document.createTextNode('\n'));
      log.appendChild(span);

      if (hasOk) {
        setTimeout(function () {
          var okSpan = document.createElement('span');
          okSpan.className = 'ok';
          okSpan.textContent = 'ok';
          span.appendChild(okSpan);
          lineIdx++;
          setTimeout(typeLine, 250);
        }, 180);
      } else {
        lineIdx++;
        setTimeout(typeLine, 250);
      }
    }

    function finishPreloader() {
      if (starCanvas) starCanvas.classList.add('warp');
      el.classList.add('fade');
      setTimeout(function () {
        el.remove();
        style.remove();
      }, 800);
    }

    setTimeout(typeLine, 500);
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    var starCanvas = initStarField();
    initPreloader(starCanvas);
  });
})();
