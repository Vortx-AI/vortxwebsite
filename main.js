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
      set('r-ndmi', 'pull to fetch'); set('r-temp', 'pull to fetch');
      set('r-cap', d.cap); set('r-cid', d.cidfull || d.cid);
      var cidEl = document.getElementById('r-cid'); if (cidEl) cidEl.setAttribute('href', 'https://emem.dev/verify?cid=' + encodeURIComponent(d.cidfull || ''));
      set('r-signer', d.signer || '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka'); set('r-served', ': not yet');
      var sc = document.getElementById('r-scene'); if (sc) sc.hidden = true;
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
        body: JSON.stringify({ cell: cell, bands: ['indices.ndvi', 'indices.ndmi', 'weather.temperature_2m'] })
      })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          var facts = (j && j.facts) || [], f = null;
          var byBand = {};
          for (var i = 0; i < facts.length; i++) {
            if (!byBand[facts[i].band]) byBand[facts[i].band] = facts[i];
            if (facts[i].band === 'indices.ndvi') f = facts[i];
          }
          if (!f) f = facts[0];
          var rc = (j && j.receipt) || {};
          if (!f || typeof f.value !== 'number') throw new Error('no fact');
          set('r-val', (Math.round(f.value * 100) / 100).toFixed(2));
          var ndmi = byBand['indices.ndmi'], temp = byBand['weather.temperature_2m'];
          set('r-ndmi', (ndmi && typeof ndmi.value === 'number') ? (Math.round(ndmi.value * 100) / 100).toFixed(2) : 'not in this pull');
          set('r-temp', (temp && typeof temp.value === 'number') ? (Math.round(temp.value * 10) / 10) + ' °C' : 'not in this pull');
          set('r-cid', fullId(f.fact_cid));
          var cidEl2 = document.getElementById('r-cid'); if (cidEl2) cidEl2.setAttribute('href', 'https://emem.dev/verify?cid=' + encodeURIComponent(f.fact_cid || ''));
          set('r-signer', fullId(rc.responder_pubkey_b32 || f.signer_pubkey_b32 || '777er3yihgifqmv5hmc2wwmyszgddzderzhsx6rex4yoakwomvka'));
          set('r-served', fmtTime(rc.served_at || f.signed_at) + ' (live)');
          ['r-val', 'r-cid', 'r-signer', 'r-served', 'r-place', 'r-read'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
          });
          var sceneImg = document.getElementById('r-scene-img'), sceneFig = document.getElementById('r-scene');
          if (sceneImg && sceneFig) {
            sceneImg.onload = function () { sceneFig.hidden = false; };
            sceneImg.src = 'https://emem.dev/v1/cells/' + encodeURIComponent(cell) + '/scene.png?max_cloud=40';
          }
          if (receipt) { receipt.classList.remove('fetching'); receipt.classList.add('verified'); }
          setBadge('is-verified', 'pulled live ✓ signed');
          set('r-foot', 'pulled live from emem just now · signed ed25519 · blake3 content address');
          setHTML('r-note', '<span style="color:#6fe3bf;font-weight:600;">Pulled live just now.</span> The proof link opens emem’s verifier, which re-checks the ed25519 signature and blake3 address; you can run the same check offline.');
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

  // --- Live protocol signals: stars + last update from GitHub ---
  (function () {
    if (!window.fetch) return;
    var strip = document.getElementById('proto-strip');
    fetch('https://api.github.com/repos/Vortx-AI/emem')
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        var stars = typeof j.stargazers_count === 'number' ? j.stargazers_count : null;
        var pushed = (j.pushed_at || '').slice(0, 10);
        if (stars !== null) {
          var s = document.getElementById('gh-stars');
          if (s) s.textContent = '★ ' + stars;
          var navText = document.getElementById('nav-star-text');
          if (navText) navText.textContent = 'Star emem · ' + stars;
        }
        if (pushed) {
          var u = document.getElementById('gh-updated');
          if (u) u.textContent = 'updated ' + pushed;
        }
        if (strip && (stars !== null || pushed)) strip.hidden = false;
      })
      .catch(function () { /* stay hidden; never show a broken number */ });
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

  // --- Footer map: the memory, live ---
  // Every dot is a 1-degree bin where emem holds at least one signed fact,
  // re-projected from GET /v1/coverage_map.svg (plate-carree, 1440x720)
  // into this map's frame. Seeds below are a real sample from the corpus,
  // painted immediately; the live fetch then replaces them with the full,
  // current picture. Intensity (0..1) follows fact density.
  (function () {
    var layer = document.getElementById('map-live');
    if (!layer) return;
    var SEEDS = [
      [484, 412, 1], [1320, 496, .9], [1252, 452, .9], [1324, 492, .85], [496, 440, .85],
      [1320, 492, .85], [1248, 456, .8], [472, 492, .75], [1252, 456, .7], [896, 452, .7],
      [808, 436, .7], [1284, 464, .7], [432, 492, .65], [424, 504, .6], [804, 452, .6],
      [1300, 464, .6], [440, 544, .6], [476, 492, .6], [492, 428, .55], [808, 420, .55],
      [1200, 460, .55], [528, 416, .5], [1316, 464, .5], [832, 464, .5], [1272, 452, .5],
      [1040, 440, .35], [908, 436, .3], [236, 480, .35], [136, 508, .3], [156, 416, .25],
      [216, 528, .2], [664, 516, .2], [840, 540, .2], [852, 508, .2], [568, 564, .15],
      [640, 564, .15], [300, 660, .15], [1188, 488, .15], [568, 440, .15], [592, 516, .15],
      [988, 648, .15], [1368, 668, .4], [720, 716, .15], [32, 684, .15], [1416, 524, .35],
      [476, 620, .35], [540, 652, .3], [456, 636, .2], [1172, 648, .2], [704, 600, .2]
    ];
    var NS = 'http://www.w3.org/2000/svg';

    // plate-carree (1440x720) -> the footer land frame (950x620).
    // world-map-eq.svg is generated on the same grid: x spans lon -180..180,
    // y spans lat 84..-90, both linear, so this mapping is exact.
    function project(x, y) {
      var lat = 90 - ((y + 2) / 720) * 180;
      var fx = ((x + 2) / 1440) * 950;
      var fy = ((84 - lat) / 174) * 620;
      return [Math.max(6, Math.min(944, fx)), Math.max(10, Math.min(612, fy))];
    }
    function intensityOf(hex) {
      // the ramp runs light peach (few facts) to deep red (many); the green
      // channel falls monotonically along it, so it doubles as a density read
      var g = parseInt(hex.slice(3, 5), 16);
      return Math.max(0, Math.min(1, 1 - g / 240));
    }
    function render(points) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < points.length; i++) {
        var p = project(points[i][0], points[i][1]);
        var t = points[i][2];
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'map-dot');
        c.setAttribute('cx', p[0].toFixed(1));
        c.setAttribute('cy', p[1].toFixed(1));
        c.setAttribute('r', (2 + t * 3.4).toFixed(1));
        c.style.opacity = (0.35 + t * 0.6).toFixed(2);
        c.style.animationDelay = (-((i * 0.37) % 3.6)).toFixed(2) + 's';
        c.style.animationDuration = (3.2 + ((i * 0.53) % 2.4)).toFixed(2) + 's';
        frag.appendChild(c);
      }
      layer.textContent = '';
      layer.appendChild(frag);
    }
    render(SEEDS);

    if (!window.fetch) return;
    fetch('https://emem.dev/v1/coverage_map.svg')
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(function (svg) {
        var points = [], m;
        var re = /<rect x='(\d+)' y='(\d+)' width='4' height='4' fill='(#[0-9a-f]{6})'\/>/g;
        while ((m = re.exec(svg)) && points.length < 900) {
          points.push([+m[1], +m[2], intensityOf(m[3])]);
        }
        if (points.length) render(points);
        var dek = svg.match(/class="dek"[^>]*>([^<]+)</);
        var cap = document.getElementById('map-cap-text');
        if (dek && cap) {
          var nums = dek[1].match(/(\d[\d,]*) cells[^0-9]*([\d,]+) facts/);
          if (nums) cap.textContent = 'the memory, live: ' + nums[1] + ' one-degree bins hold ' + nums[2] + ' signed facts';
        }
      })
      .catch(function () { /* seeds stay up; the map never goes dark */ });
  })();
