// Площадка как на рендере: пасмурное вечернее небо, мокрый асфальт с лужами
// и отражением машины, склады на горизонте, фонари и дымка.
import * as THREE from 'three';

const FOG = 0x4d5868;

/* ---------- текстуры ---------- */
function rng(seed) { let s = seed % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.75)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Фасад склада: 1 повтор = секция 16 м с воротами. Возвращает цвет и карту свечения (лампа над воротами).
function facadeTextures(base, door, seed) {
  const W = 512, H = 320;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const c = mk(), e = mk(), g = c.getContext('2d'), ge = e.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 8) {                      // профлист
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, 0, 2, H);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + 5, 0, 2, H);
  }
  for (let i = 0; i < 260; i++) {                       // потёки
    const x = r() * W, y = r() * H * 0.5, h = 30 + r() * 160;
    g.fillStyle = `rgba(20,24,30,${0.02 + r() * 0.05})`; g.fillRect(x, y, 1 + r() * 3, h);
  }
  g.fillStyle = 'rgba(18,22,28,.55)'; g.fillRect(0, 0, W, 14);          // кромка крыши
  g.fillStyle = 'rgba(30,34,40,.75)'; g.fillRect(0, H - 26, W, 26);     // цоколь
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, 3, H);              // стык секций
  // ворота
  const dx = 176, dw = 160, dy = 130, dh = H - dy;
  g.fillStyle = door; g.fillRect(dx, dy, dw, dh);
  for (let y = dy; y < H; y += 9) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(dx, y, dw, 2); }
  g.strokeStyle = 'rgba(15,18,22,.8)'; g.lineWidth = 5; g.strokeRect(dx, dy, dw, dh);
  // калитка и окно
  g.fillStyle = 'rgba(28,32,38,.9)'; g.fillRect(392, 214, 34, 80);
  g.fillStyle = 'rgba(14,18,24,.9)'; g.fillRect(52, 150, 70, 34);
  // свечение: лампа над воротами и пятно света на стене
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const lx = dx + dw / 2, ly = dy - 22;
  const pool = ge.createRadialGradient(lx, ly + 50, 4, lx, ly + 70, 150);
  pool.addColorStop(0, 'rgba(255,236,205,.5)'); pool.addColorStop(1, 'rgba(255,236,205,0)');
  ge.fillStyle = pool; ge.fillRect(0, ly - 20, W, H);
  ge.fillStyle = '#fff'; ge.fillRect(lx - 14, ly - 4, 28, 8);
  if (r() > 0.4) { ge.fillStyle = 'rgba(255,214,150,.85)'; ge.fillRect(52, 150, 70, 34); }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  t.colorSpace = THREE.SRGBColorSpace; te.colorSpace = THREE.SRGBColorSpace;
  for (const x of [t, te]) { x.wrapS = THREE.RepeatWrapping; x.anisotropy = 4; }
  return [t, te];
}

/* ---------- шум: одна повторяющаяся текстура вместо расчёта в шейдере (быстрее на встроенной графике) ---------- */
function noiseTexture() {
  const N = 512, d = new Uint8Array(N * N * 4), acc = new Float32Array(N * N), r = rng(41);
  let amp = 0.5;
  for (const cells of [8, 16, 32, 64]) {
    const lat = new Float32Array(cells * cells); for (let i = 0; i < lat.length; i++) lat[i] = r();
    const k = cells / N;
    for (let y = 0; y < N; y++) {
      const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % cells;
      for (let x = 0; x < N; x++) {
        const fx = x * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % cells;
        const a0 = lat[y0 * cells + x0] + (lat[y0 * cells + x1] - lat[y0 * cells + x0]) * sx;
        const a1 = lat[y1 * cells + x0] + (lat[y1 * cells + x1] - lat[y1 * cells + x0]) * sx;
        acc[y * N + x] += amp * (a0 + (a1 - a0) * sy);
      }
    }
    amp *= 0.5;
  }
  for (let i = 0; i < N * N; i++) { const v = Math.round(acc[i] * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
const noiseU = { value: null };
// yFbm(p) — значение 0…0,94, период повтора 8 единиц
const NOISE = /* glsl */`
uniform sampler2D tNoise;
float yFbm(vec2 p) { return texture2D(tNoise, p * 0.125).r; }
`;

export function buildYard({ renderer, scene, camera, mirror = true }) {
  if (!noiseU.value) noiseU.value = noiseTexture();
  const group = new THREE.Group(); group.name = 'yard';
  const glow = glowTexture();

  /* ---------- небо ---------- */
  const sky = new THREE.TextureLoader().load('assets/sky.jpg');
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  const fog = new THREE.FogExp2(FOG, 0.0062);

  /* ---------- отражение в мокром асфальте ---------- */
  const rt = mirror ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }) : null;
  const U = { tMirror: { value: rt ? rt.texture : null }, uMirrorMatrix: { value: new THREE.Matrix4() }, uMirror: { value: mirror ? 1 : 0 } };

  const gmat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0, envMapIntensity: mirror ? 0.15 : 1 });
  gmat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { tNoise: noiseU });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uMirrorMatrix;\nvarying vec4 vMirror;\nvarying vec3 vYW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvec4 yw = modelMatrix * vec4(position, 1.0);\nvYW = yw.xyz;\nvMirror = uMirrorMatrix * yw;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tMirror;\nuniform float uMirror;\nvarying vec4 vMirror;\nvarying vec3 vYW;\nfloat yPud;\nfloat yGrain;\n${NOISE}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec2 yp = vYW.xz;
        float yBig = yFbm(yp * 0.11 + 3.7);
        float yMid = yFbm(yp * 0.45 - 9.2);
        yPud = smoothstep(0.43, 0.55, yBig * 0.72 + yMid * 0.28);          // лужи
        yGrain = yFbm(yp * 21.0) * 0.65 + yFbm(yp * 4.5) * 0.45;          // крошка
        float yWear = yFbm(yp * 0.9);
        vec3 yAsph = mix(vec3(0.030, 0.032, 0.036), vec3(0.085, 0.086, 0.088), yGrain * 0.55 + yWear * 0.45);
        diffuseColor.rgb = mix(yAsph, vec3(0.012, 0.014, 0.017), yPud);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42 + yGrain * 0.2, 0.05, yPud);')
      .replace('#include <opaque_fragment>', /* glsl */`
        if (uMirror > 0.5) {
          vec3 yV = normalize(cameraPosition - vYW);
          float yF = 0.04 + 0.96 * pow(1.0 - clamp(yV.y, 0.0, 1.0), 5.0);
          vec2 yuv = vMirror.xy / vMirror.w;
          float yd = distance(cameraPosition, vYW);
          vec2 yr = vec2(yFbm(vYW.xz * 14.0), yFbm(vYW.zx * 14.0 + 3.3)) - 0.47;
          yuv += yr * (1.0 - yPud) * 0.02 / (1.0 + yd * 0.25);             // рябь мокрого асфальта
          vec3 yRefl = texture2D(tMirror, yuv, mix(1.2, 0.0, yPud)).rgb;
          float yk = clamp(yF * 0.9 + 0.07, 0.0, 0.9) * mix(0.5, 1.0, yPud);
          outgoingLight = mix(outgoingLight, yRefl, yk);
        }
        #include <opaque_fragment>`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 96), gmat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const mcam = new THREE.PerspectiveCamera();
  const cw = new THREE.Vector3(), look = new THREE.Vector3(), rot = new THREE.Matrix4(), size = new THREE.Vector2();
  const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  function renderMirror(hide = []) {
    if (!rt || !group.visible) return;
    if (U.uMirror.value < 0.5) return;
    renderer.getDrawingBufferSize(size);
    const w = Math.max(2, Math.floor(size.x * mirrorScale)), h = Math.max(2, Math.floor(size.y * mirrorScale));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    camera.updateMatrixWorld();
    cw.setFromMatrixPosition(camera.matrixWorld);
    if (cw.y <= 0.01) return;
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(cw); look.y = -look.y;
    mcam.position.set(cw.x, -cw.y, cw.z);
    mcam.up.set(0, 1, 0).applyMatrix4(rot); mcam.up.y = -mcam.up.y;
    mcam.lookAt(look);
    mcam.near = camera.near; mcam.far = camera.far;
    mcam.updateMatrixWorld();
    mcam.projectionMatrix.copy(camera.projectionMatrix);
    mcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    U.uMirrorMatrix.value.copy(BIAS).multiply(mcam.projectionMatrix).multiply(mcam.matrixWorldInverse);

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    ground.visible = false;
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, mcam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevAuto;
    ground.visible = true;
    hide.forEach((o, i) => { o.visible = vis[i]; });
  }

  /* ---------- склады на горизонте ---------- */
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.8 });
  const endMat = new THREE.MeshStandardMaterial({ color: 0x4a535d, roughness: 0.7, metalness: 0.2 });
  const styles = [
    facadeTextures('#5d6873', '#2f5f86', 3),
    facadeTextures('#6c7680', '#3d4a58', 5),
    facadeTextures('#4f5a66', '#27506f', 8),
  ];
  const spriteMat = (color, opacity = 1) => new THREE.SpriteMaterial({ map: glow, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const warm = spriteMat(0xffd9a8, 0.9), cool = spriteMat(0xdfeaff, 0.9);
  const r = rng(19);
  // лампа: с постобработкой — яркий плафон (ореол даёт bloom), без неё — спрайт-ореол
  const bulbGeo = new THREE.BoxGeometry(0.9, 0.22, 0.22);
  const bulbs = [new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a8).multiplyScalar(9) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfeaff).multiplyScalar(9) })];
  function lamp(parent, x, y, z, isWarm, size) {
    const o = mirror ? new THREE.Mesh(bulbGeo, bulbs[isWarm ? 0 : 1]) : new THREE.Sprite(isWarm ? warm : cool);
    o.position.set(x, y, z);
    if (!mirror) o.scale.setScalar(size);
    parent.add(o);
    return o;
  }
  const SITES = [   // угол°, расстояние, длина, высота, глубина
    [8, 96, 96, 11, 30], [52, 118, 80, 9.5, 28], [97, 88, 112, 12, 32], [146, 110, 64, 9, 26],
    [188, 92, 96, 11.5, 30], [232, 122, 80, 10, 28], [276, 86, 112, 12.5, 32], [322, 112, 64, 9.5, 26],
  ];
  SITES.forEach(([deg, dist, len, h, dep], i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const [map, emis] = styles[i % styles.length].map((t) => { const c = t.clone(); c.repeat.set(len / 16, 1); c.needsUpdate = true; return c; });
    const face = new THREE.MeshStandardMaterial({ map, emissiveMap: emis, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.25 });
    const g = new THREE.Group();
    g.position.set(dist * Math.cos(a), 0, dist * Math.sin(a));
    g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, dep), [endMat, endMat, roofMat, roofMat, face, face]);
    body.position.y = h / 2; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.8, 0.5, dep + 0.8), roofMat);
    cap.position.y = h + 0.25; g.add(cap);
    const lampY = h * (1 - (130 - 22) / 320);
    for (let k = 0; k < len / 16; k++) lamp(g, -len / 2 + (k + 0.5) * 16, lampY, dep / 2 + 0.3, r() > 0.35, 5.5);
    group.add(g);
  });

  /* ---------- фонари площадки ---------- */
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 9 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 10, 10), headGeo = new THREE.BoxGeometry(0.9, 0.12, 0.3);
  for (const [x, z] of [[-46, -38], [-8, -52], [38, -44], [58, 6], [-58, 14], [-36, 50], [10, 60], [48, 46]]) {
    const p = new THREE.Mesh(poleGeo, poleMat); p.position.set(x, 5, z); group.add(p);
    const hd = new THREE.Mesh(headGeo, headMat); hd.position.set(x, 10, z); hd.lookAt(0, 10, 0); hd.translateZ(0.5); group.add(hd);
    if (!mirror) lamp(group, hd.position.x, hd.position.y - 0.1, hd.position.z, true, 7);
  }

  group.traverse((o) => { o.raycast = () => {}; });
  // качество отражения: доля от разрешения экрана, 0 — выключить (вместо него — отражение неба)
  let mirrorScale = 0.5;
  function setMirror(scale) {
    if (!rt) return;
    mirrorScale = scale || 0.5;
    U.uMirror.value = scale > 0 ? 1 : 0;
    gmat.envMapIntensity = scale > 0 ? 0.15 : 1;
  }
  return { group, sky, fog, ground, renderMirror, setMirror, sunDir: new THREE.Vector3(Math.cos(0.663) * 0.82, 0.57, Math.sin(0.663) * 0.82).normalize() };
}

/* ---------- дорожная грязь снизу и потёки дождя на лаке (как в материалах Blender) ---------- */
export const wet = { value: 0 };   // 0 — студия, 1 — площадка
export function addGrime(mat, amount, color, top = 1.9, streaks = false) {
  mat.onBeforeCompile = (sh) => {
    if (!noiseU.value) noiseU.value = noiseTexture();
    sh.uniforms.uWet = wet; sh.uniforms.tNoise = noiseU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWet;\nvarying vec3 vGW;\n${NOISE}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float gH = 1.0 - smoothstep(0.25, ${top.toFixed(2)}, vGW.y);
        float gN = yFbm(vGW.xz * 2.6 + vGW.y * 3.1);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${color.map((v) => v.toFixed(3)).join(',')}), clamp(gH * gN * ${amount.toFixed(2)} * 1.7, 0.0, 1.0) * uWet);
        ${streaks ? 'float gS = smoothstep(0.55, 0.75, yFbm(vec2((vGW.x + vGW.z) * 11.0, vGW.y * 0.5)));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.29, 0.27), gS * 0.13 * uWet);' : ''}`);
  };
  mat.customProgramCacheKey = () => `grime${amount}${top}${streaks}${color}`;
  mat.needsUpdate = true;
}
