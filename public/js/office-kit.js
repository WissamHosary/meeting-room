// Shared pieces for the 3D office and the meeting room: painted textures, Beirut sky, time-of-day light.
import * as THREE from 'three';

// ---------- painted textures ----------
export function canvasTex(size, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const rnd = (a, b) => a + Math.random() * (b - a);
export function noise(g, s, amt, base) {
  const img = g.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
export const TEX = {
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
export function paintSky(g, W, H, k) { // k: {day, gold, night} weights
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
export const KEYS = [ // hour: [day, gold, night]
  [0, [0, 0, 1]], [5.2, [0, 0, 1]], [6.3, [0.1, 0.9, 0]], [7.8, [1, 0, 0]], [16.3, [1, 0, 0]], [17.8, [0.1, 0.9, 0]], [19.0, [0, 0.25, 0.75]], [19.8, [0, 0, 1]], [24, [0, 0, 1]],
];
export function beirutHour() {
  const forced = new URLSearchParams(location.search).get('hour'); if (forced) return +forced; // ?hour=14 to preview other times
  try { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Beirut', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()); return +p.find((x) => x.type === 'hour').value + +p.find((x) => x.type === 'minute').value / 60; }
  catch { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
}
export function phaseAt(h) {
  for (let i = 0; i < KEYS.length - 1; i++) { const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1]; if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0 || 1); const v = a.map((x, j) => x + (b[j] - x) * t); return { day: v[0], gold: v[1], night: v[2] }; } }
  return { day: 0, gold: 0, night: 1 };
}

