import * as THREE from 'three';

/*
 * Shared production helpers.
 *
 * One Three.js unit is one metre. Texture repeats are therefore chosen from the
 * physical widths published with the bundled Poly Haven CC0 texture sets. This
 * keeps surface scale coherent between a lockbox, a boat and an environment.
 */

const TEXTURE_ROOT = './assets/textures/cc0/polyhaven';
THREE.Cache.enabled = true;
const textureLoader = new THREE.TextureLoader();
const textureBundles = new Map();
const baseTextures = new Map();
let maxAnisotropy = 4;

export function initProductionKit(renderer) {
  maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 4);
}

const SURFACES = {
  wood: {
    folder: 'wooden_planks', diff: 'wooden_planks_diff_1k.jpg',
    normal: 'wooden_planks_nor_gl_1k.jpg', arm: 'wooden_planks_arm_1k.jpg',
    metres: 2, roughness: 0.88, metalness: 0, normalStrength: 0.72
  },
  corrodedMetal: {
    folder: 'rusty_metal_04', diff: 'rusty_metal_04_diff_1k.jpg',
    normal: 'rusty_metal_04_nor_gl_1k.jpg', arm: 'rusty_metal_04_arm_1k.jpg',
    metres: 2, roughness: 0.82, metalness: 0.72, normalStrength: 0.68, metalMap: true
  },
  rock: {
    folder: 'rock_06', diff: 'rock_06_diff_1k.jpg',
    normal: 'rock_06_nor_gl_1k.jpg', arm: 'rock_06_arm_1k.jpg',
    metres: 1.5, roughness: 0.98, metalness: 0, normalStrength: 0.95
  },
  sand: {
    folder: 'sand_01', diff: 'sand_01_diff_1k.jpg',
    normal: 'sand_01_nor_gl_1k.jpg', arm: 'sand_01_arm_1k.jpg',
    metres: 1.5, roughness: 1, metalness: 0, normalStrength: 0.55
  },
  leather: {
    folder: 'brown_leather', diff: 'brown_leather_albedo_1k.jpg',
    normal: 'brown_leather_nor_gl_1k.jpg', arm: 'brown_leather_arm_1k.jpg',
    metres: 0.4, roughness: 0.76, metalness: 0, normalStrength: 0.34
  },
  plaster: {
    folder: 'plastered_wall_05', diff: 'plastered_wall_05_diff_1k.jpg',
    normal: 'plastered_wall_05_nor_gl_1k.jpg', arm: 'plastered_wall_05_arm_1k.jpg',
    metres: 2, roughness: 0.96, metalness: 0, normalStrength: 0.62
  },
  stone: {
    folder: 'stone_tiles_02', diff: 'stone_tiles_02_diff_1k.jpg',
    normal: 'stone_tiles_02_nor_gl_1k.jpg', arm: 'stone_tiles_02_arm_1k.jpg',
    metres: 2, roughness: 0.9, metalness: 0, normalStrength: 0.78
  }
};

function texturePath(surface, file) {
  return `${TEXTURE_ROOT}/${surface.folder}/${file}`;
}

function configureTexture(texture, repeat, color = false, rotation = 0) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.anisotropy = maxAnisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getBaseTexture(surface, file, color = false) {
  const url = texturePath(surface, file);
  if (baseTextures.has(url)) return baseTextures.get(url);
  const texture = textureLoader.load(url);
  texture.anisotropy = maxAnisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  baseTextures.set(url, texture);
  return texture;
}

export async function preloadProductionAssets(onProgress = () => {}) {
  const files = [];
  Object.values(SURFACES).forEach(surface => {
    files.push([surface, surface.diff, true], [surface, surface.normal, false], [surface, surface.arm, false]);
  });
  let complete = 0;
  await Promise.all(files.map(async ([surface, file, color]) => {
    const url = texturePath(surface, file);
    if (!baseTextures.has(url)) {
      const texture = await textureLoader.loadAsync(url);
      texture.anisotropy = maxAnisotropy;
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      baseTextures.set(url, texture);
    }
    complete++;
    onProgress(complete / files.length);
  }));
}

function getTextureBundle(name, repeat, rotation = 0) {
  const surface = SURFACES[name];
  if (!surface) throw new Error(`Unknown production surface: ${name}`);
  const key = `${name}:${repeat[0]}:${repeat[1]}:${rotation}`;
  if (textureBundles.has(key)) return textureBundles.get(key);
  const bundle = {
    map: configureTexture(getBaseTexture(surface, surface.diff, true).clone(), repeat, true, rotation),
    normalMap: configureTexture(getBaseTexture(surface, surface.normal).clone(), repeat, false, rotation),
    armMap: configureTexture(getBaseTexture(surface, surface.arm).clone(), repeat, false, rotation)
  };
  Object.values(bundle).forEach(texture => { texture.needsUpdate = true; });
  textureBundles.set(key, bundle);
  return bundle;
}

function addMacroVariation(material, amount = 0.08, scale = 0.16) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uMacroAmount = { value: amount };
    shader.uniforms.uMacroScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vProductionWorld;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vProductionWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', [
        'varying vec3 vProductionWorld;',
        'uniform float uMacroAmount;',
        'uniform float uMacroScale;',
        'float productionHash(vec2 p) {',
        '  p = fract(p * vec2(123.34, 456.21));',
        '  p += dot(p, p + 45.32);',
        '  return fract(p.x * p.y);',
        '}',
        'void main() {'
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec2 macroCell = floor(vProductionWorld.xz * uMacroScale);',
        'float macroVariation = productionHash(macroCell);',
        'diffuseColor.rgb *= 1.0 + (macroVariation - 0.5) * uMacroAmount;'
      ].join('\n'));
  };
  material.customProgramCacheKey = () => `production-macro-${amount}-${scale}`;
  return material;
}

export function pbr(name, options = {}) {
  const surface = SURFACES[name];
  const physicalSize = options.physicalSize || surface.metres;
  const span = options.span || [physicalSize, physicalSize];
  const repeat = options.repeat || [
    Math.max(0.25, span[0] / physicalSize),
    Math.max(0.25, span[1] / physicalSize)
  ];
  const maps = getTextureBundle(name, repeat, options.rotation || 0);
  const Material = options.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = {
    color: options.color ?? 0xffffff,
    map: options.albedo === false ? null : maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(
      options.normalStrength ?? surface.normalStrength,
      options.normalStrength ?? surface.normalStrength
    ),
    aoMap: maps.armMap,
    aoMapIntensity: options.aoIntensity ?? 0.8,
    roughnessMap: maps.armMap,
    roughness: options.roughness ?? surface.roughness,
    metalnessMap: surface.metalMap && options.metalMap !== false ? maps.armMap : null,
    metalness: options.metalness ?? surface.metalness,
    side: options.side,
    transparent: options.transparent,
    opacity: options.opacity,
    alphaTest: options.alphaTest,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    clearcoat: options.clearcoat,
    clearcoatRoughness: options.clearcoatRoughness
  };
  Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
  const material = new Material(params);
  material.name = `PBR_${name}`;
  return addMacroVariation(material, options.macroAmount ?? 0.1, options.macroScale ?? 0.14);
}

export function solid(color, options = {}) {
  const Material = options.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = {
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.05,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    transparent: options.transparent,
    opacity: options.opacity,
    side: options.side,
    clearcoat: options.clearcoat,
    clearcoatRoughness: options.clearcoatRoughness,
    transmission: options.transmission,
    thickness: options.thickness,
    ior: options.ior,
    attenuationColor: options.attenuationColor,
    attenuationDistance: options.attenuationDistance
  };
  Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
  const material = new Material(params);
  return options.macro === false ? material : addMacroVariation(material, options.macroAmount ?? 0.035, options.macroScale ?? 0.25);
}

export function ensureUvSets(geometry) {
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv1')) geometry.setAttribute('uv1', uv.clone());
  if (uv && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', uv.clone());
  return geometry;
}

export function finish(mesh, options = {}) {
  ensureUvSets(mesh.geometry);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.name) mesh.name = options.name;
  if (options.edgeColor !== undefined) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, options.edgeThreshold ?? 34),
      new THREE.LineBasicMaterial({
        color: options.edgeColor,
        transparent: true,
        opacity: options.edgeOpacity ?? 0.16,
        depthWrite: false,
        toneMapped: true
      })
    );
    edges.name = `${mesh.name || 'part'}_edge_wear`;
    mesh.add(edges);
  }
  return mesh;
}

export function finishAssembly(root) {
  root.traverse(child => {
    if (!child.isMesh) return;
    ensureUvSets(child.geometry);
    child.castShadow = child.material?.transparent ? false : true;
    child.receiveShadow = true;
  });
  return root;
}

export function cylinderBetween(a, b, radius, material, radialSegments = 10, options = {}) {
  const from = a.isVector3 ? a : new THREE.Vector3(...a);
  const to = b.isVector3 ? b : new THREE.Vector3(...b);
  const direction = to.clone().sub(from);
  const mesh = finish(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, options.radiusTop ?? radius, direction.length(), radialSegments),
    material
  ), options);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function curveTube(points, radius, material, tubularSegments = 48, radialSegments = 7, options = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new THREE.Vector3(...p)));
  return finish(new THREE.Mesh(
    new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false),
    material
  ), options);
}

export function roundedPanel(width, height, depth, radius, material, options = {}) {
  const r = Math.min(radius, width * 0.48, height * 0.48);
  const shape = new THREE.Shape();
  shape.moveTo(r, 0);
  shape.lineTo(width - r, 0);
  shape.quadraticCurveTo(width, 0, width, r);
  shape.lineTo(width, height - r);
  shape.quadraticCurveTo(width, height, width - r, height);
  shape.lineTo(r, height);
  shape.quadraticCurveTo(0, height, 0, height - r);
  shape.lineTo(0, r);
  shape.quadraticCurveTo(0, 0, r, 0);
  const bevel = Math.min(depth * 0.18, r * 0.35, 0.045);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: bevel > 0,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel
  });
  geometry.translate(-width / 2, -height / 2, -depth / 2);
  return finish(new THREE.Mesh(geometry, material), options);
}

export function createBoatHullGeometry(options = {}) {
  const length = options.length ?? 8.9;
  const beam = options.beam ?? 2.75;
  const draft = options.draft ?? 0.72;
  const freeboard = options.freeboard ?? 1.18;
  const sections = options.sections ?? 18;
  const ringSize = 5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= sections; i++) {
    const k = i / sections;
    const x = -length / 2 + length * k;
    let widthFactor;
    if (k < 0.16) widthFactor = 0.58 + k / 0.16 * 0.42;
    else if (k < 0.72) widthFactor = 1 - Math.pow((k - 0.42) / 1.35, 2) * 0.08;
    else widthFactor = Math.pow(Math.max(0.001, (1 - k) / 0.28), 0.5);
    const halfWidth = beam * 0.5 * widthFactor;
    const bowRise = THREE.MathUtils.smoothstep(k, 0.68, 1) * 0.34;
    const sternRise = THREE.MathUtils.smoothstep(0.1 - k, 0, 0.1) * 0.08;
    const sheer = freeboard + bowRise + sternRise;
    const keel = -draft * (0.62 + Math.sin(Math.PI * k) * 0.38) + bowRise * 0.35;
    const ring = [
      [x, sheer, -halfWidth],
      [x, sheer * 0.34, -halfWidth * 0.88],
      [x, keel, 0],
      [x, sheer * 0.34, halfWidth * 0.88],
      [x, sheer, halfWidth]
    ];
    ring.forEach((p, j) => {
      positions.push(...p);
      uvs.push(k * (length / 2), j / (ringSize - 1));
    });
  }

  for (let i = 0; i < sections; i++) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize - 1; j++) {
      indices.push(a + j, b + j, b + j + 1, a + j, b + j + 1, a + j + 1);
    }
    indices.push(a, a + 4, b + 4, a, b + 4, b);
  }
  for (let j = 1; j < ringSize - 1; j++) indices.push(0, j + 1, j);
  const end = sections * ringSize;
  for (let j = 1; j < ringSize - 1; j++) indices.push(end, end + j, end + j + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function triangularSailGeometry(a, b, c, segments = 12, billow = 0.12) {
  const points = [a, b, c].map(p => p.isVector3 ? p : new THREE.Vector3(...p));
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = [];
  for (let row = 0; row <= segments; row++) {
    rows[row] = [];
    const v = row / segments;
    for (let col = 0; col <= segments - row; col++) {
      const u = col / segments;
      const w = 1 - u - v;
      const p = points[0].clone().multiplyScalar(w)
        .add(points[1].clone().multiplyScalar(u))
        .add(points[2].clone().multiplyScalar(v));
      p.z += Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * billow;
      rows[row][col] = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments - row; col++) {
      const a0 = rows[row][col];
      const b0 = rows[row][col + 1];
      const c0 = rows[row + 1][col];
      indices.push(a0, b0, c0);
      if (col < segments - row - 1) indices.push(b0, rows[row + 1][col + 1], c0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeDecal(text, options = {}) {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = options.borderWidth ?? 8;
    ctx.strokeRect(8, 8, width - 16, height - 16);
  }
  ctx.fillStyle = options.color ?? '#e8ddc4';
  ctx.font = `${options.weight ?? 700} ${options.fontSize ?? 54}px ${options.font ?? 'Georgia'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = options.letterSpacing ?? '4px';
  ctx.fillText(text, width / 2, height / 2 + (options.yOffset ?? 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: options.side ?? THREE.DoubleSide,
    toneMapped: options.toneMapped ?? true,
    opacity: options.opacity ?? 1
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(options.worldWidth ?? 1, options.worldHeight ?? 0.25), material);
  mesh.name = options.name || `decal_${text.replace(/\s+/g, '_').toLowerCase()}`;
  return mesh;
}

export function addRivetLine(root, from, to, count, material, radius = 0.025) {
  const a = from.isVector3 ? from : new THREE.Vector3(...from);
  const b = to.isVector3 ? to : new THREE.Vector3(...to);
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  for (let i = 0; i < count; i++) {
    const rivet = finish(new THREE.Mesh(geometry, material), { castShadow: false, receiveShadow: true });
    rivet.position.lerpVectors(a, b, count === 1 ? 0.5 : i / (count - 1));
    root.add(rivet);
  }
  return root;
}
