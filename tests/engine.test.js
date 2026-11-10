import {test} from 'node:test';
import assert from 'node:assert/strict';
import {N,W,H,AREA,SCENARIOS,createCity,simulate,route,validatePlan,optimize,costOf,objective} from '../dist/engine.js';

test('dry weather creates no water; a pulse has the stated mean intensity',()=>{
  const city=createCity(),dry=simulate(city,[],{...SCENARIOS.cloudburst,intensity:0},false);
  assert.equal(dry.metrics.rain,0);assert.equal(dry.metrics.surface,0);assert.equal(dry.metrics.balance,0);
  const wet=simulate(city,[],SCENARIOS.cloudburst,false);
  assert.ok(Math.abs(wet.metrics.rain-N*AREA*.09)<.001);
});
test('surface flow, sewer sinks, infiltration and storage close the water ledger',()=>{
  const city=createCity(),plan=[{i:12*W+12,kind:'pavement'},{i:14*W+27,kind:'basin'},{i:18*W+29,kind:'garden'}];
  for(const config of [SCENARIOS.cloudburst,SCENARIOS.extreme,{...SCENARIOS.monsoon,soilFactor:.45}]){
    const result=simulate(city,plan,config);
    assert.ok(Math.abs(result.metrics.balance)<1e-6,`mass residual ${result.metrics.balance}`);
    assert.ok(result.metrics.stored>0);
    for(const frame of result.frames)for(const depth of frame)assert.ok(Number.isFinite(depth)&&depth>=0);
    assert.ok(result.metrics.surface+result.metrics.infiltrated+result.metrics.stored+result.metrics.drained>0);
  }
});
test('A* never crosses a building, river or a cell above the water threshold',()=>{
  const city=createCity(),dry=new Float32Array(N),r=route(city,dry);assert.ok(r.path.length>0);
  for(const i of r.path){assert.notEqual(city.type[i],2);assert.notEqual(city.type[i],4);}
  const flooded=new Float32Array(N).fill(.2);flooded[12*W+13]=0;assert.equal(route(city,flooded).path.length,0);
});
test('malformed or overbudget scenario interventions are rejected',()=>{
  const city=createCity();assert.throws(()=>validatePlan([{i:-1,kind:'garden'}],city));
  assert.throws(()=>validatePlan([{i:0,kind:'garden'}],city));
  assert.throws(()=>validatePlan([{i:0,kind:'pavement'},{i:0,kind:'pavement'}],city));
  assert.throws(()=>validatePlan([{i:0,kind:'pavement'}],city,100));
});
test('simulation-in-the-loop search respects budget and improves the actual objective',async()=>{
  const city=createCity(),config={...SCENARIOS.cloudburst,duration:30},budget=30000;
  const baseline=simulate(city,[],config,false),search=await optimize(city,config,budget),design=simulate(city,search.plan,config,false);
  assert.ok(search.plan.length>0);assert.ok(costOf(search.plan)<=budget);
  assert.ok(objective(design)<objective(baseline));
  for(let k=1;k<search.frontier.length;k++)assert.ok(search.frontier[k].volume+search.frontier[k].area*.035<search.frontier[k-1].volume+search.frontier[k-1].area*.035);
});
