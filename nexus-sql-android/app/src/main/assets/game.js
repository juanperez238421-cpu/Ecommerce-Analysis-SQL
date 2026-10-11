'use strict';
(() => {
  const $=(id)=>document.getElementById(id);
  const canvas=$('world'),frame=$('map-frame'),ctx=canvas.getContext('2d',{alpha:false});
  const WORLD={cols:28,rows:18,tile:40};
  const MW=WORLD.cols*WORLD.tile,MH=WORLD.rows*WORLD.tile;
  const THEMES=[
    {name:'AURORA-7',ground:'#112b35',groundLight:'#1b4050',dirt:'#152d36',line:'#365969',rock:'#254858',dust:'#90d8dc',glow:'#56e8dd',beam:'#59ffe1',ambient:'#091620',water:'#1a6273',accent:'#b9fff3'},
    {name:'DUST-9',ground:'#4d3437',groundLight:'#715049',dirt:'#513b37',line:'#b98a64',rock:'#906651',dust:'#ffbd80',glow:'#ffb574',beam:'#ffe7b0',ambient:'#281d29',water:'#705765',accent:'#ffe4a4'},
    {name:'CRYO-2',ground:'#254b60',groundLight:'#376980',dirt:'#24475b',line:'#8ac5d5',rock:'#a0c1ce',dust:'#ebffff',glow:'#9ce8ff',beam:'#d7ffff',ambient:'#0c2738',water:'#347f98',accent:'#d2fbff'}
  ];
  const state={world:null,config:null,sql:'',mode:'auto',running:false,busy:false,speed:1,zoom:1,theme:0,showGrid:false,seenEvent:0,
    robots:new Map(),particles:[],dust:[],t:0,last:0,lastStep:0,cam:null,snapshotStarted:false,canvasW:0,canvasH:0,popupUntil:0};
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const rand=(n)=>{const x=Math.sin(n*127.1+19.7)*43758.5453;return x-Math.floor(x);};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=(from,to,dt,rate=11)=>from+(to-from)*(1-Math.exp(-dt*rate));
  const C=(a,b,v)=>`rgba(${a},${b},${clamp(v,0,1)})`;
  const palette=()=>THEMES[state.theme];
  const format=(n)=>Number(n||0).toLocaleString('es-CO');
  function fetchJSON(url,options){
    if(window.NexusAndroid){
      return Promise.resolve().then(()=>{
        const json=window.NexusAndroid.request(options?.method||'GET',url,options?.body||'{}');
        const data=JSON.parse(json);
        if(data.error)throw new Error(data.error);
        return data;
      });
    }
    return fetch(url,options).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Error de conexión');return data;});
  }
  const post=(url,payload)=>fetchJSON(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  function message(text,error=false){$('status-text').textContent=text;$('status-text').parentElement.classList.toggle('error',error);}
  function updateNumbers(){const m=state.world?.meta;if(!m)return;
    $('metric-credits').innerHTML=`${format(m.credits)} <small>CR</small>`;
    $('metric-delivered').innerHTML=`${String(m.delivered).padStart(2,'0')} <small>UNIDADES</small>`;
    $('metric-robots').innerHTML=`${String(state.world.robots.length).padStart(2,'0')} <small>/ 02</small>`;
    $('metric-ticks').innerHTML=`${String(m.tick).padStart(3,'0')} <small>TICKS</small>`;
    const completed=m.delivered%8;$('mission-text').textContent=m.delivered>=8?`CICLO ${1+Math.floor(m.delivered/8)} · ESCALAR LA OPERACIÓN`:'ACTIVAR LA RED DE EXTRACCIÓN';
    $('mission-progress').textContent=`${completed} / 8 unidades para el siguiente nivel`;
    $('progress-fill').style.width=(completed/8*100)+'%';
    $('robot-list').replaceChildren(...state.world.robots.map(r=>{
      const node=document.createElement('div');node.className='robot-chip';
      const a=document.createElement('div');a.className='robot-avatar';a.textContent='⬡';
      const b=document.createElement('div');const title=document.createElement('div');title.className='robot-name';title.textContent=r.name;
      const details=document.createElement('div');details.className='robot-info';details.textContent=`⚡ ${r.energy}% · CARGA ${r.cargo}/${r.capacity} · ${r.status}`;
      b.append(title,details);node.append(a,b);return node;
    }));
  }
  function acceptWorld(world){
    if(!world || !world.robots)return;
    // Events are authoritative. Emit visual particles only for unseen events.
    const sorted=[...world.events].sort((a,b)=>a.id-b.id);
    if(state.snapshotStarted){for(const e of sorted){if(e.id>state.seenEvent && e.x!==null && e.y!==null)burst(e.x+.5,e.y+.5,e.kind);}}
    if(sorted.length)state.seenEvent=Math.max(state.seenEvent,sorted[sorted.length-1].id);
    for(const r of world.robots){if(!state.robots.has(r.id)){
      state.robots.set(r.id,{id:r.id,x:r.x+.5,y:r.y+.5,tx:r.x+.5,ty:r.y+.5,
        rotation:0,trail:[],color:r.id===1?'#87fff3':'#bf9dff',flash:0});
    }else{
      const sprite=state.robots.get(r.id);sprite.tx=r.x+.5;sprite.ty=r.y+.5;
    }}
    state.world=world;state.snapshotStarted=true;updateNumbers();renderEvents();
  }
  function renderEvents(){const stream=$('event-stream');stream.replaceChildren();
    for(const ev of state.world?.events||[]){const line=document.createElement('div');line.className='log-line';
      const t=document.createElement('span');t.className='log-time';t.textContent='['+String(ev.tick).padStart(3,'0')+']';
      const kind=document.createElement('span');kind.className='log-kind';kind.textContent=ev.kind.padEnd(7,' ')+'›';
      line.append(t,kind,document.createTextNode(' '+ev.message));stream.append(line);
    }
  }
  function showResults(output){const host=$('query-results');host.replaceChildren();
    $('row-counter').textContent=`${output.rows.length}${output.truncated?'+':''} ROWS`;
    if(!output.rows.length){const empty=document.createElement('div');empty.className='results-empty';empty.textContent='La consulta no devolvió resultados.';host.append(empty);return;}
    const table=document.createElement('table');table.className='data-table';const thead=document.createElement('thead'),headRow=document.createElement('tr');
    for(const col of output.columns){const th=document.createElement('th');th.textContent=col;headRow.append(th);}thead.append(headRow);table.append(thead);
    const tbody=document.createElement('tbody');for(const row of output.rows){const tr=document.createElement('tr');for(const col of output.columns){const td=document.createElement('td');td.textContent=row[col]===null?'NULL':String(row[col]);tr.append(td);}tbody.append(tr);}table.append(tbody);host.append(table);
  }
  function setPlaying(running){state.running=running;$('play').classList.toggle('running',running);
    $('play-icon').textContent=running?'Ⅱ':'▶';$('play-label').textContent=running?'PAUSAR':'EJECUTAR';}
  function setEditor(sql,mode){state.mode=mode;state.sql=sql;$('editor').value=sql;
    try{localStorage.setItem('nexus.sql.v03',sql);}catch{}
    document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.preset===mode));updateLineNumbers();}
  function updateLineNumbers(){const n=$('editor').value.split('\n').length;
    $('line-numbers').textContent=Array.from({length:n},(_,i)=>String(i+1).padStart(2,'0')).join('\n');}
  async function executeTick(){if(state.busy)return;state.busy=true;$('step').disabled=true;
    try{const start=performance.now(),sql=$('editor').value;
      // Inspecting arbitrary SELECTs does not mutate game state.
      const control=/\baction\b/i.test(sql)&&/\bx\b/i.test(sql)&&/\by\b/i.test(sql);
      if(!control){const result=await post('/api/query',{sql});showResults(result);setPlaying(false);message(`SELECT ejecutada: ${result.rows.length} filas. Sin órdenes de robot.`);}
      else{const data=await post('/api/tick',{sql});showResults(data.result);acceptWorld(data.state);message(data.message);}
      $('query-time').textContent=`${Math.round(performance.now()-start)} MS · SQLITE`;
    }catch(err){setPlaying(false);message(err.message,true);}finally{state.busy=false;$('step').disabled=false;}}
  async function queryOnly(){if(state.busy)return;state.busy=true;$('query-btn').disabled=true;
    try{const start=performance.now(),sql=$('editor').value;
      const result=await post('/api/query',{sql});showResults(result);
      $('query-time').textContent=`${Math.round(performance.now()-start)} MS · SQLITE`;
      message(`Consulta verificada · ${result.rows.length} fila(s). Para aplicar órdenes usa EJECUTAR.`);
    }catch(e){message(e.message,true);}finally{state.busy=false;$('query-btn').disabled=false;}}
  function initInputs(){
    $('play').addEventListener('click',()=>{setPlaying(!state.running);state.lastStep=0;message(state.running?'Protocolo en ejecución · SELECT reevaluada por tick.':'Ejecución detenida.');});
    $('step').addEventListener('click',()=>executeTick());
    $('query-btn').addEventListener('click',queryOnly);
    $('reset').addEventListener('click',async()=>{
      if(state.busy)return;setPlaying(false);
      if(!confirm('¿Reiniciar toda la simulación y la base de datos de la partida?'))return;
      try{state.snapshotStarted=false;state.robots.clear();state.seenEvent=0;acceptWorld(await post('/api/reset',{}));message('Colonia reiniciada. Protocolo preparado.');}catch(e){message(e.message,true);}
    });
    document.querySelectorAll('.speed').forEach(b=>b.addEventListener('click',()=>{state.speed=Number(b.dataset.speed);document.querySelectorAll('.speed').forEach(x=>x.classList.toggle('active',x===b));}));
    document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.preset;setEditor(mode==='auto'?state.config.default_sql:mode==='mine'?state.config.mine_sql:state.config.analysis_sql,mode);message(mode==='analysis'?'Modo de inspección: puedes explorar los datos sin mover robots.':'Protocolo cargado. Ejecuta para controlar drones.');}));
    $('editor').addEventListener('input',()=>{state.mode='custom';document.querySelectorAll('.preset').forEach(x=>x.classList.remove('active'));updateLineNumbers();try{localStorage.setItem('nexus.sql.v03',$('editor').value);}catch{}});
    $('editor').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('editor').scrollTop;});
    $('editor').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();e.target.setRangeText('  ',e.target.selectionStart,e.target.selectionEnd,'end');updateLineNumbers();}
      if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();executeTick();}});
    $('environment-btn').addEventListener('click',()=>{state.theme=(state.theme+1)%THEMES.length;$('environment-label').textContent=palette().name;terrainCache=null;message('Entorno '+palette().name+' activo · misma lógica SQL.');});
    $('grid-toggle').addEventListener('click',()=>{state.showGrid=!state.showGrid;$('grid-toggle').style.color=state.showGrid?'#78fff0':'';});
    $('zoom-in').addEventListener('click',()=>{state.zoom=clamp(state.zoom+.12,.8,1.65);$('zoom-label').textContent=Math.round(state.zoom*100)+'%';});
    $('zoom-out').addEventListener('click',()=>{state.zoom=clamp(state.zoom-.12,.8,1.65);$('zoom-label').textContent=Math.round(state.zoom*100)+'%';});
    const dialog=$('help-dialog');$('help-btn').addEventListener('click',()=>dialog.showModal());$('help-close').addEventListener('click',()=>dialog.close());$('help-got-it').addEventListener('click',()=>dialog.close());
    $('sound-toggle').addEventListener('click',()=>{message('Audio desactivado en este prototipo · interfaz y animaciones totalmente funcionales.');});
    canvas.addEventListener('click',evt=>{
      if(!state.world||!state.cam)return;
      const rc=canvas.getBoundingClientRect(),px=(evt.clientX-rc.left)*state.canvasW/rc.width,py=(evt.clientY-rc.top)*state.canvasH/rc.height;
      const x=Math.floor((px-state.cam.ox)/state.cam.scale/WORLD.tile),y=Math.floor((py-state.cam.oy)/state.cam.scale/WORLD.tile);
      const r=state.world.robots.find(v=>v.x===x&&v.y===y),f=state.world.facilities.find(v=>v.x===x&&v.y===y),n=state.world.resource_nodes.find(v=>v.x===x&&v.y===y);
      const popup=$('object-popup');let label='',details='';
      if(r){label='◈ '+r.name;details=`Energía ${r.energy}% · carga ${r.cargo}/${r.capacity} · ${r.status}`;}
      else if(f){label='⌘ '+f.code;details=`${f.type} · integridad ${f.integrity}%`;}
      else if(n){label='◇ '+n.resource;details=`Depósito ${n.stock}/${n.max_stock} · riqueza ${n.richness}/3`;}
      else{label=`SECTOR ${x}:${y}`;details='Zona de tránsito · sin activos identificados';}
      popup.replaceChildren();const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=label;span.textContent=details;popup.append(strong,span);popup.hidden=false;
      state.popupUntil=performance.now()+3600;
    });
  }

  // ---------- Simulation renderer: procedural layered lighting and motion ----------
  let terrainCache=null,cacheTheme=-1;
  function poly(g,pts,fill,stroke=null,w=1){g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke();}}
  function rr(g,x,y,w,h,r,fill,stroke=null,sw=1){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=sw;g.stroke();}}
  function ring(g,x,y,r,color,width=1,a=0,end=Math.PI*2){g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.arc(x,y,r,a,end);g.stroke();}
  function glow(g,x,y,r,color,opacity=.35){g.save();g.globalAlpha=opacity;const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(1,'transparent');g.fillStyle=gradient;g.beginPath();g.arc(x,y,r,0,2*Math.PI);g.fill();g.restore();}
  function drawCachedTerrain(){const th=palette();const off=document.createElement('canvas');off.width=MW;off.height=MH;const g=off.getContext('2d');
    g.fillStyle=th.ground;g.fillRect(0,0,MW,MH);
    const background=g.createLinearGradient(0,0,MW,MH);background.addColorStop(0,'#ffffff05');background.addColorStop(1,'#00000043');g.fillStyle=background;g.fillRect(0,0,MW,MH);
    for(let y=0;y<WORLD.rows;y++)for(let x=0;x<WORLD.cols;x++){
      const X=x*40,Y=y*40,k=x*197+y*439;const rnd=rand(k+1);
      g.fillStyle=rnd>.5?'#ffffff07':'#00000009';g.fillRect(X+1,Y+1,39,39);
      if(rand(k+5)>.27){g.fillStyle=th.groundLight+'77';g.fillRect(X+3+rand(k+3)*22,Y+2+rand(k+44)*27,4+rand(k+12)*10,1.4);}
      if(rand(k+12)>.81){g.strokeStyle=th.line+'88';g.lineWidth=1;g.beginPath();g.moveTo(X+8,Y+12);g.lineTo(X+18,Y+8);g.lineTo(X+24,Y+13);g.stroke();}
      if(rand(k+51)>.65){g.fillStyle='#c6eaf716';g.fillRect(X+rand(k+9)*35,Y+rand(k+4)*34,1.2,1.2);}
    }
    // Modular road network, industrial pads and metallic lanes.
    const lanes=[[[1,8],[26,8]],[[5,3],[5,15]],[[23,3],[23,16]],[[9,8],[9,14]],[[17,5],[17,16]]];
    g.lineCap='round';for(const [a,b] of lanes){
      const ax=(a[0]+.5)*40,ay=(a[1]+.5)*40,bx=(b[0]+.5)*40,by=(b[1]+.5)*40;
      g.strokeStyle='#081820a8';g.lineWidth=32;g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,by);g.stroke();
      g.strokeStyle=th.line+'8b';g.lineWidth=28;g.stroke();
      g.strokeStyle='#131d27dd';g.lineWidth=24;g.stroke();
      g.strokeStyle='#d9ffff19';g.lineWidth=1;g.setLineDash([9,15]);g.stroke();g.setLineDash([]);
      g.fillStyle='#5fe5e420';for(let t=0;t<Math.hypot(bx-ax,by-ay);t+=31){let f=t/Math.hypot(bx-ax,by-ay);g.fillRect(ax+(bx-ax)*f-2,ay+(by-ay)*f-2,4,4);}
    }
    // Rocky debris clusters create location-specific depth and silhouettes.
    for(let i=0;i<94;i++){const x=rand(i*23+1)*MW,y=rand(i*51+5)*MH;
      if(lanes.some(([a,b])=>Math.min(Math.abs(x-(a[0]+.5)*40),Math.abs(y-(a[1]+.5)*40))<27))continue;
      const s=3+rand(i*71+9)*9;
      poly(g,[[x-s,y+3],[x-s*.5,y-s*.4],[x+s*.5,y-s*.65],[x+s,y+s*.2],[x+s*.2,y+s*.6]],th.rock,'#091b2655');
      g.fillStyle='#faffff16';g.fillRect(x-s*.5,y-s*.43,s*.8,1.3);
    }
    // Peripheral geological/architectural decorations.
    for(let i=0;i<10;i++){
      const x=(i%5)*235+70,y=Math.floor(i/5)*615+57;
      ring(g,x,y,19,'#8ed2d019',2);ring(g,x,y,26,'#b3e5eb0e',1);
    }
    terrainCache=off;cacheTheme=state.theme;
  }
  const pos=([x,y])=>[(x+.5)*40,(y+.5)*40];
  function drawConduits(t){const th=palette();const lines=[[[4,8],[9,8]],[[9,8],[17,8]],[[17,8],[23,8]],[[5,12],[5,8]]];
    ctx.save();ctx.lineCap='round';for(const [a,b] of lines){const A=pos(a),B=pos(b);
      ctx.strokeStyle='#051016';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();
      ctx.strokeStyle=th.glow+'43';ctx.lineWidth=4;ctx.stroke();
      ctx.setLineDash([8,26]);ctx.lineDashOffset=-t*24;ctx.strokeStyle=th.glow+'bf';ctx.lineWidth=2.4;ctx.stroke();ctx.setLineDash([]);
      for(let u=0;u<=1;u+=.2){const px=A[0]+(B[0]-A[0])*u,py=A[1]+(B[1]-A[1])*u;glow(ctx,px,py,11,th.glow,.06);}
    }ctx.restore();
  }
  function drawFacility(f,t){const th=palette(),x=(f.x+.5)*40,y=(f.y+.5)*40,phase=t*.8;
    ctx.save();ctx.translate(x,y);
    glow(ctx,0,0,76,th.glow,.14);
    // shadow and cast vertical thickness
    ctx.fillStyle='#0209129c';ctx.beginPath();ctx.ellipse(4,14,40,19,-.1,0,Math.PI*2);ctx.fill();
    poly(ctx,[[-28,-24],[28,-24],[37,-13],[37,22],[26,31],[-26,31],[-36,22],[-36,-12]],'#0b1925','#36556a',1.4);
    poly(ctx,[[-27,-30],[27,-30],[36,-19],[36,14],[25,24],[-25,24],[-35,14],[-35,-18]],'#24374a','#497083',1.4);
    poly(ctx,[[-25,-29],[24,-29],[31,-21],[-32,-21]],'#5b819243');
    for(const dx of [-24,24])for(const dy of [-15,13]){rr(ctx,dx-3,dy-4,6,8,2,'#0b161e','#3b6975');glow(ctx,dx,dy,10,th.glow,.14);}
    rr(ctx,-21,-18,42,33,5,'#0c2130','#588396',1);
    for(let k=-1;k<=1;k++)rr(ctx,-17,-10+k*9,34,3,1,k===0?th.glow+'a0':'#528b9d');
    if(f.type==='HQ'){
      ring(ctx,0,-1,15,th.glow,2,phase,phase+Math.PI*1.4);ring(ctx,0,-1,8,'#bfffea',2);
      glow(ctx,0,-1,24,th.glow,.23);
      poly(ctx,[[0,-13],[12,-1],[0,11],[-12,-1]],'#61d4c2','#d2fffa',1.5);
      ring(ctx,0,-1,27,th.glow+'6b',1,phase*.2,phase*.2+Math.PI*.75);
    }else if(f.type==='DEPOT'){
      for(let k=0;k<3;k++){rr(ctx,-14+k*10,-9,8,21,2,'#233749','#54f3d496');rr(ctx,-12+k*10,-7,4,8,1,th.glow+'a0');}
      ring(ctx,0,0,27,'#b8ffee53',1,phase*.7,phase*.7+2.4);
    }else if(f.type==='CHARGER'){
      for(let a=0;a<5;a++){const ang=a*Math.PI*2/5+phase*.45;const px=Math.cos(ang)*15,py=Math.sin(ang)*15;
        ring(ctx,px,py,4,th.glow,2);}
      ctx.font='bold 23px monospace';ctx.fillStyle='#d8ffdf';ctx.textAlign='center';ctx.fillText('ϟ',0,8);
      glow(ctx,0,0,27,th.glow,.25);
    }else if(f.type==='REFINERY'){
      for(let k=0;k<3;k++){const x=-13+k*13;rr(ctx,x-4,-23,9,28,3,'#16283b','#7b8fa8');glow(ctx,x,-13+Math.sin(phase*3+k)*3,7,th.glow,.3);}
      rr(ctx,-17,9,34,5,2,th.glow+'aa');
    }else{
      ring(ctx,0,-3,14,'#80f9d5',3);ring(ctx,0,-3,9,th.glow,3,-phase,Math.PI*.9-phase);
      const rays=7;for(let i=0;i<rays;i++){const a=i/rays*Math.PI*2+phase*.6;ctx.strokeStyle=th.glow+'9c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.cos(a)*15,Math.sin(a)*15-3);ctx.lineTo(Math.cos(a)*26,Math.sin(a)*26-3);ctx.stroke();}
      glow(ctx,0,-3,28,th.glow,.18);
    }
    ctx.font='bold 9px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#d5f1f4e0';ctx.fillText(f.code,-1,47);
    ctx.restore();
  }
  function drawNode(n,t){const th=palette(),x=(n.x+.5)*40,y=(n.y+.5)*40,phase=t*2+n.id*1.93;
    ctx.save();ctx.translate(x,y);
    const halo=n.stock>0?.13+Math.sin(phase)*.06:.04;
    glow(ctx,0,0,43,n.resource==='CRYSTAL'?'#6fefff':'#ffd18b',halo);
    ring(ctx,0,0,25,th.glow+'4a',1,phase*.21,phase*.21+Math.PI*1.4);
    ring(ctx,0,0,20,'#d5fbff2b',1,-phase*.26,-phase*.26+Math.PI*.35);
    poly(ctx,[[-25,11],[-14,-9],[4,-16],[21,-11],[29,10],[10,22],[-13,21]],'#0a1720','#466878',1.4);
    poly(ctx,[[-21,5],[-13,-13],[2,-19],[19,-14],[24,5],[12,17],[-14,15]],'#304e61','#658ea2',1);
    const base=n.resource==='CRYSTAL'?'#50d4eb':'#ffbd74',light=n.resource==='CRYSTAL'?'#c6ffff':'#fff0c1',dark=n.resource==='CRYSTAL'?'#1d6287':'#a8654d';
    if(n.stock){for(let i=0;i<Math.min(3,n.stock);i++){
      const xx=(i-1)*11,yy=(i%2)*5+Math.sin(phase*.75+i)*1.2;
      poly(ctx,[[xx-8,yy+9],[xx-6,yy-10],[xx,yy-20-n.richness*3],[xx+8,yy-9],[xx+7,yy+8]],base,dark,1.7);
      poly(ctx,[[xx-6,yy-10],[xx,yy-20-n.richness*3],[xx,yy+7],[xx-7,yy+9]],dark);
      poly(ctx,[[xx,yy-20-n.richness*3],[xx+8,yy-9],[xx+7,yy+8],[xx,yy+7]],base);
      ctx.strokeStyle=light;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(xx,yy-19-n.richness*3);ctx.lineTo(xx+5,yy-8);ctx.stroke();
      }}else{ring(ctx,0,0,9,'#657984',2);}
    ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillStyle=n.stock?'#d1fcf7':'#708c97';ctx.fillText(`${n.stock}/${n.max_stock}`,0,30);
    ctx.restore();
  }
  function drawRobots(dt,t){for(const r of state.world?.robots||[]){const s=state.robots.get(r.id);if(!s)continue;
    let dx=s.tx-s.x,dy=s.ty-s.y;const moving=Math.abs(dx)+Math.abs(dy)>.02;
    if(moving){s.rotation=Math.atan2(dy,dx);s.trail.unshift([s.x,s.y,1]);if(s.trail.length>12)s.trail.pop();}
    s.x=smooth(s.x,s.tx,dt,7.8);s.y=smooth(s.y,s.ty,dt,7.8);
    s.trail=s.trail.filter(a=>a[2]>.04);for(const a of s.trail)a[2]-=dt*1.9;
    const x=s.x*40,y=s.y*40,bob=Math.sin(t*6+r.id*4)*2.3;
    ctx.save();for(const [tx,ty,a] of s.trail){glow(ctx,tx*40,ty*40,24,s.color,a*.12);}
    ctx.translate(x,y+bob);
    glow(ctx,0,-8,54,s.color,.20);
    ctx.fillStyle='#00111ca6';ctx.beginPath();ctx.ellipse(3,16,21,9,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(0,-7);ctx.rotate(moving?s.rotation+.15:Math.sin(t*.5+r.id)*.055);
    // hovering cargo carrier with separate luminous thrusters
    for(const sign of [-1,1]){
      rr(ctx,sign*17-7,-11,14,20,5,'#172b42','#7896b0',1);
      glow(ctx,sign*20,0,13,s.color,.23);
      rr(ctx,sign*17-3,-2,7,6,3,'#8bfcf4');
      for(let k=0;k<3;k++){
        const angle=k*Math.PI*2/3+t*15*(k%2?1:-1);ctx.strokeStyle='#bcfffd';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(sign*20-5*Math.cos(angle),1-5*Math.sin(angle));ctx.lineTo(sign*20+5*Math.cos(angle),1+5*Math.sin(angle));ctx.stroke();
      }
    }
    rr(ctx,-17,-16,34,27,9,'#101d32','#b6d8ea',1.6);
    poly(ctx,[[-13,-12],[13,-12],[17,-2],[12,5],[-12,5],[-17,-2]],r.id===1?'#476c86':'#635f87','#cce8fa',1.1);
    rr(ctx,-12,-7,24,10,4,'#071825','#90d7e0',1.3);
    glow(ctx,0,-2,17,s.color,.34);rr(ctx,-7,-5,14,5,2,s.color);
    poly(ctx,[[-7,11],[7,11],[4,17],[-4,17]],'#1e4151','#729ca8',1);
    ctx.restore();
    if(r.cargo){for(let i=0;i<r.cargo;i++){ctx.fillStyle=r.id===1?'#7ffbff':'#ddc1ff';ctx.beginPath();ctx.arc((i-(r.cargo-1)/2)*8,-27,3,0,2*Math.PI);ctx.fill();}}
    ctx.textAlign='center';ctx.font='bold 9px ui-monospace,monospace';ctx.fillStyle='#ebffff';ctx.fillText(r.name,0,-37);
    ctx.fillStyle='#071e27';ctx.fillRect(-18,-31,36,3);ctx.fillStyle=r.energy<30?'#ffc17e':'#7bfad7';ctx.fillRect(-18,-31,36*r.energy/100,3);
    ctx.restore();
  }}
  function burst(x,y,kind){const paletteColor={MINE:'#6df4ff',DELIVER:'#79ffd4',CHARGE:'#ffe3a1',REGEN:'#b9fdce'}[kind]||'#ecf9eb';
    for(let i=0;i<24;i++){const a=rand(i*44+state.t*8)*Math.PI*2,speed=25+rand(i*17+state.t)*85;
      state.particles.push({x:x*40,y:y*40,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-20,age:0,life:.6+rand(i*39)*.9,c:paletteColor,size:2+rand(i*13)*3});}
    if(state.particles.length>260)state.particles.splice(0,state.particles.length-260);
  }
  function drawParticles(dt){for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.age+=dt;
      if(p.age>p.life){state.particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=dt*43;
      ctx.globalAlpha=(1-p.age/p.life)*.8;ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.size*(1-p.age/p.life),p.size*(1-p.age/p.life));
    }ctx.globalAlpha=1;}
  function drawWeather(t){const th=palette();ctx.save();
    // Slow moving light across surfaces gives the world perceived depth.
    const x=(Math.sin(t*.05)*.35+.5)*MW,y=(Math.cos(t*.07)*.24+.35)*MH;
    glow(ctx,x,y,320,th.glow,.025);
    for(let i=0;i<90;i++){let dx=(rand(i*22+7)*MW+t*(state.theme===2?-4:6+rand(i)*14))%(MW+150);
      if(dx<0)dx+=MW+150;dx-=75;
      const dy=rand(i*49+9)*MH+Math.sin(t*.27+i)*7;
      ctx.globalAlpha=.08+rand(i*3)*.2;ctx.fillStyle=th.dust;ctx.fillRect(dx,dy,rand(i*9)*2+1,rand(i*15)*2+1);
    }
    ctx.restore();
  }
  function drawWorld(dt,t){if(!state.world)return;
    if(!terrainCache||cacheTheme!==state.theme)drawCachedTerrain();
    // High-DPI rendering with stable CSS-world mapping
    const W=state.canvasW,H=state.canvasH,base=Math.max(W/MW,H/MH)*state.zoom;
    const ox=W*.5-MW*.5*base,oy=H*.5-MH*.5*base;
    state.cam={ox,oy,scale:base};
    ctx.fillStyle=palette().ambient;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(ox,oy);ctx.scale(base,base);
    ctx.drawImage(terrainCache,0,0);
    drawConduits(t);
    const nodes=state.world.resource_nodes||[];for(const n of nodes)drawNode(n,t);
    const facilities=state.world.facilities||[];for(const f of facilities)drawFacility(f,t);
    drawRobots(dt,t);drawParticles(dt);drawWeather(t);
    if(state.showGrid){ctx.save();ctx.strokeStyle='#c5eff427';ctx.lineWidth=.6;ctx.beginPath();for(let x=0;x<=MW;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,MH);}for(let y=0;y<=MH;y+=40){ctx.moveTo(0,y);ctx.lineTo(MW,y);}ctx.stroke();ctx.restore();}
    ctx.restore();
    // HUD scan line and screen-space corners
    ctx.fillStyle='#b8fdff0c';const scan=(t*24)%H;ctx.fillRect(0,scan,W,1);
    const len=15;ctx.strokeStyle='#a5fffd45';ctx.lineWidth=1;
    for(const [x,y,sx,sy] of [[15,15,1,1],[W-15,15,-1,1],[15,H-15,1,-1],[W-15,H-15,-1,-1]]){
      ctx.beginPath();ctx.moveTo(x+sx*len,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*len);ctx.stroke();}
  }
  function resize(){const rect=frame.getBoundingClientRect();
    const dpr=clamp(window.devicePixelRatio||1,1,2);const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    state.canvasW=rect.width;state.canvasH=rect.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  let refreshRequested=false;
  function loop(now){const dt=clamp((now-state.last)/1000,0,.055);state.last=now;
    state.t+=reduced?dt*.4:dt;
    resize();
    if(state.world)drawWorld(dt,state.t);
    if($('object-popup').hidden===false&&now>state.popupUntil)$('object-popup').hidden=true;
    if(state.running&&!state.busy&&!refreshRequested&&now-state.lastStep>850/state.speed){state.lastStep=now;refreshRequested=true;
      executeTick().finally(()=>{refreshRequested=false;});}
    requestAnimationFrame(loop);
  }
  async function bootstrap(){initInputs();resize();requestAnimationFrame(loop);
    try{const [config,world]=await Promise.all([fetchJSON('/api/config'),fetchJSON('/api/state')]);state.config=config;acceptWorld(world);
      let saved;try{saved=localStorage.getItem('nexus.sql.v03');}catch{}
      setEditor(saved||config.default_sql,saved?'custom':'auto');message('SQLite conectado · 2 drones listos para ejecutar consultas.');
    }catch(e){message('No se pudo conectar con el motor SQLite: '+e.message,true);}}
  bootstrap();
})();
