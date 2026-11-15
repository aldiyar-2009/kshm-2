import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildKSHM } from './kshm.js';
import { buildYard, addGrime, wet } from './yard.js';
import { INFO, ALIAS, SPECS, ROOMS } from './data.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* нет доступа */ } },
};

/* ================= СЦЕНА ================= */
const canvas = $('#scene');
// high-performance — просим у ноутбука дискретную видеокарту, а не встроенную
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// тени пересчитываются только когда что-то сдвинулось (машина большую часть времени неподвижна)
renderer.shadowMap.autoUpdate = false;
let shadowDirty = true;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
// две карты освещения: студия (светлая тема) и площадка под пасмурным небом (тёмная тема)
const ENV = { studio: pmrem.fromScene(new RoomEnvironment(), 0.04).texture, yard: null };
const applyEnv = () => { scene.environment = (document.body.classList.contains('dark') && ENV.yard) || ENV.studio; };
applyEnv();
// небо из сцены Blender (Poly Haven «Kloofendal Overcast», CC0), подготовлено blender/export_web_sky.py
new RGBELoader().load('assets/sky_env.hdr', (t) => {
  ENV.yard = pmrem.fromEquirectangular(t).texture;
  t.dispose(); applyEnv();
});
// уличное HDR-окружение (Poly Haven, CC0) — реалистичные отражения на лаке и стёклах
new RGBELoader().setDataType(THREE.FloatType).load('assets/env.hdr', (t) => {
  // приглушаем цвет карты: нейтральный пасмурный свет, как на фото машины
  const d = t.image.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = l + (d[i] - l) * 0.2; d[i + 1] = l + (d[i + 1] - l) * 0.2; d[i + 2] = l + (d[i + 2] - l) * 0.2;
  }
  t.needsUpdate = true;
  ENV.studio = pmrem.fromEquirectangular(t).texture;
  t.dispose(); applyEnv();
});
// высокое качество (мягкое затенение стыков) — только на компьютерах
const HQ = !matchMedia('(max-width: 760px)').matches && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

const FOV_OUT = 36, FOV_IN = 72;
const camera = new THREE.PerspectiveCamera(FOV_OUT, 1, 0.05, 400);
const HOME = { cam: V(12.6, 3.7, 12.6), tgt: V(-0.6, 2.0, 0) };
camera.position.copy(HOME.cam);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.tgt);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;

const hemi = new THREE.HemisphereLight(0xe3ecff, 0x2a2f36, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(9, 16, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// Площадка: небо, мокрый асфальт, склады (тёмная тема)
const yard = buildYard({ renderer, scene, camera, mirror: HQ });
scene.add(yard.group);
scene.backgroundIntensity = 0.62;

// Пол-подиум с плавным затуханием по краям (светлая тема — студия)
let floorMat, grid, floor;
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#bbb'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95, alphaMap: new THREE.CanvasTexture(c), transparent: true });
  floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  grid = new THREE.GridHelper(44, 44);
  grid.material.transparent = true; grid.position.y = 0.003;
  scene.add(grid);
}

const SUN_STUDIO = V(9, 16, 7);
let bloom = null, truckLook = () => {};
function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  // тёмная тема — площадка под пасмурным небом, светлая — студия
  yard.group.visible = dark;
  floor.visible = grid.visible = !dark;
  scene.background = dark ? yard.sky : null;
  scene.fog = dark ? yard.fog : null;
  applyEnv();
  floorMat.color.set(0xdde2e7);
  grid.material.color.set(0xb9c1ca);
  grid.material.opacity = 0.45;
  hemi.color.set(dark ? 0xb9c8e0 : 0xffffff);
  hemi.groundColor.set(dark ? 0x1c2026 : 0x9aa3ad);
  hemi.intensity = dark ? 0.55 : 1.5;
  sun.color.set(dark ? 0xdfe8ff : 0xffffff);
  sun.intensity = dark ? 0.8 : 2.6;
  if (dark) sun.position.copy(yard.sunDir).multiplyScalar(22); else sun.position.copy(SUN_STUDIO);
  scene.environmentIntensity = dark ? 0.85 : 0.5;
  renderer.toneMappingExposure = dark ? 1.0 : 0.92;
  if (bloom) bloom.enabled = dark;
  shadowDirty = true;
  truckLook(dark);
  store.set('kshm-scene', dark ? 'yard' : 'studio');
}

/* ---- Постобработка: GTAO (затенение в углах и под машиной) ---- */
let composer = null, gtao = null, usePost = true;
if (HQ) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 8 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
  composer.addPass(gtao);
  // ореол вокруг фар, маячка и фонарей площадки
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ================= МОДЕЛЬ ================= */
const model = buildKSHM();
scene.add(model.root);
model.root.updateMatrixWorld(true);
const meshes = [];
model.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
const partOf = (o) => { for (let p = o.parent; p; p = p.parent) if (p.userData && p.userData.explode) return p; return null; };

// Слои: обшивка / каркас / интерьер / оборудование / шасси
const LAYER = {
  chassis: 'chassis', wheels: 'chassis', cab: 'skin', guard: 'equip', tank: 'equip', energy: 'equip', dgu: 'equip', cargo: 'equip',
  kung: 'skin', interior: 'interior', frame: 'frame', wallL: 'skin', wallR: 'skin', wallF: 'skin', wallB: 'skin', roof: 'skin',
  roofgear: 'equip', dish: 'equip', mastF: 'equip', mastR: 'equip',
};
const layerOf = (p) => { for (let q = p; q; q = partOf(q)) if (LAYER[q.name]) return LAYER[q.name]; return 'skin'; };

// Узлы для режима фокуса
const FOCUS = {
  all: null,
  cab: new Set(['cab', 'guard']),
  chassis: new Set(['chassis', 'wheels', 'tank', 'energy', 'dgu', 'cargo']),
  body: new Set(['kung', 'wallL', 'wallR', 'wallF', 'wallB', 'roof', 'frame']),
  equip: new Set(['roofgear', 'dish', 'mastF', 'mastR']),
  interior: new Set(['interior']),
};

// Подготовка прозрачности для режима «Разрез»
function prepFade(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => { const c = m.clone(); c.userData.op = m.opacity; c.userData.tr = m.transparent; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
function setOpacity(group, a) {
  group.visible = a > 0.01;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.userData.mat0 || o.material;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m.userData.op === undefined) continue;
      const tr = a < 0.999 || m.userData.tr;
      if (tr !== m.transparent) m.needsUpdate = true;
      m.transparent = tr; m.opacity = m.userData.op * a; m.depthWrite = a > 0.999 || !tr;
    }
    o.castShadow = a > 0.5 && o.userData.cast0 !== false;
  });
}
prepFade(model.byId.roof);
prepFade(model.byId.wallR);

/* ---- Вид «как в Blender»: мокрый лак, дорожная грязь снизу, включённые огни ---- */
const byName = {};
for (const m of meshes) for (const mt of [].concat(m.material)) (byName[mt.name] ||= new Set()).add(mt);
const eachMat = (names, fn) => names.forEach((n) => byName[n] && byName[n].forEach(fn));
eachMat(['paint', 'skin'], (m) => { m.userData.col0 = m.color.clone(); m.userData.ccr0 = m.clearcoatRoughness; addGrime(m, 0.35, [0.32, 0.29, 0.25], 1.9, true); });
eachMat(['rubber'], (m) => addGrime(m, 0.5, [0.16, 0.14, 0.12], 1.4));
eachMat(['rim', 'black', 'blackGloss', 'fender', 'darkMetal'], (m) => addGrime(m, 0.35, [0.22, 0.2, 0.17], 1.3));
const headLights = [-1, 1].map((s) => {
  const L = new THREE.SpotLight(0xfff2dc, 0, 46, 0.52, 0.75, 1.6);
  L.position.set(5.5, 1.05, s * 0.87); L.target.position.set(17, 0.1, s * 1.3);
  model.byId.cab.add(L, L.target);
  return L;
});
const tailLight = new THREE.PointLight(0xff2010, 0, 7, 2); tailLight.position.set(-5.7, 0.9, 0); model.byId.chassis.add(tailLight);
const beacon = new THREE.PointLight(0x2f6bff, 0, 16, 2); beacon.position.set(5.15, 3.6, 0); model.byId.guard.add(beacon);
const LAMPS = { on: { lampWhite: 7, lampRed: 4.5, lampAmber: 3.5 }, off: { lampWhite: 1.4, lampRed: 1.6, lampAmber: 1.6 } };
let lightsOn = false, beaconT = 0, wasInside = false;
truckLook = (on) => {
  lightsOn = on; wasInside = false;
  wet.value = on ? 1 : 0;
  eachMat(['paint', 'skin'], (m) => { m.color.copy(m.userData.col0).multiplyScalar(on ? 0.74 : 1); m.clearcoatRoughness = on ? 0.03 : m.userData.ccr0; });
  const E = on ? LAMPS.on : LAMPS.off;
  for (const k in E) eachMat([k], (m) => { m.emissiveIntensity = E[k]; });
  headLights.forEach((L) => { L.intensity = on ? 700 : 0; });
  tailLight.intensity = on ? 3 : 0;
  if (!on) { beacon.intensity = 0; eachMat(['lampBlue'], (m) => { m.emissiveIntensity = 2.5; }); }
};
// проблесковый маячок: двойная вспышка раз в 0,8 с (как в сцене Blender)
function updateBeacon(dt) {
  if (!lightsOn) return;
  // у разобранной машины фары и маячок не горят
  const inside = S.mode === 'inside' && !S.fly;
  const lit = S.explode.v < 0.05 && S.laid.v < 0.05 && !inside;
  // внутри отсека яркие уличные огни и ореол не нужны — возвращаем спокойный свет
  if (inside !== wasInside) {
    wasInside = inside;
    const E = inside ? LAMPS.off : LAMPS.on;
    for (const k in E) eachMat([k], (m) => { m.emissiveIntensity = E[k]; });
    if (bloom) bloom.enabled = !inside;
  }
  headLights.forEach((L) => { L.intensity = lit ? 700 : 0; });
  tailLight.intensity = lit ? 3 : 0;
  beaconT = (beaconT + dt) % 0.8;
  const on = lit && (beaconT < 0.1 || (beaconT > 0.17 && beaconT < 0.27));
  beacon.intensity = on ? 45 : 0;
  eachMat(['lampBlue'], (m) => { m.emissiveIntensity = on ? 9 : 0.8; });
}
setTheme(store.get('kshm-scene') !== 'studio');

/* ---- Какие детали двигаются при развёртывании (их не трогаем при разлёте) ---- */
const snap = (o) => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z].map((v) => v.toFixed(4)).join();
const snap0 = meshes.map(snap);
model.setDeploy(1);
const animated = new Set(meshes.filter((m, i) => snap(m) !== snap0[i]));
model.setDeploy(0);
model.root.updateMatrixWorld(true);

/* ---- Габариты каждого узла (только собственные детали, без вложенных узлов) ---- */
const own = new Map();
for (const m of meshes) {
  const p = partOf(m); if (!p) continue;
  const bb = new THREE.Box3().setFromObject(m);
  if (bb.isEmpty()) continue;
  if (!own.has(p)) own.set(p, new THREE.Box3());
  own.get(p).union(bb);
}

/* ---- Разлёт на мелкие детали (как облако деталей в примере) ---- */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const m of meshes) {
  const p = partOf(m);
  const u = m.userData;
  u.part = p; u.layer = p ? layerOf(p) : 'skin';
  u.vis0 = m.visible; u.mat0 = m.material; u.cast0 = m.castShadow;
  if (!p || animated.has(m) || !own.has(p)) continue;
  const bb = new THREE.Box3().setFromObject(m);
  if (bb.isEmpty()) continue;
  const c = bb.getCenter(new THREE.Vector3());
  const pc = own.get(p).getCenter(new THREE.Vector3());
  const off = c.clone().sub(pc).multiplyScalar(0.42);
  off.add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.55));
  if (p.userData.explode.lengthSq() > 0) off.addScaledVector(p.userData.explode.clone().normalize(), 0.9 * rnd());
  const inv = m.parent.matrixWorld.clone().invert();
  const a = c.clone().applyMatrix4(inv), b = c.clone().add(off).applyMatrix4(inv);
  u.p0 = m.position.clone(); u.xo = b.sub(a); u.xd = rnd();
}
const shards = meshes.filter((m) => m.userData.xo);

/* ---- Раскладка узлов на площадке ---- */
const laidParts = model.parts.filter((p) => own.has(p)).sort((a, b) => {
  const sa = own.get(a).getSize(new THREE.Vector3()), sb = own.get(b).getSize(new THREE.Vector3());
  return sb.x * sb.z - sa.x * sa.z;
});
const LAID = { cam: V(0, 20, 18), tgt: V(0, 0.4, 0) };
{
  const ROW = 21, GX = 0.8, GZ = 1.1;
  const rows = [[]]; let x = 0;
  for (const p of laidParts) {
    const s = own.get(p).getSize(new THREE.Vector3());
    if (x > 0 && x + s.x > ROW) { rows.push([]); x = 0; }
    rows[rows.length - 1].push(p); x += s.x + GX;
  }
  const dWorld = new Map();
  let z = 0, W = 0;
  const placed = [];
  for (const row of rows) {
    let rx = 0, depth = 0;
    for (const p of row) {
      const s = own.get(p).getSize(new THREE.Vector3());
      placed.push({ p, cx: rx + s.x / 2, cz: z + s.z / 2 });
      rx += s.x + GX; depth = Math.max(depth, s.z);
    }
    W = Math.max(W, rx - GX);
    row.w = rx - GX; row.z0 = z; row.depth = depth;
    z += depth + GZ;
  }
  const D = z - GZ;
  for (const it of placed) {
    const row = rows.find((r) => r.includes(it.p));
    const bb = own.get(it.p), c = bb.getCenter(new THREE.Vector3());
    const tx = it.cx - row.w / 2, tz = it.cz - D / 2;
    dWorld.set(it.p, V(tx - c.x, -bb.min.y + 0.01, tz - c.z));
  }
  for (const p of model.parts) {
    const dw = dWorld.get(p) || V(0, 0, 0);
    const pp = partOf(p);
    p.userData.laid = dw.clone().sub(pp && dWorld.get(pp) ? dWorld.get(pp) : V(0, 0, 0));
    if (!dWorld.has(p)) {
      // узел без своих деталей (контейнер) — двигаем как родителя
      p.userData.laid = V(0, 0, 0);
      dWorld.set(p, pp && dWorld.get(pp) ? dWorld.get(pp).clone() : V(0, 0, 0));
    }
  }
  const span = Math.max(W, D * 1.7);
  LAID.cam.set(span * 0.12, span * 0.78, span * 0.82);
  // подписи узлов в раскладке
  model.laidLabels = [];
  const seen = new Set();
  for (const p of laidParts) {
    const key = p.userData.info;
    const label = p.userData.label || (seen.has(key) ? null : INFO[key]?.t || INFO[ALIAS[key]]?.t);
    if (!label) continue;
    seen.add(key);
    const bb = own.get(p), c = bb.getCenter(new THREE.Vector3());
    const o = new THREE.Object3D(); o.position.copy(p.worldToLocal(V(c.x, bb.max.y + 0.25, c.z))); p.add(o);
    model.laidLabels.push({ key, obj: o, mode: 'laid', label });
  }
}

// Подписи для разобранного вида — центр каждого узла
const labelHotspots = [];
for (const g of model.parts) {
  if (!g.userData.label) continue;
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  const o = new THREE.Object3D(); o.position.copy(g.worldToLocal(c)); g.add(o);
  labelHotspots.push({ key: g.userData.info, obj: o, mode: 'exp', label: g.userData.label });
}

/* ================= СОСТОЯНИЕ ================= */
const S = {
  explode: { v: 0, to: 0, speed: 0.5 },
  laid: { v: 0, to: 0, speed: 0.45 },
  cut: { v: 0, to: 0, speed: 0.9 },
  deploy: { v: 0, to: 0, speed: 0.28 },
  amount: 1,
  view: 'product', focus: 'all',
  layers: { skin: true, frame: true, interior: true, equip: true, chassis: true },
  mode: 'ext', room: -1, fly: null, selected: null,
};
const approach = (a, dt) => { if (a.v < a.to) a.v = Math.min(a.to, a.v + dt * a.speed); else if (a.v > a.to) a.v = Math.max(a.to, a.v - dt * a.speed); };

let lastE = -1, lastL = -1;
function applyParts(e, l) {
  if (Math.abs(e - lastE) < 1e-5 && Math.abs(l - lastL) < 1e-5) return;
  for (const g of model.parts) {
    const k = ease(clamp01((e - 0.3 * g.userData.delay) / 0.7));
    const kl = ease(l);
    g.position.copy(g.userData.base).addScaledVector(g.userData.explode, k).addScaledVector(g.userData.laid, kl);
  }
  if (Math.abs(e - lastE) >= 1e-5) {
    for (const m of shards) {
      const u = m.userData;
      const k = ease(clamp01((e - 0.35 - 0.3 * u.xd) / 0.35));
      m.position.copy(u.p0).addScaledVector(u.xo, k);
    }
  }
  lastE = e; lastL = l;
}
let lastCut = -1;
function applyCut(c) {
  if (Math.abs(c - lastCut) < 1e-4) return;
  lastCut = c;
  const k = ease(c);
  setOpacity(model.byId.roof, 1 - k);
  setOpacity(model.byId.wallR, 1 - 0.9 * k);
}

/* ---- Рентген, фокус на узле, слои ---- */
const ghostX = new THREE.MeshStandardMaterial({ color: 0xb4d2ee, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false });
const ghostF = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false });
ghostX.userData.op = 0; ghostF.userData.op = 0;
const edgeMat = new THREE.LineBasicMaterial({ color: 0x3d7fb8, transparent: true, opacity: 0.38, depthWrite: false });
function edgesOf(m) {
  if (m.userData.edges) return m.userData.edges;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeMat);
  e.raycast = () => {};
  m.add(e); m.userData.edges = e;
  return e;
}
/* ---- Склейка: собранная неподвижная машина рисуется несколькими десятками деталей вместо 942 ----
   Настоящие детали остаются в сцене (клики, метки, габариты), но скрыты, пока машина собрана. */
const proxy = new THREE.Group(); proxy.name = 'proxy'; proxy.visible = false; scene.add(proxy);
let proxyOn = false, proxyReady = false;
function buildProxy() {
  model.root.updateMatrixWorld(true);
  const buckets = new Map();
  for (const m of meshes) {
    const u = m.userData;
    if (!u.part || !u.vis0 || Array.isArray(u.mat0) || !m.geometry.attributes.position) continue;
    let hidden = false;
    for (let p = m.parent; p; p = p.parent) if (!p.visible) { hidden = true; break; }
    if (hidden) continue;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of ['position', 'normal', 'uv']) {          // обычные (не чередующиеся) буферы одного типа
      const a = g.attributes[k];
      if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) {
        const arr = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
      }
    }
    g.applyMatrix4(m.matrixWorld);
    if (m.matrixWorld.determinant() < 0) {                    // зеркальные детали: возвращаем обход треугольников
      for (const k of ['position', 'normal', 'uv']) {
        const a = g.attributes[k], n = a.itemSize, arr = a.array;
        for (let t = 0; t + 2 < a.count; t += 3) for (let c = 0; c < n; c++) { const i = (t + 1) * n + c, j = (t + 2) * n + c, v = arr[i]; arr[i] = arr[j]; arr[j] = v; }
      }
    }
    const key = `${u.mat0.uuid}|${u.cast0 ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat: u.mat0, cast: !!u.cast0, recv: m.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
    u.inProxy = true;
  }
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) { console.warn('proxy: не удалось склеить', b.mat.name); continue; }
    const pm = new THREE.Mesh(geo, b.mat);
    pm.castShadow = b.cast; pm.receiveShadow = b.recv;
    pm.matrixAutoUpdate = false; pm.raycast = () => {};
    proxy.add(pm);
  }
  proxyReady = true;
}
const wantProxy = () => proxyReady && S.view === 'product' && S.focus === 'all'
  && S.layers.skin && S.layers.frame && S.layers.interior && S.layers.equip && S.layers.chassis
  && [S.explode, S.laid, S.cut, S.deploy].every((a) => a.v === 0 && a.to === 0);

function refreshLook() {
  proxyOn = wantProxy(); proxy.visible = proxyOn; shadowDirty = true;
  const xr = S.view === 'xray';
  const fs = FOCUS[S.focus];
  for (const m of meshes) {
    const u = m.userData; if (!u.part) continue;
    m.visible = u.vis0 && S.layers[u.layer] && !(proxyOn && u.inProxy);
    let inFocus = true;
    if (fs) { inFocus = false; for (let q = u.part; q; q = partOf(q)) if (fs.has(q.name)) { inFocus = true; break; } }
    const xg = xr && u.layer === 'skin' && inFocus;
    const ghost = !inFocus ? ghostF : xg ? ghostX : null;
    m.material = ghost || u.mat0;
    m.castShadow = !ghost && u.cast0;
    if (xg) edgesOf(m).visible = true; else if (u.edges) u.edges.visible = false;
  }
}

/* ================= КАМЕРА ================= */
function flyTo(pos, target, { dur = 1.6, via = null, fov = null, onDone = null } = {}) {
  S.fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), via, k: 0, dur, f0: camera.fov, f1: fov ?? camera.fov, onDone };
  controls.enabled = false;
}
function updateFly(dt) {
  const f = S.fly; if (!f) return false;
  f.k = Math.min(1, f.k + dt / f.dur);
  const e = ease(f.k);
  if (f.via) {
    const a = f.p0.clone().lerp(f.via, e), b = f.via.clone().lerp(f.p1, e);
    camera.position.copy(a.lerp(b, e));
  } else camera.position.lerpVectors(f.p0, f.p1, e);
  controls.target.lerpVectors(f.t0, f.t1, e);
  camera.fov = f.f0 + (f.f1 - f.f0) * e; camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  if (f.k >= 1) { S.fly = null; controls.enabled = true; f.onDone && f.onDone(); controls.update(); }
  return true;
}

function setInsideControls(on) {
  controls.minDistance = on ? 0.2 : 3;
  controls.maxDistance = on ? 0.3 : 55;
  controls.enablePan = !on;
  controls.enableZoom = !on;
  controls.rotateSpeed = on ? -0.4 : 1;
  controls.maxPolarAngle = on ? Math.PI - 0.15 : Math.PI * 0.495;
  controls.minPolarAngle = on ? 0.15 : 0;
}

function setAuto(on) { controls.autoRotate = on; $('#btn-auto').setAttribute('aria-pressed', on); }

function goExterior(cam = HOME.cam, tgt = HOME.tgt, opts = {}) {
  const wasInside = S.mode === 'inside';
  S.mode = 'ext'; S.room = -1;
  setInsideControls(false);
  updateInsideBar();
  flyTo(cam, tgt, { dur: wasInside ? 2.2 : 1.6, fov: FOV_OUT, via: wasInside ? camera.position.clone().add(V(0, 5, 5)) : null, ...opts });
}

function enterRoom(i) {
  const r = model.rooms[i];
  setView('product', { fly: false, info: false });
  setFocus('all', false);
  S.cut.to = 1;
  S.mode = 'inside'; S.room = i;
  setAuto(false);
  const dir = r.look.clone().sub(r.eye).normalize();
  const tgt = r.eye.clone().addScaledVector(dir, 0.25);
  const via = r.center.clone().add(V(0.5, 5.5, 4.5));
  setInsideControls(false);
  flyTo(r.eye, tgt, {
    dur: 2.4, via, fov: FOV_IN,
    onDone: () => { S.cut.to = 0; setInsideControls(true); },
  });
  showInfo(r.id);
  select(null);
  updateInsideBar();
  updateButtons();
}

function frameBox(box, dur = 1.4) {
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.25) { dir.y = 0.25; dir.normalize(); }
  const dist = Math.max(4.5, (r / Math.sin(THREE.MathUtils.degToRad(FOV_OUT / 2))) * 0.85);
  flyTo(c.clone().addScaledVector(dir, dist), c, { dur, fov: FOV_OUT });
}
function focusOn(obj, dist = 5.5) {
  const p = obj.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.15) { dir.y = 0.15; dir.normalize(); }
  flyTo(p.clone().addScaledVector(dir, dist), p, { dur: 1.3 });
}

/* ================= РЕЖИМЫ ПРОСМОТРА ================= */
const VIEWS = {
  product: { info: 'overview', cam: () => [HOME.cam, HOME.tgt] },
  xray: { info: 'xray', cam: () => [V(8.4, 4.6, 11.0), V(-0.2, 2.2, 0)] },
  cut: { info: 'layout', cam: () => [V(-1.3, 12.5, 9), V(-1.3, 2.0, 0)] },
  exploded: { info: 'exploded', cam: () => [V(18.5, 11.5, 20.5), V(-0.3, 2.8, 0)] },
  laid: { info: 'laidout', cam: () => [LAID.cam, LAID.tgt] },
};
function setView(v, { fly = true, info = true } = {}) {
  S.view = v;
  S.explode.to = v === 'exploded' ? S.amount : 0;
  S.laid.to = v === 'laid' ? 1 : 0;
  S.cut.to = v === 'cut' ? 1 : 0;
  if (v === 'exploded' || v === 'laid') S.deploy.to = 0;
  document.body.dataset.view = v;
  $$('#modes [data-view]').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === v));
  refreshLook();
  select(null);
  if (fly) {
    const [cam, tgt] = VIEWS[v].cam();
    if (S.mode === 'inside') goExterior(cam, tgt); else flyTo(cam, tgt, { dur: 1.8, fov: FOV_OUT });
  }
  if (info) showInfo(VIEWS[v].info);
  updateButtons();
}
function setFocus(f, fly = true) {
  S.focus = f;
  $$('#subbar [data-focus]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.focus === f));
  refreshLook();
  if (!fly) return;
  if (f === 'all') { const [cam, tgt] = VIEWS[S.view].cam(); flyTo(cam, tgt, { dur: 1.4, fov: FOV_OUT }); return; }
  const fs = FOCUS[f], box = new THREE.Box3();
  // габариты считаем в конечном положении (после анимации разлёта/раскладки)
  lastE = -1; applyParts(S.explode.to, S.laid.to);
  model.root.updateMatrixWorld(true);
  for (const m of meshes) {
    if (!m.userData.part || !m.visible) continue;
    for (let q = m.userData.part; q; q = partOf(q)) if (fs.has(q.name)) { box.union(new THREE.Box3().setFromObject(m)); break; }
  }
  lastE = -1; applyParts(S.explode.v, S.laid.v);
  model.root.updateMatrixWorld(true);
  if (!box.isEmpty()) frameBox(box);
  const infoKey = { cab: 'cab', chassis: 'chassis', body: 'body', equip: 'masts', interior: 'layout' }[f];
  if (infoKey) showInfo(infoKey);
}

/* ================= ИНФО-КАРТОЧКА ================= */
const resolve = (k) => (INFO[k] ? k : ALIAS[k] && INFO[ALIAS[k]] ? ALIAS[k] : null);
function showInfo(key) {
  const k = resolve(key); if (!k) return;
  const d = INFO[k];
  let html = `<span class="chip">${d.cat}</span><h2>${d.t}</h2><p>${d.d}</p>`;
  if (d.li) html += `<ul>${d.li.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  if (d.specs) html += `<table>${SPECS.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table>`;
  if (/^room\d$/.test(k) && S.mode !== 'inside') html += `<button class="cta" data-room="${ROOMS.indexOf(k)}">Войти в отсек</button>`;
  $('#card-body').innerHTML = html;
  if (innerWidth > 760 || S.mode === 'inside') $('#card').classList.remove('collapsed');
  const cta = $('#card-body .cta');
  if (cta) cta.onclick = () => { stopTour(); enterRoom(+cta.dataset.room); };
}

/* ================= ВЫДЕЛЕНИЕ / НАВЕДЕНИЕ ================= */
const selBox = new THREE.BoxHelper(undefined, 0xff6a1a);
selBox.material.depthTest = false; selBox.material.transparent = true; selBox.renderOrder = 10;
selBox.visible = false;
scene.add(selBox);
function select(obj) { S.selected = obj; selBox.visible = !!obj; }

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function opaqueEnough(o) {
  if (!o.isMesh) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (m.transparent && m.opacity < 0.3 && m.userData.op !== undefined) return false;
  if (!(proxyOn && o.userData.inProxy ? o.userData.vis0 : o.visible)) return false;   // деталь скрыта склейкой, но кликается
  for (let p = o.parent; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObject(model.root, true)) {
    if (!opaqueEnough(h.object)) continue;
    for (let o = h.object; o; o = o.parent) {
      const k = o.userData.info && resolve(o.userData.info);
      if (k) return { obj: o, key: k };
    }
    return null;
  }
  return null;
}
const tip = $('#tooltip');
let downAt = null, lastHover = 0;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const hit = pick(e.clientX, e.clientY);
  if (!hit) { select(null); return; }
  stopTour(false);
  showInfo(hit.key);
  select(S.mode === 'inside' ? null : hit.obj);
  if (S.mode === 'ext' && S.view === 'cut' && S.cut.v > 0.6) {
    const ri = ROOMS.indexOf(hit.key);
    if (ri >= 0) enterRoom(ri);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || e.pointerType === 'touch') { tip.classList.remove('show'); return; }
  const now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
  const hit = pick(e.clientX, e.clientY);
  if (hit) {
    tip.textContent = INFO[hit.key].t;
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    tip.classList.add('show'); canvas.style.cursor = 'pointer';
  } else { tip.classList.remove('show'); canvas.style.cursor = ''; }
});
canvas.addEventListener('pointerleave', () => tip.classList.remove('show'));
canvas.addEventListener('wheel', (e) => {
  if (S.mode !== 'inside' || S.fly) return;
  e.preventDefault();
  camera.fov = Math.min(85, Math.max(30, camera.fov + e.deltaY * 0.03));
  camera.updateProjectionMatrix();
}, { passive: false });
controls.addEventListener('start', () => { setAuto(false); if (tour.playing) pauseTour(); });

/* ================= ТОЧКИ ИНТЕРЕСА ================= */
const hsLayer = $('#hotspots');
const allHs = [...model.hotspots, ...labelHotspots, ...model.laidLabels];
let num = 0;
for (const h of allHs) {
  const el = document.createElement('button');
  el.className = 'hs ' + (h.mode === 'exp' || h.mode === 'laid' ? 'hs-label' : h.mode === 'cut' ? 'hs-room' : 'hs-dot');
  const k = resolve(h.key);
  const title = h.label || (k ? INFO[k].t : h.key);
  if (h.mode === 'exp' || h.mode === 'cut' || h.mode === 'laid') el.innerHTML = `<span>${title}</span>`;
  else el.innerHTML = `<i>${++num}</i><span>${title}</span>`;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    stopTour(false);
    if (h.mode === 'cut') { enterRoom(ROOMS.indexOf(h.key)); return; }
    showInfo(h.key);
    if (h.mode === 'ext') { select(h.obj.parent); focusOn(h.obj); }
    if (h.mode === 'exp' || h.mode === 'laid') select(h.obj.parent);
  });
  hsLayer.appendChild(el);
  h.el = el;
}
// нумерация внутри каждого отсека заново
for (const id of ROOMS) {
  let i = 0;
  for (const h of allHs) if (h.mode === id) h.el.querySelector('i').textContent = ++i;
}

const tmp = new THREE.Vector3();
function updateHotspots() {
  const w = innerWidth, h = innerHeight;
  const pts = $('#btn-points').getAttribute('aria-pressed') === 'true';
  const out = S.mode === 'ext';
  const ext = out && pts && !S.fly && S.focus === 'all' && (S.view === 'product' || S.view === 'xray') && S.explode.v < 0.02 && S.laid.v < 0.02 && S.cut.v < 0.02;
  const exp = out && pts && S.view === 'exploded' && S.explode.v > 0.85 * S.amount && S.focus === 'all';
  const laid = out && pts && S.view === 'laid' && S.laid.v > 0.95;
  const cut = out && S.view === 'cut' && S.cut.v > 0.85 && S.focus === 'all';
  const room = S.mode === 'inside' && !S.fly ? ROOMS[S.room] : null;
  for (const hs of allHs) {
    const show = (hs.mode === 'ext' && ext) || (hs.mode === 'exp' && exp) || (hs.mode === 'laid' && laid) || (hs.mode === 'cut' && cut) || hs.mode === room;
    if (!show) { hs.el.classList.remove('on'); continue; }
    hs.obj.getWorldPosition(tmp).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) { hs.el.classList.remove('on'); continue; }
    hs.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    hs.el.classList.add('on');
  }
}

/* ================= ЭКСКУРСИЯ ================= */
const TOUR = [
  { info: 'overview', cam: [11.5, 5.4, 12.5], tgt: [-0.6, 2.0, 0] },
  { info: 'chassis', cam: [2.0, 1.4, 8.2], tgt: [0, 0.8, 0] },
  { info: 'guard', cam: [10.2, 3.2, 4.8], tgt: [4.6, 1.9, 0] },
  { info: 'tank', cam: [5.0, 1.6, -4.8], tgt: [3.0, 0.9, -1.0] },
  { info: 'dgu', cam: [1.3, 1.6, 5.8], tgt: [1.2, 1.0, 1.0] },
  { info: 'energy', cam: [0.4, 1.6, -5.8], tgt: [1.2, 1.0, -1.0] },
  { info: 'body', cam: [-2.0, 3.4, 10.5], tgt: [-1.3, 2.6, 0] },
  { info: 'dish', cam: [6.2, 6.8, 6.5], tgt: [1.7, 4.0, 0], deploy: 1 },
  { info: 'masts', cam: [17, 7.5, 18], tgt: [-1.3, 5.2, 0], deploy: 1 },
  { info: 'roofgear', cam: [-8, 8.5, 6], tgt: [-2.2, 3.8, 0] },
  { info: 'door1', cam: [4.8, 2.4, 6.3], tgt: [1.9, 1.9, 1.2], deploy: 1 },
  { info: 'door2', cam: [-11, 3.2, 4], tgt: [-5.4, 1.9, 0], deploy: 1 },
  { info: 'xray', view: 'xray' },
  { info: 'exploded', view: 'exploded' },
  { info: 'laidout', view: 'laid' },
  { info: 'layout', view: 'cut' },
  { room: 0 }, { room: 1 }, { room: 2 }, { room: 3 },
  { info: 'overview', cam: [11.5, 5.4, 12.5], tgt: [-0.6, 2.0, 0], deploy: 1 },
];
const tour = { i: -1, playing: false, t: 0, dur: 7 };
const stepOf = (info) => TOUR.findIndex((s) => s.info === info);

function applyStep(st) {
  if (st.room !== undefined) { S.deploy.to = 1; enterRoom(st.room); return; }
  setFocus('all', false);
  const v = st.view || 'product';
  setView(v, { fly: false, info: false });
  S.deploy.to = st.deploy ?? 0;
  const [cam, tgt] = st.cam ? [V(...st.cam), V(...st.tgt)] : VIEWS[v].cam();
  if (S.mode === 'inside') goExterior(cam, tgt);
  else flyTo(cam, tgt, { dur: 1.8, fov: FOV_OUT });
  showInfo(st.info);
  updateButtons();
}
function goStep(i) {
  tour.i = (i + TOUR.length) % TOUR.length; tour.t = 0;
  setAuto(false);
  applyStep(TOUR[tour.i]);
  const st = TOUR[tour.i];
  const title = st.room !== undefined ? INFO[ROOMS[st.room]].t : INFO[st.info].t;
  $('#tour-title').textContent = title;
  $('#tour-count').textContent = `${tour.i + 1} / ${TOUR.length}`;
  $('#tourbar').classList.add('on');
  document.body.classList.add('touring');
}
function playTour() { if (tour.i < 0) goStep(0); tour.playing = true; $('#tour-play').setAttribute('aria-pressed', 'true'); $('#btn-tour').setAttribute('aria-pressed', 'true'); }
function pauseTour() { tour.playing = false; $('#tour-play').setAttribute('aria-pressed', 'false'); }
function stopTour(hide = true) {
  tour.playing = false;
  $('#tour-play').setAttribute('aria-pressed', 'false');
  $('#btn-tour').setAttribute('aria-pressed', 'false');
  if (hide) { tour.i = -1; $('#tourbar').classList.remove('on'); document.body.classList.remove('touring'); }
}
function updateTour(dt) {
  if (!tour.playing || S.fly) return;
  tour.t += dt;
  $('#tour-progress').style.transform = `scaleX(${Math.min(1, tour.t / tour.dur)})`;
  if (tour.t >= tour.dur) {
    if (tour.i >= TOUR.length - 1) { stopTour(false); return; }
    goStep(tour.i + 1);
  }
}
$('#tour-prev').onclick = () => { pauseTour(); goStep(tour.i - 1); };
$('#tour-next').onclick = () => { pauseTour(); goStep(tour.i + 1); };
$('#tour-play').onclick = () => (tour.playing ? pauseTour() : playTour());
$('#tour-close').onclick = () => stopTour(true);

/* ================= КНОПКИ ================= */
function updateButtons() {
  $('#btn-deploy').setAttribute('aria-pressed', S.deploy.to > 0.5);
  document.body.classList.toggle('inside', S.mode === 'inside');
}

$$('#modes [data-view]').forEach((b) => b.addEventListener('click', () => {
  stopTour();
  setView(b.dataset.view);
  if (S.focus !== 'all') setFocus(S.focus, false);
}));
$$('#subbar [data-focus]').forEach((b) => b.addEventListener('click', () => {
  stopTour();
  if (S.mode === 'inside') setView(S.view, { info: false });
  setFocus(b.dataset.focus);
}));
$$('#layers [data-layer]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.layer;
  S.layers[k] = !S.layers[k];
  b.setAttribute('aria-pressed', S.layers[k]);
  refreshLook();
}));
$('#amount').addEventListener('input', (e) => {
  S.amount = e.target.value / 100;
  if (S.view === 'exploded') S.explode.to = S.amount;
});
$('#btn-layers').onclick = (e) => {
  const on = !$('#layers').classList.contains('on');
  $('#layers').classList.toggle('on', on);
  e.currentTarget.setAttribute('aria-pressed', on);
};
$('#btn-auto').onclick = () => setAuto(!controls.autoRotate);
$('#btn-theme').onclick = () => setTheme(!document.body.classList.contains('dark'));
$('#btn-deploy').onclick = () => {
  stopTour(false);
  if (S.view === 'exploded' || S.view === 'laid') setView('product', { info: false });
  S.deploy.to = S.deploy.to > 0.5 ? 0 : 1;
  if (S.deploy.to && S.mode === 'ext') showInfo('masts');
  updateButtons();
};
$('#btn-tour').onclick = () => { if (tour.playing) stopTour(true); else { goStep(0); playTour(); } };
$('#btn-points').onclick = (e) => { const b = e.currentTarget; b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); };
$('#btn-reset').onclick = () => {
  stopTour(); S.deploy.to = 0;
  setFocus('all', false);
  setView('product', { fly: false });
  goExterior();
  updateButtons();
};
$('#card-toggle').onclick = () => $('#card').classList.toggle('collapsed');

// Навигация
const NAV = {
  overview: () => { $('#btn-reset').click(); },
  chassis: () => goStep(stepOf('chassis')),
  body: () => goStep(stepOf('body')),
  dish: () => goStep(stepOf('dish')),
  masts: () => goStep(stepOf('masts')),
  xray: () => goStep(stepOf('xray')),
  exploded: () => goStep(stepOf('exploded')),
  laid: () => goStep(stepOf('laidout')),
  layout: () => goStep(stepOf('layout')),
  specs: () => showInfo('specs'),
};
$$('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.nav;
  if (k.startsWith('room')) { stopTour(); enterRoom(ROOMS.indexOf(k)); }
  else if (NAV[k]) { NAV[k](); if (k !== 'overview' && k !== 'specs') pauseTour(); }
  document.body.classList.remove('nav-open');
}));
$('#menu-btn').onclick = (e) => { e.stopPropagation(); document.body.classList.toggle('nav-open'); };
canvas.addEventListener('pointerdown', () => document.body.classList.remove('nav-open'));

// Панель «внутри отсека»
function updateInsideBar() {
  const bar = $('#insidebar');
  document.body.classList.toggle('inside', S.mode === 'inside');
  if (S.mode !== 'inside') { bar.classList.remove('on'); return; }
  $('#inside-title').textContent = INFO[ROOMS[S.room]].t;
  bar.classList.add('on');
}
$('#inside-prev').onclick = () => { stopTour(); enterRoom((S.room + 3) % 4); };
$('#inside-next').onclick = () => { stopTour(); enterRoom((S.room + 1) % 4); };
$('#inside-exit').onclick = () => { stopTour(); setView('cut'); };

/* ================= ЦИКЛ ================= */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  camera.aspect = w / h;
  // сдвигаем модель левее, чтобы её не перекрывала карточка справа;
  // на телефоне — поднимаем модель над карточкой снизу
  if (w > 760) {
    const s = Math.round(Math.min(110, w * 0.06));
    camera.zoom = 1;
    camera.setViewOffset(w + 2 * s, h, 2 * s, 0, w, h);
  } else {
    const s = Math.round(h * 0.1);
    camera.zoom = w / h < 1 ? Math.max(0.36, (w / h) * 0.85) : 0.85;
    camera.setViewOffset(w, h + 2 * s, 0, 2 * s, w, h);
  }
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let clockTick = 0;
function step(dt) {
  approach(S.explode, dt); approach(S.laid, dt); approach(S.cut, dt); approach(S.deploy, dt);
  if (wantProxy() !== proxyOn) refreshLook();
  const sig = S.explode.v + S.laid.v * 3 + S.cut.v * 7 + S.deploy.v * 13;
  if (sig !== lastSig) { lastSig = sig; shadowDirty = true; }
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  applyParts(S.explode.v, S.laid.v);
  applyCut(S.cut.v);
  model.setDeploy(S.deploy.v);
  if ((clockTick += dt) > 1) { clockTick = 0; model.update(Date.now()); }
  if (!updateFly(dt)) controls.update(dt);
  updateTour(dt);
  if (S.selected) selBox.setFromObject(S.selected);
  updateHotspots();
  updateBeacon(dt);
  if (S.mode !== 'inside' || S.fly) yard.renderMirror([selBox]);
  // в рентгене и при выделении узла полупрозрачные детали ломают AO — рисуем без него
  if (composer && usePost && S.view !== 'xray' && S.focus === 'all') composer.render(dt);
  else renderer.render(scene, camera);
}
/* ---- Автоподстройка качества: если кадры идут медленнее ~33 в секунду, упрощаем картинку ---- */
const QUALITY = [
  { pr: 1.5, ao: true, post: true, mirror: 0.5 },      // всё включено
  { pr: 1.25, ao: false, post: true, mirror: 0.4 },    // без затенения стыков
  { pr: 1, ao: false, post: true, mirror: 0.33 },      // ниже разрешение
  { pr: 1, ao: false, post: false, mirror: 0 },        // без ореола и без отражения машины в асфальте
];
let quality = -1, perfSkip = 60, perfN = 0, perfT = 0;
function setQuality(i) {
  quality = i;
  const Q = QUALITY[i], pr = Math.min(devicePixelRatio, Q.pr);
  renderer.setPixelRatio(pr);
  if (composer) composer.setPixelRatio(pr);
  if (gtao) gtao.enabled = Q.ao;
  usePost = Q.post;
  yard.setMirror(Q.mirror);
  resize();
  try { sessionStorage.setItem('kshm-q', i); } catch { /* нет доступа */ }
}
function watchPerf(dt) {
  if (quality < 0 || quality >= QUALITY.length - 1 || document.hidden) return;
  if (perfSkip > 0) { perfSkip--; return; }
  if (dt > 0.25) return;                                // вкладка была свёрнута или шла загрузка
  perfT += dt; perfN++;
  if (perfN < 45) return;
  const avg = perfT / perfN; perfT = perfN = 0;
  if (avg > 0.03) { setQuality(quality + 1); perfSkip = 40; }
}
if (HQ) {
  let q0 = 0;
  try { q0 = Math.min(QUALITY.length - 1, Math.max(0, +sessionStorage.getItem('kshm-q') || 0)); } catch { /* нет доступа */ }
  setQuality(q0);
}
let lastSig = -1;
buildProxy();
refreshLook();

function frame() {
  const raw = clock.getDelta();
  watchPerf(raw);
  step(Math.min(raw, 0.05));
  requestAnimationFrame(frame);
}
showInfo('overview');
if (innerWidth <= 760) $('#card').classList.add('collapsed');
updateButtons();
window.KSHM = { renderer, proxy, setQuality, get quality() { return quality; }, tick: (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) step(dt); }, S, model, camera, controls, enterRoom, goStep, setView, setFocus, refreshLook };
requestAnimationFrame(() => { frame(); $('#loader').classList.add('done'); });
