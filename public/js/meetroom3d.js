// The meeting room in 3D: a Mukafaah-branded boardroom where the agents sit around the table.
// The speaking agent gets a spotlight and the camera leans toward them.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeCharacter } from './characters.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function createRoom(container, { title = 'Meeting', client = '' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = 'labels'; container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0716');
  scene.fog = new THREE.Fog('#0d0716', 14, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 3.0, 7.6);
  const lookBase = new THREE.Vector3(0, 1.0, -0.6);
  camera.position.copy(camBase);

  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  const add = (geo, mat, pos, rot = [0, 0, 0], scale = [1, 1, 1], shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };

  // ---- lights: soft purple ambience, warm key over the table, violet rim
  scene.add(new THREE.HemisphereLight('#c9b6ff', '#1a0d26', 0.55));
  const key = new THREE.SpotLight('#ffe7b8', 60, 18, 0.75, 0.6, 1.6);
  key.position.set(0, 7, 2); key.target.position.set(0, 0.8, -0.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#8a5cf6', 1.4); rim.position.set(-6, 5, -6); scene.add(rim);
  const speakerLight = new THREE.SpotLight('#fbd404', 0, 9, 0.32, 0.7, 1.4);
  speakerLight.position.set(0, 5.5, 1.5); scene.add(speakerLight, speakerLight.target);

  // ---- floor, carpet
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 16; i++) { const s = 26 + Math.random() * 8; g.fillStyle = `rgb(${s + 22},${s + 10},${s + 18})`; g.fillRect(0, i * 32, w, 32); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, i * 32, w, 1); g.fillRect(Math.random() * w, i * 32, 1, 32); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(4, 4);
  add(new THREE.PlaneGeometry(30, 30), M('#ffffff', { map: floorTex, roughness: 0.5 }), [0, 0, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], false);
  add(new THREE.CircleGeometry(1, 64), M('#2c123f', { roughness: 0.95 }), [0, 0.005, -0.4], [-Math.PI / 2, 0, 0], [5.4, 3.4, 1], false);

  // ---- back wall: Beirut night window + side panels with gold light strips
  const sky = canvasTex(2048, 640, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b0620'); gr.addColorStop(0.7, '#2a1440'); gr.addColorStop(1, '#4b2370'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 120; i++) g.fillRect(Math.random() * w, Math.random() * h * 0.45, 1.5, 1.5);
    for (let x = 0; x < w;) { const bw = 40 + Math.random() * 100, bh = 140 + Math.random() * 360; g.fillStyle = '#120a1e'; g.fillRect(x, h - bh, bw, bh); for (let wy = h - bh + 10; wy < h - 6; wy += 14) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (Math.random() < 0.33) { g.fillStyle = Math.random() < 0.75 ? '#fbd404' : '#c9b6ff'; g.globalAlpha = 0.55 + Math.random() * 0.45; g.fillRect(wx, wy, 5, 7); g.globalAlpha = 1; } x += bw + 3; }
  });
  add(new THREE.PlaneGeometry(16, 5), new THREE.MeshBasicMaterial({ map: sky, fog: false }), [0, 2.9, -6.6], [0, 0, 0], [1, 1, 1], false);
  const frame = M('#1a0f26', { metalness: 0.6, roughness: 0.35 });
  for (let x = -8; x <= 8; x += 2) add(new THREE.BoxGeometry(0.08, 5.2, 0.12), frame, [x, 2.9, -6.5], [0, 0, 0], [1, 1, 1], false);
  add(new THREE.BoxGeometry(16.2, 0.12, 0.14), frame, [0, 0.35, -6.5], [0, 0, 0], [1, 1, 1], false);
  add(new THREE.BoxGeometry(16.2, 0.12, 0.14), frame, [0, 5.45, -6.5], [0, 0, 0], [1, 1, 1], false);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.2, 6, 14), M('#1c0f2b', { roughness: 0.8 }), [8 * s, 3, -0.5], [0, 0, 0], [1, 1, 1], false);
    for (let z = -5; z <= 3; z += 2.6) add(new THREE.BoxGeometry(0.04, 4.6, 0.06), new THREE.MeshStandardMaterial({ color: '#fbd404', emissive: '#fbd404', emissiveIntensity: 1.6 }), [7.88 * s, 2.8, z], [0, 0, 0], [1, 1, 1], false);
  }

  // ---- big screen with Mukafaah branding and the meeting title
  const screenTex = canvasTex(1600, 800, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2c123f'); gr.addColorStop(1, '#4b2370'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(251,212,4,.35)'; g.lineWidth = 6; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-50, 140 + i * 150); g.bezierCurveTo(400, 60 + i * 150, 1100, 260 + i * 150, w + 50, 120 + i * 150); g.stroke(); }
    g.fillStyle = '#fbd404'; g.beginPath(); g.arc(w / 2, 250, 88, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2c123f'; g.font = 'bold 110px "Readex Pro", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', w / 2, 256);
    g.fillStyle = '#fbd404'; g.font = 'bold 120px "Readex Pro", Arial'; g.fillText('مكافأة', w / 2, 450);
    g.fillStyle = '#f6f1fb'; g.font = '600 54px "Readex Pro", Arial'; g.fillText(title.slice(0, 40), w / 2, 590);
    if (client) { g.fillStyle = 'rgba(246,241,251,.7)'; g.font = '40px "Readex Pro", Arial'; g.fillText(client.slice(0, 40), w / 2, 670); }
  });
  add(new THREE.BoxGeometry(5.4, 2.9, 0.12), M('#0b0512', { metalness: 0.5, roughness: 0.3 }), [0, 3.15, -6.25], [0, 0, 0], [1, 1, 1], false);
  add(new THREE.PlaneGeometry(5.2, 2.7), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), [0, 3.15, -6.18], [0, 0, 0], [1, 1, 1], false);

  // ---- table: walnut top with a gold edge
  const walnut = M('#3b2417', { roughness: 0.35, metalness: 0.05 });
  add(new THREE.CylinderGeometry(1, 1, 0.09, 96), walnut, [0, 0.76, -0.4], [0, 0, 0], [3.1, 1, 1.35]);
  const edge = add(new THREE.TorusGeometry(1, 0.025, 8, 128), M('#fbd404', { metalness: 1, roughness: 0.25 }), [0, 0.76, -0.4], [Math.PI / 2, 0, 0], [3.1, 1.35, 1]);
  edge.castShadow = false;
  add(new THREE.CylinderGeometry(0.35, 0.6, 0.72, 32), M('#1a0f26', { metalness: 0.6, roughness: 0.3 }), [0, 0.36, -0.4], [0, 0, 0], [2.6, 1, 0.9]);
  // a couple of details on the table
  for (const x of [-1.6, 0.4, 1.9]) add(new THREE.CylinderGeometry(0.05, 0.045, 0.12, 16), M('#f6f1fb', { roughness: 0.2 }), [x, 0.87, -0.1 + Math.random() * -0.5]);
  add(new THREE.BoxGeometry(0.5, 0.02, 0.34), M('#c9c9d1', { metalness: 0.8, roughness: 0.3 }), [-0.8, 0.82, -0.9]);

  // ---- gold dust floating in the air
  const dustGeo = new THREE.BufferGeometry(); const N = 220; const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 14; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 10; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#fbd404', size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(dust);

  // ---- seats & agents
  const fabric = M('#2c123f', { roughness: 0.9 });
  const chairMetal = M('#120a1c', { metalness: 0.7, roughness: 0.3 });
  let people = []; // { id, ch, root, label, seat }
  function makeChair(x, z, yaw) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.58), fabric); seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.09), fabric); back.position.set(0, 0.86, -0.3);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 12), chairMetal); post.position.y = 0.21;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.04, 20), chairMetal); base.position.y = 0.02;
    [seat, back, post, base].forEach((m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g); return g;
  }
  function seatsFor(n) {
    // around the back and sides of the table, leaving the front open toward the camera (you)
    const out = []; const a0 = Math.PI * (n > 5 ? 1.0 : 1.12), a1 = Math.PI * (n > 5 ? 2.0 : 1.88);
    for (let i = 0; i < n; i++) { const a = n === 1 ? Math.PI * 1.5 : a0 + (a1 - a0) * (i / (n - 1)); out.push({ x: Math.cos(a) * 3.85, z: -0.4 + Math.sin(a) * 2.05 }); }
    return out;
  }
  function setAgents(list) {
    for (const p of people) { scene.remove(p.root); scene.remove(p.chair); }
    people = [];
    const seats = seatsFor(list.length);
    list.forEach((a, i) => {
      const s = seats[i];
      const yaw = Math.atan2(0 - s.x, -0.4 - s.z); // face the table centre
      const chair = makeChair(s.x, s.z, yaw);
      const ch = makeCharacter(a.look || { skin: '#e0ae88', hair: 'short', hairColor: '#2a1d14', top: { type: 'tee', color: a.color }, bottom: { color: '#2e3440' } });
      ch.root.traverse((n) => { if (n.isMesh) n.castShadow = true; });
      ch.root.position.set(s.x, 0, s.z); ch.root.rotation.y = yaw;
      ch.setState('sit');
      const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${a.name}</b><span>${a.role}</span>`;
      const label = new CSS2DObject(el); label.position.set(0, 1.78 * (a.look?.height || 1), 0); label.center.set(0.5, 1); ch.root.add(label);
      scene.add(ch.root);
      people.push({ id: a.id, ch, root: ch.root, chair, el, seat: s });
    });
  }

  // ---- loop
  let speakingId = null; const clock = new THREE.Clock();
  const lookAt = lookBase.clone(); const tmp = new THREE.Vector3();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    for (const p of people) p.ch.update(dt);
    const pa = dust.geometry.attributes.position;
    for (let i = 0; i < N; i++) { let y = pa.getY(i) + dt * 0.08; if (y > 5) y = 0; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.02); }
    pa.needsUpdate = true;
    // camera: gentle drift, leaning toward whoever is speaking
    const sp = people.find((p) => p.id === speakingId);
    const wantLook = sp ? tmp.set(sp.seat.x * 0.45, 1.15, -0.4 + (sp.seat.z + 0.4) * 0.45) : lookBase;
    lookAt.lerp(wantLook, 0.04);
    camera.position.set(camBase.x + Math.sin(t * 0.12) * 0.35 + (sp ? sp.seat.x * 0.08 : 0), camBase.y + Math.sin(t * 0.17) * 0.06, camBase.z - (sp ? 0.5 : 0));
    camera.lookAt(lookAt);
    speakerLight.intensity += ((sp ? 45 : 0) - speakerLight.intensity) * 0.08;
    if (sp) { speakerLight.target.position.set(sp.seat.x, 1.2, sp.seat.z); speakerLight.position.set(sp.seat.x * 0.6, 5.5, sp.seat.z + 2.5); }
    renderer.render(scene, camera); labels.render(scene, camera);
  }
  renderer.setAnimationLoop(tick);
  const resize = () => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; const ar = w / h;
    camera.fov = ar < 1 ? 60 : ar < 1.4 ? 50 : 42;
    if (ar < 1) camBase.set(0, 4.6, 11.5); else if (ar < 1.4) camBase.set(0, 3.4, 8.8); else camBase.set(0, 3.0, 7.6); // pull back on tall screens so everyone fits
    camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(container); resize();
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : tick));

  return {
    setAgents,
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
