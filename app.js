import * as THREE from 'three';

/* ============ CORE RENDERER / UTILITIES ============ */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, .1, 2500);
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
  {color, flatShading:true, roughness:.85, metalness:.05}, o));
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
  const hullMat = std(o.hull??0x6b4226), dark = std(0x3a2415);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6,0.85,1.45), hullMat); hull.position.y=0.42;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.72,1.5,4), hullMat);
  bow.rotation.z=-Math.PI/2; bow.rotation.x=Math.PI/4; bow.position.set(2.55,0.42,0);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(3.75,0.12,1.55), dark); rim.position.y=0.9;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.075,4.6,6), dark); mast.position.set(0.35,3.0,0);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,2.6,6), dark);
  boom.rotation.z=Math.PI/2; boom.position.set(-0.75,1.55,0);
  g.add(hull,bow,rim,mast,boom);
  if(o.sailUp!==false){
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0.32,5.15,0,  -2.0,1.55,0,  0.32,1.55,0 ]),3));
    sailGeo.computeVertexNormals();
    g.add(new THREE.Mesh(sailGeo, std(o.sail??0xd9cfb8,{side:THREE.DoubleSide})));
    const jibGeo = new THREE.BufferGeometry();
    jibGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0.42,4.7,0,  2.45,1.0,0,  0.42,1.2,0 ]),3));
    jibGeo.computeVertexNormals();
    g.add(new THREE.Mesh(jibGeo, std(o.sail??0xd9cfb8,{side:THREE.DoubleSide})));
  }
  g.scale.setScalar(o.scale??1);
  return g;
}

function blackYacht(o={}){
  const g = new THREE.Group();
  const hullMat = std(0x0b0d11,{roughness:.4, metalness:.5});
  const hull = new THREE.Mesh(new THREE.BoxGeometry(8.6,1.0,2.3), hullMat); hull.position.y=0.5;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.12,2.6,4), hullMat);
  bow.rotation.z=-Math.PI/2; bow.rotation.x=Math.PI/4; bow.position.set(5.4,0.5,0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4,1.0,1.7), std(0x11151c,{roughness:.3,metalness:.6}));
  cabin.position.set(-0.4,1.5,0);
  const winStrip = new THREE.Mesh(new THREE.BoxGeometry(3.0,0.28,1.74), basic(0xbfe3ff));
  winStrip.position.set(-0.4,1.62,0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.06,2.4,6), hullMat);
  mast.position.set(-1.8,3.0,0);
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(8.0,0.07,2.34), basic(0x2fd4c8));
  glowStrip.position.set(-0.2,0.22,0);
  g.add(hull,bow,cabin,winStrip,mast,glowStrip);
  g.scale.setScalar(o.scale??1);
  return g;
}

function naiaVessel(o={}){
  const g = new THREE.Group();
  const hullMat = std(0x0b1218,{roughness:.25, metalness:.7, emissive:0x0e2a38, emissiveIntensity:.7});
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.62,7.5,6), hullMat);
  hull.rotation.z=Math.PI/2; hull.scale.z=0.55; hull.position.y=0.35;
  const hull2 = new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.02,3.2,6), hullMat);
  hull2.rotation.z=-Math.PI/2; hull2.scale.z=0.55; hull2.position.set(-5.2,0.35,0);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), basic(0x9fe8ff));
  crystal.position.set(1.4,2.1,0);
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.09,2.4,6), hullMat);
  pylon.position.set(1.4,1.2,0);
  const under = glow(0x5fd8ff, 9, .5); under.position.y=0.1;
  const top = glow(0x9fe8ff, 4, .7); top.position.copy(crystal.position);
  g.add(hull,hull2,crystal,pylon,under,top);
  g.userData.crystal = crystal;
  g.scale.setScalar(o.scale??1);
  return g;
}

const CHARACTER_PRESETS = {
  jalen:{skin:0x70442f, coat:0x4b382c, shirt:0xd8c6a3, hair:0x171310, hairStyle:'close', build:1.08},
  maya:{skin:0xb47b5d, coat:0x6e5a8a, shirt:0xd6c9e7, hair:0x241817, hairStyle:'long', build:.86},
  leo:{skin:0xb47b5d, coat:0x315776, shirt:0xc8dbdf, hair:0x241817, hairStyle:'close', build:.76},
  thorne:{skin:0xc8b8a8, coat:0x171a22, shirt:0xdce3e7, hair:0x9c9a9a, hairStyle:'parted', build:1.0},
  naia:{skin:0x5c382f, coat:0x254b67, shirt:0x9fe8ff, hair:0x11151c, hairStyle:'crown', build:1.05}
};

function limb(radius, length, material){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius*1.08, length, 7), material);
  return m;
}

function figure(o={}){
  const preset = CHARACTER_PRESETS[o.character] || {};
  const h = o.h??1.7, build = o.build??preset.build??1;
  const skinColor = o.skin??preset.skin??0xc9a486;
  const coatColor = o.color??preset.coat??0x5a4632;
  const shirtColor = o.shirt??preset.shirt??0xc6b597;
  const g = new THREE.Group(), skin = std(skinColor), coat = std(coatColor), dark = std(0x17191c);
  const torsoY = h*.58, shoulderY = h*.74, headY = h*.91;

  if(o.robe){
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(.14*build,.38*build,h*.76,8), std(o.robe));
    robe.position.y=h*.38; g.add(robe);
  } else {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.14*build,h*.38,5,8), coat);
    torso.position.y=torsoY; torso.scale.z=.82; g.add(torso);
    const shirt = new THREE.Mesh(new THREE.PlaneGeometry(.15*build,h*.28), std(shirtColor));
    shirt.position.set(0,torsoY,.125*build); g.add(shirt);
    [-1,1].forEach(side=>{
      const leg=limb(.078*build,h*.34,dark); leg.position.set(side*.085*build,h*.18,0); g.add(leg);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.13*build,.07,.22*build),std(0x111216));
      shoe.position.set(side*.085*build,.035,.045*build); g.add(shoe);
    });
  }
  [-1,1].forEach(side=>{
    const arm=limb(.055*build,h*.34,coat); arm.position.set(side*.19*build,shoulderY,0);
    arm.rotation.z=side*.18; g.add(arm);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.058*build,8,6),skin);
    hand.position.set(side*.245*build,shoulderY-h*.18,0); g.add(hand);
  });
  const neck=limb(.055*build,h*.09,skin); neck.position.y=h*.82; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(h*.095*build,14,10), skin);
  head.position.y=headY; head.scale.set(.88,1,.84); g.add(head);
  const hairMat=std(o.hair??preset.hair??0x201914);
  const hairStyle=o.hairStyle??preset.hairStyle??'close';
  if(hairStyle==='long'){
    const hair=new THREE.Mesh(new THREE.SphereGeometry(h*.102*build,12,9,0,Math.PI*2,0,Math.PI*.72),hairMat);
    hair.position.set(0,headY+h*.025,-.014); hair.scale.z=1.08; g.add(hair);
    [-1,1].forEach(side=>{ const strand=limb(.035*build,h*.2,hairMat); strand.position.set(side*h*.075,headY-h*.075,-.03); g.add(strand); });
  } else {
    const hair=new THREE.Mesh(new THREE.SphereGeometry(h*.101*build,12,8,0,Math.PI*2,0,Math.PI*.55),hairMat);
    hair.position.y=headY+h*.034; g.add(hair);
    if(hairStyle==='parted'){
      const part=new THREE.Mesh(new THREE.BoxGeometry(.015,h*.025,h*.13),std(0xb8b5b0)); part.position.set(.02,headY+h*.11,0); g.add(part);
    }
    if(hairStyle==='crown'){
      const crown=new THREE.Mesh(new THREE.TorusGeometry(h*.105,h*.012,6,20),basic(0x9fe8ff)); crown.position.y=headY+h*.09; crown.rotation.x=Math.PI/2; g.add(crown);
    }
  }
  const eyeMat=basic(0x181b1f); [-1,1].forEach(side=>{
    const eye=new THREE.Mesh(new THREE.SphereGeometry(h*.013,7,5),eyeMat); eye.position.set(side*h*.035,headY+h*.01,h*.077); g.add(eye);
  });
  if(o.staff){
    const st = new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,h*1.05,6), std(0x3a2c1c));
    st.position.set(.29,h*.52,0); g.add(st);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(.1), basic(0x9fe8ff)); cr.position.set(.29,h*1.08,0); g.add(cr);
    g.userData.crystal = cr;
  }
  g.userData.character = o.character || 'extra';
  return g;
}

function jaggedIsland(scale=1){
  const g = new THREE.Group();
  const rock = std(0x232a30,{roughness:.95});
  const rocks = [[0,0, 7,16],[6,-3, 5,10],[-6,2, 4.5,8],[2,5, 3,6]];
  for(const [x,z,r,h] of rocks){
    const m = new THREE.Mesh(new THREE.ConeGeometry(r,h,5), rock);
    m.position.set(x*scale,(h/2-0.6)*scale,z*scale);
    m.rotation.y=rand(6); m.scale.setScalar(scale);
    g.add(m);
  }
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(11*scale,13*scale,1.4,24), std(0x8f8266,{roughness:1}));
  sand.position.y=-0.4; g.add(sand);
  return g;
}

function mahoganyTree(){
  const g = new THREE.Group();
  const bark = std(0x4a3524,{roughness:1});
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55,1.05,4.6,8), bark);
  trunk.position.y=2.3; g.add(trunk);
  for(let i=0;i<6;i++){
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.42,1.6,5), bark);
    const a = i/6*Math.PI*2;
    root.position.set(Math.cos(a)*1.0,0.35,Math.sin(a)*1.0);
    root.rotation.z=Math.cos(a)*0.85; root.rotation.x=-Math.sin(a)*0.85;
    g.add(root);
  }
  const leafMat = std(0x1c3a24,{roughness:1});
  const tips = [];
  for(let i=0;i<5;i++){
    const a = i/5*Math.PI*2 + 0.5;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.3,3.4,6), bark);
    br.position.set(Math.cos(a)*1.5,5.6,Math.sin(a)*1.5);
    br.rotation.z=Math.cos(a)*0.9; br.rotation.x=-Math.sin(a)*0.9;
    g.add(br);
    tips.push([Math.cos(a)*3.0,6.6,Math.sin(a)*3.0]);
  }
  tips.push([0,8.2,0]);
  for(const [x,y,z] of tips){
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.7,2.5),0), leafMat);
    f.position.set(x,y,z); f.rotation.set(rand(3),rand(3),0);
    g.add(f);
  }
  return g;
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

function lockboxNecklace(){
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.3,0.42), std(0x4a3a28,{metalness:.55,roughness:.5}));
  box.position.y=0.15;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.06,0.42), std(0x55432e,{metalness:.55,roughness:.5}));
  lid.position.set(0,0.32,-0.19); lid.rotation.x=-0.9;
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.11,0.014,6,20), std(0xb9c2cc,{metalness:.9,roughness:.3}));
  chain.position.y=0.34; chain.rotation.x=Math.PI/2.3;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), basic(0x3f7dff));
  gem.position.y=0.3;
  const halo = glow(0x3f7dff, 0.8, .8); halo.position.y=0.32;
  const light = new THREE.PointLight(0x3f7dff, 2.4, 8, 2); light.position.y=0.5;
  g.add(box,lid,chain,gem,halo,light);
  g.userData = {gem, halo, light};
  return g;
}

function skeleton(){
  const g = new THREE.Group();
  const bone = std(0xd8d2c4,{roughness:.9});
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8), bone);
  skull.position.set(0.9,0.12,0); skull.scale.set(1,0.85,0.9);
  g.add(skull);
  for(let i=0;i<3;i++){
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2-i*0.03,0.022,6,14,Math.PI), bone);
    rib.position.set(0.45-i*0.16,0.1,0); rib.rotation.y=Math.PI/2;
    g.add(rib);
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.035,0.6,6), bone);
  arm.position.set(0.2,0.08,0.35); arm.rotation.z=Math.PI/2; arm.rotation.y=0.5;
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,0.5,6), bone);
  arm2.position.set(-0.15,0.07,0.55); arm2.rotation.z=Math.PI/2.2;
  g.add(arm,arm2);
  const mound = new THREE.Mesh(new THREE.ConeGeometry(1.5,0.5,12), std(0x9c8f70,{roughness:1}));
  mound.position.y=-0.14; g.add(mound);
  return g;
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
  const base = new THREE.Mesh(new THREE.CylinderGeometry(13,15,1.6,40), std(0xb39b6d,{roughness:1}));
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
  const rock = std(0x3e4c52,{roughness:1});
  for(let i=0;i<11;i++){
    const a = i/11*Math.PI*2 + rand(0.2);
    const r = rand(48,62), h = rand(18,34), w = rand(7,13);
    const m = new THREE.Mesh(new THREE.ConeGeometry(w,h,6), rock);
    m.position.set(Math.cos(a)*r, h/2-2, Math.sin(a)*r);
    m.rotation.y=rand(6);
    g.add(m);
    const mist = glow(0x8fd8d0, rand(14,24), .12);
    mist.position.set(Math.cos(a)*(r-8), 1.5, Math.sin(a)*(r-8));
    g.add(mist);
  }
  return g;
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
  const dock = new THREE.Group();
  const planks = new THREE.Mesh(new THREE.BoxGeometry(14,0.3,9), std(0x5a4632,{roughness:1}));
  planks.position.y=0.55; dock.add(planks);
  for(let x=-6;x<=6;x+=4) for(let z=-3.6;z<=3.6;z+=3.6){
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,1.4,6), std(0x3c2e20));
    st.position.set(x,-0.1,z); dock.add(st);
  }
  const tav = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(7,3.6,5.4), std(0x6e5138,{roughness:.95}));
  main.position.y=2.5; tav.add(main);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01,4.6,2.0,4), std(0x3c2c1e));
  roof.position.y=5.3; roof.rotation.y=Math.PI/4; tav.add(roof);
  for(const wx of [-2.2,0,2.2]){
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9,1.1), basic(0xffb45c));
    win.position.set(wx,2.6,2.71); tav.add(win);
    const wg = glow(0xff9a3c, 2.6, .5); wg.position.set(wx,2.6,3.0); tav.add(wg);
  }
  const sign = textPlane('THE RUSTY ANCHOR', 3.4);
  sign.position.set(0,4.35,2.75); tav.add(sign);
  tav.position.set(0,0.7,-2.2); dock.add(tav);
  const lampLights = [];
  for(const lx of [-5.6,5.6]){
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,2.6,6), std(0x2c2620));
    pole.position.set(lx,2.0,4.0); dock.add(pole);
    const lampGlow = glow(0xffb45c, 3.2, .85); lampGlow.position.set(lx,3.35,4.0); dock.add(lampGlow);
    const pl = new THREE.PointLight(0xff9a3c, 3, 16, 2); pl.position.set(lx,3.3,4.0); dock.add(pl);
    lampLights.push(pl);
  }
  const f1 = figure({character:'jalen', h:1.7}); f1.position.set(-1.2,0.75,3.9); f1.scale.y=0.72;
  const f2 = figure({color:0x3c4452, h:1.65}); f2.position.set(0.4,0.75,3.9); f2.scale.y=0.72;
  dock.add(f1,f2);
  for(const [bx,bz] of [[-4.6,2.6],[4.2,1.8],[-3.8,-0.6]]){
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.38,0.8,9), std(0x6a4e30));
    bar.position.set(bx,1.1,bz); dock.add(bar);
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
      lampLights.forEach((L,i)=>{ L.intensity = 3 + Math.sin(t*9+i*3)*0.35; });
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
  for(let i=0;i<4;i++){
    const pl = new THREE.Mesh(new THREE.BoxGeometry(rand(0.8,1.6),0.08,0.28), std(0x4a3826));
    pl.position.set(rand(-1.5,1.5), 0.06, rand(-1,1)); pl.rotation.y=rand(3); deb.add(pl);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.42,0.45), std(0x54402a));
  crate.position.set(0.4,0.22,-0.4); crate.rotation.y=0.5; deb.add(crate);
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.02,14),
    std(0xd8a83c,{metalness:.9, roughness:.3, emissive:0xaa7a1a, emissiveIntensity:.5}));
  coin.position.set(0.1,0.1,0.35); coin.rotation.x=1.2; deb.add(coin);
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
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(13,16,2.2,28), std(0x9c8f70,{roughness:1}));
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
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(17,17,14,24,1,true),
    std(0x4a4658,{side:THREE.BackSide, roughness:1}));
  wall.position.y=6; scene.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(17,32), std(0x3c4050,{roughness:.7, metalness:.25}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  const mach = new THREE.Group();
  const bronze = std(0x7a5c2e,{metalness:.75, roughness:.4});
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7,2.0,0.5,14), bronze); base.position.y=0.25;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.38,2.8,10), bronze); col.position.y=1.8;
  mach.add(base,col);
  const mRings = [];
  for(let i=0;i<3;i++){
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0+i*0.35,0.05,8,40), bronze);
    r.position.y=2.6; r.rotation.x=Math.PI/2+i*0.5; mach.add(r); mRings.push(r);
  }
  scene.add(mach);
  const crys = [];
  for(let i=0;i<3;i++){
    const a = i/3*Math.PI*2+0.6;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.3,1.4,8), std(0x2a2620));
    ped.position.set(Math.cos(a)*3.4,0.7,Math.sin(a)*3.4); scene.add(ped);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), basic(0x59f2d0));
    cr.position.set(Math.cos(a)*3.4,1.75,Math.sin(a)*3.4); scene.add(cr); crys.push(cr);
  }
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.55,24), std(0xc8b078,{metalness:.7,roughness:.35}));
  dial.position.set(0,1.5,2.0); scene.add(dial);
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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70,36), std(0x16200f,{roughness:1}));
  ground.rotation.x=-Math.PI/2; scene.add(ground);
  const tree = mahoganyTree(); scene.add(tree);
  const upLight = new THREE.PointLight(0x7ae8a0, 5, 22, 2); upLight.position.set(0,1.5,0); scene.add(upLight);
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
    const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,3), std(0x2c2824,{roughness:1}));
    b.position.set(-22+i*5.4+rand(-1,1), h/2, 0); town.add(b);
    if(Math.random()<0.8){
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.6), basic(0xffc37a));
      win.position.set(b.position.x+rand(-1,1), rand(1,Math.max(1.2,h-0.6)), 1.52); town.add(win);
    }
  }
  town.position.set(0,0,-34); scene.add(town);
  const dock = new THREE.Mesh(new THREE.BoxGeometry(26,0.3,4), std(0x4a3a2a,{roughness:1}));
  dock.position.set(-2,0.5,6); scene.add(dock);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,3.0,6), std(0x22201c));
  pole.position.set(9,2.0,6); scene.add(pole);
  const lampG = glow(0xffc37a, 3, .8); lampG.position.set(9,3.6,6); scene.add(lampG);
  const lamp = new THREE.PointLight(0xffb45c, 3, 15, 2); lamp.position.set(9,3.5,6); scene.add(lamp);
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
      lamp.intensity = 3+Math.sin(t*11)*0.3;
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
  const room = new THREE.Mesh(new THREE.BoxGeometry(9,3.6,7), std(0x6a4e36,{side:THREE.BackSide, roughness:.95}));
  room.position.y=1.8; scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9,7), std(0x5a4230,{roughness:1}));
  floor.rotation.x=-Math.PI/2; floor.position.y=0.01; scene.add(floor);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.1), basic(0x1c3a5e));
  win.position.set(-2.2,1.9,-3.48); scene.add(win);
  const winGlow = glow(0x6f9fd8, 2.2, .4); winGlow.position.set(-2.2,1.9,-3.3); scene.add(winGlow);
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.09,1.0), std(0x5a4028)); top.position.y=0.78;
  table.add(top);
  for(const [lx,lz] of [[-0.7,-0.4],[0.7,-0.4],[-0.7,0.4],[0.7,0.4]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.78,0.08), std(0x4a3420));
    leg.position.set(lx,0.39,lz); table.add(leg);
  }
  const lb = lockboxNecklace(); lb.scale.setScalar(0.9); lb.position.y=0.83; table.add(lb);
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
    const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,3), std(0x2a1e16,{roughness:1}));
    b.position.set(-30+i*5.5, h/2, 0); port.add(b);
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
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(18,18,15,24,1,true),
    std(0x3c4054,{side:THREE.BackSide, roughness:1}));
  wall.position.y=6; scene.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18,32), std(0x323a4c,{roughness:.7, metalness:.2}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  // containment frame + Shard
  const frameRing = new THREE.Mesh(new THREE.TorusGeometry(2.2,0.1,10,48), std(0x6a5a3a,{metalness:.8,roughness:.35}));
  frameRing.position.y=2.6; scene.add(frameRing);
  const shardCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65,1),
    basic(0x6fb7ff,{transparent:true, opacity:.9, blending:THREE.AdditiveBlending, depthWrite:false}));
  shardCore.position.y=2.6; scene.add(shardCore);
  const shardShell = new THREE.Mesh(new THREE.SphereGeometry(1.05,28,20),
    std(0x0a1420,{roughness:.15, metalness:.4, transparent:true, opacity:.75}));
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
  const lb = lockboxNecklace(); lb.position.set(0.8,1.1,0); lb.scale.setScalar(1.2); scene.add(lb);
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
    [15.8,'He sees their futures: Maya&rsquo;s discoveries. Leo&rsquo;s justice. A dream within reach.'],
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
$('btn-begin').onclick = async ()=>{
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
    loadScene(s-1, false).then(()=>{
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
