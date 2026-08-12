import * as THREE from 'three';
import {
  initProductionKit,
  preloadProductionAssets,
  pbr,
  solid,
  finish,
  finishAssembly,
  cylinderBetween,
  curveTube,
  roundedPanel,
  createBoatHullGeometry,
  triangularSailGeometry,
  makeDecal,
  addRivetLine
} from './production-kit.js';

/* ============ CORE RENDERER / UTILITIES ============ */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
const reducedQuality = matchMedia('(max-width: 700px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, reducedQuality ? 1.45 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
initProductionKit(renderer);
const camera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, .06, 2500);
function resize(){
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const lerp = (a,b,t)=>a+(b-a)*t;
const smooth = t=>t*t*(3-2*t);
const rand = (a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a);
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

function radialTex(stops){
  const cv = document.createElement('canvas'); cv.width=cv.height=128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  stops.forEach(s=>g.addColorStop(s[0],s[1]));
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(cv);
}
const GLOW_TEX = radialTex([[0,'rgba(255,255,255,1)'],[0.35,'rgba(255,255,255,.55)'],[1,'rgba(255,255,255,0)']]);

function glow(color, size, opacity=1){
  const m = new THREE.SpriteMaterial({map:GLOW_TEX, color, transparent:true,
    opacity, blending:THREE.AdditiveBlending, depthWrite:false});
  const s = new THREE.Sprite(m); s.scale.set(size,size,1); return s;
}

function textPlane(text, w){
  const cv = document.createElement('canvas'); cv.width=512; cv.height=128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle='rgba(30,20,12,0.92)'; ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='rgba(220,190,130,.6)'; ctx.lineWidth=6; ctx.strokeRect(6,6,500,116);
  ctx.fillStyle='#e8d9b0'; ctx.textAlign='center'; ctx.textBaseline='middle';
  let fs = 64; ctx.font='bold '+fs+'px Georgia';
  while(ctx.measureText(text).width > 460 && fs>20){ fs-=4; ctx.font='bold '+fs+'px Georgia'; }
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(cv);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w*0.25),
    new THREE.MeshBasicMaterial({map:tex, transparent:true}));
}

const std = (color, o={}) => new THREE.MeshStandardMaterial(Object.assign(
  {color, flatShading:false, roughness:.82, metalness:.05}, o));
const basic = (color, o={}) => new THREE.MeshBasicMaterial(Object.assign({color}, o));

/* ============ ENVIRONMENT BUILDERS ============ */
function skyDome(top, mid, bot){
  const mat = new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ uTop:{value:new THREE.Color(top)}, uMid:{value:new THREE.Color(mid)}, uBot:{value:new THREE.Color(bot)} },
    vertexShader:'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:[
      'uniform vec3 uTop,uMid,uBot; varying vec3 vDir;',
      'void main(){ float y=vDir.y;',
      ' vec3 c = y>0.0 ? mix(uMid,uTop,pow(min(y*1.25,1.0),0.75)) : mix(uMid,uBot,pow(min(-y*2.2,1.0),0.6));',
      ' gl_FragColor=vec4(c,1.0); }'
    ].join('\n')
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1400, 28, 14), mat);
}

function starField(n=900){
  const pos = new Float32Array(n*3), col = new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const th=rand(Math.PI*2), ph=Math.acos(rand(0.02,1));
    const r=1200;
    pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=r*Math.cos(ph); pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    const c = pick([[1,1,1],[0.75,0.85,1],[1,0.9,0.75]]); const b=rand(0.35,1);
    col[i*3]=c[0]*b; col[i*3+1]=c[1]*b; col[i*3+2]=c[2]*b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const m = new THREE.PointsMaterial({size:2.1, map:GLOW_TEX, vertexColors:true, transparent:true,
    opacity:.9, blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:false, fog:false});
  return new THREE.Points(g,m);
}

function moon(x,y,z,size,color=0xf4e9c8){
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(size, 40), basic(color,{fog:false}));
  disc.position.set(x,y,z); disc.lookAt(0,0,0);
  const halo = glow(color, size*7, .5); halo.position.set(x,y,z);
  grp.add(disc, halo); return grp;
}

function makeWater(o={}){
  const u = {
    uTime:{value:0}, uAmp:{value:o.amp??0.16}, uFreq:{value:o.freq??0.13}, uSpeed:{value:o.speed??1},
    uDeep:{value:new THREE.Color(o.deep??0x06283b)}, uShallow:{value:new THREE.Color(o.shallow??0x0f5b6e)},
    uGlowC:{value:new THREE.Color(o.glowColor??0x000000)}, uGlowStr:{value:o.glowStr??0},
    uSunDir:{value:V3(...(o.sunDir||[0.3,0.45,0.6])).normalize()},
    uSunC:{value:new THREE.Color(o.sunColor??0xfff2d0)},
    uSparkle:{value:o.sparkle??0}, uStorm:{value:o.storm??0},
    uFogC:{value:new THREE.Color(o.fogColor??0x0a1524)},
    uFogN:{value:o.fogNear??60}, uFogF:{value:o.fogFar??520}
  };
  const mat = new THREE.ShaderMaterial({
    uniforms:u,
    vertexShader:[
      'uniform float uTime,uAmp,uFreq,uSpeed;',
      'varying vec3 vN; varying vec3 vW;',
      'float waveH(vec2 p, float t){',
      ' float h = sin(p.x*uFreq + t*0.9*uSpeed);',
      ' h += 0.62*sin(p.y*uFreq*1.43 + t*1.21*uSpeed + 1.7);',
      ' h += 0.34*sin((p.x+p.y)*uFreq*0.77 + t*0.63*uSpeed + 4.2);',
      ' return h*uAmp; }',
      'void main(){',
      ' vec3 pos = position;',
      ' float t = uTime;',
      ' vec2 p = pos.xz;',
      ' pos.y += waveH(p,t);',
      ' float e = 0.55;',
      ' float hx = waveH(p+vec2(e,0.0),t);',
      ' float hz = waveH(p+vec2(0.0,e),t);',
      ' vN = normalize(vec3(waveH(p,t)-hx, e, waveH(p,t)-hz));',
      ' vec4 wp = modelMatrix*vec4(pos,1.0);',
      ' vW = wp.xyz;',
      ' gl_Position = projectionMatrix*viewMatrix*wp; }'
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 uDeep,uShallow,uGlowC,uSunDir,uSunC,uFogC;',
      'uniform float uGlowStr,uSparkle,uStorm,uTime,uFogN,uFogF;',
      'varying vec3 vN; varying vec3 vW;',
      'void main(){',
      ' vec3 V = normalize(cameraPosition - vW);',
      ' vec3 N = normalize(vN);',
      ' float fres = pow(1.0 - max(dot(V,N),0.0), 2.0);',
      ' vec3 col = mix(uDeep, uShallow, fres);',
      ' vec3 R = reflect(-normalize(uSunDir), N);',
      ' col += uSunC * pow(max(dot(R,V),0.0), 900.0) * 0.15;',
      ' float crest = smoothstep(0.72, 0.98, 1.0-N.y);',
      ' col += mix(vec3(0.0), vec3(0.58,0.75,0.82), crest*uStorm*0.55);',
      ' col += uGlowC * uGlowStr * (0.3 + 0.7*fres);',
      ' if(uSparkle > 0.001){',
      '   vec2 g = floor(vW.xz*7.0);',
      '   float h = fract(sin(dot(g, vec2(127.1,311.7)))*43758.5453);',
      '   float tw = fract(h*7.0 + uTime*0.22);',
      '   float s = step(0.988, h) * smoothstep(0.5, 0.05, abs(tw-0.5));',
      '   col += uSunC * s * uSparkle; }',
      ' float d = length(cameraPosition - vW);',
      ' float f = smoothstep(uFogN, uFogF, d);',
      ' col = mix(col, uFogC, f);',
      ' gl_FragColor = vec4(col, 1.0); }'
    ].join('\n')
  });
  const geo = new THREE.PlaneGeometry(o.size??1600, o.size??1600, o.seg??140, o.seg??140);
  geo.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.tick = t => { u.uTime.value = t; };
  return mesh;
}

function env(scene, o={}){
  scene.fog = new THREE.Fog(o.fogColor??0x0a1524, o.fogNear??40, o.fogFar??320);
  const hemi = new THREE.HemisphereLight(o.hemiSky??0x33415e, o.hemiGnd??0x0b0e14, o.hemiI??0.55);
  scene.add(hemi);
  if(o.dir){ const d = new THREE.DirectionalLight(o.dirColor??0xbfd4ff, o.dirI??0.7);
    d.position.set(...(o.dir)); d.castShadow=true; d.shadow.mapSize.set(1024,1024); scene.add(d); }
  return scene;
}

/* ============ PROP BUILDERS ============ */
function animateBoat(g, t, a=0.12, r=0.03){
  const b = g.userData.base || (g.userData.base = g.position.clone());
  g.position.y = b.y + Math.sin(t*0.85 + (g.userData.ph||0))*a;
  g.rotation.z = Math.sin(t*0.7 + (g.userData.ph||0))*r;
  g.rotation.x = Math.sin(t*0.52 + 1.3 + (g.userData.ph||0))*r*0.7;
}

function sailboat(o={}){
  const g = new THREE.Group();
  g.name = 'Sea_Serpent_30ft_sloop';
  const requestedHull = new THREE.Color(o.hull??0x6b4226).lerp(new THREE.Color(0xffffff), .32);
  const hullMat = pbr('wood',{color:requestedHull, span:[8.9,2.7], repeat:[4.45,1.35], roughness:.78, normalStrength:.5});
  const deckMat = pbr('wood',{color:0xc8b487, span:[7.5,2.1], repeat:[3.75,1.05], roughness:.84, normalStrength:.42});
  const darkWood = pbr('wood',{color:0x553a26, span:[4,1], repeat:[2,.5], roughness:.8, normalStrength:.36});
  const ropeMat = solid(0x77644b,{roughness:.98,metalness:0,macro:false});
  const fittingMat = solid(0xaeb3b1,{roughness:.34,metalness:.82,macroAmount:.06});
  const darkMetal = solid(0x222a2d,{roughness:.48,metalness:.7});
  const sailMat = pbr('leather',{albedo:false,color:o.sail??0xe1d8c2,span:[4.5,5],repeat:[11.25,12.5],roughness:.96,normalStrength:.13,side:THREE.DoubleSide,macroAmount:.045});

  const hull = finish(new THREE.Mesh(createBoatHullGeometry({length:8.9,beam:2.72,draft:.76,freeboard:1.08,sections:22}),hullMat),
    {name:'carvel_planked_hull'});
  hull.position.y=.12;
  g.add(hull);

  const deck = roundedPanel(7.45,2.16,.14,.34,deckMat,{name:'laid_timber_deck',edgeColor:0xead9b8,edgeOpacity:.08});
  deck.rotation.x=-Math.PI/2; deck.position.set(-.18,1.16,0); g.add(deck);
  const cockpit = roundedPanel(2.05,.96,.09,.28,darkWood,{name:'cockpit_well'});
  cockpit.rotation.x=-Math.PI/2; cockpit.position.set(-2.35,1.25,0); g.add(cockpit);
  const cockpitLip = new THREE.Mesh(new THREE.TorusGeometry(.64,.055,8,32),darkWood);
  cockpitLip.scale.set(1.55,1,1); cockpitLip.rotation.x=Math.PI/2; cockpitLip.position.set(-2.35,1.31,0); g.add(cockpitLip);

  const coachRoof = roundedPanel(1.9,.86,.16,.2,deckMat,{name:'coach_roof',edgeColor:0xd8c39c,edgeOpacity:.1});
  coachRoof.rotation.x=-Math.PI/2; coachRoof.position.set(-.65,1.57,0); g.add(coachRoof);
  const coachFront = roundedPanel(1.62,.48,1.25,.12,darkWood,{name:'coach_house'});
  coachFront.position.set(-.66,1.35,0); g.add(coachFront);
  const glassMat = solid(0x31566a,{physical:true,roughness:.16,metalness:.1,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.88,macro:false});
  [-1,1].forEach(side=>{
    const win = roundedPanel(1.12,.27,.025,.07,glassMat,{name:'coach_window',castShadow:false});
    win.position.set(-.66,1.42,side*.638); if(side<0) win.rotation.y=Math.PI; g.add(win);
  });

  const rubPort = curveTube([[-4.25,1.02,-.72],[-1.8,1.18,-1.32],[1.5,1.2,-1.22],[4.28,1.42,-.08]],.055,darkWood,64,8,{name:'port_rub_rail'});
  const rubStarboard = curveTube([[-4.25,1.02,.72],[-1.8,1.18,1.32],[1.5,1.2,1.22],[4.28,1.42,.08]],.055,darkWood,64,8,{name:'starboard_rub_rail'});
  g.add(rubPort,rubStarboard);

  const railPortPts=[], railStarPts=[];
  for(let i=0;i<7;i++){
    const x=-3.55+i*1.17, z=1.05-Math.max(0,x-2.6)*.3;
    const y=1.24+Math.max(0,x-2.4)*.16;
    g.add(cylinderBetween([x,y,-z],[x,y+.48,-z],.018,fittingMat,8,{name:'port_stanchion'}));
    g.add(cylinderBetween([x,y,z],[x,y+.48,z],.018,fittingMat,8,{name:'starboard_stanchion'}));
    railPortPts.push([x,y+.48,-z]); railStarPts.push([x,y+.48,z]);
  }
  g.add(curveTube(railPortPts,.014,fittingMat,56,6,{name:'port_guard_rail'}));
  g.add(curveTube(railStarPts,.014,fittingMat,56,6,{name:'starboard_guard_rail'}));

  const mast = cylinderBetween([.34,1.12,0],[.34,7.35,0],.075,darkWood,12,{name:'main_mast'});
  const boom = cylinderBetween([.34,3.05,0],[-2.72,3.05,0],.052,darkWood,10,{name:'boom'});
  g.add(mast,boom);
  g.add(cylinderBetween([.34,7.2,0],[4.16,1.48,0],.012,ropeMat,6,{name:'forestay',castShadow:false}));
  g.add(cylinderBetween([.34,7.18,0],[-3.65,1.52,-1.02],.011,ropeMat,6,{name:'port_shroud',castShadow:false}));
  g.add(cylinderBetween([.34,7.18,0],[-3.65,1.52,1.02],.011,ropeMat,6,{name:'starboard_shroud',castShadow:false}));

  if(o.sailUp!==false){
    const mainSail = finish(new THREE.Mesh(triangularSailGeometry([.32,7.12,.02],[-2.58,3.16,.02],[.32,3.16,.02],16,.17),sailMat),{name:'mainsail'});
    const jibSail = finish(new THREE.Mesh(triangularSailGeometry([.43,6.82,.025],[3.96,1.64,.025],[.43,2.12,.025],15,-.13),sailMat),{name:'jib'});
    g.add(mainSail,jibSail);
    for(let i=1;i<5;i++){
      const k=i/5;
      g.add(cylinderBetween([.34-k*2.55,3.18+k*3.7,.055],[.34,3.18+k*3.7,.055],.009,ropeMat,5,{name:'mainsail_seam',castShadow:false}));
    }
  }

  for(const x of [-2.85,-1.85]){
    const winch = finish(new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.24,16),fittingMat),{name:'sheet_winch'});
    winch.position.set(x,1.42,.79); g.add(winch);
    const cap = finish(new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.025,16),darkMetal),{name:'winch_cap'});
    cap.position.set(x,1.56,.79); g.add(cap);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.32,.025,8,28),darkWood);
  wheel.position.set(-3.2,1.82,0); wheel.rotation.y=Math.PI/2; g.add(wheel);
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2;
    g.add(cylinderBetween([-3.2,1.82,0],[-3.2,1.82+Math.cos(a)*.31,Math.sin(a)*.31],.012,darkWood,6,{name:'helm_spoke'}));
  }
  const rudder = roundedPanel(.74,.72,.08,.08,darkWood,{name:'rudder'});
  rudder.position.set(-4.32,.22,0); rudder.rotation.y=Math.PI/2; g.add(rudder);
  const anchor = finish(new THREE.Mesh(new THREE.TorusGeometry(.16,.035,8,18,Math.PI*1.45),darkMetal),{name:'bow_anchor'});
  anchor.position.set(3.92,.72,.62); anchor.rotation.set(Math.PI/2,.3,.2); g.add(anchor);
  const ropeCoil = new THREE.Group(); ropeCoil.name='working_rope_coil';
  for(let i=0;i<4;i++){
    const loop=new THREE.Mesh(new THREE.TorusGeometry(.22+i*.025,.014,6,28),ropeMat);
    loop.rotation.x=Math.PI/2; loop.position.y=i*.008; ropeCoil.add(loop);
  }
  ropeCoil.position.set(-1.6,1.34,-.66); g.add(ropeCoil);

  const namePlate = makeDecal('SEA SERPENT',{worldWidth:1.65,worldHeight:.23,color:'#d8bb73',fontSize:46,letterSpacing:'5px',name:'sea_serpent_hull_decal'});
  namePlate.position.set(-2.6,.56,1.34); namePlate.rotation.z=-.015; g.add(namePlate);
  const namePlatePort = namePlate.clone(); namePlatePort.material=namePlate.material.clone();
  namePlatePort.position.z=-1.34; namePlatePort.rotation.y=Math.PI; g.add(namePlatePort);

  const redNav=solid(0xff304d,{emissive:0xff102c,emissiveIntensity:5,roughness:.25,macro:false});
  const greenNav=solid(0x39f1a4,{emissive:0x18c47f,emissiveIntensity:5,roughness:.25,macro:false});
  const portLight=finish(new THREE.Mesh(new THREE.SphereGeometry(.055,10,7),redNav),{name:'port_navigation_light',castShadow:false});
  const starLight=finish(new THREE.Mesh(new THREE.SphereGeometry(.055,10,7),greenNav),{name:'starboard_navigation_light',castShadow:false});
  portLight.position.set(3.25,1.48,-1.0); starLight.position.set(3.25,1.48,1.0); g.add(portLight,starLight);
  g.scale.setScalar(o.scale??1);
  return finishAssembly(g);
}

function blackYacht(o={}){
  const g = new THREE.Group();
  g.name='Serpents_Shadow_interceptor';
  const hullMat=pbr('corrodedMetal',{albedo:false,color:0x10151c,span:[12,3],repeat:[6,1.5],roughness:.48,metalness:.88,normalStrength:.32,macroAmount:.12});
  const panelMat=solid(0x111923,{physical:true,roughness:.24,metalness:.76,clearcoat:.65,clearcoatRoughness:.18});
  const trimMat=solid(0x394550,{roughness:.3,metalness:.9});
  const glassMat=solid(0x89cbea,{physical:true,roughness:.1,metalness:.22,clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.82,emissive:0x153c52,emissiveIntensity:.7,macro:false});
  const cyanMat=solid(0x2fd4c8,{roughness:.22,metalness:.35,emissive:0x2fd4c8,emissiveIntensity:4,macro:false});
  const hull=finish(new THREE.Mesh(createBoatHullGeometry({length:12.2,beam:3.15,draft:.72,freeboard:1.18,sections:26}),hullMat),{name:'armoured_composite_hull'});
  hull.position.y=.08; g.add(hull);
  const deck=roundedPanel(9.8,2.45,.13,.42,panelMat,{name:'flush_upper_deck',edgeColor:0x75818b,edgeOpacity:.1});
  deck.rotation.x=-Math.PI/2; deck.position.set(-.35,1.26,0); g.add(deck);
  const cabin=roundedPanel(4.3,1.28,2.28,.34,panelMat,{name:'faceted_command_cabin',edgeColor:0x687681,edgeOpacity:.12});
  cabin.position.set(-1.15,1.78,0); cabin.rotation.z=-.035; g.add(cabin);
  const roof=roundedPanel(4.55,2.43,.12,.38,panelMat,{name:'sensor_cabin_roof'});
  roof.rotation.x=-Math.PI/2; roof.position.set(-1.2,2.48,0); g.add(roof);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const window=roundedPanel(1.0,.42,.028,.1,glassMat,{name:'laminated_cabin_glass',castShadow:false});
      window.position.set(-2.35+i*1.18,1.9,side*1.153); if(side<0) window.rotation.y=Math.PI; g.add(window);
    }
    const strip=finish(new THREE.Mesh(new THREE.BoxGeometry(9.3,.055,.035),cyanMat),{name:'cyan_identification_strip',castShadow:false});
    strip.position.set(-.55,.62,side*1.48); g.add(strip);
    addRivetLine(g,[-3.8,1.32,side*1.2],[1.5,1.32,side*1.2],12,trimMat,.025);
  }
  const forwardScreen=roundedPanel(1.72,.72,.03,.16,glassMat,{name:'forward_command_glass',castShadow:false});
  forwardScreen.position.set(1.02,1.92,0); forwardScreen.rotation.y=Math.PI/2; g.add(forwardScreen);
  for(const x of [-4.7,-3.3,-1.9,.0,1.9,3.6]){
    for(const side of [-1,1]){
      const z=side*(1.25-Math.max(0,x-2.8)*.23);
      g.add(cylinderBetween([x,1.3,z],[x,1.7,z],.018,trimMat,8,{name:'yacht_rail_stanchion'}));
    }
  }
  for(const side of [-1,1]) g.add(curveTube([[-4.7,1.7,side*1.25],[-1,1.7,side*1.25],[2.5,1.7,side*1.2],[4.1,1.78,side*.55]],.014,trimMat,48,6,{name:'yacht_guard_rail'}));
  const mast=cylinderBetween([-2.4,2.43,0],[-2.4,4.35,0],.055,trimMat,10,{name:'sensor_mast'}); g.add(mast);
  const radar=new THREE.Mesh(new THREE.TorusGeometry(.42,.035,8,28),trimMat); radar.position.set(-2.4,3.86,0); radar.rotation.x=Math.PI/2; g.add(radar);
  const radome=finish(new THREE.Mesh(new THREE.SphereGeometry(.2,16,10),glassMat),{name:'radar_dome',castShadow:false}); radome.position.set(-2.4,4.36,0); g.add(radome);
  for(const side of [-1,1]){
    const thruster=finish(new THREE.Mesh(new THREE.CylinderGeometry(.31,.42,.72,18),trimMat),{name:'waterjet_thruster'});
    thruster.rotation.z=Math.PI/2; thruster.position.set(-5.7,.18,side*.72); g.add(thruster);
    const core=finish(new THREE.Mesh(new THREE.CircleGeometry(.27,20),cyanMat),{name:'thruster_core',castShadow:false});
    core.rotation.y=-Math.PI/2; core.position.set(-6.07,.18,side*.72); g.add(core);
  }
  const decal=makeDecal("SERPENT'S SHADOW",{worldWidth:2.25,worldHeight:.24,color:'#7f939f',font:'Arial',fontSize:35,letterSpacing:'4px',opacity:.72,name:'serpents_shadow_decal'});
  decal.position.set(-2.8,.72,1.51); g.add(decal);
  const deckHatch=roundedPanel(1.15,.78,.06,.18,trimMat,{name:'service_hatch'}); deckHatch.rotation.x=-Math.PI/2; deckHatch.position.set(2.3,1.4,0); g.add(deckHatch);
  g.scale.setScalar(o.scale??1);
  return finishAssembly(g);
}

function naiaVessel(o={}){
  const g = new THREE.Group();
  g.name='Keeper_tidal_vessel';
  const hullMat=solid(0x0b1821,{physical:true,roughness:.22,metalness:.78,clearcoat:.55,clearcoatRoughness:.12,emissive:0x0b2634,emissiveIntensity:.5});
  const frameMat=solid(0x56747f,{roughness:.28,metalness:.9});
  const cyanMat=solid(0x9fe8ff,{physical:true,roughness:.08,metalness:.18,transmission:.28,thickness:.28,ior:1.46,emissive:0x65cce8,emissiveIntensity:3.6,macro:false});
  const hull=finish(new THREE.Mesh(createBoatHullGeometry({length:11.4,beam:2.55,draft:.54,freeboard:.82,sections:28}),hullMat),{name:'tidal_alloy_hull',edgeColor:0x6aa7b7,edgeOpacity:.12});
  hull.position.y=.18; g.add(hull);
  const spine=curveTube([[-5.1,.65,0],[-2.2,1.02,0],[1.5,1.18,0],[5.35,1.02,0]],.11,frameMat,56,10,{name:'exposed_keel_spine'}); g.add(spine);
  for(let i=0;i<7;i++){
    const x=-4.5+i*1.5;
    const rib=new THREE.Mesh(new THREE.TorusGeometry(1.02,.045,8,28,Math.PI),frameMat);
    rib.position.set(x,.72,0); rib.rotation.set(0,Math.PI/2,Math.PI/2); rib.scale.y=.62; g.add(rib);
  }
  const canopy=finish(new THREE.Mesh(new THREE.SphereGeometry(1.18,28,16,0,Math.PI*2,0,Math.PI*.56),solid(0x17384b,{physical:true,roughness:.08,metalness:.2,clearcoat:1,clearcoatRoughness:.03,transparent:true,opacity:.76,emissive:0x0e3549,emissiveIntensity:.7,macro:false})),{name:'crystalline_canopy',castShadow:false});
  canopy.scale.set(1.55,.72,.78); canopy.position.set(-1.1,1.4,0); g.add(canopy);
  for(const side of [-1,1]){
    const fin=roundedPanel(3.6,.54,.12,.2,hullMat,{name:'stabilizer_fin',edgeColor:0x5bb5c9,edgeOpacity:.14});
    fin.position.set(.25,.48,side*1.52); fin.rotation.x=side*.18; g.add(fin);
    const seam=finish(new THREE.Mesh(new THREE.BoxGeometry(7.6,.035,.035),cyanMat),{name:'tidal_energy_seam',castShadow:false});
    seam.position.set(-.15,.58,side*1.2); g.add(seam);
  }
  const pylon = cylinderBetween([1.38,.88,0],[1.38,2.72,0],.075,frameMat,10,{name:'crystal_pylon'});
  const braceA=cylinderBetween([.72,.92,-.72],[1.38,2.15,0],.045,frameMat,8,{name:'pylon_brace'});
  const braceB=cylinderBetween([.72,.92,.72],[1.38,2.15,0],.045,frameMat,8,{name:'pylon_brace'});
  const crystal = finish(new THREE.Mesh(new THREE.OctahedronGeometry(0.55,1), cyanMat),{name:'tide_navigation_crystal',castShadow:false});
  crystal.position.set(1.38,2.95,0);
  const gyroA=new THREE.Mesh(new THREE.TorusGeometry(.82,.035,8,42),frameMat); gyroA.position.copy(crystal.position); gyroA.rotation.x=Math.PI/2;
  const gyroB=gyroA.clone(); gyroB.rotation.set(.6,0,.35);
  g.add(pylon,braceA,braceB,crystal,gyroA,gyroB);
  for(const side of [-1,1]){
    const pod=finish(new THREE.Mesh(new THREE.CylinderGeometry(.22,.34,.95,14),frameMat),{name:'tide_drive_pod'});
    pod.rotation.z=Math.PI/2; pod.position.set(-4.75,.18,side*.68); g.add(pod);
    const wake=glow(0x5fd8ff,2.2,.42); wake.position.set(-5.3,.18,side*.68); g.add(wake);
  }
  const glyph=makeDecal('≋  ◇  ≋',{worldWidth:1.5,worldHeight:.25,color:'#9fe8ff',font:'Arial',fontSize:58,opacity:.8,name:'keeper_glyph_decal'});
  glyph.position.set(.1,.65,1.23); g.add(glyph);
  const under = glow(0x5fd8ff, 9, .5); under.position.y=0.1;
  const top = glow(0x9fe8ff, 4, .7); top.position.copy(crystal.position);
  g.add(under,top);
  g.userData.crystal = crystal;
  g.userData.gyros = [gyroA,gyroB];
  g.scale.setScalar(o.scale??1);
  return finishAssembly(g);
}

const CHARACTER_PRESETS = {
  jalen:{skin:0x70442f, coat:0x4b382c, shirt:0xd8c6a3, hair:0x171310, hairStyle:'close', build:1.08},
  maya:{skin:0xb47b5d, coat:0x6e5a8a, shirt:0xd6c9e7, hair:0x241817, hairStyle:'long', build:.86},
  leo:{skin:0xb47b5d, coat:0x315776, shirt:0xc8dbdf, hair:0x241817, hairStyle:'close', build:.76},
  thorne:{skin:0xc8b8a8, coat:0x171a22, shirt:0xdce3e7, hair:0x9c9a9a, hairStyle:'parted', build:1.0},
  naia:{skin:0x5c382f, coat:0x254b67, shirt:0x9fe8ff, hair:0x11151c, hairStyle:'crown', build:1.05}
};

function limb(radius, length, material){
  return finish(new THREE.Mesh(new THREE.CapsuleGeometry(radius,length-radius*2,5,10),material));
}

function figure(o={}){
  const preset = CHARACTER_PRESETS[o.character] || {};
  const h = o.h??1.7, build = o.build??preset.build??1;
  const skinColor = o.skin??preset.skin??0xc9a486;
  const coatColor = o.color??preset.coat??0x5a4632;
  const shirtColor = o.shirt??preset.shirt??0xc6b597;
  const g = new THREE.Group();
  g.name=`character_${o.character||'extra'}`;
  const skin = solid(skinColor,{roughness:.68,metalness:0,macroAmount:.025,macroScale:1.2});
  const coat = pbr('leather',{albedo:false,color:coatColor,span:[.5,.7],repeat:[1.25,1.75],roughness:.82,normalStrength:.16,macroAmount:.045,macroScale:.7});
  const shirt = solid(shirtColor,{roughness:.94,metalness:0,macroAmount:.025,macroScale:1.2});
  const dark = pbr('leather',{albedo:false,color:0x202329,span:[.45,.65],repeat:[1.1,1.6],roughness:.78,normalStrength:.2,macroAmount:.04});
  const bootMat = pbr('leather',{albedo:false,color:0x151719,span:[.32,.35],repeat:[.8,.88],roughness:.58,normalStrength:.25,macroAmount:.055});
  const metal = solid(0xa1a7a7,{roughness:.34,metalness:.82});
  const hairMat=solid(o.hair??preset.hair??0x201914,{roughness:.88,metalness:0,macroAmount:.045,macroScale:1.5});
  const hipY=h*.47, kneeY=h*.255, ankleY=h*.075, shoulderY=h*.735, elbowY=h*.53, wristY=h*.355, headY=h*.89;

  const pelvis=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.092*build,14,10),coat),{name:'layered_waistcoat'});
  pelvis.scale.set(1.28,.72,.92); pelvis.position.y=hipY; g.add(pelvis);

  if(o.robe){
    const robeMat=pbr('leather',{albedo:false,color:o.robe,span:[.65,1.25],repeat:[1.6,3.1],roughness:.9,normalStrength:.12,macroAmount:.05});
    const outer=finish(new THREE.Mesh(new THREE.CylinderGeometry(.16*build,.36*build,h*.69,18,1,true),robeMat),{name:'tailored_outer_robe'});
    outer.position.y=h*.355; g.add(outer);
    const inner=finish(new THREE.Mesh(new THREE.CylinderGeometry(.14*build,.31*build,h*.67,18),solid(new THREE.Color(o.robe).multiplyScalar(.58),{roughness:.95,metalness:0})),{name:'robe_lining'});
    inner.position.y=h*.35; g.add(inner);
    const hem=new THREE.Mesh(new THREE.TorusGeometry(.34*build,.018,7,28),metal); hem.rotation.x=Math.PI/2; hem.position.y=h*.018; g.add(hem);
    const sash=finish(new THREE.Mesh(new THREE.CylinderGeometry(.17*build,.18*build,h*.052,16),metal),{name:'assembled_robe_sash'});
    sash.position.y=hipY+.035; g.add(sash);
    const frontPanel=roundedPanel(.16*build,h*.48,.018,.025,robeMat,{name:'embroidered_robe_panel'});
    frontPanel.position.set(0,h*.28,.31*build); g.add(frontPanel);
  } else {
    [-1,1].forEach(side=>{
      const hip=new THREE.Vector3(side*h*.06*build,hipY,0);
      const knee=new THREE.Vector3(side*h*.072*build,kneeY,.008);
      const ankle=new THREE.Vector3(side*h*.066*build,ankleY,.012);
      g.add(cylinderBetween(hip,knee,h*.044*build,dark,11,{name:'upper_leg'}));
      g.add(cylinderBetween(knee,ankle,h*.038*build,dark,11,{name:'lower_leg'}));
      const kneeJoint=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.047*build,12,8),dark),{name:'tailored_knee'});
      kneeJoint.scale.y=.82; kneeJoint.position.copy(knee); g.add(kneeJoint);
      const boot=finish(new THREE.Mesh(new THREE.CapsuleGeometry(h*.045*build,h*.055,4,10),bootMat),{name:'leather_boot_upper'});
      boot.position.set(side*h*.066*build,h*.075,.012); g.add(boot);
      const sole=roundedPanel(h*.105*build,h*.07,h*.18,.035,bootMat,{name:'stitched_boot'});
      sole.position.set(side*h*.066*build,h*.035,h*.045); sole.rotation.x=-.08; g.add(sole);
    });
  }

  const torso=finish(new THREE.Mesh(new THREE.CylinderGeometry(h*.105*build,h*.086*build,h*.27,16),coat),{name:'constructed_coat_torso'});
  torso.position.y=h*.605; torso.scale.z=.82; g.add(torso);
  const chest=roundedPanel(h*.13*build,h*.24,.016,.025,shirt,{name:'shirt_front'});
  chest.position.set(0,h*.62,h*.09*build); g.add(chest);
  const belt=finish(new THREE.Mesh(new THREE.CylinderGeometry(h*.091*build,h*.091*build,h*.038,16),bootMat),{name:'leather_belt'});
  belt.position.y=hipY+h*.025; g.add(belt);
  const buckle=roundedPanel(h*.055,h*.04,.018,.008,metal,{name:'belt_buckle'});
  buckle.position.set(0,hipY+h*.025,h*.094); g.add(buckle);

  const lapelGeo=new THREE.BufferGeometry();
  lapelGeo.setAttribute('position',new THREE.Float32BufferAttribute([
    0,h*.72,h*.102, -h*.072*build,h*.62,h*.108, -h*.025,h*.52,h*.105,
    0,h*.72,h*.102, h*.072*build,h*.62,h*.108, h*.025,h*.52,h*.105
  ],3));
  lapelGeo.setAttribute('uv',new THREE.Float32BufferAttribute([.5,1,0,.5,.38,0,.5,1,1,.5,.62,0],2));
  lapelGeo.computeVertexNormals();
  g.add(finish(new THREE.Mesh(lapelGeo,coat),{name:'separate_coat_lapels'}));

  [-1,1].forEach(side=>{
    const shoulder=new THREE.Vector3(side*h*.125*build,shoulderY,0);
    const elbow=new THREE.Vector3(side*h*.15*build,elbowY,.012);
    const wrist=new THREE.Vector3(side*h*.14*build,wristY,.028);
    const shoulderCap=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.055*build,12,8),coat),{name:'tailored_shoulder'});
    shoulderCap.scale.set(1.05,.82,.9); shoulderCap.position.copy(shoulder); g.add(shoulderCap);
    g.add(cylinderBetween(shoulder,elbow,h*.035*build,coat,11,{name:'upper_sleeve'}));
    g.add(cylinderBetween(elbow,wrist,h*.031*build,coat,11,{name:'lower_sleeve'}));
    const elbowJoint=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.036*build,10,7),coat),{name:'sleeve_elbow'});
    elbowJoint.position.copy(elbow); g.add(elbowJoint);
    const cuff=finish(new THREE.Mesh(new THREE.CylinderGeometry(h*.034*build,h*.034*build,h*.035,10),shirt),{name:'shirt_cuff'});
    cuff.position.copy(wrist); g.add(cuff);
    const hand=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.039*build,12,8),skin),{name:'hand'});
    hand.scale.set(.76,1.08,.72); hand.position.set(wrist.x,wrist.y-h*.047,wrist.z); g.add(hand);
    const thumb=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.015*build,8,6),skin),{name:'thumb'});
    thumb.position.set(wrist.x-side*h*.028,wrist.y-h*.042,wrist.z+h*.018); g.add(thumb);
  });

  const neck=finish(new THREE.Mesh(new THREE.CylinderGeometry(h*.036*build,h*.043*build,h*.085,12),skin),{name:'neck'});
  neck.position.y=h*.79; g.add(neck);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(h*.049*build,h*.012,6,20,Math.PI*1.45),shirt);
  collar.position.set(0,h*.792,h*.008); collar.rotation.x=Math.PI/2; g.add(collar);
  const head = finish(new THREE.Mesh(new THREE.CapsuleGeometry(h*.072*build,h*.055,6,14), skin),{name:'head'});
  head.position.y=headY; head.scale.set(.9,1,.86); g.add(head);
  const jaw=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.064*build,12,9),skin),{name:'jaw'});
  jaw.position.set(0,headY-h*.055,h*.008); jaw.scale.set(.9,.72,.86); g.add(jaw);
  [-1,1].forEach(side=>{
    const ear=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.015*build,8,6),skin),{name:'ear'});
    ear.scale.set(.55,1,.6); ear.position.set(side*h*.068*build,headY,h*.004); g.add(ear);
  });

  const hairStyle=o.hairStyle??preset.hairStyle??'close';
  if(hairStyle==='long'){
    const hair=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.079*build,18,12,0,Math.PI*2,0,Math.PI*.7),hairMat),{name:'long_hair_crown'});
    hair.position.set(0,headY+h*.035,-h*.012); hair.scale.set(1.04,1.02,1.09); g.add(hair);
    for(const side of [-1,1]){
      for(let i=0;i<3;i++){
        const x=side*h*(.055+i*.008)*build;
        g.add(curveTube([[x,headY+h*.025,-h*.03],[x+side*h*.018,headY-h*.05,-h*.045],[x+side*h*.012,headY-h*.18,-h*.028]],h*.012,hairMat,18,6,{name:'separate_hair_lock'}));
      }
    }
  } else {
    const hair=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.079*build,18,12,0,Math.PI*2,0,Math.PI*.58),hairMat),{name:'groomed_hair'});
    hair.position.y=headY+h*.04; hair.scale.set(1.03,1,.98); g.add(hair);
    if(hairStyle==='parted'){
      const part=curveTube([[0,headY+h*.112,-h*.04],[h*.012,headY+h*.118,0],[h*.022,headY+h*.1,h*.055]],h*.004,solid(0xc5c1bc,{roughness:.8,macro:false}),12,5,{name:'silver_hair_part'}); g.add(part);
    }
    if(hairStyle==='crown'){
      const crown=new THREE.Mesh(new THREE.TorusGeometry(h*.085,h*.009,7,28),solid(0x9fe8ff,{emissive:0x65cce8,emissiveIntensity:2.5,metalness:.45,roughness:.2,macro:false})); crown.position.y=headY+h*.085; crown.rotation.x=Math.PI/2; g.add(crown);
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2;
        const crystal=finish(new THREE.Mesh(new THREE.OctahedronGeometry(h*.019),solid(0x9fe8ff,{emissive:0x65cce8,emissiveIntensity:3,macro:false})),{name:'crown_crystal',castShadow:false});
        crystal.position.set(Math.cos(a)*h*.083,headY+h*.105,Math.sin(a)*h*.083); g.add(crystal);
      }
    }
  }
  const eyeWhite=solid(0xd9d6cd,{roughness:.38,metalness:0,macro:false});
  const eyeMat=solid(0x151b1f,{roughness:.22,metalness:0,macro:false}); [-1,1].forEach(side=>{
    const sclera=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.0135,9,7),eyeWhite),{name:'eye_sclera',castShadow:false});
    sclera.scale.set(1.18,.68,.5); sclera.position.set(side*h*.03,headY+h*.012,h*.068); g.add(sclera);
    const eye=finish(new THREE.Mesh(new THREE.SphereGeometry(h*.0065,8,6),eyeMat),{name:'iris',castShadow:false}); eye.position.set(side*h*.03,headY+h*.012,h*.078); g.add(eye);
  });
  const nose=finish(new THREE.Mesh(new THREE.ConeGeometry(h*.012,h*.043,8),skin),{name:'nose'});
  nose.rotation.x=Math.PI/2; nose.position.set(0,headY-h*.005,h*.078); g.add(nose);
  const mouth=curveTube([[-h*.018,headY-h*.048,h*.074],[0,headY-h*.052,h*.077],[h*.018,headY-h*.048,h*.074]],h*.0025,solid(0x5a2728,{roughness:.8,macro:false}),8,5,{name:'mouth',castShadow:false}); g.add(mouth);

  if(o.character==='jalen'){
    const beard=curveTube([[-h*.052,headY-h*.04,h*.05],[0,headY-h*.095,h*.058],[h*.052,headY-h*.04,h*.05]],h*.012,hairMat,18,7,{name:'jalen_trimmed_beard'}); g.add(beard);
  }
  if(o.character==='maya'){
    const strap=curveTube([[-h*.105,h*.71,h*.105],[0,h*.56,h*.13],[h*.1,h*.47,h*.105]],h*.012,bootMat,20,7,{name:'maya_field_satchel_strap'}); g.add(strap);
    const pouch=roundedPanel(h*.15,h*.12,h*.055,.025,bootMat,{name:'maya_field_satchel'}); pouch.position.set(h*.13,h*.43,h*.11); g.add(pouch);
  }
  if(o.character==='leo'){
    const badge=finish(new THREE.Mesh(new THREE.OctahedronGeometry(h*.024),metal),{name:'leo_compass_badge'}); badge.scale.y=.7; badge.position.set(-h*.055,h*.64,h*.105); g.add(badge);
  }
  if(o.character==='thorne'){
    const highCollar=roundedPanel(h*.2,h*.09,h*.075,.018,coat,{name:'thorne_high_collar'}); highCollar.position.set(0,h*.79,0); g.add(highCollar);
    const insignia=makeDecal('III',{worldWidth:h*.07,worldHeight:h*.04,color:'#a8b6bd',font:'Arial',fontSize:58,letterSpacing:'2px',name:'thorne_insignia'}); insignia.position.set(h*.055,h*.66,h*.108); g.add(insignia);
  }
  if(o.staff){
    const staffWood=pbr('wood',{color:0x4c392a,span:[.12,h],repeat:[.3,h/.4],roughness:.82,normalStrength:.28});
    const st = cylinderBetween([h*.19,0,0],[h*.19,h*1.08,0],h*.018,staffWood,10,{name:'keeper_staff_shaft'}); g.add(st);
    const cr = finish(new THREE.Mesh(new THREE.OctahedronGeometry(h*.065,1), solid(0x9fe8ff,{physical:true,roughness:.08,transmission:.25,thickness:.2,emissive:0x65cce8,emissiveIntensity:3.5,macro:false})),{name:'keeper_staff_crystal',castShadow:false}); cr.position.set(h*.19,h*1.12,0); g.add(cr);
    for(const side of [-1,1]) g.add(cylinderBetween([h*.19+side*h*.055,h*1.04,0],[h*.19,h*1.12,0],h*.007,metal,7,{name:'staff_crystal_prong'}));
    g.userData.crystal = cr;
  }
  g.userData.character = o.character || 'extra';
  return finishAssembly(g);
}

function jaggedIsland(scale=1){
  const g = new THREE.Group();
  g.name='eroded_chartless_island';
  const rock = pbr('rock',{color:0x59606a,span:[7,14],repeat:[4.7,9.3],roughness:.98,normalStrength:.88,macroAmount:.16,macroScale:.07});
  const darkRock = pbr('rock',{color:0x39434b,span:[4,7],repeat:[2.7,4.7],roughness:1,normalStrength:1,macroAmount:.18,macroScale:.09});
  const sandMat = pbr('sand',{color:0xb5a581,span:[22,22],repeat:[14.7,14.7],roughness:1,normalStrength:.48,macroAmount:.16,macroScale:.06});
  const rocks = [[0,0, 7,16],[6,-3, 5,10],[-6,2, 4.5,8],[2,5, 3,6]];
  for(const [x,z,r,h] of rocks){
    const formation=new THREE.Group(); formation.name='fractured_rock_formation';
    for(let layer=0;layer<4;layer++){
      const m=finish(new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),layer%2?darkRock:rock),{name:'weathered_rock_mass'});
      const k=1-layer*.17;
      m.scale.set(r*k*rand(.72,1.08),h*.23*rand(.82,1.16),r*k*rand(.62,.96));
      m.position.set(rand(-r*.14,r*.14),h*(.2+layer*.2),rand(-r*.12,r*.12));
      m.rotation.set(rand(-.18,.18),rand(0,Math.PI),rand(-.12,.12)); formation.add(m);
      const ledge=finish(new THREE.Mesh(new THREE.CylinderGeometry(r*k*.72,r*k*.8,h*.035,12),darkRock),{name:'erosion_ledge'});
      ledge.position.y=h*(.31+layer*.18); ledge.rotation.y=rand(Math.PI); formation.add(ledge);
    }
    formation.position.set(x*scale,-.7*scale,z*scale); formation.scale.setScalar(scale); g.add(formation);
  }
  const sand = finish(new THREE.Mesh(new THREE.CylinderGeometry(11*scale,13*scale,1.4,64,4), sandMat),{name:'granular_beach_shelf'});
  sand.position.y=-0.4; g.add(sand);
  const shoreline=finish(new THREE.Mesh(new THREE.TorusGeometry(12*scale,.1*scale,8,96),solid(0x4d6061,{roughness:.28,metalness:.05,transparent:true,opacity:.62,macro:false})),{name:'wet_shoreline',castShadow:false});
  shoreline.rotation.x=Math.PI/2; shoreline.position.y=.29; shoreline.scale.z=.84; g.add(shoreline);
  const pebbleGeo=new THREE.DodecahedronGeometry(.12*scale,0);
  const pebbles=new THREE.InstancedMesh(pebbleGeo,darkRock,46); pebbles.name='shore_pebbles';
  const matrix=new THREE.Matrix4(), quat=new THREE.Quaternion(), pos=new THREE.Vector3(), scl=new THREE.Vector3();
  for(let i=0;i<46;i++){
    const a=rand(Math.PI*2),r=rand(7.5,11.5)*scale;
    pos.set(Math.cos(a)*r,.32*scale,Math.sin(a)*r*.84);
    quat.setFromEuler(new THREE.Euler(rand(3),rand(3),rand(3)));
    const size=rand(.45,1.45); scl.set(size,rand(.35,.85),size);
    matrix.compose(pos,quat,scl); pebbles.setMatrixAt(i,matrix);
  }
  pebbles.castShadow=pebbles.receiveShadow=true; g.add(pebbles);
  return finishAssembly(g);
}

function mahoganyTree(){
  const g = new THREE.Group();
  g.name='grandma_debbies_centuries_old_mahogany';
  const bark = pbr('wood',{albedo:false,color:0x513727,span:[1.8,5],repeat:[.9,6.25],roughness:1,normalStrength:.88,macroAmount:.14,macroScale:.18});
  const darkBark = pbr('wood',{albedo:false,color:0x2f251d,span:[.8,3],repeat:[.4,3.75],roughness:1,normalStrength:.76,macroAmount:.17,macroScale:.2});
  const trunk = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.58,1.08,4.9,18,9), bark),{name:'buttressed_mahogany_trunk'});
  trunk.position.y=2.45; g.add(trunk);
  for(let i=0;i<9;i++){
    const a = i/9*Math.PI*2+rand(-.12,.12);
    g.add(curveTube([
      [Math.cos(a)*.38,.85,Math.sin(a)*.38],
      [Math.cos(a)*1.0,.34,Math.sin(a)*1.0],
      [Math.cos(a)*rand(1.8,2.6),.06,Math.sin(a)*rand(1.8,2.6)]
    ],rand(.11,.19),i%2?darkBark:bark,28,9,{name:'surface_root'}));
  }
  const leafMat = solid(0x245a34,{roughness:.92,metalness:0,side:THREE.DoubleSide,macroAmount:.1,macroScale:.4});
  const leafDark = solid(0x173b25,{roughness:.96,metalness:0,side:THREE.DoubleSide,macroAmount:.12,macroScale:.45});
  const tips = [];
  for(let i=0;i<7;i++){
    const a = i/7*Math.PI*2 + 0.5, tip=new THREE.Vector3(Math.cos(a)*rand(3.0,4.2),rand(6.3,7.6),Math.sin(a)*rand(3.0,4.2));
    const shoulder=new THREE.Vector3(Math.cos(a)*.32,4.25+rand(-.25,.4),Math.sin(a)*.32);
    const elbow=new THREE.Vector3(Math.cos(a)*1.75,5.45+rand(-.3,.45),Math.sin(a)*1.75);
    g.add(curveTube([shoulder,elbow,tip],rand(.15,.24),i%2?darkBark:bark,34,10,{name:'primary_branch'}));
    for(const side of [-1,1]){
      const branchTip=tip.clone().add(new THREE.Vector3(Math.cos(a+side*.65)*1.4,rand(.2,.8),Math.sin(a+side*.65)*1.4));
      g.add(curveTube([elbow.clone().lerp(tip,.55),branchTip],rand(.06,.11),bark,22,8,{name:'secondary_branch'}));
      tips.push(branchTip.toArray());
    }
    tips.push(tip.toArray());
  }
  tips.push([0,8.6,0]);
  const leafGeo=new THREE.IcosahedronGeometry(.27,1);
  const leafClusters=[new THREE.InstancedMesh(leafGeo,leafMat,320),new THREE.InstancedMesh(leafGeo,leafDark,180)];
  const matrices=[new THREE.Matrix4(),new THREE.Matrix4()];
  const counts=[0,0];
  for(let clusterIndex=0;clusterIndex<tips.length;clusterIndex++){
    const [x,y,z]=tips[clusterIndex];
    const count=clusterIndex===tips.length-1?18:10+Math.floor(rand(7));
    for(let i=0;i<count;i++){
      const set=(i+clusterIndex)%3===0?1:0;
      const p=new THREE.Vector3(x+rand(-1.35,1.35),y+rand(-.75,.85),z+rand(-1.35,1.35));
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(3),rand(3),rand(3)));
      const sc=rand(.65,1.35); const s=new THREE.Vector3(sc,rand(.35,.75)*sc,sc);
      matrices[set].compose(p,q,s); leafClusters[set].setMatrixAt(counts[set]++,matrices[set]);
    }
  }
  leafClusters.forEach((leaves,i)=>{
    leaves.count=counts[i]; leaves.name=i?'deep_canopy_leaves':'sunlit_canopy_leaves'; leaves.castShadow=leaves.receiveShadow=true; g.add(leaves);
  });
  const lightningScar=curveTube([[.62,1.1,.65],[.48,2.4,.78],[.55,3.75,.58]],.035,solid(0x17120e,{roughness:1,macro:false}),18,6,{name:'old_lightning_scar'}); g.add(lightningScar);
  return finishAssembly(g);
}

function fireflies(n, area, color=0xbfffc9, y=[0.5,5]){
  const pos = new Float32Array(n*3);
  for(let i=0;i<n;i++){
    pos[i*3]=rand(-area,area); pos[i*3+1]=rand(y[0],y[1]); pos[i*3+2]=rand(-area,area);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const m = new THREE.PointsMaterial({size:.14, map:GLOW_TEX, color, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, opacity:.9});
  return new THREE.Points(g,m);
}

function lockboxNecklace(o={}){
  const g = new THREE.Group();
  g.name='1708_lockbox_and_Weaver';
  const wood=pbr('wood',{color:0x8a6040,span:[.9,.6],repeat:[.45,.3],roughness:.84,normalStrength:.45,macroAmount:.09,macroScale:.7});
  const oldIron=pbr('corrodedMetal',{albedo:false,color:0x514a41,span:[.9,.55],repeat:[.45,.28],roughness:.72,metalness:.72,normalStrength:.42,macroAmount:.12,macroScale:.8});
  const silver=solid(0xbac5cf,{physical:true,roughness:.24,metalness:.92,clearcoat:.32,clearcoatRoughness:.12});
  const velvet=solid(0x261b2d,{roughness:.98,metalness:0,macroAmount:.08,macroScale:1.4});
  const body=roundedPanel(.92,.43,.61,.065,wood,{name:'mortised_lockbox_body',edgeColor:0xc49a72,edgeOpacity:.1});
  body.position.y=.23; g.add(body);
  const lining=roundedPanel(.76,.44,.028,.06,velvet,{name:'velvet_inner_lining'});
  lining.rotation.x=-Math.PI/2; lining.position.set(0,.47,.015); g.add(lining);
  for(const x of [-.36,0,.36]){
    const band=finish(new THREE.Mesh(new THREE.BoxGeometry(.065,.47,.64),oldIron),{name:'forged_lockbox_band',edgeColor:0xc2b099,edgeOpacity:.1});
    band.position.set(x,.25,0); g.add(band);
    addRivetLine(g,[x,.09,.318],[x,.4,.318],3,silver,.018);
  }
  const lowerBand=finish(new THREE.Mesh(new THREE.BoxGeometry(.94,.065,.64),oldIron),{name:'forged_base_band'});
  lowerBand.position.y=.055; g.add(lowerBand);
  for(const x of [-.43,.43]) for(const y of [.08,.42]) for(const z of [-.29,.29]){
    const corner=finish(new THREE.Mesh(new THREE.SphereGeometry(.052,10,7),oldIron),{name:'hammered_corner_guard'});
    corner.scale.set(1,.82,1); corner.position.set(x,y,z); g.add(corner);
  }
  const hingeMat=oldIron;
  for(const x of [-.28,.28]){
    const hinge=cylinderBetween([x-.1,.46,-.322],[x+.1,.46,-.322],.035,hingeMat,12,{name:'working_barrel_hinge'}); g.add(hinge);
  }
  const lidPivot=new THREE.Group(); lidPivot.name='hinged_lockbox_lid'; lidPivot.position.set(0,.45,-.3);
  const lidPanel=roundedPanel(.92,.16,.61,.065,wood,{name:'reinforced_lid_panel',edgeColor:0xc49a72,edgeOpacity:.11});
  lidPanel.position.set(0,.08,.3); lidPivot.add(lidPanel);
  const lidLining=roundedPanel(.76,.42,.025,.055,velvet,{name:'lid_velvet_lining'});
  lidLining.rotation.x=-Math.PI/2; lidLining.position.set(0,-.012,.31); lidPivot.add(lidLining);
  for(const x of [-.36,0,.36]){
    const band=finish(new THREE.Mesh(new THREE.BoxGeometry(.06,.175,.635),oldIron),{name:'lid_reinforcement_band'});
    band.position.set(x,.08,.3); lidPivot.add(band);
  }
  g.add(lidPivot);
  const latchPlate=roundedPanel(.18,.2,.035,.025,oldIron,{name:'forged_latch_plate',edgeColor:0xc2b099,edgeOpacity:.12});
  latchPlate.position.set(0,.29,.323); g.add(latchPlate);
  const latchRing=new THREE.Mesh(new THREE.TorusGeometry(.055,.014,8,18),silver); latchRing.position.set(0,.28,.35); g.add(latchRing);
  addRivetLine(g,[-.065,.34,.345],[.065,.34,.345],2,silver,.015);
  const date=makeDecal('1708',{worldWidth:.26,worldHeight:.09,color:'#d1b489',font:'Georgia',fontSize:58,letterSpacing:'3px',opacity:.82,name:'hand_engraved_1708_decal'});
  date.position.set(.23,.24,.326); g.add(date);

  const chainGroup=new THREE.Group(); chainGroup.name='individually_linked_silver_chain';
  const linkGeo=new THREE.TorusGeometry(.027,.0055,7,14);
  for(let i=0;i<32;i++){
    const a=i/32*Math.PI*2;
    const link=finish(new THREE.Mesh(linkGeo,silver),{name:'silver_chain_link',castShadow:false});
    link.position.set(Math.cos(a)*.27,Math.sin(a*2)*.015,Math.sin(a)*.15);
    if(i%2) link.rotation.set(Math.PI/2,a,0); else link.rotation.set(0,a,0);
    chainGroup.add(link);
  }
  g.add(chainGroup);
  const pendant=new THREE.Group(); pendant.name='Weaver_pendant_assembly';
  const bezel=new THREE.Mesh(new THREE.TorusGeometry(.09,.013,10,30),silver); pendant.add(bezel);
  const cradle=finish(new THREE.Mesh(new THREE.CylinderGeometry(.074,.082,.028,12),silver),{name:'gemstone_cradle'});
  cradle.rotation.x=Math.PI/2; cradle.position.z=-.012; pendant.add(cradle);
  const gemMat=solid(0x315dff,{physical:true,roughness:.08,metalness:.08,transmission:.3,thickness:.25,ior:1.58,attenuationColor:0x1837a8,attenuationDistance:.5,emissive:0x173bc4,emissiveIntensity:2.8,clearcoat:1,clearcoatRoughness:.04,macro:false});
  const gem = finish(new THREE.Mesh(new THREE.OctahedronGeometry(.072,2),gemMat),{name:'dark_blue_Weaver_gem',castShadow:false});
  gem.scale.set(.82,1.08,.55); gem.position.z=.018; pendant.add(gem);
  const core=finish(new THREE.Mesh(new THREE.OctahedronGeometry(.035,1),solid(0x6ea2ff,{emissive:0x3f7dff,emissiveIntensity:6,transparent:true,opacity:.75,roughness:.1,macro:false})),{name:'Weaver_inner_light',castShadow:false});
  core.position.z=.03; pendant.add(core);
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2;
    pendant.add(cylinderBetween([Math.cos(a)*.072,Math.sin(a)*.072,.025],[Math.cos(a)*.086,Math.sin(a)*.086,.04],.005,silver,6,{name:'gemstone_prong',castShadow:false}));
  }
  const sigil=makeDecal('≋',{worldWidth:.055,worldHeight:.055,color:'#b9d7ff',font:'Arial',fontSize:76,opacity:.9,name:'Weaver_micro_sigil'});
  sigil.position.z=.064; pendant.add(sigil);
  pendant.position.set(0,.67,.18); g.add(pendant);
  const chainDrop=curveTube([[-.17,.57,.15],[-.08,.62,.17],[0,.67,.18],[.08,.62,.17],[.17,.57,.15]],.006,silver,24,7,{name:'pendant_chain_drop',castShadow:false}); g.add(chainDrop);
  const halo = glow(0x3f7dff, 1.05, .8); halo.position.set(0,.68,.2);
  const light = new THREE.PointLight(0x3f7dff, 3.2, 9, 2); light.position.set(0,.78,.35);
  g.add(halo,light);
  const setOpen=amount=>{
    const k=THREE.MathUtils.clamp(amount,0,1);
    lidPivot.rotation.x=-1.02*k;
    pendant.position.y=.54+k*.13;
    chainGroup.position.y=.48+k*.08;
    halo.position.y=.55+k*.13;
    light.position.y=.64+k*.14;
  };
  setOpen(o.open===false?0:1);
  g.userData = {gem, core, halo, light, lid:lidPivot, pendant, chain:chainGroup, setOpen};
  g.scale.setScalar(o.scale??.72);
  return finishAssembly(g);
}

function skeleton(){
  const g = new THREE.Group();
  g.name='1708_castaway_skeleton';
  const bone = solid(0xd7d0bd,{roughness:.92,metalness:0,macroAmount:.09,macroScale:1.8});
  const darkBone=solid(0x8b826f,{roughness:.98,metalness:0,macroAmount:.12,macroScale:1.6});
  const voidMat=solid(0x151514,{roughness:1,metalness:0,macro:false});
  const sand=pbr('sand',{color:0xaa9875,span:[3,2],repeat:[2,1.35],roughness:1,normalStrength:.52,macroAmount:.14,macroScale:.2});
  const mound=finish(new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),sand),{name:'partially_buried_sand_mound'});
  mound.scale.set(1.65,.28,1.05); mound.position.set(-.15,-.17,0); g.add(mound);
  const cranium=finish(new THREE.Mesh(new THREE.SphereGeometry(.17,20,14),bone),{name:'weathered_cranium'});
  cranium.position.set(.94,.15,0); cranium.scale.set(1,.9,.88); g.add(cranium);
  const jaw=finish(new THREE.Mesh(new THREE.SphereGeometry(.12,14,9,0,Math.PI*2,Math.PI*.43,Math.PI*.5),darkBone),{name:'separate_mandible'});
  jaw.position.set(1.02,.095,.018); jaw.scale.set(1,.62,.85); g.add(jaw);
  for(const z of [-.065,.065]){
    const socket=finish(new THREE.Mesh(new THREE.SphereGeometry(.044,10,7),voidMat),{name:'eye_socket',castShadow:false});
    socket.position.set(1.065,.18,z); socket.scale.set(.45,1,1); g.add(socket);
  }
  const noseVoid=finish(new THREE.Mesh(new THREE.ConeGeometry(.024,.055,8),voidMat),{name:'nasal_cavity',castShadow:false});
  noseVoid.rotation.z=-Math.PI/2; noseVoid.position.set(1.09,.13,0); g.add(noseVoid);
  const spinePts=[];
  for(let i=0;i<9;i++){
    const x=.72-i*.13,y=.11+Math.sin(i*.55)*.018;
    spinePts.push([x,y,0]);
    const vertebra=finish(new THREE.Mesh(new THREE.SphereGeometry(.036,10,7),i%3?bone:darkBone),{name:'individual_vertebra'});
    vertebra.scale.set(1.1,.72,.86); vertebra.position.set(x,y,0); g.add(vertebra);
  }
  for(let i=0;i<6;i++){
    const radius=.2-i*.014;
    for(const side of [-1,1]){
      const rib=new THREE.Mesh(new THREE.TorusGeometry(radius,.014,7,18,Math.PI*.86),bone);
      rib.position.set(.59-i*.105,.13,0); rib.rotation.set(0,side*Math.PI/2,side*Math.PI*.08); rib.scale.set(1,1,side); g.add(rib);
    }
  }
  const sternum=cylinderBetween([.64,.13,0],[.08,.1,0],.018,darkBone,8,{name:'sternum'}); g.add(sternum);
  const pelvis=new THREE.Mesh(new THREE.TorusGeometry(.18,.036,9,24,Math.PI*1.55),bone);
  pelvis.position.set(-.45,.1,0); pelvis.rotation.y=Math.PI/2; pelvis.scale.set(1,.72,1); g.add(pelvis);
  const joints=[];
  const addBone=(a,b,r=.025,name='long_bone')=>{
    g.add(cylinderBetween(a,b,r,bone,9,{name}));
    joints.push(a,b);
  };
  addBone([.5,.1,-.16],[.14,.08,-.43],.025,'humerus');
  addBone([.14,.08,-.43],[-.22,.06,-.62],.021,'radius');
  addBone([.52,.1,.17],[.28,.08,.44],.025,'humerus');
  addBone([.28,.08,.44],[-.05,.06,.68],.021,'ulna');
  addBone([-.47,.09,-.1],[-.94,.05,-.22],.036,'femur');
  addBone([-.94,.05,-.22],[-1.44,.025,-.31],.027,'tibia');
  addBone([-.47,.09,.1],[-.88,.04,.25],.036,'femur');
  addBone([-.88,.04,.25],[-1.35,.02,.44],.027,'tibia');
  joints.forEach((p,i)=>{
    if(i%2) return;
    const joint=finish(new THREE.Mesh(new THREE.SphereGeometry(.036,9,7),darkBone),{name:'exposed_joint'}); joint.position.set(...p); g.add(joint);
  });
  for(let hand=0;hand<2;hand++){
    const start=hand?new THREE.Vector3(-.05,.06,.68):new THREE.Vector3(-.22,.06,-.62);
    for(let i=0;i<5;i++){
      const dir=new THREE.Vector3(-.14,rand(-.025,.025),(hand?1:-1)*(.035+i*.025));
      g.add(cylinderBetween(start.clone().add(new THREE.Vector3(0,0,(i-2)*.018)),start.clone().add(dir),.006,bone,6,{name:'finger_bone'}));
    }
  }
  const chainMat=solid(0x9da8b0,{roughness:.38,metalness:.88});
  const chain=curveTube([[-.18,.09,-.6],[-.05,.13,-.48],[.08,.08,-.4],[.17,.06,-.32]],.009,chainMat,20,7,{name:'chain_wrapped_around_brittle_fingers'}); g.add(chain);
  const pendant=new THREE.Mesh(new THREE.OctahedronGeometry(.045,1),solid(0x264eac,{emissive:0x173a8c,emissiveIntensity:.55,roughness:.2,macro:false}));
  pendant.position.set(.18,.075,-.31); g.add(pendant);
  const tatters=finish(new THREE.Mesh(new THREE.PlaneGeometry(.65,.42,4,3),pbr('leather',{albedo:false,color:0x493b30,span:[.65,.42],repeat:[1.6,1.05],roughness:1,normalStrength:.2,side:THREE.DoubleSide,transparent:true,opacity:.78})),{name:'salt_rotted_cloth'});
  tatters.rotation.x=-Math.PI/2; tatters.rotation.z=.18; tatters.position.set(-.15,.055,.02); g.add(tatters);
  return finishAssembly(g);
}

function spiralSigil(radius=2.4, turns=3, color=0x9fd8ff){
  const pts = [];
  const N = 220;
  for(let i=0;i<=N;i++){
    const k = i/N, th = k*turns*Math.PI*2, r = radius*k;
    pts.push(V3(Math.cos(th)*r, Math.sin(th)*r, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const mat = ()=>basic(color,{transparent:true, opacity:.95, blending:THREE.AdditiveBlending, depthWrite:false});
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 260, radius*0.014, 6, false), mat());
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius*1.06, radius*0.014, 6, 80), mat());
  const core = new THREE.Mesh(new THREE.CircleGeometry(radius*0.09, 20), basic(0x05070c));
  const g = new THREE.Group(); g.add(tube,ring,core);
  return g;
}

function ghostShip(scale=1, op=0.2){
  const g = sailboat({scale, hull:0x7fd4e8, sail:0x7fd4e8});
  g.traverse(m=>{
    if(m.isMesh){ m.material = new THREE.MeshBasicMaterial({color:0x86d9ec, transparent:true,
      opacity:op, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}); }
  });
  return g;
}

function fractureRing(radius=16){
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius*0.03, 10, 90),
    basic(0xaee6ff,{transparent:true, opacity:.95, blending:THREE.AdditiveBlending, depthWrite:false}));
  const u = { uTime:{value:0} };
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius*0.96, 64), new THREE.ShaderMaterial({
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide,
    uniforms:u,
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:[
      'uniform float uTime; varying vec2 vUv;',
      'void main(){',
      ' float r = length(vUv); float a = atan(vUv.y, vUv.x);',
      ' float sw = sin(a*4.0 + r*14.0 - uTime*1.6)*0.5+0.5;',
      ' float sw2 = sin(a*7.0 - r*22.0 + uTime*2.3)*0.5+0.5;',
      ' vec3 c = mix(vec3(0.05,0.15,0.3), vec3(0.55,0.85,1.0), sw)*0.8;',
      ' c += vec3(0.3,0.9,0.8)*sw2*0.25;',
      ' float alpha = smoothstep(1.0,0.85,r)* (0.25 + sw*0.5);',
      ' gl_FragColor = vec4(c, alpha); }'
    ].join('\n')
  }));
  const halo = glow(0x9fe0ff, radius*3.4, .5);
  g.add(ring, disc, halo);
  g.userData.tick = t=>{ u.uTime.value=t; ring.rotation.z=t*0.12; };
  return g;
}

function sandIsland(){
  const g = new THREE.Group();
  g.name='Heart_of_Shifting_Sands_island';
  const base = finish(new THREE.Mesh(new THREE.CylinderGeometry(13,15,1.6,72,5), pbr('sand',{color:0xc7ad76,span:[26,26],repeat:[17.3,17.3],roughness:1,normalStrength:.55,macroAmount:.14,macroScale:.06})),{name:'physically_scaled_sand_shelf'});
  base.position.y=-0.25; g.add(base);
  const u = { uTime:{value:0} };
  const top = new THREE.Mesh(new THREE.CircleGeometry(12.6, 64), new THREE.ShaderMaterial({
    uniforms:u,
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:[
      'uniform float uTime; varying vec2 vUv;',
      'void main(){',
      ' float r = length(vUv); float a = atan(vUv.y,vUv.x);',
      ' vec3 sand = vec3(0.62,0.52,0.33);',
      ' float rings = smoothstep(0.06,0.0,abs(sin(r*16.0 - uTime*0.5))*0.14 - 0.045);',
      ' float sect = smoothstep(0.05,0.0,abs(sin(a*6.0 + r*4.0 + uTime*0.22))*0.12 - 0.03);',
      ' vec3 c = sand + vec3(1.0,0.85,0.45)*rings*0.9 + vec3(0.4,0.9,0.95)*sect*0.55;',
      ' c *= smoothstep(1.02,0.9,r)*0.9+0.25;',
      ' gl_FragColor = vec4(c,1.0); }'
    ].join('\n')
  }));
  top.rotation.x=-Math.PI/2; top.position.y=0.56;
  g.add(top);
  g.userData.tick = t=>{ u.uTime.value=t; };
  return g;
}

function cliffsRing(){
  const g = new THREE.Group();
  g.name='Heart_of_the_Tides_cliff_ring';
  const rock = pbr('rock',{color:0x64777b,span:[12,28],repeat:[8,18.7],roughness:1,normalStrength:1,macroAmount:.2,macroScale:.035});
  const strata=pbr('rock',{color:0x40545a,span:[10,2],repeat:[6.7,1.3],roughness:1,normalStrength:.82,macroAmount:.18,macroScale:.05});
  for(let i=0;i<11;i++){
    const a = i/11*Math.PI*2 + rand(0.2);
    const r = rand(48,62), h = rand(18,34), w = rand(7,13);
    const formation=new THREE.Group(); formation.name='layered_tidal_cliff';
    for(let layer=0;layer<4;layer++){
      const m=finish(new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),rock),{name:'fractured_cliff_mass'});
      const k=1-layer*.13;
      m.scale.set(w*k*rand(.75,1.05),h*.22*rand(.9,1.15),w*k*rand(.58,.88));
      m.position.y=h*(.18+layer*.21)-2; m.position.x=rand(-w*.12,w*.12); m.position.z=rand(-w*.1,w*.1); m.rotation.y=rand(Math.PI); formation.add(m);
      const shelf=finish(new THREE.Mesh(new THREE.CylinderGeometry(w*k*.7,w*k*.8,h*.025,14),strata),{name:'horizontal_erosion_stratum'});
      shelf.position.y=h*(.29+layer*.2)-2; shelf.rotation.y=rand(Math.PI); formation.add(shelf);
    }
    formation.position.set(Math.cos(a)*r,0,Math.sin(a)*r); formation.rotation.y=-a+rand(-.2,.2); g.add(formation);
    const mist = glow(0x8fd8d0, rand(14,24), .12);
    mist.position.set(Math.cos(a)*(r-8), 1.5, Math.sin(a)*(r-8));
    g.add(mist);
  }
  return finishAssembly(g);
}

function boltLine(from, to, color=0xd8ecff, jag=1.4){
  const N = 9, pts = [];
  const dir = to.clone().sub(from);
  for(let i=0;i<=N;i++){
    const k = i/N;
    const p = from.clone().add(dir.clone().multiplyScalar(k));
    if(i>0&&i<N){ p.x+=rand(-jag,jag); p.z+=rand(-jag,jag); p.y+=rand(-jag,jag)*0.5; }
    pts.push(p);
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({color, transparent:true, opacity:.95,
    blending:THREE.AdditiveBlending, depthWrite:false}));
}

function rainField(n=600, area=60, height=30){
  const pos = new Float32Array(n*3);
  for(let i=0;i<n;i++){ pos[i*3]=rand(-area,area); pos[i*3+1]=rand(0,height); pos[i*3+2]=rand(-area,area); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const m = new THREE.PointsMaterial({size:.09, color:0x9fb8cc, transparent:true, opacity:.55, depthWrite:false});
  const p = new THREE.Points(g,m);
  p.userData = {area, height};
  return p;
}

function dockAssembly(width, depth, o={}){
  const g=new THREE.Group(); g.name=o.name||'mortise_and_tenon_dock';
  const plankMat=pbr('wood',{color:o.color??0x806248,span:[width,depth],repeat:[width/2,depth/2],roughness:.96,normalStrength:.58,macroAmount:.13,macroScale:.12});
  const beamMat=pbr('wood',{albedo:false,color:0x473528,span:[width,1],repeat:[width/2,.5],roughness:1,normalStrength:.48,macroAmount:.15,macroScale:.15});
  const iron=solid(0x42464a,{roughness:.58,metalness:.78});
  const boardDepth=.42;
  const boardGeo=new THREE.BoxGeometry(width-.16,.16,boardDepth-.035);
  const rows=Math.floor(depth/boardDepth);
  for(let i=0;i<rows;i++){
    const board=finish(new THREE.Mesh(boardGeo,plankMat),{name:'individual_weathered_dock_plank',edgeColor:0xd2b28c,edgeOpacity:.07});
    board.position.set(rand(-.015,.015),.56,-depth/2+boardDepth*.5+i*boardDepth);
    board.rotation.y=rand(-.002,.002); board.rotation.z=rand(-.003,.003); g.add(board);
  }
  for(const z of [-depth*.38,0,depth*.38]){
    const beam=finish(new THREE.Mesh(new THREE.BoxGeometry(width,.24,.24),beamMat),{name:'under_deck_crossbeam'});
    beam.position.set(0,.4,z); g.add(beam);
  }
  const pilingXs=[];
  for(let x=-width*.44;x<=width*.44;x+=Math.max(3.1,width/5)) pilingXs.push(x);
  for(const x of pilingXs) for(const z of [-depth*.46,depth*.46]){
    const post=finish(new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,1.9,12),beamMat),{name:'salt_worn_piling'});
    post.position.set(x,-.12,z); post.rotation.z=rand(-.025,.025); g.add(post);
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.17,.025,7,18),iron); collar.rotation.x=Math.PI/2; collar.position.set(x,.66,z); g.add(collar);
  }
  for(const x of [-width*.34,width*.34]){
    const cleatBase=roundedPanel(.34,.11,.055,.025,iron,{name:'mooring_cleat_base'}); cleatBase.rotation.x=-Math.PI/2; cleatBase.position.set(x,.68,depth*.28); g.add(cleatBase);
    const cleat=cylinderBetween([x-.14,.73,depth*.28],[x+.14,.73,depth*.28],.035,iron,8,{name:'mooring_cleat'}); g.add(cleat);
  }
  return finishAssembly(g);
}

function portBuilding(o={}){
  const w=o.w??5,h=o.h??3.8,d=o.d??3.2;
  const g=new THREE.Group(); g.name=o.name||'assembled_caribbean_port_building';
  const wall=pbr('plaster',{color:o.wall??0x8d735d,span:[w,h],repeat:[w/2,h/2],roughness:.96,normalStrength:.42,macroAmount:.13,macroScale:.12,side:o.inside?THREE.BackSide:THREE.FrontSide});
  const timber=pbr('wood',{albedo:false,color:o.timber??0x4c3527,span:[w,h],repeat:[w/2,h/2],roughness:.94,normalStrength:.42,macroAmount:.14,macroScale:.15});
  const stone=pbr('stone',{color:0x756a60,span:[w,.5],repeat:[w/2,.25],roughness:.95,normalStrength:.55,macroAmount:.14,macroScale:.16});
  const roofMat=pbr('wood',{color:o.roof??0x5e4534,span:[w,d],repeat:[w/2,d/2],roughness:1,normalStrength:.5,macroAmount:.16,macroScale:.13});
  const core=finish(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wall),{name:'lime_plaster_wall_volume',edgeColor:0xbaa087,edgeOpacity:.06});
  core.position.y=h/2; g.add(core);
  const foundation=finish(new THREE.Mesh(new THREE.BoxGeometry(w+.18,.42,d+.18),stone),{name:'stone_foundation_course'});
  foundation.position.y=.21; g.add(foundation);
  const beam=.13;
  for(const x of [-w/2,w/2]) for(const z of [-d/2,d/2]){
    const post=finish(new THREE.Mesh(new THREE.BoxGeometry(beam,h+.2,beam),timber),{name:'exposed_corner_post',edgeColor:0xb68c65,edgeOpacity:.09});
    post.position.set(x,h/2,z); g.add(post);
  }
  for(const y of [.5,h*.52,h-.15]){
    const frontBeam=finish(new THREE.Mesh(new THREE.BoxGeometry(w+.12,beam,beam),timber),{name:'facade_tie_beam'}); frontBeam.position.set(0,y,d/2+.02); g.add(frontBeam);
    const backBeam=frontBeam.clone(); backBeam.position.z=-d/2-.02; g.add(backBeam);
  }
  const roofAngle=Math.atan2(d*.33,d*.5),slope=Math.hypot(d*.52,d*.34);
  for(const side of [-1,1]){
    const roof=finish(new THREE.Mesh(new THREE.BoxGeometry(w+.6,.13,slope+.14),roofMat),{name:'separate_roof_plane',edgeColor:0x9a7355,edgeOpacity:.08});
    roof.rotation.x=side*roofAngle; roof.position.set(0,h+d*.17,side*d*.255); g.add(roof);
  }
  const ridge=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,w+.68,10),timber); ridge.rotation.z=Math.PI/2; ridge.position.set(0,h+d*.34,0); g.add(ridge);
  const windowMat=solid(o.lit===false?0x17222b:0xffbd68,{roughness:.22,metalness:.12,emissive:o.lit===false?0x05080a:0xff8b32,emissiveIntensity:o.lit===false?.15:2.1,macro:false});
  const windowCount=o.distant?Math.max(1,Math.floor(w/2.3)):Math.max(2,Math.floor(w/2));
  const stories=h>4.6?2:1;
  for(let story=0;story<stories;story++){
    const y=h*(stories===1?.54:(.32+story*.38));
    for(let i=0;i<windowCount;i++){
      const x=windowCount===1?0:-w*.34+i*(w*.68/(windowCount-1));
      const frame=roundedPanel(o.distant?.48:.72,o.distant?.58:.88,.055,.06,timber,{name:'timber_window_frame'});
      frame.position.set(x,y,d/2+.06); g.add(frame);
      const pane=roundedPanel(o.distant?.33:.5,o.distant?.43:.65,.022,.035,windowMat,{name:'glazed_window',castShadow:false}); pane.position.set(x,y,d/2+.095); g.add(pane);
      if(!o.distant){
        const mullion=finish(new THREE.Mesh(new THREE.BoxGeometry(.035,.65,.025),timber),{name:'window_mullion'}); mullion.position.set(x,y,d/2+.115); g.add(mullion);
        for(const shutterSide of [-1,1]){
          const shutter=roundedPanel(.18,.68,.04,.025,roofMat,{name:'hinged_timber_shutter'}); shutter.position.set(x+shutterSide*.42,y,d/2+.08); shutter.rotation.y=shutterSide*.24; g.add(shutter);
        }
      }
    }
  }
  if(!o.distant){
    const door=roundedPanel(.9,1.78,.07,.08,timber,{name:'braced_entry_door',edgeColor:0xba8a64,edgeOpacity:.1}); door.position.set(-w*.28,.9,d/2+.075); g.add(door);
    const braceA=finish(new THREE.Mesh(new THREE.BoxGeometry(.06,1.7,.04),stone),{name:'door_iron_brace'}); braceA.position.set(-w*.28,.9,d/2+.125); braceA.rotation.z=.42; g.add(braceA);
    const knob=finish(new THREE.Mesh(new THREE.SphereGeometry(.045,10,7),solid(0x8f744d,{roughness:.3,metalness:.78})),{name:'door_hardware'}); knob.position.set(-w*.08,.9,d/2+.16); g.add(knob);
  }
  if(o.sign){
    const sign=textPlane(o.sign,Math.min(3.7,w*.64)); sign.position.set(0,h*.78,d/2+.14); g.add(sign);
    const bracketMat=solid(0x3a3430,{roughness:.56,metalness:.82});
    for(const x of [-w*.23,w*.23]) g.add(cylinderBetween([x,h*.82,d/2],[x,h*.92,d/2+.24],.018,bracketMat,7,{name:'forged_sign_bracket'}));
  }
  return finishAssembly(g);
}

function seekerChamberShell(radius=17,height=14){
  const g=new THREE.Group(); g.name='mechanically_assembled_Seeker_chamber';
  const wallMat=pbr('plaster',{color:0x596070,span:[radius*2,height],repeat:[radius,height/2],roughness:.94,normalStrength:.5,macroAmount:.14,macroScale:.08,side:THREE.BackSide});
  const floorMat=pbr('stone',{color:0x5c6370,span:[radius*2,radius*2],repeat:[radius,radius],roughness:.82,normalStrength:.56,macroAmount:.1,macroScale:.1});
  const iron=pbr('corrodedMetal',{albedo:false,color:0x39434d,span:[height,1],repeat:[height/2,.5],roughness:.55,metalness:.78,normalStrength:.35,macroAmount:.12,macroScale:.1});
  const bronze=solid(0x7b633b,{roughness:.42,metalness:.84});
  const wall=finish(new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,48,2,true),wallMat),{name:'segmented_masonry_chamber_wall',castShadow:false});
  wall.position.y=height*.43; g.add(wall);
  const floor=finish(new THREE.Mesh(new THREE.CircleGeometry(radius,72),floorMat),{name:'laid_stone_chamber_floor'}); floor.rotation.x=-Math.PI/2; g.add(floor);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;
    const rib=finish(new THREE.Mesh(new THREE.BoxGeometry(.28,height*.88,.44),iron),{name:'bolted_vertical_wall_rib',edgeColor:0x82909a,edgeOpacity:.11});
    rib.position.set(Math.cos(a)*(radius-.18),height*.44,Math.sin(a)*(radius-.18)); rib.rotation.y=-a; g.add(rib);
    addRivetLine(g,
      [Math.cos(a)*(radius-.42),.5,Math.sin(a)*(radius-.42)],
      [Math.cos(a)*(radius-.42),height*.84,Math.sin(a)*(radius-.42)],
      8,bronze,.035);
  }
  for(const y of [.28,height*.43,height*.82]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius-.34,.12,9,96),iron); ring.rotation.x=Math.PI/2; ring.position.y=y; g.add(ring);
  }
  for(let i=0;i<5;i++){
    const a=-1.2+i*.58;
    const pipe=curveTube([
      [Math.cos(a)*(radius-.55),.2,Math.sin(a)*(radius-.55)],
      [Math.cos(a)*(radius-.65),height*.38,Math.sin(a)*(radius-.65)],
      [Math.cos(a+.2)*(radius-.65),height*.68,Math.sin(a+.2)*(radius-.65)]
    ],.07,bronze,42,9,{name:'surface_routed_conduit'}); g.add(pipe);
  }
  const serviceRing=new THREE.Mesh(new THREE.TorusGeometry(4.2,.08,8,72),bronze); serviceRing.rotation.x=Math.PI/2; serviceRing.position.y=.035; g.add(serviceRing);
  return finishAssembly(g);
}

/* ============ SCENES ============ */
/* Ch.1 — Rum and Regret in Rosetown */
function buildS1(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x181226, fogNear:30, fogFar:230, hemiSky:0x3a2f4a, hemiGnd:0x141018, hemiI:.6,
    dir:[30,14,40], dirColor:0xffb887, dirI:.5});
  scene.add(skyDome(0x170f2e, 0x8a4a3c, 0x0c0a12));
  scene.add(starField(500));
  scene.add(moon(-46,16,-110,3.2,0xf4d9a8));
  const water = makeWater({deep:0x0a1c2c, shallow:0x1d4750, amp:.12, fogColor:0x181226, fogFar:230,
    sunDir:[-0.4,0.25,-0.8], sunColor:0xffd9a0, sparkle:.12});
  scene.add(water);
  const dock = dockAssembly(14,9,{name:'Rosetown_Rusty_Anchor_dock',color:0x7f6046});
  const tav = portBuilding({w:7,h:3.9,d:5.4,wall:0x9a7658,timber:0x4f3727,roof:0x553a2a,sign:'THE RUSTY ANCHOR',name:'Rusty_Anchor_tavern'});
  tav.position.set(0,.66,-2.2); dock.add(tav);
  const lampLights = [];
  for(const lx of [-5.6,5.6]){
    const lampIron=solid(0x292827,{roughness:.58,metalness:.82});
    dock.add(cylinderBetween([lx,.68,4],[lx,3.2,4],.055,lampIron,10,{name:'forged_lamp_post'}));
    dock.add(cylinderBetween([lx,3.18,4],[lx+.32,3.18,4],.035,lampIron,8,{name:'lamp_arm'}));
    const lantern=roundedPanel(.28,.4,.28,.045,solid(0x3d4546,{roughness:.35,metalness:.78}),{name:'assembled_lantern_housing',edgeColor:0xb39a72,edgeOpacity:.12});
    lantern.position.set(lx+.32,3.02,4); dock.add(lantern);
    const glass=roundedPanel(.16,.25,.02,.025,solid(0xffb45c,{emissive:0xff7a24,emissiveIntensity:3.4,roughness:.2,transparent:true,opacity:.8,macro:false}),{name:'lantern_glass',castShadow:false});
    glass.position.set(lx+.32,3.03,4.15); dock.add(glass);
    const lampGlow = glow(0xffb45c, 3.2, .72); lampGlow.position.set(lx+.32,3.05,4.0); dock.add(lampGlow);
    const pl = new THREE.PointLight(0xff9a3c, 42, 12, 2); pl.position.set(lx+.32,3.05,4.0); dock.add(pl);
    lampLights.push(pl);
  }
  const f1 = figure({character:'jalen', h:1.7}); f1.position.set(-1.2,0.75,3.9); f1.scale.y=0.72;
  const f2 = figure({color:0x3c4452, h:1.65}); f2.position.set(0.4,0.75,3.9); f2.scale.y=0.72;
  dock.add(f1,f2);
  for(const [bx,bz] of [[-4.6,2.6],[4.2,1.8],[-3.8,-0.6]]){
    const barrelMat=pbr('wood',{color:0x765238,span:[.75,.8],repeat:[.38,1],roughness:.9,normalStrength:.44});
    const barrel = finish(new THREE.Mesh(new THREE.CylinderGeometry(.31,.36,.78,18,4),barrelMat),{name:'coopered_cargo_barrel'});
    barrel.position.set(bx,1.07,bz); dock.add(barrel);
    const hoopMat=solid(0x4a4844,{roughness:.62,metalness:.72});
    for(const y of [.78,1.04,1.36]){
      const hoop=new THREE.Mesh(new THREE.TorusGeometry(.345,.018,7,24),hoopMat); hoop.rotation.x=Math.PI/2; hoop.position.set(bx,y,bz); dock.add(hoop);
    }
  }
  dock.position.z=-6;
  scene.add(dock);
  const ding = sailboat({scale:.55, sailUp:false, hull:0x3a2e22});
  ding.position.set(9,0,-3); ding.rotation.y=0.7; scene.add(ding);
  const embers = fireflies(40, 9, 0xffc37a, [0.8,4.5]); embers.position.z=-6; scene.add(embers);
  const emberBase = embers.geometry.attributes.position.array.slice();
  return {
    scene,
    cam:{mode:'path', from:[0,2.4,15.5], to:[0,2.9,10], look:[0,2.0,-6], lookTo:[0,2.2,-6]},
    update(t){
      water.userData.tick(t);
      animateBoat(ding, t, .08, .02);
      const p = embers.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        p.array[i*3+1] = emberBase[i*3+1] + Math.sin(t*1.4+i)*0.35;
        p.array[i*3]   = emberBase[i*3]   + Math.cos(t*0.8+i*1.7)*0.3;
      }
      p.needsUpdate = true;
      lampLights.forEach((L,i)=>{ L.intensity = 38 + Math.sin(t*9+i*3)*3.5; });
    }
  };
}

/* Ch.2 — Stillness in the Triangle */
function buildS2(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x2c2038, fogNear:25, fogFar:210, hemiSky:0x4a3a5e, hemiGnd:0x161022, hemiI:.65,
    dir:[-20,30,10], dirColor:0xb9a8e8, dirI:.5});
  scene.add(skyDome(0x241a3d, 0x5c3a56, 0x120e1c));
  scene.add(starField(300));
  const water = makeWater({deep:0x141024, shallow:0x3c2c50, amp:.035, speed:.25,
    fogColor:0x2c2038, fogFar:210, sunDir:[0,1,0.2], sunColor:0xc8b8ff});
  scene.add(water);
  const boat = sailboat({scale:1.15, hull:0x5a3a26});
  boat.userData.ph = 1.3; scene.add(boat);
  const island = jaggedIsland(0.85); island.position.set(-32,0,-48); scene.add(island);
  const deb = new THREE.Group();
  deb.name='1708_wreck_debris_field';
  const debrisWood=pbr('wood',{color:0x684d37,span:[1.5,.3],repeat:[.75,.2],roughness:1,normalStrength:.65,macroAmount:.18,macroScale:.8});
  for(let i=0;i<4;i++){
    const pl = finish(new THREE.Mesh(new THREE.BoxGeometry(rand(0.8,1.6),0.08,0.28), debrisWood),{name:'splintered_galleon_plank',edgeColor:0xb99167,edgeOpacity:.09});
    pl.position.set(rand(-1.5,1.5), 0.06, rand(-1,1)); pl.rotation.y=rand(3); deb.add(pl);
  }
  const crate=new THREE.Group(); crate.name='half_rotted_galleon_crate';
  const crateCore=finish(new THREE.Mesh(new THREE.BoxGeometry(.62,.42,.46),debrisWood),{name:'crate_core'}); crateCore.position.y=.21; crate.add(crateCore);
  const crateIron=pbr('corrodedMetal',{albedo:false,color:0x5c5548,span:[.6,.4],repeat:[.3,.2],roughness:.85,metalness:.62,normalStrength:.45});
  for(const x of [-.28,.28]){
    const strap=finish(new THREE.Mesh(new THREE.BoxGeometry(.045,.45,.49),crateIron),{name:'corroded_crate_strap'}); strap.position.set(x,.22,0); crate.add(strap);
  }
  for(let i=0;i<10;i++){
    const barnacle=finish(new THREE.Mesh(new THREE.ConeGeometry(rand(.018,.045),rand(.025,.07),8),solid(pick([0x9d9983,0x747965,0xc1bca1]),{roughness:1,metalness:0,macro:false})),{name:'individual_barnacle'});
    barnacle.rotation.x=Math.PI/2; barnacle.position.set(rand(-.28,.28),rand(.02,.38),.24); crate.add(barnacle);
  }
  crate.position.set(.4,.02,-.4); crate.rotation.y=.5; deb.add(crate);
  const coinMat=solid(0xc08a24,{physical:true,metalness:.96,roughness:.34,clearcoat:.2,clearcoatRoughness:.22,emissive:0x4a2700,emissiveIntensity:.15,macroAmount:.12,macroScale:3});
  const coin = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.02,32,2),coinMat),{name:'worn_Spanish_gold_coin',edgeColor:0xffd27a,edgeOpacity:.18});
  coin.position.set(0.1,0.1,0.35); coin.rotation.x=1.2; deb.add(coin);
  const coinMark=makeDecal('✦',{worldWidth:.11,worldHeight:.11,color:'#5f3508',font:'Arial',fontSize:76,opacity:.72,name:'coin_mint_mark'});
  coinMark.position.set(.1,.108,.36); coinMark.rotation.x=1.2; deb.add(coinMark);
  const coinGlow = glow(0xffd27a, 1.6, 0); coinGlow.position.set(0.1,0.3,0.35); deb.add(coinGlow);
  deb.position.set(5.5,0,-6); scene.add(deb);
  const fogs = [];
  for(let i=0;i<6;i++){
    const f = glow(0x8a7aa8, rand(24,44), .055);
    f.position.set(rand(-50,50), rand(1,4), rand(-60,-10));
    fogs.push(f); scene.add(f);
  }
  return {
    scene,
    cam:{mode:'orbit', center:[0,1.2,0], r:[13,10.5], h:[3.0,4.6], a0:0.7, speed:0.045},
    update(t){
      water.userData.tick(t);
      animateBoat(boat, t, .05, .012);
      coinGlow.material.opacity = Math.max(0, Math.sin(t*1.8))*0.85;
      coinGlow.scale.setScalar(1.6 + Math.sin(t*1.8)*0.5);
      fogs.forEach((f,i)=>{ f.position.x += Math.sin(t*0.1+i)*0.008; });
    }
  };
}

/* Ch.3 — The Weight of What Was */
function buildS3(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x1c1428, fogNear:24, fogFar:190, hemiSky:0x3c3248, hemiGnd:0x181018, hemiI:.6,
    dir:[-26,18,30], dirColor:0xffc890, dirI:.55});
  scene.add(skyDome(0x1c1430, 0x6a4252, 0x0e0c14));
  scene.add(starField(400));
  const water = makeWater({deep:0x0c1e2a, shallow:0x244852, amp:.1, fogColor:0x1c1428, fogFar:190});
  scene.add(water);
  const isl = new THREE.Group();
  const beach = finish(new THREE.Mesh(new THREE.CylinderGeometry(13,16,2.2,64,5), pbr('sand',{color:0xb3a17f,span:[28,28],repeat:[18.7,18.7],roughness:1,normalStrength:.58,macroAmount:.16,macroScale:.06})),{name:'granular_castaway_beach'});
  beach.position.y=-0.6; isl.add(beach);
  const rocks = jaggedIsland(0.6); rocks.position.set(-7,0,-8); isl.add(rocks);
  scene.add(isl);
  const skel = skeleton(); skel.position.set(2.2,0.55,-2.2); skel.rotation.y=-0.6; scene.add(skel);
  const lb = lockboxNecklace(); lb.position.set(-0.6,0.55,-3.6); scene.add(lb);
  const rings = [];
  let nextRing = 0, flashed = false;
  const visLight = new THREE.PointLight(0xff6a3c, 0, 30, 2); visLight.position.set(0,4,-2); scene.add(visLight);
  return {
    scene,
    cam:{mode:'path', from:[4.5,2.6,7.5], to:[1.2,1.5,2.6], look:[-0.4,0.7,-3.4], lookTo:[0.8,0.6,-2.8],
      cuts:[{at:9.5,from:[2.6,1.5,4.8],to:[.5,1.2,2.0],look:[-.2,.7,-2.8],lookTo:[.7,.55,-2.8]}]},
    update(t){
      water.userData.tick(t);
      const pu = 0.75 + Math.sin(t*2.6)*0.25;
      lb.userData.light.intensity = 2.4*pu + 0.6;
      lb.userData.halo.material.opacity = 0.5*pu+0.2;
      lb.userData.gem.rotation.y = t*0.8;
      if(t>nextRing){
        nextRing = t+2.4;
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.3,0.02,8,40),
          basic(0x3f7dff,{transparent:true, opacity:.9, blending:THREE.AdditiveBlending, depthWrite:false}));
        m.rotation.x=-Math.PI/2; m.position.set(-0.6,0.75,-3.6);
        scene.add(m); rings.push({m, k:0});
      }
      for(let i=rings.length-1;i>=0;i--){
        const r = rings[i]; r.k += 0.016;
        r.m.scale.setScalar(1 + r.k*14);
        r.m.material.opacity = Math.max(0, 0.9 - r.k*1.1);
        if(r.k>0.9){ scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i,1); }
      }
      if(!flashed && t>8.5){ flashed = true; world.flash('#8a3a20', 0.5); visLight.intensity = 60; }
      if(flashed){ visLight.intensity = Math.max(0, visLight.intensity - 1.4); }
    }
  };
}

/* Ch.4 — Whispers in the Static */
function buildS4(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x06070c, fogNear:14, fogFar:90, hemiSky:0x3a4a52, hemiGnd:0x14161e, hemiI:1.7});
  scene.background = new THREE.Color(0x05060a);
  scene.add(seekerChamberShell(17,14));
  const mach = new THREE.Group(); mach.name='Weaver_resonance_detection_engine';
  const bronze = solid(0x80623b,{roughness:.38, metalness:.84,macroAmount:.07});
  const iron=pbr('corrodedMetal',{albedo:false,color:0x394047,span:[4,2],repeat:[2,1],roughness:.58,metalness:.78,normalStrength:.38,macroAmount:.13,macroScale:.18});
  const crystalMat=solid(0x59f2d0,{physical:true,roughness:.08,metalness:.12,transmission:.24,thickness:.3,ior:1.52,emissive:0x26ae95,emissiveIntensity:3.2,clearcoat:1,clearcoatRoughness:.04,macro:false});
  const baseA=finish(new THREE.Mesh(new THREE.CylinderGeometry(2.05,2.2,.24,32),iron),{name:'bolted_engine_plinth',edgeColor:0xa1a7a3,edgeOpacity:.1}); baseA.position.y=.12;
  const baseB=finish(new THREE.Mesh(new THREE.CylinderGeometry(1.72,1.9,.28,32),bronze),{name:'bronze_bearing_course'}); baseB.position.y=.38;
  const baseC=finish(new THREE.Mesh(new THREE.CylinderGeometry(1.42,1.55,.16,32),iron),{name:'service_access_course'}); baseC.position.y=.6;
  const col=finish(new THREE.Mesh(new THREE.CylinderGeometry(.25,.38,2.45,18),bronze),{name:'resonance_drive_column',edgeColor:0xc6a46b,edgeOpacity:.1}); col.position.y=1.75;
  mach.add(baseA,baseB,baseC,col);
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    mach.add(cylinderBetween([Math.cos(a)*1.42,.62,Math.sin(a)*1.42],[Math.cos(a)*.52,2.55,Math.sin(a)*.52],.055,iron,9,{name:'triangulated_engine_strut'}));
  }
  const gear=new THREE.Group(); gear.name='exposed_drive_gear'; gear.position.y=.64;
  const gearRing=new THREE.Mesh(new THREE.TorusGeometry(1.56,.07,10,64),bronze); gearRing.rotation.x=Math.PI/2; gear.add(gearRing);
  for(let i=0;i<28;i++){
    const a=i/28*Math.PI*2;
    const tooth=finish(new THREE.Mesh(new THREE.BoxGeometry(.11,.1,.22),bronze),{name:'machined_gear_tooth'});
    tooth.position.set(Math.cos(a)*1.63,0,Math.sin(a)*1.63); tooth.rotation.y=-a; gear.add(tooth);
  }
  mach.add(gear);
  const mRings = [];
  for(let i=0;i<3;i++){
    const r = finish(new THREE.Mesh(new THREE.TorusGeometry(1.0+i*0.35,.055,10,64),i===1?iron:bronze),{name:'gimballed_resonance_ring',edgeColor:0xbdab86,edgeOpacity:.08});
    r.position.y=2.72; r.rotation.x=Math.PI/2+i*.5; mach.add(r); mRings.push(r);
    for(let j=0;j<4;j++){
      const a=j/4*Math.PI*2;
      const node=finish(new THREE.Mesh(new THREE.SphereGeometry(.09,10,7),iron),{name:'ring_bearing_node'});
      node.position.set(Math.cos(a)*(1+i*.35),2.72,Math.sin(a)*(1+i*.35)); mach.add(node);
    }
  }
  addRivetLine(mach,[-1.4,.72,0],[1.4,.72,0],9,bronze,.026);
  scene.add(finishAssembly(mach));
  const crys = [];
  for(let i=0;i<3;i++){
    const a = i/3*Math.PI*2+0.6;
    const ped = finish(new THREE.Mesh(new THREE.CylinderGeometry(.22,.34,1.4,14),iron),{name:'crystal_resonator_pedestal',edgeColor:0x89929a,edgeOpacity:.09});
    ped.position.set(Math.cos(a)*3.4,0.7,Math.sin(a)*3.4); scene.add(ped);
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.26,.035,8,24),bronze); collar.rotation.x=Math.PI/2; collar.position.set(Math.cos(a)*3.4,1.4,Math.sin(a)*3.4); scene.add(collar);
    const cr = finish(new THREE.Mesh(new THREE.OctahedronGeometry(.24,1), crystalMat),{name:'tuned_resonance_crystal',castShadow:false});
    cr.position.set(Math.cos(a)*3.4,1.75,Math.sin(a)*3.4); scene.add(cr); crys.push(cr);
    scene.add(curveTube([[Math.cos(a)*3.4,.18,Math.sin(a)*3.4],[Math.cos(a)*2.5,.1,Math.sin(a)*2.5],[Math.cos(a)*1.5,.45,Math.sin(a)*1.5]],.035,bronze,28,8,{name:'shielded_crystal_conduit'}));
  }
  const dialBezel=new THREE.Mesh(new THREE.TorusGeometry(.62,.065,10,40),bronze); dialBezel.position.set(0,1.5,1.99); scene.add(dialBezel);
  const dial = finish(new THREE.Mesh(new THREE.CircleGeometry(.55,40), solid(0xc8b078,{metalness:.68,roughness:.38})),{name:'engraved_resonance_dial'});
  dial.position.set(0,1.5,2.0); scene.add(dial);
  for(let i=0;i<15;i++){
    const a=-Math.PI*.72+i/14*Math.PI*1.44;
    const tick=finish(new THREE.Mesh(new THREE.BoxGeometry(.014,.065,.012),solid(0x3a2416,{roughness:.7,metalness:.3,macro:false})),{name:'dial_tick',castShadow:false});
    tick.position.set(Math.sin(a)*.45,1.5+Math.cos(a)*.45,2.035); tick.rotation.z=-a; scene.add(tick);
  }
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.42,0.02), basic(0x201408));
  needle.geometry.translate(0,0.18,0);
  needle.position.set(0,1.5,2.03); scene.add(needle);
  const robes = [];
  for(let i=0;i<3;i++){
    const f = figure({robe:0x3c3448, h:1.8, skin:0x9a8a7a});
    const a = i/3*Math.PI*2 - 0.9;
    f.position.set(Math.cos(a)*5.2, 0, Math.sin(a)*5.2);
    f.lookAt(0,1.4,0); scene.add(f); robes.push(f);
  }
  const holo = sailboat({scale:.5, hull:0x6fd8ff, sail:0x6fd8ff});
  holo.traverse(m=>{ if(m.isMesh) m.material = new THREE.MeshBasicMaterial({color:0x6fd8ff,
    wireframe:true, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false}); });
  holo.position.y=4.2; scene.add(holo);
  const scan = new THREE.Mesh(new THREE.TorusGeometry(1.4,0.02,8,48),
    basic(0x6fd8ff,{transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false}));
  scan.rotation.x=Math.PI/2; scan.position.y=4.2; scene.add(scan);
  const machLight = new THREE.PointLight(0x59f2d0, 24, 40, 1.5); machLight.position.set(0,3.4,0); scene.add(machLight);
  const fillLight = new THREE.PointLight(0x4a6a9a, 16, 40, 1.5); fillLight.position.set(0,4,10); scene.add(fillLight);
  const dust = fireflies(140, 12, 0x59f2d0, [0.3,7]); dust.material.size=0.06; dust.material.opacity=.4; scene.add(dust);
  return {
    scene,
    cam:{mode:'path', from:[0,2.1,11.5], to:[0,2.7,7.2], look:[0,2.4,0], lookTo:[0,2.6,0],
      cuts:[{at:8.5,from:[-5,2.3,6],to:[-1.2,2.0,3.3],look:[0,2.5,0],lookTo:[0,2.6,0]}]},
    update(t){
      mRings.forEach((r,i)=>{ r.rotation.z = t*(0.2+i*0.13)*(i%2?-1:1); });
      crys.forEach((c,i)=>{ c.rotation.y=t*0.9+i; c.position.y = 1.75+Math.sin(t*1.6+i*2)*0.08; });
      holo.rotation.y = t*0.4;
      scan.position.y = 4.2 + Math.sin(t*1.2)*0.5;
      const twitch = (Math.sin(t*7.3)+Math.sin(t*12.7))*0.05 + (Math.random()-0.5)*0.04;
      needle.rotation.z = -0.7 + twitch + Math.sin(t*0.9)*0.15;
      machLight.intensity = 24 + Math.sin(t*2.2)*4;
    }
  };
}

/* Ch.5 — Whispers of Ancient Wood */
function buildS5(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0c1210, fogNear:30, fogFar:220, hemiSky:0x3a4c44, hemiGnd:0x10140c, hemiI:.85,
    dir:[-24,32,-40], dirColor:0xaac8e8, dirI:.75});
  scene.add(skyDome(0x0a1220, 0x1c3040, 0x070a08));
  scene.add(starField(1000));
  scene.add(moon(-30,32,-70,2.6,0xe8f0ff));
  const ground = finish(new THREE.Mesh(new THREE.CircleGeometry(70,96), pbr('sand',{albedo:false,color:0x1c2c17,span:[90,90],repeat:[60,60],roughness:1,normalStrength:.5,macroAmount:.18,macroScale:.05})),{name:'rooted_forest_floor'});
  ground.rotation.x=-Math.PI/2; scene.add(ground);
  const tree = mahoganyTree(); scene.add(tree);
  const upLight = new THREE.PointLight(0x7ae8a0, 14, 24, 2); upLight.position.set(0,1.5,0); scene.add(upLight);
  const barkLight = new THREE.SpotLight(0xd6c19b, 32, 34, Math.PI*.24, .55, 1.4);
  barkLight.position.set(8,9,9); barkLight.target.position.set(0,3.4,0); barkLight.castShadow=true;
  barkLight.shadow.mapSize.set(1024,1024); scene.add(barkLight,barkLight.target);
  const sitter = figure({color:0x3c3428, h:1.7}); sitter.position.set(1.3,0.05,0.9); sitter.scale.y=0.68;
  sitter.rotation.y=-0.8; scene.add(sitter);
  const flies = fireflies(90, 14, 0xbfffc9, [0.4,6]); scene.add(flies);
  const flyBase = flies.geometry.attributes.position.array.slice();
  const eraColors = [0x7ae8a0, 0xffd27a, 0xff7a5c, 0x7ab8ff];
  const rings = []; let nextRing = 1.2, era = 0;
  return {
    scene,
    cam:{mode:'orbit', center:[0,3.8,0], r:[17,12.5], h:[3.0,5.0], a0:0.4, speed:0.045},
    update(t){
      const p = flies.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        p.array[i*3]   = flyBase[i*3]   + Math.sin(t*0.9+i*1.3)*0.5;
        p.array[i*3+1] = flyBase[i*3+1] + Math.cos(t*1.1+i)*0.45;
      }
      p.needsUpdate = true;
      if(t>nextRing){
        nextRing = t+4.5;
        const m = new THREE.Mesh(new THREE.TorusGeometry(1,0.035,8,48),
          basic(eraColors[era%4],{transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false}));
        m.rotation.x=-Math.PI/2; m.position.y=0.12;
        scene.add(m); rings.push({m,t0:t}); era++;
      }
      for(let i=rings.length-1;i>=0;i--){
        const r = rings[i]; const k = (t-r.t0)/5;
        r.m.scale.setScalar(1+k*14);
        r.m.material.opacity = Math.max(0, .8*(1-k));
        if(k>=1){ scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i,1); }
      }
      tree.rotation.y = Math.sin(t*0.1)*0.02;
    }
  };
}

/* Ch.6 — Shadows and Whispers */
function buildS6(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0c1220, fogNear:30, fogFar:240, hemiSky:0x2c3a52, hemiGnd:0x0c0e14, hemiI:.55,
    dir:[30,26,-30], dirColor:0x9ab8e8, dirI:.4});
  scene.add(skyDome(0x0a1020, 0x22324e, 0x080a10));
  scene.add(starField(700));
  scene.add(moon(40,24,-90,2.4,0xe8ecff));
  const water = makeWater({deep:0x081c28, shallow:0x163c4c, amp:.13, fogColor:0x0c1220, fogFar:240,
    sunDir:[0.4,0.3,-0.8], sunColor:0xcfe0ff});
  scene.add(water);
  const town = new THREE.Group();
  for(let i=0;i<9;i++){
    const w = rand(3,5.5), h = rand(2.5,5);
    const b = portBuilding({w,h,d:3,distant:true,lit:Math.random()<.8,wall:pick([0x5f5a54,0x6a5b4d,0x5a625e]),roof:pick([0x45362f,0x3c4044]),name:'Port_Royal_facade'});
    b.position.set(-22+i*5.4+rand(-1,1),0,0); town.add(b);
  }
  town.position.set(0,0,-34); scene.add(town);
  const dock = dockAssembly(26,4,{name:'Port_Royal_watch_dock',color:0x6f5742});
  dock.position.set(-2,0,6); scene.add(dock);
  const poleMat=solid(0x292b2d,{roughness:.54,metalness:.82});
  const pole = cylinderBetween([9,.65,6],[9,3.5,6],.06,poleMat,10,{name:'Port_Royal_lamp_post'}); scene.add(pole);
  const arm=cylinderBetween([9,3.45,6],[9.35,3.45,6],.035,poleMat,8,{name:'lamp_bracket'}); scene.add(arm);
  const lampHousing=roundedPanel(.28,.38,.28,.045,poleMat,{name:'Port_Royal_lantern'}); lampHousing.position.set(9.35,3.3,6); scene.add(lampHousing);
  const lampG = glow(0xffc37a, 3, .8); lampG.position.set(9,3.6,6); scene.add(lampG);
  const lamp = new THREE.PointLight(0xffb45c, 34, 14, 2); lamp.position.set(9.35,3.3,6); scene.add(lamp);
  const watcher = figure({character:'thorne', h:1.75});
  watcher.position.set(9.8,0.65,5.4); watcher.rotation.y=-2.4; scene.add(watcher);
  const yacht = blackYacht({scale:1.05}); yacht.position.set(-8,0,-13); yacht.rotation.y=0.35;
  yacht.userData.ph=2.1; scene.add(yacht);
  const serpent = sailboat({scale:1.0, hull:0x6b4226}); serpent.position.set(5,0,-5);
  serpent.rotation.y=-0.5; serpent.userData.ph=0.4; scene.add(serpent);
  const lockGlow = glow(0x3f7dff, 2.2, .6); lockGlow.position.set(5,1.3,-5); scene.add(lockGlow);
  const sloop = sailboat({scale:.7, sailUp:false, hull:0x3a3230}); sloop.position.set(14,0,-16);
  sloop.rotation.y=1.2; sloop.userData.ph=3.6; scene.add(sloop);
  return {
    scene,
    cam:{mode:'path', from:[-9,2.8,12], to:[5,2.4,10], look:[-8,1.6,-13], lookTo:[5,1.3,-5]},
    update(t){
      water.userData.tick(t);
      animateBoat(yacht,t,.07,.015); animateBoat(serpent,t,.09,.02); animateBoat(sloop,t,.08,.02);
      lockGlow.material.opacity = 0.35+Math.sin(t*2.4)*0.3;
      lamp.intensity = 34+Math.sin(t*11)*3;
    }
  };
}

/* Ch.7 — The Unveiling */
function buildS7(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x05070c, fogNear:14, fogFar:90, hemiSky:0x3a4c5e, hemiGnd:0x14161e, hemiI:1.3});
  scene.background = new THREE.Color(0x04060a);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60,60), std(0x2a3442,{roughness:.6, metalness:.3}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  const grid = new THREE.GridHelper(60, 40, 0x143040, 0x0b1a24);
  grid.position.y=0.01; grid.material.transparent=true; grid.material.opacity=.35; scene.add(grid);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(9,4.6), std(0x0a141c,{roughness:.4, metalness:.4}));
  scr.position.set(0,2.6,-7); scene.add(scr);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.5,5.1,0.15), std(0x141c26,{metalness:.6,roughness:.4}));
  frame.position.set(0,2.6,-7.12); scene.add(frame);
  const sigil = spiralSigil(1.75, 3, 0x9fd8ff); sigil.position.set(0,2.6,-6.9); scene.add(sigil);
  const scrGlow = glow(0x6fb7ff, 10, .35); scrGlow.position.set(0,2.6,-6.4); scene.add(scrGlow);
  const scrLight = new THREE.PointLight(0x6fb7ff, 18, 34, 1.5); scrLight.position.set(0,2.8,-5.6); scene.add(scrLight);
  const thorne = figure({character:'thorne', h:1.8}); thorne.position.set(0,0,-3.6);
  thorne.rotation.y=Math.PI; scene.add(thorne);
  const m1 = figure({color:0x14161c, h:1.85}); m1.position.set(-2.6,0,-1.6); m1.rotation.y=Math.PI; scene.add(m1);
  const m2 = figure({color:0x14161c, h:1.85}); m2.position.set(2.6,0,-1.6); m2.rotation.y=Math.PI; scene.add(m2);
  const dust = fireflies(80, 10, 0x6fb7ff, [0.2,5]); dust.material.size=.06; dust.material.opacity=.35; scene.add(dust);
  let stabbed = false;
  return {
    scene,
    cam:{mode:'path', from:[0,2.4,5.0], to:[0,2.0,1.6], look:[0,2.5,-7], lookTo:[0,2.6,-7],
      cuts:[{at:10,from:[3.8,2.0,1.2],to:[2.2,1.7,-.2],look:[0,1.1,.2],lookTo:[0,1.1,-.7]}]},
    update(t){
      const pu = 0.8+Math.sin(t*2.6)*0.2;
      sigil.scale.setScalar(pu); sigil.rotation.z = t*0.15;
      scrLight.intensity = 17+Math.sin(t*2.6)*3.5;
      scrGlow.material.opacity = 0.25+Math.sin(t*2.6)*0.12;
      if(!stabbed && t>9){ stabbed = true; world.flash('#9fd8ff', 0.35); }
    }
  };
}

/* Ch.8 — The Serpent's Shadow */
function buildS8(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0a0806, fogNear:10, fogFar:50, hemiSky:0x4a3a28, hemiGnd:0x14100c, hemiI:1.0});
  scene.background = new THREE.Color(0x060504);
  const cabinWall=pbr('wood',{color:0x86684d,span:[9,3.6],repeat:[4.5,1.8],roughness:.94,normalStrength:.48,macroAmount:.12,macroScale:.18,side:THREE.BackSide});
  const cabinTimber=pbr('wood',{albedo:false,color:0x493424,span:[4,1],repeat:[2,.5],roughness:.9,normalStrength:.4,macroAmount:.13});
  const room = finish(new THREE.Mesh(new THREE.BoxGeometry(9,3.6,7), cabinWall),{name:'Sea_Serpent_joinered_cabin_shell',castShadow:false});
  room.position.y=1.8; scene.add(room);
  const floor = finish(new THREE.Mesh(new THREE.PlaneGeometry(9,7), pbr('wood',{color:0x715139,span:[9,7],repeat:[4.5,3.5],roughness:.96,normalStrength:.55,macroAmount:.14,macroScale:.17})),{name:'cabin_floorboards'});
  floor.rotation.x=-Math.PI/2; floor.position.y=0.01; scene.add(floor);
  const beamMat=cabinTimber;
  for(const x of [-4.1,-2.05,0,2.05,4.1]){
    const stud=finish(new THREE.Mesh(new THREE.BoxGeometry(.14,3.45,.16),beamMat),{name:'visible_cabin_frame'}); stud.position.set(x,1.74,-3.43); scene.add(stud);
  }
  for(const x of [-3,0,3]){
    const ceilingBeam=finish(new THREE.Mesh(new THREE.BoxGeometry(.18,.2,6.8),beamMat),{name:'ceiling_crossbeam'}); ceilingBeam.position.set(x,3.42,0); scene.add(ceilingBeam);
  }
  const winFrame=roundedPanel(1.92,1.38,.12,.12,beamMat,{name:'bolted_cabin_window_frame'}); winFrame.position.set(-2.2,1.9,-3.41); winFrame.rotation.y=Math.PI; scene.add(winFrame);
  const win = roundedPanel(1.62,1.08,.035,.1,solid(0x1c3a5e,{physical:true,roughness:.08,clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.82,emissive:0x102944,emissiveIntensity:.65,macro:false}),{name:'laminated_night_window',castShadow:false});
  win.position.set(-2.2,1.9,-3.48); scene.add(win);
  const winGlow = glow(0x6f9fd8, 2.2, .4); winGlow.position.set(-2.2,1.9,-3.3); scene.add(winGlow);
  const table = new THREE.Group();
  table.name='braced_chart_table';
  const top = roundedPanel(1.8,1.08,.12,.12,pbr('wood',{color:0x795438,span:[1.8,1.08],repeat:[.9,.54],roughness:.82,normalStrength:.45}),{name:'thick_chart_table_top',edgeColor:0xd2aa80,edgeOpacity:.1}); top.rotation.x=-Math.PI/2; top.position.y=0.82;
  table.add(top);
  for(const [lx,lz] of [[-0.7,-0.4],[0.7,-0.4],[-0.7,0.4],[0.7,0.4]]){
    const leg = finish(new THREE.Mesh(new THREE.BoxGeometry(.11,.8,.11),beamMat),{name:'mortised_table_leg',edgeColor:0x9f7656,edgeOpacity:.08});
    leg.position.set(lx,.4,lz); table.add(leg);
  }
  table.add(cylinderBetween([-.7,.28,-.4],[.7,.28,.4],.025,beamMat,8,{name:'diagonal_table_brace'}));
  table.add(cylinderBetween([-.7,.28,.4],[.7,.28,-.4],.025,beamMat,8,{name:'diagonal_table_brace'}));
  const lb = lockboxNecklace({scale:.65}); lb.position.y=0.83; table.add(lb);
  table.position.set(0,0,-0.4); scene.add(table);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.2), basic(0x2c4a6e));
  doorGlow.position.set(3.2,1.15,-3.48); scene.add(doorGlow);
  const jalen = figure({character:'jalen', h:1.78}); jalen.position.set(0,0,1.3); jalen.rotation.y=Math.PI; scene.add(jalen);
  const thorne = figure({character:'thorne', h:1.8}); thorne.position.set(0.2,0,-1.7); scene.add(thorne);
  const thug1 = figure({color:0x16181e, h:1.85}); thug1.position.set(-1.6,0,-2.2); scene.add(thug1);
  const thug2 = figure({color:0x16181e, h:1.85}); thug2.position.set(1.8,0,-2.3); scene.add(thug2);
  const maya = figure({character:'maya', h:1.5}); maya.position.set(1.2,0,0.6); scene.add(maya);
  const leo = figure({character:'leo', h:1.05}); leo.position.set(1.7,0,0.9); scene.add(leo);
  const lamp = new THREE.PointLight(0xffb45c, 14, 16, 1.5); lamp.position.set(0,3.0,0); scene.add(lamp);
  const lampGlow = glow(0xffc37a, 2.4, .7); lampGlow.position.set(0,3.0,0); scene.add(lampGlow);
  return {
    scene,
    cam:{mode:'path', from:[3.6,1.9,4.4], to:[2.6,1.7,3.2], look:[0,1.1,-0.6], lookTo:[0.2,1.1,-0.8]},
    update(t){
      lb.userData.light.intensity = 2.0+Math.sin(t*3.2)*0.8;
      lamp.intensity = 13+Math.sin(t*13)*1.0;
      if(t<7){
        jalen.rotation.y = Math.PI+Math.sin(t*1.2)*0.06;
        thorne.rotation.y = Math.sin(t*0.9)*0.06;
      } else if(t<8.2){
        const k = smooth((t-7)/1.2);
        table.position.z = -0.4 - k*1.1;
        thorne.position.z = -1.7 - k*0.8;
        thorne.rotation.x = -k*0.35;
        world.shake(0.06);
      } else {
        world.shake(0.035);
        jalen.position.x = Math.sin(t*6)*0.12;
        thug1.position.x = -1.6+Math.sin(t*5+1)*0.15;
        thug1.position.z = -2.2+Math.cos(t*4)*0.1;
        const k2 = Math.min(1,(t-8.2)/2.2);
        maya.position.x = 1.2 + k2*2.0; maya.position.z = 0.6 - k2*3.4;
        leo.position.x = 1.7 + k2*1.6; leo.position.z = 0.9 - k2*3.2;
        const s = Math.max(0.01, 1-Math.max(0,(t-10)/1.2));
        maya.scale.setScalar(s); leo.scale.setScalar(s);
      }
    }
  };
}

/* Ch.9 — Desperate Escape, Echoing Power */
function buildS9(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x141226, fogNear:30, fogFar:260, hemiSky:0x34304e, hemiGnd:0x0e0c16, hemiI:.8,
    dir:[-30,20,30], dirColor:0xffb887, dirI:.6});
  scene.add(skyDome(0x1a1436, 0x7a4452, 0x0c0a14));
  scene.add(starField(600));
  const water = makeWater({deep:0x0a1a2c, shallow:0x1c4256, amp:.18, fogColor:0x141226, fogFar:260,
    sunDir:[-0.5,0.2,0.6], sunColor:0xffc890});
  scene.add(water);
  const serpent = sailboat({scale:1.1, hull:0x6b4226});
  serpent.position.set(-3,0,2); serpent.rotation.y=0.9; scene.add(serpent);
  const yacht = blackYacht({scale:1.1});
  yacht.position.set(9,0,-6); yacht.rotation.y=0.9; scene.add(yacht);
  // blue shockwave ring
  const wave = new THREE.Mesh(new THREE.TorusGeometry(1,0.09,10,60),
    basic(0x4f9dff,{transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
  wave.rotation.x=-Math.PI/2; wave.position.set(-3,0.4,2); scene.add(wave);
  const burst = new THREE.PointLight(0x4f9dff, 0, 40, 2); burst.position.set(-3,2,2); scene.add(burst);
  // distant glowing vessel (appears late)
  const nv = naiaVessel({scale:.9}); nv.position.set(-40,0,-70); nv.visible=false; scene.add(nv);
  const nvGlow = glow(0x5fd8ff, 16, 0); nvGlow.position.set(-40,2,-70); scene.add(nvGlow);
  return {
    scene,
    cam:{mode:'path', from:[6,3.0,12], to:[-2,3.8,14], look:[0,1.2,-2], lookTo:[-6,1.5,-10]},
    update(t){
      water.userData.tick(t);
      const sep = smooth(Math.min(1, Math.max(0,(t-6)/12)));
      serpent.position.x = -3 - sep*10; serpent.position.z = 2 - sep*6;
      yacht.position.x = 9 + sep*4; yacht.position.z = -6 - sep*3;
      animateBoat(serpent,t,.14,.05); animateBoat(yacht,t,.1,.03);
      if(t>2.2 && t<2.4 && wave.material.opacity===0){ wave.material.opacity = 0.95; burst.intensity = 50; world.flash('#4f7dff', 0.3); }
      if(wave.material.opacity>0){
        wave.scale.setScalar(wave.scale.x + 0.35);
        wave.material.opacity = Math.max(0, wave.material.opacity - 0.008);
        burst.intensity = Math.max(0, burst.intensity - 0.6);
      }
      if(t>14){
        nv.visible = true;
        nvGlow.material.opacity = Math.min(0.8, nvGlow.material.opacity + 0.01);
      }
      if(nv.visible){ animateBoat(nv, t, .06, .01); }
    }
  };
}

/* Ch.10 — The Keeper of Forgotten Tides */
function buildS10(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0a101e, fogNear:35, fogFar:300, hemiSky:0x2c3a55, hemiGnd:0x0a0c14, hemiI:.5,
    dir:[20,30,-40], dirColor:0x9fc8ff, dirI:.4});
  scene.add(skyDome(0x080e1e, 0x1c2c4c, 0x060810));
  scene.add(starField(1000));
  const water = makeWater({deep:0x081a28, shallow:0x143c50, amp:.14, fogColor:0x0a101e, fogFar:300,
    sunDir:[0.2,0.4,-0.7], sunColor:0xbfe0ff});
  scene.add(water);
  const serpent = sailboat({scale:1.0, hull:0x6b4226});
  serpent.position.set(3,0,3); serpent.rotation.y=-0.7; serpent.userData.ph=1.1; scene.add(serpent);
  const nv = naiaVessel({scale:1.3}); nv.position.set(-6,0,-4); nv.rotation.y=0.8; scene.add(nv);
  // Naia on the bow with staff
  const naia = figure({character:'naia', robe:0x2c4a5e, h:2.1, staff:true});
  naia.position.set(-4.6,0.6,-3.4); naia.rotation.y=0.9; scene.add(naia);
  const staffLight = new THREE.PointLight(0x9fe8ff, 3, 18, 2); staffLight.position.set(-4.3,3,-3.2); scene.add(staffLight);
  // the fracture on the horizon
  const frac = fractureRing(14); frac.position.set(10,16,-110); scene.add(frac);
  const fracLight = new THREE.PointLight(0x9fe0ff, 2, 300, 1.6); fracLight.position.set(10,16,-100); scene.add(fracLight);
  return {
    scene,
    cam:{mode:'orbit', center:[-1,1.6,-1], r:[12,9], h:[2.6,4.4], a0:1.2, speed:0.04},
    update(t){
      water.userData.tick(t);
      frac.userData.tick(t);
      animateBoat(serpent,t,.1,.02); animateBoat(nv,t,.06,.012);
      nv.userData.crystal.rotation.y = t*1.2;
      nv.userData.gyros?.forEach((ring,i)=>{
        ring.rotation.x=t*(.28+i*.16)+i*.6;
        ring.rotation.z=t*(i?.2:-.17);
      });
      const pu = 0.7+Math.sin(t*2.6)*0.3;
      staffLight.intensity = 3*pu;
      if(naia.userData.crystal) naia.userData.crystal.rotation.y = t*2;
    }
  };
}

/* Ch.11 — Heart of Shifting Sands */
function buildS11(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0e1a1c, fogNear:45, fogFar:260, hemiSky:0x4a5e62, hemiGnd:0x141a14, hemiI:.95,
    dir:[10,40,20], dirColor:0xbfe8d8, dirI:.7});
  scene.add(skyDome(0x0c1c28, 0x24484e, 0x080e0c));
  scene.add(starField(800));
  const water = makeWater({deep:0x0c2830, shallow:0x2a6a68, amp:.05, fogColor:0x0e1a1c, fogFar:260,
    glowColor:0x1c8a7a, glowStr:.22, sunColor:0xc8ffe8, sparkle:.25});
  scene.add(water);
  scene.add(cliffsRing());
  const isl = sandIsland(); scene.add(isl);
  const shore = new THREE.Mesh(new THREE.TorusGeometry(13.4,0.12,8,72),
    basic(0x7ae8d8,{transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false}));
  shore.rotation.x=-Math.PI/2; shore.position.y=0.58; scene.add(shore);
  // Naia + family on the sands
  const naia = figure({character:'naia', robe:0x2c4a5e, h:2.1, staff:true});
  naia.position.set(3.2,0.56,-1.2); naia.rotation.y=-1.2; scene.add(naia);
  const jalen = figure({character:'jalen', h:1.78}); jalen.position.set(-1.0,0.56,2.2); jalen.rotation.y=2.4; scene.add(jalen);
  const maya = figure({character:'maya', h:1.5}); maya.position.set(-2.2,0.56,3.0); maya.rotation.y=2.2; scene.add(maya);
  const leo = figure({character:'leo', h:1.05}); leo.position.set(-2.9,0.56,2.3); leo.rotation.y=2.3; scene.add(leo);
  const gemLight = new THREE.PointLight(0x3f7dff, 4, 20, 2); gemLight.position.set(0,1.9,0); scene.add(gemLight);
  const sandLight = new THREE.PointLight(0xffd88a, 5, 45, 2); sandLight.position.set(0,5.4,0); scene.add(sandLight);
  const motes = fireflies(120, 22, 0x9fe8d8, [0.3,8]); scene.add(motes);
  const moteBase = motes.geometry.attributes.position.array.slice();
  return {
    scene,
    cam:{mode:'path', from:[17,5.5,20], to:[7.5,3.0,11], look:[0,0.6,0], lookTo:[0,0.5,0]},
    update(t){
      water.userData.tick(t);
      isl.userData.tick(t);
      gemLight.intensity = 3.2+Math.sin(t*2.6)*1.2;
      sandLight.intensity = 4.5+Math.sin(t*0.8)*1.0;
      shore.material.opacity = 0.4+Math.sin(t*1.4)*0.18;
      shore.rotation.z = t*0.05;
      const p = motes.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        p.array[i*3+1] = moteBase[i*3+1] + Math.sin(t*0.7+i)*0.5;
        p.array[i*3]   = moteBase[i*3]   + Math.cos(t*0.5+i*2.1)*0.4;
      }
      p.needsUpdate = true;
    }
  };
}

/* Ch.12 — Whispers of Opportunity */
function buildS12(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x2c1e18, fogNear:40, fogFar:320, hemiSky:0x5e4630, hemiGnd:0x14100c, hemiI:.6,
    dir:[-40,14,-60], dirColor:0xffc37a, dirI:.8});
  scene.add(skyDome(0x2c1a3c, 0xd87a3c, 0x140e0c));
  scene.add(starField(150));
  const sun = moon(-70,10,-160,7,0xffd9a0); scene.add(sun);
  const water = makeWater({deep:0x1c2836, shallow:0xb06a3c, amp:.16, fogColor:0x2c1e18, fogFar:320,
    sunDir:[-0.5,0.12,-0.85], sunColor:0xffd9a0, sparkle:0.4});
  scene.add(water);
  const serpent = sailboat({scale:1.1, hull:0x6b4226, sail:0xf0e0c0});
  serpent.rotation.y=0.5; scene.add(serpent);
  // distant port silhouette
  const port = new THREE.Group();
  for(let i=0;i<12;i++){
    const w = rand(2,5), h = rand(2,6);
    const b=portBuilding({w,h,d:3,distant:true,lit:false,wall:pick([0x705344,0x695b4c,0x5f4f42]),roof:pick([0x49342b,0x563b2d]),name:'sunset_trade_port_facade'});
    b.position.set(-30+i*5.5,0,0); port.add(b);
  }
  for(let i=0;i<5;i++){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,rand(5,8),5), std(0x241a12));
    m.position.set(-24+i*9, 3, 4); port.add(m);
  }
  port.position.set(0,0,-90); scene.add(port);
  // birds
  const birds = [];
  const birdCv = document.createElement('canvas'); birdCv.width=64; birdCv.height=32;
  const bctx = birdCv.getContext('2d');
  bctx.strokeStyle='rgba(20,14,10,0.9)'; bctx.lineWidth=5; bctx.lineCap='round';
  bctx.beginPath(); bctx.moveTo(6,26); bctx.quadraticCurveTo(20,8,32,20); bctx.quadraticCurveTo(44,8,58,26); bctx.stroke();
  const birdTex = new THREE.CanvasTexture(birdCv);
  for(let i=0;i<7;i++){
    const b = new THREE.Sprite(new THREE.SpriteMaterial({map:birdTex, transparent:true, opacity:.85}));
    b.scale.set(1.6,0.8,1);
    b.position.set(rand(-40,40), rand(8,20), rand(-60,-20));
    birds.push(b); scene.add(b);
  }
  return {
    scene,
    cam:{mode:'path', from:[-10,3.4,14], to:[8,3.0,10], look:[0,1.4,-4], lookTo:[0,1.8,-10]},
    update(t){
      water.userData.tick(t);
      serpent.position.x = Math.sin(t*0.06)*6;
      animateBoat(serpent,t,.13,.03);
      birds.forEach((b,i)=>{
        b.position.x += 0.03+ i*0.004;
        b.position.y += Math.sin(t*3+i*2)*0.01;
        if(b.position.x>50) b.position.x = -50;
      });
    }
  };
}

/* Ch.13 — The Echo Between Waves */
function buildS13(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x141c2c, fogNear:40, fogFar:400, hemiSky:0x3c4a66, hemiGnd:0x0e121c, hemiI:.6,
    dir:[0,40,-30], dirColor:0xbfd4ff, dirI:.5});
  scene.add(skyDome(0x0c1426, 0x2c3c5c, 0x080c14));
  scene.add(starField(900));
  const water = makeWater({deep:0x101c2c, shallow:0x3c5468, amp:.05, speed:.4, fogColor:0x141c2c, fogFar:400,
    glowColor:0x2c5a7a, glowStr:.4, sunColor:0xd8ecff});
  scene.add(water);
  const serpent = sailboat({scale:1.0, hull:0x6b4226});
  serpent.userData.ph=2.2; scene.add(serpent);
  // giant spiral of light in the sky
  const spiral = spiralSigil(16, 4, 0x9fd8ff);
  spiral.position.set(0,44,-90); spiral.rotation.x=0.35; scene.add(spiral);
  const spiralGlow = glow(0x9fd8ff, 60, .4); spiralGlow.position.set(0,44,-90); scene.add(spiralGlow);
  // ghost fleet beneath the surface
  const ghosts = new THREE.Group();
  const gArr = [];
  for(let i=0;i<7;i++){
    const gs = ghostShip(rand(.8,1.4));
    const a = rand(Math.PI*2), r = rand(10,30);
    gs.position.set(Math.cos(a)*r, -2.2-rand(1.5), Math.sin(a)*r-6);
    gs.rotation.y = rand(Math.PI*2);
    gs.userData.a = a; gs.userData.r = r;
    ghosts.add(gs); gArr.push(gs);
  }
  scene.add(ghosts);
  // Serpent's Shadow materializes
  const yacht = blackYacht({scale:1.15});
  yacht.position.set(16,0,-26); yacht.rotation.y=0.7; yacht.visible=false; scene.add(yacht);
  let bolt = null, struck = false;
  const vortexRings = [];
  return {
    scene,
    cam:{mode:'path', from:[-6,2.2,12], to:[-2,7,16], look:[0,4,-20], lookTo:[0,10,-40],
      cuts:[{at:10,from:[4,2.5,8],to:[1,4.4,10],look:[0,2,-20],lookTo:[0,7,-35]},{at:20,from:[-2,4,11],to:[0,2.2,6],look:[0,2,-6],lookTo:[0,1,-12]}]},
    update(t){
      water.userData.tick(t);
      animateBoat(serpent,t,.08,.02);
      spiral.rotation.z = t*0.1;
      gArr.forEach(gs=>{
        gs.userData.a += 0.0009;
        const r = gs.userData.r*(1 - t*0.004);
        gs.position.x = Math.cos(gs.userData.a)*r;
        gs.position.z = Math.sin(gs.userData.a)*r-6;
      });
      if(!struck && t>13){
        struck = true;
        world.flash('#cfe4ff', 0.7);
        bolt = boltLine(V3(16,30,-26), V3(16,0,-26), 0xd8ecff, 3);
        scene.add(bolt);
        yacht.visible = true;
      }
      if(bolt && t>13.25){ scene.remove(bolt); bolt.geometry.dispose(); bolt=null; }
      if(yacht.visible) animateBoat(yacht,t,.08,.02);
      if(t>16 && vortexRings.length<4 && Math.random()<0.05){
        const m = new THREE.Mesh(new THREE.TorusGeometry(2,0.06,8,48),
          basic(0x7fd4e8,{transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false}));
        m.rotation.x=-Math.PI/2; m.position.set(0,0.3,-10);
        scene.add(m); vortexRings.push(m);
      }
      vortexRings.forEach(m=>{ m.scale.setScalar(m.scale.x+0.12); m.material.opacity*=0.994; });
    }
  };
}

/* Ch.14 — The Weight of the Unseen */
function buildS14(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x05070e, fogNear:14, fogFar:90, hemiSky:0x3c4a6a, hemiGnd:0x14161e, hemiI:1.4});
  scene.background = new THREE.Color(0x04050a);
  scene.add(seekerChamberShell(18,15));
  // containment frame + Shard
  const frameMat=pbr('corrodedMetal',{albedo:false,color:0x625b4d,span:[4,2],repeat:[2,1],roughness:.5,metalness:.82,normalStrength:.4,macroAmount:.12,macroScale:.18});
  const bronze=solid(0x826b43,{roughness:.38,metalness:.86});
  const containment=new THREE.Group(); containment.name='Shard_of_Origin_containment_assembly';
  const base=finish(new THREE.Mesh(new THREE.CylinderGeometry(2.8,3.05,.32,40),frameMat),{name:'containment_floor_plinth',edgeColor:0xb6ad9a,edgeOpacity:.1}); base.position.y=.16; containment.add(base);
  const bearing=finish(new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.55,.24,40),bronze),{name:'containment_bearing_ring'}); bearing.position.y=.42; containment.add(bearing);
  const containmentRings=[];
  for(let i=0;i<3;i++){
    const frameRing=finish(new THREE.Mesh(new THREE.TorusGeometry(2.2-i*.28,.1-i*.012,12,72),i===1?frameMat:bronze),{name:'articulated_containment_gimbal',edgeColor:0xd2c5a4,edgeOpacity:.09});
    frameRing.position.y=2.6; frameRing.rotation.set(i*.62,i*.38,i*.47); containment.add(frameRing); containmentRings.push(frameRing);
  }
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2;
    const foot=new THREE.Vector3(Math.cos(a)*2.45,.45,Math.sin(a)*2.45);
    const top=new THREE.Vector3(Math.cos(a)*2.05,2.6,Math.sin(a)*2.05);
    containment.add(cylinderBetween(foot,top,.095,frameMat,11,{name:'triangulated_containment_pylon'}));
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,8,24),bronze); coil.position.copy(top); coil.rotation.set(Math.PI/2,a,0); containment.add(coil);
    containment.add(curveTube([foot.clone(),new THREE.Vector3(Math.cos(a)*3.3,.18,Math.sin(a)*3.3),new THREE.Vector3(Math.cos(a+.22)*4.2,.12,Math.sin(a+.22)*4.2)],.045,bronze,30,8,{name:'containment_power_conduit'}));
  }
  addRivetLine(containment,[-2.4,.49,0],[2.4,.49,0],13,bronze,.03);
  scene.add(finishAssembly(containment));
  const shardCore = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(0.65,2),
    solid(0x6fb7ff,{roughness:.08,emissive:0x3c79da,emissiveIntensity:5,transparent:true,opacity:.9,macro:false})),{name:'Shard_of_Origin_core',castShadow:false});
  shardCore.position.y=2.6; scene.add(shardCore);
  const shardShell = finish(new THREE.Mesh(new THREE.SphereGeometry(1.05,36,24),
    solid(0x0a1420,{physical:true,roughness:.08,metalness:.24,transmission:.18,thickness:.45,ior:1.48,clearcoat:1,clearcoatRoughness:.03,transparent:true,opacity:.68,emissive:0x142c56,emissiveIntensity:.8,macro:false})),{name:'containment_field_shell',castShadow:false});
  shardShell.position.y=2.6; scene.add(shardShell);
  const shardGlow = glow(0x6fb7ff, 7, .5); shardGlow.position.y=2.6; scene.add(shardGlow);
  const shardLight = new THREE.PointLight(0x6fb7ff, 20, 40, 1.5); shardLight.position.set(0,3,2); scene.add(shardLight);
  const fillL14 = new THREE.PointLight(0x4a5a8a, 12, 40, 1.5); fillL14.position.set(0,5,10); scene.add(fillL14);
  // arcs from shard
  let arcs = [];
  let arcTimer = 0;
  // hologram of Sea Serpent with anchor lines
  const holo = sailboat({scale:.45, hull:0x6fd8ff, sail:0x6fd8ff});
  holo.traverse(m=>{ if(m.isMesh) m.material = new THREE.MeshBasicMaterial({color:0x6fd8ff,
    wireframe:true, transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false}); });
  holo.position.set(4.5,3.2,-1); scene.add(holo);
  const anchors = [];
  for(let i=0;i<5;i++){
    const a = boltLine(V3(4.5,3.2,-1), V3(4.5+rand(-3,3),0.05,-1+rand(-3,3)), 0x6fd8ff, 0.4);
    a.material.opacity = 0.35; scene.add(a); anchors.push(a);
  }
  // figures
  const thorne = figure({character:'thorne', h:1.8}); thorne.position.set(2.8,0,2.2); thorne.lookAt(0,2.6,0); scene.add(thorne);
  const lys = figure({robe:0x3a3c4c, h:1.75, skin:0xc8c0d8}); lys.position.set(-2.6,0,1.8); lys.lookAt(0,2.6,0); scene.add(lys);
  const hale = figure({robe:0x2c2a3a, h:1.7}); hale.position.set(0.4,0,3.6); hale.lookAt(0,2.6,0); scene.add(hale);
  const dust = fireflies(100, 12, 0x6fb7ff, [0.2,7]); dust.material.size=.06; dust.material.opacity=.35; scene.add(dust);
  return {
    scene,
    cam:{mode:'orbit', center:[0,2.2,0], r:[9,7], h:[2.4,3.4], a0:0.5, speed:0.05},
    update(t){
      shardCore.scale.setScalar(1+Math.sin(t*3.2)*0.12);
      shardCore.rotation.y = t*0.6;
      containmentRings.forEach((ring,i)=>{
        ring.rotation.x=t*(.12+i*.05)*(i%2?-1:1)+i*.62;
        ring.rotation.z=t*(.09+i*.04)*(i%2?1:-1)+i*.47;
      });
      shardLight.intensity = 18+Math.sin(t*3.2)*4;
      shardGlow.material.opacity = 0.35+Math.sin(t*3.2)*0.15;
      holo.rotation.y = t*0.35;
      arcTimer -= 0.016;
      if(arcTimer<=0){
        arcTimer = 0.14;
        arcs.forEach(a=>{ scene.remove(a); a.geometry.dispose(); a.material.dispose(); });
        arcs = [];
        for(let i=0;i<3;i++){
          const a2 = i/3*Math.PI*2 + rand(0.5);
          const arc = boltLine(V3(0,2.6,0), V3(Math.cos(a2)*2.2, 2.6+Math.sin(a2)*2.2*0.4, Math.sin(a2)*1.4), 0x9fd4ff, 0.5);
          scene.add(arc); arcs.push(arc);
        }
      }
    }
  };
}

/* Ch.15 — The Unveiling Tide */
function buildS15(world){
  const scene = new THREE.Scene();
  env(scene,{fogColor:0x0a0e1a, fogNear:30, fogFar:350, hemiSky:0x2c3448, hemiGnd:0x0a0c12, hemiI:.5,
    dir:[-10,40,-20], dirColor:0x9fb8e8, dirI:.4});
  scene.add(skyDome(0x0a0e1e, 0x232c44, 0x06080e));
  scene.add(starField(400));
  const water = makeWater({deep:0x0a1420, shallow:0x1c3c50, amp:.5, freq:.1, speed:1.6, storm:1,
    fogColor:0x0a0e1a, fogFar:350, glowColor:0x1c4a6a, glowStr:.3, sunColor:0xcfe4ff});
  scene.add(water);
  const serpent = sailboat({scale:1.1, hull:0x6b4226});
  serpent.userData.ph=0.8; scene.add(serpent);
  // ring of light bending in the sky
  const skyRing = fractureRing(20); skyRing.position.set(0,38,-80); scene.add(skyRing);
  // ghost fleet spiraling
  const ghosts = new THREE.Group();
  for(let i=0;i<6;i++){
    const gs = ghostShip(rand(.7,1.2), .13);
    const a = i/6*Math.PI*2;
    gs.position.set(Math.cos(a)*24, -1.5, Math.sin(a)*24-26);
    gs.userData.a = a; ghosts.add(gs);
  }
  scene.add(ghosts);
  // storm
  const rain = rainField(900, 55, 32); rain.material.size=0.16; rain.material.opacity=0.85; scene.add(rain);
  const deckLight = new THREE.PointLight(0xffc37a, 2, 10, 2); deckLight.position.set(0,2.2,0); scene.add(deckLight);
  let bolt = null, boltT = 0, nextBolt = 2.5;
  const boltFlash = new THREE.PointLight(0xcfe4ff, 0, 200, 1.4); boltFlash.position.set(0,25,-30); scene.add(boltFlash);
  const lb = lockboxNecklace({open:false,scale:.82}); lb.position.set(0.8,1.1,0); scene.add(lb);
  const beam = glow(0x9fd8ff, 6, 0); beam.position.set(0.8,2.2,0); scene.add(beam);
  let opened = false;
  return {
    scene,
    cam:{mode:'path', from:[7,2.6,11], to:[2.5,3.4,7], look:[0,1.6,-6], lookTo:[0,6,-30],
      cuts:[{at:9,from:[2.3,1.6,6.8],to:[1.3,2.0,4.2],look:[.8,1.1,0],lookTo:[.8,2.2,-6]},{at:19,from:[-5,4.8,10],to:[0,7,16],look:[0,4,-22],lookTo:[0,10,-38]}]},
    update(t, dt, w2){
      water.userData.tick(t);
      skyRing.userData.tick(t*1.6);
      animateBoat(serpent,t,.3,.11);
      ghosts.children.forEach(gs=>{
        gs.userData.a += 0.0035;
        const r = 24 - Math.min(5, t*0.18);
        gs.position.x = Math.cos(gs.userData.a)*r;
        gs.position.z = Math.sin(gs.userData.a)*r-26;
      });
      // rain fall
      const rp = rain.geometry.attributes.position;
      for(let i=0;i<rp.count;i++){
        rp.array[i*3+1] -= 0.55;
        if(rp.array[i*3+1] < 0) rp.array[i*3+1] = 32;
      }
      rp.needsUpdate = true;
      // lightning
      boltT += dt;
      if(t>nextBolt){
        nextBolt = t + rand(1.6,4);
        const bx = rand(-30,30), bz = rand(-60,-15);
        if(bolt){ scene.remove(bolt); bolt.geometry.dispose(); }
        bolt = boltLine(V3(bx,34,bz), V3(bx+rand(-6,6),0,bz), 0xd8ecff, 4);
        scene.add(bolt);
        boltFlash.position.set(bx,20,bz); boltFlash.intensity = 90;
        world.flash('#cfe4ff', 0.35);
        world.thunder && world.thunder();
      }
      if(bolt && boltT>0){ /* keep until next */ }
      boltFlash.intensity = Math.max(0, boltFlash.intensity - 3.5);
      // lockbox opens at the climax
      lb.userData.light.intensity = 2.5+Math.sin(t*4)*1.2;
      lb.userData.setOpen(THREE.MathUtils.smoothstep(t,19.8,22.1));
      if(!opened && t>20){
        opened = true;
        world.flash('#eaf4ff', 0.9);
        beam.material.opacity = 0.85;
      }
      if(opened){
        beam.scale.set(6+Math.sin(t*3)*2, 6+Math.sin(t*3)*2, 1);
        w2.white && w2.white(Math.min(1,(t-22)/4));
      }
    }
  };
}

/* ============ CHAPTER METADATA ============ */
const SCENES = [
{ ch:'Chapter One', title:'Rum and Regret in Rosetown', dur:27, build:buildS1,
  audio:{ocean:.45, drone:.15, wind:.1, magic:false, storm:false},
  caps:[
    [1.2,'A waterfront dive bar in a small Caribbean port. Jalen Creed nurses a weak rum — and a heavier past.'],
    [8.4,'<i>&ldquo;Some stories are heavier than others, eh? The sea&hellip; she listens to those heavy stories.&rdquo;</i>'],
    [15.6,'<i>&ldquo;Sometimes, she even offers a way to rewrite them.&rdquo;</i>'],
    [21.4,'Just passing through — a sailor chasing a horizon he cannot name.']]},
{ ch:'Chapter Two', title:'Stillness in the Triangle', dur:27, build:buildS2,
  audio:{ocean:.15, drone:.5, wind:.2, magic:true, storm:false},
  caps:[
    [1.2,'The storm didn&rsquo;t rage. It just&hellip; stopped.'],
    [7.8,'The compass spins like a drunken sailor. The GPS: a useless string of dashes.'],
    [14.6,'A flash of gold among the debris — beside an island that graced no chart.'],
    [21.2,'<i>Against his better judgment — a familiar companion — curiosity wins.</i>']]},
{ ch:'Chapter Three', title:'The Weight of What Was', dur:28, build:buildS3, visual:'archive',
  audio:{ocean:.3, drone:.3, wind:.15, magic:true, storm:false},
  caps:[
    [1.2,'A lockbox, rust-eaten. The year 1708 crudely engraved on its lid.'],
    [7.6,'A gold coin. A silver chain threaded through a dark-blue gem that pulses like a heartbeat.'],
    [14.6,'<i>&ldquo;This truth ain&rsquo;t power. It&rsquo;s a curse. You wear this, you see what they buried.&rdquo;</i>'],
    [22.0,'The price of knowledge may be steeper than any gold.']]},
{ ch:'Chapter Four', title:'Whispers in the Static', dur:25, build:buildS4, visual:'signal',
  audio:{ocean:0, drone:.7, wind:.1, magic:true, storm:false},
  caps:[
    [1.2,'Each touch of the gem peels back the past — a telescope, a wrench, a piece of driftwood.'],
    [8.2,'Hundreds of miles away, a dormant machine flickers to life beneath an ancient city.'],
    [15.6,'<i>&ldquo;The Weaver has awakened&hellip; Prepare the Seeker. Our hunt begins.&rdquo;</i>']]},
{ ch:'Chapter Five', title:'Whispers of Ancient Wood', dur:28, build:buildS5, visual:'archive',
  audio:{ocean:0, drone:.3, wind:.55, magic:true, storm:false},
  caps:[
    [1.2,'Grandma Debbie&rsquo;s mahogany tree — a silent observer of centuries.'],
    [7.8,'He nudges the gem against the bark&hellip; and becomes the tree.'],
    [14.6,'A wedding. A hanging. Settlements rising where forests stood. Joy and grief, ring by ring.'],
    [22.0,'The necklace is a conduit to the very soul of the past.']]},
{ ch:'Chapter Six', title:'Shadows and Whispers', dur:27, build:buildS6,
  audio:{ocean:.4, drone:.35, wind:.2, magic:false, storm:false},
  caps:[
    [1.2,'Port Royal. The same sleek black yacht keeps appearing at every stop.'],
    [8.0,'Leo&rsquo;s sharp eyes miss nothing: <i>&ldquo;Dad&hellip; that man is watching us. Again.&rdquo;</i>'],
    [15.4,'<i>&ldquo;Be wary of those with clean clothes and empty eyes. They seek what you have.&rdquo;</i>'],
    [22.2,'The hunt for the necklace has begun.']]},
{ ch:'Chapter Seven', title:'The Unveiling', dur:26, build:buildS7, visual:'signal',
  audio:{ocean:0, drone:.6, wind:.1, magic:true, storm:false},
  caps:[
    [1.2,'The gem shows him Thorne&rsquo;s hidden chamber — archaic, yet unnervingly advanced.'],
    [8.0,'<i>&ldquo;The Catalyst&hellip; retrieve the Weaver before its power is fully awakened.&rdquo;</i>'],
    [15.2,'A triple-ring spiral wrapped around a dark center.'],
    [20.6,'Using the necklace isn&rsquo;t just seeing the past. It&rsquo;s broadcasting.']]},
{ ch:'Chapter Eight', title:'The Serpent&rsquo;s Shadow', dur:26, build:buildS8,
  audio:{ocean:0, drone:.45, wind:.1, magic:false, storm:false},
  caps:[
    [1.2,'<i>&ldquo;The Weaver, Captain — the key to truths hidden for millennia. Hand it over.&rdquo;</i>'],
    [8.0,'<i>&ldquo;I don&rsquo;t know what you think this is. But whatever it is — it&rsquo;s mine.&rdquo;</i>'],
    [14.8,'A table shoved. A doorway cleared. <i>&ldquo;Maya! Leo! Get out!&rdquo;</i>'],
    [20.8,'The cabin erupts into chaos.']]},
{ ch:'Chapter Nine', title:'Desperate Escape, Echoing Power', dur:28, build:buildS9,
  audio:{ocean:.7, drone:.3, wind:.3, magic:true, storm:false},
  caps:[
    [1.2,'A wave of deep blue light slams into Thorne — the necklace has acted on its own.'],
    [8.0,'The Sea Serpent tears away into the twilight.'],
    [14.6,'A voice, ancient and within: <i>&ldquo;The ancient paths&hellip; are not forgotten.&rdquo;</i>'],
    [21.4,'On the horizon — a vessel of impossible light.']]},
{ ch:'Chapter Ten', title:'The Keeper of Forgotten Tides', dur:29, build:buildS10,
  audio:{ocean:.5, drone:.4, wind:.2, magic:true, storm:false},
  caps:[
    [1.2,'<i>&ldquo;I am Naia, Keeper of Forgotten Tides. You carry the Weaver.&rdquo;</i>'],
    [8.4,'<i>&ldquo;The tides choose those who bear the weight of loss — and the strength to endure it.&rdquo;</i>'],
    [16.2,'<i>&ldquo;The fracture will spread. The Seekers will find you.&rdquo;</i>'],
    [22.6,'Ahead: a threshold to a truth he can no longer avoid.']]},
{ ch:'Chapter Eleven', title:'Heart of Shifting Sands', dur:29, build:buildS11, visual:'tide',
  audio:{ocean:.2, drone:.3, wind:.15, magic:true, storm:false},
  caps:[
    [1.2,'A lagoon hidden from the world — an island of living, shifting sand.'],
    [8.2,'<i>&ldquo;Touch the Weaver to these sands, Jalen Creed. Show me your heart&rsquo;s desire.&rdquo;</i>'],
    [15.8,'He sees their futures: Maya decoding vanished civilizations. Leo following truth into the FBI. A dream within reach.'],
    [22.8,'The Weaver responds to his hope.']]},
{ ch:'Chapter Twelve', title:'Whispers of Opportunity', dur:25, build:buildS12,
  audio:{ocean:.6, drone:.1, wind:.3, magic:false, storm:false},
  caps:[
    [1.2,'Small touches. Quiet questions. Forgotten trade routes and overlooked harvests.'],
    [8.4,'Captain Creed&rsquo;s &ldquo;lucky streak&rdquo; becomes legend in the ports — and stays a secret.'],
    [16.0,'But unseen eyes are still watching, waiting for a mistake.']]},
{ ch:'Chapter Thirteen', title:'The Echo Between Waves', dur:29, build:buildS13, visual:'tide',
  audio:{ocean:.4, drone:.55, wind:.3, magic:true, storm:true},
  caps:[
    [1.2,'The sea glows with its own sky. Ghost-ships drift beneath the hull.'],
    [8.2,'<i>&ldquo;The Weaver blurs the lines when its bearer wrestles between truth and fear.&rdquo;</i>'],
    [15.8,'<i>&ldquo;Memory is the currency of power.&rdquo;</i>'],
    [21.8,'Lightning from a clear sky — the Serpent&rsquo;s Shadow has found them.']]},
{ ch:'Chapter Fourteen', title:'The Weight of the Unseen', dur:28, build:buildS14,
  audio:{ocean:0, drone:.8, wind:.1, magic:true, storm:false},
  caps:[
    [1.2,'Beneath Lisbon, the Seekers gather around the Shard of Origin.'],
    [8.2,'<i>&ldquo;The Weaver was never meant to be a weapon. It&rsquo;s a mirror — showing everything we&rsquo;ve buried.&rdquo;</i>'],
    [16.0,'<i>&ldquo;Then perhaps we deserve to be destroyed.&rdquo;</i>'],
    [21.8,'<i>&ldquo;He will bring it to us. All paths lead here — to the Unveiling.&rdquo;</i>']]},
{ ch:'Chapter Fifteen', title:'The Unveiling Tide', dur:30, build:buildS15,
  audio:{ocean:1, drone:.5, wind:.6, magic:true, storm:true},
  caps:[
    [1.2,'<i>&ldquo;Let it overload. The fracture is the door.&rdquo;</i>'],
    [7.6,'The ocean folds. Centuries crash in the same space.'],
    [14.2,'<i>&ldquo;Hold on to the truth, Jalen Creed!&rdquo;</i> — He tears the box open.'],
    [21.4,'The Sea Serpent vanishes into the light.']]}
];

/* ============ AUDIO ============ */
const AudioSys = {
  ctx:null, master:null, started:false, muted:false,
  oceanGain:null, windGain:null, droneGain:null, delay:null,
  cfg:{}, magicT:3, stormT:6,
  init(){
    if(this.started) return;
    try{
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.ctx = ctx; this.started = true;
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      const nb = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
      const mkLoop = ()=>{ const s = ctx.createBufferSource(); s.buffer=nb; s.loop=true; s.start(); return s; };
      // ocean
      const oF = ctx.createBiquadFilter(); oF.type='lowpass'; oF.frequency.value=380;
      this.oceanGain = ctx.createGain(); this.oceanGain.gain.value=0;
      mkLoop().connect(oF); oF.connect(this.oceanGain); this.oceanGain.connect(this.master);
      const oLfo = ctx.createOscillator(); oLfo.frequency.value=0.07;
      const oLfoG = ctx.createGain(); oLfoG.gain.value=0.05;
      oLfo.connect(oLfoG); oLfoG.connect(this.oceanGain.gain); oLfo.start();
      // wind
      const wF = ctx.createBiquadFilter(); wF.type='bandpass'; wF.frequency.value=700; wF.Q.value=0.5;
      this.windGain = ctx.createGain(); this.windGain.gain.value=0;
      mkLoop().connect(wF); wF.connect(this.windGain); this.windGain.connect(this.master);
      // drone
      this.droneGain = ctx.createGain(); this.droneGain.gain.value=0;
      const dF = ctx.createBiquadFilter(); dF.type='lowpass'; dF.frequency.value=240;
      [54, 81.2].forEach(f=>{ const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        o.connect(dF); o.start(); });
      dF.connect(this.droneGain); this.droneGain.connect(this.master);
      // delay for chimes
      this.delay = ctx.createDelay(1); this.delay.delayTime.value=0.45;
      const fb = ctx.createGain(); fb.gain.value=0.35;
      const wet = ctx.createGain(); wet.gain.value=0.3;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.master);
    }catch(e){ console.warn('audio unavailable', e); }
  },
  setScene(cfg){
    this.cfg = cfg||{};
    if(!this.started) return;
    const t = this.ctx.currentTime;
    const ramp = (param,v)=>{ param.cancelScheduledValues(t); param.setValueAtTime(param.value,t);
      param.linearRampToValueAtTime(v, t+1.6); };
    ramp(this.oceanGain.gain, (cfg.ocean||0)*0.4);
    ramp(this.windGain.gain, (cfg.wind||0)*0.16);
    ramp(this.droneGain.gain, (cfg.drone||0)*0.055);
  },
  chime(){
    if(!this.started || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const f = [261.63,293.66,329.63,392,440,523.25][Math.floor(Math.random()*6)];
    const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.09, t+0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t+2.8);
    o.connect(g); g.connect(this.master); g.connect(this.delay);
    o.start(t); o.stop(t+3);
  },
  thunder(){
    if(!this.started || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    s.buffer = nb;
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=130;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5,t);
    g.gain.exponentialRampToValueAtTime(0.001, t+2.6);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t+2.8);
  },
  tick(dt){
    if(!this.started) return;
    if(this.cfg.magic){ this.magicT -= dt; if(this.magicT<=0){ this.magicT = 3.5+Math.random()*5; this.chime(); } }
    if(this.cfg.storm){ this.stormT -= dt; if(this.stormT<=0){ this.stormT = 5+Math.random()*7; this.thunder(); } }
  },
  toggleMute(){
    this.muted = !this.muted;
    if(this.started) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }
};

/* Optional recorded narration. Drop licensed recordings into assets/audio and add
   their chapter keys to assets/audio/manifest.json. The show remains caption-led
   until recordings are supplied, avoiding synthetic voices masquerading as cast. */
const Narration = {
  manifest:null, ready:false,
  async init(){
    if(this.ready) return;
    this.ready = true;
    try { this.manifest = await fetch('./assets/audio/manifest.json').then(r=>r.ok?r.json():null); }
    catch(e) { this.manifest = null; }
  },
  setScene(chapterIndex){
    if(!this.manifest?.chapters) return;
    const src = this.manifest.chapters[String(chapterIndex+1)];
    narrationEl.pause(); narrationEl.removeAttribute('src'); narrationEl.load();
    if(!src) return;
    narrationEl.src = './assets/audio/' + src;
    narrationEl.currentTime = 0;
    narrationEl.play().catch(()=>{});
  },
  muted(value){ narrationEl.muted = value; }
};

/* ============ PLAYBACK ENGINE ============ */
const $ = id => document.getElementById(id);
const fadeEl=$('fade'), flashEl=$('flash'), whiteEl=$('whitefade'),
  titlecard=$('titlecard'), tcCh=$('tc-ch'), tcTitle=$('tc-title'),
  capEl=$('caption'), progfill=$('progfill'), labelEl=$('scene-label'),
  controls=$('controls'), dotsEl=$('dots'), startEl=$('start'), endEl=$('endcard'),
  memoryLanguage=$('memory-language'), narrationEl=$('narration');
const beginButton=$('btn-begin'), loadMeter=$('asset-load-fill'), loadNote=$('load-note');
beginButton.disabled=true;
const productionReady=preloadProductionAssets(progress=>{
  if(loadMeter) loadMeter.style.width=`${Math.round(progress*100)}%`;
  if(loadNote) loadNote.textContent=`preparing production surfaces · ${Math.round(progress*100)}%`;
}).then(()=>{
  beginButton.disabled=false;
  if(loadNote) loadNote.innerHTML='best with sound &#128266; &nbsp;&middot;&nbsp; about 7 minutes &nbsp;&middot;&nbsp; use &#9664; &#9654; to jump chapters';
  document.body.classList.add('assets-ready');
}).catch(error=>{
  console.warn('Production textures could not be preloaded; continuing with material fallbacks.',error);
  beginButton.disabled=false;
  if(loadNote) loadNote.textContent='surface preload incomplete · the voyage can still begin';
});

let idx=0, sceneT=0, playing=false, transitioning=false, cur=null, curCap=-1, shakeAmt=0;
const _look = new THREE.Vector3();
const wait = ms => new Promise(r=>setTimeout(r,ms));

const world = {
  flash(color, peak=0.5){
    flashEl.style.transition='none'; flashEl.style.background=color;
    flashEl.style.opacity=peak;
    void flashEl.offsetWidth;
    flashEl.style.transition='opacity .8s ease'; flashEl.style.opacity=0;
  },
  shake(a){ shakeAmt = Math.max(shakeAmt, a); },
  white(k){ whiteEl.style.opacity = k; },
  thunder(){ AudioSys.thunder(); }
};

function disposeCur(){
  if(!cur) return;
  cur.scene.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); }
  });
  cur = null;
}

async function loadScene(i, useFade=true){
  if(transitioning) return;
  transitioning = true;
  if(useFade){ fadeEl.style.opacity = 1; await wait(700); }
  disposeCur();
  idx = ((i % SCENES.length) + SCENES.length) % SCENES.length;
  const def = SCENES[idx];
  cur = def.build(world);
  cur.scene.traverse(o=>{
    if(o.isMesh && !o.material?.transparent && o.material?.side!==THREE.BackSide){
      o.receiveShadow = true;
      o.castShadow = !o.userData.tick && o.geometry?.type!=='PlaneGeometry';
    }
  });
  if(new URLSearchParams(location.search).has('nospr'))
    cur.scene.traverse(o=>{ if(o.isSprite) o.visible=false; });
  sceneT = 0; curCap = -1; shakeAmt = 0;
  whiteEl.style.opacity = 0;
  tcCh.textContent = def.ch;
  tcTitle.innerHTML = def.title;
  labelEl.innerHTML = 'Ch.'+(idx+1)+' &mdash; '+def.title;
  capEl.classList.remove('show');
  updateDots();
  AudioSys.setScene(def.audio);
  Narration.setScene(idx);
  fadeEl.style.opacity = 0;
  transitioning = false;
}

function updateDots(){
  [...dotsEl.children].forEach((d,i)=>{
    d.className = 'dot' + (i===idx?' active':(i<idx?' done':''));
  });
}

function setPlaying(p){
  playing = p;
  $('play-ico').innerHTML = p ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}

function endShow(){
  setPlaying(false);
  endEl.classList.remove('gone');
  endEl.classList.add('on');
  controls.classList.add('hidden');
}

/* camera */
function applyCamera(){
  const def = SCENES[idx], base = cur.cam;
  const cuts = base.cuts || [];
  let cut = null, nextAt = def.dur;
  for(let i=0;i<cuts.length;i++){
    if(sceneT>=cuts[i].at){ cut=cuts[i]; nextAt=cuts[i+1]?.at ?? def.dur; }
  }
  const c = cut ? {...base,...cut} : base;
  const shotStart = cut?.at ?? 0;
  const k = smooth(Math.min(1, (sceneT-shotStart)/Math.max(.01,nextAt-shotStart)));
  if(c.mode==='path'){
    camera.position.set(lerp(c.from[0],c.to[0],k), lerp(c.from[1],c.to[1],k), lerp(c.from[2],c.to[2],k));
    _look.set(lerp(c.look[0],c.lookTo[0],k), lerp(c.look[1],c.lookTo[1],k), lerp(c.look[2],c.lookTo[2],k));
  } else {
    const a = c.a0 + sceneT*c.speed;
    const r = lerp(c.r[0],c.r[1],k), h = lerp(c.h[0],c.h[1],k);
    camera.position.set(c.center[0]+Math.cos(a)*r, h, c.center[2]+Math.sin(a)*r);
    _look.set(c.center[0], c.center[1], c.center[2]);
  }
  camera.position.x += Math.sin(sceneT*0.5)*0.06;
  camera.position.y += Math.sin(sceneT*0.7+1)*0.05;
  camera.lookAt(_look);
  if(shakeAmt>0.0005){
    camera.position.x += (Math.random()-.5)*shakeAmt;
    camera.position.y += (Math.random()-.5)*shakeAmt;
    camera.position.z += (Math.random()-.5)*shakeAmt;
  }
  shakeAmt = 0;
}

/* captions + title card */
function updateOverlays(){
  const def = SCENES[idx];
  titlecard.classList.toggle('show', sceneT>0.25 && sceneT<5.0);
  memoryLanguage.className = def.visual && sceneT>3.5 && sceneT<def.dur-1 ? def.visual : '';
  let active = -1;
  for(let i=0;i<def.caps.length;i++){
    const t0 = def.caps[i][0];
    const t1 = (i+1<def.caps.length) ? def.caps[i+1][0] : def.dur;
    if(sceneT>=t0 && sceneT<t1-0.4){ active = i; break; }
  }
  if(active!==curCap){
    curCap = active;
    if(active>=0){ capEl.innerHTML = def.caps[active][1]; capEl.classList.add('show'); }
    else capEl.classList.remove('show');
  }
  progfill.style.width = Math.min(100, sceneT/def.dur*100)+'%';
}

/* main loop */
const clock = new THREE.Clock();
renderer.setAnimationLoop(()=>{
  const dt = Math.min(0.05, clock.getDelta());
  if(cur){
    if(playing && !transitioning) sceneT += dt;
    cur.update(sceneT, dt, world);
    applyCamera();
    renderer.render(cur.scene, camera);
    updateOverlays();
  }
  AudioSys.tick(dt);
});

/* controls */
$('btn-play').onclick = ()=> setPlaying(!playing);
$('btn-next').onclick = ()=>{ if(idx>=SCENES.length-1){ endShow(); } else { loadScene(idx+1); setPlaying(true); } };
$('btn-prev').onclick = ()=>{ loadScene(idx-1); setPlaying(true); };
$('btn-mute').onclick = ()=>{
  AudioSys.init();
  const m = AudioSys.toggleMute();
  Narration.muted(m);
  $('snd-ico').innerHTML = m
    ? '<path d="M3 9v6h4l5 5V4L7 9H3zm14.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
};
SCENES.forEach((s,i)=>{
  const d = document.createElement('button');
  d.className='dot'; d.title = s.title;
  d.onclick = ()=>{ loadScene(i); setPlaying(true); };
  dotsEl.appendChild(d);
});
addEventListener('keydown', e=>{
  if(e.code==='Space'){ e.preventDefault(); setPlaying(!playing); }
  if(e.code==='ArrowRight') $('btn-next').click();
  if(e.code==='ArrowLeft') $('btn-prev').click();
});

/* idle-hide controls */
let idleT = null;
function poke(){
  controls.classList.remove('hidden');
  clearTimeout(idleT);
  idleT = setTimeout(()=>{ if(playing) controls.classList.add('hidden'); }, 3500);
}
['pointermove','touchstart','click'].forEach(ev=>addEventListener(ev, poke, {passive:true}));

/* auto-advance */
setInterval(()=>{
  if(playing && !transitioning && cur && sceneT>=SCENES[idx].dur){
    if(idx>=SCENES.length-1) endShow();
    else loadScene(idx+1);
  }
}, 250);

/* start / replay */
beginButton.onclick = async ()=>{
  await productionReady;
  AudioSys.init();
  await Narration.init();
  startEl.classList.add('gone');
  document.body.classList.add('playing');
  poke();
  await loadScene(0, false);
  fadeEl.style.opacity = 0;
  setPlaying(true);
};
$('btn-replay').onclick = async ()=>{
  endEl.classList.remove('on');
  endEl.classList.add('gone');
  await loadScene(0, true);
  setPlaying(true);
  poke();
};

/* deep-link: ?scene=N&t=SECONDS (skips intro, no audio) */
(function(){
  const q = new URLSearchParams(location.search);
  const s = parseInt(q.get('scene')||'0',10);
  if(s>0){
    startEl.classList.add('gone');
    document.body.classList.add('playing');
    productionReady.then(()=>loadScene(s-1, false)).then(()=>{
      fadeEl.style.opacity = 0;
      sceneT = parseFloat(q.get('t')||'0');
      setPlaying(true);
    });
    poke();
  } else {
    fadeEl.style.opacity = 1;
  }
})();
window.__show = { goto:i=>loadScene(i), index:()=>idx };
