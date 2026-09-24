/* One shader, one texture, no 3D engine. Animation stops offscreen and in hidden tabs. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const nav = $('.orbit-nav');
  const menu = $('.menu-toggle');
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation');
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); }
  });

  // All archive content is in the HTML and remains available without JavaScript.
  const cards = [...document.querySelectorAll('.observation')];
  const filters = [...document.querySelectorAll('.archive-filter')];
  const more = $('#archive-more');
  let category = 'all', expanded = false;
  function filterArchive() {
    let count = 0, visible = 0;
    cards.forEach(card => {
      const matches = category === 'all' || card.dataset.category === category;
      if (matches) count++;
      const show = matches && (expanded || visible < 6);
      card.hidden = !show;
      if (show) visible++;
    });
    $('#archive-count').textContent = String(visible).padStart(2, '0') + ' / ' + String(count).padStart(2, '0') + ' OBSERVATIONS';
    more.hidden = count <= 6;
    more.textContent = expanded ? 'Show less −' : 'View all ' + count + ' observations +';
    more.setAttribute('aria-expanded', String(expanded));
    filters.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
  }
  filters.forEach(b => b.addEventListener('click', () => { category = b.dataset.filter; expanded = false; filterArchive(); }));
  more.addEventListener('click', () => {
    expanded = !expanded; filterArchive();
    if (!expanded) $('#explore').scrollIntoView({behavior: motion.matches ? 'instant' : 'smooth'});
  });
  filterArchive();

  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied ✓';
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    } catch { button.textContent = 'Select code to copy'; }
  }));

  // Recall is user initiated. No fabricated readings or online status.
  const form = $('#recall-form');
  const input = $('#recall-place');
  document.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => {
    input.value = b.dataset.place; input.focus();
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const place = input.value.trim();
    if (!place || form.dataset.busy) return;
    form.dataset.busy = 'true';
    const button = form.querySelector('button[type=submit]');
    const status = $('#recall-status'), terminal = $('#recall-result'), indicator = $('#terminal-indicator');
    const bandNames = {'indices.ndvi':'Vegetation · NDVI','indices.ndmi':'Moisture · NDMI','weather.temperature_2m':'Air temperature'};
    button.disabled = true; button.textContent = '…';
    status.classList.remove('error'); status.textContent = 'Reading the Earth memory for ' + place + '…';
    indicator.textContent = 'RECALLING'; terminal.classList.add('terminal-loading');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('https://emem.dev/v1/recall', {
        method:'POST', headers:{'content-type':'application/json'}, signal:controller.signal,
        body:JSON.stringify({place, bands:Object.keys(bandNames)})
      });
      if (!response.ok) throw new Error('http ' + response.status);
      const result = await response.json();
      const facts = Array.isArray(result.facts) ? result.facts : [];
      const latest = {};
      for (const fact of facts) {
        if (!bandNames[fact.band] || fact.value == null) continue;
        const previous = latest[fact.band];
        const time = fact.observed_at || fact.captured_at || fact.sources?.[0]?.captured_at || fact.signed_at || '';
        const oldTime = previous && (previous.observed_at || previous.captured_at || previous.sources?.[0]?.captured_at || previous.signed_at || '');
        const newer = previous && Number.isFinite(fact.tslot) && Number.isFinite(previous.tslot) ? fact.tslot >= previous.tslot : time >= oldTime;
        if (!previous || newer) latest[fact.band] = fact;
      }
      // The API explicitly identifies the current record; historical backfills may be signed later.
      for (const [band, cid] of Object.entries(result.current_by_band || {})) {
        const current = facts.find(f => f.band === band && f.fact_cid === cid && f.value != null);
        if (bandNames[band] && current) latest[band] = current;
      }
      terminal.replaceChildren();
      const name = document.createElement('p'); name.className='terminal-command'; name.textContent=place; terminal.append(name);
      for (const [band, label] of Object.entries(bandNames)) {
        const row=document.createElement('div'); row.className='reading-row';
        const key=document.createElement('span'); key.textContent=label;
        const value=document.createElement('span'); value.className='reading-value';
        const fact=latest[band];
        value.textContent=fact ? (typeof fact.value==='number' ? fact.value.toFixed(2) : String(fact.value)) + (fact.unit ? ' '+(fact.unit==='degC'?'°C':fact.unit) : '') : 'Not available';
        if (fact) {
          const observed=fact.observed_at || fact.captured_at || fact.sources?.[0]?.captured_at;
          if (observed) { const date=document.createElement('small');date.className='reading-date';date.textContent='Observed '+String(observed).slice(0,10);key.append(date); }
          if (typeof fact.fact_cid==='string') {
            const proof=document.createElement('a');proof.href='https://emem.dev/verify?cid='+encodeURIComponent(fact.fact_cid);proof.target='_blank';proof.rel='noopener';proof.textContent=' ↗';proof.setAttribute('aria-label','Verify '+label);value.append(proof);
          }
        }
        row.append(key,value); terminal.append(row);
      }
      const first = Object.values(latest)[0];
      if (first) {
        const meta=document.createElement('p'); meta.className='reading-meta';
        meta.textContent='Retrieved just now. Observation dates may differ. ';
        if (typeof first.fact_cid === 'string') {
          const proof=document.createElement('a'); proof.href='https://emem.dev/verify?cid='+encodeURIComponent(first.fact_cid);
          proof.target='_blank'; proof.rel='noopener'; proof.textContent='Open signature verification ↗'; meta.append(proof);
        }
        terminal.append(meta);
        status.textContent='Returned '+Object.keys(latest).length+' measurements. Open the proof to verify the signed record.';
        indicator.textContent='RECORD RECEIVED';
      } else {
        status.textContent='No measurements returned for this place. Try a nearby city or landmark.';
        indicator.textContent='NO MEASUREMENTS';
      }
    } catch (error) {
      status.classList.add('error');
      status.textContent=error.name==='AbortError' ? 'The request timed out. Try again, or open emem.dev directly.' : 'Earth memory is unreachable right now. Try again, or open emem.dev directly.';
      indicator.textContent='REQUEST UNAVAILABLE';
    } finally {
      clearTimeout(timeout); delete form.dataset.busy; button.disabled=false; button.textContent='Recall ↗'; terminal.classList.remove('terminal-loading');
    }
  });

  // Hero terminal — observation carousel + thumbnail strip
  const ht = $('#hero-terminal');
  const strip = $('#obs-strip');
  if (ht) {
    const htObs = [
      {title:'Cosmic Cliffs, Carina',dtype:'combined',source:'Webb JWST · NIRCam',meta:'144 MB · 1 frame signed',tokens:'~1.2k',frames:1,cid:'wkxa7tcm…66dhe',url:'https://emem.dev/memories/by_attester/ddzmyzhn/wkxa7tcmw2orf7ujjf5yi66dhe.md',img:'assets/observatory/carina.webp'},
      {title:'Amazon frontier, 2017–2025',dtype:'timelapse',source:'timelapse: -9.73, -63.03',meta:'5 frames · 3 cubes signed · bound',tokens:'~1.7k',frames:5,cid:'gkc2jap4…deru',url:'https://emem.dev/memories/by_attester/ddzmyzhn/gkc2jap4r47zgs4t2sja4qderu.md',img:'assets/observatory/amazon-frontier-2017-2025.webp'},
      {title:'Whirlpool galaxy, M51',dtype:'combined',source:'Hubble · heic0506a',meta:'215 MB · 1 frame signed',tokens:'~1.1k',frames:1,cid:'7rn7fxbl…c7rq',url:'https://emem.dev/memories/by_attester/ddzmyzhn/7rn7fxbl75o5cijqpnok5oc7rq.md',img:'assets/observatory/whirlpool.webp'},
      {title:'Okavango Delta, flood pulse',dtype:'timelapse',source:'timelapse: -19.55, 23.05',meta:'5 frames · 3 cubes signed · bound',tokens:'~1.6k',frames:5,cid:'sm45gry4…t6i',url:'https://emem.dev/memories/by_attester/ddzmyzhn/sm45gry43cubuqjp2cpu5bit6i.md',img:'assets/observatory/okavango-delta-flood-pulse.webp'},
      {title:'Mars, December 2024',dtype:'combined',source:'Hubble · heic2505b',meta:'1.9 MB · 1 frame signed',tokens:'~0.9k',frames:1,cid:'fi67bt4r…kly',url:'https://emem.dev/memories/by_attester/ddzmyzhn/fi67bt4rxkic3ssuag2v2hskly.md',img:'assets/observatory/mars.webp'},
      {title:'Bengaluru, true colour',dtype:'combined',source:'Sentinel-2 · S2B_43PGQ',meta:'351 MB · 1 frame signed',tokens:'~1.4k',frames:1,cid:'twlpco5k…n4',url:'https://emem.dev/memories/by_attester/ddzmyzhn/twlpco5kin6qlz5eplt2pjm7n4.md',img:'assets/observations/twlpco5kin6qlz5eplt2pjm7n4.webp'},
      {title:'Moon terrain, Kaguya',dtype:'combined',source:'USGS DTM · hillshade',meta:'1 frame signed',tokens:'~1.0k',frames:1,cid:'jxz6pghl…4m',url:'https://emem.dev/memories/by_attester/ddzmyzhn/jxz6pghlsjbohvx6s5iw6yek4m.md',img:'assets/observations/jxz6pghlsjbohvx6s5iw6yek4m.webp'},
      {title:'Earth terrain, 30 GB',dtype:'pointer',source:'PMTiles · terrarium_z9',meta:'30.5 GB · 8 tiles signed',tokens:'~2.1k',frames:8,cid:'ppdqanaf…5u',url:'https://emem.dev/memories/by_attester/ddzmyzhn/ppdqanaf7ufpxedvwdrwuqhf5u.md',img:'assets/observations/ppdqanaf7ufpxedvwdrwuqhf5u.webp'},
      {title:'Ozone, 41 years',dtype:'combined',source:'NetCDF · GISS-E2-1-G',meta:'1.05 GB · 1 frame signed',tokens:'~1.3k',frames:1,cid:'o2iyw5ae…fm',url:'https://emem.dev/memories/by_attester/ddzmyzhn/o2iyw5aexedv7sneir7sgng4fm.md',img:'assets/observations/o2iyw5aexedv7sneir7sgng4fm.webp'},
      {title:'A train, 3D splats',dtype:'combined',source:'3DGS PLY · Gaussian splats',meta:'139 MB · 1 frame signed',tokens:'~1.1k',frames:1,cid:'qfclw5qa…xu',url:'https://emem.dev/memories/by_attester/ddzmyzhn/qfclw5qafxejoqabrtnjlqbvxu.md',img:'assets/observations/qfclw5qafxejoqabrtnjlqbvxu.webp'},
      {title:'Lahaina, before & after',dtype:'timelapse',source:'timelapse: 20.878, -156.683',meta:'4 frames · 2 cubes signed · bound',tokens:'~1.5k',frames:4,cid:'ota6xerx…2q',url:'https://emem.dev/memories/by_attester/ddzmyzhn/ota6xerxrqzya5txb4jxvzpb2q.md',img:'assets/observations/ota6xerxrqzya5txb4jxvzpb2q.webp'},
      {title:'Amazon forest loss',dtype:'forest grid',source:'forest: -9.73, -63.03',meta:'1 frame signed',tokens:'~1.2k',frames:1,cid:'dzhe5a7r…5u',url:'https://emem.dev/memories/by_attester/ddzmyzhn/dzhe5a7rsjtnmc35qqwxybys5u.md',img:'assets/observations/dzhe5a7rsjtnmc35qqwxybys5u.webp'},
      {title:'Phoenix: green vs heat',dtype:'city grid',source:'city: Phoenix, Arizona',meta:'1 frame signed',tokens:'~1.3k',frames:1,cid:'jnt6yrjf…5e',url:'https://emem.dev/memories/by_attester/ddzmyzhn/jnt6yrjflrxu3apgde37ykn55e.md',img:'assets/observations/jnt6yrjflrxu3apgde37ykn55e.webp'},
      {title:'Lion and impala, Kruger',dtype:'combined',source:'iNaturalist · obs/39540446',meta:'1 frame signed',tokens:'~0.8k',frames:1,cid:'2re7jfo2…su',url:'https://emem.dev/memories/by_attester/ddzmyzhn/2re7jfo2v34uwsqxkmpwxoxesu.md',img:'assets/observations/2re7jfo2v34uwsqxkmpwxoxesu.webp'},
      {title:'Super Pit, Kalgoorlie',dtype:'timelapse',source:'timelapse: -30.777, 121.506',meta:'5 frames · 3 cubes signed · bound',tokens:'~1.6k',frames:5,cid:'fdobixnn…yq',url:'https://emem.dev/memories/by_attester/ddzmyzhn/fdobixnnucctqkn2qtii7kibyq.md',img:'assets/observations/fdobixnnucctqkn2qtii7kibyq.webp'},
      {title:'Maui fires, 50 cm',dtype:'combined',source:'Maxar · 50 cm VHR',meta:'71 MB · 1 frame signed',tokens:'~1.2k',frames:1,cid:'bafppksa…5u',url:'https://emem.dev/memories/by_attester/ddzmyzhn/bafppksajtcekqt62r3thg3a5u.md',img:'assets/observations/bafppksajtcekqt62r3thg3a5u.webp'},
      {title:'Dry lake cracks, drone',dtype:'combined',source:'OpenAerialMap · drone COG',meta:'38 MB · 1 frame signed',tokens:'~1.0k',frames:1,cid:'ejvovl6s…ma',url:'https://emem.dev/memories/by_attester/ddzmyzhn/ejvovl6sz7d3sugfcrwwie4rma.md',img:'assets/observations/ejvovl6sz7d3sugfcrwwie4rma.webp'},
      {title:'Lusail, a city rising',dtype:'timelapse',source:'timelapse: 25.42, 51.49',meta:'5 frames · 3 cubes signed · bound',tokens:'~1.7k',frames:5,cid:'gpnxkvkw…3q',url:'https://emem.dev/memories/by_attester/ddzmyzhn/gpnxkvkwz22ug4jeqexggiy63q.md',img:'assets/observations/gpnxkvkwz22ug4jeqexggiy63q.webp'},
      {title:'Bengaluru: green vs heat',dtype:'city grid',source:'city: Bengaluru',meta:'1 frame signed',tokens:'~1.3k',frames:1,cid:'cfbt6bct…ku',url:'https://emem.dev/memories/by_attester/ddzmyzhn/cfbt6bctfgnfoun347mgobvkku.md',img:'assets/observations/cfbt6bctfgnfoun347mgobvkku.webp'},
      {title:'London street cameras',dtype:'cameras',source:'cameras: London',meta:'6 frames · geo.qa',tokens:'~2.0k',frames:6,cid:'t7ebh6s6…we',url:'https://emem.dev/memories/by_attester/ddzmyzhn/t7ebh6s6imxrwdmizebnw52nwe.md',img:'assets/observations/t7ebh6s6imxrwdmizebnw52nwe.webp'},
      {title:'Train yard, 1M splats',dtype:'combined',source:'Gaussian splat · 1M points',meta:'1 frame signed',tokens:'~1.0k',frames:1,cid:'iliojyun…rm',url:'https://emem.dev/memories/by_attester/ddzmyzhn/iliojyunnoeoomohc5346n4zrm.md',img:'assets/observations/iliojyunnoeoomohc5346n4zrm.webp'},
      {title:'Sombrero galaxy',dtype:'combined',source:'Hubble · opo0328a',meta:'180 MB · 1 frame signed',tokens:'~1.1k',frames:1,cid:'4uweu43y…bu',url:'https://emem.dev/memories/by_attester/ddzmyzhn/4uweu43yaiik2mw5nc4eznztbu.md',img:'assets/observations/4uweu43yaiik2mw5nc4eznztbu.webp'},
      {title:'Maasai Mara, every layer',dtype:'world',source:'world: Maasai Mara',meta:'1 frame signed',tokens:'~1.5k',frames:1,cid:'kl23pezp…xa',url:'https://emem.dev/memories/by_attester/ddzmyzhn/kl23pezpc2lfzuflxgm5qyblxa.md',img:'assets/observations/kl23pezpc2lfzuflxgm5qyblxa.webp'},
      {title:'Marina Beach, every layer',dtype:'world',source:'world: Marina Beach',meta:'1 frame signed',tokens:'~1.4k',frames:1,cid:'77e2qubt…vu',url:'https://emem.dev/memories/by_attester/ddzmyzhn/77e2qubtqktu3hrat7clzeauvu.md',img:'assets/observations/77e2qubtqktu3hrat7clzeauvu.webp'},
      {title:'Port of Rotterdam',dtype:'world',source:'world: Port of Rotterdam',meta:'1 frame signed',tokens:'~1.5k',frames:1,cid:'4o7zgq2o…q4',url:'https://emem.dev/memories/by_attester/ddzmyzhn/4o7zgq2ogbs2trae4mdxkxwvq4.md',img:'assets/observations/4o7zgq2ogbs2trae4mdxkxwvq4.webp'}
    ];
    const viewport = ht.querySelector('.ht-viewport');
    const htImgs = [...viewport.querySelectorAll('.ht-img')];
    const thumbs = strip ? [...strip.querySelectorAll('.obs-thumb')] : [];
    let htIdx = 0, autoTimer = null;

    function showHtObs(i) {
      htIdx = i;
      const obs = htObs[i];
      htImgs.forEach(img => img.classList.remove('active'));
      if (i < htImgs.length) {
        htImgs[i].classList.add('active');
      } else {
        htImgs[0].src = obs.img;
        htImgs[0].classList.add('active');
      }
      $('#ht-title').textContent = obs.title;
      $('#ht-dtype').textContent = obs.dtype;
      $('#ht-source').textContent = obs.source;
      $('#ht-meta').textContent = obs.meta;
      $('#ht-tokens').textContent = 'agent reads ' + obs.tokens + ' tokens';
      $('#ht-cid').textContent = obs.cid;
      $('#ht-link').href = obs.url;
      const copyBtn = $('#ht-copy');
      if (copyBtn) copyBtn.dataset.copy = obs.url;
      $('#ht-counter').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(htObs.length).padStart(2, '0');
      thumbs.forEach(t => t.classList.toggle('active', +t.dataset.idx === i));
      const active = thumbs[i];
      if (active && strip) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Thumb clicks
    thumbs.forEach(t => t.addEventListener('click', () => {
      clearInterval(autoTimer);
      showHtObs(+t.dataset.idx);
      autoTimer = setInterval(autoNext, 5000);
    }));

    // Copy agent line button
    const copyLine = $('#ht-copy');
    if (copyLine) copyLine.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copyLine.dataset.copy); copyLine.textContent = 'copied ✓'; setTimeout(() => { copyLine.textContent = 'copy agent line'; }, 2000); } catch {}
    });

    function autoNext() { showHtObs((htIdx + 1) % htObs.length); }
    if (!motion.matches) {
      autoTimer = setInterval(autoNext, 5000);
    }
  }

  // Tokenise — file upload and URL input
  const drop = $('#ememfy-drop');
  const fileInput = $('#ememfy-file');
  const textInput = $('#ememfy-text');
  const goBtn = $('#ememfy-go');
  const chooseBtn = $('#ememfy-choose');
  const tokensEl = $('#ememfy-tokens');

  if (drop && fileInput && tokensEl) {
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
      return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    function addToken(name, size) {
      tokensEl.hidden = false;
      const el = document.createElement('div');
      el.className = 'ememfy-token tk-loading';
      el.innerHTML = '<span class="tk-name">' + name + '</span><span class="tk-size">' + (size ? formatSize(size) : '') + '</span><span class="tk-cid">tokenising…</span><span class="tk-proof"><em>sig</em> pending <em>int</em> pending</span>';
      tokensEl.prepend(el);
      return el;
    }

    function fillToken(el, data) {
      el.classList.remove('tk-loading');
      if (data.error) {
        el.classList.add('tk-error');
        el.querySelector('.tk-cid').textContent = data.error;
        el.querySelector('.tk-proof').innerHTML = '';
        return;
      }
      const cid = data.cid || data.fact_cid || data.token || '—';
      const url = data.url || (typeof cid === 'string' && cid.length > 10 ? 'https://emem.dev/verify?cid=' + encodeURIComponent(cid) : '');
      el.querySelector('.tk-cid').innerHTML = url ? '<a href="' + url + '" target="_blank" rel="noopener">' + cid + '</a>' : cid;
      el.querySelector('.tk-proof').innerHTML = '<em>sig</em> ed25519 ✓ <em>int</em> blake3 ✓' + (url ? ' <button class="tk-copy" data-copy="' + cid + '">Copy token</button>' : '');
      const copyBtn = el.querySelector('.tk-copy');
      if (copyBtn) copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(copyBtn.dataset.copy); copyBtn.textContent = 'Copied ✓'; setTimeout(() => { copyBtn.textContent = 'Copy token'; }, 2000); } catch {}
      });
    }

    async function tokeniseFile(file) {
      const el = addToken(file.name, file.size);
      const body = new FormData();
      body.append('file', file);
      try {
        const r = await fetch('https://emem.dev/v1/remember', { method: 'POST', body, signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        fillToken(el, await r.json());
      } catch (e) {
        fillToken(el, { error: e.name === 'AbortError' ? 'Timed out — try a smaller file or open emem.dev directly.' : 'Could not tokenise — ' + (e.message || 'try emem.dev directly.') });
      }
    }

    async function tokeniseText(text) {
      const el = addToken(text, null);
      try {
        const r = await fetch('https://emem.dev/v1/remember', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: text }), signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        fillToken(el, await r.json());
      } catch (e) {
        fillToken(el, { error: e.name === 'AbortError' ? 'Timed out — try emem.dev directly.' : 'Could not tokenise — ' + (e.message || 'try emem.dev directly.') });
      }
    }

    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { [...fileInput.files].forEach(tokeniseFile); fileInput.value = ''; });
    goBtn.addEventListener('click', () => { const t = textInput.value.trim(); if (t) { tokeniseText(t); textInput.value = ''; } });
    textInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goBtn.click(); } });

    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); [...e.dataTransfer.files].forEach(tokeniseFile); });
  }

  // Planet WebGL — only if canvas is present (removed from current homepage)
  const scene = $('#planet-scene');
  const canvas = $('#earth-canvas');
  if (!scene || !canvas) return;
  const controls = [...document.querySelectorAll('.planet-mode')];
  const pause = $('#motion-toggle');
  let gl;
  try { gl=canvas.getContext('webgl', {alpha:false, antialias:false, depth:false, stencil:false, powerPreference:'low-power'}); } catch { /* static planet remains */ }
  if (!gl) { fallback(); return; }

  const vertexSource = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}';
  const fragmentSource = `
    precision mediump float;
    uniform vec2 resolution;
    uniform sampler2D earth;
    uniform float rotation;
    uniform float tilt;
    uniform float clock;
    uniform float mode;
    const float PI=3.14159265359;
    mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec2 p=(gl_FragCoord.xy*2.-resolution)/min(resolution.x,resolution.y);
      vec3 bg=vec3(.02745,.03529,.04706);
      vec3 color=bg;
      vec2 starCell=floor(gl_FragCoord.xy/95.);
      vec2 starLocal=fract(gl_FragCoord.xy/95.);
      vec2 starPos=vec2(hash(starCell),hash(starCell+41.));
      float star=(1.-smoothstep(.001,.009,length(starLocal-starPos)))*hash(starCell+23.);
      color+=vec3(.48,.57,.68)*star;
      float radius=.765;
      float d=length(p);
      vec3 light=normalize(vec3(-.9,.65,1.05));
      float atmosphere=exp(-abs(d-radius)*75.)*.24+exp(-abs(d-radius)*14.)*.035;
      color+=vec3(.22,.49,.87)*atmosphere;
      vec2 orbital=turn(-.37)*p;
      float ring=abs(length(orbital/vec2(1.06,.34))-1.);
      float ring2=abs(length((turn(.6)*p)/vec2(1.12,.57))-1.);
      float orbitLine=(1.-smoothstep(.0005,.0035,ring))*.33;
      float orbitLine2=(1.-smoothstep(.0005,.002,ring2))*.11;
      color+=vec3(.45,.63,.8)*(orbitLine+orbitLine2);
      if(d<radius){
        vec3 n=vec3(p,sqrt(radius*radius-d*d))/radius;
        vec3 mapped=n;
        mapped.xy=turn(tilt)*mapped.xy;
        vec2 uv=vec2(fract(atan(mapped.x,mapped.z)/(2.*PI)+.5+rotation),.5-asin(mapped.y)/PI);
        vec3 tex=texture2D(earth,uv).rgb;
        float diffuse=max(dot(n,light),0.);
        float daylight=smoothstep(-.14,.6,dot(n,light));
        vec3 lit=tex*(.06+daylight*.93)*vec3(.83,.94,1.12);
        lit=pow(lit,vec3(.92));
        float fresnel=pow(1.-n.z,3.8);
        lit+=vec3(.18,.43,.74)*fresnel*(.2+.8*diffuse);
        float ocean=clamp((tex.b-tex.r)*4.,0.,1.);
        float spec=pow(max(dot(reflect(-light,n),vec3(0.,0.,1.)),0.),30.);
        lit+=vec3(.4,.6,.8)*spec*ocean*.27;
        if(mode>.5){
          float lat=abs(fract(uv.y*18.+.5)-.5);
          float lng=abs(fract(uv.x*36.+.5)-.5);
          float grid=(1.-smoothstep(.007,.017,min(lat,lng)))*.20;
          float lum=dot(tex,vec3(.2126,.7152,.0722));
          lit=mix(lit,vec3(.1,.22,.29)*lum*2.,.6);
          lit+=vec3(.34,.8,.78)*grid;
          vec2 cell=floor(uv*vec2(90.,45.));
          vec2 local=fract(uv*vec2(90.,45.))-.5;
          float seed=hash(cell);
          float mark=(1.-smoothstep(.04,.12,length(local)))*step(.982,seed)*step(.13,lum);
          lit+=vec3(.65,1.,.52)*mark;
        }
        color=mix(bg,lit,1.-smoothstep(radius-.004,radius,d));
        if(orbital.y<0.)color+=vec3(.45,.63,.8)*orbitLine*.55;
      }
      vec2 satellite=turn(.37)*vec2(cos(clock*.12)*1.06,sin(clock*.12)*.34);
      if(length(satellite)>radius || sin(clock*.12)<0.){
        float dist=length(p-satellite);
        color+=vec3(.7,.95,.67)*(.65*exp(-dist*dist*95000.)+.16*exp(-dist*dist*1800.));
      }
      gl_FragColor=vec4(color,1.);
    }`;

  let program, shaders=[];
  function shader(type, source) {
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ gl.deleteShader(s); throw Error('Shader compilation failed'); }
    shaders.push(s); return s;
  }
  try {
    program=gl.createProgram(); gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource)); gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource)); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader linking failed');
  } catch { fallback(); return; }
  gl.useProgram(program); shaders.forEach(s=>gl.deleteShader(s));
  const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const uniforms={}; ['resolution','rotation','tilt','clock','mode','earth'].forEach(k=>uniforms[k]=gl.getUniformLocation(program,k));
  const texture=gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.earth,0);

  let angle=.12, inclination=-.25, time=15, view=0, dragging=false, lastX=0, lastY=0;
  let paused=motion.matches || !!navigator.connection?.saveData, visible=true, ready=false, raf=0, lastFrame=0, lost=false;
  const img=new Image();
  img.onload=()=>{
    if(lost)return;
    gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
    ready=true; scene.classList.add('has-webgl'); resize(); refresh();
  };
  img.onerror=fallback; img.src='assets/earth-day.webp';
  function fallback(){
    scene.classList.remove('has-webgl'); canvas.hidden=true;
    controls.forEach(b=>b.hidden=true); pause.hidden=true;
    const hint=$('.planet-hint'); if(hint)hint.textContent='EARTH / BLUE MARBLE';
    const label=$('.view-label'); if(label)label.hidden=true;
    scene.removeAttribute('tabindex'); scene.removeAttribute('role'); scene.setAttribute('aria-label','Earth, rendered from NASA Blue Marble imagery');
  }
  function draw(){
    if(!ready || lost)return;
    gl.uniform2f(uniforms.resolution,canvas.width,canvas.height); gl.uniform1f(uniforms.rotation,angle);
    gl.uniform1f(uniforms.tilt,inclination); gl.uniform1f(uniforms.clock,time); gl.uniform1f(uniforms.mode,view); gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function frame(now){
    raf=0;
    if(document.hidden || !visible || paused || lost || !ready)return;
    if(now-lastFrame>=1000/30){
      const dt=lastFrame ? Math.min((now-lastFrame)/1000,.1) : 0;
      if(!dragging)angle+=dt*.005;
      time+=dt; lastFrame=now; draw();
    }
    raf=requestAnimationFrame(frame);
  }
  function refresh(){
    if(raf)cancelAnimationFrame(raf); raf=0; lastFrame=0;
    pause.textContent=paused?'▶':'Ⅱ'; pause.setAttribute('aria-label',paused?'Play globe rotation':'Pause globe rotation'); pause.setAttribute('aria-pressed',String(paused));
    draw(); if(ready && !paused && visible && !document.hidden && !lost)raf=requestAnimationFrame(frame);
  }
  function resize(){
    const rect=scene.getBoundingClientRect();
    const scale=Math.min(devicePixelRatio||1,1.5,1200/Math.max(rect.width,rect.height));
    canvas.width=Math.max(1,Math.round(rect.width*scale)); canvas.height=Math.max(1,Math.round(rect.height*scale));
    gl.viewport(0,0,canvas.width,canvas.height); draw();
  }
  new ResizeObserver(resize).observe(scene);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;refresh();},{threshold:.01}).observe(scene);
  document.addEventListener('visibilitychange',refresh);
  motion.addEventListener('change',()=>{paused=motion.matches;refresh();});
  pause.addEventListener('click',()=>{paused=!paused;refresh();});
  controls.forEach(button=>button.addEventListener('click',()=>{
    view=button.dataset.view==='network'?1:0;
    controls.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('#scene-caption').textContent=view?'MEMORY GRID / CONCEPTUAL VIEW':'EARTH / BLUE MARBLE'; draw();
  }));
  scene.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse' && e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY;scene.setPointerCapture(e.pointerId);});
  scene.addEventListener('pointermove',e=>{
    if(!dragging)return;
    angle-=(e.clientX-lastX)*.00065; inclination=Math.max(-.8,Math.min(.8,inclination+(e.clientY-lastY)*.002));
    lastX=e.clientX;lastY=e.clientY;draw();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>scene.addEventListener(type,()=>{dragging=false;}));
  scene.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft')angle+=.035;if(e.key==='ArrowRight')angle-=.035;
    if(e.key==='ArrowUp')inclination=Math.min(.8,inclination+.07);if(e.key==='ArrowDown')inclination=Math.max(-.8,inclination-.07);draw();
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);fallback();});
  refresh();
})();
