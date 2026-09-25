/* The archive is the source of truth. Locations with no known anchor stay in the library.
   One WebGL draw call renders Earth; DOM pins use the inverse of the same projection. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const stage = $('#hero'), planet = $('#atlas-planet'), canvas = $('#atlas-canvas');
  if (!stage || !canvas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 760px)');
  const TAU = Math.PI * 2, rad = n => n * Math.PI / 180;
  const svgNS = 'http://www.w3.org/2000/svg';
  const viewer = $('#memory-viewer'), station = $('#station-dialog');
  let rotation = rad(12), pitch = rad(9), clock = 0, memoryMode = 0;
  let paused = reduced.matches || !!navigator.connection?.saveData;
  let visible = true, hovering = false, dragging = false, lastFrame = 0, raf = 0;
  let target = null, gl = null, program = null, uniforms = {}, ready = false;
  let layout = {}, activeMemory = null, focusOrigin = null;

  const anchors = [
    [/Bengaluru|Cubbon|Near infrared|Sentinel-2 bucket/i,12.9716,77.5946,'Bengaluru'],
    [/Phoenix/i,33.45,-112.07,'Phoenix'],
    [/London/i,51.51,-.13,'London'],
    [/Kruger/i,-24,31.5,'Kruger National Park'],
    [/Maasai Mara/i,-1.49,35.14,'Maasai Mara'],
    [/Marina Beach/i,13.05,80.28,'Marina Beach'],
    [/Rotterdam/i,51.95,4.14,'Port of Rotterdam'],
    [/Maui|Lahaina/i,20.878,-156.683,'Lahaina'],
    [/Amazon/i,-9.73,-63.03,'Amazon frontier'],
    [/Okavango/i,-19.55,23.05,'Okavango Delta'],
    [/Lusail/i,25.42,51.49,'Lusail'],
    [/Kalgoorlie/i,-30.777,121.506,'Kalgoorlie']
  ];
  const featured = [
    {match:'gkc2jap4',name:'Amazon frontier',image:'amazon-frontier-2017-2025',position:[13,59],mobile:[21,57],line:'2017–2025 · FOREST MEMORY',description:'A place remembered across time. Follow the changing forest frontier through the archived observations, then carry the original memory into your reasoning.'},
    {match:'twlpco5k',name:'Bengaluru, from orbit',position:[58,45],mobile:[80,43],line:'SENTINEL-2 · TRUE COLOUR',description:'The city, seen from orbit. A Sentinel-2 scene becomes an address an agent can read, with the original source and evidence a link away.'},
    {match:'sm45gry4',name:'Okavango, in motion',image:'okavango-delta-flood-pulse',position:[31,77],mobile:[79,59],line:'WATER · LAND · TIME',description:'Water moves. The memory remains. Explore the delta’s archived flood-pulse sequence and return to the evidence behind each observation.'},
    {match:'wkxa7tcm',name:'The Cosmic Cliffs',image:'carina',position:[84,28],mobile:[76,28],line:'DEEP SPACE · WEBB / NIRCAM',description:'A telescope observation of the Carina Nebula, beyond our solar system. This is astronomical evidence, not an Earth location. The original Webb image becomes an addressable memory for any AI agent.'}
  ];
  const memories = [...document.querySelectorAll('.observation')].map((card,index) => {
    const read = s => card.querySelector(s)?.textContent.trim() || '';
    const title = read('h3'), source = read('.obs-src');
    const anchor = anchors.find(a => a[0].test(title));
    const exact = source.match(/(?:timelapse|forest):\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    const feature = featured.find(f => card.href.includes(f.match));
    const data = {index,card,title,source,url:card.href,category:card.dataset.category,
      type:read('.obs-dtype'),meta:read('.obs-meta'),tokens:read('.obs-tokens'),
      image:card.querySelector('img')?.getAttribute('src') || '',feature,
      lat:exact ? Number(exact[1]) : anchor?.[1],lon:exact ? Number(exact[2]) : anchor?.[2],
      place:anchor?.[3],exact:!!exact};
    if(feature?.image) data.image='assets/observatory/'+feature.image+'.webp';
    // Keep modified clicks and the original href for ordinary browser navigation.
    card.addEventListener('click',event => {
      if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openMemory(data,card);
    });
    return data;
  });
  activeMemory = memories.find(m => m.feature?.match === 'gkc2jap4') || memories[0];

  const pinLayer = $('#world-pins'), featureLayer = $('#world-features'), connectorLayer = $('#world-connectors');
  for (const memory of memories) {
    if (Number.isFinite(memory.lat)) {
      const pin = document.createElement('button');
      pin.type='button';pin.className='world-pin'+(memory.feature?' featured':'');
      pin.setAttribute('aria-label','Explore '+memory.title);
      const label=document.createElement('span');label.textContent=memory.title;pin.append(label);
      pin.addEventListener('click',()=>openMemory(memory,pin));
      pinLayer.append(pin);memory.pin=pin;
    }
    if (memory.feature) {
      const feature=memory.feature, button=document.createElement('button');
      button.type='button';button.className='world-feature'+(memory.category==='space'?' is-space':'');
      button.setAttribute('aria-label','Explore '+memory.title+' — featured memory');
      const imageBox=document.createElement('div');imageBox.className='feature-image';
      const image=document.createElement('img');image.src=memory.image;image.alt='';image.width=260;image.height=140;image.draggable=false;
      const category=document.createElement('span');category.className='feature-category';category.textContent=memory.category==='space'?'DEEP SPACE':'EARTH MEMORY';
      const expand=document.createElement('span');expand.className='feature-expand';expand.textContent='↗';expand.setAttribute('aria-hidden','true');
      imageBox.append(image,category,expand);
      const caption=document.createElement('span');caption.className='feature-caption';
      const title=document.createElement('strong');title.textContent=feature.name;
      const sub=document.createElement('small');sub.textContent=feature.line;
      caption.append(title,sub);button.append(imageBox,caption);
      button.addEventListener('click',()=>openMemory(memory,button));
      button.addEventListener('pointerenter',()=>{hovering=true;});
      button.addEventListener('pointerleave',()=>{hovering=false;});
      featureLayer.append(button);memory.element=button;memory.subtitle=sub;
      const line=document.createElementNS(svgNS,'path');
      if(memory.category==='space')line.classList.add('space-line');
      connectorLayer.append(line);memory.line=line;
      if(memory.category==='earth'){
        const particle=document.createElementNS(svgNS,'circle');particle.setAttribute('r','1.8');
        connectorLayer.append(particle);memory.particle=particle;
      }
    } else if(memory.category==='space' && memory.image) {
      const spots={'7rn7fxbl':[66,23],'fi67bt4r':[82,46],'jxz6pghl':[57,14],'4uweu43y':[74,13]};
      const spot=Object.entries(spots).find(([key])=>memory.url.includes(key))?.[1];
      if(spot){
        const mini=document.createElement('button');mini.className='celestial-memory';mini.type='button';mini.dataset.observation=Object.keys(spots).find(key=>memory.url.includes(key));
        mini.style.left=spot[0]+'%';mini.style.top=spot[1]+'%';mini.setAttribute('aria-label','Explore '+memory.title);
        const image=document.createElement('img');image.src=memory.image;image.alt='';image.width=36;image.height=36;
        const label=document.createElement('span');label.textContent=memory.title;mini.append(image,label);
        mini.addEventListener('click',()=>openMemory(memory,mini));featureLayer.append(mini);
      }
    }
  }

  // Move the established studio and recall forms into the stations, preserving handlers.
  $('#station-generate').append($('#hero-terminal'));
  $('#station-recall').append($('#verify .recall-layout'));
  document.body.classList.add('world-enhanced');
  const headings = {generate:['⬡ LOCATE','Ground a place into memory.'],share:['◇ CITE','One token. Any agent can resolve it.'],verify:['⊘ VERIFY','Check the receipt — no trust required.'],recall:['⌕ RECALL','What does this place remember?']};
  function closeWorld(dialog) {
    dialog.close();
  }
  function openStation(name,origin) {
    if(!headings[name])return;
    if(viewer.open)viewer.close();
    focusOrigin=origin || document.activeElement;
    station.dataset.station=name;
    $('#station-label').textContent=headings[name][0];$('#station-heading').textContent=headings[name][1];
    station.querySelectorAll('.station-content').forEach(el=>{el.hidden=el.id!=='station-'+name;});
    if(name==='share') {
      $('#share-address').value=activeMemory.url;$('#share-original').href=activeMemory.url;
      $('#share-feedback').textContent=activeMemory.title+' · ready to copy';
      $('#share-copy').textContent='Copy memory link ↗';
    }
    if(name==='verify') {
      $('#verify-address').value=activeMemory.url;
      $('#verify-feedback').textContent='Open the record in emem to inspect and check its evidence.';
    }
    if(!station.open)station.showModal();
    document.body.classList.add('world-dialog-open');refresh();
    requestAnimationFrame(()=>{
      const input=station.querySelector('.station-content:not([hidden]) input, .station-content:not([hidden]) textarea');
      input?.focus({preventScroll:true});
    });
  }
  document.querySelectorAll('[data-station]').forEach(b=>b.addEventListener('click',()=>openStation(b.dataset.station,b)));
  document.querySelectorAll('a[href="#verify"],a[href="#generate"]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();openStation(a.hash==='#verify'?'recall':'generate',a);}));
  for(const dialog of [viewer,station]) {
    dialog.querySelector('[data-close-world]').addEventListener('click',()=>closeWorld(dialog));
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)closeWorld(dialog);
    });
    dialog.addEventListener('close',()=>{
      if(!viewer.open && !station.open){document.body.classList.remove('world-dialog-open');focusOrigin?.focus({preventScroll:true});refresh();}
    });
  }
  function coordinate(memory) {
    if(!Number.isFinite(memory.lat))return memory.category==='space'?'BEYOND EARTH / '+(memory.feature?'CARINA':'SPACE OBSERVATION'):'GLOBAL OR UNLOCATED OBSERVATION';
    return Math.abs(memory.lat).toFixed(2)+'° '+(memory.lat<0?'S':'N')+' / '+Math.abs(memory.lon).toFixed(2)+'° '+(memory.lon<0?'W':'E');
  }
  function openMemory(memory,origin) {
    activeMemory=memory;focusOrigin=origin;
    const start=origin?.getBoundingClientRect();
    viewer.style.setProperty('--memory-origin-x',start?(start.left+start.width/2-innerWidth/2)+'px':'0px');
    viewer.style.setProperty('--memory-origin-y',start?(start.top+start.height/2-innerHeight/2)+'px':'20px');
    $('#memory-view-title').textContent=memory.title;
    $('#memory-view-category').textContent=memory.category==='space'?'SPACE / EXTERNAL MEMORY':'EARTH / EXTERNAL MEMORY';
    $('#memory-view-description').textContent=memory.feature?.description || 'An observation from the emem archive. Explore its original record, share the memory, or inspect the evidence with emem.';
    const image=$('#memory-view-image');
    image.hidden=!memory.image;
    if(memory.image){image.src=memory.image;image.alt=memory.title+' — archived preview';}else image.removeAttribute('src');
    $('#memory-view-coordinate').textContent=coordinate(memory);
    const facts=$('#memory-view-facts');facts.replaceChildren();
    for(const [key,value] of [['Source',memory.source || 'Open original for source'],['Record',memory.meta || memory.type || 'Archive observation'],['Agent reads',memory.tokens.replace(/^agent reads\s*/i,'') || 'See original record'],['Location',Number.isFinite(memory.lat)?(memory.exact?'Coordinates from archive':'Approximate place anchor'):(memory.category==='space'?'Celestial observation':'No precise anchor supplied')]]) {
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=key;dd.textContent=value;row.append(dt,dd);facts.append(row);
    }
    $('#memory-view-address').textContent=memory.url;
    $('#memory-view-open').href=memory.url;
    if(Number.isFinite(memory.lat)) {
      let r=rad(memory.lon);while(r-rotation>Math.PI)r-=TAU;while(r-rotation< -Math.PI)r+=TAU;
      target={rotation:r,pitch:rad(memory.lat)*.65};
      if(reduced.matches || paused){rotation=target.rotation;pitch=target.pitch;target=null;render();}
    }
    if(station.open)station.close();
    if(!viewer.open)viewer.showModal();
    document.body.classList.add('world-dialog-open');refresh();
  }
  $('#memory-view-share').addEventListener('click',()=>openStation('share',focusOrigin));
  $('#memory-view-verify').addEventListener('click',()=>openStation('verify',focusOrigin));
  $('#share-address').addEventListener('input',()=>{
    const value=$('#share-address').value.trim();
    let valid=false;try{valid=new URL(value).protocol==='https:';}catch{}
    $('#share-original').hidden=!valid;
    if(valid)$('#share-original').href=value;
  });
  $('#share-copy').addEventListener('click',async()=>{
    const value=$('#share-address').value.trim();
    if(!value){$('#share-feedback').textContent='Choose a memory or paste its link first.';return;}
    try{await navigator.clipboard.writeText(value);$('#share-copy').textContent='Copied ✓';$('#share-feedback').textContent='Ready to paste into a conversation, document, or message.';}
    catch{$('#share-address').focus();$('#share-address').select();$('#share-feedback').textContent='The link is selected. Use your device’s copy command.';}
  });
  $('#world-verify-form').addEventListener('submit',event=>{
    event.preventDefault();const value=$('#verify-address').value.trim();
    const token=/^(?:emem:fact:)?[a-z2-7]{26,64}$/i.test(value);
    let memoryURL=false;
    try{const url=new URL(value);memoryURL=url.protocol==='https:' && url.hostname==='emem.dev' && url.pathname.startsWith('/memories/');}catch{}
    if(!token && !memoryURL){$('#verify-feedback').textContent='Paste an emem.dev memory link, an emem:fact: token, or a fact CID.';return;}
    // The studio reads existing memory links and verifies their own record type.
    // Fact receipts have a dedicated verifier; note CIDs are not fact CIDs.
    if(memoryURL) {
      document.dispatchEvent(new CustomEvent('vortx:open-studio',{detail:{input:value}}));
    } else {
      const cid=value.replace(/^emem:fact:/i,'');
      window.open('https://emem.dev/verify?cid='+encodeURIComponent(cid),'_blank','noopener');
    }
    $('#verify-feedback').textContent='Verification opened in emem. Review the result there.';
  });

  // Projection coordinates are shared by the texture renderer and every place pin.
  function project(lat,lon,radius=1) {
    const latitude=rad(lat),longitude=rad(lon)-rotation;
    const x=Math.cos(latitude)*Math.sin(longitude)*radius;
    const wy=Math.sin(latitude)*radius,wz=Math.cos(latitude)*Math.cos(longitude)*radius;
    const y=Math.cos(pitch)*wy-Math.sin(pitch)*wz;
    const z=Math.sin(pitch)*wy+Math.cos(pitch)*wz;
    return {x:layout.cx+x*layout.radius,y:layout.cy-y*layout.radius,z};
  }
  function updatePins() {
    if(!layout.width)return;
    for(const m of memories.filter(m=>m.feature)){
      if(!m.basepoint)continue;
      const dx=reduced.matches?0:Math.sin(clock*.23+m.index)*3;
      const dy=reduced.matches?0:Math.sin(clock*.31+m.index*.6)*5;
      m.element.style.setProperty('--drift-x',dx+'px');m.element.style.setProperty('--drift-y',dy+'px');
      m.point={x:m.basepoint.x+dx,y:m.basepoint.y+dy};
    }
    const occupied=[];
    // Featured anchors win collisions; identical locations remain reachable in the archive.
    const placed=memories.filter(m=>m.pin).sort((a,b)=>Number(!!b.feature)-Number(!!a.feature));
    for(const m of placed) {
      const p=project(m.lat,m.lon);
      const collision=occupied.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<22);
      const show=p.z>.07 && (!collision || m.feature) && ready;
      m.pin.hidden=!show;
      if(show){m.pin.style.left=p.x+'px';m.pin.style.top=p.y+'px';occupied.push(p);}
      if(m.line) {
        const point=m.point;
        if(p.z>.025 && ready && point) {
          const direction=point.x<layout.cx?1:-1;
          const edge=point.x+direction*m.width/2;
          const endY=point.y;
          m.line.setAttribute('d',`M ${p.x} ${p.y} L ${edge-direction*24} ${endY} L ${edge} ${endY}`);
          const t=(clock*.16+m.index*.1)%1;
          m.particle.setAttribute('cx',p.x+(edge-p.x)*t);m.particle.setAttribute('cy',p.y+(endY-p.y)*t);
          m.particle.style.opacity=String(Math.sin(t*Math.PI)*.75);
        } else {m.line.setAttribute('d','');if(m.particle)m.particle.style.opacity='0';}
        m.element.classList.toggle('far-side',p.z<=.025);
        const sub=p.z<=.025?'FAR SIDE · SELECT TO ORBIT':m.feature.line;
        if(m.subtitle.textContent!==sub)m.subtitle.textContent=sub;
      }
    }
    // Celestial evidence belongs to the deep-space field and never tethers to Earth.
    for(const m of memories.filter(m=>m.feature && m.category==='space'))m.line.setAttribute('d','');
  }
  function resize() {
    const r=stage.getBoundingClientRect(),p=planet.getBoundingClientRect();
    layout={width:r.width,height:r.height,cx:p.left-r.left+p.width/2,cy:p.top-r.top+p.height/2,radius:p.width*.43};
    const scale=Math.min(devicePixelRatio||1,1.6,1350/p.width);
    canvas.width=Math.round(p.width*scale);canvas.height=Math.round(p.height*scale);
    if(gl)gl.viewport(0,0,canvas.width,canvas.height);
    connectorLayer.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
    orbitalScene.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
    for(const m of memories.filter(m=>m.feature)) {
      const position=small.matches?m.feature.mobile:m.feature.position;
      m.element.style.setProperty('--x',position[0]+'%');m.element.style.setProperty('--y',position[1]+'%');
      m.basepoint={x:r.width*position[0]/100,y:r.height*position[1]/100};
      m.width=m.element.offsetWidth;
    }
    resizeStars();render();
  }

  function initGlobe() {
    try{gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power',premultipliedAlpha:false});}catch{}
    if(!gl){fallback();return;}
    const vertex='attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}';
    const fragment=`
      precision highp float;
      uniform vec2 resolution;
      uniform sampler2D earth;
      uniform float rotation, pitch, clock, memory;
      const float PI=3.14159265359;
      mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      void main(){
        vec2 p=(gl_FragCoord.xy*2.-resolution)/min(resolution.x,resolution.y);
        float radius=.86,d=length(p);
        vec3 color=vec3(0.);float alpha=0.;
        float halo=exp(-abs(d-radius)*64.)*.44+exp(-abs(d-radius)*18.)*.05;
        if(d>radius){color=vec3(.24,.55,.85);alpha=halo;}
        vec2 ringp=turn(-.31)*p;
        float ring=abs(length(ringp/vec2(.98,.30))-1.);
        float orbit=(1.-smoothstep(.001,.0038,ring))*.26;
        vec2 ring2p=turn(.8)*p;
        float ring2=abs(length(ring2p/vec2(.94,.57))-1.);
        float orbit2=(1.-smoothstep(.001,.0029,ring2))*.09;
        if(d<radius){
          vec3 n=vec3(p,sqrt(radius*radius-d*d))/radius;
          vec3 mapped=vec3(n.x,cos(pitch)*n.y+sin(pitch)*n.z,-sin(pitch)*n.y+cos(pitch)*n.z);
          vec2 uv=vec2(fract(atan(mapped.x,mapped.z)/(2.*PI)+.5+rotation/(2.*PI)),.5-asin(clamp(mapped.y,-1.,1.))/PI);
          vec3 tex=texture2D(earth,uv).rgb;
          vec3 light=normalize(vec3(-.9,.55,.8));
          float diffuse=dot(n,light);
          float day=smoothstep(-.15,.82,diffuse);
          color=tex*(.10+day*.82)*vec3(.8,.96,1.05);
          float fresnel=pow(1.-n.z,3.2);
          color+=vec3(.13,.39,.67)*fresnel*(.18+max(diffuse,0.)*.6);
          float ocean=clamp((tex.b-tex.r)*4.,0.,1.);
          float spec=pow(max(dot(reflect(-light,n),vec3(0.,0.,1.)),0.),38.);
          color+=vec3(.5,.68,.72)*spec*ocean*.19;
          float lat=abs(fract(uv.y*18.+.5)-.5),lon=abs(fract(uv.x*36.+.5)-.5);
          float grid=(1.-smoothstep(.003,.017,min(lat,lon)));
          color+=vec3(.45,.67,.65)*grid*(.017+memory*.13);
          color=mix(color,color*vec3(.63,.94,.85),memory*.45);
          float scan=pow(max(0.,1.-abs(mapped.y-sin(clock*.13))*.9),28.);
          color+=vec3(.33,.65,.44)*scan*.08*memory;
          alpha=1.;
          if(ringp.y<0.)color+=vec3(.52,.73,.75)*orbit*.5;
        }else{
          color=mix(color,vec3(.4,.63,.7),min(1.,(orbit+orbit2)*3.));
          alpha=max(alpha,orbit+orbit2);
        }
        gl_FragColor=vec4(color,alpha);
      }`;
    const shaders=[];
    function compile(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Globe shader unavailable');return s;}
    try {
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Globe unavailable');
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      for(const name of ['resolution','earth','rotation','pitch','clock','memory'])uniforms[name]=gl.getUniformLocation(program,name);
      const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(uniforms.earth,0);
      const image=new Image();image.onload=()=>{try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);ready=true;planet.classList.add('ready');resize();refresh();}catch{fallback();}};image.onerror=fallback;image.src='assets/earth-day.webp';
    }catch{fallback();}finally{shaders.forEach(s=>gl.deleteShader(s));}
  }
  function fallback(){ready=false;planet.classList.remove('ready');planet.classList.add('unavailable');$('#world-coordinates').textContent='EARTH / EXPLORE THE MEMORY WINDOWS';document.querySelectorAll('[data-world-view]').forEach(b=>b.disabled=true);updatePins();}
  function render(){
    if(gl && ready){gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform1f(uniforms.rotation,rotation);gl.uniform1f(uniforms.pitch,pitch);gl.uniform1f(uniforms.clock,clock);gl.uniform1f(uniforms.memory,memoryMode);gl.drawArrays(gl.TRIANGLES,0,6);}
    updatePins();drawStars();drawOrbiters();drawIntelligence();
  }

  // Illustrative spacecraft, not live positions or a claim that Vortx has launched.
  // The same sphere radius as the globe determines far-side occlusion.
  const orbitalScene=$('#orbital-scene');
  const orbiters=[
    {model:'survey-craft',radius:1.22,tilt:.34,roll:-.65,phase:2.9,mobilePhase:1.6,speed:.046,scale:1.05},
    {model:'relay-craft',radius:1.42,tilt:1.03,roll:.95,phase:4.65,mobilePhase:3.8,speed:-.033,scale:.8}
  ].map(data=>{
    const path=document.createElementNS(svgNS,'path');path.classList.add('orbital-track');
    const craft=document.createElementNS(svgNS,'g');craft.classList.add('orbital-craft');
    const model=document.createElementNS(svgNS,'use');model.setAttribute('href','#'+data.model);craft.append(model);
    $('#orbital-paths').append(path);$('#orbital-crafts').append(craft);
    return {...data,path,craft};
  });
  function orbitPoint(orbit,t){
    const r=layout.radius*orbit.radius,xx=Math.cos(t)*r,yy=Math.sin(t)*r*Math.sin(orbit.tilt),z=Math.sin(t)*r*Math.cos(orbit.tilt);
    const perspective=1/(1-z/(layout.radius*7));
    const x=(xx*Math.cos(orbit.roll)-yy*Math.sin(orbit.roll))*perspective;
    const y=(xx*Math.sin(orbit.roll)+yy*Math.cos(orbit.roll))*perspective;
    return {x:layout.cx+x,y:layout.cy+y,z,perspective,hidden:z<0 && Math.hypot(x,y)<layout.radius+2};
  }
  function drawOrbiters(){
    if(!layout.radius)return;
    for(const orbit of orbiters){
      // Paths only change on resize; craft position follows the shared motion clock.
      const key=[layout.width,layout.height,layout.radius].join('/');
      if(orbit.layoutKey!==key){
        let path='',connected=false;
        for(let i=0;i<=160;i++){
          const p=orbitPoint(orbit,i/160*TAU);
          if(p.hidden){connected=false;continue;}
          path+=(connected?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1);connected=true;
        }
        orbit.path.setAttribute('d',path);orbit.layoutKey=key;
      }
      const t=(small.matches?orbit.mobilePhase:orbit.phase)+clock*orbit.speed,p=orbitPoint(orbit,t),next=orbitPoint(orbit,t+.001);
      const angle=Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI+90;
      const scale=orbit.scale*p.perspective*(small.matches ? .52 : Math.min(1,layout.width/1250));
      orbit.craft.setAttribute('transform',`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${scale.toFixed(3)})`);
      orbit.craft.setAttribute('opacity',p.hidden?'0':p.z<0?'.65':'.95');
      orbit.craft.dataset.occluded=String(p.hidden);
    }
  }

  // Stars and a faint orbital flow move at a capped cadence, and stop offscreen.
  const starsCanvas=$('#world-stars'), starsContext=starsCanvas.getContext('2d');
  const intelligenceCanvas=$('#intelligence-field'), intelligence=intelligenceCanvas.getContext('2d');
  const nexus=$('.memory-nexus'), explorer=$('.ai-explorer');
  let companionMode='';
  let nexusPoint={x:0,y:0},look={x:0,y:0},lookTarget={x:0,y:0};

  // ── Companion pose state machine ──
  let currentPose='',poseTimer=0,sleepTimer=0;
  const SLEEP_DELAY=25000; // ms of inactivity before sleep
  function setPose(pose){
    if(pose===currentPose)return;
    currentPose=pose;
    stage.dataset.companionPose=pose;
    sleepTimer=Date.now();
  }
  // Greet on first appearance
  setPose('greet');
  setTimeout(()=>{if(currentPose==='greet')setPose('');},1500);
  // Sleep after prolonged inactivity
  function checkSleep(){
    if(paused || !visible || document.hidden || station.open || viewer.open)return;
    if(currentPose==='sleep'||currentPose==='greet'||currentPose==='active'||currentPose==='think')return;
    if(Date.now()-sleepTimer>SLEEP_DELAY)setPose('sleep');
  }
  // Wake on any interaction in the stage
  stage.addEventListener('pointerdown',()=>{if(currentPose==='sleep'){setPose('greet');setTimeout(()=>{if(currentPose==='greet')setPose('');},1200);}else{sleepTimer=Date.now();}},{passive:true});
  stage.addEventListener('pointermove',()=>{if(currentPose==='sleep'){setPose('');} sleepTimer=Date.now();},{passive:true});
  let stars=[];
  let seed=17;
  const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  function resizeStars(){
    starsCanvas.width=Math.round(layout.width);starsCanvas.height=Math.round(layout.height);seed=17;
    intelligenceCanvas.width=starsCanvas.width;intelligenceCanvas.height=starsCanvas.height;
    const bounds=stage.getBoundingClientRect(),n=nexus.getBoundingClientRect();
    // Anchor to the stable button, never to the animated image's changing bounds.
    nexusPoint={x:n.left-bounds.left+n.width/2,y:n.top-bounds.top+26};
    stars=Array.from({length:small.matches?120:240},()=>({x:random(),y:random(),size:random()>.98?1.4:random()*.7+.2,alpha:.15+random()*.55,phase:random()*TAU}));
  }
  function drawStars(){
    if(!starsContext)return;
    const c=starsContext,w=starsCanvas.width,h=starsCanvas.height;c.clearRect(0,0,w,h);
    for(const s of stars){const x=(s.x*w+Math.sin(clock*.025+s.phase)*2),y=s.y*h;c.globalAlpha=s.alpha*(.85+Math.sin(clock*.3+s.phase)*.15);c.fillStyle=s.size>1?'#c9d9ca':'#afc7dc';c.beginPath();c.arc(x,y,s.size,0,TAU);c.fill();}
    c.globalAlpha=1;
  }
  function drawIntelligence(){
    if(!intelligence || !layout.width)return;
    const c=intelligence,w=layout.width,h=layout.height,n=nexusPoint;
    c.clearRect(0,0,w,h);
    const size=small.matches?15:21;
    // Soft glow beneath the companion
    const glow=c.createRadialGradient(n.x,n.y,2,n.x,n.y,size*3.5);
    glow.addColorStop(0,'#91e4dc24');glow.addColorStop(.45,'#79c0d20c');glow.addColorStop(1,'#79c0d200');
    c.fillStyle=glow;c.fillRect(n.x-size*4,n.y-size*4,size*8,size*8);
    // Evidence flows: Earth surface and sky observations converge on emem
    const earthSource={x:layout.cx+layout.radius*.77,y:layout.cy+layout.radius*.12};
    const skySource={x:w*.76,y:h*.34};
    for(const [i,start] of [earthSource,skySource].entries()){
      const end={x:n.x-(i?-1:1)*size*1.1,y:n.y};
      const bend={x:(start.x+end.x)/2,y:Math.min(start.y,end.y)-(i?12:45)};
      c.strokeStyle=i?'#bb9c7150':'#8dc6c64a';c.lineWidth=.65;c.setLineDash([2,7]);c.lineDashOffset=-clock*4;
      c.beginPath();c.moveTo(start.x,start.y);c.quadraticCurveTo(bend.x,bend.y,end.x,end.y);c.stroke();c.setLineDash([]);
      for(let k=0;k<3;k++){const t=(clock*.095+k/3+i*.2)%1,s=1-t,x=s*s*start.x+2*s*t*bend.x+t*t*end.x,y=s*s*start.y+2*s*t*bend.y+t*t*end.y;c.fillStyle=i?'#d3bc93':'#b8e9df';c.globalAlpha=Math.sin(t*Math.PI)*.65;c.fillRect(x-1,y-1,2,2);}
      c.globalAlpha=1;
    }
    if(!paused){look.x+=(lookTarget.x-look.x)*.04;look.y+=(lookTarget.y-look.y)*.04;}
    const dx=reduced.matches?0:look.x,dy=reduced.matches?0:look.y+Math.sin(clock*.35)*2;
    explorer.style.setProperty('--explorer-x',dx+'px');explorer.style.setProperty('--explorer-y',dy+'px');
  }
  // The character is a real entry point. Thinking is reserved for an actual request.
  const companionInput=$('#companion-place'),recallForm=$('#recall-form');
  nexus.addEventListener('click',()=>{
    setPose('attend');companionInput.focus({preventScroll:true});
  });
  $('#companion-query').addEventListener('submit',event=>{
    event.preventDefault();
    const place=companionInput.value.trim();if(!place)return;
    if(recallForm.dataset.busy){openStation('recall',companionInput);return;}
    $('#recall-place').value=place;openStation('recall',companionInput);
    recallForm.requestSubmit();
  });
  new MutationObserver(()=>{
    clearTimeout(poseTimer);
    if(recallForm.dataset.busy){setPose('think');return;}
    setPose($('#terminal-indicator').textContent==='RECORD RECEIVED'?'active':'attend');
    poseTimer=setTimeout(()=>setPose(''),3000);
  }).observe(recallForm,{attributes:true,attributeFilter:['data-busy']});
  // Action buttons: companion leans toward hovered action
  const actionButtons=[...document.querySelectorAll('.companion-actions button')];
  function attendAction(button){
    companionMode=button?.dataset.station || '';stage.dataset.companionAction=companionMode;
    if(!recallForm.dataset.busy)setPose(button?'attend':'');
    const lean=button?Math.sign(button.getBoundingClientRect().left-nexus.getBoundingClientRect().left)*3:0;
    explorer.style.setProperty('--companion-lean',reduced.matches?'0deg':lean+'deg');
  }
  for(const button of actionButtons){
    button.addEventListener('pointerenter',()=>attendAction(button));
    button.addEventListener('pointerleave',()=>attendAction(actionButtons.includes(document.activeElement)?document.activeElement:null));
    button.addEventListener('focus',()=>attendAction(button));
    button.addEventListener('blur',()=>attendAction(null));
  }
  companionInput.addEventListener('focus',()=>{if(!recallForm.dataset.busy)setPose('attend');});
  companionInput.addEventListener('blur',()=>{if(!recallForm.dataset.busy)setPose('');});
  stage.addEventListener('pointermove',event=>{if(event.pointerType==='mouse' && !dragging){const r=stage.getBoundingClientRect();lookTarget={x:(event.clientX-r.left-r.width/2)/r.width*8,y:(event.clientY-r.top-r.height/2)/r.height*5};}},{passive:true});
  stage.addEventListener('pointerleave',()=>{lookTarget={x:0,y:0};});
  function frame(now){
    raf=0;if(!visible || document.hidden)return;
    if(now-lastFrame>=1000/30){
      const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
      if(!paused){clock+=dt;if(target){rotation+=(target.rotation-rotation)*.075;pitch+=(target.pitch-pitch)*.075;if(Math.abs(target.rotation-rotation)<.001)target=null;}else if(!dragging && !hovering && !viewer.open && !station.open)rotation+=dt*.012;}
      checkSleep();render();
    }
    if(!paused)raf=requestAnimationFrame(frame);
  }
  function refresh(){
    if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;
    document.body.classList.toggle('world-paused',paused);
    document.body.classList.toggle('world-scene-inactive',!visible || document.hidden);
    const button=$('#world-motion');button.textContent=paused?'▷':'Ⅱ';button.setAttribute('aria-label',paused?'Play world motion':'Pause world motion');button.setAttribute('aria-pressed',String(paused));
    render();if(!paused && visible && !document.hidden)raf=requestAnimationFrame(frame);
  }
  $('#world-motion').addEventListener('click',()=>{paused=!paused;refresh();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;refresh();});
  document.querySelectorAll('[data-world-view]').forEach(button=>button.addEventListener('click',()=>{
    memoryMode=button.dataset.worldView==='memory'?1:0;
    document.querySelectorAll('[data-world-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('#world-coordinates').textContent=memoryMode?'MEMORY LAYER / SELECT A PLACE':'DRAG TO ORBIT · SELECT TO EXPLORE';render();
  }));
  const immersive=$('#world-immersive');
  if(!stage.requestFullscreen)immersive.hidden=true;
  immersive.addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}
    catch{$('#world-coordinates').textContent='FULLSCREEN IS UNAVAILABLE IN THIS BROWSER';}
  });
  document.addEventListener('fullscreenchange',()=>{
    // Fullscreen's top layer must also contain the dialogs.
    const host=document.fullscreenElement?stage:document.body;
    host.append(viewer,station,$('#ememfy-studio'));
    immersive.setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen world':'Enter fullscreen world');resize();
  });
  let pointer=null;
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse' && event.button!==0)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY};dragging=true;target=null;canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!dragging || pointer?.id!==event.pointerId)return;
    rotation-=(event.clientX-pointer.x)*.006;pitch=Math.max(-1.1,Math.min(1.1,pitch+(event.clientY-pointer.y)*.004));
    pointer.x=event.clientX;pointer.y=event.clientY;render();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=false;pointer=null;});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
    event.preventDefault();target=null;
    if(event.key==='ArrowLeft')rotation+=.13;if(event.key==='ArrowRight')rotation-=.13;
    if(event.key==='ArrowUp')pitch=Math.min(1.1,pitch+.1);if(event.key==='ArrowDown')pitch=Math.max(-1.1,pitch-.1);
    if(event.key==='Home'){rotation=rad(12);pitch=rad(9);}render();
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
  document.addEventListener('visibilitychange',refresh);
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;refresh();},{threshold:0}).observe(stage);
  initGlobe();resize();refresh();
  if(location.hash==='#generate')openStation('generate');
  if(location.hash==='#verify')openStation('recall');
})();
