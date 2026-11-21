// The 3D office: boardroom, desks, coffee bar, cafeteria, game room, gym, rooftop-style pool.
// Characters are original stylized 3D people (see characters.js) that walk between rooms.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeCharacter } from './characters.js';

const HALL_Z = 2.5;
const SWIM_Y = -1.25;

function init(container, { onAgentClick } = {}) {
  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0716');
  scene.fog = new THREE.Fog('#0d0716', 45, 90);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 24, 27);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 1);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.32;
  controls.minDistance = 6;
  controls.maxDistance = 55;

  // ---------- light ----------
  scene.add(new THREE.HemisphereLight('#d9c9ff', '#22122e', 0.6));
  const sun = new THREE.DirectionalLight('#ffe2b8', 1.6);
  sun.position.set(-14, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const warm = (x, z, c = '#ffcf8a', i = 10) => { const l = new THREE.PointLight(c, i, 14, 1.6); l.position.set(x, 3.2, z); scene.add(l); };
  warm(0, -8); warm(-14, 0, '#cfe3ff', 8); warm(14, -7); warm(14, 5, '#ffb38a'); warm(-14, 11, '#cfe3ff', 8); warm(2, 11, '#8fd3ff', 9); warm(7, -1);

  // ---------- materials ----------
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 32) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

  // wood floor texture (drawn, no download)
  const fc = document.createElement('canvas'); fc.width = fc.height = 512;
  const g = fc.getContext('2d');
  for (let i = 0; i < 16; i++) { const s = 34 + Math.random() * 10; g.fillStyle = `rgb(${s + 30},${s + 18},${s + 6})`; g.fillRect(0, i * 32, 512, 32); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * 32, 512, 1); const off = Math.random() * 512; g.fillRect(off, i * 32, 1, 32); }
  const floorTex = new THREE.CanvasTexture(fc); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 5); floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 34), M('#ffffff', { map: floorTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // hallway runner
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.2), M('#2c123f', { roughness: 0.9 })); runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.01, HALL_Z); runner.receiveShadow = true; scene.add(runner);

  // Beirut night skyline through the north windows (drawn)
  const sc = document.createElement('canvas'); sc.width = 2048; sc.height = 512;
  const s = sc.getContext('2d');
  const sky = s.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#0b0620'); sky.addColorStop(1, '#4b2370'); s.fillStyle = sky; s.fillRect(0, 0, 2048, 512);
  s.fillStyle = '#c86b3c'; s.globalAlpha = 0.25; s.fillRect(0, 420, 2048, 92); s.globalAlpha = 1;
  for (let x = 0; x < 2048;) { const w = 40 + Math.random() * 90, h = 120 + Math.random() * 300; s.fillStyle = '#0e131c'; s.fillRect(x, 512 - h, w, h); for (let wy = 512 - h + 10; wy < 500; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 12) if (Math.random() < 0.35) { s.fillStyle = Math.random() < 0.8 ? '#f3c97a' : '#bfe3ff'; s.fillRect(wx, wy, 5, 7); } x += w + 4; }
  const skyTex = new THREE.CanvasTexture(sc); skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(90, 22), new THREE.MeshBasicMaterial({ map: skyTex, fog: false })); skyline.position.set(0, 7, -30); scene.add(skyline);
  // window frames on the north wall
  for (let x = -21; x <= 21; x += 3.5) box(0.12, 4, 0.12, M('#1b1f26', { metalness: 0.6 }), x, 2, -17);
  box(44, 0.15, 0.2, M('#1b1f26', { metalness: 0.6 }), 0, 4, -17);
  // side walls (low, so the camera sees in)
  box(0.25, 1.2, 34, M('#232830'), -22, 0.6, 0); box(0.25, 1.2, 34, M('#232830'), 22, 0.6, 0); box(44, 1.2, 0.25, M('#232830'), -12, 0.6, 17); box(17, 1.2, 0.25, M('#232830'), 13.5, 0.6, 17);

  const glass = new THREE.MeshPhysicalMaterial({ color: '#9fc7ff', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, transmission: 0 });
  const wood = M('#5a3d24', { roughness: 0.45 });
  const dark = M('#20242b', { roughness: 0.5, metalness: 0.3 });
  const fabric = M('#2d3440', { roughness: 0.95 });

  // ---------- zones ----------
  const Z = {};
  const ring = (cx, cz, rx, rz, n, start = 0, span = Math.PI * 2) => Array.from({ length: n }, (_, i) => { const a = start + (span * i) / n; return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz, look: { x: cx, z: cz } }; });

  // Boardroom (glass room)
  { const cx = 0, cz = -9;
    const top = cyl(1, 1, 0.08, wood, cx, 0.76, cz, 64); top.scale.set(4.4, 1, 1.7);
    box(5, 0.7, 0.6, dark, cx, 0.36, cz);
    for (const [x, z, w, d] of [[cx, cz - 4.6, 13, 0.08], [cx - 6.5, cz, 0.08, 9.2], [cx + 6.5, cz, 0.08, 9.2], [cx - 4, cz + 4.6, 5, 0.08], [cx + 4, cz + 4.6, 5, 0.08]]) { const p = box(w, 2.6, d, glass, x, 1.3, z); p.castShadow = false; }
    const chairs = ring(cx, cz, 5.4, 2.85, 14);
    chairs.forEach((c) => { const ch = new THREE.Group(); box(0.55, 0.08, 0.55, fabric, 0, 0.48, 0, ch); box(0.55, 0.6, 0.08, fabric, 0, 0.8, 0.26, ch); box(0.06, 0.45, 0.06, dark, 0, 0.23, 0, ch); ch.position.set(c.x, 0, c.z); ch.lookAt(cx, 0, cz); ch.rotateY(Math.PI); scene.add(ch); });
    // screen
    box(3.2, 1.8, 0.08, M('#111', { emissive: '#1d3b5c', emissiveIntensity: 0.6 }), cx, 1.9, cz - 4.45);
    Z.boardroom = { door: { x: 0, z: -4 }, spots: ring(cx, cz, 4.85, 2.35, 14) };
  }
  // Desks (open office)
  { const spots = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = -19 + c * 3.1, z = -6 + r * 3.2;
      box(1.7, 0.06, 0.85, wood, x, 0.75, z); box(0.06, 0.72, 0.7, dark, x - 0.8, 0.37, z); box(0.06, 0.72, 0.7, dark, x + 0.8, 0.37, z);
      box(0.75, 0.45, 0.04, M('#0c0f14', { emissive: '#2a5a8c', emissiveIntensity: 0.5 }), x, 1.05, z - 0.25);
      spots.push({ x, z: z + 0.75, look: { x, z: z - 2 } });
    }
    Z.desk = { door: { x: -9, z: HALL_Z }, spots };
  }
  // Coffee bar
  { box(3.4, 1.05, 0.8, M('#2e2a26'), 7, 0.52, -1.6); box(3.5, 0.05, 0.9, M('#d9d4cc', { roughness: 0.3 }), 7, 1.07, -1.6); box(0.5, 0.6, 0.4, M('#9a9a9a', { metalness: 0.8, roughness: 0.3 }), 6.2, 1.4, -1.7);
    Z.coffee = { door: { x: 7, z: HALL_Z }, spots: [0, 1, 2, 3].map((i) => ({ x: 5.8 + i * 0.8, z: -0.5, look: { x: 5.8 + i * 0.8, z: -2 } })) };
  }
  // Cafeteria
  { const spots = [];
    [[11.5, -9], [16.5, -9], [11.5, -5], [16.5, -5]].forEach(([x, z]) => { cyl(0.8, 0.8, 0.06, M('#e8e2d6', { roughness: 0.4 }), x, 0.75, z); cyl(0.07, 0.07, 0.72, dark, x, 0.37, z, 12); spots.push(...ring(x, z, 1.25, 1.25, 4, Math.PI / 4)); });
    Z.cafeteria = { door: { x: 11, z: -2.5 }, spots };
  }
  // Game room
  { box(2.74, 0.06, 1.52, M('#1f6f4a', { roughness: 0.5 }), 14, 0.76, 7); box(0.03, 0.15, 1.6, M('#eeeeee'), 14, 0.86, 7); box(2.4, 0.7, 0.6, dark, 14, 0.36, 7);
    box(3.2, 0.45, 1, fabric, 18.5, 0.25, 6); box(3.2, 0.7, 0.25, fabric, 18.5, 0.55, 6.5);
    box(1.6, 0.9, 0.05, M('#0c0f14', { emissive: '#5a2d8c', emissiveIntensity: 0.6 }), 18.5, 1.6, 9.9);
    Z.games = { door: { x: 11, z: HALL_Z }, spots: [{ x: 12.2, z: 7, look: { x: 14, z: 7 } }, { x: 15.8, z: 7, look: { x: 14, z: 7 } }, ...ring(18.5, 7.6, 1.6, 0.6, 6, 0, Math.PI)] };
  }
  // Gym
  { const spots = [];
    for (let i = 0; i < 4; i++) { const x = -19 + i * 2.3, z = 11; box(0.8, 0.18, 1.9, dark, x, 0.09, z); box(0.06, 1.2, 0.06, dark, x - 0.35, 0.7, z - 0.9); box(0.06, 1.2, 0.06, dark, x + 0.35, 0.7, z - 0.9); box(0.8, 0.12, 0.25, dark, x, 1.3, z - 0.9); spots.push({ x, z: z + 0.1, look: { x, z: z - 3 }, y: 0.18, anim: 'run' }); }
    box(2.4, 1.1, 0.4, dark, -11, 0.55, 14.8);
    for (let i = 0; i < 6; i++) cyl(0.09, 0.09, 0.35, M('#555', { metalness: 0.8 }), -12 + i * 0.4, 1.2, 14.8, 10).rotation.z = Math.PI / 2;
    spots.push(...[0, 1, 2, 3].map((i) => ({ x: -13 + i * 1.2, z: 13.6, look: { x: -13 + i * 1.2, z: 15 } })));
    Z.gym = { door: { x: -9, z: 8 }, spots };
  }
  // Pool
  const water = (() => {
    const cx = 3, cz = 11.5, w = 10, d = 5;
    for (const [x, z, bw, bd] of [[cx, cz - d / 2 - 0.25, w + 1, 0.5], [cx, cz + d / 2 + 0.25, w + 1, 0.5], [cx - w / 2 - 0.25, cz, 0.5, d], [cx + w / 2 + 0.25, cz, 0.5, d]]) box(bw, 0.25, bd, M('#e9e4da', { roughness: 0.4 }), x, 0.12, z);
    const geo = new THREE.PlaneGeometry(w, d, 60, 30);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#1b8ec7', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, clearcoat: 1, emissive: '#0a3a55', emissiveIntensity: 0.6 });
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.18, cz); m.receiveShadow = true; scene.add(m);
    for (let i = 0; i < 3; i++) { box(0.7, 0.12, 1.8, M('#f2efe8'), -1.8 + i * 1.1, 0.25, 15.4).rotation.x = -0.15; }
    Z.pool = { door: { x: 3, z: 7.8 }, spots: Array.from({ length: 8 }, (_, i) => ({ x: cx - 3.5 + (i % 4) * 2.3, z: cz - 1.2 + Math.floor(i / 4) * 2.4, look: { x: cx + 5, z: cz - 1.2 + Math.floor(i / 4) * 2.4 }, swim: true })) };
    return m;
  })();
  Z.home = { door: { x: 19, z: 16.5 }, spots: [{ x: 19, z: 18.5, look: { x: 19, z: 25 }, hide: true }] };

  // potted plants for warmth
  for (const [x, z] of [[-6.5, -3.5], [6.5, -3.5], [-21, -15], [21, -15], [9.5, 1], [-9.5, 6], [21, 15]]) { cyl(0.35, 0.28, 0.6, M('#3a332c'), x, 0.3, z, 16); const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), M('#2f5d3a', { roughness: 0.8, flatShading: true })); leaf.position.set(x, 1.1, z); leaf.castShadow = true; scene.add(leaf); }

  // ---------- characters ----------
  const agents = new Map();
  const clock = new THREE.Clock();

  function makeLabel(a) {
    const el = document.createElement('button');
    el.className = 'tag'; el.type = 'button';
    el.innerHTML = `<b>${a.name}</b><span>${a.role}</span>`;
    el.setAttribute('aria-label', `Talk to ${a.name}, ${a.role}`);
    el.addEventListener('click', () => onAgentClick?.(a.id));
    const o = new CSS2DObject(el); o.position.set(0, 2.12 * (a.look?.height || 1), 0);
    o.center.set(0.5, 1);
    return { o, el };
  }

  function makeBody(a) {
    const ch = makeCharacter(a.look || { skin: '#e0ae88', hair: 'short', hairColor: '#2a1d14', top: { type: 'tee', color: a.color }, bottom: { color: '#2e3440' } });
    ch.root.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; } });
    return ch;
  }

  function setAnim(ag, name) { ag.ch.setState(name); ag.anim = name; }

  function spotFor(ag, place) {
    const zone = Z[place] || Z.desk;
    const i = ag.index % zone.spots.length;
    const sp = zone.spots[i];
    const extra = Math.floor(ag.index / zone.spots.length); // spread if more people than spots
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
    if (ag.spot.zone !== place) { pts.push(fromDoor, { x: fromDoor.x, z: HALL_Z }, { x: toDoor.x, z: HALL_Z }, toDoor); }
    pts.push(target);
    ag.path = pts.map((p) => new THREE.Vector3(p.x, 0, p.z));
    if (Math.hypot(from.x - pts[0].x, from.z - pts[0].z) < 0.05) ag.path.shift();
    ag.spot = target;
    setAnim(ag, 'walk');
  }

  function addAgent(a, index) {
    const ch = makeBody(a); const root = ch.root;
    const label = makeLabel(a);
    root.add(label.o);
    scene.add(root);
    const ag = { ...a, index, ch, root, label, path: [], anim: 'idle', speaking: false, swimTime: Math.random() * 10 };
    ag.arrive = (sp) => {
      if (sp.hide) { ag.root.visible = false; ag.label.o.visible = false; }
      ag.swimming = !!sp.swim;
      if (sp.swim) ag.root.position.y = SWIM_Y;
      if (sp.y) ag.root.position.y = sp.y;
      if (sp.look) ag.root.rotation.y = Math.atan2(sp.look.x - ag.root.position.x, sp.look.z - ag.root.position.z);
      setAnim(ag, sp.anim === 'run' ? 'run' : sp.swim ? 'swim' : ag.thinking ? 'think' : 'idle');
    };
    agents.set(a.id, ag);
    walkTo(ag, a.place, true);
    return ag;
  }

  // ---------- loop ----------
  const tmp = new THREE.Vector3();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
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
      } else if (ag.swimming) { // slow laps
        ag.swimTime += dt;
        ag.root.position.x = ag.spot.x + Math.sin(ag.swimTime * 0.35) * 1.4;
        ag.root.rotation.y = Math.cos(ag.swimTime * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2;
        ag.root.position.y = SWIM_Y + Math.sin(ag.swimTime * 2) * 0.03;
      }
      ag.ch.talking = ag.speaking;
      ag.ch.update(dt);
    }
    // water ripples
    const pos = water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.6 + t * 1.8) * 0.025 + Math.cos(pos.getY(i) * 2.1 + t * 1.3) * 0.02);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
    // camera fly
    if (fly) { camera.position.lerp(fly.pos, 0.06); controls.target.lerp(fly.target, 0.08); if (camera.position.distanceTo(fly.pos) < 0.05) fly = null; }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  renderer.setAnimationLoop(tick);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); labels.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : tick));

  // ---------- camera presets ----------
  let fly = null;
  const views = {
    overview: { pos: [0, 24, 27], target: [0, 0, 1] },
    boardroom: { pos: [0, 7.5, 2], target: [0, 0.8, -9] },
    desk: { pos: [-14, 9, 9], target: [-14.5, 0.5, -1] },
    cafeteria: { pos: [13.5, 8, 2], target: [14, 0.5, -7] },
    games: { pos: [10, 6, 13], target: [15, 0.5, 7] },
    gym: { pos: [-15, 6, 19], target: [-15, 0.5, 11] },
    pool: { pos: [3, 7, 20], target: [3, 0, 11.5] },
    coffee: { pos: [7, 4.5, 4.5], target: [7, 1, -1] },
  };
  const flyTo = (name) => { const v = views[name] || views.overview; fly = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) }; };

  // ---------- public API ----------
  const api = {
    async load(team) {
      team.forEach((a, i) => addAgent(a, i));
    },
    update(team) { for (const a of team) { const ag = agents.get(a.id); if (ag && !ag.summoned && ag.place !== a.place) walkTo(ag, a.place); } },
    summon(id, ms = 180000) {
      const ag = agents.get(id); if (!ag) return;
      clearTimeout(ag.summonTimer);
      if (ag.place !== 'boardroom') { ag.prev = ag.place; walkTo(ag, 'boardroom'); }
      ag.summoned = true;
      ag.summonTimer = setTimeout(() => { ag.summoned = false; if (ag.prev) walkTo(ag, ag.prev); ag.prev = null; }, ms);
    },
    speaking(id, on) { const ag = agents.get(id); if (!ag) return; ag.speaking = on; ag.label.el.classList.toggle('speaking', on); },
    thinking(id, on) { const ag = agents.get(id); if (!ag) return; ag.label.el.classList.toggle('thinking', on); ag.thinking = on; if (!ag.path.length && !ag.swimming && ag.anim !== 'run') setAnim(ag, on ? 'think' : 'idle'); },
    view: flyTo,
  };
  return api;
}

window.World = { init };
window.dispatchEvent(new Event('world-ready'));
