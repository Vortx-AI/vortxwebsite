/* ============================================================
   Vortx AI — Main JavaScript
   Particle Globe · Scroll Animations · Nav
   ============================================================ */

(function () {
  'use strict';

  // --- Nav Scroll Effect ---
  const nav = document.getElementById('nav');
  let ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Mobile Nav Toggle ---
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      links.classList.toggle('open');
      document.body.style.overflow = links.classList.contains('open') ? 'hidden' : '';
    });

    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        toggle.classList.remove('active');
        links.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // --- Scroll-Triggered Animations (Intersection Observer) ---
  const sections = document.querySelectorAll('.section');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  sections.forEach(s => observer.observe(s));

  // --- Smooth Anchor Scrolling ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ==========================================================
  // ADAPTIVE CARDS — 3D tilt, cursor glow, gradient borders
  // ==========================================================
  const cards = document.querySelectorAll('.theory-card, .frontier-card, .product-step');

  cards.forEach(card => {
    // Inject inner glow element
    const glow = document.createElement('div');
    glow.className = 'card-glow';
    card.appendChild(glow);

    // Inject gradient border element (theory + product only)
    if (card.classList.contains('theory-card') || card.classList.contains('product-step')) {
      const border = document.createElement('div');
      border.className = 'gradient-border';
      card.appendChild(border);
    }

    // 3D tilt + cursor glow tracking
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Tilt angles (subtle — max 4 degrees)
      const rotateY = ((x - centerX) / centerX) * 4;
      const rotateX = ((centerY - y) / centerY) * 4;

      card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;

      // Update glow position
      const glowX = ((x / rect.width) * 100).toFixed(1);
      const glowY = ((y / rect.height) * 100).toFixed(1);
      glow.style.setProperty('--glow-x', glowX + '%');
      glow.style.setProperty('--glow-y', glowY + '%');
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // --- Particle Globe ---
  const canvas = document.getElementById('globe-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, centerX, centerY, radius;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let animId;

  const PARTICLE_COUNT = 1800;
  const ROTATION_SPEED = 0.0006;
  const particles = [];

  // Generate particles on sphere surface (Fibonacci sphere distribution)
  function generateParticles() {
    particles.length = 0;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
      const phi = 2 * Math.PI * i / goldenRatio;

      particles.push({
        theta,
        phi,
        x: Math.sin(theta) * Math.cos(phi),
        y: Math.sin(theta) * Math.sin(phi),
        z: Math.cos(theta),
        size: Math.random() * 1.2 + 0.5,
        brightness: Math.random() * 0.5 + 0.5,
      });
    }
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = width / 2;
    centerY = height / 2;
    radius = Math.min(width, height) * 0.38;
  }

  let angle = 0;
  let mouseX = 0;
  let mouseY = 0;
  let targetRotX = 0;
  let targetRotY = 0;
  let rotX = 0;
  let rotY = 0;

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left - rect.width / 2) / rect.width;
    mouseY = (e.clientY - rect.top - rect.height / 2) / rect.height;
    targetRotX = mouseY * 0.3;
    targetRotY = mouseX * 0.3;
  });

  canvas.addEventListener('mouseleave', () => {
    targetRotX = 0;
    targetRotY = 0;
  });

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    angle += ROTATION_SPEED;

    // Smooth mouse-following
    rotX += (targetRotX - rotX) * 0.04;
    rotY += (targetRotY - rotY) * 0.04;

    const cosA = Math.cos(angle + rotY);
    const sinA = Math.sin(angle + rotY);
    const cosB = Math.cos(rotX);
    const sinB = Math.sin(rotX);

    // Sort particles by depth for proper rendering
    const projected = [];

    for (const p of particles) {
      // Rotate around Y axis
      let x = p.x * cosA - p.z * sinA;
      let z = p.x * sinA + p.z * cosA;
      let y = p.y;

      // Rotate around X axis
      let y2 = y * cosB - z * sinB;
      let z2 = y * sinB + z * cosB;

      // Perspective projection
      const scale = 1 / (1 + z2 * 0.3);
      const px = centerX + x * radius * scale;
      const py = centerY + y2 * radius * scale;

      const depth = (z2 + 1) / 2; // Normalize 0..1

      projected.push({
        px, py, depth, size: p.size * scale, brightness: p.brightness
      });
    }

    // Sort back-to-front
    projected.sort((a, b) => a.depth - b.depth);

    for (const p of projected) {
      const alpha = p.depth * 0.85 + 0.15;
      // Nebula gradient: deep emerald → teal → warm gold based on depth
      const t = p.depth;
      const r = Math.round(30 + t * 200);   // 30 → 230 (emerald → gold)
      const g = Math.round(171 + t * 16);   // 171 → 187 (stays green-warm)
      const b = Math.round(146 - t * 50);   // 146 → 96 (teal → amber)

      ctx.beginPath();
      ctx.arc(p.px, p.py, p.size * p.brightness, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(alpha * 0.75).toFixed(2)})`;
      ctx.fill();
    }

    // Draw a subtle equator ring
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 1.02, radius * 0.15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(53, 187, 154, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    animId = requestAnimationFrame(draw);
  }

  generateParticles();
  resize();
  draw(0);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      resize();
    }, 150);
  });

  // Pause animation when not visible (perf)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animId);
    } else {
      animId = requestAnimationFrame(draw);
    }
  });

  // ==========================================================
  // THE DESCENT — Deep Space Canvas
  // Star field with parallax + vertical data transmission beam
  // ==========================================================
  const spaceCanvas = document.getElementById('space-canvas');
  if (spaceCanvas) {
    const sCtx = spaceCanvas.getContext('2d');
    const sDpr = Math.min(window.devicePixelRatio || 1, 2);
    let sW, sH;
    const STAR_LAYERS = 3;
    const stars = [[], [], []]; // 3 depth layers for parallax
    const STAR_COUNTS = [80, 120, 60]; // back, mid, front
    const PARALLAX_SPEEDS = [0.02, 0.05, 0.1]; // scroll multipliers
    let scrollY = 0;
    let docHeight = 1;

    // Data beam particles
    const beamParticles = [];
    const BEAM_COUNT = 30;

    function resizeSpace() {
      sW = window.innerWidth;
      sH = window.innerHeight;
      spaceCanvas.width = sW * sDpr;
      spaceCanvas.height = sH * sDpr;
      spaceCanvas.style.width = sW + 'px';
      spaceCanvas.style.height = sH + 'px';
      sCtx.setTransform(sDpr, 0, 0, sDpr, 0, 0);
    }

    function createStars() {
      for (let layer = 0; layer < STAR_LAYERS; layer++) {
        stars[layer].length = 0;
        for (let i = 0; i < STAR_COUNTS[layer]; i++) {
          stars[layer].push({
            x: Math.random() * sW,
            y: Math.random() * sH * 3, // spread across 3x viewport for scroll room
            size: layer === 0 ? Math.random() * 0.8 + 0.3
                 : layer === 1 ? Math.random() * 1.2 + 0.5
                 : Math.random() * 1.8 + 0.6,
            baseAlpha: layer === 0 ? Math.random() * 0.3 + 0.1
                      : layer === 1 ? Math.random() * 0.4 + 0.2
                      : Math.random() * 0.5 + 0.3,
            twinkleSpeed: Math.random() * 1.2 + 0.3,
            phase: Math.random() * Math.PI * 2,
            tint: Math.random(), // 0-0.6 cream, 0.6-0.82 gold, 0.82+ teal
          });
        }
      }
    }

    function createBeamParticles() {
      beamParticles.length = 0;
      for (let i = 0; i < BEAM_COUNT; i++) {
        beamParticles.push({
          y: Math.random() * sH,
          speed: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.4 + 0.1,
          size: Math.random() * 2 + 1,
          xOffset: (Math.random() - 0.5) * 6,
        });
      }
    }

    let spaceAnimId;
    function drawSpace(time) {
      sCtx.clearRect(0, 0, sW, sH);
      const t = time * 0.001;
      scrollY = window.scrollY || window.pageYOffset;
      docHeight = Math.max(document.body.scrollHeight - sH, 1);
      const scrollProgress = scrollY / docHeight; // 0..1

      // --- Draw star layers with parallax ---
      for (let layer = 0; layer < STAR_LAYERS; layer++) {
        const parallaxOffset = scrollY * PARALLAX_SPEEDS[layer];

        for (const s of stars[layer]) {
          const yPos = ((s.y - parallaxOffset) % (sH * 3) + sH * 3) % (sH * 3) - sH;
          if (yPos < -10 || yPos > sH + 10) continue;

          const flicker = Math.sin(t * s.twinkleSpeed + s.phase) * 0.35 + 0.65;
          const alpha = s.baseAlpha * flicker;

          let r, g, b;
          if (s.tint < 0.6) { r = 243; g = 237; b = 211; }
          else if (s.tint < 0.82) { r = 230; g = 173; b = 101; }
          else { r = 53; g = 187; b = 154; }

          sCtx.beginPath();
          sCtx.arc(s.x, yPos, s.size, 0, Math.PI * 2);
          sCtx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
          sCtx.fill();

          // Glow halo for larger front-layer stars
          if (layer === 2 && s.size > 1.5) {
            sCtx.beginPath();
            sCtx.arc(s.x, yPos, s.size * 3, 0, Math.PI * 2);
            sCtx.fillStyle = `rgba(${r},${g},${b},${(alpha * 0.06).toFixed(3)})`;
            sCtx.fill();
          }
        }
      }

      // --- Data Transmission Beam (vertical center line) ---
      // Only visible after scrolling past hero
      const beamOpacity = Math.min(scrollProgress * 3, 0.25);
      if (beamOpacity > 0.01) {
        const beamX = sW / 2;

        // Core beam line
        const beamGrad = sCtx.createLinearGradient(beamX, 0, beamX, sH);
        beamGrad.addColorStop(0, `rgba(53, 187, 154, 0)`);
        beamGrad.addColorStop(0.2, `rgba(53, 187, 154, ${(beamOpacity * 0.4).toFixed(3)})`);
        beamGrad.addColorStop(0.5, `rgba(53, 187, 154, ${(beamOpacity * 0.6).toFixed(3)})`);
        beamGrad.addColorStop(0.8, `rgba(230, 173, 101, ${(beamOpacity * 0.3).toFixed(3)})`);
        beamGrad.addColorStop(1, `rgba(230, 173, 101, 0)`);

        sCtx.beginPath();
        sCtx.moveTo(beamX, 0);
        sCtx.lineTo(beamX, sH);
        sCtx.strokeStyle = beamGrad;
        sCtx.lineWidth = 1;
        sCtx.stroke();

        // Beam glow
        sCtx.beginPath();
        sCtx.moveTo(beamX, 0);
        sCtx.lineTo(beamX, sH);
        sCtx.strokeStyle = `rgba(53, 187, 154, ${(beamOpacity * 0.08).toFixed(3)})`;
        sCtx.lineWidth = 20;
        sCtx.stroke();

        // Beam particles flowing downward
        for (const bp of beamParticles) {
          bp.y += bp.speed;
          if (bp.y > sH) {
            bp.y = -10;
            bp.speed = Math.random() * 1.5 + 0.5;
          }

          const pAlpha = bp.alpha * beamOpacity * 3;
          sCtx.beginPath();
          sCtx.arc(beamX + bp.xOffset, bp.y, bp.size, 0, Math.PI * 2);
          sCtx.fillStyle = `rgba(53, 187, 154, ${pAlpha.toFixed(3)})`;
          sCtx.fill();
        }
      }

      spaceAnimId = requestAnimationFrame(drawSpace);
    }

    resizeSpace();
    createStars();
    createBeamParticles();
    drawSpace(0);

    let spaceResizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(spaceResizeTimer);
      spaceResizeTimer = setTimeout(() => {
        resizeSpace();
        createStars();
      }, 200);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(spaceAnimId);
      } else {
        spaceAnimId = requestAnimationFrame(drawSpace);
      }
    });
  }

  // ==========================================================
  // FOOTER ORBITAL RADAR
  // Animated satellite tracking radar with sweep and blips
  // ==========================================================
  const radarCanvas = document.getElementById('footer-radar');
  if (radarCanvas) {
    const rCtx = radarCanvas.getContext('2d');
    const rDpr = Math.min(window.devicePixelRatio || 1, 2);
    let rSize;

    function resizeRadar() {
      const rect = radarCanvas.getBoundingClientRect();
      rSize = rect.width;
      radarCanvas.width = rSize * rDpr;
      radarCanvas.height = rSize * rDpr;
      radarCanvas.style.width = rSize + 'px';
      radarCanvas.style.height = rSize + 'px';
      rCtx.setTransform(rDpr, 0, 0, rDpr, 0, 0);
    }

    // Satellite blips (fixed positions on the radar)
    const blips = [
      { angle: 0.8, dist: 0.35, pulseSpeed: 1.2, phase: 0 },
      { angle: 2.1, dist: 0.7, pulseSpeed: 0.8, phase: 1.5 },
      { angle: 3.9, dist: 0.55, pulseSpeed: 1.0, phase: 3.0 },
      { angle: 5.2, dist: 0.82, pulseSpeed: 1.4, phase: 0.7 },
      { angle: 1.4, dist: 0.9, pulseSpeed: 0.6, phase: 2.2 },
    ];

    let radarAnimId;
    function drawRadar(time) {
      const t = time * 0.001;
      const cx = rSize / 2;
      const cy = rSize / 2;
      const maxR = rSize * 0.45;

      rCtx.clearRect(0, 0, rSize, rSize);

      // Concentric rings
      for (let i = 1; i <= 4; i++) {
        const r = maxR * (i / 4);
        rCtx.beginPath();
        rCtx.arc(cx, cy, r, 0, Math.PI * 2);
        rCtx.strokeStyle = 'rgba(53, 187, 154, 0.08)';
        rCtx.lineWidth = 1;
        rCtx.stroke();
      }

      // Cross lines
      rCtx.beginPath();
      rCtx.moveTo(cx - maxR, cy);
      rCtx.lineTo(cx + maxR, cy);
      rCtx.moveTo(cx, cy - maxR);
      rCtx.lineTo(cx, cy + maxR);
      rCtx.strokeStyle = 'rgba(53, 187, 154, 0.05)';
      rCtx.lineWidth = 1;
      rCtx.stroke();

      // Sweep arm (rotating)
      const sweepAngle = t * 0.8;
      const sweepX = cx + Math.cos(sweepAngle) * maxR;
      const sweepY = cy + Math.sin(sweepAngle) * maxR;

      // Sweep trail (fading cone)
      const trailSpan = 0.8; // radians
      const trailSteps = 20;
      for (let i = 0; i < trailSteps; i++) {
        const a = sweepAngle - (trailSpan * i / trailSteps);
        const alpha = (1 - i / trailSteps) * 0.06;
        rCtx.beginPath();
        rCtx.moveTo(cx, cy);
        rCtx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
        rCtx.strokeStyle = `rgba(53, 187, 154, ${alpha.toFixed(3)})`;
        rCtx.lineWidth = 1;
        rCtx.stroke();
      }

      // Sweep line (bright)
      rCtx.beginPath();
      rCtx.moveTo(cx, cy);
      rCtx.lineTo(sweepX, sweepY);
      rCtx.strokeStyle = 'rgba(53, 187, 154, 0.25)';
      rCtx.lineWidth = 1.5;
      rCtx.stroke();

      // Center dot
      rCtx.beginPath();
      rCtx.arc(cx, cy, 2, 0, Math.PI * 2);
      rCtx.fillStyle = 'rgba(53, 187, 154, 0.4)';
      rCtx.fill();

      // Satellite blips
      for (const b of blips) {
        const bx = cx + Math.cos(b.angle) * (maxR * b.dist);
        const by = cy + Math.sin(b.angle) * (maxR * b.dist);

        // Check if sweep just passed this blip
        const angleDiff = ((sweepAngle % (Math.PI * 2)) - b.angle + Math.PI * 4) % (Math.PI * 2);
        const freshness = angleDiff < 1.2 ? (1 - angleDiff / 1.2) : 0;

        const pulse = Math.sin(t * b.pulseSpeed + b.phase) * 0.3 + 0.7;
        const alpha = 0.15 + freshness * 0.6;

        // Blip glow
        if (freshness > 0.1) {
          rCtx.beginPath();
          rCtx.arc(bx, by, 6, 0, Math.PI * 2);
          rCtx.fillStyle = `rgba(53, 187, 154, ${(freshness * 0.1).toFixed(3)})`;
          rCtx.fill();
        }

        // Blip dot
        rCtx.beginPath();
        rCtx.arc(bx, by, 2 * pulse, 0, Math.PI * 2);
        rCtx.fillStyle = `rgba(53, 187, 154, ${(alpha * pulse).toFixed(2)})`;
        rCtx.fill();
      }

      // Outer ring glow
      rCtx.beginPath();
      rCtx.arc(cx, cy, maxR, 0, Math.PI * 2);
      rCtx.strokeStyle = 'rgba(53, 187, 154, 0.12)';
      rCtx.lineWidth = 1.5;
      rCtx.stroke();

      radarAnimId = requestAnimationFrame(drawRadar);
    }

    resizeRadar();
    drawRadar(0);

    window.addEventListener('resize', () => resizeRadar());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(radarAnimId);
      } else {
        radarAnimId = requestAnimationFrame(drawRadar);
      }
    });
  }
})();
