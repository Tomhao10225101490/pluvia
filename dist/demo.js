// Exports a visual walkthrough from the actual application canvases and results.
// No screen/microphone capture, remote recording service, or fabricated telemetry.
const f=(v,d=0)=>Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
const C={paper:'#f5f4ee',ink:'#263e37',green:'#297963',muted:'#7a8970',line:'#d8dfce'};
function fit(ctx,source,x,y,w,h){if(!source.width||!source.height)throw Error('Keep the design view visible while exporting.');const r=Math.min(w/source.width,h/source.height),dw=source.width*r,dh=source.height*r;ctx.drawImage(source,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
function wrap(ctx,text,x,y,max,line){const words=text.split(' ');let row='';for(const word of words){const test=row+word+' ';if(ctx.measureText(test).width>max&&row){ctx.fillText(row.trim(),x,y);row=word+' ';y+=line;}else row=test;}ctx.fillText(row.trim(),x,y);return y+line;}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function drawCover({map,graph,results,plan,config,cost},out=document.createElement('canvas')){
  if(out.width!==1600)out.width=1600;if(out.height!==900)out.height=900;const c=out.getContext('2d');c.fillStyle=C.paper;c.fillRect(0,0,1600,900);
  c.fillStyle=C.green;c.font='bold 39px Arial';c.fillText('pluvia.',62,67);c.font='12px Arial';c.fillText('URBAN RESILIENCE LAB',224,57);c.textAlign='right';c.fillStyle=C.muted;c.fillText('ICEHACKS 2026',1538,57);c.textAlign='left';
  c.fillStyle=C.ink;c.font='56px Georgia';c.fillText('Make room for the rain.',62,152);c.fillStyle=C.muted;c.font='18px Arial';c.fillText('Design a city that works with water. Then measure the difference.',64,191);
  fit(c,map,35,205,1120,560);
  c.strokeStyle=C.line;c.beginPath();c.moveTo(1180,235);c.lineTo(1180,770);c.stroke();
  const b=results.baseline.metrics,d=results.design.metrics,p=b.peakVolume?100*(1-d.peakVolume/b.peakVolume):0;
  c.fillStyle=C.muted;c.font='12px Arial';c.fillText('LESS PEAK SURFACE WATER',1220,267);c.fillStyle=C.green;c.font='90px Georgia';c.fillText(f(p,1)+'%',1215,368);
  const blocks=[['BASELINE',f(b.peakVolume)+' m³'],['YOUR DESIGN',f(d.peakVolume)+' m³'],['INTERVENTIONS',String(plan.length)+' · $'+f(cost)],['THE STORM',config.intensity+' mm/h · '+config.duration+' min']];let y=435;
  for(const [label,value] of blocks){c.font='11px Arial';c.fillStyle=C.muted;c.fillText(label,1220,y);c.font='24px Arial';c.fillStyle=C.ink;c.fillText(value,1220,y+36);y+=90;}
  c.fillStyle='#fcfbf7';c.fillRect(65,735,1050,115);fit(c,graph,80,740,1020,95);
  c.font='11px Arial';c.fillStyle=C.muted;c.fillText('Synthetic neighborhood · Illustrative parameters and costs · Educational prototype',65,879);
  c.textAlign='right';c.fillStyle=C.green;c.fillText('Little interventions. Lasting possibilities.',1538,879);c.textAlign='left';return out;
}
export function exportCover(state){drawCover(state).toBlob(blob=>save(blob,'pluvia-cover.png'),'image/png');}
export async function recordDemo(state,frame,onProgress){
  if(!window.MediaRecorder)throw Error('Video recording is not supported in this browser.');
  const audioCtx=new AudioContext();await audioCtx.resume();
  const audio=await audioCtx.decodeAudioData(await (await fetch('./narration.m4a')).arrayBuffer());
  const out=document.createElement('canvas');out.width=1600;out.height=900;const c=out.getContext('2d');
  const destination=audioCtx.createMediaStreamDestination(),voice=audioCtx.createBufferSource();voice.buffer=audio;voice.connect(destination);voice.connect(audioCtx.destination);
  const stream=out.captureStream(30);destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const duration=audio.duration+2,start=performance.now();recorder.start(1000);voice.start();
  const scenes=[
    [0,'WHAT IF A NEIGHBORHOOD COULD BE A SPONGE?','Make room for the rain.','A hands-on lab for a changing climate.'],
    [.14,'01 / THE EXACT SAME STORM','A fair comparison starts with a baseline.','Rainfall, terrain and land cover stay identical.'],
    [.29,'02 / INTERVENE, THEN MEASURE','Small places. Real changes in the model.','Gardens infiltrate. Paving absorbs. Basins make room.'],
    [.43,'03 / SIMULATION-IN-THE-LOOP SEARCH','Every recommendation has to earn its place.','Rerun each candidate. Measure improvement per dollar. Stay within budget.'],
    [.59,'04 / CONNECT THE NEIGHBORHOOD','Can people still get through?','A* avoids cells deeper than 15 cm between school and community center.'],
    [.71,'05 / FOLLOW EVERY DROP','If water is missing, the model is wrong.','Rain = surface + storage + infiltration + tracked outflow.'],
    [.84,'06 / REPRODUCIBLE BY DESIGN','An experiment you can pass on.','Share scenarios. Export plans and CSV. Stress-test three storms.'],
    [.94,'BUILT FOR ICEHACKS 2026','Little interventions. Lasting possibilities.','Synthetic data · Educational model · Extensively assisted by OpenAI Codex']
  ];
  await new Promise((resolve,reject)=>{
    let stopped=false, timer;
    const cleanup=()=>{stopped=true;clearTimeout(timer);try{voice.stop();}catch{}stream.getTracks().forEach(t=>t.stop());};
    const stop=()=>{if(stopped)return;stopped=true;if(recorder.state!=='inactive')recorder.stop();else{cleanup();resolve();}};
    recorder.onerror=e=>{cleanup();reject(e.error||Error('Recording failed.'));};
    recorder.onstop=()=>{cleanup();resolve();};
    timer=setTimeout(stop,Math.ceil(duration*1000));
    const tick=now=>{
      if(stopped)return;
      try{
      const elapsed=(now-start)/1000,p=Math.min(elapsed/duration,1),s=[...scenes].reverse().find(s=>p>=s[0])??scenes[0];
      const baseline=p>=.14&&p<.29,local=baseline?(p-.14)/.15:p>=.29&&p<.43?(p-.29)/.14:p>=.59&&p<.71?(p-.59)/.12:.67;
      frame({minute:Math.min(state.config.duration,Math.round(local*state.config.duration)),baseline,route:p>=.59&&p<.71});
      drawCover(state,out);
      c.fillStyle=C.paper;c.fillRect(35,95,1530,125);c.fillStyle=C.green;c.font='11px Arial';c.fillText(s[1],64,112);c.fillStyle=C.ink;c.font='39px Georgia';c.fillText(s[2],64,160);c.fillStyle=C.muted;c.font='17px Arial';wrap(c,s[3],65,196,1450,24);
      c.fillStyle=C.paper;c.fillRect(65,850,1480,40);c.fillStyle=C.muted;c.font='11px Arial';c.fillText('Actual simulation render · Synthetic narration · '+Math.round(elapsed)+' / '+Math.round(duration)+' sec',65,878);
      c.textAlign='right';c.fillStyle=C.green;c.fillText('pluvia · '+(baseline?'BASELINE CITY':'YOUR DESIGN'),1538,878);c.textAlign='left';
      c.fillStyle='#d8dfce';c.fillRect(0,896,1600,4);c.fillStyle=C.green;c.fillRect(0,896,1600*p,4);
      onProgress({elapsed,duration});
      if(elapsed>=duration){stop();return;}
      requestAnimationFrame(tick);
      }catch(e){cleanup();if(recorder.state!=='inactive')recorder.stop();reject(e);}
    };requestAnimationFrame(tick);
  });
  await audioCtx.close();const blob=new Blob(chunks,{type:mime});save(blob,'pluvia-icehacks-demo.webm');return {duration,bytes:blob.size};
}
