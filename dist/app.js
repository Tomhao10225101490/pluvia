import {W,H,N,CELL,AREA,KIT,SCENARIOS,createCity,costOf,validatePlan,simulate,route,rainRate} from './engine.js';
import {exportCover,recordDemo} from './demo.js';
const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
const fmt=(v,d=0)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
const money=v=>'$'+fmt(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let seed=7,city=createCity(seed),plan=[],history=[],budget=180000,config={...SCENARIOS.cloudburst,soilFactor:1},scenario='cloudburst';
let results=null,worker=null,busy=false,tool='inspect',layer='water',minute=40,playing=false,speed=1,showRoute=false,hover=-1,selected=-1,zoom=1,frontier=[],elevation=null;
let width=0,height=0,scale=1,ox=0,oy=0,lastTick=0,lastDraw=0,dirty=true,toastTimer,presentationBaseline=false,city3d=null,cameraMode='2d',autoOrbit=false,recording=false,jobSerial=0,mainJob=0,displayDatum=0;
const canvas=$('cityCanvas'),ctx=canvas.getContext('2d'),chart=$('hydrograph'),cx=chart.getContext('2d'),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage={get(){try{return JSON.parse(localStorage.getItem('pluvia-v1'));}catch{return null;}},set(v){try{localStorage.setItem('pluvia-v1',JSON.stringify(v));}catch{}}};
const snapshot=()=>({version:1,seed,budget,config,scenario,plan,elevation});
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);}
function modal(html){$('modalContent').innerHTML=html;$('modal').showModal();}
function setBusy(value,title='Following every drop…',detail='Running paired simulations'){
  busy=value;$('busy').hidden=!value;$('busyText').textContent=title;$('busyDetail').textContent=detail;
  for(const id of ['optimizeBtn','runBtn','stressBtn','newMapBtn','undoBtn','clearBtn','importBtn','budget','rainfall','duration','soil','scenario','exampleBtn','elevationBtn','elevationFile','importFile','reportBtn'])if($(id))$(id).disabled=value;
}
function makeWorker(){if(worker)worker.terminate();worker=new Worker('./worker.js',{type:'module'});worker.onerror=()=>{setBusy(false);toast('The background engine could not start. Reload to retry.');};worker.onmessage=({data})=>{
  if(data.jobId!==mainJob)return;
  if(data.type==='progress'){$('busyDetail').textContent=`${data.evaluated} full simulations · ${data.round} improvements · ${money(data.cost)}`;$('optimizerNote').textContent=`Testing interventions: ${data.evaluated} simulations evaluated`;return;}
  if(data.type==='error'){setBusy(false);toast(data.message);return;}
  if(data.type==='optimized'){
    history.push(plan.map(p=>({...p})));plan=data.plan;frontier=data.frontier;storage.set(snapshot());updateBudget();
    $('optimizerNote').textContent=`${data.evaluated} simulations evaluated · ${plan.length} interventions`;
    toast(`Plan found: ${plan.length} interventions, ${money(costOf(plan))}. Every choice was simulated.`);run();return;
  }
  if(data.type==='simulation'){results={baseline:data.baseline,design:data.design};setBusy(false);$('timeline').max=config.duration;minute=clamp(minute,0,config.duration);update();renderCompare();dirty=true;}
};}
function payload(action){return {action,seed,relief:1,plan,config,budget,elevation,jobId:++jobSerial};}
function run(){playing=false;$('playBtn').textContent='▶';setBusy(true);const message=payload('simulate');mainJob=message.jobId;worker.postMessage(message);storage.set(snapshot());}
function updateBudget(){const spent=costOf(plan);$('budgetValue').textContent=money(budget);$('spentValue').textContent=money(spent);$('budgetFill').style.width=`${spent/budget*100}%`;$('tileCount').textContent=`${plan.length} intervention${plan.length!==1?'s':''}`;$('mapPlanLabel').textContent=plan.length?`${plan.length} interventions`:'Baseline city';}
function currentFrame(which='design'){if(presentationBaseline&&which==='design')which='baseline';return results?.[which].frames[Math.min(Math.round(minute),results[which].frames.length-1)]??new Float32Array(N);}
function update(){
  updateBudget();$('rainValue').textContent=config.intensity;$('stormLabel').textContent=`${scenario==='custom'?'Custom storm':SCENARIOS[scenario]?.name??'Shared scenario'} · ${config.duration} min`;
  $('timeline').value=minute;$('timelineMid').textContent=config.duration/2+' min';$('timelineEnd').textContent=config.duration+' min';$('timeLabel').textContent=`Minute ${fmt(minute)}`;
  if(!results)return;
  const b=results.baseline.metrics,d=results.design.metrics,reduction=b.peakVolume?100*(1-d.peakVolume/b.peakVolume):0;
  $('reduction').textContent=fmt(reduction,1);$('impactCaption').textContent=plan.length?`${fmt(b.peakVolume-d.peakVolume)} m³ less water at the surface peak.`:'Place an intervention to make a difference.';
  $('baseVolume').textContent=fmt(b.peakVolume)+' m³';$('designVolume').textContent=fmt(d.peakVolume)+' m³';$('designBar').style.width=`${b.peakVolume?clamp(d.peakVolume/b.peakVolume*100,0,100):0}%`;$('baseBar').style.width=b.peakVolume?'100%':'0';
  $('floodArea').innerHTML=fmt(d.peakArea)+'<small> m²</small>';
  $('floodDelta').textContent=b.peakArea?`${fmt(100*(1-d.peakArea/b.peakArea),1)}% change vs baseline · >10 cm`:'No cells exceed 10 cm';
  $('retained').innerHTML=fmt(d.infiltrated+d.stored)+'<small> m³</small>';
  $('retainDelta').textContent=plan.length?`+${fmt(d.infiltrated+d.stored-b.infiltrated-b.stored)} m³ vs baseline`:'Across the full storm';
  $('balanceLabel').textContent=`Residual: ${Math.abs(d.balance)<.001?'< 0.001':fmt(Math.abs(d.balance),3)} m³`;
  const r=route(city,currentFrame());$('routeStatus').textContent=r.path.length?`${fmt(r.length)} m · route available`:'No route below 15 cm';$('routeDetail').textContent=`At minute ${fmt(minute)} · school → community center`;
  dirty=true;drawChart();
}
function chooseTool(value){tool=value;$$('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===value));$('eraseBtn').style.color=value==='erase'?'var(--green)':'';$('mapHint').textContent=value==='inspect'?(cameraMode==='3d'?'Drag to orbit · Right-drag to pan · Click a tile':'⌖ Click any tile to explore · Scroll to zoom'):value==='erase'?'Click an intervention to remove it':`${KIT[value].name}: click a compatible tile · Esc to inspect`;dirty=true;}
function editAt(i){
  if(busy||i<0||i>=N)return;
  if(tool==='inspect'){selected=i;showInspector(i);dirty=true;return;}
  const next=plan.filter(p=>p.i!==i);
  if(tool!=='erase'){
    if(!KIT[tool].allowed.includes(city.type[i]))return toast(tool==='pavement'?'Permeable paving belongs on a street tile.':'Choose an open ground or park tile for this intervention.');
    next.push({i,kind:tool});
  }
  if(costOf(next)>budget)return toast('That would exceed the budget. Increase it or remove an intervention.');
  if(JSON.stringify(next)===JSON.stringify(plan))return;
  history.push(plan.map(p=>({...p})));plan=next;frontier=[];updateBudget();run();
}
function showInspector(i){
  const el=$('inspector');if(i<0){el.hidden=true;return;}
  const names=['Open ground','Street','Building rooftop','Parkland','River outlet'],p=plan.find(p=>p.i===i),point=cameraMode==='3d'&&city3d?city3d.projectCell(i):project(i%W+.5,Math.floor(i/W)+.5,city.z[i]);
  el.hidden=false;el.style.left=clamp(point[0]+16,8,width-190)+'px';el.style.top=clamp(point[1]-50,55,height-130)+'px';
  el.innerHTML=`<b>${p?KIT[p.kind].name:names[city.type[i]]}</b><span>Cell ${i%W+1}, ${Math.floor(i/W)+1} · 64 m²</span><br>Elevation <strong>${fmt(city.z[i],2)} m</strong><br>Water depth <strong>${fmt(currentFrame()[i]*100,1)} cm</strong>${p?`<br>Storage capacity <strong>${fmt(KIT[p.kind].capacity*AREA,1)} m³</strong>`:''}`;
}
function project(x,y,z=0){return [ox+(x-y)*scale,oy+(x+y)*scale*.48-(z-displayDatum)*scale*1.5];}
function polygon(points,fill,stroke=null,lw=.5){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
function diamond(x,y,sx=1,sy=1,z=0){return [project(x,y,z),project(x+sx,y,z),project(x+sx,y+sy,z),project(x,y+sy,z)];}
function drawBuilding(b){
  const z=city.z[b.y*W+b.x],lift=b.height/8*.72;
  const base=diamond(b.x,b.y,b.w,b.h,z),top=diamond(b.x,b.y,b.w,b.h,z+lift);
  const isSchool=b.x===17&&b.y===15,isCenter=b.x===29&&b.y===25;
  polygon([base[1],base[2],top[2],top[1]],isSchool?'#b9c7ac':'#bac3ad','#a9b49e',.4);
  polygon([base[2],base[3],top[3],top[2]],isCenter?'#aebda1':'#c9cebb','#b5bfaa',.4);
  polygon(top,isSchool?'#f5e7c8':isCenter?'#c5d6b3':'#e9ead9','#b7c0a9',.55);
  // Roof inset, skylights and facade windows are geometric, not image assets.
  polygon(diamond(b.x+.35,b.y+.35,b.w-.7,b.h-.7,z+lift+.015),isSchool?'#e6d5b2':'#dce1cf','#c4cdb8',.35);
  if((b.x+b.y)%3===0){for(let t=0;t<3;t++)polygon(diamond(b.x+.7+t*.9,b.y+.7,.65,1,z+lift+.04),'#819d9b','#a9bfac',.3);}
  for(let t=0;t<5;t++){
    const p=project(b.x+.5+t*.85,b.y+b.h+.001,z+lift*.45);
    ctx.fillStyle='#92a58e';ctx.fillRect(p[0],p[1],Math.max(1,scale*.26),Math.max(1,scale*.25));
  }
}
function tree(x,y,variation=0){
  const z=city.z[clamp(Math.floor(y),0,H-1)*W+clamp(Math.floor(x),0,W-1)],p=project(x,y,z),r=scale*(.22+variation*.13);
  ctx.fillStyle='#8c997850';ctx.beginPath();ctx.ellipse(p[0]+2,p[1]+2,r*1.3,r*.5,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#8e9473';ctx.lineWidth=Math.max(.6,scale*.1);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0],p[1]-r*2);ctx.stroke();
  ctx.fillStyle=variation>.5?'#91aa73':'#a3b889';ctx.beginPath();ctx.ellipse(p[0],p[1]-r*1.8,r,r*1.3,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#bbcca075';ctx.beginPath();ctx.arc(p[0]-r*.25,p[1]-r*2.2,r*.5,0,Math.PI*2);ctx.fill();
}
function drawMap(now=0){
  if(!width)return;
  if(cameraMode==='3d'&&city3d){
    city3d.update({city,plan,depth:currentFrame(),layer,route:showRoute?route(city,currentFrame()).path:[],hover,selected,baseline:presentationBaseline});city3d.render(now);dirty=false;return;
  }
  displayDatum=Math.min(...city.z);
  const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const total=W+H;scale=Math.min(width/(total+8),height/(total*.48+18))*zoom;ox=width/2-(W-H)*scale/2;oy=(height-total*scale*.48)/2+scale*1.4;
  // Soft site shadow and the cut edge of the terrain block.
  const lower=diamond(0,0,W,H);ctx.save();ctx.shadowColor='#46572b20';ctx.shadowBlur=30;ctx.shadowOffsetY=15;polygon(lower,'#d1d9c0');ctx.restore();
  polygon([lower[1],lower[2],lower[3],[lower[3][0],lower[3][1]+scale*1.5],[lower[2][0],lower[2][1]+scale*1.5],[lower[1][0],lower[1][1]+scale*1.5]],'#c2cbae');
  polygon([lower[2],lower[3],[lower[3][0],lower[3][1]+scale*1.5],[lower[2][0],lower[2][1]+scale*1.5]],'#cdd4b8');
  const water=currentFrame(),placements=new Map((presentationBaseline?[]:plan).map(p=>[p.i,p.kind]));
  const minZ=Math.min(...city.z),maxZ=Math.max(...city.z);
  for(let diag=0;diag<total;diag++)for(let y=Math.max(0,diag-W+1);y<=Math.min(H-1,diag);y++){
    const x=diag-y,i=y*W+x,t=city.type[i],z=city.z[i],k=placements.get(i),noise=((x*17+y*31)%13)/13;
    let color=t===1?'#d1d8c6':t===2?'#d9dfca':t===3?'#b7ca9e':t===4?'#a5c8ba':noise>.6?'#dce3cc':'#d7dfc5';
    if(layer==='terrain'&&t!==4){const v=(z-minZ)/(maxZ-minZ||1);color=`hsl(${65+v*25} ${20+v*8}% ${80-v*20}%)`;}
    if(k)color=KIT[k].color;
    polygon(diamond(x,y,1,1,z),color,t===1?'#cbd3bf30':'#cad4bb30',.35);
    if(t===4&&y%3===0&&x%2===0){const p=project(x+.2,y+.5,z);ctx.strokeStyle='#d5e5d080';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+scale*.6,p[1]+scale*.2);ctx.stroke();}
    if(layer==='water'&&water[i]>.008&&t!==4&&t!==2){const v=clamp(water[i]/.3,0,1);polygon(diamond(x,y,1,1,z+.01),`rgba(${Math.round(110-v*65)},${Math.round(174-v*57)},${Math.round(176-v*33)},${.16+v*.53})`);}
    if(k){const p=project(x+.5,y+.5,z+.03);if(k==='pavement'){ctx.strokeStyle='#f6e6c580';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(p[0]-scale*.5,p[1]);ctx.lineTo(p[0]+scale*.5,p[1]);ctx.stroke();}else if(k==='basin'){ctx.fillStyle='#a8d1c3';ctx.beginPath();ctx.ellipse(p[0],p[1],scale*.6,scale*.28,0,0,Math.PI*2);ctx.fill();}else tree(x+.5,y+.5,.6);}
  }
  // Subtle centerlines follow the road grid.
  ctx.setLineDash([scale*.8,scale*1.2]);ctx.strokeStyle='#edf0e080';ctx.lineWidth=.55;
  for(let x=1.5;x<W-3;x+=12){const a=project(x,0),b=project(x,H);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
  for(let y=1.5;y<H;y+=10){const a=project(0,y),b=project(43,y);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}ctx.setLineDash([]);
  // Existing vegetation is seeded, so only interventions change between runs.
  for(let diag=0;diag<total;diag++)for(let y=Math.max(0,diag-W+1);y<=Math.min(H-1,diag);y++){
    const x=diag-y,i=y*W+x,t=city.type[i],v=((x*41+y*37+13)%101)/101;
    if(!placements.has(i)&&((t===3&&v>.5)||(t===0&&v>.935)))tree(x+.5,y+.5,v);
  }
  for(const b of [...city.buildings].sort((a,b)=>(a.x+a.y+a.w+a.h)-(b.x+b.y+b.w+b.h)))drawBuilding(b);
  if(showRoute&&results){const r=route(city,water);if(r.path.length){ctx.beginPath();r.path.forEach((i,j)=>{const p=project(i%W+.5,Math.floor(i/W)+.5,city.z[i]+.03);j?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.strokeStyle='#fafbf0';ctx.lineWidth=4;ctx.lineJoin='round';ctx.stroke();ctx.strokeStyle='#cf8258';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.lineDashOffset=-now/250;ctx.stroke();ctx.setLineDash([]);}}
  const points=[{x:13.5,y:12.5,text:'SCHOOL',mark:'S'},{x:37.5,y:32.5,text:'COMMUNITY',mark:'C'}];
  for(const p of points){const at=project(p.x,p.y,city.z[Math.floor(p.y)*W+Math.floor(p.x)]);ctx.fillStyle='#fffdf2';ctx.strokeStyle='#aebc9b';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(at[0],at[1]-7,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#5e7751';ctx.textAlign='center';ctx.font='bold 6px Arial';ctx.fillText(p.mark,at[0],at[1]-5);if(width>500){ctx.font='6px Arial';ctx.fillStyle='#52684a';ctx.fillText(p.text,at[0],at[1]+10);}}
  const target=hover>=0?hover:selected;
  if(target>=0){const x=target%W,y=Math.floor(target/W),compatible=tool==='inspect'||tool==='erase'||KIT[tool]?.allowed.includes(city.type[target]);polygon(diamond(x,y,1,1,city.z[target]+.04),compatible?'#f8f9ed55':'#bd725d55',compatible?'#faffec':'#b56048',1.5);}
  // Scale marker grounds the abstract neighborhood in physical units.
  ctx.fillStyle='#81916f';ctx.font='7px Arial';ctx.textAlign='left';ctx.fillText('0',18,height-17);ctx.fillText('80 m',58,height-17);ctx.fillRect(19,height-28,50,1);ctx.fillRect(19,height-30,1,5);ctx.fillRect(68,height-30,1,5);
  if(playing&&!reducedMotion&&layer==='water'&&rainRate(minute*60,config)>0){ctx.strokeStyle='#86ada133';ctx.lineWidth=.7;for(let n=0;n<60;n++){const x=(n*157.3+now*.018)%width,y=(n*83.7+now*.2)%height;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+9);ctx.stroke();}}
  dirty=false;
}
function drawChart(){
  if(!results)return;const rect=chart.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;chart.width=w*dpr;chart.height=h*dpr;cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,w,h);
  const pad={l:32,r:8,t:9,b:19},b=results.baseline.series,d=results.design.series,max=Math.max(1,...b.map(p=>p.surface),...d.map(p=>p.surface))*1.12;
  const X=t=>pad.l+t/config.duration*(w-pad.l-pad.r),Y=v=>h-pad.b-v/max*(h-pad.t-pad.b);
  cx.font='7px Arial';cx.textAlign='right';cx.fillStyle='#a1aa96';cx.strokeStyle='#e3e6db';cx.lineWidth=.5;
  for(let t=0;t<4;t++){const v=max*t/3,y=Y(v);cx.fillText(v>=1000?fmt(v/1000,1)+'k':fmt(v),pad.l-7,y+2);cx.beginPath();cx.moveTo(pad.l,y);cx.lineTo(w-pad.r,y);cx.stroke();}
  const bw=(w-pad.l-pad.r)/config.duration;
  for(const p of b){const rh=rainRate(p.minute*60,config)*3600000/(config.intensity||1)*(h-pad.t-pad.b)*.32;cx.fillStyle='#d7e2df99';cx.fillRect(X(p.minute),pad.t,bw*.65,rh);}
  cx.beginPath();cx.moveTo(X(0),Y(0));for(const p of d)cx.lineTo(X(p.minute),Y(p.surface));cx.lineTo(X(config.duration),Y(0));cx.closePath();const grad=cx.createLinearGradient(0,pad.t,0,h);grad.addColorStop(0,'#65977c29');grad.addColorStop(1,'#65977c03');cx.fillStyle=grad;cx.fill();
  for(const [s,col,dash] of [[b,'#a8ac98',[3,4]],[d,'#397c62',[]]]){cx.beginPath();s.forEach((p,i)=>i?cx.lineTo(X(p.minute),Y(p.surface)):cx.moveTo(X(p.minute),Y(p.surface)));cx.strokeStyle=col;cx.lineWidth=1.7;cx.setLineDash(dash);cx.stroke();}cx.setLineDash([]);
  cx.textAlign='center';cx.fillStyle='#929e87';for(let t=0;t<=config.duration;t+=config.duration/4)cx.fillText(fmt(t),X(t),h-3);
  cx.strokeStyle='#b7c5ab';cx.lineWidth=.6;cx.beginPath();cx.moveTo(X(minute),pad.t);cx.lineTo(X(minute),h-pad.b);cx.stroke();const p=d[Math.min(Math.round(minute),d.length-1)];cx.fillStyle='#297963';cx.beginPath();cx.arc(X(minute),Y(p.surface),3,0,Math.PI*2);cx.fill();
}
function resize(){const r=$('stage').getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(city3d)city3d.resize(width,height);dirty=true;drawChart();}
function hit(event){const r=canvas.getBoundingClientRect(),sx=event.clientX-r.left,sy=event.clientY-r.top;let localY=(sy-oy)/(.48*scale),localX=(sx-ox)/scale;let x=Math.floor((localY+localX)/2),y=Math.floor((localY-localX)/2);for(let k=0;k<2;k++){const i=clamp(y,0,H-1)*W+clamp(x,0,W-1);localY=(sy-oy+city.z[i]*scale*1.5)/(.48*scale);x=Math.floor((localY+localX)/2);y=Math.floor((localY-localX)/2);}return x<0||x>=W||y<0||y>=H?-1:y*W+x;}
function switchView(value){if(recording)return;$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===value));$('designView').hidden=value!=='design';$('compareView').hidden=value!=='compare';$('methodView').hidden=value!=='method';if(value==='design'){resize();update();}if(value==='compare')renderCompare();}
function card(title,result,featured=false){const m=result.metrics;return `<article class="compare-card ${featured?'featured':''}"><div class="eyebrow">${featured?'THE NEIGHBORHOOD YOU DESIGNED':'THE REFERENCE SCENARIO'}</div><h3>${title}</h3><div class="big">${fmt(m.peakVolume)} <small>m³ peak water</small></div><p>${featured?`${plan.length} interventions · ${money(costOf(plan))} allocated`:'Existing surfaces · no new investment'}</p><dl><div><dt>Peak area above 10 cm</dt><dd>${fmt(m.peakArea)} m²</dd></div><div><dt>Infiltrated + retained</dt><dd>${fmt(m.infiltrated+m.stored)} m³</dd></div><div><dt>Outflow</dt><dd>${fmt(m.drained)} m³</dd></div><div><dt>Water balance residual</dt><dd>${Math.abs(m.balance).toExponential(1)} m³</dd></div></dl></article>`;}
function renderCompare(){if(!results)return;const b=results.baseline,d=results.design,gain=b.metrics.peakVolume-d.metrics.peakVolume;
  $('compareContent').innerHTML=`<div class="compare-grid">${card('Before the intervention',b)}${card('A little more resilient',d,true)}<article class="compare-card"><div class="eyebrow">WHAT YOUR INVESTMENT CHANGES</div><h3>The difference</h3><div class="big">${fmt(b.metrics.peakVolume?gain/b.metrics.peakVolume*100:0,1)}<small>% less peak water</small></div><p>${fmt(gain)} m³ reduction at the surface peak. ${fmt(costOf(plan)/(gain||1))} illustrative dollars per m³ of peak reduction.</p><dl><div><dt>Storm intensity</dt><dd>${config.intensity} mm/h</dd></div><div><dt>Duration</dt><dd>${config.duration} min</dd></div><div><dt>Total rainfall volume</dt><dd>${fmt(d.metrics.rain)} m³</dd></div><div><dt>Budget remaining</dt><dd>${money(budget-costOf(plan))}</dd></div></dl></article></div><div class="compare-chart"><h3>There is more than one better plan.</h3><p>${frontier.length?'Every point below is an accepted step from the latest optimizer run. Click one to restore that budget / performance tradeoff.':'Run “Find a better plan” in the design lab to explore an investment / performance frontier. Each accepted improvement is a fully simulated plan.'}</p><div class="frontier-list">${frontier.map((p,i)=>`<button class="frontier-item" data-frontier="${i}"><span>${money(p.cost)}</span><strong>${fmt(p.volume)} m³</strong><span>${p.plan.length} interventions</span></button>`).join('')}</div></div>`;
  $$('[data-frontier]').forEach(b=>b.onclick=()=>{if(busy)return;history.push([...plan]);plan=frontier[+b.dataset.frontier].plan.map(p=>({...p}));switchView('design');run();toast('Restored this point on the investment frontier.');});
}
function validSnapshot(s){
  if(!s||s.version!==1||!Number.isInteger(s.seed)||s.seed<0||s.seed>1000000||!Number.isFinite(s.budget)||s.budget<0||s.budget>300000)throw Error('This is not a supported PLUVIA plan.');
  const c=s.config;if(!c||!Number.isFinite(c.intensity)||c.intensity<0||c.intensity>180||![30,60,120].includes(c.duration)||!['pulse','steady'].includes(c.shape)||![.45,1,1.5].includes(c.soilFactor??1))throw Error('This plan has invalid storm settings.');
  if(s.elevation&&(!Array.isArray(s.elevation)||s.elevation.length!==N||s.elevation.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)))throw Error('The elevation grid is invalid.');
  return {...s,config:{intensity:c.intensity,duration:c.duration,shape:c.shape,soilFactor:c.soilFactor??1},plan:validatePlan(s.plan,createCity(s.seed),s.budget)};
}
function restore(s){s=validSnapshot(s);seed=s.seed;city=createCity(seed);plan=s.plan;budget=s.budget;config={...s.config,soilFactor:s.config.soilFactor??1};scenario=Object.hasOwn(SCENARIOS,s.scenario)?s.scenario:'custom';elevation=s.elevation??null;if(elevation)city.z.set(elevation);$('scenario').value=scenario;$('rainfall').value=config.intensity;$('duration').value=config.duration;$('soil').value=config.soilFactor;$('budget').value=budget;history=[];updateBudget();}
function download(name,content,mime='application/json'){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportPlan(){download('pluvia-riverside-plan.json',JSON.stringify(snapshot(),null,2));toast('Plan exported. Import it to reproduce the same simulation.');}
function ledger(){if(!results)return;const m=results.design.metrics;modal(`<div class="eyebrow">CONSERVATION, MADE VISIBLE</div><h2>Every drop has a destination.</h2><p>At the end of the storm, the rainfall input must equal all water remaining in the model plus all tracked sinks.</p><div class="ledger"><div><span>Rainfall input</span><strong>${fmt(m.rain,2)} m³</strong></div><div><span>Surface water remaining</span><strong>${fmt(m.surface,2)} m³</strong></div><div><span>Water in intervention storage</span><strong>${fmt(m.stored,2)} m³</strong></div><div><span>Infiltrated into soil</span><strong>${fmt(m.infiltrated,2)} m³</strong></div><div><span>River + sewer outflow</span><strong>${fmt(m.drained,2)} m³</strong></div><div><span>Unaccounted-for residual</span><strong>${m.balance.toExponential(3)} m³</strong></div></div><p>Mass conservation checks bookkeeping. It does not establish real-world predictive accuracy. Read “The science” for the model assumptions.</p>`);}
function report(){if(!results)return;const b=results.baseline.metrics,d=results.design.metrics,percent=b.peakVolume?100*(1-d.peakVolume/b.peakVolume):0;
  modal(`<div class="eyebrow">RIVERSIDE COMMONS · SCENARIO REPORT</div><h2>Small changes. Measurable possibilities.</h2><div class="report-summary"><strong>${fmt(percent,1)}% less peak surface water.</strong><small>${plan.length} interventions · ${money(costOf(plan))} illustrative investment</small></div><p>Under the same ${config.intensity} mm/h, ${config.duration}-minute storm, your design changes peak water from ${fmt(b.peakVolume)} to ${fmt(d.peakVolume)} m³ and peak flooded area from ${fmt(b.peakArea)} to ${fmt(d.peakArea)} m².</p><p>This is a synthetic teaching scenario. Parameters and costs are illustrative, and the model is not calibrated to a real site.</p><button class="button primary" id="csvBtn">Download full time series ↓</button> <button class="button outline" id="reportPlanBtn">Export reproducible plan ↓</button><br><button class="button outline" id="coverBtn">Export visual report ↓</button> <button class="button outline" id="videoBtn">Record narrated demo ↓</button><p id="videoProgress" style="margin-top:15px"></p>`);
  $('csvBtn').onclick=()=>{const rows=['minute,rainfall_input_m3,baseline_surface_m3,design_surface_m3,design_flooded_area_m2,infiltrated_m3,stored_m3,outflow_m3'];results.design.series.forEach((p,i)=>rows.push([p.minute,p.rain,results.baseline.series[i].surface,p.surface,p.area,p.infiltrated,p.storage,p.drained].join(',')));download('pluvia-storm-timeseries.csv',rows.join('\n'),'text/csv');};$('reportPlanBtn').onclick=exportPlan;
  const state=()=>({map:cameraMode==='3d'&&city3d?$('city3dCanvas'):canvas,graph:chart,results,plan,config,cost:costOf(plan)});
  $('coverBtn').onclick=()=>{drawMap();drawChart();exportCover(state());};
  $('videoBtn').onclick=async()=>{if(busy)return;const saved={minute,showRoute,zoom,autoOrbit};recording=true;setBusy(true,'Recording your walkthrough…');playing=false;zoom=1;if(city3d&&cameraMode==='3d'){city3d.reset();city3d.setAutoRotate(true);}document.querySelector('.modal-close').disabled=true;$('videoBtn').disabled=true;$('videoProgress').textContent='Preparing the synthetic narration…';
    try{const result=await recordDemo(state(),s=>{minute=s.minute;presentationBaseline=s.baseline;showRoute=s.route;drawMap(performance.now());drawChart();},p=>{if($('videoProgress'))$('videoProgress').textContent=`Recording ${Math.round(p.elapsed)} / ${Math.round(p.duration)} seconds. Keep this tab visible until the download starts.`;});toast(`Demo exported: ${Math.round(result.duration)} seconds, ${fmt(result.bytes/1000000,1)} MB.`);}
    catch(e){toast(e.message);}finally{recording=false;setBusy(false);document.querySelector('.modal-close').disabled=false;minute=saved.minute;showRoute=saved.showRoute;zoom=saved.zoom;autoOrbit=saved.autoOrbit;city3d?.setAutoRotate(autoOrbit);presentationBaseline=false;update();if($('videoBtn'))$('videoBtn').disabled=false;if($('videoProgress'))$('videoProgress').textContent='Recording finished. The demo is in your downloads.';}
  };
}
async function stressTest(){
  if(busy||!results)return;setBusy(true,'Putting the design to the test…','Three distinct storms. One unchanged plan.');
  // Stress tests use separate workers to preserve UI responsiveness.
  try{const tests=[];for(const [key,s] of Object.entries(SCENARIOS)){
    $('busyDetail').textContent=`Simulating ${s.name.toLowerCase()}…`;
    const r=await new Promise((resolve,reject)=>{const w=new Worker('./worker.js',{type:'module'});w.onmessage=({data})=>{w.terminate();data.type==='error'?reject(Error(data.message)):resolve(data);};w.onerror=()=>{w.terminate();reject(Error('Storm test could not run.'));};w.postMessage({...payload('simulate'),config:{...s,soilFactor:config.soilFactor}});});
    tests.push({name:s.name,intensity:s.intensity,duration:s.duration,b:r.baseline.metrics,d:r.design.metrics});
  }
  modal(`<div class="eyebrow">RESILIENCE IS MORE THAN ONE STORM</div><h2>How does the plan hold up?</h2><p>Your exact ${plan.length}-intervention plan, tested independently against three rainfall patterns. Reductions compare peak surface volume.</p><div class="stress-row"><span>Storm</span><span>Baseline</span><span>Design</span><span>Reduction</span></div>${tests.map(t=>`<div class="stress-row"><span>${t.name}<br><small>${t.intensity} mm/h · ${t.duration}m</small></span><span>${fmt(t.b.peakVolume)} m³</span><span>${fmt(t.d.peakVolume)} m³</span><strong>${fmt(t.b.peakVolume?100*(1-t.d.peakVolume/t.b.peakVolume):0,1)}%</strong></div>`).join('')}<p style="margin-top:20px">These tests illustrate sensitivity to rainfall. They do not quantify real-world flood probability.</p><button class="button outline" id="stressExport">Download stress-test results ↓</button>`);$('stressExport').onclick=()=>download('pluvia-stress-test.json',JSON.stringify({plan:snapshot(),tests},null,2));
  }catch(e){toast(e.message);}finally{setBusy(false);}
}
function tour(){modal(`<div class="eyebrow">WELCOME TO YOUR NEIGHBORHOOD</div><h2>A city can be a sponge.</h2><p>Explore what happens when we make a little more room for water — before the next storm arrives.</p><ol><li><strong>Set a storm.</strong> Adjust rainfall, duration and soil saturation.</li><li><strong>Shape the city.</strong> Place gardens or basins on open ground, and permeable paving on streets. Try the optimizer to discover a measured plan.</li><li><strong>Watch what changes.</strong> Play the storm, inspect a tile, follow the school route, and compare against the same city's baseline.</li><li><strong>Make it reproducible.</strong> Export a plan, share its link, or download the water-budget time series.</li></ol><p>Keyboard: 1 explore · 2 garden · 3 paving · 4 basin · 5 erase. Arrow keys move the map cursor. Enter places. Space plays. Escape exits placement.</p><button class="button primary" id="startTour">Let's make room →</button>`);$('startTour').onclick=()=>$('modal').close();}
// Wire controls once. Simulation state is isolated from rendering state.
$$('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$$('[data-tool]').forEach(b=>b.onclick=()=>chooseTool(b.dataset.tool));$$('[data-layer]').forEach(b=>b.onclick=()=>{layer=b.dataset.layer;$$('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===layer));$('legend').hidden=layer!=='water';dirty=true;});
$('scenario').onchange=e=>{scenario=e.target.value;if(SCENARIOS[scenario]){config={...config,...SCENARIOS[scenario]};$('rainfall').value=config.intensity;$('duration').value=config.duration;}$('rainValue').textContent=config.intensity;frontier=[];run();};
$('rainfall').oninput=e=>{$('rainValue').textContent=e.target.value;};$('rainfall').onchange=e=>{config.intensity=+e.target.value;scenario='custom';$('scenario').value=scenario;frontier=[];run();};
$('duration').onchange=e=>{config.duration=+e.target.value;scenario='custom';$('scenario').value=scenario;frontier=[];run();};$('soil').onchange=e=>{config.soilFactor=+e.target.value;frontier=[];run();};
$('budget').oninput=e=>{const value=+e.target.value;if(value<costOf(plan)){e.target.value=budget;return;}budget=value;updateBudget();storage.set(snapshot());};
$('optimizeBtn').onclick=()=>{if(busy)return;setBusy(true,'A better plan starts with a question.','Testing where each dollar makes the most difference.');const message=payload('optimize');mainJob=message.jobId;worker.postMessage(message);};
$('runBtn').onclick=run;$('stressBtn').onclick=stressTest;$('undoBtn').onclick=()=>{if(!history.length)return toast('Nothing to undo yet.');plan=history.pop();frontier=[];run();};$('eraseBtn').onclick=()=>chooseTool('erase');
$('exampleBtn').onclick=async()=>{if(busy)return;try{restore(await (await fetch('./example-plan.json')).json());frontier=[];run();toast('Loaded the Riverside retrofit: a measured, reproducible example plan.');}catch(e){toast(e.message);}};
$('clearBtn').onclick=()=>{if(!plan.length)return;history.push([...plan]);plan=[];frontier=[];run();};
$('newMapBtn').onclick=()=>{history=[];plan=[];frontier=[];elevation=null;seed=(seed+31)%1000000;city=createCity(seed);$('elevationStatus').textContent='48 columns × 40 rows, meters. Land cover stays fixed.';run();toast('New terrain variation created. The reference plan has been reset.');};
$('timeline').oninput=e=>{minute=+e.target.value;playing=false;$('playBtn').textContent='▶';update();if(selected>=0)showInspector(selected);};
$('playBtn').onclick=()=>{if(busy)return;playing=!playing;if(playing&&minute>=config.duration)minute=0;$('playBtn').textContent=playing?'Ⅱ':'▶';$('playBtn').setAttribute('aria-label',playing?'Pause storm simulation':'Play storm simulation');lastTick=0;dirty=true;};
$('speedBtn').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speedBtn').textContent=speed+'×';};
function toggleRoute(){showRoute=!showRoute;$('routeBtn').classList.toggle('active',showRoute);$('showRouteBtn').textContent=showRoute?'Hide ↗':'Show ↗';dirty=true;}
$('routeBtn').onclick=toggleRoute;$('showRouteBtn').onclick=toggleRoute;
$('zoomIn').onclick=()=>{if(cameraMode==='3d'&&city3d){city3d.zoomBy(1.15);return;}zoom=clamp(zoom*1.15,.6,2);dirty=true;};$('zoomOut').onclick=()=>{if(cameraMode==='3d'&&city3d){city3d.zoomBy(1/1.15);return;}zoom=clamp(zoom/1.15,.6,2);dirty=true;};$('resetView').onclick=()=>{city3d?.reset();zoom=1;selected=-1;hover=-1;$('inspector').hidden=true;dirty=true;};
canvas.addEventListener('pointermove',e=>{hover=hit(e);dirty=true;});canvas.addEventListener('pointerleave',()=>{hover=-1;dirty=true;});canvas.addEventListener('click',e=>editAt(hit(e)));
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*(e.deltaY>0?.95:1.05),.6,2);dirty=true;},{passive:false});
for(const keyboardCanvas of [canvas,$('city3dCanvas')])keyboardCanvas.addEventListener('keydown',e=>{let i=selected>=0?selected:12*W+13;if(e.key==='ArrowRight')i=clamp(i+1,0,N-1);else if(e.key==='ArrowLeft')i=clamp(i-1,0,N-1);else if(e.key==='ArrowDown')i=clamp(i+W,0,N-1);else if(e.key==='ArrowUp')i=clamp(i-W,0,N-1);else if(e.key==='Enter'){e.preventDefault();editAt(i);return;}else return;e.preventDefault();selected=i;hover=-1;showInspector(i);dirty=true;});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||$('modal').open)return;const keys=['inspect','garden','pavement','basin','erase'];if(+e.key>=1&&+e.key<=5)chooseTool(keys[+e.key-1]);if(e.key==='Escape'){chooseTool('inspect');selected=-1;$('inspector').hidden=true;dirty=true;}if(e.code==='Space'){e.preventDefault();$('playBtn').click();}});
$('balanceBtn').onclick=ledger;$('reportBtn').onclick=report;$('tourBtn').onclick=tour;$('footerMethod').onclick=()=>switchView('method');$('saveBtn').onclick=exportPlan;
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{try{if(busy||!e.target.files[0])return;const text=await e.target.files[0].text();if(text.length>200000)throw Error('Please choose a PLUVIA plan smaller than 200 KB.');restore(JSON.parse(text));frontier=[];run();toast('Plan imported. Reproducing the paired simulations.');}catch(error){toast(error.message);}e.target.value='';};
$('elevationBtn').onclick=()=>$('elevationFile').click();$('elevationFile').onchange=async e=>{try{if(busy||!e.target.files[0])return;const text=await e.target.files[0].text();if(text.length>100000)throw Error('The elevation file is too large.');const rows=text.trim().split(/\r?\n/);if(rows.length!==H)throw Error('Expected 40 rows of elevation values.');const values=[];for(const row of rows){const cells=row.split(',');if(cells.length!==W)throw Error('Each elevation row must contain exactly 48 columns.');for(const cell of cells){if(!cell.trim()||!Number.isFinite(+cell)||Math.abs(+cell)>10000)throw Error('Elevations must be finite numbers between −10,000 and 10,000 m.');values.push(+cell);}}elevation=values;city.z.set(values);frontier=[];$('elevationStatus').textContent='Custom elevation loaded · 1,920 cells';switchView('design');run();toast('Custom elevations loaded. The synthetic land cover is preserved.');}catch(error){toast(error.message);}e.target.value='';};
$('shareBtn').onclick=async()=>{const share={...snapshot(),elevation:null};if(elevation){toast('Custom elevation plans are shared by file. Export the plan to include your elevation grid.');exportPlan();return;}const encoded=btoa(JSON.stringify(share)),url=location.origin+location.pathname+'#plan='+encodeURIComponent(encoded);try{await navigator.clipboard.writeText(url);toast('Scenario link copied. Anyone with the app can reproduce this plan.');}catch{modal(`<div class="eyebrow">REPRODUCIBLE BY DESIGN</div><h2>Pass the possibilities on.</h2><p>Copy this link to share the terrain, storm settings and intervention plan.</p><input class="copy-field" id="shareField" readonly value="${esc(url)}">`);$('shareField').select();}};
$('modal').addEventListener('cancel',e=>{if(recording)e.preventDefault();});document.querySelector('.modal-close').onclick=()=>{if(!recording)$('modal').close();};$('modal').addEventListener('click',e=>{if(!recording&&e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
function animate(now){
  if(playing&&!busy&&results){if(!lastTick)lastTick=now;if(now-lastTick>250/speed){minute=Math.min(config.duration,minute+1);lastTick=now;update();if(minute>=config.duration){playing=false;$('playBtn').textContent='▶';}}}
  if((dirty||playing||(cameraMode==='3d'&&autoOrbit)||(showRoute&&!reducedMotion))&&now-lastDraw>32&&!$('designView').hidden){drawMap(now);lastDraw=now;}
  requestAnimationFrame(animate);
}
// Restore only validated, bounded data. Shared URL state takes precedence.
try{if(location.hash.startsWith('#plan=')){const encoded=decodeURIComponent(location.hash.slice(6));if(encoded.length>100000)throw Error('The shared scenario is too large.');restore(JSON.parse(atob(encoded)));toast('Shared scenario loaded. Running a reproducible comparison.');}else{const saved=storage.get();if(saved)restore(saved);}}catch(e){toast('Could not restore the plan: '+e.message);}
makeWorker();new ResizeObserver(resize).observe($('stage'));resize();updateBudget();run();requestAnimationFrame(animate);

async function init3D(){
  try{const {City3D}=await import('./city3d.js');city3d=new City3D($('city3dCanvas'),i=>editAt(i),i=>{hover=i;dirty=true;},()=>{dirty=true;if(selected>=0&&cameraMode==='3d')showInspector(selected);});city3d.setCity(city);setCameraMode('3d');}
  catch(e){console.warn('3D renderer unavailable',e);$('sceneBtn').textContent='2D';$('sceneBtn').classList.remove('active');$('orbitBtn').disabled=true;}
}
function setCameraMode(mode){if(recording)return;cameraMode=mode;$('city3dCanvas').hidden=mode!=='3d';canvas.hidden=mode==='3d';$('sceneBtn').textContent=mode==='3d'?'3D':'2D';$('sceneBtn').classList.toggle('active',mode==='3d');$('orbitBtn').hidden=mode!=='3d';chooseTool(tool);resize();dirty=true;}
$('sceneBtn').onclick=()=>{if(city3d)setCameraMode(cameraMode==='3d'?'2d':'3d');};
$('orbitBtn').onclick=()=>{autoOrbit=!autoOrbit;city3d?.setAutoRotate(autoOrbit);$('orbitBtn').classList.toggle('active',autoOrbit);dirty=true;};
init3D();
