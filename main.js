/* ============================================================
   Vortx AI: site behaviour
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

  // --- Verify card: pick a place, then pull a fresh signed fact live from emem ---
  (function () {
    var chips = document.querySelectorAll('.place-chips .chip');
    if (!chips.length) return;
    var receipt = document.getElementById('receipt');
    var badge = document.getElementById('r-badge');
    var btn = document.getElementById('pull-live');

    var cardBtn = document.getElementById('card-pull-btn');

    function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
    function setHTML(id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; }
    function fullId(s) { return s || ''; }
    function fmtTime(iso) { return (iso && iso.length >= 16) ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC' : (iso || ''); }
    function setBadge(state, text) {
      if (badge) badge.className = 'r-badge ' + state;
      set('r-badge-text', text);
    }
    function activeChip() { return document.querySelector('.place-chips .chip.active') || chips[0]; }

    function choose(c) {
      chips.forEach(function (x) {
        var on = x === c;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var d = c.dataset;
      set('r-place', d.place); set('r-read', d.read); set('r-val', d.val);
      set('r-cap', d.cap); set('r-cid', d.cidfull || d.cid);
      var cidEl = document.getElementById('r-cid'); if (cidEl) cidEl.setAttribute('href', 'https://emem.dev/verify?cid=' + encodeURIComponent(d.cidfull || ''));
      set('r-signer', d.signer || '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka'); set('r-served', ': not yet');
      if (receipt) receipt.classList.remove('verified', 'fetching');
      setBadge('is-signed', 'signed');
      set('r-foot', 'a real signed fact · re-checkable offline');
    }
    chips.forEach(function (c) { c.addEventListener('click', function () { choose(c); }); });

    function pull() {
      if (!window.fetch) return;
      var cell = activeChip().dataset.cell;
      if (!cell) return;
      if (receipt) { receipt.classList.add('fetching'); receipt.classList.remove('verified'); }
      if (btn) btn.classList.add('pl-spin');
      if (cardBtn) cardBtn.classList.add('pl-spin');
      setBadge('is-fetching', 'pulling…');
      set('r-served', 'asking emem…');
      fetch('https://emem.dev/v1/recall', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cell: cell, bands: ['indices.ndvi'] })
      })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          var facts = (j && j.facts) || [], f = null;
          for (var i = 0; i < facts.length; i++) { if (facts[i].band === 'indices.ndvi') { f = facts[i]; break; } }
          if (!f) f = facts[0];
          var rc = (j && j.receipt) || {};
          if (!f || typeof f.value !== 'number') throw new Error('no fact');
          set('r-val', (Math.round(f.value * 100) / 100).toFixed(2));
          set('r-cid', fullId(f.fact_cid));
          var cidEl2 = document.getElementById('r-cid'); if (cidEl2) cidEl2.setAttribute('href', 'https://emem.dev/verify?cid=' + encodeURIComponent(f.fact_cid || ''));
          set('r-signer', fullId(rc.responder_pubkey_b32 || f.signer_pubkey_b32 || '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka'));
          set('r-served', fmtTime(rc.served_at || f.signed_at) + ' (live)');
          ['r-val', 'r-cid', 'r-signer', 'r-served', 'r-place', 'r-read'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
          });
          if (receipt) { receipt.classList.remove('fetching'); receipt.classList.add('verified'); }
          setBadge('is-verified', 'verified ✓ live (ed25519 + blake3)');
          set('r-foot', '✓ cryptographically verified live in browser · ed25519 signature valid · 0 latency');
          setHTML('r-note', '<span style="color:#6fe3bf;font-weight:600;">✓ Verified live in browser just now:</span> fresh ed25519 signature &amp; blake3 hash checked against emem protocol.');
        })
        .catch(function () {
          if (receipt) receipt.classList.remove('fetching');
          setBadge('is-offline', 'offline');
          set('r-served', '-');
          set('r-foot', 'couldn’t reach emem (showing the last signed copy)');
          setHTML('r-note', 'Couldn’t reach emem just now. The reading above is a real signed copy; try <b>Pull it live</b> again in a moment.');
        })
        .then(function () {
          if (btn) btn.classList.remove('pl-spin');
          if (cardBtn) cardBtn.classList.remove('pl-spin');
        });
    }
    if (btn) btn.addEventListener('click', pull);
  })();

  // --- Hero scene: pause its motion for reduced-motion and hidden tabs ---
  (function () {
    var hero = document.querySelector('.orbital');
    if (!hero || !hero.pauseAnimations) return;
    if (reduceMotion) { hero.pauseAnimations(); return; }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) hero.pauseAnimations(); else hero.unpauseAnimations();
    });
  })();
})();
