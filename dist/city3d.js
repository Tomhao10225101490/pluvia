import * as THREE from './vendor/three.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { W, H, N, KIT } from './engine.js';

const UP = new THREE.Vector3(0,1,0), tmp = new THREE.Object3D();
const tone = new THREE.Color(), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const deepWater = new THREE.Color('#2f638b');
const rand=(x,y)=>((x*41+y*37+13)%101)/101;
const PALETTE=['#d9dfc5','#c5cebc','#d6ddc6','#b8ca9d','#94bfb4'];

/** Original miniature-city geometry, with vendored Three.js 0.187.0 (MIT).
 * Horizontal units are one model cell. Vertical relief/water are exaggerated
 * consistently for legibility; simulation values always remain meters.
 */
export class City3D {
  constructor(canvas,onPick=()=>{},onHover=()=>{},onChange=()=>{}) {
    this.canvas=canvas;this.onPick=onPick;this.onHover=onHover;this.onChange=onChange;
    this.width=1;this.height=1;this.city=null;this.lastPlan='';this.lastRoute='';this.lastLayer='';
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    this.renderer.setClearColor(0xf0f1e7,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.28;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,.1,500);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,1,0);
    this.controls.enableDamping=false;this.controls.minDistance=34;this.controls.maxDistance=155;
    this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=Math.PI*.46;
    this.controls.enablePan=true;this.controls.screenSpacePanning=false;
    this.controls.autoRotateSpeed=.5;
    this.controls.addEventListener('change',onChange);
    this.scene.add(new THREE.HemisphereLight(0xfffef1,0xa0b99d,3));
    const sun=new THREE.DirectionalLight(0xfff5d9,4.1);sun.position.set(-28,60,34);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-43;sun.shadow.camera.right=43;sun.shadow.camera.top=43;sun.shadow.camera.bottom=-43;sun.shadow.camera.near=1;sun.shadow.camera.far=150;sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=3;
    this.scene.add(sun);this.scene.add(new THREE.DirectionalLight(0xc9e6e1,.8));
    this.world=new THREE.Group();this.scene.add(this.world);
    this.pickRay=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.handlers={
      pointerdown:e=>{this.down=[e.clientX,e.clientY];},
      pointerup:e=>{if(this.down&&Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])<5)this.onPick(this.hit(e));this.down=null;},
      pointermove:e=>this.onHover(this.hit(e)),
      pointerleave:()=>this.onHover(-1)
    };
    for(const [name,handler] of Object.entries(this.handlers))canvas.addEventListener(name,handler);
    this.reset();
  }
  heightAt(i){return .6+(this.city.z[i]-this.elevationBase)*this.verticalScale;}
  point(i,raise=0){return new THREE.Vector3(i%W+.5-W/2,this.heightAt(i)+raise,Math.floor(i/W)+.5-H/2);}
  material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0,...extra});}
  box(parent,x,y,z,w,h,d,material,shadow=true){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  setCity(city) {
    // Mutation of imported terrain is detected separately from city object identity.
    let signature=city.seed+':';for(let i=0;i<N;i++)signature+=city.z[i].toFixed(5)+',';
    if(this.signature===signature)return;
    this.signature=signature;this.city=city;this.lastPlan='';this.lastRoute='';this.lastLayer='';this.lastDepth=null;this.waterReady=false;
    this.elevationBase=Math.min(...city.z);this.verticalScale=Math.min(1.6,5/(Math.max(...city.z)-this.elevationBase||1));
    this.clearGroup(this.world);
    this.baseMat=this.material('#b7c5a5');
    this.box(this.world,0,-1.35,0,W+.15,2.2,H+.15,this.baseMat,false);
    this.box(this.world,0,-2.53,0,W+.55,.18,H+.55,this.material('#d7dec8'),false);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(260,260),new THREE.ShadowMaterial({color:0x3c5639,opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.65;floor.receiveShadow=true;this.world.add(floor);
    this.ground=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),this.material('#ffffff'),N);
    this.ground.receiveShadow=true;this.ground.castShadow=false;
    for(let i=0;i<N;i++){
      const x=i%W,y=Math.floor(i/W),top=this.heightAt(i),height=top+2.4;
      tmp.position.set(x+.5-W/2,top-height/2,y+.5-H/2);tmp.scale.set(.997,height,.997);tmp.rotation.set(0,0,0);tmp.updateMatrix();this.ground.setMatrixAt(i,tmp.matrix);
    }
    this.ground.instanceMatrix.needsUpdate=true;this.world.add(this.ground);
    this.makeBuildings();this.makeTrees();this.makeRoads();this.makeLandmarks();
    this.interventions=new THREE.Group();this.world.add(this.interventions);
    this.pathGroup=new THREE.Group();this.world.add(this.pathGroup);
    const waterMat=new THREE.MeshPhysicalMaterial({color:'#6babae',roughness:.2,metalness:.05,transparent:true,opacity:.5,depthWrite:false,clearcoat:1,clearcoatRoughness:.12});
    this.water=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),waterMat,N);this.water.frustumCulled=false;this.water.renderOrder=2;this.world.add(this.water);
    this.hoverRing=new THREE.Mesh(new THREE.BoxGeometry(1.025,.045,1.025),new THREE.MeshBasicMaterial({color:'#fcffd9',transparent:true,opacity:.66,depthWrite:false}));this.hoverRing.visible=false;this.hoverRing.renderOrder=4;this.world.add(this.hoverRing);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025,.1,1.025)),new THREE.LineBasicMaterial({color:'#45765b'}));this.outline.visible=false;this.world.add(this.outline);
    this.paintGround('water',new Map());
    this.onChange();
  }
  makeBuildings(){
    const walls=[this.material('#e2e3d1'),this.material('#d2dcc6'),this.material('#f1e5cd'),this.material('#c9d3bf')];
    const roof=this.material('#e9ecdc'),parapet=this.material('#f5f3df'),window=this.material('#718f8b',{roughness:.36,metalness:.15}),solar=this.material('#49767d',{roughness:.3,metalness:.15});
    const unit=new THREE.BoxGeometry(1,1,1),windowMatrices=[],solarMatrices=[];
    for(const [index,b] of this.city.buildings.entries()){
      const cx=b.x+b.w/2-W/2,cz=b.y+b.h/2-H/2,base=this.heightAt(b.y*W+b.x),bh=b.height/8*.95+1.15;
      this.box(this.world,cx,base+bh/2,cz,b.w-.26,bh,b.h-.26,walls[index%walls.length]);
      this.box(this.world,cx,base+bh+.055,cz,b.w-.05,.13,b.h-.05,parapet);
      this.box(this.world,cx,base+bh+.145,cz,b.w-.52,.08,b.h-.52,roof,false);
      this.box(this.world,cx+.8,base+bh+.32,cz-.45,.8,.32,.75,walls[(index+1)%walls.length]);
      for(let row=0;row<Math.max(2,Math.floor(bh/.7));row++)for(let col=0;col<6;col++){
        const wy=base+.55+row*.63;if(wy>base+bh-.35)continue;
        for(const side of [-1,1]){
          tmp.position.set(cx-b.w/2+.52+col*.68,wy,cz+side*(b.h/2-.125));tmp.scale.set(.3,.29,.035);tmp.rotation.set(0,0,0);tmp.updateMatrix();windowMatrices.push(tmp.matrix.clone());
        }
      }
      for(let col=0;col<3;col++)for(const side of [-1,1]){
        tmp.position.set(cx+side*(b.w/2-.125),base+bh*.48,cz-b.h/2+.55+col*.73);tmp.scale.set(.035,.38,.3);tmp.updateMatrix();windowMatrices.push(tmp.matrix.clone());
      }
      if(index%3!==1)for(let col=0;col<3;col++){
        tmp.position.set(cx-1.38+col*.8,base+bh+.23,cz+.4);tmp.scale.set(.61,.045,.8);tmp.rotation.set(-.13,0,0);tmp.updateMatrix();solarMatrices.push(tmp.matrix.clone());
      }
      // A warm entrance canopy and a planted doorstep give the blocks a human scale.
      this.box(this.world,cx-1.3,base+.7,cz+b.h/2+.08,.9,.1,.5,this.material('#bdc7aa'),false);
    }
    for(const [mat,matrices] of [[window,windowMatrices],[solar,solarMatrices]]){
      const mesh=new THREE.InstancedMesh(unit,mat,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;this.world.add(mesh);
    }
  }
  makeTrees(){
    this.treeCells=[];for(let i=0;i<N;i++){const x=i%W,y=Math.floor(i/W),r=rand(x,y);if((this.city.type[i]===3&&r>.42)||(this.city.type[i]===0&&r>.93))this.treeCells.push(i);}
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.075,.65,5),this.material('#9c9974'),this.treeCells.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5,1),this.material('#ffffff'),this.treeCells.length);
    crowns.castShadow=true;crowns.receiveShadow=true;this.treeCells.forEach((i,n)=>{
      const p=this.point(i),r=rand(i%W,Math.floor(i/W)),s=.74+r*.5;
      tmp.position.copy(p).add(new THREE.Vector3(0,.38,0));tmp.scale.set(1,s,1);tmp.rotation.set(0,0,0);tmp.updateMatrix();trunks.setMatrixAt(n,tmp.matrix);
      tmp.position.copy(p).add(new THREE.Vector3(0,.88*s,0));tmp.scale.set(s,s*1.3,s);tmp.rotation.set(0,r*6,0);tmp.updateMatrix();crowns.setMatrixAt(n,tmp.matrix);crowns.setColorAt(n,new THREE.Color().setHSL(.21+r*.035,.23,.48+r*.13));
    });trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;crowns.instanceColor.needsUpdate=true;this.world.add(trunks,crowns);this.crowns=crowns;this.trunks=trunks;
  }
  makeRoads(){
    const matrices=[];for(let i=0;i<N;i++)if(this.city.type[i]===1){const x=i%W,y=Math.floor(i/W),vert=x%12===1&&y%3===0,horiz=y%10===1&&x%3===0;if(!vert&&!horiz)continue;tmp.position.copy(this.point(i,.025));tmp.scale.set(vert?.075:.7,.012,vert?.7:.075);tmp.rotation.set(0,0,0);tmp.updateMatrix();matrices.push(tmp.matrix.clone());}
    const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),this.material('#e6e8d5'),matrices.length);matrices.forEach((m,i)=>marks.setMatrixAt(i,m));this.world.add(marks);
    const inletMat=this.material('#879787');for(const i of this.city.drains){const p=this.point(i,.035);this.box(this.world,p.x,p.y,p.z,.25,.02,.35,inletMat,false);}
    const furniture=this.material('#b9926e');for(const i of [16*W+28,17*W+30,25*W+7,26*W+8]){const p=this.point(i,.15);this.box(this.world,p.x,p.y,p.z,.65,.1,.2,furniture,false);}
  }
  makeLandmarks(){
    for(const [i,text] of [[12*W+13,'SCHOOL'],[32*W+37,'COMMUNITY']]){
      const c=document.createElement('canvas');c.width=256;c.height=80;const x=c.getContext('2d');
      x.fillStyle='#fafbf0';x.beginPath();x.roundRect(3,3,250,72,15);x.fill();x.strokeStyle='#9fac8d';x.lineWidth=2;x.stroke();x.fillStyle='#4b7258';x.font='bold 22px Arial';x.textAlign='center';x.fillText(text,128,47);
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.copy(this.point(i,2.1));sprite.scale.set(3.35,1.05,1);sprite.renderOrder=5;this.world.add(sprite);
      const p=this.point(i,.7);this.box(this.world,p.x,p.y,p.z,.065,1.35,.065,this.material('#8fa17f'),false);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.055,5,24),this.material('#d0a16f'));ring.rotation.x=Math.PI/2;ring.position.copy(this.point(i,.1));this.world.add(ring);
    }
  }
  paintGround(layer,placements){
    const lo=Math.min(...this.city.z),hi=Math.max(...this.city.z);
    for(let i=0;i<N;i++){
      const t=this.city.type[i],p=placements.get(i);let color=PALETTE[t];
      if(layer==='terrain'&&t!==4){const v=(this.city.z[i]-lo)/(hi-lo||1);tone.setHSL(.18+v*.08,.18,.8-v*.22);}
      else if(p)tone.set(KIT[p].color);else{tone.set(color);if(t===0)tone.offsetHSL(0,0,rand(i%W,Math.floor(i/W))*.035);}
      this.ground.setColorAt(i,tone);
    }this.ground.instanceColor.needsUpdate=true;
  }
  placeInterventions(plan){
    this.clearGroup(this.interventions);
    const gardenMat=this.material('#7fa65e'),pavingMat=this.material('#c6a878'),stone=this.material('#d7dfc5'),basinMat=this.material('#83bdb7',{roughness:.3,metalness:.08});
    for(const p of plan){const pos=this.point(p.i,.06),x=pos.x,y=pos.y,z=pos.z;
      if(p.kind==='pavement'){
        for(let row=0;row<3;row++)for(let col=0;col<3;col++)this.box(this.interventions,x-.3+col*.3,y,z-.3+row*.3,.25,.04,.25,pavingMat,false);
      }else if(p.kind==='basin'){
        this.box(this.interventions,x,y+.055,z,.88,.16,.88,stone,false);this.box(this.interventions,x,y+.15,z,.71,.025,.71,basinMat,false);
        for(const edge of [-.42,.42]){this.box(this.interventions,x+edge,y+.19,z,.07,.08,.88,stone,false);this.box(this.interventions,x,y+.19,z+edge,.88,.08,.07,stone,false);}
      }else{
        this.box(this.interventions,x,y+.025,z,.88,.08,.88,gardenMat,false);
        for(const [dx,dz] of [[-.23,-.2],[.24,.18],[-.18,.23]]){const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,0),gardenMat);leaf.scale.y=1.7;leaf.position.set(x+dx,y+.25,z+dz);leaf.castShadow=true;this.interventions.add(leaf);}
      }
    }
  }
  update({city,plan=[],depth,layer='water',route=[],hover=-1,selected=-1,baseline=false}={}){
    if(city)this.setCity(city);if(!this.city)return;
    const actual=baseline?[]:plan,key=actual.map(p=>p.i+':'+p.kind).join('|'),placements=new Map(actual.map(p=>[p.i,p.kind]));
    if(key!==this.lastPlan){this.placeInterventions(actual);this.lastPlan=key;this.paintGround(layer,placements);}
    if(layer!==this.lastLayer){this.paintGround(layer,placements);this.lastLayer=layer;}
    this.water.visible=layer==='water';
    const depthChanged=depth!==this.lastDepth;
    if(layer==='water'&&(depthChanged||!this.waterReady))for(let i=0;i<N;i++){
      const d=depth?.[i]||0,t=this.city.type[i],visible=t===4||(t!==2&&d>.006),h=t===4?.045:Math.max(.015,d*this.verticalScale);
      tmp.position.copy(this.point(i,h/2+.035));tmp.scale.set(visible?.995:0,visible?h:0,visible?.995:0);tmp.rotation.set(0,0,0);tmp.updateMatrix();this.water.setMatrixAt(i,tmp.matrix);
      tone.set(t===4?'#7faea5':'#65a6b3');tone.lerp(deepWater,clamp(d/.35,0,.8));this.water.setColorAt(i,tone);
    }
    if(layer==='water'&&(depthChanged||!this.waterReady)){this.water.instanceMatrix.needsUpdate=true;if(this.water.instanceColor)this.water.instanceColor.needsUpdate=true;this.lastDepth=depth;this.waterReady=true;}
    const path=Array.isArray(route)?route:(route.path??[]),routeKey=path.join(',');
    if(routeKey!==this.lastRoute||(depthChanged&&path.length>1)){this.clearGroup(this.pathGroup);this.lastRoute=routeKey;if(path.length>1){const points=path.map(i=>this.point(i,.16+(depth?.[i]||0)*this.verticalScale));const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(300,path.length*3),.075,5,false),this.material('#cb865c',{emissive:'#7e4624',emissiveIntensity:.12}));mesh.renderOrder=3;this.pathGroup.add(mesh);}}
    const active=hover>=0?hover:selected;this.hoverRing.visible=active>=0;this.outline.visible=active>=0;
    if(active>=0){this.hoverRing.position.copy(this.point(active,.08));this.outline.position.copy(this.point(active,.11));}
  }
  render(time=0){this.controls.update();this.renderer.render(this.scene,this.camera);}
  resize(w,h){if(w<1||h<1)return;this.width=w;this.height=h;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.onChange();}
  reset(){this.controls?.target.set(0,.8,0);this.camera.position.set(46,43,51);this.camera.lookAt(0,.8,0);this.controls?.update();this.onChange();}
  zoomBy(factor){const offset=this.camera.position.clone().sub(this.controls.target);offset.multiplyScalar(1/factor);offset.setLength(clamp(offset.length(),this.controls.minDistance,this.controls.maxDistance));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();this.onChange();}
  setAutoRotate(enabled){this.controls.autoRotate=!!enabled;this.onChange();}
  hit(event){if(!this.ground)return -1;const r=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.pickRay.setFromCamera(this.pointer,this.camera);const hit=this.pickRay.intersectObject(this.ground,false)[0];return hit?hit.instanceId:-1;}
  projectCell(i){const p=this.point(i,.4).project(this.camera);return [(p.x+1)/2*this.width,(1-p.y)/2*this.height];}
  clearGroup(group){const geometries=new Set(),materials=new Set(),textures=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map)textures.add(m.map);}});while(group.children.length)group.remove(group.children[0]);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  dispose(){for(const [name,handler] of Object.entries(this.handlers))this.canvas.removeEventListener(name,handler);this.controls.dispose();this.clearGroup(this.world);this.renderer.dispose();}
}
