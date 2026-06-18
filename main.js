/* ============================================================
   Vortx AI — site behaviour
   Nav · scroll reveals · smooth anchors · copy buttons
   No framework, no build step. Everything degrades gracefully.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Sticky nav: shadow once scrolled ---
  var nav = document.getElementById('nav');
  if (nav) {
    var ticking = false;
    var onScroll = function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          nav.classList.toggle('scrolled', window.scrollY > 30);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // --- Mobile menu ---
  var toggle = document.getElementById('nav-toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.nav-menu a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- Reveal on scroll ---
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  // --- Smooth anchor scrolling (respect reduced motion) ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var id = anchor.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start'
        });
        if (history.replaceState) history.replaceState(null, '', id);
      }
    });
  });

  // --- Copy buttons (verify widget, code blocks) ---
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        var original = btn.textContent;
        btn.textContent = 'copied';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* no-op */ }
        document.body.removeChild(ta);
      }
    });
  });

  // --- Verify demo: pick a place, swap in its real signed fact ---
  (function () {
    var chips = document.querySelectorAll('.place-chips .chip');
    if (!chips.length) return;
    function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
    function choose(c) {
      chips.forEach(function (x) {
        var on = x === c;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var d = c.dataset;
      set('r-place', d.place); set('r-cell', d.cell); set('r-val', d.val);
      set('r-read', d.read); set('r-cap', d.cap); set('r-cid', d.cid); set('r-conf', d.conf);
      var cell = document.getElementById('curl-cell'); if (cell) cell.textContent = d.cell;
      var cmd = "curl -s https://emem.dev/v1/recall -H 'content-type: application/json' -d '{\"cell\":\"" + d.cell + "\",\"bands\":[\"indices.ndvi\"]}'";
      var cb = document.getElementById('curl-copy'); if (cb) cb.setAttribute('data-copy', cmd);
      var of = document.getElementById('open-fact'); if (of) of.setAttribute('href', 'https://emem.dev/v1/facts/' + d.cidfull);
    }
    chips.forEach(function (c) { c.addEventListener('click', function () { choose(c); }); });
  })();
})();
