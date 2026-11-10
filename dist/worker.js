import {createCity,simulate,optimize} from './engine.js';
self.onmessage=async({data})=>{
  try{
    const city=createCity(data.seed,data.relief);if(data.elevation)city.z.set(data.elevation);
    if(data.action==='optimize'){
      const result=await optimize(city,data.config,data.budget,data.plan,p=>self.postMessage({type:'progress',...p}));
      self.postMessage({type:'optimized',...result});
    }else{
      const baseline=simulate(city,[],data.config),design=simulate(city,data.plan,data.config);
      self.postMessage({type:'simulation',baseline,design});
    }
  }catch(e){self.postMessage({type:'error',message:e.message});}
};
