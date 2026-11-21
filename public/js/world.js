// The 3D office: a realistic open-plan floor in Beirut, lit by the real time of day there.
// Boardroom, desks, coffee bar, cafeteria, game lounge, gym and a terrace pool. Everything is drawn
// in code (no downloads): materials use painted textures, static furniture is merged for speed,
// and soft shadows + ambient occlusion + a little bloom make it read like a real space.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCharacter } from './characters.js';

const HALL_Z = 2.5;
const SWIM_Y = -1.25;
const WALL_H = 4.2;

// ---------- painted textures ----------
function canvasTex(size, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function noise(g, s, amt, base) {
  const img = g.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
const TEX = {
  oak: () => canvasTex(1024, (g, s) => { // long white-oak planks with grain
    const rows = 12, h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd(0, 400);
      while (x < s) {
        const w = rnd(260, 520), t = rnd(-14, 14);
        g.fillStyle = `rgb(${196 + t},${160 + t},${118 + t})`; g.fillRect(x, r * h, w, h);
        g.strokeStyle = 'rgba(110,72,40,.10)'; g.lineWidth = 1;
        for (let k = 0; k < 9; k++) { const y = r * h + rnd(2, h - 2); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + w * 0.3, y + rnd(-4, 4), x + w * 0.7, y + rnd(-4, 4), x + w, y + rnd(-3, 3)); g.stroke(); }
        g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(x, r * h, 2, h);
        x += w;
      }
      g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(0, r * h, s, 2);
    }
    noise(g, s, 10);
  }, [5, 4]),
  walnut: () => canvasTex(512, (g, s) => {
    g.fillStyle = '#5b3a24'; g.fillRect(0, 0, s, s);
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(${rnd(20, 60)},${rnd(10, 30)},0,${rnd(0.08, 0.25)})`; g.lineWidth = rnd(1, 3); const y = rnd(0, s); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + rnd(-20, 20), s * 0.7, y + rnd(-20, 20), s, y + rnd(-10, 10)); g.stroke(); }
    noise(g, s, 8);
  }),
  carpet: () => canvasTex(512, (g, s) => {
    g.fillStyle = '#5d5f66'; g.fillRect(0, 0, s, s); noise(g, s, 34);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
  }, [6, 6]),
  terrazzo: () => canvasTex(512, (g, s) => {
    g.fillStyle = '#e9e5de'; g.fillRect(0, 0, s, s);
    const cols = ['#b9b2a6', '#8d8579', '#d6b48a', '#a7b4b0', '#6f6a63', '#c9a27a'];
    for (let i = 0; i < 1400; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); const r = rnd(1, 5); g.ellipse(rnd(0, s), rnd(0, s), r, r * rnd(0.5, 1), rnd(0, 3), 0, 7); g.fill(); }
    noise(g, s, 6);
  }, [4, 4]),
  marble: () => canvasTex(512, (g, s) => {
    g.fillStyle = '#f1efea'; g.fillRect(0, 0, s, s);
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(120,120,128,${rnd(0.08, 0.3)})`; g.lineWidth = rnd(0.5, 2.5); g.beginPath(); let x = rnd(0, s), y = 0; g.moveTo(x, y); while (y < s) { x += rnd(-30, 30); y += rnd(20, 50); g.lineTo(x, y); } g.stroke(); }
    noise(g, s, 5);
  }),
  concrete: () => canvasTex(512, (g, s) => { g.fillStyle = '#b8b5b0'; g.fillRect(0, 0, s, s); noise(g, s, 22); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0.01, 0.05)})`; g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(10, 60), 0, 7); g.fill(); } }, [3, 3]),
  plaster: () => canvasTex(256, (g, s) => { g.fillStyle = '#ece8e1'; g.fillRect(0, 0, s, s); noise(g, s, 7); }, [4, 2]),
  tiles: () => canvasTex(256, (g, s) => { g.fillStyle = '#d7dcdc'; g.fillRect(0, 0, s, s); const n = 8, w = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const t = rnd(-8, 8); g.fillStyle = `rgb(${244 + t},${246 + t},${245 + t})`; g.fillRect(i * w + 1.5, j * w + 1.5, w - 3, w - 3); } }, [10, 5]),
  teak: () => canvasTex(512, (g, s) => { const n = 8, h = s / n; for (let r = 0; r < n; r++) { const t = rnd(-16, 16); g.fillStyle = `rgb(${150 + t},${98 + t},${62 + t})`; g.fillRect(0, r * h, s, h - 3); g.fillStyle = '#3a2618'; g.fillRect(0, r * h + h - 3, s, 3); } noise(g, s, 14); }, [4, 3]),
  rubber: () => canvasTex(256, (g, s) => { g.fillStyle = '#26282c'; g.fillRect(0, 0, s, s); noise(g, s, 18); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); }, [6, 3]),
  felt: (c) => canvasTex(128, (g, s) => { g.fillStyle = c; g.fillRect(0, 0, s, s); noise(g, s, 16); }, [2, 2]),
};

// ---------- the sky outside (Beirut, painted for the time of day) ----------
function paintSky(g, W, H, k) { // k: {day, gold, night} weights
  const mix = (a, b, c) => a.map((v, i) => Math.round(v * k.day + b[i] * k.gold + c[i] * k.night));
  const top = mix([118, 172, 224], [86, 92, 168], [8, 12, 34]), mid = mix([186, 214, 238], [246, 160, 112], [28, 26, 64]), low = mix([226, 236, 242], [255, 206, 140], [52, 36, 82]);
  const grd = g.createLinearGradient(0, 0, 0, H * 0.72); grd.addColorStop(0, `rgb(${top})`); grd.addColorStop(0.65, `rgb(${mid})`); grd.addColorStop(1, `rgb(${low})`);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // sun / moon glow
  const sx = W * (0.25 + 0.5 * k.gold), sy = H * (0.18 + 0.35 * k.gold);
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.6);
  glow.addColorStop(0, `rgba(255,${230 - 60 * k.gold},${190 - 90 * k.gold},${0.55 * (k.day + k.gold) + 0.2 * k.night})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  if (k.night > 0.3) { g.fillStyle = `rgba(255,255,255,${k.night * 0.8})`; for (let i = 0; i < 220; i++) g.fillRect(rnd(0, W), rnd(0, H * 0.5), rnd(1, 2), rnd(1, 2)); g.beginPath(); g.fillStyle = `rgba(240,240,255,${k.night})`; g.arc(W * 0.78, H * 0.16, 14, 0, 7); g.fill(); }
  // Mount Lebanon in haze
  g.fillStyle = `rgba(${mix([140, 160, 182], [150, 110, 130], [30, 30, 58])},0.85)`;
  g.beginPath(); g.moveTo(0, H * 0.62); for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.56 + Math.sin(x * 0.004) * 30 + Math.sin(x * 0.013) * 12); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  // the Mediterranean
  const sea = g.createLinearGradient(0, H * 0.7, 0, H); sea.addColorStop(0, `rgb(${mix([70, 130, 180], [190, 120, 110], [14, 20, 44])})`); sea.addColorStop(1, `rgb(${mix([30, 90, 140], [80, 50, 80], [6, 8, 20])})`);
  g.fillStyle = sea; g.fillRect(0, H * 0.72, W, H * 0.28);
  g.fillStyle = `rgba(255,240,210,${0.25 * k.gold + 0.12 * k.day})`; for (let i = 0; i < 160; i++) g.fillRect(sx + rnd(-200, 200), rnd(H * 0.73, H), rnd(8, 40), 1.5);
  // city skyline
  for (let x = 0; x < W;) {
    const w = rnd(30, 90), h = rnd(60, 230) * (x > W * 0.35 && x < W * 0.6 ? 0.5 : 1);
    g.fillStyle = `rgb(${mix([150, 160, 172], [92, 70, 90], [14, 16, 26])})`; g.fillRect(x, H * 0.74 - h, w, h);
    if (k.night > 0.2 || k.gold > 0.5) for (let wy = H * 0.74 - h + 8; wy < H * 0.74 - 4; wy += 11) for (let wx = x + 5; wx < x + w - 5; wx += 9) if (Math.random() < 0.3 * (k.night + k.gold * 0.4)) { g.fillStyle = Math.random() < 0.8 ? '#ffd58a' : '#cfe8ff'; g.fillRect(wx, wy, 4, 6); }
    x += w + rnd(2, 10);
  }
}

// Lighting keyframes across the day (Beirut time).
const KEYS = [ // hour: [day, gold, night]
  [0, [0, 0, 1]], [5.2, [0, 0, 1]], [6.3, [0.1, 0.9, 0]], [7.8, [1, 0, 0]], [16.3, [1, 0, 0]], [17.8, [0.1, 0.9, 0]], [19.0, [0, 0.25, 0.75]], [19.8, [0, 0, 1]], [24, [0, 0, 1]],
];
function beirutHour() {
  const forced = new URLSearchParams(location.search).get('hour'); if (forced) return +forced; // ?hour=14 to preview other times
  try { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Beirut', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value + +p.find((x) => x.type === 'minute').value / 60; }
  catch { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
}
function phaseAt(h) {
  for (let i = 0; i < KEYS.length - 1; i++) { const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1]; if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0 || 1); const v = a.map((x, j) => x + (b[j] - x) * t); return { day: v[0], gold: v[1], night: v[2] }; } }
  return { day: 0, gold: 0, night: 1 };
}

function init(container, { onAgentClick } = {}) {
  // ---------- renderer / scene ----------
  const lowPower = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 4) <= 4;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
  camera.position.set(21, 31, 37);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(3.5, 0, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.maxPolarAngle = 1.3; controls.minDistance = 5; controls.maxDistance = 60;
  controls.screenSpacePanning = false;

  // ---------- light (follows the real time of day in Beirut) ----------
  const hemi = new THREE.HemisphereLight('#cfe6ff', '#8a7a66', 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const lamps = [];
  const lamp = (x, y, z, c = '#ffd9a8', i = 1, dist = 12) => { const l = new THREE.PointLight(c, 0, dist, 1.8); l.position.set(x, y, z); l.userData.base = i; scene.add(l); lamps.push(l); return l; };
  lamp(0, 3.2, -9, '#ffd6a0', 1.2, 14); lamp(-14.5, 3.4, -4, '#fff1dc', 1, 14); lamp(-14.5, 3.4, 3, '#fff1dc', 1, 14); lamp(7, 2.8, -1.2, '#ffc98a', 1, 10);
  lamp(14, 3.2, -7, '#ffd09a', 1, 13); lamp(16, 3, 7.5, '#d8b8ff', 0.9, 12); lamp(-15, 3.2, 12.5, '#e6f0ff', 0.9, 12); lamp(3, 2.6, 11.5, '#9fe0ff', 0.9, 12);

  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 2048; skyCanvas.height = 640;
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(150, 46), new THREE.MeshBasicMaterial({ map: skyTex, fog: false, toneMapped: false }));
  skyline.position.set(0, 10, -48); scene.add(skyline);
  const skyLeft = skyline.clone(); skyLeft.position.set(-60, 10, 0); skyLeft.rotation.y = Math.PI / 2; scene.add(skyLeft);
  scene.fog = new THREE.Fog('#c9dcec', 70, 160);

  const emissives = []; // screens and lamps glow more at night
  let bloom = null, phase = null;
  function applyTime() {
    const k = phaseAt(beirutHour()); phase = k;
    paintSky(skyCanvas.getContext('2d'), skyCanvas.width, skyCanvas.height, k); skyTex.needsUpdate = true;
    const C = (d, g, n) => new THREE.Color(d).multiplyScalar(k.day).add(new THREE.Color(g).multiplyScalar(k.gold)).add(new THREE.Color(n).multiplyScalar(k.night));
    const ang = k.gold > 0.5 && beirutHour() > 12 ? -1 : 1;
    sun.color = C('#fff3e0', '#ffae66', '#8fa6ff');
    sun.intensity = 2.6 * k.day + 2.1 * k.gold + 0.35 * k.night;
    sun.position.set(ang * (10 + 18 * k.gold), 30 - 16 * k.gold - 6 * k.night, 18 - 6 * k.gold);
    hemi.color = C('#d6ecff', '#ffd2b0', '#4a5a90'); hemi.groundColor = C('#8c7b66', '#5a4048', '#1a1426');
    hemi.intensity = 0.95 * k.day + 0.6 * k.gold + 0.32 * k.night;
    renderer.toneMappingExposure = 0.95 * k.day + 0.95 * k.gold + 0.9 * k.night;
    const bg = C('#cfe1f0', '#e8b08a', '#0b0f22'); scene.background = bg; scene.fog.color = bg;
    for (const l of lamps) l.intensity = l.userData.base * (2 * k.day + 7 * k.gold + 11 * k.night);
    for (const m of emissives) m.emissiveIntensity = m.userData.base * (0.7 + 0.6 * k.night + 0.3 * k.gold);
    if (bloom) bloom.strength = 0.08 + 0.22 * k.night + 0.06 * k.gold;
  }

  // ---------- materials ----------
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const tex = (t, o = {}) => M('#ffffff', { map: t, ...o });
  const mat = {
    oak: tex(TEX.oak(), { roughness: 0.42 }), walnut: tex(TEX.walnut(), { roughness: 0.35 }), carpet: tex(TEX.carpet(), { roughness: 1 }),
    terrazzo: tex(TEX.terrazzo(), { roughness: 0.3 }), marble: tex(TEX.marble(), { roughness: 0.15 }), concrete: tex(TEX.concrete(), { roughness: 0.85 }),
    plaster: tex(TEX.plaster(), { roughness: 0.95 }), tiles: tex(TEX.tiles(), { roughness: 0.25 }), teak: tex(TEX.teak(), { roughness: 0.7 }), rubber: tex(TEX.rubber(), { roughness: 0.95 }),
    deskTop: M('#efe9df', { roughness: 0.35 }), blackMetal: M('#1c1d21', { roughness: 0.35, metalness: 0.8 }), steel: M('#b9bcc2', { roughness: 0.25, metalness: 1 }),
    chairFabric: M('#2b2e35', { roughness: 0.95 }), mesh: M('#17181c', { roughness: 0.8 }), leather: M('#3b2a22', { roughness: 0.45 }), cream: M('#e8e1d4', { roughness: 0.9 }),
    sofa: M('#3e4a5c', { roughness: 0.95 }), sofa2: M('#6b4a7a', { roughness: 0.95 }), cushion: M('#d8b46a', { roughness: 0.95 }), plantPot: M('#d9d3c8', { roughness: 0.7 }), terracotta: M('#a8644a', { roughness: 0.85 }),
    leaf: M('#2f6b3c', { roughness: 0.75, side: THREE.DoubleSide }), leaf2: M('#3f7d45', { roughness: 0.75, side: THREE.DoubleSide }), soil: M('#3b2b20', { roughness: 1 }),
    felt: tex(TEX.felt('#4b2370'), { roughness: 1 }), feltGrey: tex(TEX.felt('#7d8088'), { roughness: 1 }), green: M('#1f6b4a', { roughness: 0.8 }), white: M('#f4f2ee', { roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#dfefff', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, envMapIntensity: 1.2, depthWrite: false }),
    frame: M('#16171a', { roughness: 0.4, metalness: 0.7 }), book: [M('#8a2d2d'), M('#2d4a8a'), M('#d8b46a'), M('#3c6b4a'), M('#e9e3d6'), M('#4b2370')],
    ceramic: M('#ffffff', { roughness: 0.2 }), mirror: M('#c8d0d8', { roughness: 0.02, metalness: 1 }),
  };
  const glow = (color, base = 1) => { const m = M('#0a0a0c', { emissive: color, emissiveIntensity: base, roughness: 0.3 }); m.userData.base = base; emissives.push(m); return m; };

  // Static objects go into one group and are merged by material at the end (fast, even with lots of detail).
  const stat = new THREE.Group(); scene.add(stat);
  const G = {}; // shared geometries
  const geo = (key, make) => G[key] || (G[key] = make());
  const place = (g, m, x, y, z, parent = stat, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const box = (w, h, d, m, x, y, z, parent = stat, r = 0) => place(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const cyl = (rt, rb, h, m, x, y, z, parent = stat, seg = 24) => place(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, parent);
  const group = (x, z, ry = 0, parent = stat) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); return g; };

  // ---------- architecture ----------
  // floor slab with zone finishes
  box(46, 0.5, 36, mat.concrete, 0, -0.25, 0);
  const finish = (w, d, m, x, z, rep) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.clone()); if (rep && m.map) { p.material.map = m.map.clone(); p.material.map.repeat.set(...rep); p.material.map.needsUpdate = true; } p.rotation.x = -Math.PI / 2; p.position.set(x, 0.005, z); p.receiveShadow = true; stat.add(p); return p; };
  finish(44, 34, mat.oak, 0, 0, [6, 5]);
  finish(11, 13, mat.carpet, -14.4, -1.2, [5, 6]);
  finish(9, 9, mat.terrazzo, 14, -7, [3, 3]);
  finish(9.5, 6.5, mat.rubber, -15.2, 12.6, [5, 3]);
  finish(14, 9, mat.teak, 3, 12.5, [5, 3]);
  // walls: glass to the sea on the north, plaster on the sides, open at the front so you can look in
  box(0.3, WALL_H, 34, mat.plaster, -22.1, WALL_H / 2, 0);
  box(0.3, WALL_H, 34, mat.plaster, 22.1, WALL_H / 2, 0);
  box(44.5, 0.18, 0.3, mat.frame, 0, WALL_H, -17.1); box(44.5, 0.12, 0.3, mat.frame, 0, 0.06, -17.1);
  for (let x = -21; x <= 21; x += 3) box(0.1, WALL_H, 0.16, mat.frame, x, WALL_H / 2, -17.1);
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(44, WALL_H), mat.glass); p.position.set(0, WALL_H / 2, -17.1); scene.add(p); }
  // slab edge trim and a low front rail
  box(44.6, 0.06, 0.06, mat.steel, 0, 1.0, 17.6); for (let x = -22; x <= 22; x += 2.2) box(0.04, 1, 0.04, mat.steel, x, 0.5, 17.6);
  // columns
  for (const [x, z] of [[-7.5, -15], [7.5, -15], [-7.5, 6], [8.5, 6]]) box(0.6, WALL_H, 0.6, mat.concrete, x, WALL_H / 2, z, stat, 0.05);
  // wall art (painted abstracts) on the west wall
  const art = (x, y, z, w, h, ry, hue) => {
    const t = canvasTex(256, (g, s) => { g.fillStyle = `hsl(${hue},30%,88%)`; g.fillRect(0, 0, s, s); for (let i = 0; i < 6; i++) { g.fillStyle = `hsla(${hue + rnd(-40, 60)},${rnd(30, 70)}%,${rnd(30, 70)}%,.85)`; g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(30, 110), 0, 7); g.fill(); } g.strokeStyle = '#1b1b1f'; g.lineWidth = 6; g.beginPath(); g.moveTo(rnd(0, s), 0); g.bezierCurveTo(rnd(0, s), s / 2, rnd(0, s), s / 2, rnd(0, s), s); g.stroke(); });
    const f = group(x, z, ry); box(w + 0.1, h + 0.1, 0.06, mat.frame, 0, y, 0, f); place(new THREE.PlaneGeometry(w, h), M('#fff', { map: t, roughness: 0.8 }), 0, y, 0.035, f);
  };
  art(-21.9, 2.3, -11, 2.2, 1.5, Math.PI / 2, 30); art(-21.9, 2.3, 6, 1.6, 2.1, Math.PI / 2, 260); art(21.9, 2.3, -2, 2.4, 1.6, -Math.PI / 2, 200);

  // ---------- furniture builders ----------
  function officeChair(x, z, ry, parent = stat, tall = false, cloth = mat.chairFabric) {
    const c = group(x, z, ry, parent);
    for (let i = 0; i < 5; i++) { const leg = box(0.05, 0.04, 0.34, mat.blackMetal, 0, 0.06, 0, c); leg.rotation.y = (i / 5) * Math.PI * 2; leg.translateZ(0.17); cyl(0.03, 0.03, 0.04, mat.mesh, Math.sin((i / 5) * Math.PI * 2) * 0.33, 0.03, Math.cos((i / 5) * Math.PI * 2) * 0.33, c, 8); }
    cyl(0.03, 0.03, 0.34, mat.steel, 0, 0.25, 0, c, 10);
    box(0.52, 0.08, 0.5, cloth, 0, 0.46, 0, c, 0.035);
    box(0.5, tall ? 0.78 : 0.56, 0.06, tall ? cloth : mat.mesh, 0, tall ? 0.92 : 0.82, 0.25, c, 0.03);
    box(0.04, 0.2, 0.04, mat.blackMetal, -0.27, 0.58, 0.04, c); box(0.04, 0.2, 0.04, mat.blackMetal, 0.27, 0.58, 0.04, c);
    box(0.06, 0.03, 0.26, mat.mesh, -0.27, 0.69, 0.02, c, 0.01); box(0.06, 0.03, 0.26, mat.mesh, 0.27, 0.69, 0.02, c, 0.01);
    return c;
  }
  function simpleChair(x, z, ry, m = mat.oak, seat = mat.cream) {
    const c = group(x, z, ry);
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) cyl(0.018, 0.014, 0.45, m, lx, 0.225, lz, c, 8);
    box(0.46, 0.05, 0.44, seat, 0, 0.47, 0, c, 0.02); box(0.44, 0.3, 0.04, m, 0, 0.72, 0.21, c, 0.015);
    return c;
  }
  function monitor(x, z, parent) {
    const g = group(x, z, 0, parent);
    box(0.62, 0.38, 0.025, mat.blackMetal, 0, 1.12, 0, g, 0.01);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.34), glow(['#2a5d9c', '#3a7d6a', '#6a3a9c', '#9c6a2a'][Math.floor(Math.random() * 4)], 0.9)); scr.position.set(0, 1.12, 0.014); g.add(scr);
    box(0.04, 0.26, 0.04, mat.steel, 0, 0.9, -0.03, g); box(0.2, 0.012, 0.14, mat.steel, 0, 0.775, -0.02, g, 0.004);
    box(0.42, 0.015, 0.13, mat.white, 0, 0.778, 0.28, g, 0.004); box(0.06, 0.02, 0.1, mat.white, 0.3, 0.778, 0.3, g, 0.008);
  }
  function plant(x, z, s = 1, kind = 0) {
    const p = group(x, z, rnd(0, 6));
    cyl(0.26 * s, 0.2 * s, 0.5 * s, kind ? mat.terracotta : mat.plantPot, 0, 0.25 * s, 0, p, 18); cyl(0.24 * s, 0.24 * s, 0.02, mat.soil, 0, 0.49 * s, 0, p, 18);
    const leafGeo = geo('leaf', () => { const g = new THREE.SphereGeometry(0.5, 8, 6); g.scale(0.35, 0.05, 1); g.translate(0, 0, 0.5); return g; });
    const n = kind === 2 ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const leaf = new THREE.Mesh(leafGeo, i % 2 ? mat.leaf : mat.leaf2);
      if (kind === 2) { leaf.scale.set(0.5 * s, 1, 1.4 * s); leaf.position.set(0, 0.5 * s, 0); leaf.rotation.set(-Math.PI / 2 + rnd(0.05, 0.35), (i / n) * Math.PI * 2, 0); }
      else { const h = rnd(0.7, 1.5) * s; leaf.scale.set(s, 1, s * rnd(0.6, 0.9)); leaf.position.set(0, h, 0); leaf.rotation.set(rnd(-0.9, -0.2), (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), 0); cyl(0.012, 0.012, h - 0.5 * s, mat.leaf, 0, 0.5 * s + (h - 0.5 * s) / 2, 0, p, 5); }
      leaf.castShadow = true; p.add(leaf);
    }
  }
  function pendant(x, z, y = 2.6, kind = 0) {
    cyl(0.006, 0.006, WALL_H + 2 - y, mat.blackMetal, x, y + (WALL_H + 2 - y) / 2, z, stat, 4);
    if (kind === 0) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), glow('#ffd7a0', 1.6)); m.position.set(x, y, z); stat.add(m); }
    else { cyl(0.05, 0.28, 0.24, mat.blackMetal, x, y, z, stat, 20); const m = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), glow('#ffe2b8', 1.6)); m.rotation.x = Math.PI / 2; m.position.set(x, y - 0.121, z); stat.add(m); }
  }
  function linearLight(x, z, len, y = 2.9) {
    for (const dx of [-len / 2 + 0.2, len / 2 - 0.2]) cyl(0.005, 0.005, WALL_H + 2 - y, mat.blackMetal, x + dx, y + (WALL_H + 2 - y) / 2, z, stat, 4);
    box(len, 0.05, 0.12, mat.blackMetal, x, y, z); const m = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.05, 0.08), glow('#fff4e2', 1.4)); m.rotation.x = Math.PI / 2; m.position.set(x, y - 0.026, z); stat.add(m);
  }
  function rug(w, d, x, z, color, border = '#d8b46a') {
    const t = canvasTex(256, (g, s) => { g.fillStyle = color; g.fillRect(0, 0, s, s); noise(g, s, 18); g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(14, 14, s - 28, s - 28); });
    const p = new THREE.Mesh(new RoundedBoxGeometry(w, 0.02, d, 1, 0.01), M('#fff', { map: t, roughness: 1 })); p.position.set(x, 0.012, z); p.receiveShadow = true; stat.add(p);
  }
  function shelf(x, z, ry, w = 2.4) {
    const s = group(x, z, ry);
    for (let i = 0; i < 4; i++) { box(w, 0.04, 0.34, mat.oak, 0, 0.3 + i * 0.5, 0, s); let bx = -w / 2 + 0.08; while (bx < w / 2 - 0.15) { const bw = rnd(0.04, 0.09), bh = rnd(0.25, 0.4); if (Math.random() < 0.85) box(bw, bh, 0.24, mat.book[Math.floor(Math.random() * mat.book.length)], bx + bw / 2, 0.32 + i * 0.5 + bh / 2, 0, s); bx += bw + 0.005 + (Math.random() < 0.1 ? 0.25 : 0); } }
    box(0.04, 2, 0.34, mat.blackMetal, -w / 2, 1, 0, s); box(0.04, 2, 0.34, mat.blackMetal, w / 2, 1, 0, s);
  }
  function sofa(x, z, ry, w = 2.6, m = mat.sofa) {
    const s = group(x, z, ry);
    box(w, 0.4, 0.95, m, 0, 0.26, 0, s, 0.06); box(w, 0.55, 0.22, m, 0, 0.66, 0.37, s, 0.08);
    box(0.22, 0.6, 0.95, m, -w / 2 + 0.11, 0.42, 0, s, 0.08); box(0.22, 0.6, 0.95, m, w / 2 - 0.11, 0.42, 0, s, 0.08);
    const n = Math.max(2, Math.round(w / 0.9)); for (let i = 0; i < n; i++) box((w - 0.5) / n - 0.03, 0.14, 0.7, m, -w / 2 + 0.25 + ((w - 0.5) / n) * (i + 0.5), 0.52, -0.05, s, 0.06);
    box(0.42, 0.38, 0.12, mat.cushion, -w / 2 + 0.55, 0.75, 0.22, s, 0.06).rotation.z = 0.2;
    for (const lx of [-w / 2 + 0.15, w / 2 - 0.15]) for (const lz of [-0.4, 0.4]) cyl(0.02, 0.015, 0.06, mat.blackMetal, lx, 0.03, lz, s, 6);
    return s;
  }

  // ---------- zones ----------
  const Z = {};
  const ring = (cx, cz, rx, rz, n, start = 0, span = Math.PI * 2) => Array.from({ length: n }, (_, i) => { const a = start + (span * i) / n; return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz, look: { x: cx, z: cz } }; });

  // Boardroom: glass box with black frames, walnut table, leather chairs, big screen
  { const cx = 0, cz = -9;
    finish(12.8, 9, mat.walnut, cx, cz, [4, 3]); rug(10.5, 6, cx, cz, '#2c2433');
    const top = cyl(1, 1, 0.07, mat.walnut, cx, 0.76, cz, stat, 64); top.scale.set(4.2, 1, 1.55);
    box(4.6, 0.68, 0.5, mat.blackMetal, cx, 0.36, cz, stat, 0.04);
    for (let i = -3; i <= 3; i++) { box(0.16, 0.01, 0.1, mat.blackMetal, cx + i * 1.1, 0.8, cz - 0.6); box(0.16, 0.01, 0.1, mat.blackMetal, cx + i * 1.1, 0.8, cz + 0.6); }
    const walls = [[cx, cz - 4.6, 13, 0], [cx - 6.5, cz, 9.2, 1], [cx + 6.5, cz, 9.2, 1], [cx - 4, cz + 4.6, 5, 0], [cx + 4, cz + 4.6, 5, 0]];
    for (const [x, z, len, side] of walls) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.9), mat.glass); p.position.set(x, 1.45, z); if (side) p.rotation.y = Math.PI / 2; scene.add(p);
      box(side ? 0.06 : len, 0.06, side ? len : 0.06, mat.frame, x, 2.9, z); box(side ? 0.06 : len, 0.06, side ? len : 0.06, mat.frame, x, 0.03, z);
      for (let k = -len / 2; k <= len / 2 + 0.01; k += len / Math.max(1, Math.round(len / 2.2))) box(0.05, 2.9, 0.05, mat.frame, side ? x : x + k, 1.45, side ? z + k : z);
    }
    ring(cx, cz, 5.4, 2.85, 14).forEach((c) => { const ch = officeChair(c.x, c.z, Math.atan2(cx - c.x, cz - c.z) + Math.PI, stat, true, mat.leather); });
    box(4.2, 2.36, 0.06, mat.blackMetal, cx, 1.85, cz - 4.5, stat, 0.02);
    const screenTex = canvasTex(512, (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#2c123f'); gr.addColorStop(1, '#0d0716'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.fillStyle = '#fbd404'; g.font = 'bold 54px Readex Pro, sans-serif'; g.textAlign = 'center'; g.fillText('MEETING ROOM', s / 2, s / 2 - 10); g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '24px Readex Pro, sans-serif'; g.fillText("Wissam's HQ · Beirut", s / 2, s / 2 + 34); });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.05, 2.22), new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.8 })); scr.material.userData.base = 0.8; emissives.push(scr.material);
    scr.position.set(cx, 1.85, cz - 4.46); scene.add(scr);
    linearLight(cx, cz, 6, 2.5); plant(cx - 5.8, cz - 3.8, 1.1, 2); plant(cx + 5.8, cz - 3.8, 1.1, 2);
    Z.boardroom = { door: { x: 0, z: -4 }, spots: ring(cx, cz, 4.85, 2.35, 14) };
  }
  // Desks: white-oak benching, felt dividers, monitors, task chairs; whoever has open tasks sits here
  { const spots = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = -19 + c * 3.1, z = -6 + r * 3.2, d = group(x, z);
      box(1.7, 0.04, 0.85, mat.deskTop, 0, 0.75, 0, d, 0.015);
      for (const sx of [-0.78, 0.78]) { box(0.05, 0.73, 0.05, mat.blackMetal, sx, 0.37, -0.36, d); box(0.05, 0.73, 0.05, mat.blackMetal, sx, 0.37, 0.36, d); box(0.05, 0.04, 0.72, mat.blackMetal, sx, 0.05, 0, d); }
      box(1.7, 0.45, 0.04, mat.felt, 0, 1.0, -0.44, d, 0.015);
      monitor(0, -0.2, d);
      if ((r + c) % 3 === 0) { cyl(0.04, 0.035, 0.1, mat.ceramic, 0.55, 0.82, 0.1, d, 12); }
      if ((r * 4 + c) % 5 === 1) { const pp = group(-0.62, -0.15, 0, d); cyl(0.07, 0.06, 0.12, mat.terracotta, 0, 0.83, 0, pp, 10); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), mat.leaf2); b.position.y = 0.97; pp.add(b); }
      if ((r * 4 + c) % 4 === 2) { box(0.32, 0.012, 0.22, mat.steel, -0.4, 0.776, 0.12, d, 0.004); }
      officeChair(x, z + 0.95, Math.PI);
      spots.push({ x, z: z + 0.92, look: { x, z: z - 2 }, sit: true });
    }
    for (let r = 0; r < 4; r++) linearLight(-14.35, -6 + r * 3.2 - 0.1, 10.5, 3.0);
    shelf(-21.7, -11.5, Math.PI / 2, 3); plant(-21, -15.6, 1.3, 0); plant(-9, 5.4, 1, 2); plant(-21, 4.5, 1.1, 1);
    Z.desk = { door: { x: -9, z: HALL_Z }, spots };
  }
  // Coffee bar: marble counter, espresso machine, stools, globe pendants
  { const cb = group(7, -1.6);
    box(3.6, 1.0, 0.8, mat.walnut, 0, 0.5, 0, cb, 0.02); box(3.75, 0.05, 0.92, mat.marble, 0, 1.03, 0, cb, 0.01);
    box(3.6, 0.04, 0.6, mat.marble, 0, 0.92, -1.25, cb); box(3.6, 0.9, 0.6, mat.white, 0, 0.45, -1.25, cb);
    const em = group(-0.9, -0.05, 0, cb); box(0.6, 0.42, 0.42, mat.steel, 0, 1.27, 0, em, 0.04); box(0.5, 0.06, 0.3, mat.blackMetal, 0, 1.08, 0.05, em); cyl(0.03, 0.03, 0.12, mat.blackMetal, -0.12, 1.15, 0.22, em, 8); cyl(0.03, 0.03, 0.12, mat.blackMetal, 0.12, 1.15, 0.22, em, 8);
    for (let i = 0; i < 6; i++) cyl(0.035, 0.03, 0.08, mat.ceramic, 0.3 + i * 0.13, 1.1, -0.15, cb, 10);
    for (let i = 0; i < 4; i++) { const st = group(-1.2 + i * 0.8, 0.75, 0, cb); cyl(0.2, 0.2, 0.05, mat.leather, 0, 0.78, 0, st, 20); cyl(0.025, 0.025, 0.75, mat.steel, 0, 0.39, 0, st, 8); cyl(0.2, 0.22, 0.02, mat.steel, 0, 0.01, 0, st, 20); }
    for (let i = 0; i < 3; i++) pendant(5.8 + i * 1.2, -1.6, 2.2, 0);
    Z.coffee = { door: { x: 7, z: HALL_Z }, spots: [0, 1, 2, 3].map((i) => ({ x: 5.8 + i * 0.8, z: -0.5, look: { x: 5.8 + i * 0.8, z: -2 } })) };
  }
  // Cafeteria: round tables, oak chairs, terrazzo floor
  { const spots = [];
    [[11.5, -9], [16.5, -9], [11.5, -5], [16.5, -5]].forEach(([x, z]) => {
      cyl(0.8, 0.8, 0.04, mat.marble, x, 0.75, z, stat, 40); cyl(0.05, 0.05, 0.72, mat.blackMetal, x, 0.37, z, stat, 10); cyl(0.32, 0.36, 0.03, mat.blackMetal, x, 0.015, z, stat, 24);
      ring(x, z, 1.15, 1.15, 4, Math.PI / 4).forEach((c) => simpleChair(c.x, c.z, Math.atan2(x - c.x, z - c.z) + Math.PI));
      cyl(0.05, 0.05, 0.12, mat.ceramic, x + 0.2, 0.83, z, stat, 10); pendant(x, z, 2.1, 1);
      spots.push(...ring(x, z, 1.25, 1.25, 4, Math.PI / 4));
    });
    shelf(21.7, -10, -Math.PI / 2, 3.2); plant(20.8, -15.5, 1.3, 1); plant(9.3, -11.6, 0.9, 2);
    Z.cafeteria = { door: { x: 11, z: -2.5 }, spots };
  }
  // Game lounge: ping-pong, sectional sofa, TV wall, arcade cabinet
  { rug(9, 6.2, 16.5, 7.5, '#3a2a4a');
    const pt = group(14, 7); box(2.74, 0.05, 1.52, mat.green, 0, 0.76, 0, pt, 0.01); box(0.02, 0.15, 1.6, mat.white, 0, 0.86, 0, pt);
    box(2.74, 0.005, 0.02, mat.white, 0, 0.787, 0, pt); for (const [lx, lz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) box(0.05, 0.74, 0.05, mat.blackMetal, lx, 0.37, lz, pt);
    sofa(18.5, 6.2, Math.PI, 3.2, mat.sofa2); box(1.2, 0.36, 0.6, mat.walnut, 18.5, 0.2, 7.9, stat, 0.03);
    box(2.2, 1.25, 0.05, mat.blackMetal, 18.5, 1.7, 10.2, stat, 0.01); const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.16), glow('#7b4ad1', 0.9)); tv.position.set(18.5, 1.7, 10.17); tv.rotation.y = Math.PI; scene.add(tv);
    box(2.6, 0.4, 0.45, mat.walnut, 18.5, 0.2, 10.0, stat, 0.03);
    const ar = group(21.2, 4.4, -Math.PI / 2); box(0.75, 1.8, 0.7, mat.blackMetal, 0, 0.9, 0, ar, 0.03); const as = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.45), glow('#2ad1c9', 1.2)); as.position.set(0, 1.35, 0.36); ar.add(as); box(0.7, 0.08, 0.3, glow('#fbd404', 0.7), 0, 1.0, 0.4, ar);
    pendant(14, 7, 2.3, 1); pendant(13, 7, 2.3, 1); pendant(15, 7, 2.3, 1); plant(21, 1.8, 1.2, 2); plant(10.5, 9.8, 1, 0);
    Z.games = { door: { x: 11, z: HALL_Z }, spots: [{ x: 12.2, z: 7, look: { x: 14, z: 7 } }, { x: 15.8, z: 7, look: { x: 14, z: 7 } }, ...ring(18.5, 7.6, 1.6, 0.6, 6, 0, Math.PI)] };
  }
  // Gym: treadmills facing a mirror wall, dumbbell rack, mats
  { const spots = [];
    box(9, 2.2, 0.05, mat.mirror, -15.5, 1.3, 9.35, stat); box(9.1, 0.06, 0.08, mat.frame, -15.5, 2.42, 9.35);
    for (let i = 0; i < 4; i++) {
      const x = -19 + i * 2.3, z = 11, t = group(x, z);
      box(0.8, 0.16, 1.9, mat.blackMetal, 0, 0.09, 0, t, 0.04); box(0.62, 0.01, 1.6, mat.rubber, 0, 0.175, 0.05, t);
      box(0.05, 1.15, 0.05, mat.blackMetal, -0.35, 0.7, -0.88, t); box(0.05, 1.15, 0.05, mat.blackMetal, 0.35, 0.7, -0.88, t);
      box(0.8, 0.1, 0.3, mat.blackMetal, 0, 1.28, -0.88, t, 0.03); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), glow('#3ddc97', 0.8)); sc.position.set(0, 1.34, -0.72); sc.rotation.x = -0.6; t.add(sc);
      spots.push({ x, z: z + 0.1, look: { x, z: z - 3 }, y: 0.18, anim: 'run' });
    }
    const rk = group(-11, 14.8); box(2.4, 0.06, 0.45, mat.blackMetal, 0, 0.5, 0, rk); box(2.4, 0.06, 0.45, mat.blackMetal, 0, 0.9, 0, rk);
    for (const sx of [-1.15, 1.15]) box(0.05, 1, 0.45, mat.blackMetal, sx, 0.5, 0, rk);
    for (let i = 0; i < 6; i++) for (const y of [0.6, 1.0]) { const db = group(-1 + i * 0.4, 0, 0, rk); cyl(0.07, 0.07, 0.07, mat.blackMetal, -0.12, y, 0, db, 12).rotation.z = Math.PI / 2; cyl(0.07, 0.07, 0.07, mat.blackMetal, 0.12, y, 0, db, 12).rotation.z = Math.PI / 2; cyl(0.02, 0.02, 0.2, mat.steel, 0, y, 0, db, 8).rotation.z = Math.PI / 2; }
    for (let i = 0; i < 3; i++) box(0.65, 0.02, 1.7, glow('#4b2370', 0.05), -13.6 + i * 1.2, 0.012, 13.9, stat, 0.008);
    plant(-21, 15.6, 1.2, 1);
    spots.push(...[0, 1, 2, 3].map((i) => ({ x: -13 + i * 1.2, z: 13.6, look: { x: -13 + i * 1.2, z: 15 } })));
    Z.gym = { door: { x: -9, z: 8 }, spots };
  }
  // Terrace pool: tiled basin, teak deck, loungers and umbrellas
  const water = (() => {
    const cx = 3, cz = 11.5, w = 10, d = 5;
    for (const [x, z, bw, bd] of [[cx, cz - d / 2 - 0.25, w + 1, 0.5], [cx, cz + d / 2 + 0.25, w + 1, 0.5], [cx - w / 2 - 0.25, cz, 0.5, d], [cx + w / 2 + 0.25, cz, 0.5, d]]) box(bw, 0.22, bd, mat.marble, x, 0.11, z, stat, 0.03);
    const basin = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), [mat.tiles, mat.tiles, mat.tiles, mat.tiles, mat.tiles, mat.tiles].map((m) => { const c = m.clone(); c.side = THREE.BackSide; return c; }));
    basin.position.set(cx, -0.6, cz); basin.receiveShadow = true; scene.add(basin);
    const g = new THREE.PlaneGeometry(w, d, 60, 30);
    const wm = new THREE.MeshPhysicalMaterial({ color: '#2aa7d8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#0c5f86', emissiveIntensity: 0.35, envMapIntensity: 1.5 });
    const m = new THREE.Mesh(g, wm); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.16, cz); m.receiveShadow = true; scene.add(m);
    for (let i = 0; i < 3; i++) { const l = group(-1.8 + i * 1.6, 15.4); box(0.66, 0.08, 1.4, mat.white, 0, 0.3, 0.15, l, 0.03); const back = box(0.66, 0.08, 0.7, mat.white, 0, 0.48, -0.7, l, 0.03); back.rotation.x = 0.55; box(0.6, 0.06, 1.3, mat.cushion, 0, 0.36, 0.15, l, 0.03); for (const lx of [-0.28, 0.28]) for (const lz of [-0.5, 0.75]) box(0.04, 0.28, 0.04, mat.steel, lx, 0.14, lz, l); }
    for (const [ux, uz] of [[-2.6, 15.6], [4.6, 15.6]]) { cyl(0.03, 0.03, 2.3, mat.steel, ux, 1.15, uz, stat, 8); const u = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.45, 8, 1, true), M('#f4efe4', { side: THREE.DoubleSide, roughness: 0.9 })); u.position.set(ux, 2.3, uz); u.castShadow = true; stat.add(u); cyl(0.28, 0.32, 0.08, mat.blackMetal, ux, 0.04, uz, stat, 16); }
    plant(9.2, 16.2, 1.4, 2); plant(-3.3, 8.7, 1.2, 2); plant(9.3, 8.6, 1.1, 1);
    Z.pool = { door: { x: 3, z: 7.8 }, spots: Array.from({ length: 8 }, (_, i) => ({ x: cx - 3.5 + (i % 4) * 2.3, z: cz - 1.2 + Math.floor(i / 4) * 2.4, look: { x: cx + 5, z: cz - 1.2 + Math.floor(i / 4) * 2.4 }, swim: true })) };
    return m;
  })();
  Z.home = { door: { x: 19, z: 16.5 }, spots: [{ x: 19, z: 18.5, look: { x: 19, z: 25 }, hide: true }] };
  // hallway lounge touches
  sofa(-3.5, 4.6, 0, 2.4, mat.sofa); plant(-5.4, 4.4, 0.9, 1); plant(5.6, 3.4, 1.1, 2); plant(6.5, -3.6, 1.2, 0); plant(-6.5, -3.6, 1.2, 0);
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.7), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fbd404', emissiveIntensity: 1.4, transparent: true, map: canvasTex(512, (g, s2) => { g.clearRect(0, 0, s2, s2); g.fillStyle = '#fff'; g.font = 'bold 120px Readex Pro, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('W · HQ', s2 / 2, s2 / 2); }), alphaTest: 0.3 }));
    s.material.emissiveMap = s.material.map; s.material.userData.base = 1.4; emissives.push(s.material); s.scale.set(0.6, 4, 1); s.position.set(-21.93, 3.2, -4.5); s.rotation.y = Math.PI / 2; scene.add(s); }

  // ---------- merge the static furniture by material (hundreds of draw calls -> a few dozen) ----------
  (function mergeStatic() {
    stat.updateMatrixWorld(true);
    const byMat = new Map(), drop = [];
    stat.traverse((o) => { if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return; const list = byMat.get(o.material) || []; list.push(o); byMat.set(o.material, list); drop.push(o); });
    for (const [m, list] of byMat) {
      const geos = list.map((o) => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(o.matrixWorld); return g; });
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    }
    for (const o of drop) o.parent.remove(o);
  })();

  // ---------- characters ----------
  const agents = new Map();
  const clock = new THREE.Clock();
  const shadowTex = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, [1, 1], false);
  const blobMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

  function makeLabel(a) {
    const el = document.createElement('button');
    el.className = 'tag'; el.type = 'button';
    el.innerHTML = `<i style="--c:${a.color || '#fbd404'}"></i><b>${a.name}</b><span>${a.role}</span>`;
    el.setAttribute('aria-label', `Talk to ${a.name}, ${a.role}`);
    el.addEventListener('click', () => onAgentClick?.(a.id));
    const o = new CSS2DObject(el); o.position.set(0, 2.12 * (a.look?.height || 1), 0);
    o.center.set(0.5, 1);
    return { o, el };
  }
  function makeBody(a) {
    const ch = makeCharacter(a.look || { skin: '#e0ae88', hair: 'short', hairColor: '#2a1d14', top: { type: 'tee', color: a.color }, bottom: { color: '#2e3440' } });
    ch.root.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; } });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; ch.root.add(blob); ch.blob = blob;
    return ch;
  }
  function setAnim(ag, name) { ag.ch.setState(name); ag.anim = name; }
  function spotFor(ag, place) {
    const zone = Z[place] || Z.desk;
    const i = ag.index % zone.spots.length;
    const sp = zone.spots[i];
    const extra = Math.floor(ag.index / zone.spots.length);
    return { ...sp, x: sp.x + extra * 0.6, z: sp.z + extra * 0.4, zone: place };
  }
  function doorOf(place) { return (Z[place] || Z.desk).door; }
  function walkTo(ag, place, instant = false) {
    const target = spotFor(ag, place);
    ag.place = place;
    if (instant || !ag.spot) {
      ag.root.position.set(target.x, target.swim ? SWIM_Y : target.y || 0, target.z);
      ag.root.visible = !target.hide; ag.label.o.visible = !target.hide;
      ag.spot = target; ag.path = []; ag.arrive(target); return;
    }
    const from = ag.root.position, fromDoor = doorOf(ag.spot.zone), toDoor = doorOf(place);
    ag.root.visible = true; ag.label.o.visible = true; ag.swimming = false; ag.root.position.y = 0;
    const pts = [];
    if (ag.spot.zone !== place) pts.push(fromDoor, { x: fromDoor.x, z: HALL_Z }, { x: toDoor.x, z: HALL_Z }, toDoor);
    pts.push(target);
    ag.path = pts.map((p) => new THREE.Vector3(p.x, 0, p.z));
    if (Math.hypot(from.x - pts[0].x, from.z - pts[0].z) < 0.05) ag.path.shift();
    ag.spot = target;
    setAnim(ag, 'walk');
  }
  function addAgent(a, index) {
    const ch = makeBody(a); const root = ch.root;
    const label = makeLabel(a);
    root.add(label.o); scene.add(root);
    const ag = { ...a, index, ch, root, label, path: [], anim: 'idle', speaking: false, swimTime: Math.random() * 10 };
    ag.arrive = (sp) => {
      if (sp.hide) { ag.root.visible = false; ag.label.o.visible = false; }
      ag.swimming = !!sp.swim; ch.blob.visible = !sp.swim;
      if (sp.swim) ag.root.position.y = SWIM_Y;
      if (sp.y) ag.root.position.y = sp.y;
      if (sp.look) ag.root.rotation.y = Math.atan2(sp.look.x - ag.root.position.x, sp.look.z - ag.root.position.z);
      setAnim(ag, sp.anim === 'run' ? 'run' : sp.swim ? 'swim' : sp.sit ? 'sit' : ag.thinking ? 'think' : 'idle');
    };
    agents.set(a.id, ag);
    walkTo(ag, a.place, true);
    return ag;
  }

  // ---------- post-processing: ambient occlusion + soft bloom (skipped on weak devices) ----------
  let composer = null, aoPass = null;
  (async () => {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      const c = new EffectComposer(renderer);
      c.addPass(new RenderPass(scene, camera));
      if (!lowPower) {
        try { const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'); aoPass = new GTAOPass(scene, camera, container.clientWidth || 800, container.clientHeight || 600); aoPass.blendIntensity = 0.9; aoPass.updateGtaoMaterial?.({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 }); c.addPass(aoPass); } catch (e) { console.warn('[world] no AO', e); }
      }
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.5, 0.95); c.addPass(bloom);
      c.addPass(new OutputPass());
      composer = c; resize(); applyTime();
    } catch (e) { console.warn('[world] post-processing off', e); }
  })();

  // ---------- loop ----------
  const tmp = new THREE.Vector3();
  let slow = 0, frames = 0, acc = 0;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    // if the device struggles, drop ambient occlusion
    acc += dt; frames++; if (acc > 2) { if (aoPass && acc / frames > 0.03 && ++slow >= 2) { aoPass.enabled = false; aoPass = null; } acc = 0; frames = 0; }
    for (const ag of agents.values()) {
      if (ag.path.length) {
        const next = ag.path[0];
        tmp.set(next.x - ag.root.position.x, 0, next.z - ag.root.position.z);
        const dist = tmp.length(), step = 1.45 * dt;
        if (dist <= step) { ag.root.position.x = next.x; ag.root.position.z = next.z; ag.path.shift(); if (!ag.path.length) ag.arrive(ag.spot); }
        else {
          tmp.normalize(); ag.root.position.addScaledVector(tmp, step);
          const yaw = Math.atan2(tmp.x, tmp.z); let d = yaw - ag.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); ag.root.rotation.y += d * Math.min(1, dt * 10);
        }
      } else if (ag.swimming) {
        ag.swimTime += dt;
        ag.root.position.x = ag.spot.x + Math.sin(ag.swimTime * 0.35) * 1.4;
        ag.root.rotation.y = Math.cos(ag.swimTime * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2;
        ag.root.position.y = SWIM_Y + Math.sin(ag.swimTime * 2) * 0.03;
      }
      ag.ch.talking = ag.speaking;
      ag.ch.update(dt);
    }
    const pos = water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.6 + t * 1.8) * 0.02 + Math.cos(pos.getY(i) * 2.1 + t * 1.3) * 0.016);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
    if (fly) { camera.position.lerp(fly.pos, 0.06); controls.target.lerp(fly.target, 0.08); if (camera.position.distanceTo(fly.pos) < 0.05) fly = null; }
    controls.update();
    if (composer) composer.render(); else renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  renderer.setAnimationLoop(tick);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h); labels.setSize(w, h); composer?.setSize(w, h); aoPass?.setSize?.(w, h);
    camera.aspect = w / h; camera.fov = w / h < 1 ? 52 : 38; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : tick));
  applyTime(); setInterval(applyTime, 5 * 60e3);

  // ---------- camera presets ----------
  let fly = null;
  const views = {
    overview: { pos: [21, 31, 37], target: [3.5, 0, 0] },
    boardroom: { pos: [5, 6.5, 1.5], target: [0, 0.8, -9] },
    desk: { pos: [-9, 7.5, 9], target: [-14.5, 0.6, -1.5] },
    cafeteria: { pos: [9.5, 6.5, 0.5], target: [14, 0.5, -7] },
    games: { pos: [11, 5.5, 14], target: [16, 0.6, 7] },
    gym: { pos: [-11, 5.5, 19], target: [-15, 0.6, 11.5] },
    pool: { pos: [8, 6, 20], target: [3, 0, 11.5] },
    coffee: { pos: [9, 3.8, 4], target: [7, 1, -1.2] },
  };
  const flyTo = (name) => { const v = views[name] || views.overview; fly = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) }; };

  // ---------- public API ----------
  return {
    async load(team) { team.forEach((a, i) => addAgent(a, i)); },
    update(team) { for (const a of team) { const ag = agents.get(a.id); if (ag && !ag.summoned && ag.place !== a.place) walkTo(ag, a.place); } },
    summon(id, ms = 180000) {
      const ag = agents.get(id); if (!ag) return;
      clearTimeout(ag.summonTimer);
      if (ag.place !== 'boardroom') { ag.prev = ag.place; walkTo(ag, 'boardroom'); }
      ag.summoned = true;
      ag.summonTimer = setTimeout(() => { ag.summoned = false; if (ag.prev) walkTo(ag, ag.prev); ag.prev = null; }, ms);
    },
    speaking(id, on) { const ag = agents.get(id); if (!ag) return; ag.speaking = on; ag.label.el.classList.toggle('speaking', on); },
    thinking(id, on) { const ag = agents.get(id); if (!ag) return; ag.label.el.classList.toggle('thinking', on); ag.thinking = on; if (!ag.path.length && !ag.swimming && ag.anim !== 'run' && ag.anim !== 'sit') setAnim(ag, on ? 'think' : 'idle'); },
    focus(id) { const ag = agents.get(id); if (!ag || !ag.root.visible) return; const p = ag.root.position; fly = { pos: new THREE.Vector3(p.x + 3.2, 3.2, p.z + 4.2), target: new THREE.Vector3(p.x, 1.1, p.z) }; },
    view: flyTo,
    get phase() { return phase; },
  };
}

window.World = { init };
window.dispatchEvent(new Event('world-ready'));
