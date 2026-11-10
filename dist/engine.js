// PLUVIA's educational finite-volume surface-water model. SI units throughout.
export const W = 48, H = 40, CELL = 8, AREA = CELL * CELL, N = W * H;
export const TYPES = {LAND:0, ROAD:1, BUILDING:2, PARK:3, RIVER:4};
export const KIT = {
  garden:{name:'Rain garden', cost:6000, color:'#8abb64', rate:85, capacity:0.18, allowed:[0,3]},
  pavement:{name:'Permeable paving', cost:4500, color:'#c7a16c', rate:55, capacity:0.065, allowed:[1]},
  basin:{name:'Retention basin', cost:14000, color:'#4e9fa5', rate:18, capacity:0.6, allowed:[0,3]}
};
export const SCENARIOS = {
  cloudburst:{name:'Summer cloudburst',intensity:90,duration:60,shape:'pulse'},
  monsoon:{name:'Long monsoon',intensity:45,duration:120,shape:'steady'},
  extreme:{name:'Extreme downpour',intensity:135,duration:60,shape:'pulse'}
};
const hash = (x,y,s=1) => { let n=Math.imul(x+91,374761393)^Math.imul(y+37,668265263)^Math.imul(s,1274126177); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967295; };
export function createCity(seed=7, relief=1){
  const type=new Uint8Array(N),z=new Float64Array(N),roofOutlet=new Int32Array(N),drains=[];
  const buildings=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x, river=x>=44+Math.sin(y/7)*1.3;
    const road=x%12<3||y%10<3;
    const park=(x>=27&&x<34&&y>=14&&y<19)||(x>=5&&x<10&&y>=24&&y<29);
    const building=!road&&!park&&x%12>=5&&x%12<=9&&y%10>=5&&y%10<=7&&x<42;
    type[i]=river?4:building?2:road?1:park?3:0;
    // A sloping catchment with two low points; seed only adds small, repeatable relief.
    z[i]=relief*(0.017*(W-x)+0.008*(H-y)-0.48*Math.exp(-((x-24)**2+(y-22)**2)/100)-0.25*Math.exp(-((x-12)**2+(y-12)**2)/50)+0.025*Math.sin(x/3)*Math.cos(y/4)+hash(x,y,seed)*0.012);
    if(road)z[i]-=0.035;
    if(river)z[i]=-0.3;
    roofOutlet[i]=i;
    if(road && x%12===1 && y%10===1 && x>2&&y>2)drains.push(i);
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;if(type[i]!==2)continue;
    let best=Infinity;
    for(let dy=-5;dy<=5;dy++)for(let dx=-6;dx<=6;dx++){
      const xx=x+dx, yy=y+dy,j=yy*W+xx;if(xx<0||xx>=W||yy<0||yy>=H||type[j]===2)continue;
      const score=dx*dx+dy*dy+z[j]*0.01;if(score<best){best=score;roofOutlet[i]=j;}
    }
    if(x%12===5&&y%10===5)buildings.push({x,y,w:5,h:3,height:12+hash(x,y,seed)*25});
  }
  return {type,z,roofOutlet,drains,buildings,seed,relief};
}
export function rainRate(t,config){
  const {intensity=90,duration=60,shape='pulse'}=config;
  if(t<0||t>=duration*60)return 0;
  const u=t/(duration*60);
  // Both hyetographs have mean 1 over the storm.
  return intensity/1000/3600*(shape==='steady'?1:0.35+1.3*Math.sin(Math.PI*u)**2);
}
export function validatePlan(plan,city,budget=Infinity){
  if(!Array.isArray(plan)||plan.length>N)throw Error('The plan must contain a valid list of interventions.');
  const seen=new Set();let cost=0;
  const clean=plan.map(p=>{
    if(!p||!Number.isInteger(p.i)||p.i<0||p.i>=N||!KIT[p.kind]||seen.has(p.i)||!KIT[p.kind].allowed.includes(city.type[p.i]))throw Error('This plan contains an invalid or incompatible placement.');
    seen.add(p.i);cost+=KIT[p.kind].cost;return {i:p.i,kind:p.kind};
  });
  if(cost>budget)throw Error('The plan exceeds the selected budget.');
  return clean;
}
export function costOf(plan){return plan.reduce((s,p)=>s+KIT[p.kind].cost,0);}
export function simulate(city,plan=[],config={},record=true){
  validatePlan(plan,city);
  const duration=config.duration??60,dt=10,steps=Math.round(duration*60/dt),depth=new Float64Array(N),stored=new Float64Array(N),maxDepth=new Float64Array(N),delta=new Float64Array(N),outgoing=new Float64Array(N),ratio=new Float64Array(N),infra=new Map(plan.map(p=>[p.i,KIT[p.kind]]));
  const fluxes=[],series=[],frames=[],peaks=new Float64Array(N);
  let rain=0,infiltrated=0,drained=0,peakArea=0,peakVolume=0,peakAt=0;
  const sampleEvery=Math.max(1,Math.round(60/dt));
  const capture=t=>{
    let surface=0,storage=0,area=0,max=0;
    for(let i=0;i<N;i++){surface+=depth[i]*AREA;storage+=stored[i]*AREA;if(depth[i]>.1&&city.type[i]!==4)area+=AREA;max=Math.max(max,depth[i]);}
    if(area>peakArea)peakArea=area;
    if(surface>peakVolume){peakVolume=surface;peakAt=t/60;}
    series.push({minute:t/60,rain,rate:rainRate(t,config)*3600000,surface,storage,infiltrated,drained,area,max});
    if(record)frames.push(new Float32Array(depth));
  };
  capture(0);
  for(let step=0;step<steps;step++){
    const r=rainRate((step+.5)*dt,config)*dt;
    rain+=r*N*AREA;
    for(let i=0;i<N;i++)depth[city.roofOutlet[i]]+=r;
    // Infiltration removes surface water. Engineered substrate additionally stores
    // runoff in a finite reservoir; all sinks are tracked in the mass ledger.
    for(let i=0;i<N;i++){
      const t=city.type[i];if(t===2)continue;
      if(t===4){drained+=depth[i]*AREA;depth[i]=0;continue;}
      const k=infra.get(i),base=t===1?0.7:t===3?24:8;
      const inf=Math.min(depth[i],(k?k.rate:base)*(config.soilFactor??1)/1000/3600*dt);
      depth[i]-=inf;infiltrated+=inf*AREA;
      if(k){const take=Math.min(depth[i],Math.max(0,k.capacity-stored[i]),0.002*dt);depth[i]-=take;stored[i]+=take;}
    }
    for(const i of city.drains){const v=Math.min(depth[i],(config.drainFactor??1)*0.008*dt/AREA);depth[i]-=v;drained+=v*AREA;}
    // Pairwise conservative face flux. Donor limiting guarantees nonnegative
    // depths even when several neighboring faces discharge simultaneously.
    fluxes.length=0;outgoing.fill(0);delta.fill(0);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;if(city.type[i]===2)continue;
      for(const j of [x<W-1?i+1:-1,y<H-1?i+W:-1]){
        if(j<0||city.type[j]===2)continue;
        const dh=(city.z[i]+depth[i])-(city.z[j]+depth[j]);
        const a=dh>0?i:j,b=dh>0?j:i,h=depth[a];if(h<1e-10||Math.abs(dh)<1e-10)continue;
        const n=city.type[a]===1?0.025:0.06;
        // The head-difference cap keeps the explicit diffusion stencil monotone
        // (4 faces × 0.16 < 1), avoiding alternating wet/dry cells at large dt.
        const q=Math.min(h*0.2,Math.abs(dh)*0.16,dt/CELL/n*h**(5/3)*Math.sqrt(Math.abs(dh)/CELL));
        fluxes.push(a,b,q);outgoing[a]+=q;
      }
    }
    for(let i=0;i<N;i++)ratio[i]=outgoing[i]>depth[i]?depth[i]/outgoing[i]:1;
    for(let k=0;k<fluxes.length;k+=3){const a=fluxes[k],b=fluxes[k+1],v=fluxes[k+2]*ratio[a];delta[a]-=v;delta[b]+=v;}
    for(let i=0;i<N;i++){depth[i]=Math.max(0,depth[i]+delta[i]);maxDepth[i]=Math.max(maxDepth[i],depth[i]);peaks[i]+=depth[i]*dt;}
    if((step+1)%sampleEvery===0||step===steps-1)capture((step+1)*dt);
  }
  const last=series.at(-1),balance=rain-last.surface-last.storage-infiltrated-drained;
  return {series,frames,maxDepth,exposure:peaks,depth:new Float32Array(depth),metrics:{rain,infiltrated,drained,stored:last.storage,surface:last.surface,peakArea,peakVolume,peakAt,maxDepth:Math.max(...maxDepth),balance,cost:costOf(plan)}};
}
export function route(city,depth,start=12*W+13,end=32*W+37,threshold=.15){
  if(depth[start]>threshold||depth[end]>threshold||[2,4].includes(city.type[start])||[2,4].includes(city.type[end]))return {path:[],length:0,cost:Infinity};
  const dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),closed=new Uint8Array(N);dist[start]=0;
  const open=[start],heuristic=i=>(Math.abs(i%W-end%W)+Math.abs(Math.floor(i/W)-Math.floor(end/W)))*CELL;
  while(open.length){let k=0;for(let t=1;t<open.length;t++)if(dist[open[t]]+heuristic(open[t])<dist[open[k]]+heuristic(open[k]))k=t;
    const i=open.splice(k,1)[0];if(closed[i])continue;closed[i]=1;if(i===end)break;
    const x=i%W,y=Math.floor(i/W);
    for(const j of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1]){
      if(j<0||closed[j]||city.type[j]===2||city.type[j]===4||depth[j]>threshold)continue;
      const d=dist[i]+CELL*(1+depth[j]*8+(city.type[j]===1?0:.3));
      if(d<dist[j]){dist[j]=d;prev[j]=i;open.push(j);}
    }
  }
  if(!Number.isFinite(dist[end]))return {path:[],length:0,cost:Infinity};
  const path=[];for(let i=end;i!==-1;i=prev[i])path.push(i);path.reverse();
  return {path,length:(path.length-1)*CELL,cost:dist[end]};
}
export function objective(result){return result.metrics.peakVolume+result.metrics.peakArea*.035;}
// Greedy, simulation-in-the-loop search. Each selected intervention is accepted
// only if its rerun improves the objective. It is a heuristic, not a global optimum.
export async function optimize(city,config,budget,initial=[],progress=()=>{}){
  let plan=validatePlan(initial,city,budget),base=simulate(city,plan,config,false),evaluated=0;
  const frontier=[{cost:costOf(plan),volume:base.metrics.peakVolume,area:base.metrics.peakArea,plan:[...plan]}];
  for(let round=0;round<48;round++){
    const used=new Set(plan.map(p=>p.i)),remaining=budget-costOf(plan),candidates=[];
    for(let i=0;i<N;i++){
      if(used.has(i)||city.type[i]===2||city.type[i]===4)continue;
      const kind=city.type[i]===1?'pavement':(round%3===0?'basin':'garden');
      if(KIT[kind].cost>remaining)continue;
      candidates.push({i,kind,rank:base.exposure[i]+base.maxDepth[i]*100});
    }
    candidates.sort((a,b)=>b.rank-a.rank);
    // Spatial diversification prevents top candidates collapsing onto one spot.
    const shortlist=[];
    for(const p of candidates){if(shortlist.every(q=>Math.abs(p.i%W-q.i%W)+Math.abs(Math.floor(p.i/W)-Math.floor(q.i/W))>3))shortlist.push(p);if(shortlist.length===6)break;}
    let best=null,bestScore=0;
    for(const c of shortlist){const trial=[...plan,{i:c.i,kind:c.kind}],r=simulate(city,trial,config,false);evaluated++;const gain=objective(base)-objective(r),score=gain/KIT[c.kind].cost;if(score>bestScore){bestScore=score;best={trial,r,gain};}}
    if(!best)break;
    plan=best.trial;base=best.r;frontier.push({cost:costOf(plan),volume:base.metrics.peakVolume,area:base.metrics.peakArea,plan:[...plan]});
    progress({round:round+1,evaluated,cost:costOf(plan),gain:best.gain});
    await new Promise(r=>setTimeout(r,0));
  }
  return {plan,frontier,evaluated};
}
