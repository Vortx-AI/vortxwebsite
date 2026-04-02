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
})();
