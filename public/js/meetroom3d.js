// The meeting room in 3D: an executive boardroom in Beirut where the agents sit around the table.
// Walnut slat walls, a big display, windows onto the sea and city lit by the real time of day,
// soft shadows and ambient occlusion. The speaking agent gets a soft spotlight and the camera leans in.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCharacter } from './characters.js';
import { canvasTex, rnd, noise, TEX, paintSky, phaseAt, beirutHour } from './office-kit.js';

const H = 3.4; // ceiling height
const TABLE_Z = -0.4;

function createRoom(container, { title = 'Meeting', client = '' } = {}) {
  const lowPower = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 4) <= 4;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = 'labels'; container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  const camBase = new THREE.Vector3(0, 2.6, 7.4);
  const lookBase = new THREE.Vector3(0, 1.05, -0.8);
  camera.position.copy(camBase);

  // ---------- materials ----------
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const emissives = [];
  const glow = (color, base = 1) => { const m = M('#0a0a0c', { emissive: color, emissiveIntensity: base }); m.userData.base = base; emissives.push(m); return m; };
  const walnutTex = TEX.walnut();
  const mat = {
    walnut: M('#ffffff', { map: walnutTex, roughness: 0.32 }),
    slat: M('#ffffff', { map: walnutTex, roughness: 0.5 }),
    oak: M('#ffffff', { map: TEX.oak(), roughness: 0.45 }),
    plaster: M('#ffffff', { map: TEX.plaster(), roughness: 0.95 }),
    ceiling: M('#f1eee9', { roughness: 0.95 }),
    blackMetal: M('#18191d', { roughness: 0.35, metalness: 0.8 }), steel: M('#c4c7cc', { roughness: 0.22, metalness: 1 }),
    leather: M('#2a1f1a', { roughness: 0.42 }), leatherCream: M('#d9cdb8', { roughness: 0.5 }),
    felt: M('#2b2233', { roughness: 1 }), marble: M('#ffffff', { map: TEX.marble(), roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#e6f2ff', transparent: true, opacity: 0.1, roughness: 0.03, envMapIntensity: 1.2, depthWrite: false }),
    water: new THREE.MeshPhysicalMaterial({ color: '#dff3ff', transparent: true, opacity: 0.35, roughness: 0.05 }),
    ceramic: M('#ffffff', { roughness: 0.2 }), paper: M('#f5f3ee', { roughness: 0.9 }), leaf: M('#2f6b3c', { roughness: 0.75, side: THREE.DoubleSide }), leaf2: M('#41804a', { roughness: 0.75, side: THREE.DoubleSide }),
    pot: M('#d9d3c8', { roughness: 0.7 }), soil: M('#3b2b20', { roughness: 1 }), book: [M('#8a2d2d'), M('#2d4a8a'), M('#d8b46a'), M('#3c6b4a'), M('#e9e3d6')],
  };
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const box = (w, h, d, m, x, y, z, parent = scene, r = 0) => add(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const cyl = (rt, rb, h, m, x, y, z, parent = scene, seg = 24) => add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, parent);

  // ---------- light (follows Beirut's time of day through the windows) ----------
  const hemi = new THREE.HemisphereLight('#d6ecff', '#5a4a3a', 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e0', 2); sun.position.set(-6, 9, -14); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const downs = [];
  for (const x of [-2.4, 0, 2.4]) { const l = new THREE.SpotLight('#ffe6c4', 0, 9, 0.75, 0.75, 1.6); l.position.set(x, H - 0.05, TABLE_Z); l.target.position.set(x, 0.7, TABLE_Z); l.castShadow = x === 0; if (l.castShadow) { l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0004; } scene.add(l, l.target); downs.push(l); }
  const fill = new THREE.PointLight('#ffd9b0', 0, 14, 1.8); fill.position.set(0, 2.6, 4); scene.add(fill);
  const speakerLight = new THREE.SpotLight('#fff1c8', 0, 9, 0.3, 0.8, 1.4); speakerLight.position.set(0, H - 0.1, 1.5); scene.add(speakerLight, speakerLight.target);

  // ---------- the room ----------
  // floor: oak with a large wool rug
  { const f = add(new THREE.PlaneGeometry(16, 16), mat.oak, 0, 0, 0); f.rotation.x = -Math.PI / 2; f.castShadow = false; mat.oak.map.repeat.set(3, 3);
    const rugTex = canvasTex(256, (g, s) => { g.fillStyle = '#3a3340'; g.fillRect(0, 0, s, s); noise(g, s, 16); g.strokeStyle = 'rgba(216,180,106,.6)'; g.lineWidth = 3; g.strokeRect(12, 12, s - 24, s - 24); });
    const rug = add(new RoundedBoxGeometry(10, 0.02, 6, 1, 0.01), M('#fff', { map: rugTex, roughness: 1 }), 0, 0.011, TABLE_Z); rug.castShadow = false; }
  // ceiling with a cove light and recessed downlights
  { const c = add(new THREE.PlaneGeometry(16, 16), mat.ceiling, 0, H, 0); c.rotation.x = Math.PI / 2; c.castShadow = false;
    const panel = add(new THREE.BoxGeometry(9.5, 0.12, 4.8), mat.ceiling, 0, H - 0.06, TABLE_Z); panel.castShadow = false;
    for (const [w, d, x, z] of [[9.5, 0.04, 0, TABLE_Z - 2.42], [9.5, 0.04, 0, TABLE_Z + 2.42], [0.04, 4.8, -4.77, TABLE_Z], [0.04, 4.8, 4.77, TABLE_Z]]) { const s = add(new THREE.BoxGeometry(w, 0.03, d), glow('#ffd9a8', 1.6), x, H - 0.13, z); s.castShadow = false; }
    for (const x of [-2.4, 0, 2.4]) { const d = add(new THREE.CircleGeometry(0.09, 20), glow('#fff4e0', 2.2), x, H - 0.125, TABLE_Z); d.rotation.x = Math.PI / 2; } }
  // back wall: walnut centre panel with the display, floor-to-ceiling windows on both sides
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 2048; skyCanvas.height = 640;
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(70, 22), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false })); sky.position.set(0, 4, -24); scene.add(sky);
  { const bz = -6.6;
    box(6.8, H, 0.2, mat.slat, 0, H / 2, bz - 0.05);
    for (let x = -3.3; x <= 3.31; x += 0.12) box(0.05, H, 0.05, mat.slat, x, H / 2, bz + 0.08);
    for (const side of [-1, 1]) {
      const cx = side * 5.45;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(4.1, H), mat.glass); g.position.set(cx, H / 2, bz); scene.add(g);
      for (const dx of [-2.05, -0.7, 0.7, 2.05]) box(0.06, H, 0.1, mat.blackMetal, cx + dx, H / 2, bz);
      box(4.1, 0.08, 0.12, mat.blackMetal, cx, 0.04, bz); box(4.1, 0.08, 0.12, mat.blackMetal, cx, H - 0.04, bz);
      // sheer curtain gathered at the outer edge
      const cur = add(new THREE.PlaneGeometry(0.9, H - 0.1, 12, 1), M('#efe9e0', { roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), side * 7.15, H / 2, bz + 0.25);
      const p = cur.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.06); cur.geometry.computeVertexNormals();
    }
    // the display
    box(5.0, 2.86, 0.08, mat.blackMetal, 0, 1.95, bz + 0.16, scene, 0.02);
    const screenTex = canvasTex(1024, (g, s) => {
      const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#1c0c2b'); gr.addColorStop(1, '#3d1d5c'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(251,212,4,.18)'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(-40, 160 + i * 110); g.bezierCurveTo(300, 80 + i * 110, 700, 260 + i * 110, s + 40, 140 + i * 110); g.stroke(); }
      g.fillStyle = '#fbd404'; g.beginPath(); g.arc(s / 2, 330, 64, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2c123f'; g.font = 'bold 80px "Readex Pro", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', s / 2, 336);
      g.fillStyle = '#fbd404'; g.font = 'bold 84px "Readex Pro", Arial'; g.fillText('مكافأة', s / 2, 490);
      g.fillStyle = '#f6f1fb'; g.font = '600 46px "Readex Pro", Arial'; g.fillText(title.slice(0, 36), s / 2, 610);
      if (client) { g.fillStyle = 'rgba(246,241,251,.7)'; g.font = '34px "Readex Pro", Arial'; g.fillText(client.slice(0, 40), s / 2, 676); }
    });
    screenTex.repeat.set(1, 0.56); screenTex.offset.set(0, 0.2);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 2.76), new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.9, roughness: 0.25 }));
    scr.material.userData.base = 0.9; emissives.push(scr.material); scr.position.set(0, 1.95, bz + 0.205); scene.add(scr);
    box(3.6, 0.5, 0.45, mat.walnut, 0, 0.25, bz + 0.35, scene, 0.03);
  }
  // left wall: walnut acoustic slats with a soft wall-wash
  { const lx = -7.5; box(0.2, H, 14, mat.felt, lx - 0.1, H / 2, 0.5);
    for (let z = -6.4; z <= 7.4; z += 0.14) box(0.05, H - 0.2, 0.06, mat.slat, lx + 0.03, H / 2, z);
    const wash = add(new THREE.BoxGeometry(0.03, 0.03, 13.5), glow('#ffcf93', 1.4), lx + 0.12, H - 0.08, 0.5); wash.castShadow = false;
    plant(-6.6, -5.6, 1.4, 2); }
  // right wall: plaster, art, a credenza with books and a plant
  { const rx = 7.5; box(0.2, H, 14, mat.plaster, rx + 0.1, H / 2, 0.5);
    const artTex = canvasTex(512, (g, s) => { g.fillStyle = '#efe8dc'; g.fillRect(0, 0, s, s); const cols = ['#c9a27a', '#4b2370', '#d8b46a', '#2f4a5c', '#a8644a']; for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.8; g.beginPath(); g.arc(rnd(40, s - 40), rnd(40, s - 40), rnd(40, 150), 0, 7); g.fill(); } g.globalAlpha = 1; g.strokeStyle = '#1b1b1f'; g.lineWidth = 7; g.beginPath(); g.moveTo(40, s * 0.7); g.bezierCurveTo(s * 0.3, s * 0.2, s * 0.7, s * 0.9, s - 40, s * 0.3); g.stroke(); });
    const fr = new THREE.Group(); fr.position.set(rx - 0.03, 2.0, -1.2); fr.rotation.y = -Math.PI / 2; scene.add(fr);
    box(2.5, 1.7, 0.05, mat.blackMetal, 0, 0, 0, fr); add(new THREE.PlaneGeometry(2.36, 1.56), M('#fff', { map: artTex, roughness: 0.8 }), 0, 0, 0.03, fr);
    const cr = new THREE.Group(); cr.position.set(rx - 0.3, 0, -1.2); cr.rotation.y = -Math.PI / 2; scene.add(cr);
    box(3.2, 0.7, 0.48, mat.walnut, 0, 0.38, 0, cr, 0.02); for (const x of [-1.5, 1.5]) box(0.04, 0.04, 0.4, mat.steel, x, 0.02, 0, cr);
    let bx = -1.3; while (bx < -0.3) { const bw = rnd(0.04, 0.08), bh = rnd(0.24, 0.34); box(bw, bh, 0.22, mat.book[Math.floor(Math.random() * 5)], bx, 0.73 + bh / 2, 0, cr); bx += bw + 0.01; }
    cyl(0.12, 0.1, 0.3, mat.ceramic, 0.4, 0.88, 0, cr, 16); box(0.5, 0.04, 0.34, mat.marble, 1.05, 0.75, 0, cr);
    plant(6.6, 4.6, 1.3, 0); plant(6.6, -5.6, 1.1, 1); }

  function plant(x, z, s = 1, kind = 0) {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.rotation.y = rnd(0, 6); scene.add(p);
    cyl(0.26 * s, 0.2 * s, 0.5 * s, mat.pot, 0, 0.25 * s, 0, p, 18); cyl(0.24 * s, 0.24 * s, 0.02, mat.soil, 0, 0.49 * s, 0, p, 18);
    const leafGeo = new THREE.SphereGeometry(0.5, 8, 6); leafGeo.scale(0.35, 0.05, 1); leafGeo.translate(0, 0, 0.5);
    const n = kind === 2 ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const leaf = new THREE.Mesh(leafGeo, i % 2 ? mat.leaf : mat.leaf2);
      if (kind === 2) { leaf.scale.set(0.5 * s, 1, 1.4 * s); leaf.position.set(0, 0.5 * s, 0); leaf.rotation.set(-Math.PI / 2 + rnd(0.05, 0.35), (i / n) * Math.PI * 2, 0); }
      else { const h = rnd(0.7, 1.5) * s; leaf.scale.set(s, 1, s * rnd(0.6, 0.9)); leaf.position.set(0, h, 0); leaf.rotation.set(rnd(-0.9, -0.2), (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), 0); }
      leaf.castShadow = true; p.add(leaf);
    }
  }

  // ---------- the table: walnut with a marble inlay, black pedestal base ----------
  { const top = cyl(1, 1, 0.07, mat.walnut, 0, 0.76, TABLE_Z, scene, 96); top.scale.set(3.1, 1, 1.35);
    const inlay = cyl(1, 1, 0.005, mat.marble, 0, 0.797, TABLE_Z, scene, 96); inlay.scale.set(1.6, 1, 0.42);
    for (const x of [-1.6, 1.6]) { box(0.9, 0.7, 0.5, mat.blackMetal, x, 0.36, TABLE_Z, scene, 0.04); }
    box(0.36, 0.01, 0.16, mat.blackMetal, 0, 0.8, TABLE_Z + 0.75); box(0.36, 0.01, 0.16, mat.blackMetal, 0, 0.8, TABLE_Z - 0.75);
    // a water carafe in the middle
    cyl(0.07, 0.09, 0.28, mat.water, 0.25, 0.94, TABLE_Z, scene, 20); }
  const tableProps = new THREE.Group(); scene.add(tableProps);

  // ---------- seats & agents ----------
  function makeChair(x, z, yaw) {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = yaw; scene.add(c);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = box(0.05, 0.04, 0.34, mat.steel, Math.sin(a) * 0.17, 0.06, Math.cos(a) * 0.17, c); leg.rotation.y = a; cyl(0.03, 0.03, 0.04, mat.blackMetal, Math.sin(a) * 0.33, 0.03, Math.cos(a) * 0.33, c, 8); }
    cyl(0.03, 0.03, 0.34, mat.steel, 0, 0.25, 0, c, 10);
    box(0.56, 0.1, 0.54, mat.leather, 0, 0.46, 0, c, 0.04);
    box(0.54, 0.8, 0.08, mat.leather, 0, 0.92, -0.28, c, 0.04);
    for (const sx of [-0.29, 0.29]) { box(0.04, 0.2, 0.04, mat.steel, sx, 0.6, -0.02, c); box(0.06, 0.03, 0.3, mat.leather, sx, 0.71, -0.02, c, 0.01); }
    return c;
  }
  function seatsFor(n) { // around the back and sides of the table, leaving the front open toward the camera (you)
    const out = []; const a0 = Math.PI * (n > 5 ? 1.0 : 1.12), a1 = Math.PI * (n > 5 ? 2.0 : 1.88);
    for (let i = 0; i < n; i++) { const a = n === 1 ? Math.PI * 1.5 : a0 + (a1 - a0) * (i / (n - 1)); out.push({ x: Math.cos(a) * 3.85, z: TABLE_Z + Math.sin(a) * 2.05 }); }
    return out;
  }
  const shadowTex = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(0,0,0,.4)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, [1, 1], false);
  let people = [];
  function setAgents(list) {
    for (const p of people) { scene.remove(p.root); scene.remove(p.chair); }
    tableProps.clear();
    people = [];
    const seats = seatsFor(list.length);
    list.forEach((a, i) => {
      const s = seats[i];
      const yaw = Math.atan2(0 - s.x, TABLE_Z - s.z);
      const chair = makeChair(s.x, s.z, yaw);
      // a notebook / laptop and a glass of water in front of each seat
      const fx = s.x + Math.sin(yaw) * 0.75, fz = s.z + Math.cos(yaw) * 0.75;
      if (i % 2) { const lp = new THREE.Group(); lp.position.set(fx, 0.8, fz); lp.rotation.y = yaw; tableProps.add(lp); box(0.34, 0.015, 0.24, mat.steel, 0, 0, 0, lp, 0.005); const scr = box(0.34, 0.22, 0.01, mat.steel, 0, 0.11, -0.12, lp, 0.005); scr.rotation.x = -0.25; }
      else { const nb = box(0.21, 0.012, 0.29, mat.paper, fx, 0.806, fz, tableProps); nb.rotation.y = yaw + rnd(-0.2, 0.2); }
      cyl(0.035, 0.03, 0.11, mat.water, fx + Math.cos(yaw) * 0.28, 0.855, fz - Math.sin(yaw) * 0.28, tableProps, 14);
      const ch = makeCharacter(a.look || { skin: '#e0ae88', hair: 'short', hairColor: '#2a1d14', top: { type: 'tee', color: a.color }, bottom: { color: '#2e3440' } });
      ch.root.traverse((n) => { if (n.isMesh) n.castShadow = true; });
      ch.root.position.set(s.x, 0, s.z); ch.root.rotation.y = yaw;
      ch.setState('sit');
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; ch.root.add(blob);
      const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<i style="--c:${a.color || '#fbd404'}"></i><b>${a.name}</b><span>${a.role}</span>`;
      const label = new CSS2DObject(el); label.position.set(0, 1.78 * (a.look?.height || 1), 0); label.center.set(0.5, 1); ch.root.add(label);
      scene.add(ch.root);
      people.push({ id: a.id, ch, root: ch.root, chair, el, seat: s });
    });
  }

  // ---------- time of day ----------
  let bloom = null;
  function applyTime() {
    const k = phaseAt(beirutHour());
    paintSky(skyCanvas.getContext('2d'), skyCanvas.width, skyCanvas.height, k); skyTex.needsUpdate = true;
    const C = (d, g, n) => new THREE.Color(d).multiplyScalar(k.day).add(new THREE.Color(g).multiplyScalar(k.gold)).add(new THREE.Color(n).multiplyScalar(k.night));
    sun.color = C('#fff3e0', '#ffae66', '#8fa6ff'); sun.intensity = 2.4 * k.day + 2.2 * k.gold + 0.2 * k.night;
    sun.position.set(-6 + 10 * k.gold, 10 - 5 * k.gold, -14);
    hemi.color = C('#d6ecff', '#ffd2b0', '#4a5a90'); hemi.groundColor = C('#8c7b66', '#5a4048', '#1a1426'); hemi.intensity = 0.7 * k.day + 0.5 * k.gold + 0.25 * k.night;
    renderer.toneMappingExposure = 0.95;
    const bg = C('#cfe1f0', '#e8b08a', '#0b0f22'); scene.background = bg;
    for (const l of downs) l.intensity = 9 * k.day + 16 * k.gold + 22 * k.night;
    fill.intensity = 3 * k.day + 6 * k.gold + 9 * k.night;
    for (const m of emissives) m.emissiveIntensity = m.userData.base * (0.7 + 0.5 * k.night + 0.3 * k.gold);
    if (bloom) bloom.strength = 0.1 + 0.2 * k.night;
  }

  // ---------- post-processing ----------
  let composer = null, aoPass = null;
  (async () => {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      const c = new EffectComposer(renderer);
      c.addPass(new RenderPass(scene, camera));
      if (!lowPower) {
        try { const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js'); aoPass = new GTAOPass(scene, camera, container.clientWidth || 800, container.clientHeight || 600); aoPass.blendIntensity = 0.85; aoPass.updateGtaoMaterial?.({ radius: 0.35, distanceExponent: 1.5, thickness: 0.8, scale: 1, samples: 12 }); c.addPass(aoPass); } catch (e) { console.warn('[room] no AO', e); }
      }
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.5, 0.95); c.addPass(bloom);
      c.addPass(new OutputPass());
      composer = c; resize(); applyTime();
    } catch (e) { console.warn('[room] post-processing off', e); }
  })();

  // ---------- loop ----------
  let inset = 0; // px covered by the side panel: keep the table centred in what's visible
  let speakingId = null; const clock = new THREE.Clock();
  const lookAt = lookBase.clone(); const tmp = new THREE.Vector3();
  let acc = 0, frames = 0, slow = 0;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    acc += dt; frames++; if (acc > 2) { if (aoPass && acc / frames > 0.03 && ++slow >= 2) { aoPass.enabled = false; aoPass = null; } acc = 0; frames = 0; }
    for (const p of people) p.ch.update(dt);
    // camera: gentle drift, leaning toward whoever is speaking
    const sp = people.find((p) => p.id === speakingId);
    const wantLook = sp ? tmp.set(sp.seat.x * 0.45, 1.15, TABLE_Z + (sp.seat.z - TABLE_Z) * 0.45) : lookBase;
    lookAt.lerp(wantLook, 0.04);
    camera.position.set(camBase.x + Math.sin(t * 0.12) * 0.3 + (sp ? sp.seat.x * 0.08 : 0), camBase.y + Math.sin(t * 0.17) * 0.05, camBase.z - (sp ? 0.5 : 0));
    camera.lookAt(lookAt);
    speakerLight.intensity += ((sp ? 30 : 0) - speakerLight.intensity) * 0.08;
    if (sp) { speakerLight.target.position.set(sp.seat.x, 1.2, sp.seat.z); speakerLight.position.set(sp.seat.x * 0.7, H - 0.1, sp.seat.z + 1.6); }
    if (composer) composer.render(); else renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  renderer.setAnimationLoop(tick);
  const resize = () => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; renderer.setSize(w, h); labels.setSize(w, h); composer?.setSize(w, h); aoPass?.setSize?.(w, h); camera.aspect = w / h; const ar = w / h;
    camera.fov = ar < 1 ? 62 : ar < 1.4 ? 50 : 42;
    if (ar < 1) camBase.set(0, 3.1, 10.8); else if (ar < 1.4) camBase.set(0, 2.8, 8.6); else camBase.set(0, 2.7, 8.3); // pull back on tall screens so everyone fits
    if (inset && w > 960) camera.setViewOffset(w + inset, h, inset, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(container); resize();
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : tick));
  applyTime(); setInterval(applyTime, 5 * 60e3);

  return {
    setAgents,
    setInset(px) { inset = px; resize(); },
    speaking(id, on) {
      const p = people.find((x) => x.id === id); if (!p) return;
      p.ch.talking = on; p.el.classList.toggle('speaking', on);
      if (on) speakingId = id; else if (speakingId === id) speakingId = null;
    },
    thinking(id, on) { const p = people.find((x) => x.id === id); if (p) p.el.classList.toggle('thinking', on); },
  };
}

window.MeetRoom = { createRoom };
window.dispatchEvent(new Event('meetroom-ready'));
