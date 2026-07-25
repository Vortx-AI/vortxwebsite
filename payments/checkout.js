/* ============================================================
   Vortx AI · consultation slider + booking flow
   pick a tier -> on-page form -> (paid) Razorpay hosted page,
   then Microsoft Bookings; (free) straight to Bookings.
   Static, no backend, no mailbox. config in payments/config.js.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.VORTX_PAY || { contact: 'avijeet@vortx.ai', tiers: {} };
  var modal = document.getElementById('pricing-modal');
  if (!modal) return;

  var segBtns = toArr(modal.querySelectorAll('.pm-seg-btn'));
  var pill    = modal.querySelector('.pm-seg-pill');
  var tiers   = toArr(modal.querySelectorAll('.pm-tier'));
  var steps   = toArr(modal.querySelectorAll('.pm-step'));
  var seg     = modal.querySelector('.pm-seg');
  var form    = document.getElementById('pm-form');
  var lastFocus = null;
  var current = firstTierKey();

  function toArr(n) { return Array.prototype.slice.call(n); }
  function firstTierKey() {
    var a = modal.querySelector('.pm-tier.active') || tiers[0];
    return a ? a.getAttribute('data-tier') : 'student';
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function track(name, detail) {
    if (typeof gtag === 'function') { try { gtag('event', name, detail || {}); } catch (e) {} }
  }
  function conf(key) { return (CFG.tiers && CFG.tiers[key]) || {}; }
  function isReal(url) {
    return typeof url === 'string' && /^https?:\/\//.test(url) && url.indexOf('REPLACE') === -1;
  }

  /* --- steps ------------------------------------------------- */
  function showStep(name) {
    steps.forEach(function (s) { s.hidden = s.getAttribute('data-step') !== name; });
    var panel = modal.querySelector('.pm-panel');
    if (panel) panel.scrollTop = 0;
  }

  /* --- segmented slider -------------------------------------- */
  function movePill(btn) {
    if (!pill || !btn) return;
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }
  function selectTier(key) {
    current = key;
    segBtns.forEach(function (b) {
      var on = b.getAttribute('data-tier') === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) movePill(b);
    });
    tiers.forEach(function (t) {
      var on = t.getAttribute('data-tier') === key;
      t.classList.toggle('active', on);
      t.hidden = !on;
    });
    track('pricing_tier_view', { tier: key });
  }
  segBtns.forEach(function (b) {
    b.addEventListener('click', function () { selectTier(b.getAttribute('data-tier')); });
  });
  if (seg) seg.addEventListener('keydown', function (e) {
    var i = segBtns.indexOf(document.activeElement);
    if (i === -1) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      var n = e.key === 'ArrowRight' ? (i + 1) % segBtns.length : (i - 1 + segBtns.length) % segBtns.length;
      segBtns[n].focus();
      selectTier(segBtns[n].getAttribute('data-tier'));
    }
  });

  /* --- step 1 -> form ---------------------------------------- */
  modal.querySelectorAll('[data-continue]').forEach(function (b) {
    b.addEventListener('click', function () { openForm(current); });
  });
  function openForm(key) {
    var c = conf(key);
    var paid = key !== 'student';
    setText('pm-form-tier', (c.label || key) + ' session');
    setText('pm-form-price', c.price || '');
    // phone only matters for the payment receipt
    var phone = document.getElementById('pm-field-phone');
    if (phone) phone.hidden = !paid;
    var submit = document.getElementById('pm-submit');
    if (submit) submit.textContent = paid ? ('Continue to payment · ' + (c.price || '')) : 'Request your free session';
    var note = document.getElementById('pm-form-note');
    if (note) { note.hidden = true; note.className = 'pm-form-note'; }
    showStep('form');
    var name = document.getElementById('pm-name');
    if (name) name.focus();
    track('pricing_form_open', { tier: key });
  }
  modal.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { showStep('tier'); selectTier(current); });
  });

  /* --- form submit -> payment or calendar -------------------- */
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      name: val('pm-name'),
      email: val('pm-email'),
      org: val('pm-org'),
      phone: val('pm-phone'),
      context: val('pm-context')
    };
    if (!data.name || !isEmail(data.email)) {
      formNote('Add your name and a valid email so we can confirm the session.', 'err');
      (!data.name ? document.getElementById('pm-name') : document.getElementById('pm-email')).focus();
      return;
    }
    var key = current;
    var c = conf(key);
    track('pricing_submit', { tier: key });

    if (key === 'student') {
      go(schedulingUrl(data)); // free -> straight to the calendar
      return;
    }
    // paid -> Razorpay Checkout modal (prefilled), then the calendar on success
    var rp = CFG.razorpay || {};
    if (rp.keyId && window.Razorpay && c.amount) {
      openRazorpay(key, c, data);
      return;
    }
    // fallback: a hosted Payment Page URL, if one is set
    if (isReal(c.paymentPageUrl)) {
      go(razorpayUrl(c.paymentPageUrl, data, c.amount));
      return;
    }
    formNote('Add your Razorpay key id in payments/config.js to enable checkout.', 'warn');
  });

  function openRazorpay(key, c, data) {
    var rp = CFG.razorpay || {};
    var opts = {
      key: rp.keyId,
      amount: c.amount,
      currency: rp.currency || 'INR',
      name: rp.name || 'Vortx AI',
      description: (c.label || key) + ' session (emem deployment)',
      image: 'assets/vortx-logo.png',
      prefill: { name: data.name, email: data.email, contact: data.phone },
      notes: { tier: key, organisation: data.org, context: data.context },
      theme: { color: rp.themeColor || '#0b8f6e' },
      handler: function () { onPaid(key); },
      modal: { ondismiss: function () { formNote('Payment closed. You can start again when you are ready.', 'warn'); } }
    };
    try {
      var rzp = new window.Razorpay(opts);
      rzp.on('payment.failed', function () {
        formNote('That payment did not go through. Try again, or email ' + (CFG.contact || 'us') + '.', 'err');
      });
      rzp.open();
      track('razorpay_open', { tier: key });
    } catch (e) {
      if (isReal(c.paymentPageUrl)) go(razorpayUrl(c.paymentPageUrl, data, c.amount));
      else formNote('Could not open the checkout. Check your connection and try again.', 'err');
    }
  }
  function onPaid(key) {
    track('razorpay_success', { tier: key });
    schedule();
    showStep('confirmed');
  }

  function schedulingUrl(data) {
    var base = CFG.schedulingUrl || (CFG.contact ? '#' : '#');
    return appendParams(base, { name: data.name, email: data.email });
  }
  function razorpayUrl(base, data, amount) {
    // Razorpay hosted pages accept prefill for their standard fields.
    var params = {
      'prefill[name]': data.name,
      'prefill[email]': data.email,
      'prefill[contact]': data.phone
    };
    if (amount) {
      params['amount'] = amount / 100;
    }
    return appendParams(base, params);
  }
  function go(url) {
    if (!url || url === '#') return;
    window.location.href = url;
  }

  /* --- confirmed step (return from a successful payment) ----- */
  function schedule() {
    var el = modal.querySelector('[data-schedule]');
    if (el && CFG.schedulingUrl) el.setAttribute('href', CFG.schedulingUrl);
  }

  /* --- open / close ------------------------------------------ */
  function focusables() {
    return toArr(modal.querySelectorAll('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return el.offsetParent !== null; });
  }
  function open(opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('pm-open');
    requestAnimationFrame(function () {
      modal.classList.add('is-open');
      var active = modal.querySelector('.pm-seg-btn.active') || segBtns[0];
      if (active) movePill(active);
    });
    if (opts.step === 'confirmed') { schedule(); showStep('confirmed'); }
    else {
      showStep('tier');
      selectTier(opts.tier && conf(opts.tier) ? opts.tier : current);
    }
    var x = modal.querySelector('.pm-x');
    if (x) x.focus();
    track('pricing_open', { tier: opts.tier || 'default', step: opts.step || 'tier' });
  }
  function close() {
    modal.classList.remove('is-open');
    document.body.classList.remove('pm-open');
    var done = function () { modal.hidden = true; modal.removeEventListener('transitionend', done); };
    if (reduceMotion()) done(); else modal.addEventListener('transitionend', done);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.querySelectorAll('[data-open-pricing]').forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.preventDefault();
      open({ tier: t.getAttribute('data-tier') || null });
    });
  });
  modal.querySelectorAll('[data-pm-close]').forEach(function (c) {
    c.addEventListener('click', function (e) { e.preventDefault(); close(); });
  });
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('resize', function () {
    if (modal.hidden) return;
    var active = modal.querySelector('.pm-seg-btn.active');
    if (active) movePill(active);
  });

  /* --- deep links -------------------------------------------- */
  function fromUrl() {
    var q = new URLSearchParams(window.location.search);
    if (q.get('state') === 'confirmed') { open({ step: 'confirmed' }); return; }
    var tier = q.get('tier');
    if (window.location.hash === '#book' || q.has('book') || tier) {
      open({ tier: tier && conf(tier) ? tier : null });
    }
  }

  /* --- helpers ----------------------------------------------- */
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function formNote(msg, kind) {
    var n = document.getElementById('pm-form-note');
    if (!n) return;
    n.textContent = msg;
    n.className = 'pm-form-note ' + (kind === 'err' ? 'is-err' : 'is-warn');
    n.hidden = false;
  }
  function appendParams(base, obj) {
    var parts = [];
    for (var k in obj) {
      if (obj.hasOwnProperty(k) && obj[k]) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
      }
    }
    if (!parts.length) return base;
    return base + (base.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  fromUrl();
})();
