// Процедурная 3D-модель КШМ-2 на шасси КАМАЗ 43118 (единицы — метры).
// Оси: X — вперёд по ходу, Y — вверх, Z — вправо по ходу движения.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (t, a, b) => ease(clamp01((t - a) / (b - a)));

// Габариты фургона 7850 × 2390 × 2200
export const K = { x0: -5.25, x1: 2.6, z: 1.195, y0: 1.42, yF: 1.58, yC: 3.64, y1: 3.7, t: 0.06 };
const IX0 = K.x0 + K.t, IX1 = K.x1 - K.t, IZ = K.z - K.t, F = K.yF;
const PART_X = [0.75, -1.35, -3.0];
const AXLES = [4.2, -0.6, -2.05];
const WR = 0.635, TRACK = 1.0, MAST_BASE = 1.45, MAST_STEP = 1.64;

/* ================= ТЕКСТУРЫ ================= */
function rng(seed) { let s = seed % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function canvasTexture(size, draw, tile = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.anisotropy = 8;
  return t;
}

function drawConcrete(g, n) {
  const r = rng(7);
  g.fillStyle = '#c8c9c4'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 650; i++) {
    const x = r() * n, y = r() * n, rad = 6 + r() * 70;
    const c = r() > 0.5 ? '150,151,146' : '230,231,226';
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${c},${0.05 + r() * 0.08})`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(90,90,88,${r() * 0.12})`; g.fillRect(r() * n, r() * n, 1, 1); }
}

function drawWood(g, n) {
  const r = rng(3), a = [132, 84, 48], b = [172, 116, 68];
  for (let x = 0; x < n; x++) {
    const v = clamp01(0.5 + 0.5 * Math.sin(x * 0.09 + Math.sin(x * 0.021) * 4) + (r() - 0.5) * 0.25);
    g.fillStyle = `rgb(${a.map((av, i) => Math.round(av + (b[i] - av) * v))})`;
    g.fillRect(x, 0, 1, n);
  }
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.12})`;
    const x = r() * n; g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= n; y += 16) g.lineTo(x + Math.sin(y * 0.02 + i) * 4, y);
    g.stroke();
  }
}

function drawMarble(g, n) {
  const r = rng(11);
  g.fillStyle = '#e6e8e7'; g.fillRect(0, 0, n, n);
  g.filter = 'blur(1.5px)';
  for (let i = 0; i < 55; i++) {
    g.strokeStyle = `rgba(110,114,118,${0.12 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 6;
    const x = r() * n * 1.4 - n * 0.2;
    g.beginPath(); g.moveTo(x, -10);
    g.bezierCurveTo(x + r() * 120, n * 0.3, x + n * 0.2 - r() * 80, n * 0.7, x + n * 0.35, n + 10);
    g.stroke();
  }
  g.filter = 'none';
}

function drawPlate(g, n) {
  g.fillStyle = '#aeb4ba'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 32) for (let x = 0; x < n; x += 32) {
    const flip = ((x + y) / 32) % 2;
    g.save(); g.translate(x + 16, y + 16); g.rotate(flip ? 0.785 : -0.785);
    g.fillStyle = 'rgba(60,64,70,.45)'; g.beginPath(); g.ellipse(1, 1.5, 11, 3, 0, 0, 7); g.fill();
    g.fillStyle = '#dde1e4'; g.beginPath(); g.ellipse(0, 0, 11, 3, 0, 0, 7); g.fill();
    g.restore();
  }
}

// Сэндвич-панель фургона: 1 повтор = 1,2 м, шов по краю + лёгкая «апельсиновая корка» лака
function drawSkin(g, n) {
  const r = rng(5);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.035})`; g.fillRect(r() * n, r() * n, 2, 2); }
  g.fillStyle = 'rgba(70,78,86,0.55)'; g.fillRect(0, 0, 3, n);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(3, 0, 2, n);
  g.fillStyle = 'rgba(70,78,86,0.10)'; g.fillRect(5, 0, 6, n);
  // заклёпки вдоль шва
  for (let y = 10; y < n; y += 42) { g.fillStyle = 'rgba(80,88,96,0.45)'; g.beginPath(); g.arc(12, y, 2.2, 0, 7); g.fill(); }
}
// Внутренние стеновые панели: светло-серые, вертикальный шов (1 повтор = 0,6 м)
function drawWallPanel(g, n) {
  const r = rng(13);
  g.fillStyle = '#c9cdd0'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.03})`; g.fillRect(r() * n, r() * n, 2, 2); }
  g.fillStyle = 'rgba(70,76,82,0.55)'; g.fillRect(0, 0, 2, n);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 0, 2, n);
}
// Ламинат «светлый дуб»: доски 0,2 м, 1 повтор = 1,2 м
function drawLaminate(g, n) {
  const r = rng(21), rows = 6, h = n / rows;
  for (let i = 0; i < rows; i++) {
    const off = (i % 3) * n / 3;
    for (let k = -1; k < 2; k++) {
      const x0 = off + k * n, tone = Math.round(190 + r() * 25);
      g.fillStyle = `rgb(${tone},${tone - 22},${tone - 52})`; g.fillRect(x0, i * h, n, h);
      for (let j = 0; j < 22; j++) {
        g.strokeStyle = `rgba(120,90,55,${0.06 + r() * 0.1})`; g.lineWidth = 1 + r() * 1.5;
        const y = i * h + r() * h; g.beginPath(); g.moveTo(x0, y);
        for (let x = 0; x <= n; x += 32) g.lineTo(x0 + x, y + Math.sin(x * 0.03 + j) * 2.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(80,60,40,0.5)'; g.fillRect(x0, i * h, 2, h);
    }
    g.fillStyle = 'rgba(80,60,40,0.45)'; g.fillRect(0, i * h, n, 2);
  }
}
// Экран видеоконференции: условные участники
function drawConference(g, W, H) {
  g.fillStyle = '#10161d'; g.fillRect(0, 0, W, H);
  const cols = 4, rows = 3, pw = W / cols, ph = H / rows, r = rng(4);
  const bgs = ['#2b6cb0', '#3b4a5a', '#5a4632', '#2f5d50', '#4a3b5a', '#365a7a', '#6a5a3a', '#2a4a6a', '#504a44', '#3a5a3a', '#5a3a3a', '#2d4f6f'];
  for (let i = 0; i < cols * rows; i++) {
    const x = (i % cols) * pw, y = Math.floor(i / cols) * ph;
    const gr = g.createLinearGradient(x, y, x, y + ph); gr.addColorStop(0, bgs[i]); gr.addColorStop(1, '#151b22');
    g.fillStyle = gr; g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
    g.fillStyle = `rgba(20,24,28,${0.75 + r() * 0.2})`;
    g.beginPath(); g.arc(x + pw / 2, y + ph * 0.45, ph * 0.16, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + pw / 2, y + ph * 0.95, pw * 0.28, ph * 0.3, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 6, y + ph - 26, 92, 20);
    g.fillStyle = '#e6edf3'; g.font = '14px Arial'; g.fillText(`Пункт ${i + 1}`, x + 12, y + ph - 11);
  }
  g.strokeStyle = '#3ad16b'; g.lineWidth = 4; g.strokeRect(pw + 3, ph + 3, pw - 6, ph - 6);
}
function drawLaptop(g, W, H) {
  g.fillStyle = '#eef2f6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f6fd1'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText('Ситуационный центр', 14, 23);
  const r = rng(8);
  ['#c9a36a', '#7a9cc0', '#9ab07a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(14 + i * 165, 48, 150, 90); });
  for (let y = 156; y < H - 10; y += 16) { g.fillStyle = '#b7c2cd'; g.fillRect(14, y, 120 + r() * 340, 7); }
}

function drawRubber(g, n) {
  const r = rng(9);
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 14000; i++) { const v = Math.round(90 + r() * 80); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2); }
}

function drawScreen(g, kind) {
  const W = 512, H = 300, r = rng(kind.length * 31 + 5);
  g.fillStyle = '#06111c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0f2a44'; g.fillRect(0, 0, W, 28);
  g.font = 'bold 15px sans-serif'; g.fillStyle = '#9fd8ff';
  const titles = { map: 'ОПЕРАТИВНАЯ ОБСТАНОВКА', cams: 'ВИДЕОНАБЛЮДЕНИЕ', net: 'КАНАЛЫ СВЯЗИ', sat: 'СПУТНИКОВЫЙ КАНАЛ' };
  g.fillText(titles[kind], 12, 19);
  g.fillStyle = '#39ff88'; g.fillText('● ONLINE', W - 96, 19);
  if (kind === 'map') {
    g.strokeStyle = '#123a5a'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 28); g.lineTo(x, H); g.stroke(); }
    for (let y = 28; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(80,200,140,.45)';
    for (let i = 0; i < 9; i++) {
      g.beginPath(); const cx = 140 + r() * 260, cy = 100 + r() * 150, rr = 20 + i * 14;
      for (let a = 0; a <= 6.3; a += 0.2) { const k = rr * (1 + 0.15 * Math.sin(a * 3 + i)); g.lineTo(cx + Math.cos(a) * k * 1.4, cy + Math.sin(a) * k * 0.7); }
      g.stroke();
    }
    g.strokeStyle = '#4da3ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 260); g.bezierCurveTo(160, 200, 260, 250, 470, 80); g.stroke();
    for (let i = 0; i < 7; i++) {
      const x = 40 + r() * 430, y = 50 + r() * 230; g.fillStyle = i % 3 ? '#ff5b1a' : '#4da3ff';
      g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 7, y + 6); g.lineTo(x - 7, y + 6); g.fill();
    }
  } else if (kind === 'cams') {
    for (let i = 0; i < 4; i++) {
      const x = 8 + (i % 2) * 250, y = 36 + Math.floor(i / 2) * 132;
      const gr = g.createLinearGradient(x, y, x + 240, y + 124);
      gr.addColorStop(0, '#2b3a46'); gr.addColorStop(1, '#4f6170');
      g.fillStyle = gr; g.fillRect(x, y, 240, 124);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y + 80, 240, 44);
      g.fillStyle = '#1a242c'; g.fillRect(x + 40 + i * 20, y + 54, 60, 30);
      g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.fillText(`CAM ${i + 1}`, x + 8, y + 18);
      g.fillStyle = '#ff4040'; g.beginPath(); g.arc(x + 228, y + 13, 5, 0, 7); g.fill();
    }
  } else if (kind === 'net') {
    const rows = ['КВ-радиосвязь', 'УКВ-радиосвязь', 'Спутниковый канал', 'Сотовая связь 4G', 'Wi-Fi мост', 'Видеосервер'];
    rows.forEach((t, i) => {
      const y = 52 + i * 38;
      g.fillStyle = '#0d2236'; g.fillRect(10, y - 18, 492, 30);
      g.fillStyle = i === 3 ? '#ffb020' : '#39ff88'; g.beginPath(); g.arc(26, y - 3, 6, 0, 7); g.fill();
      g.fillStyle = '#cfe8ff'; g.font = '15px sans-serif'; g.fillText(t, 42, y + 2);
      const w = 60 + r() * 120; g.fillStyle = '#2f7bd6'; g.fillRect(330, y - 10, w, 12);
    });
  } else {
    g.strokeStyle = '#39ff88'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < W; x += 2) { const y = 210 - Math.exp(-((x - 256) ** 2) / 900) * 120 - r() * 14; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = '#9fd8ff'; g.font = 'bold 22px monospace';
    g.fillText('▲ 12.4 Мбит/с   ▼ 38.1 Мбит/с', 20, 64);
    g.font = '14px monospace'; g.fillText('C/N 14.2 dB   AZ 172.4°   EL 31.8°', 20, 92);
  }
}

function drawPanel(g, n) {
  g.fillStyle = '#a7adb3'; g.fillRect(0, 0, n, n * 1.5);
  g.fillStyle = '#2b3037'; g.fillRect(0, 0, n, 56);
  g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('ГРЩ  КШМ-2', 20, 39);
  ['#ff3b30', '#ffcc00', '#34c759'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(380 + i * 40, 28, 12, 0, 7); g.fill(); });
  for (let row = 0; row < 6; row++) {
    const y = 90 + row * 115;
    g.fillStyle = '#5f666d'; g.fillRect(20, y + 30, n - 40, 14);
    for (let i = 0; i < 12; i++) {
      const x = 30 + i * 39;
      g.fillStyle = '#f2f2f2'; g.fillRect(x, y, 32, 74);
      g.fillStyle = '#222'; g.fillRect(x + 10, y + 18 + (i * row % 3 === 0 ? 18 : 0), 12, 20);
      g.fillStyle = '#555'; g.font = '10px sans-serif'; g.fillText(`Q${row * 12 + i + 1}`, x + 4, y + 70);
    }
  }
}

function canvasMaterial(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); m.name = 'screen';
  return m;
}

class ZoneClock {
  constructor(label, offset) {
    this.label = label; this.offset = offset; this.last = '';
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 200;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, name: 'screen' });
    this.update(Date.now());
  }
  update(now) {
    const d = new Date(now + this.offset * 3600e3);
    const txt = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    if (txt === this.last) return;
    this.last = txt;
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#040805'; g.fillRect(0, 0, 512, 200);
    g.fillStyle = 'rgba(41,255,106,.08)'; g.font = 'bold 150px "Courier New", monospace'; g.fillText('88:88', 30, 160);
    g.shadowColor = '#29ff6a'; g.shadowBlur = 22; g.fillStyle = '#3dff7a';
    g.fillText(txt, 30, 160); g.shadowBlur = 0;
    g.fillStyle = '#7fbf8f'; g.font = 'bold 22px sans-serif'; g.fillText(this.label, 34, 30);
    this.tex.needsUpdate = true;
  }
}

/* ================= МАТЕРИАЛЫ ================= */
function makeMaterials() {
  const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const glow = (c, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 });
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xf1f2ef, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07 }),
    skin: new THREE.MeshPhysicalMaterial({ color: 0xf1f2ef, roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1, map: canvasTexture(512, drawSkin, 1.2) }),
    seal: std(0x0e0f10, 0.55, 0),
    black: std(0x1b1d20, 0.62, 0.15),
    blackGloss: std(0x131518, 0.35, 0.25),
    rubber: std(0x1a1a1a, 0.88, 0, { bumpMap: canvasTexture(256, drawRubber, 0.12), bumpScale: 1.2 }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x1c1e21, roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    alu: std(0xc3c8ce, 0.32, 0.85),
    chrome: std(0xe6e8eb, 0.12, 1),
    plate: std(0xffffff, 0.38, 0.8, { map: canvasTexture(256, drawPlate, 0.45) }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x16222c, roughness: 0.03, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
    fender: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.75, side: THREE.DoubleSide }),
    cabGlass: new THREE.MeshPhysicalMaterial({ color: 0x24323c, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.45, envMapIntensity: 2.2 }),
    glassWin: new THREE.MeshPhysicalMaterial({ color: 0x6f8796, roughness: 0.03, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.55, envMapIntensity: 1.6 }),
    frosted: std(0xe8f0f4, 0.3, 0, { transparent: true, opacity: 0.55 }),
    orange: std(0xff5b1a, 0.45),
    blue: std(0x1d4fc4, 0.45),
    yellow: std(0xf3b80c, 0.45),
    tarp: std(0xe9eae4, 0.95),
    lampWhite: glow(0xfff4dc, 1.4),
    lampBlue: glow(0x2f6bff, 2.5),
    lampRed: glow(0xff2a20, 1.6),
    lampAmber: glow(0xffa21a, 1.6),
    led: new THREE.MeshBasicMaterial({ color: 0xfffaf0 }),
    wallIn: std(0xffffff, 0.6, 0, { map: canvasTexture(512, drawWallPanel, 0.6) }),
    desk: std(0xe6e8e9, 0.45, 0),
    plastic: std(0x111315, 0.5, 0.1),
    acWhite: new THREE.MeshPhysicalMaterial({ color: 0xf4f5f5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    floor: std(0xffffff, 0.55, 0, { map: canvasTexture(512, drawLaminate, 1.2) }),
    ceiling: std(0xdfe2e4, 0.6),
    wood: std(0xffffff, 0.5, 0, { map: canvasTexture(512, drawWood, 0.5) }),
    marble: std(0xffffff, 0.35, 0, { map: canvasTexture(512, drawMarble, 1.2) }),
    fabric: std(0x4b5058, 0.95),
    leather: std(0x30353b, 0.5),
    furn: std(0xd4d8db, 0.42, 0.05),
    ceramic: std(0xfbfbfb, 0.18, 0.05),
    steel: std(0xcfd2d6, 0.22, 0.9),
    darkMetal: std(0x3a3d42, 0.4, 0.6),
    cabinet: std(0xc8ccd0, 0.4, 0.25),
    grey: std(0x8e9399, 0.4, 0.5),
    mattress: std(0x5f6670, 0.95),
    water: std(0x2f86e0, 0.15, 0, { transparent: true, opacity: 0.8 }),
    dish: std(0xf2f3f1, 0.45, 0.1, { side: THREE.DoubleSide }),
    panelFace: new THREE.MeshStandardMaterial({ map: canvasTexture(512, drawPanel, 1), roughness: 0.6 }),
  };
}

/* ================= ГЕОМЕТРИЧЕСКИЕ ПОМОЩНИКИ ================= */
// UV по мировым размерам (1 повтор = 1 м), чтобы текстуры не растягивались
function worldUV(geo, cx = 0, cy = 0, cz = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) + cz, p.getY(i) + cy);
    else if (ay >= az) uv.setXY(i, p.getX(i) + cx, p.getZ(i) + cz);
    else uv.setXY(i, p.getX(i) + cx, p.getY(i) + cy);
  }
  uv.needsUpdate = true;
  return geo;
}

function mk(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function bx(parent, x0, x1, y0, y1, z0, z1, mat) {
  const w = Math.max(Math.abs(x1 - x0), 0.001), h = Math.max(Math.abs(y1 - y0), 0.001), d = Math.max(Math.abs(z1 - z0), 0.001);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  return mk(worldUV(new THREE.BoxGeometry(w, h, d), cx, cy, cz), mat, parent, cx, cy, cz);
}
const UP = V(0, 1, 0);
function rod(parent, a, b, r, mat, segs = 10) {
  const A = V(...a), B = V(...b), len = A.distanceTo(B);
  const m = mk(new THREE.CylinderGeometry(r, r, len, segs), mat, parent);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}
function path(parent, pts, r, mat) {
  for (let i = 0; i < pts.length - 1; i++) rod(parent, pts[i], pts[i + 1], r, mat);
  for (const p of pts.slice(1, -1)) mk(new THREE.SphereGeometry(r, 10, 8), mat, parent, ...p);
}
function cyl(parent, r, len, mat, axis, x, y, z, segs = 24, r2) {
  const g = new THREE.CylinderGeometry(r, r2 ?? r, len, segs);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return mk(g, mat, parent, x, y, z);
}
function grp(parent, info, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  if (info) g.userData.info = info;
  parent.add(g);
  return g;
}

function wheelGeometries() {
  // шина 425/85R21: наружный радиус 0,635 м, ширина ~0,42 м, посадочный 0,30 м
  const prof = [[0.3, -0.19], [0.36, -0.205], [0.46, -0.212], [0.54, -0.208], [0.585, -0.195], [0.61, -0.17], [0.622, -0.12],
    [0.626, -0.05], [0.627, 0], [0.626, 0.05], [0.622, 0.12], [0.61, 0.17], [0.585, 0.195], [0.54, 0.208], [0.46, 0.212], [0.36, 0.205], [0.3, 0.19]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const tire = new THREE.LatheGeometry(prof, 64); tire.rotateX(Math.PI / 2);
  // протектор «ёлочка»: V-образные грунтозацепы + плечевые блоки
  const blocks = [], n = 26;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.075, 0.034, 0.17);
      g.rotateY(s * 0.55);
      g.translate(0.03 * s * 0, WR - 0.004, s * 0.075);
      g.rotateZ(ang);
      blocks.push(g);
      const sh = new THREE.BoxGeometry(0.07, 0.03, 0.07);
      sh.rotateX(s * 0.55);
      sh.translate(0.02, WR - 0.03, s * 0.185);
      sh.rotateZ(ang);
      blocks.push(sh);
    }
  }
  const tread = mergeGeometries(blocks);
  // обод: барабан + закраины
  const barrel = new THREE.CylinderGeometry(0.295, 0.295, 0.36, 40, 1, true); barrel.rotateX(Math.PI / 2);
  const fl1 = new THREE.TorusGeometry(0.302, 0.012, 8, 48); fl1.translate(0, 0, 0.18);
  const fl2 = new THREE.TorusGeometry(0.302, 0.012, 8, 48); fl2.translate(0, 0, -0.18);
  const rim = mergeGeometries([barrel, fl1, fl2]);
  // штампованный диск с выпуклостью
  const dprof = [[0.296, 0.06], [0.27, 0.07], [0.235, 0.095], [0.19, 0.115], [0.15, 0.12], [0.13, 0.13], [0.0, 0.13]].map((p) => new THREE.Vector2(p[0], p[1]));
  const disc = new THREE.LatheGeometry(dprof, 48); disc.rotateX(-Math.PI / 2);
  disc.scale(1, 1, -1);
  // вентиляционные окна диска
  const holes = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CylinderGeometry(0.038, 0.038, 0.012, 20); g.rotateX(Math.PI / 2);
    const an = (i / 8) * Math.PI * 2 + 0.2; g.translate(Math.cos(an) * 0.215, Math.sin(an) * 0.215, 0.107);
    holes.push(g);
  }
  const vents = mergeGeometries(holes);
  const hub = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.115, 0.13, 0.06, 28); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.16); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.07, 0.09, 0.07, 24); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.22); return g; })(),
  ]);
  const nuts = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.CylinderGeometry(0.017, 0.017, 0.035, 6); g.rotateX(Math.PI / 2);
    const an = (i / 10) * Math.PI * 2; g.translate(Math.cos(an) * 0.165, Math.sin(an) * 0.165, 0.145); nuts.push(g);
  }
  // штуцер централизованной подкачки шин
  const tube = (p, q, r) => {
    const A = V(...p), B = V(...q), g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return g;
  };
  const valve = mergeGeometries([tube([0, 0, 0.25], [0, 0, 0.29], 0.016), tube([0, 0, 0.285], [0.06, 0.1, 0.24], 0.007), tube([0.06, 0.1, 0.24], [0.1, 0.17, 0.14], 0.007)]);
  return { tire, tread, rim, disc, vents, hub, nuts: mergeGeometries(nuts), valve };
}

/* ================= МОДЕЛЬ ================= */
export function buildKSHM() {
  const M = makeMaterials();
  for (const k in M) M[k].name = k; // имена материалов — для экспорта в Blender
  const root = new THREE.Group(); root.name = 'KSHM-2';
  const parts = [], byId = {}, hotspots = [], A = {};

  function part(id, parent, ex = [0, 0, 0], label = null, delay = 0) {
    const g = new THREE.Group(); g.name = id;
    g.userData = { info: id, explode: V(...ex), delay, label, base: V(0, 0, 0) };
    parent.add(g); parts.push(g);
    if (!byId[id]) byId[id] = g;
    return g;
  }
  function hs(key, parent, x, y, z, mode) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o);
    hotspots.push({ key, obj: o, mode });
    return o;
  }

  /* ---------- ШАССИ ---------- */
  const ch = part('chassis', root, [0, 0, 0], 'Шасси КАМАЗ 43118 6×6', 0);
  for (const s of [-1, 1]) bx(ch, -4.95, 5.05, 0.92, 1.2, s * 0.38, s * 0.47, M.black);
  for (const x of [4.6, 3.3, 2.0, 0.7, -1.3, -3.2, -4.4, -4.9]) bx(ch, x - 0.05, x + 0.05, 0.95, 1.15, -0.38, 0.38, M.black);
  for (const s of [-1, 1]) bx(ch, -5.1, 2.5, 1.2, 1.42, s * 0.36, s * 0.5, M.rim);
  bx(ch, 3.4, 5.0, 0.72, 1.22, -0.42, 0.42, M.blackGloss); // двигатель
  bx(ch, 2.5, 3.4, 0.8, 1.05, -0.25, 0.25, M.blackGloss); // КПП
  bx(ch, 1.4, 2.2, 0.75, 0.98, -0.3, 0.3, M.blackGloss); // раздатка
  for (const x of AXLES) {
    cyl(ch, 0.09, 1.75, M.blackGloss, 'z', x, WR, 0);
    mk(new THREE.SphereGeometry(0.24, 20, 14), M.blackGloss, ch, x, WR, 0).scale.set(1, 1, 0.8);
    for (const s of [-1, 1]) bx(ch, x - 0.5, x + 0.5, 0.8, 0.9, s * 0.36, s * 0.5, M.rim);
  }
  rod(ch, [1.4, 0.86, 0], [AXLES[1], WR, 0], 0.05, M.rim);
  rod(ch, [AXLES[1], WR, 0], [AXLES[2], WR, 0], 0.05, M.rim);
  rod(ch, [2.2, 0.86, 0], [AXLES[0], WR, 0], 0.05, M.rim);
  for (const s of [-1, 1]) {
    bx(ch, -2.8, 0.15, 1.3, 1.4, s * 0.75, s * 1.24, M.black); // крылья задней тележки
    bx(ch, -2.86, -2.82, 0.42, 1.3, s * 0.8, s * 1.2, M.rubber); // брызговики
    // передние колёсные арки — округлые
    const fg = new THREE.CylinderGeometry(0.71, 0.71, 0.46, 32, 1, true, Math.PI / 2 - 0.35, Math.PI + 0.55); fg.rotateX(Math.PI / 2);
    mk(fg, M.fender, ch, AXLES[0], WR, s * 1.0);
    bx(ch, -5.07, -5.05, 0.8, 0.9, s * 0.75, s * 1.05, M.lampRed);
  }
  bx(ch, -5.05, -4.95, 0.75, 0.95, -1.15, 1.15, M.black); // задний бампер
  cyl(ch, 0.12, 1.5, M.black, 'y', 2.76, 2.05, -0.7); // воздухозаборник
  bx(ch, 2.55, 3.45, 0.6, 1.05, 0.72, 1.18, M.black); // АКБ шасси
  hs('chassis', ch, -1.33, 0.95, 1.25, 'ext');

  /* ---------- КОЛЁСА ---------- */
  const WG = wheelGeometries();
  AXLES.forEach((x, i) => [-1, 1].forEach((s) => {
    const g = part('wheels', root, [0, 0, s * 1.3], i === 0 && s === 1 ? 'Колёса 6×6' : null, 0.05 + i * 0.04);
    const w = grp(g, null, x, WR, s * TRACK);
    if (s < 0) w.rotation.y = Math.PI;
    mk(WG.tire, M.rubber, w); mk(WG.tread, M.rubber, w); mk(WG.rim, M.rim, w);
    mk(WG.disc, M.rim, w); mk(WG.vents, M.seal, w); mk(WG.hub, M.rim, w); mk(WG.nuts, M.steel, w); mk(WG.valve, M.plastic, w);
    if (i === 0 && s === 1) hs('wheels', g, x, WR, 1.25, 'ext');
  }));

  /* ---------- КАБИНА ---------- */
  const cab = part('cab', root, [2.8, 0.5, 0], 'Кабина КАМАЗ', 0.12);
  // Пустотелая оболочка: боковины с проёмами окон, лобовая панель, крыша, задняя стенка
  const CZ = 1.19; // внутренняя граница боковины
  const prof = [[2.95, 1.22], [5.15, 1.22], [5.19, 2.12], [5.07, 2.24], [4.9, 3.0], [4.86, 3.07], [4.74, 3.09], [2.95, 3.09]];
  const sideSh = new THREE.Shape();
  sideSh.moveTo(...prof[0]); for (const p of prof.slice(1)) sideSh.lineTo(...p); sideSh.lineTo(...prof[0]);
  for (const [x0, x1, y0, y1] of [[3.95, 4.8, 2.3, 2.95], [3.12, 3.7, 2.4, 2.95]]) {
    const hl = new THREE.Path(); hl.moveTo(x0, y0); hl.lineTo(x1, y0); hl.lineTo(x1, y1); hl.lineTo(x0, y1); hl.lineTo(x0, y0);
    sideSh.holes.push(hl);
  }
  const sideGeo = new THREE.ExtrudeGeometry(sideSh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.05, bevelSegments: 4, curveSegments: 6 });
  for (const s of [-1, 1]) mk(sideGeo, M.paint, cab, 0, 0, s > 0 ? CZ : -CZ - 0.03);
  // полосы-панели по контуру (кроме проёма лобового стекла)
  const strip = (p, q, z0 = -CZ - 0.02, z1 = CZ + 0.02, mat = M.paint, th = 0.04) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    const nx = dy / len, ny = -dx / len;
    const m = mk(new THREE.BoxGeometry(len + 0.02, th, z1 - z0), mat, cab, (p[0] + q[0]) / 2 + nx * (0.05 - th / 2), (p[1] + q[1]) / 2 + ny * (0.05 - th / 2), (z0 + z1) / 2);
    m.rotation.z = Math.atan2(dy, dx);
    return m;
  };
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i], q = prof[(i + 1) % prof.length];
    if (i === 3) { // лобовое стекло: только стойки по краям
      for (const s of [-1, 1]) strip(p, q, s > 0 ? 1.08 : -CZ - 0.02, s > 0 ? CZ + 0.02 : -1.08);
      continue;
    }
    strip(p, q);
  }
  // салон изнутри — тёмно-серая обивка
  const trim = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.85, name: 'cabTrim' });
  bx(cab, 2.99, 3.01, 1.26, 3.05, -CZ, CZ, trim);
  bx(cab, 3.0, 4.75, 3.03, 3.04, -CZ, CZ, trim);
  const tilt = 0.2223;
  mk(new THREE.BoxGeometry(0.012, 0.74, 2.17), M.cabGlass, cab, 5.05, 2.648, 0).rotation.z = tilt;
  // Салон: пол, моторный тоннель, торпедо, руль, сиденья
  const cin = grp(cab, 'cabin');
  const dash = new THREE.MeshStandardMaterial({ color: 0x2b2e32, roughness: 0.7, name: 'dash' });
  bx(cin, 3.0, 5.1, 1.26, 1.3, -CZ, CZ, M.black);
  bx(cin, 3.6, 4.7, 1.3, 1.7, -0.36, 0.36, dash);
  bx(cin, 4.6, 5.02, 1.85, 2.27, -CZ, CZ, dash);
  const dtop = mk(new THREE.BoxGeometry(0.36, 0.04, 2.3), dash, cin, 4.78, 2.29, 0); dtop.rotation.z = 0.12;
  bx(cin, 4.585, 4.6, 2.08, 2.24, -0.82, -0.36, M.blackGloss); // приборная панель
  for (const z of [-0.72, -0.59, -0.46]) mk(new THREE.CircleGeometry(0.045, 20), M.lampAmber, cin, 4.583, 2.16, z).rotation.y = -Math.PI / 2;
  bx(cin, 4.585, 4.6, 1.9, 2.1, -0.15, 0.15, M.blackGloss); // магнитола / рация
  bx(cin, 4.583, 4.585, 1.95, 2.0, -0.1, 0.1, M.lampBlue);
  const sw = grp(cin, 'cabin', 4.4, 2.16, -0.58);
  rod(cin, [4.62, 1.95, -0.58], [4.42, 2.15, -0.58], 0.025, M.black);
  const wheel = mk(new THREE.TorusGeometry(0.21, 0.019, 10, 36), M.black, sw); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0;
  sw.rotation.z = 0.55;
  for (const a of [0, 2.1, 4.2]) rod(sw, [0, 0, 0], [0, Math.sin(a) * 0.2, Math.cos(a) * 0.2], 0.013, M.black, 6);
  const seatM = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.95, name: 'seat' });
  for (const [z, w] of [[-0.58, 0.5], [0.1, 0.38], [0.66, 0.5]]) {
    bx(cin, 3.55, 4.08, 1.6, 1.78, z - w / 2, z + w / 2, seatM);
    const back = mk(new THREE.BoxGeometry(0.13, 0.72, w), seatM, cin, 3.42, 2.16, z); back.rotation.z = 0.14;
    bx(cin, 3.32, 3.44, 2.56, 2.76, z - 0.13, z + 0.13, seatM);
  }
  rod(cin, [4.25, 1.7, 0.0], [4.15, 1.98, -0.05], 0.012, M.black, 6); // рычаг КПП
  mk(new THREE.SphereGeometry(0.03, 10, 8), M.black, cin, 4.15, 1.99, -0.05);
  mk(new THREE.BoxGeometry(0.3, 0.05, 2.32), M.blackGloss, cab, 4.98, 3.13, 0).rotation.z = -0.25; // козырёк
  for (const s of [-1, 1]) {
    const zo = s * 1.236;
    bx(cab, 3.95, 4.8, 2.3, 2.95, zo - s * 0.025, zo - s * 0.015, M.cabGlass);
    bx(cab, 3.12, 3.7, 2.4, 2.95, zo - s * 0.025, zo - s * 0.015, M.cabGlass);
    bx(cab, 3.87, 3.89, 1.3, 3.02, zo - 0.012, zo + 0.012, M.black);
    bx(cab, 3.88, 4.98, 1.27, 1.29, zo - 0.012, zo + 0.012, M.black);
    bx(cab, 3.98, 4.14, 2.1, 2.15, zo, zo + s * 0.03, M.chrome);
    bx(cab, 2.95, 5.15, 1.6, 1.65, zo - 0.008, zo + 0.008, M.yellow);
    // зеркала
    rod(cab, [4.92, 2.95, s * 1.2], [5.12, 2.98, s * 1.56], 0.018, M.black);
    rod(cab, [4.92, 2.45, s * 1.22], [5.12, 2.5, s * 1.56], 0.018, M.black);
    bx(cab, 5.1, 5.16, 2.45, 2.98, s * 1.5, s * 1.7, M.black);
    // подножки
    // подножки — за аркой переднего колеса, под дверью
    for (const y of [0.62, 0.92]) bx(cab, 3.0, 3.52, y, y + 0.04, s * 0.95, s * 1.2, M.plate);
    for (const x of [3.02, 3.5]) bx(cab, x - 0.015, x + 0.015, 0.6, 1.22, s * 0.95, s * 1.0, M.black);
    // полосы на облицовке
    const c = s * 0.52;
    const stripe = (z0, z1, mat) => mk(new THREE.BoxGeometry(0.012, 0.53, Math.abs(z1 - z0)), mat, cab, 5.255, 1.885, (z0 + z1) / 2).rotation.z = -0.044;
    stripe(c - 0.075, c - 0.03, M.orange); stripe(c - 0.03, c + 0.03, M.blue); stripe(c + 0.03, c + 0.075, M.orange);
  }
  // решётка: две широкие планки и значок по центру
  for (const y of [1.36, 1.53]) bx(cab, 5.205, 5.245, y - 0.04, y + 0.04, -0.78, 0.78, M.blackGloss);
  bx(cab, 5.2, 5.215, 1.3, 1.6, -0.8, 0.8, M.black);
  cyl(cab, 0.055, 0.02, M.chrome, 'x', 5.25, 1.445, 0, 28);
  // номерной знак
  const plate = canvasMaterial(520, 112, (g) => {
    g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, 520, 112);
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.strokeRect(4, 4, 512, 104);
    g.fillStyle = '#00afca'; g.fillRect(12, 12, 62, 88);
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('KZ', 43, 92);
    g.fillStyle = '#111'; g.font = 'bold 74px Arial'; g.fillText('КШМ 02', 295, 84);
  });
  const pl = mk(new THREE.PlaneGeometry(0.52, 0.112), plate, cab, 5.425, 0.97, 0); pl.rotation.y = Math.PI / 2; pl.castShadow = false;
  bx(cab, 5.0, 5.42, 0.8, 1.2, -1.22, 1.22, M.paint); // бампер
  bx(cab, 5.0, 5.43, 0.75, 0.8, -1.22, 1.22, M.black);
  for (const s of [-1, 1]) {
    bx(cab, 5.42, 5.44, 0.97, 1.12, s * 0.7, s * 1.05, M.lampWhite);
    bx(cab, 5.42, 5.44, 0.86, 0.93, s * 0.78, s * 0.98, M.lampAmber);
  }
  for (const z of [-0.3, 0, 0.3]) bx(cab, 4.72, 4.8, 3.13, 3.17, z - 0.05, z + 0.05, M.lampAmber);
  // уплотнитель лобового стекла, дефлекторы стоек, дворники
  const onGlass = (y) => 5.05 - (y - 2.648) * Math.tan(tilt);
  for (const y of [2.29, 3.0]) mk(new THREE.BoxGeometry(0.035, 0.045, 2.2), M.seal, cab, onGlass(y) + 0.01, y, 0).rotation.z = tilt;
  for (const s of [-1, 1]) {
    mk(new THREE.BoxGeometry(0.035, 0.76, 0.05), M.seal, cab, 5.06, 2.648, s * 1.085).rotation.z = tilt;
  }
  for (const z of [-0.55, 0.4]) {
    rod(cab, [onGlass(2.33) + 0.03, 2.33, z], [onGlass(2.82) + 0.03, 2.82, z + 0.32], 0.009, M.black, 6);
    rod(cab, [onGlass(2.33) + 0.045, 2.33, z], [onGlass(2.55) + 0.045, 2.55, z + 0.12], 0.012, M.black, 6);
  }
  // хромированные ободки фар и боковые повторители
  for (const s of [-1, 1]) {
    bx(cab, 5.416, 5.436, 0.945, 1.145, s * 0.665, s * 1.085, M.chrome);
    bx(cab, 5.416, 5.436, 0.84, 0.95, s * 0.765, s * 0.995, M.chrome);
    bx(cab, 4.98, 5.05, 2.2, 2.26, s * 1.225, s * 1.245, M.lampAmber);
  }
  hs('cab', cab, 4.3, 2.65, 1.26, 'ext');

  /* ---------- КЕНГУРЯТНИК, РЕШЁТКИ, БАГАЖНИК ---------- */
  const gd = part('guard', cab, [1.2, 0.5, 0], 'Кенгурятник и решётки', 0.2);
  for (const y of [0.86, 1.28]) rod(gd, [5.62, y, -1.15], [5.62, y, 1.15], 0.035, M.paint);
  for (const z of [-1.15, -0.62, 0.62, 1.15]) path(gd, [[5.43, 0.8, z], [5.62, 0.8, z], [5.62, 1.34, z], [5.43, 1.36, z]], 0.035, M.paint);
  for (const s of [-1, 1]) path(gd, [[5.62, 1.28, s * 1.15], [5.45, 1.28, s * 1.3], [5.1, 1.28, s * 1.3]], 0.035, M.paint);
  for (const z of [-0.85, 0.85]) bx(gd, 5.55, 5.68, 0.95, 1.2, z - 0.08, z + 0.08, M.paint);
  for (const s of [-1, 1]) path(gd, [[5.36, 1.25, s * 1.2], [5.4, 2.15, s * 1.25], [5.2, 3.2, s * 1.2]], 0.03, M.paint);
  rod(gd, [5.4, 2.15, -1.25], [5.4, 2.15, 1.25], 0.03, M.paint);
  rod(gd, [5.2, 3.2, -1.2], [5.2, 3.2, 1.2], 0.03, M.paint);
  for (const z of [-0.6, 0, 0.6]) rod(gd, [5.4, 2.15, z], [5.2, 3.2, z], 0.022, M.paint);
  for (const s of [-1, 1]) {
    const z = s * 1.31;
    path(gd, [[3.92, 2.27, z], [4.85, 2.27, z], [4.85, 3.0, z], [3.92, 3.0, z], [3.92, 2.27, z]], 0.018, M.paint);
    for (const x of [4.23, 4.54]) rod(gd, [x, 2.27, z], [x, 3.0, z], 0.014, M.paint);
    rod(gd, [3.92, 2.63, z], [4.85, 2.63, z], 0.014, M.paint);
  }
  // багажник на крыше кабины
  for (const s of [-1, 1]) {
    rod(gd, [3.05, 3.34, s * 1.12], [4.95, 3.34, s * 1.12], 0.022, M.paint);
    for (const x of [3.1, 4.0, 4.9]) rod(gd, [x, 3.12, s * 1.12], [x, 3.34, s * 1.12], 0.018, M.paint);
  }
  for (const x of [3.05, 3.7, 4.3, 4.95]) rod(gd, [x, 3.34, -1.12], [x, 3.34, 1.12], 0.018, M.paint);
  bx(gd, 4.88, 5.0, 3.36, 3.46, -0.75, 0.75, M.lampBlue);
  bx(gd, 4.97, 5.03, 3.22, 3.3, -0.6, 0.6, M.lampWhite);
  for (const s of [-1, 1]) {
    cyl(gd, 0.09, 0.14, M.chrome, 'x', 4.95, 3.52, s * 0.95);
    cyl(gd, 0.075, 0.01, M.lampWhite, 'x', 5.025, 3.52, s * 0.95);
  }
  hs('guard', gd, 5.66, 1.35, 0, 'ext');

  /* ---------- ТОПЛИВНЫЙ БАК ---------- */
  const tank = part('tank', root, [0, 0, -1.6], 'Топливный бак 500 л', 0.1);
  cyl(tank, 0.28, 1.0, M.alu, 'x', 3.05, 0.86, -0.98, 32);
  for (const x of [2.75, 3.35]) cyl(tank, 0.29, 0.05, M.black, 'x', x, 0.86, -0.98, 32);
  cyl(tank, 0.05, 0.06, M.black, 'y', 3.3, 1.14, -0.98);
  hs('tank', tank, 3.05, 0.86, -1.27, 'ext');

  /* ---------- ЯЩИКИ ПОД ФУРГОНОМ ---------- */
  function underBox(g, s, x0, x1, y0, y1, doors, vents) {
    const zi = s * 0.55, zo = s * 1.2;
    bx(g, x0, x1, y0, y1, zi, zo, M.black);
    bx(g, x0 - 0.01, x1 + 0.01, y1 - 0.03, y1, zi, zo + s * 0.01, M.alu);
    bx(g, x0 - 0.01, x1 + 0.01, y0, y0 + 0.03, zi, zo + s * 0.01, M.alu);
    const step = (x1 - x0) / doors;
    for (let i = 0; i < doors; i++) {
      const a = x0 + i * step;
      if (i) bx(g, a - 0.008, a + 0.008, y0 + 0.03, y1 - 0.03, zo, zo + s * 0.006, M.grey);
      bx(g, a + step / 2 - 0.05, a + step / 2 + 0.05, y0 + 0.1, y0 + 0.14, zo, zo + s * 0.02, M.alu);
    }
    if (vents) for (let y = y0 + 0.25; y < y1 - 0.15; y += 0.07) bx(g, x1 - 0.55, x1 - 0.1, y, y + 0.025, zo, zo + s * 0.02, M.grey);
  }
  const energy = part('energy', root, [0, 0, -2.0], 'Энергообеспечение', 0.18);
  underBox(energy, -1, 0.22, 2.35, 0.5, 1.4, 3, false);
  bx(energy, 1.2, 1.35, 1.1, 1.25, -1.2, -1.215, M.yellow);
  hs('energy', energy, 1.3, 1.0, -1.23, 'ext');
  const dgu = part('dgu', root, [0, 0, 2.0], 'ДГУ', 0.18);
  underBox(dgu, 1, 0.22, 2.35, 0.5, 1.4, 3, true);
  hs('dgu', dgu, 1.0, 1.0, 1.23, 'ext');
  for (const s of [-1, 1]) {
    const cg = part('cargo', root, [0, 0, s * 1.9], s > 0 ? 'Ящики для груза' : null, 0.2);
    underBox(cg, s, -5.0, -2.92, 0.68, 1.4, 3, false);
    if (s > 0) hs('cargo', cg, -3.9, 1.05, 1.23, 'ext');
  }

  /* ---------- ФУРГОН ---------- */
  const kung = part('kung', root, [0, 2.1, 0], null, 0.3);
  const floorG = part('interior', kung, [0, 0, 0], 'Отсеки', 0.3);
  bx(floorG, K.x0, K.x1, K.y0, K.yF, -IZ, IZ, [M.black, M.black, M.floor, M.black, M.black, M.black]);

  const BANDS = [[2.86, 2.91, M.orange], [2.915, 2.965, M.blue], [2.97, 3.02, M.orange]];
  function sideWall(g, s, holes, gaps) {
    const z0 = s > 0 ? IZ : -K.z, z1 = s > 0 ? K.z : -IZ;
    const mats = s > 0 ? [M.paint, M.paint, M.paint, M.paint, M.skin, M.wallIn] : [M.paint, M.paint, M.paint, M.paint, M.wallIn, M.skin];
    holes.sort((a, b) => a.a - b.a);
    let x = K.x0;
    for (const h of holes) {
      bx(g, x, h.a, K.y0, K.y1, z0, z1, mats);
      bx(g, h.a, h.b, K.y0, h.c, z0, z1, mats);
      bx(g, h.a, h.b, h.d, K.y1, z0, z1, mats);
      if (h.type === 'win') {
        bx(g, h.a, h.b, h.c, h.d, -0.01 + (z0 + z1) / 2, 0.01 + (z0 + z1) / 2, M.glassWin);
        const zo = s * (K.z + 0.004);
        for (const [a, b, c, d] of [[h.a - 0.04, h.b + 0.04, h.c - 0.04, h.c], [h.a - 0.04, h.b + 0.04, h.d, h.d + 0.04], [h.a - 0.04, h.a, h.c, h.d], [h.b, h.b + 0.04, h.c, h.d]])
          bx(g, a, b, c, d, zo - s * 0.006, zo + s * 0.006, M.paint);
        for (let xx = h.a + 0.1; xx < h.b; xx += 0.1) bx(g, xx - 0.006, xx + 0.006, h.c, h.d, zo, zo + s * 0.012, M.grey); // решётка
      } else if (h.type === 'vent') {
        for (let y = h.c + 0.03; y < h.d; y += 0.05) bx(g, h.a, h.b, y, y + 0.02, z0, z1 + s * 0.01, M.grey);
      }
      x = h.b;
    }
    bx(g, x, K.x1, K.y0, K.y1, z0, z1, mats);
    // полосы
    const zo = s * (K.z + 0.002);
    const band = (y0, y1, mat) => {
      let xs = K.x0;
      for (const [a, b] of gaps) { bx(g, xs, a, y0, y1, zo - s * 0.002, zo + s * 0.002, mat); xs = b; }
      bx(g, xs, K.x1, y0, y1, zo - s * 0.002, zo + s * 0.002, mat);
    };
    for (const [y0, y1, m] of BANDS) band(y0, y1, m);
    band(1.46, 1.51, M.yellow);
    // алюминиевые профили по рёбрам
    const za = s * (K.z - 0.035), zb = s * (K.z + 0.015);
    for (const xc of [K.x0, K.x1]) bx(g, xc - 0.025, xc + 0.025, K.y0, K.y1, za, zb, M.alu);
    bx(g, K.x0, K.x1, K.y1 - 0.035, K.y1 + 0.015, za, zb, M.alu);
    bx(g, K.x0, K.x1, K.y0 - 0.015, K.y0 + 0.035, za, zb, M.alu);
  }
  function hatch(g, s, x0, x1, y0, y1) {
    const zo = s * (K.z + 0.004);
    for (const [a, b, c, d] of [[x0, x1, y0, y0 + 0.015], [x0, x1, y1 - 0.015, y1], [x0, x0 + 0.015, y0, y1], [x1 - 0.015, x1, y0, y1]])
      bx(g, a, b, c, d, zo - s * 0.003, zo + s * 0.003, M.grey);
    bx(g, (x0 + x1) / 2 - 0.03, (x0 + x1) / 2 + 0.03, y0 + 0.06, y0 + 0.12, zo, zo + s * 0.02, M.chrome);
  }

  // Левый борт
  const wallL = part('wallL', kung, [0, 0, -2.4], 'Левый борт', 0.42);
  const holesL = [
    { a: 1.5, b: 2.1, c: 3.06, d: 3.48, type: 'win' },
    { a: -2.7, b: -2.4, c: 3.08, d: 3.4, type: 'win' },
    { a: -4.4, b: -3.8, c: 3.06, d: 3.48, type: 'win' },
  ];
  sideWall(wallL, -1, holesL.map((h) => ({ ...h })), []);
  hatch(wallL, -1, -1.0, -0.6, 1.95, 2.4);
  hatch(wallL, -1, 0.3, 0.7, 1.95, 2.4);

  // Правый борт + входная группа 1
  const wallR = part('wallR', kung, [0, 0, 2.4], 'Правый борт', 0.42);
  const holesR = [
    { a: 1.6, b: 2.35, c: F, d: F + 1.88, type: 'door' },
    { a: -0.1, b: 0.5, c: 3.06, d: 3.48, type: 'win' },
    { a: -2.3, b: -1.9, c: 3.06, d: 3.4, type: 'vent' },
    { a: -4.4, b: -3.8, c: 3.06, d: 3.48, type: 'win' },
  ];
  sideWall(wallR, 1, holesR.map((h) => ({ ...h })), [[1.6, 2.35]]);
  hatch(wallR, 1, -1.0, -0.6, 1.95, 2.4);
  hatch(wallR, 1, -3.4, -3.0, 1.95, 2.4);

  const d1 = grp(wallR, 'door1', 2.35, F, K.z); A.door1 = d1;
  bx(d1, -0.745, -0.005, 0.005, 1.875, -0.06, 0, [M.paint, M.paint, M.paint, M.paint, M.paint, M.wallIn]);
  bx(d1, -0.56, -0.19, 1.12, 1.6, 0.0, 0.006, M.glass);
  for (const [y0, y1, m] of BANDS) bx(d1, -0.745, -0.005, y0 - F, y1 - F, 0.001, 0.004, m);
  bx(d1, -0.69, -0.64, 0.95, 1.1, 0.004, 0.045, M.chrome);
  hs('door1', wallR, 1.97, 2.55, 1.25, 'ext');

  // Складная лестница входа 1
  const l1 = grp(wallR, 'door1', 1.97, F - 0.03, K.z + 0.05); A.l1 = l1;
  const l1low = grp(l1, 'door1', 0, -0.72, 0); A.l1low = l1low;
  A.l1treads = []; A.l1lowTreads = [];
  const ladderHalf = (g, len, list, ys) => {
    for (const x of [-0.3, 0.3]) rod(g, [x, 0, 0], [x, -len, 0], 0.02, M.alu);
    for (const y of ys) { const t = grp(g, 'door1', 0, y, 0); bx(t, -0.29, 0.29, -0.015, 0.015, 0, 0.17, M.plate); list.push(t); }
  };
  ladderHalf(l1, 0.72, A.l1treads, [-0.25, -0.5]);
  ladderHalf(l1low, 0.78, A.l1lowTreads, [-0.05, -0.3, -0.55]);

  // Передний торец
  const wallF = part('wallF', kung, [1.5, 0.9, 0], 'Передний торец', 0.45);
  bx(wallF, IX1, K.x1, K.y0, K.y1, -IZ, IZ, [M.skin, M.wallIn, M.paint, M.paint, M.paint, M.paint]);
  bx(wallF, K.x1 - 0.035, K.x1 + 0.015, K.y1 - 0.035, K.y1 + 0.015, -K.z, K.z, M.alu);
  bx(wallF, K.x1 - 0.035, K.x1 + 0.015, K.y0 - 0.015, K.y0 + 0.035, -K.z, K.z, M.alu);

  // Задний торец + входная группа 2
  const wallB = part('wallB', kung, [-2.6, 0, 0], 'Задний торец', 0.45);
  const bm = [M.wallIn, M.skin, M.paint, M.paint, M.paint, M.paint];
  bx(wallB, K.x0, IX0, K.y0, K.y1, -IZ, -0.5, bm);
  bx(wallB, K.x0, IX0, K.y0, K.y1, 0.4, IZ, bm);
  bx(wallB, K.x0, IX0, K.y0, F, -0.5, 0.4, bm);
  bx(wallB, K.x0, IX0, F + 1.88, K.y1, -0.5, 0.4, bm);
  bx(wallB, K.x0 - 0.015, K.x0 + 0.035, K.y1 - 0.035, K.y1 + 0.015, -K.z, K.z, M.alu);
  bx(wallB, K.x0 - 0.015, K.x0 + 0.035, K.y0 - 0.015, K.y0 + 0.035, -K.z, K.z, M.alu);
  for (const s of [-1, 1]) bx(wallB, K.x0 - 0.02, K.x0, 3.5, 3.6, s * 0.95, s * 1.1, M.lampRed);
  const d2 = grp(wallB, 'door2', K.x0, F, -0.5); A.door2 = d2;
  bx(d2, 0, 0.06, 0.005, 1.875, 0.005, 0.895, [M.wallIn, M.paint, M.paint, M.paint, M.paint, M.paint]);
  bx(d2, -0.006, 0, 1.12, 1.6, 0.2, 0.7, M.glass);
  bx(d2, -0.045, -0.006, 0.95, 1.1, 0.78, 0.83, M.chrome);
  hs('door2', wallB, -5.3, 2.6, -0.05, 'ext');

  // Лестница на крышу
  const lad = grp(wallB, 'rearLadder');
  for (const z of [0.62, 1.02]) {
    rod(lad, [-5.38, 0.75, z], [-5.38, 3.95, z], 0.02, M.alu);
    path(lad, [[-5.38, 3.95, z], [-5.2, 4.05, z], [-4.95, 4.05, z]], 0.02, M.alu);
    for (const y of [1.3, 2.4, 3.4]) rod(lad, [-5.38, y, z], [-5.25, y, z], 0.015, M.alu);
  }
  for (let y = 0.9; y < 3.8; y += 0.3) rod(lad, [-5.38, y, 0.62], [-5.38, y, 1.02], 0.016, M.alu);
  hs('rearLadder', wallB, -5.4, 3.3, 0.82, 'ext');

  // Ящики для воды
  const wat = grp(wallB, 'water');
  bx(wat, -5.5, -5.25, 1.62, 2.3, -0.98, -0.56, M.plate);
  bx(wat, -5.5, -5.25, 2.38, 3.06, -0.98, -0.56, M.plate);
  for (const y of [1.95, 2.72]) bx(wat, -5.52, -5.5, y - 0.04, y + 0.04, -0.8, -0.74, M.black);
  hs('water', wallB, -5.52, 2.35, -0.77, 'ext');

  // Лестница-трап с поручнями
  const trap = grp(wallB, 'door2', -5.3, F - 0.04, -0.05); A.trap = trap;
  A.trapTreads = []; A.trapPosts = [];
  for (const z of [-0.38, 0.38]) rod(trap, [0, 0, z], [-1.78, 0, z], 0.025, M.alu);
  for (let i = 1; i <= 6; i++) {
    const t = grp(trap, 'door2', -0.25 * i - 0.04, 0, 0);
    bx(t, -0.13, 0.13, -0.015, 0.015, -0.37, 0.37, M.plate);
    A.trapTreads.push(t);
  }
  for (const x of [-0.1, -1.65]) for (const z of [-0.4, 0.4]) {
    const p = grp(trap, 'door2', x, 0, z);
    rod(p, [0, 0, 0], [0, 0.9, 0], 0.018, M.alu);
    A.trapPosts.push(p);
  }
  A.trapRail = grp(trap, 'door2');
  for (const z of [-0.4, 0.4]) rod(A.trapRail, [-0.1, 0, z], [-1.65, 0, z], 0.02, M.alu);

  /* ---------- КАРКАС ФУРГОНА (спрятан в толще стенок, виден в рентгене и в разборе) ---------- */
  const frm = part('frame', kung, [0, 0.95, 0], 'Каркас фургона', 0.38);
  const FM = new THREE.MeshStandardMaterial({ color: 0x6fb39b, roughness: 0.45, metalness: 0.35, name: 'frame' });
  const P = 0.022; // полуширина профиля
  const zi = IZ + 0.012, zo = K.z - 0.012;
  const NP = 16;
  for (let i = 0; i < NP; i++) {
    const x = K.x0 + 0.04 + ((K.x1 - K.x0 - 0.08) * i) / (NP - 1);
    for (const [s, holes] of [[-1, holesL], [1, holesR]]) {
      const z0 = s > 0 ? zi : -zo, z1 = s > 0 ? zo : -zi;
      const h = holes.find((q) => x > q.a - P && x < q.b + P);
      if (h) { // стойка обходит проём
        if (h.c - K.y0 > 0.06) bx(frm, x - P, x + P, K.y0, h.c, z0, z1, FM);
        bx(frm, x - P, x + P, h.d, K.yC, z0, z1, FM);
      } else bx(frm, x - P, x + P, K.y0, K.yC, z0, z1, FM);
    }
    bx(frm, x - P, x + P, K.yC + 0.008, K.y1 - 0.008, -zo, zo, FM); // дуга крыши
    bx(frm, x - P, x + P, K.y0 + 0.01, K.y0 + 0.07, -zo, zo, FM);   // поперечина пола
  }
  // продольные пояса бортов (с разрывом у двери), стрингеры крыши и пола
  for (const [s, holes] of [[-1, holesL], [1, holesR]]) {
    const z0 = s > 0 ? zi : -zo, z1 = s > 0 ? zo : -zi;
    for (const y of [K.y0 + 0.02, 2.5, K.yC - 0.05]) {
      const door = holes.find((q) => q.type === 'door' && y > q.c && y < q.d);
      if (door) { bx(frm, K.x0, door.a - P, y, y + 0.045, z0, z1, FM); bx(frm, door.b + P, K.x1, y, y + 0.045, z0, z1, FM); }
      else bx(frm, K.x0, K.x1, y, y + 0.045, z0, z1, FM);
    }
  }
  for (const z of [-0.95, -0.35, 0.35, 0.95]) {
    bx(frm, K.x0, K.x1, K.yC + 0.008, K.y1 - 0.008, z - P, z + P, FM);
    bx(frm, K.x0, K.x1, K.y0 + 0.01, K.y0 + 0.07, z - P, z + P, FM);
  }
  // стойки торцов
  for (const z of [-0.95, -0.25, 0.25, 0.95]) bx(frm, IX1 + 0.01, K.x1 - 0.01, K.y0, K.yC, z - P, z + P, FM);
  for (const z of [-1.0, -0.6, 0.5, 1.0]) bx(frm, K.x0 + 0.01, IX0 - 0.01, K.y0, K.yC, z - P, z + P, FM);
  bx(frm, K.x0 + 0.01, IX0 - 0.01, F + 1.9, F + 1.95, -0.6, 0.5, FM);

  /* ---------- КРЫША ---------- */
  const roof = part('roof', kung, [0, 1.8, 0], 'Крыша фургона', 0.55);
  bx(roof, K.x0, K.x1, K.yC, K.y1, -IZ, IZ, [M.paint, M.paint, M.paint, M.ceiling, M.paint, M.paint]);
  for (const s of [-1, 1]) bx(roof, K.x0, K.x1, K.y1 - 0.02, K.y1 + 0.03, s * 1.17, s * 1.215, M.alu);
  const roomsX = [[0.775, 2.54], [-1.325, 0.725], [-2.975, -1.375], [-5.19, -3.025]];
  for (const [a, b] of roomsX) bx(roof, a + 0.12, b - 0.12, K.yC - 0.015, K.yC, -0.075, 0.075, M.led);
  for (const cx of [-0.3, -4.1]) { // кассетный потолочный кондиционер
    bx(roof, cx - 0.3, cx + 0.3, K.yC - 0.035, K.yC, -0.95, -0.35, M.acWhite);
    for (const [z0, z1] of [[-0.92, -0.86], [-0.44, -0.38]]) bx(roof, cx - 0.25, cx + 0.25, K.yC - 0.037, K.yC - 0.034, z0, z1, M.plastic);
    bx(roof, cx - 0.12, cx + 0.12, K.yC - 0.037, K.yC - 0.034, -0.77, -0.53, M.grey);
  }

  const rg = part('roofgear', roof, [0, 1.1, 0], 'Оборудование крыши', 0.65);
  for (const s of [-1, 1]) {
    bx(rg, -5.0, 0.6, 3.7, 3.79, s * 0.93, s * 1.08, M.alu); // кабельные каналы
    rod(rg, [-5.1, 3.98, s * 1.14], [0.65, 3.98, s * 1.14], 0.02, M.alu);
    for (let x = -5.1; x <= 0.7; x += 0.96) rod(rg, [x, 3.7, s * 1.14], [x, 3.98, s * 1.14], 0.016, M.alu);
    for (const x of [-4.6, -2.6, -0.6]) {
      const lp = mk(new THREE.TorusGeometry(0.045, 0.01, 6, 14), M.darkMetal, rg, x, 3.75, s * 0.86);
      lp.rotation.y = Math.PI / 2;
    }
    bx(rg, -5.2, -5.12, 3.72, 3.84, s * 1.0, s * 1.12, M.darkMetal);
    bx(rg, -5.21, -5.2, 3.74, 3.82, s * 1.02, s * 1.1, M.lampWhite);
  }
  const ac = (x, z) => {
    bx(rg, x - 0.45, x + 0.45, 3.7, 3.95, z - 0.38, z + 0.38, M.paint);
    bx(rg, x - 0.3, x + 0.3, 3.95, 3.958, z - 0.28, z + 0.28, M.black);
    cyl(rg, 0.17, 0.02, M.darkMetal, 'y', x + 0.12, 3.96, z);
  };
  ac(0.2, 0); ac(-2.2, 0); ac(-4.4, 0.5);
  const roofHatch = (x, z) => {
    bx(rg, x - 0.32, x + 0.32, 3.7, 3.76, z - 0.32, z + 0.32, M.alu);
    mk(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.frosted, rg, x, 3.76, z).scale.set(1, 0.3, 1);
  };
  roofHatch(-0.75, -0.55); roofHatch(-3.3, 0.5);
  bx(rg, -5.1, -4.35, 3.72, 4.15, -1.05, -0.1, M.plate);
  bx(rg, -4.3, -3.55, 3.72, 4.15, -1.05, -0.1, M.plate);
  cyl(rg, 0.07, 0.06, M.darkMetal, 'y', -0.95, 3.73, 0.88);
  hs('roofgear', rg, -2.2, 4.05, 0, 'ext');

  /* ---------- СПУТНИКОВАЯ АНТЕННА ---------- */
  const dish = part('dish', roof, [0.9, 1.7, 0], 'Спутниковая антенна', 0.75);
  bx(dish, 0.9, 2.55, 3.7, 3.76, -1.0, 1.0, M.alu);
  const dp = grp(dish, 'dish', 1.65, 3.76, 0); A.dishPivot = dp;
  cyl(dp, 0.06, 0.15, M.darkMetal, 'y', 0, 0.075, 0);
  const elev = grp(dp, 'dish', 0, 0.12, 0); A.dishElev = elev;
  const fl = 0.42, pts = [];
  for (let i = 0; i <= 16; i++) { const r = (0.55 * i) / 16; pts.push(new THREE.Vector2(r, (r * r) / (4 * fl))); }
  mk(new THREE.LatheGeometry(pts, 40), M.dish, elev);
  const rimY = (0.55 * 0.55) / (4 * fl);
  mk(new THREE.TorusGeometry(0.55, 0.012, 6, 40), M.grey, elev, 0, rimY, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    rod(elev, [Math.cos(a) * 0.5, (0.25) / (4 * fl) * 1, Math.sin(a) * 0.5], [0, fl - 0.03, 0], 0.01, M.grey);
  }
  cyl(elev, 0.04, 0.12, M.darkMetal, 'y', 0, fl, 0);
  const tarpG = grp(dish, 'dish', 2.75, 3.76, 0); A.tarp = tarpG;
  bx(tarpG, -1.95, 0, 0, 0.62, -1.13, 1.13, M.tarp);
  for (const x of [-0.4, -1.0, -1.6]) for (const s of [-1, 1]) bx(tarpG, x - 0.02, x + 0.02, 0.05, 0.62, s * 1.13, s * 1.136, M.black);
  hs('dish', dish, 1.75, 4.45, 0, 'ext');

  /* ---------- ТЕЛЕСКОПИЧЕСКИЕ МАЧТЫ ---------- */
  function mast(id, x, z, ex, label) {
    const g = part(id, kung, ex, label, 0.6);
    const secs = [];
    [0.075, 0.064, 0.054, 0.044, 0.035].forEach((r, i) => {
      const geo = new THREE.CylinderGeometry(r, r, 2.4, 20); geo.translate(0, 1.2, 0);
      secs.push(mk(geo, i % 2 ? M.alu : M.chrome, g, x, MAST_BASE, z));
    });
    bx(g, x - 0.11, x + 0.11, 1.4, 1.62, z - 0.11, z + 0.11, M.black);
    const head = grp(g, id, x, MAST_BASE + 2.4, z);
    bx(head, -0.12, 0.12, 0.0, 0.05, -0.12, 0.12, M.darkMetal);
    for (const s of [-1, 1]) {
      bx(head, -0.08, 0.08, 0.05, 0.2, s * 0.1 - 0.07, s * 0.1 + 0.07, M.darkMetal);
      bx(head, s > 0 ? 0.08 : -0.081, s > 0 ? 0.081 : -0.08, 0.07, 0.18, s * 0.1 - 0.06, s * 0.1 + 0.06, M.lampWhite);
    }
    rod(head, [0, 0.05, 0], [0, 0.75, 0], 0.012, M.darkMetal);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; rod(head, [0, 0.45, 0], [Math.cos(a) * 0.25, 0.3, Math.sin(a) * 0.25], 0.006, M.darkMetal); }
    hs(id, head, 0, 0.35, 0, 'ext');
    return { secs, head };
  }
  A.mastF = mast('mastF', 2.76, 0.95, [1.2, 0, 1.4], 'Передняя мачта 10 м');
  for (const y of [2.2, 3.4]) bx(A.mastF.head.parent, 2.6, 2.7, y - 0.04, y + 0.04, 0.9, 1.0, M.alu);
  A.mastR = mast('mastR', -5.36, -1.1, [-1.6, 0, -1.4], 'Задняя мачта 10 м');
  for (const y of [2.2, 3.4]) bx(A.mastR.head.parent, -5.29, -5.25, y - 0.04, y + 0.04, -1.15, -1.05, M.alu);

  /* ================= ИНТЕРЬЕР ================= */
  const I = floorG;
  // Перегородки с раздвижными дверями
  const prt = grp(I, 'partition');
  for (const px of PART_X) {
    bx(prt, px - 0.025, px + 0.025, F, K.yC, -IZ, -0.25, M.wallIn);
    bx(prt, px - 0.025, px + 0.025, F, K.yC, 0.5, IZ, M.wallIn);
    bx(prt, px - 0.025, px + 0.025, F + 1.95, K.yC, -0.25, 0.5, M.wallIn);
    bx(prt, px + 0.03, px + 0.06, F + 0.01, F + 1.93, 0.5, 1.25, M.furn);
    bx(prt, px + 0.025, px + 0.065, F + 1.1, F + 1.7, 0.7, 1.05, M.glassWin);
  }
  // Освещение
  for (const [a, b] of roomsX) {
    const L = new THREE.PointLight(0xfff1dc, 2.2, 4.5, 2);
    L.position.set((a + b) / 2, K.yC - 0.3, 0);
    I.add(L);
  }

  // светодиодная подсветка по периметру потолка
  for (const [a, b] of roomsX) for (const s of [-1, 1]) bx(I, a + 0.06, b - 0.06, K.yC - 0.07, K.yC - 0.055, s * (IZ - 0.035), s * (IZ - 0.02), M.led);
  // настенные сплит-системы
  const split = (x, y) => {
    const g = grp(I, 'climate');
    const body = mk(new THREE.CapsuleGeometry(0.1, 0.62, 6, 16), M.acWhite, g, x, y, IZ - 0.11); body.rotation.z = Math.PI / 2; body.scale.set(1.3, 1, 1);
    bx(g, x - 0.36, x + 0.36, y - 0.115, y - 0.095, IZ - 0.2, IZ - 0.06, M.plastic);
    bx(g, x - 0.02, x + 0.05, y + 0.02, y + 0.05, IZ - 0.226, IZ - 0.224, M.lampBlue);
    return g;
  };
  split(-0.08, F + 1.85); split(-4.7, F + 1.82); split(1.35, F + 1.88);

  /* Бытовой отсек 1 */
  const sofa1 = grp(I, 'sofa1');
  bx(sofa1, 0.9, 2.48, F, F + 0.42, -IZ, -0.5, M.furn);
  bx(sofa1, 0.9, 2.48, F + 0.42, F + 0.53, -1.1, -0.5, M.fabric);
  bx(sofa1, 0.9, 2.48, F + 0.53, F + 0.98, -IZ, -0.98, M.fabric);
  hs('sofa1', I, 1.7, F + 0.6, -0.8, 'room1');
  const bunk = grp(I, 'bunk');
  bx(bunk, 0.9, 2.48, F + 1.3, F + 1.35, -IZ, -0.45, M.furn);
  bx(bunk, 0.92, 2.46, F + 1.35, F + 1.44, -1.1, -0.48, M.mattress);
  for (const x of [0.95, 2.43]) rod(bunk, [x, F + 1.35, -0.47], [x, F + 1.95, -IZ], 0.006, M.steel);
  hs('bunk', I, 1.7, F + 1.5, -0.7, 'room1');
  const st1 = grp(I, 'storage1');
  bx(st1, 2.1, 2.52, F, K.yC - 0.02, -0.45, 0.4, M.furn);
  for (const z of [-0.025]) bx(st1, 2.095, 2.1, F + 1.4, K.yC - 0.05, z - 0.004, z + 0.004, M.grey);
  for (const z of [-0.08, 0.03]) bx(st1, 2.08, 2.1, F + 1.75, F + 1.85, z - 0.01, z + 0.01, M.chrome);
  hs('storage1', I, 2.08, F + 1.75, 0.2, 'room1');
  const fr1 = grp(I, 'fridge1');
  bx(fr1, 2.088, 2.1, F + 0.05, F + 0.8, -0.4, 0.35, M.blackGloss);
  bx(fr1, 2.07, 2.088, F + 0.7, F + 0.74, -0.3, 0.2, M.chrome);
  hs('fridge1', I, 2.08, F + 0.45, 0, 'room1');
  const mw1 = grp(I, 'micro1');
  bx(mw1, 2.09, 2.1, F + 1.0, F + 1.3, -0.38, 0.32, M.darkMetal);
  bx(mw1, 2.085, 2.09, F + 1.03, F + 1.27, -0.36, 0.12, M.glass);
  hs('micro1', I, 2.08, F + 1.15, -0.1, 'room1');
  const bas = grp(I, 'basin1');
  bx(bas, 0.85, 1.5, F, F + 0.82, 0.6, IZ, M.furn);
  bx(bas, 0.84, 1.51, F + 0.82, F + 0.86, 0.58, IZ, M.furn);
  cyl(bas, 0.17, 0.1, M.ceramic, 'y', 1.17, F + 0.91, 0.86, 28, 0.12);
  path(bas, [[1.17, F + 0.86, 1.08], [1.17, F + 1.12, 1.08], [1.17, F + 1.12, 0.96]], 0.012, M.chrome);
  bx(bas, 0.95, 1.4, F + 1.3, F + 1.62, IZ - 0.2, IZ, M.furn);
  bx(bas, 1.1, 1.25, F + 1.4, F + 1.5, IZ - 0.201, IZ - 0.2, M.lampBlue);
  hs('basin1', I, 1.17, F + 1.05, 0.86, 'room1');

  /* Операторский отсек */
  const pnl = grp(I, 'panel');
  bx(pnl, 0.5, 0.72, F + 0.45, F + 1.95, 0.55, 1.1, [M.cabinet, M.panelFace, M.cabinet, M.cabinet, M.cabinet, M.cabinet]);
  hs('panel', I, 0.49, F + 1.3, 0.82, 'room2');
  const desk = grp(I, 'desk');
  bx(desk, -1.2, 0.6, F + 0.72, F + 0.76, -IZ, -0.45, M.desk);
  bx(desk, -1.2, 0.6, F + 0.72, F + 0.76, -0.47, -0.45, M.grey);
  // рации на зарядке с антеннами
  for (let i = 0; i < 6; i++) {
    const x = 0.05 + i * 0.075;
    bx(desk, x - 0.03, x + 0.03, F + 0.76, F + 0.8, -1.05, -0.95, M.plastic);
    bx(desk, x - 0.026, x + 0.026, F + 0.8, F + 0.97, -1.02, -0.985, M.plastic);
    bx(desk, x - 0.015, x + 0.015, F + 0.9, F + 0.94, -0.985, -0.983, M.lampBlue);
    bx(desk, x + 0.012, x + 0.02, F + 0.97, F + 0.99, -1.0, -0.99, M.orange);
    rod(desk, [x - 0.012, F + 0.97, -1.0], [x - 0.012, F + 1.22, -1.0], 0.006, M.plastic, 6);
  }
  // фонари
  for (const x of [0.52, 0.42]) {
    cyl(desk, 0.05, 0.14, M.plastic, 'y', x, F + 0.83, -0.62, 20);
    cyl(desk, 0.04, 0.09, M.lampWhite, 'y', x, F + 0.945, -0.62, 20);
    cyl(desk, 0.052, 0.025, M.plastic, 'y', x, F + 1.0, -0.62, 20);
  }
  // ноутбук
  bx(desk, -0.55, -0.2, F + 0.76, F + 0.775, -0.85, -0.6, M.darkMetal);
  const lap = grp(desk, 'desk', -0.375, F + 0.775, -0.85);
  bx(lap, -0.175, 0.175, 0, 0.23, -0.012, 0, M.darkMetal);
  const lapS = mk(new THREE.PlaneGeometry(0.33, 0.2), canvasMaterial(512, 310, drawLaptop), lap, 0, 0.12, 0.001); lapS.castShadow = false;
  lap.rotation.x = -0.25;
  // защищённый кейс и пульт
  bx(desk, -1.12, -0.7, F + 0.76, F + 0.98, -1.05, -0.72, M.plastic);
  bx(desk, -0.98, -0.84, F + 0.98, F + 1.0, -0.9, -0.87, M.plastic);
  bx(desk, -0.68, -0.56, F + 0.76, F + 0.79, -0.7, -0.6, M.plastic);
  // огнетушитель
  cyl(desk, 0.07, 0.42, M.lampRed, 'y', -1.17, F + 0.21, 0.32, 20);
  bx(desk, -1.19, -1.15, F + 0.42, F + 0.47, 0.29, 0.35, M.black);
  // верхние шкафы с ручками-рейлингами
  bx(desk, -1.22, 0.62, F + 1.7, K.yC - 0.02, -IZ, -IZ + 0.36, M.furn);
  for (const x of [-0.76, -0.3, 0.16]) bx(desk, x - 0.003, x + 0.003, F + 1.72, K.yC - 0.04, -IZ + 0.36, -IZ + 0.362, M.grey);
  for (const x of [-0.82, -0.7, -0.36, -0.24, 0.1, 0.22]) rod(desk, [x, F + 1.76, -IZ + 0.39], [x, F + 1.92, -IZ + 0.39], 0.008, M.chrome, 8);
  bx(desk, 0.2, 0.6, F, F + 0.72, -IZ, -0.5, M.furn);
  bx(desk, -1.2, -1.15, F, F + 0.72, -IZ, -0.5, M.furn);
  bx(desk, -0.6, -0.1, F + 0.76, F + 0.78, -0.75, -0.6, M.blackGloss);
  // кресло оператора
  const ch2 = grp(I, 'desk', -0.35, F, -0.1);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; rod(ch2, [0, 0.06, 0], [Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28], 0.018, M.darkMetal); }
  cyl(ch2, 0.03, 0.4, M.chrome, 'y', 0, 0.26, 0);
  bx(ch2, -0.25, 0.25, 0.45, 0.53, -0.25, 0.25, M.leather);
  bx(ch2, -0.23, 0.23, 0.55, 1.15, 0.22, 0.29, M.leather);
  hs('desk', I, -0.35, F + 0.85, -0.1, 'room2');
  const mon = grp(I, 'monitors');
  const kinds = ['map', 'cams', 'net', 'sat'];
  [[-0.75, F + 1.02], [-0.08, F + 1.02], [-0.75, F + 1.44], [-0.08, F + 1.44]].forEach(([x, y], i) => {
    bx(mon, x - 0.31, x + 0.31, y - 0.19, y + 0.19, -IZ + 0.02, -IZ + 0.04, M.plastic);
    bx(mon, x - 0.05, x + 0.05, y - 0.05, y + 0.05, -IZ, -IZ + 0.02, M.darkMetal);
    const sm = canvasMaterial(512, 300, (g) => drawScreen(g, kinds[i]));
    const scr = mk(new THREE.PlaneGeometry(0.58, 0.34), sm, mon, x, y, -IZ + 0.0415);
    scr.castShadow = false;
  });
  hs('monitors', I, -0.42, F + 1.65, -1.05, 'room2');
  const mc = grp(I, 'mastCab');
  bx(mc, -1.25, -0.6, F, K.yC - 0.01, 0.55, IZ, M.cabinet);
  bx(mc, -0.93, -0.92, F + 0.05, K.yC - 0.06, 0.545, 0.55, M.darkMetal);
  for (const x of [-0.97, -0.88]) rod(mc, [x, F + 1.3, 0.52], [x, F + 1.7, 0.52], 0.009, M.chrome, 8);
  bx(mc, -1.2, -0.65, F + 1.05, F + 1.07, 0.54, 0.545, M.grey);
  [[F + 0.88, 'lampBlue'], [F + 0.72, 'lampAmber'], [F + 0.56, 'lampRed'], [F + 0.4, 'lampWhite']].forEach(([y, l]) => {
    bx(mc, -0.85, -0.66, y, y + 0.12, 0.53, 0.545, M.plastic);
    bx(mc, -0.8, -0.71, y + 0.04, y + 0.08, 0.528, 0.53, M[l]);
  });
  bx(mc, -1.1, -0.98, F + 0.8, F + 0.95, 0.535, 0.545, M.plastic); // тангента
  rod(mc, [-1.04, F + 0.8, 0.53], [-0.95, F + 0.45, 0.53], 0.006, M.plastic, 6);
  const cctv = grp(I, 'mastCab', -0.95, 0, 0.88); A.cctv = cctv;
  const cg2 = new THREE.CylinderGeometry(0.03, 0.03, 2.0, 12); cg2.translate(0, 1.0, 0);
  A.cctvRod = mk(cg2, M.alu, cctv, 0, F + 0.05, 0);
  A.cctvHead = grp(cctv, 'mastCab', 0, F + 2.05, 0);
  bx(A.cctvHead, -0.08, 0.08, 0, 0.06, -0.08, 0.08, M.darkMetal);
  mk(new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.glass, A.cctvHead, 0.05, 0, 0);
  hs('mastCab', I, -0.6, F + 1.6, 0.85, 'room2');

  /* Бытовой отсек 2: санузел и кухня */
  const cub = grp(I, 'shower');
  const cw = (x0, x1, y0, y1) => bx(cub, x0, x1, y0, y1, -0.32, -0.28, M.marble);
  cw(-2.95, -2.78, F, K.yC); cw(-2.28, -1.98, F, K.yC); cw(-1.48, -1.4, F, K.yC);
  cw(-2.78, -2.28, F + 1.95, K.yC); cw(-1.98, -1.48, F + 1.95, K.yC);
  bx(cub, -2.195, -2.155, F, K.yC, -IZ, -0.32, M.marble);
  bx(cub, -1.39, -1.376, F, K.yC, -IZ, -0.32, M.marble);
  bx(cub, -2.95, -1.4, F, K.yC, -IZ, -IZ + 0.012, M.marble);
  bx(cub, -1.98, -1.43, F + 0.02, F + 1.93, -0.27, -0.255, M.frosted);
  const shw = grp(I, 'shower');
  bx(shw, -2.13, -1.42, F, F + 0.06, -IZ, -0.34, M.ceramic);
  rod(shw, [-1.77, F + 0.9, -IZ + 0.05], [-1.77, F + 1.95, -IZ + 0.05], 0.012, M.darkMetal);
  rod(shw, [-1.77, F + 1.95, -IZ + 0.05], [-1.77, F + 1.95, -IZ + 0.24], 0.012, M.darkMetal);
  cyl(shw, 0.12, 0.025, M.darkMetal, 'y', -1.77, F + 1.93, -IZ + 0.26);
  bx(shw, -1.85, -1.69, F + 0.95, F + 1.02, -IZ, -IZ + 0.07, M.darkMetal);
  hs('shower', I, -1.77, F + 1.3, -0.7, 'room3');
  const wc = grp(I, 'toilet');
  cyl(wc, 0.19, 0.38, M.ceramic, 'y', -2.55, F + 0.19, -0.78, 24, 0.14);
  cyl(wc, 0.2, 0.035, M.ceramic, 'y', -2.55, F + 0.4, -0.78);
  bx(wc, -2.75, -2.35, F + 0.38, F + 0.78, -IZ, -IZ + 0.18, M.ceramic);
  hs('toilet', I, -2.55, F + 0.7, -0.75, 'room3');
  const kit = grp(I, 'kitchen');
  bx(kit, -2.88, -1.45, F, F + 0.86, 0.55, IZ, M.furn);
  bx(kit, -2.89, -1.44, F + 0.86, F + 0.9, 0.52, IZ, M.furn);
  bx(kit, -2.88, -2.15, F + 1.35, F + 2.0, 0.8, IZ, M.furn);
  for (const x of [-2.4, -1.85]) bx(kit, x - 0.004, x + 0.004, F + 0.05, F + 0.82, 0.545, 0.55, M.grey);
  bx(kit, -2.52, -2.51, F + 1.4, F + 1.95, 0.795, 0.8, M.grey);
  for (const x of [-2.6, -2.1]) mk(new THREE.SphereGeometry(0.015, 8, 6), M.chrome, kit, x, F + 0.7, 0.54);
  hs('kitchen', I, -2.6, F + 1.7, 0.85, 'room3');
  const fr3 = grp(I, 'fridge3');
  bx(fr3, -1.8, -1.48, F + 0.05, F + 0.78, 0.54, 0.55, M.blackGloss);
  hs('fridge3', I, -1.64, F + 0.45, 0.53, 'room3');
  const sk = grp(I, 'sink3');
  bx(sk, -2.45, -2.0, F + 0.9, F + 0.905, 0.65, 1.0, M.steel);
  bx(sk, -2.42, -2.03, F + 0.905, F + 0.91, 0.68, 0.97, M.darkMetal);
  path(sk, [[-2.22, F + 0.9, 1.05], [-2.22, F + 1.22, 1.05], [-2.22, F + 1.22, 0.86]], 0.014, M.steel);
  hs('sink3', I, -2.22, F + 1.05, 0.82, 'room3');
  const boil = grp(I, 'boiler');
  bx(boil, -2.05, -1.5, F + 1.2, F + 1.95, IZ - 0.3, IZ, M.steel);
  bx(boil, -1.62, -1.55, F + 1.45, F + 1.9, IZ - 0.302, IZ - 0.3, M.lampRed);
  bx(boil, -1.85, -1.7, F + 1.28, F + 1.38, IZ - 0.302, IZ - 0.3, M.blackGloss);
  hs('boiler', I, -1.78, F + 1.6, 0.8, 'room3');
  const kt = grp(I, 'kettle');
  cyl(kt, 0.075, 0.2, M.blackGloss, 'y', -2.7, F + 1.0, 0.85, 20, 0.09);
  mk(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), M.blackGloss, kt, -2.7, F + 1.04, 0.95).rotation.set(0, Math.PI / 2, -Math.PI / 2);
  hs('kettle', I, -2.7, F + 1.15, 0.85, 'room3');

  /* Командно-штабной отсек */
  const sf4 = grp(I, 'sofa4');
  bx(sf4, -4.9, -3.25, F, F + 0.02, -IZ, -0.48, M.furn);
  bx(sf4, -4.9, -3.25, F, F + 0.42, -0.5, -0.48, M.furn);
  bx(sf4, -4.9, -3.25, F, F + 0.42, -IZ, -1.11, M.furn);
  bx(sf4, -4.9, -4.88, F, F + 0.42, -IZ, -0.48, M.furn);
  bx(sf4, -3.27, -3.25, F, F + 0.42, -IZ, -0.48, M.furn);
  bx(sf4, -4.9, -3.25, F + 0.42, F + 0.98, -IZ, -1.0, M.fabric);
  const lid = grp(sf4, 'sofa4', -4.075, F + 0.42, -1.0); A.lid = lid;
  bx(lid, -0.825, 0.825, 0, 0.11, 0, 0.52, M.fabric);
  const wtank = grp(I, 'tank4');
  bx(wtank, -4.82, -3.33, F + 0.04, F + 0.37, -1.08, -0.56, M.water);
  hs('sofa4', I, -4.5, F + 0.65, -0.75, 'room4');
  hs('tank4', I, -3.7, F + 0.45, -0.75, 'room4');
  const tb = grp(I, 'table4');
  bx(tb, -4.55, -3.8, F + 0.72, F + 0.76, -0.42, 0.12, M.wood);
  cyl(tb, 0.05, 0.72, M.chrome, 'y', -4.175, F + 0.36, -0.15);
  cyl(tb, 0.25, 0.02, M.chrome, 'y', -4.175, F + 0.01, -0.15);
  const leaf = grp(tb, 'table4', -4.175, F + 0.74, 0.12); A.leaf = leaf;
  bx(leaf, -0.37, 0.37, -0.02, 0.02, 0, 0.28, M.wood);
  hs('table4', I, -4.175, F + 0.85, -0.15, 'room4');
  const arm = grp(I, 'armchair', -4.1, F, 0.75);
  bx(arm, -0.28, 0.28, 0.42, 0.52, -0.27, 0.25, M.leather);
  bx(arm, -0.28, 0.28, 0.52, 1.15, 0.17, 0.29, M.leather);
  for (const s of [-1, 1]) {
    bx(arm, s * 0.28 - 0.035, s * 0.28 + 0.035, 0.52, 0.7, -0.27, 0.25, M.wood);
    rod(arm, [s * 0.22, 0, -0.2], [s * 0.22, 0.42, -0.2], 0.018, M.darkMetal);
    rod(arm, [s * 0.22, 0, 0.2], [s * 0.22, 0.42, 0.2], 0.018, M.darkMetal);
  }
  hs('armchair', I, -4.1, F + 1.2, 0.95, 'room4');
  const sf4b = grp(I, 'sofa4b');
  bx(sf4b, -5.12, -4.45, F, F + 0.42, 0.55, IZ, M.furn);
  bx(sf4b, -5.12, -4.45, F + 0.42, F + 0.53, 0.55, IZ - 0.1, M.fabric);
  bx(sf4b, -5.12, -4.45, F + 0.42, F + 0.95, IZ - 0.12, IZ, M.fabric);
  hs('sofa4b', I, -4.8, F + 0.65, 0.8, 'room4');
  const vc = grp(I, 'vcs');
  bx(vc, -4.65, -3.55, F + 1.12, F + 1.74, -IZ, -IZ + 0.05, M.plastic);
  const tvS = mk(new THREE.PlaneGeometry(1.06, 0.58), canvasMaterial(768, 420, drawConference), vc, -4.1, F + 1.43, -IZ + 0.0505); tvS.castShadow = false;
  bx(vc, -4.28, -3.92, F + 1.8, F + 1.82, -IZ, -IZ + 0.3, M.wood);
  bx(vc, -4.28, -3.92, F + 2.0, F + 2.02, -IZ, -IZ + 0.3, M.wood);
  for (const x of [-4.28, -3.94]) bx(vc, x, x + 0.02, F + 1.8, F + 2.02, -IZ, -IZ + 0.3, M.wood);
  const ptz = grp(vc, 'vcs', -4.1, F + 1.82, -IZ + 0.15);
  bx(ptz, -0.05, 0.05, 0, 0.03, -0.05, 0.05, M.plastic);
  for (const s of [-1, 1]) bx(ptz, -0.03, 0.03, 0.03, 0.12, s * 0.055 - 0.008, s * 0.055 + 0.008, M.plastic);
  cyl(ptz, 0.045, 0.1, M.plastic, 'z', 0, 0.09, 0.0, 20);
  cyl(ptz, 0.028, 0.012, M.glass, 'z', 0, 0.09, 0.056, 20);
  hs('vcs', I, -4.1, F + 1.5, -1.05, 'room4');

  const clk = grp(I, 'clocks');
  bx(clk, -3.45, -3.05, F, K.yC - 0.01, 0.55, IZ, M.wood);
  const clocks = [new ZoneClock('АСТАНА', 5), new ZoneClock('МОСКВА', 3), new ZoneClock('UTC', 0)];
  clocks.forEach((c, i) => {
    const y = F + 1.85 - i * 0.23;
    bx(clk, -3.47, -3.45, y - 0.1, y + 0.1, 0.6, 1.1, M.blackGloss);
    const p = mk(new THREE.PlaneGeometry(0.46, 0.18), c.mat, clk, -3.471, y, 0.85);
    p.rotation.y = -Math.PI / 2; p.castShadow = false;
  });
  hs('clocks', I, -3.48, F + 2.05, 0.85, 'room4');

  /* ---------- Отсеки: точки обзора ---------- */
  const rooms = [
    { id: 'room1', x0: 0.775, x1: 2.54, eye: V(1.0, F + 1.5, 0.35), look: V(2.4, F + 0.8, -0.6) },
    { id: 'room2', x0: -1.325, x1: 0.725, eye: V(0.45, F + 1.5, 0.3), look: V(-0.7, F + 1.15, -0.95) },
    { id: 'room3', x0: -2.975, x1: -1.375, eye: V(-1.55, F + 1.5, 0.12), look: V(-2.9, F + 0.95, 0.0) },
    { id: 'room4', x0: -5.19, x1: -3.025, eye: V(-3.15, F + 1.6, 0.2), look: V(-5.2, F + 1.1, -0.3) },
  ];
  for (const r of rooms) {
    r.center = V((r.x0 + r.x1) / 2, F + 1.0, 0);
    hs(r.id, I, r.center.x, F + 2.3, 0, 'cut');
  }

  /* ---------- Развёртывание ---------- */
  function setDeploy(t) {
    const sM = seg(t, 0.05, 0.8);
    for (const m of [A.mastF, A.mastR]) {
      m.secs.forEach((s, i) => { s.position.y = MAST_BASE + i * MAST_STEP * sM; });
      m.head.position.y = MAST_BASE + 4 * MAST_STEP * sM + 2.4;
    }
    A.tarp.scale.x = 1 - 0.82 * seg(t, 0, 0.35);
    A.dishPivot.position.y = 3.76 + 0.4 * seg(t, 0.25, 0.6);
    const tl = seg(t, 0.45, 0.9);
    A.dishElev.rotation.x = 0.9 * tl;
    A.dishPivot.rotation.y = -0.6 * tl;
    A.door1.rotation.y = 1.5 * seg(t, 0.1, 0.45);
    const sl = seg(t, 0.3, 0.7);
    A.l1.rotation.x = -0.3 * sl;
    A.l1low.rotation.x = Math.PI * (1 - sl);
    for (const tr of A.l1treads) tr.rotation.x = -A.l1.rotation.x;
    for (const tr of A.l1lowTreads) tr.rotation.x = -(A.l1.rotation.x + A.l1low.rotation.x);
    const st = seg(t, 0.0, 0.5);
    const a = -1.5 + (0.96 + 1.5) * st;
    A.trap.rotation.z = a;
    for (const tr of A.trapTreads) tr.rotation.z = -a;
    const ph = Math.max(0.01, seg(t, 0.35, 0.6));
    for (const p of A.trapPosts) { p.rotation.z = -a; p.scale.y = ph; }
    A.trapRail.position.set(0.9 * ph * Math.sin(a), 0.9 * ph * Math.cos(a), 0);
    A.trapRail.visible = ph > 0.05;
    A.door2.rotation.y = -1.5 * seg(t, 0.45, 0.85);
    const sc = seg(t, 0.2, 0.8);
    A.cctvRod.position.y = F + 0.05 + 2.2 * sc;
    A.cctvHead.position.y = F + 2.05 + 2.2 * sc;
    A.cctvHead.rotation.y = sc * 2.5;
    A.lid.rotation.x = -1.2 * seg(t, 0.5, 0.9);
    A.leaf.rotation.x = (Math.PI / 2) * (1 - seg(t, 0.3, 0.7));
  }
  setDeploy(0);

  return {
    root, parts, byId, hotspots, rooms, setDeploy, M,
    update(now) { for (const c of clocks) c.update(now); },
  };
}
