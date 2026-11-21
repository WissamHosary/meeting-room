// Original stylized 3D characters (animated-movie style): big expressive eyes, real hair styles,
// outfits and props, with procedural walking, running, swimming, thinking, talking and blinking.
import * as THREE from 'three';

const SEG = 20;
const matCache = new Map();
function mat(color, kind = 'cloth', extra = {}) {
  const key = color + kind + JSON.stringify(extra);
  if (matCache.has(key)) return matCache.get(key);
  const base = {
    skin: { roughness: 0.52, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color('#ffd9c4'), sheenRoughness: 0.6 },
    cloth: { roughness: 0.82, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') },
    hair: { roughness: 0.42, metalness: 0.05, clearcoat: 0.25, clearcoatRoughness: 0.5 },
    shiny: { roughness: 0.25, metalness: 0.6 },
    gloss: { roughness: 0.15, metalness: 0, clearcoat: 1 },
    flat: { roughness: 0.9, metalness: 0 },
  }[kind];
  const m = new THREE.MeshPhysicalMaterial({ color, ...base, ...extra });
  matCache.set(key, m);
  return m;
}
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

function mesh(geo, material, parent, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const sphere = (r, ws = SEG, hs = Math.round(SEG * 0.7)) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, SEG);
// part of a sphere, open at the front (for hair, hijab, beards)
const shell = (r, open, thetaStart, thetaLen) => new THREE.SphereGeometry(r, 32, 18, Math.PI / 2 + open / 2, Math.PI * 2 - open, thetaStart, thetaLen);
const front = (r, thetaStart, thetaLen, width = Math.PI) => new THREE.SphereGeometry(r, 28, 14, Math.PI / 2 - width / 2, width, thetaStart, thetaLen);

export function makeCharacter(look) {
  const L = { height: 1, build: 1, brows: 'calm', eyes: '#4a3020', props: [], ...look };
  const skin = mat(L.skin, 'skin');
  const skinDark = mat(shade(L.skin, 0.9), 'skin');
  const hairM = mat(L.hairColor || '#222', 'hair');
  const topM = mat(L.top.color, 'cloth');
  const bottomM = mat(L.bottom.color, 'cloth');
  const shoeM = mat(L.shoes || '#222', 'gloss');
  const B = L.build;

  const root = new THREE.Group();
  const body = new THREE.Group(); body.scale.setScalar(L.height); root.add(body);
  const J = {}; // joints

  // ---------- legs ----------
  const hips = new THREE.Group(); hips.position.y = 0.8; body.add(hips); J.hips = hips;
  const skirt = L.bottom.type === 'skirt';
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.1 * side * B, 0, 0); hips.add(hip);
    mesh(capsule(0.078 * B, 0.28), skirt ? skin : bottomM, hip, [0, -0.2, 0]);
    const knee = new THREE.Group(); knee.position.y = -0.4; hip.add(knee);
    mesh(capsule(0.066 * B, 0.26), skirt ? mat('#3b2f2b', 'cloth') : bottomM, knee, [0, -0.17, 0]);
    const foot = new THREE.Group(); foot.position.y = -0.37; knee.add(foot);
    mesh(sphere(0.07), shoeM, foot, [0, -0.015, 0.045], [1.05, 0.62, 1.75]);
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, SEG), mat(shade(L.shoes || '#222', 0.6), 'flat'), foot, [0, -0.05, 0.045], [1, 1, 1.7]);
    J[side < 0 ? 'hipL' : 'hipR'] = hip; J[side < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  mesh(sphere(0.18), bottomM, hips, [0, 0.04, 0], [1.08 * B, 0.62, 0.82]);
  if (skirt) mesh(new THREE.CylinderGeometry(0.18 * B, 0.31 * B, 0.42, 28, 1, true), mat(L.bottom.color, 'cloth', { side: THREE.DoubleSide }), hips, [0, -0.13, 0]);

  // ---------- torso ----------
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso); J.torso = torso;
  const t = L.top;
  mesh(capsule(0.19, 0.27), topM, torso, [0, 0.3, 0], [1.08 * B, 1, 0.8]);
  mesh(sphere(0.2), topM, torso, [0, 0.47, 0], [1.25 * B, 0.55, 0.8]); // shoulders line
  const chestZ = 0.152;
  if (['suit', 'blazer', 'jacket', 'cardigan'].includes(t.type)) {
    const tri = new THREE.Shape(); tri.moveTo(-0.075, 0); tri.lineTo(0.075, 0); tri.lineTo(0, -0.21); tri.closePath();
    mesh(new THREE.ShapeGeometry(tri), mat(t.shirt || '#fff', 'cloth', { side: THREE.DoubleSide }), torso, [0, 0.56, chestZ + 0.012], [B, 1, 1]);
    // lapels
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.035, 0.22, 0.012), mat(shade(t.color, 0.8), 'cloth'), torso, [0.06 * s * B, 0.46, chestZ + 0.014], [1, 1, 1], [0, 0, 0.32 * s]);
    if (t.tie && !t.bowtie) { mesh(new THREE.BoxGeometry(0.034, 0.17, 0.01), mat(t.tie, 'gloss'), torso, [0, 0.44, chestZ + 0.03]); mesh(sphere(0.022), mat(t.tie, 'gloss'), torso, [0, 0.54, chestZ + 0.03], [1.1, 0.8, 0.6]); }
    if (t.bowtie) for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.03, 0.06, 4), mat(t.tie, 'gloss'), torso, [0.03 * s, 0.545, chestZ + 0.03], [1, 1, 0.5], [0, 0, (Math.PI / 2) * -s]);
    if (t.type !== 'cardigan') for (let i = 0; i < 2; i++) mesh(sphere(0.012), mat('#111', 'gloss'), torso, [0, 0.28 - i * 0.08, chestZ + 0.03]);
  }
  if (t.type === 'hoodie') {
    mesh(sphere(0.15), topM, torso, [0, 0.6, -0.12], [1.25 * B, 0.62, 0.62]);
    mesh(new THREE.BoxGeometry(0.22 * B, 0.09, 0.02), mat(shade(t.color, 0.85), 'cloth'), torso, [0, 0.2, chestZ + 0.01]);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14), mat('#f2f2f2', 'flat'), torso, [0.035 * s, 0.5, chestZ + 0.02]);
  }
  if (['polo', 'shirt'].includes(t.type)) for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.05, 0.012), mat(shade(t.color, 0.92), 'cloth'), torso, [0.045 * s, 0.62, 0.13], [1, 1, 1], [0.5, 0, 0.5 * s]);
  if (t.type === 'sweater') mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 24), mat(shade(t.color, 0.85), 'cloth'), torso, [0, 0.64, 0.02], [1.1, 1, 1], [Math.PI / 2, 0, 0]);

  // ---------- neck & head ----------
  const neckM = t.type === 'turtleneck' ? topM : skin;
  mesh(new THREE.CylinderGeometry(0.058, 0.065, t.type === 'turtleneck' ? 0.13 : 0.09, SEG), neckM, torso, [0, 0.66, 0]);
  const head = new THREE.Group(); head.position.y = 0.69; torso.add(head); J.head = head;
  const H = 0.17;
  mesh(sphere(0.2, 32, 24), skin, head, [0, H, 0], [1, 1.06, 0.98]);
  mesh(sphere(0.12), skin, head, [0, H - 0.1, 0.06], [1.15, 0.75, 1]); // jaw & cheeks
  for (const s of [-1, 1]) mesh(sphere(0.045), skinDark, head, [0.198 * s, H - 0.005, 0], [0.45, 1, 0.75]); // ears
  mesh(sphere(0.032), skinDark, head, [0, H - 0.03, 0.205], [1, 0.95, 1.05]); // nose
  if (L.blush !== false) for (const s of [-1, 1]) mesh(sphere(0.035), mat('#ff7a8a', 'skin', { transparent: true, opacity: 0.1, depthWrite: false }), head, [0.115 * s, H - 0.05, 0.16], [1, 0.6, 0.4]);

  // eyes
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(0.078 * s, H + 0.02, 0.165); head.add(eye);
    mesh(sphere(0.052), mat('#fbfbf8', 'gloss'), eye, [0, 0, 0], [1, 1.12, 0.6]);
    mesh(sphere(0.031), mat(L.eyes, 'gloss'), eye, [0, -0.004, 0.024], [1, 1.05, 0.5]);
    mesh(sphere(0.016), mat('#0b0806', 'gloss'), eye, [0, -0.004, 0.036], [1, 1, 0.4]);
    mesh(sphere(0.008), new THREE.MeshBasicMaterial({ color: '#ffffff' }), eye, [0.01, 0.012, 0.042]);
    if (L.lashes) mesh(new THREE.BoxGeometry(0.075, 0.009, 0.012), mat('#120c09', 'flat'), eye, [0.006 * s, 0.054, 0.012], [1, 1, 1], [0, 0, -0.18 * s]);
    eyes.push(eye);
  }
  // brows
  const browStyles = { calm: [0.0, 0.016], soft: [0.08, 0.013], arched: [0.22, 0.012], thick: [0.05, 0.024], bushy: [0.12, 0.03], focused: [-0.12, 0.018], happy: [0.18, 0.017], confident: [-0.06, 0.02] };
  const [browTilt, browT] = browStyles[L.brows] || browStyles.calm;
  const brows = [];
  for (const s of [-1, 1]) brows.push(mesh(new THREE.BoxGeometry(0.075, browT, 0.02), mat(L.browColor || L.hairColor || '#222', 'hair'), head, [0.078 * s, H + 0.088, 0.185], [1, 1, 1], [0, 0, browTilt * s]));

  // mouth
  const mouth = new THREE.Group(); mouth.position.set(0, H - 0.095, 0.19); head.add(mouth);
  const mouthOpen = mesh(sphere(0.04), mat('#5b1e1e', 'flat'), mouth, [0, 0, 0], [1, 0.22, 0.45]);
  const smile = mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 20, Math.PI), mat('#7a2b2b', 'flat'), mouth, [0, 0.016, 0.004], [1, 0.8, 1], [0, 0, Math.PI]);
  smile.visible = !!L.smile; mouthOpen.visible = !L.smile;

  // ---------- hair ----------
  const hairGroup = new THREE.Group(); hairGroup.position.y = H; head.add(hairGroup);
  const cap = (r, thetaLen, tilt = -0.32) => { const m = mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaLen), hairM, hairGroup, [0, 0.012, -0.008], [1, 1.06, 1]); m.rotation.x = tilt; return m; };
  switch (L.hair) {
    case 'short': cap(0.214, Math.PI * 0.46); mesh(sphere(0.07), hairM, hairGroup, [0.02, 0.17, 0.12], [1.6, 0.5, 0.8], [0.4, 0, 0.2]); break;
    case 'sidepart': cap(0.214, Math.PI * 0.47); mesh(sphere(0.08), hairM, hairGroup, [-0.06, 0.16, 0.1], [1.4, 0.55, 1], [0.35, 0, 0.35]); break;
    case 'quiff': cap(0.213, Math.PI * 0.45); mesh(sphere(0.09), hairM, hairGroup, [0, 0.2, 0.1], [1.3, 0.7, 0.95], [-0.3, 0, 0]); break;
    case 'slick': cap(0.212, Math.PI * 0.5, -0.45); mesh(sphere(0.1), hairM, hairGroup, [0, 0.15, 0.05], [1.5, 0.55, 1.4]); break;
    case 'wavy': cap(0.216, Math.PI * 0.47); for (let i = -2; i <= 2; i++) mesh(sphere(0.055), hairM, hairGroup, [i * 0.055, 0.17 - Math.abs(i) * 0.02, 0.13], [1, 0.8, 0.9]); break;
    case 'curly': cap(0.205, Math.PI * 0.48); for (let i = 0; i < 46; i++) { const th = Math.random() * Math.PI * 0.42, ph = Math.random() * Math.PI * 2; const r = 0.215; const z = Math.sin(th) * Math.sin(ph) * r; if (z > 0.12 && th > 0.9) continue; mesh(sphere(0.052, 10, 8), hairM, hairGroup, [Math.sin(th) * Math.cos(ph) * r, Math.cos(th) * r * 1.06 - 0.01, z - 0.02]); } break;
    case 'long': case 'longstraight': {
      cap(0.222, Math.PI * 0.52);
      mesh(shell(0.226, 1.5, 0.25 * Math.PI, 0.45 * Math.PI), hairM, hairGroup, [0, 0, -0.01]);
      mesh(capsule(0.16, 0.26), hairM, hairGroup, [0, -0.25, -0.1], [1.15, 1, 0.42]);
      for (const s of [-1, 1]) mesh(capsule(0.05, 0.3), hairM, hairGroup, [0.17 * s, -0.2, 0.02], [1, 1, 0.8], [0, 0, 0.08 * s]);
      if (L.hair === 'long') for (const s of [-1, 1]) mesh(sphere(0.06), hairM, hairGroup, [0.15 * s, -0.4, -0.02], [1, 1.2, 0.9]);
      mesh(sphere(0.08), hairM, hairGroup, [0.05, 0.17, 0.13], [1.7, 0.55, 0.8], [0.5, 0, 0.3]);
      break; }
    case 'bob': cap(0.222, Math.PI * 0.5); mesh(shell(0.232, 1.45, 0.2 * Math.PI, 0.42 * Math.PI), hairM, hairGroup); mesh(sphere(0.08), hairM, hairGroup, [0, 0.16, 0.13], [2.2, 0.5, 0.8], [0.5, 0, 0]); break;
    case 'bun': cap(0.215, Math.PI * 0.5); mesh(sphere(0.085), hairM, hairGroup, [0, 0.22, -0.07]); mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 16), mat('#ff6f61', 'gloss'), hairGroup, [0, 0.18, -0.06], [1, 1, 1], [Math.PI / 2.4, 0, 0]); break;
    case 'manbun': cap(0.213, Math.PI * 0.5, -0.45); mesh(sphere(0.07), hairM, hairGroup, [0, 0.19, -0.12]); break;
    case 'cap': {
      cap(0.214, Math.PI * 0.55);
      const hat = mat(L.capColor || '#333', 'cloth');
      mesh(new THREE.SphereGeometry(0.222, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hat, hairGroup, [0, 0.02, 0], [1, 1.04, 1], [-0.12, 0, 0]);
      mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 24, 1, false, 0, Math.PI), hat, hairGroup, [0, 0.07, -0.17], [1, 1, 1.1], [0.1, Math.PI / 2, 0]); // brim, worn backwards
      break; }
    case 'hijab': {
      const hj = mat(L.hairColor, 'cloth', { side: THREE.DoubleSide });
      mesh(shell(0.232, 1.25, 0, Math.PI * 0.88), hj, hairGroup, [0, 0.005, -0.005], [1, 1.07, 1]);
      mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.2, 28, 1, true), hj, hairGroup, [0, -0.29, -0.01], [1.05, 1, 0.9]);
      mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 32, Math.PI * 0.9), mat(shade(L.hairColor, 1.4), 'cloth'), hairGroup, [0, 0.0, 0.02], [1, 1.12, 1], [0, 0, Math.PI * 0.05]);
      break; }
    case 'bald': for (const s of [-1, 1]) mesh(sphere(0.07), hairM, hairGroup, [0.17 * s, 0.0, -0.06], [0.6, 0.9, 1.3]); mesh(sphere(0.08), hairM, hairGroup, [0, 0.02, -0.17], [1.8, 0.8, 0.5]); break;
  }
  // facial hair
  if (['beard', 'shortbeard', 'stubble'].includes(L.facial)) {
    const fm = L.facial === 'stubble' ? mat(L.facialColor, 'flat', { transparent: true, opacity: 0.18, depthWrite: false }) : mat(L.facialColor, 'hair');
    const r = L.facial === 'beard' ? 0.212 : 0.204;
    const full = L.facial === 'beard';
    mesh(front(r, Math.PI * (full ? 0.64 : 0.7), Math.PI * (full ? 0.28 : 0.22), Math.PI * (full ? 1.1 : 0.85)), fm, head, [0, H - 0.005, 0.0], [1, 1.06, 0.99]);
    if (L.facial === 'beard') mesh(sphere(0.06), fm, head, [0, H - 0.19, 0.11], [1.3, 0.7, 0.8]);
    if (L.facial !== 'stubble') mesh(capsule(0.014, 0.06), fm, head, [0, H - 0.066, 0.203], [1, 1, 0.6], [0, 0, Math.PI / 2]);
    mouth.position.z = 0.207;
  }
  if (L.facial === 'mustache') { for (const s of [-1, 1]) mesh(capsule(0.022, 0.05), mat(L.facialColor, 'hair'), head, [0.03 * s, H - 0.068, 0.198], [1, 1, 0.8], [0, 0, (Math.PI / 2) + 0.35 * s]); }

  // ---------- arms ----------
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.25 * side * B, 0.5, 0); torso.add(sh);
    const shortSleeve = ['tee', 'polo'].includes(t.type), rolled = t.sleeves === 'rolled';
    mesh(capsule(0.064 * Math.sqrt(B), 0.2), topM, sh, [0, -0.14, 0]);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    mesh(capsule(0.056 * Math.sqrt(B), 0.18), shortSleeve || rolled ? skin : topM, el, [0, -0.12, 0]);
    if (rolled) mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, SEG), topM, el, [0, -0.02, 0]);
    const hand = new THREE.Group(); hand.position.y = -0.26; el.add(hand);
    mesh(sphere(0.058), skin, hand, [0, -0.02, 0], [0.85, 1.1, 0.7]);
    mesh(capsule(0.017, 0.035), skin, hand, [0.04 * -side, 0.0, 0.03], [1, 1, 1], [0.5, 0, 0.6 * side]); // thumb
    J[side < 0 ? 'shL' : 'shR'] = sh; J[side < 0 ? 'elL' : 'elR'] = el; J[side < 0 ? 'handL' : 'handR'] = hand;
  }

  // ---------- props ----------
  const P = new Set(L.props);
  const glassesM = mat('#111', 'shiny');
  if ([...P].some((p) => p.startsWith('glasses'))) {
    const thick = P.has('glasses-thick'), square = P.has('glasses-square');
    for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.052, thick ? 0.011 : 0.006, 8, square ? 4 : 24), glassesM, head, [0.078 * s, H + 0.018, 0.205], [1, square ? 0.85 : 1, 1], [0, 0, square ? Math.PI / 4 : 0]);
    mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), glassesM, head, [0, H + 0.03, 0.21]);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.008, 0.008, 0.19), glassesM, head, [0.13 * s, H + 0.025, 0.11]);
  }
  if (P.has('headphones')) {
    mesh(new THREE.TorusGeometry(0.225, 0.02, 8, 32, Math.PI), mat('#e63946', 'gloss'), head, [0, H + 0.01, -0.01], [1, 1.08, 1]);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 24), mat('#1d1d1f', 'gloss'), head, [0.215 * s, H, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
  }
  if (P.has('earrings')) for (const s of [-1, 1]) mesh(sphere(0.016), mat('#e3c48f', 'shiny'), head, [0.2 * s, H - 0.06, 0.01]);
  if (P.has('watch')) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), mat('#d4af37', 'shiny'), J.elL, [0, -0.2, 0]);
  if (P.has('lanyard')) { mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 24), mat('#d62828', 'cloth'), torso, [0, 0.55, 0.06], [1, 1.5, 1], [0.25, 0, 0]); mesh(new THREE.BoxGeometry(0.06, 0.08, 0.008), mat('#ffffff', 'gloss'), torso, [0, 0.38, 0.165]); }
  const holdR = (geo, m, pos = [0, -0.08, 0.04], rot = [0, 0, 0]) => mesh(geo, m, J.handR, pos, [1, 1, 1], rot);
  const holdL = (geo, m, pos = [0, -0.08, 0.04], rot = [0, 0, 0]) => mesh(geo, m, J.handL, pos, [1, 1, 1], rot);
  if (P.has('phone')) holdR(new THREE.BoxGeometry(0.06, 0.12, 0.012), mat('#111', 'gloss'), [0, -0.07, 0.05], [0.4, 0, 0]);
  if (P.has('notebook')) holdL(new THREE.BoxGeometry(0.13, 0.17, 0.025), mat('#7b2230', 'cloth'), [0.03, -0.1, 0.05]);
  if (P.has('clipboard')) holdL(new THREE.BoxGeometry(0.17, 0.23, 0.012), mat('#a0764a', 'cloth'), [0.04, -0.1, 0.06]);
  if (P.has('tablet')) holdL(new THREE.BoxGeometry(0.17, 0.24, 0.012), mat('#2b2f36', 'gloss'), [0.04, -0.1, 0.06]);
  if (P.has('laptop')) holdL(new THREE.BoxGeometry(0.28, 0.02, 0.2), mat('#b8bcc4', 'shiny'), [0.06, -0.06, 0.08], [0, 0, 1.4]);
  if (P.has('briefcase')) { holdL(new THREE.BoxGeometry(0.32, 0.24, 0.09), mat('#4a2c1a', 'gloss'), [0, -0.18, 0]); }

  // ---------- animation ----------
  const target = {};
  const rest = () => ({ hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shLx: 0.05, shRx: 0.05, shLz: -0.09, shRz: 0.09, elL: -0.12, elR: -0.12, torsoX: 0, torsoY: 0, headX: 0, headY: 0, headZ: 0, bob: 0 });
  const cur = rest();
  let state = 'idle', ph = Math.random() * 10, clock = Math.random() * 100, blinkT = 2 + Math.random() * 3, lookT = 0, lookY = 0, lookX = 0;
  const api = {
    root, talking: false,
    setState(s) { state = s; },
    get state() { return state; },
    update(dt) {
      clock += dt;
      const T = rest();
      // hold props in front when idle
      if (P.has('notebook') || P.has('clipboard') || P.has('tablet') || P.has('laptop')) { T.shLx = -0.35; T.elL = -1.1; }
      if (P.has('phone')) { T.shRx = -0.3; T.elR = -1.25; }
      if (state === 'walk' || state === 'run') {
        const run = state === 'run';
        ph += dt * (run ? 12 : 7.2);
        const s = Math.sin(ph), c = Math.cos(ph);
        const amp = run ? 0.95 : 0.5;
        T.hipL = s * amp; T.hipR = -s * amp;
        T.kneeL = Math.max(0, -c) * (run ? 1.4 : 0.75); T.kneeR = Math.max(0, c) * (run ? 1.4 : 0.75);
        if (!P.has('briefcase')) T.shLx = -s * (run ? 0.9 : 0.45) + (T.shLx > 0 ? 0 : T.shLx * 0.6);
        T.shRx = s * (run ? 0.9 : 0.45) + (P.has('phone') ? -0.3 : 0);
        if (run) { T.elL = -1.3; T.elR = -1.3; T.torsoX = 0.18; }
        T.torsoY = s * 0.06; T.bob = Math.abs(c) * (run ? 0.06 : 0.03);
        T.headX = run ? -0.12 : 0;
      } else if (state === 'swim') {
        ph += dt * 3.2;
        T.shLx = -ph % (Math.PI * 2); T.shRx = -(ph + Math.PI) % (Math.PI * 2); T.shLz = -0.3; T.shRz = 0.3; T.elL = -0.3; T.elR = -0.3;
        T.hipL = Math.sin(ph * 3) * 0.3; T.hipR = -Math.sin(ph * 3) * 0.3; T.torsoX = 0.25; T.headX = -0.25;
      } else if (state === 'sit') { // seated at the meeting table, forearms resting forward
        T.hipL = 1.5; T.hipR = 1.5; T.kneeL = 1.5; T.kneeR = 1.5; T.bob = -0.33;
        T.shLx = -0.6; T.shRx = -0.6; T.shLz = -0.12; T.shRz = 0.12; T.elL = -0.8; T.elR = -0.8;
        T.torsoX = 0.04 + Math.sin(clock * 1.6) * 0.01;
        lookT -= dt; if (lookT < 0) { lookT = 2.5 + Math.random() * 4; lookY = (Math.random() - 0.5) * 0.7; lookX = (Math.random() - 0.5) * 0.15; }
        T.headY = lookY; T.headX = lookX;
      } else if (state === 'think') {
        T.shRx = -1.25; T.shRz = 0.25; T.elR = -2.1; T.headZ = 0.12; T.headX = 0.08;
      } else { // idle: breathing, weight shift, look around
        T.torsoX = Math.sin(clock * 1.6) * 0.012; T.bob = Math.sin(clock * 1.6) * 0.004;
        T.hipL = Math.sin(clock * 0.6) * 0.03; T.hipR = -T.hipL;
        lookT -= dt; if (lookT < 0) { lookT = 2 + Math.random() * 4; lookY = (Math.random() - 0.5) * 0.9; lookX = (Math.random() - 0.5) * 0.25; }
        T.headY = lookY; T.headX = lookX;
      }
      if (api.talking) {
        T.headX += Math.sin(clock * 7) * 0.05; T.headY *= 0.3;
        if (state === 'idle') { T.shRx = -0.55 + Math.sin(clock * 2.3) * 0.25; T.elR = -0.9 + Math.sin(clock * 3.1) * 0.3; }
        if (state === 'sit') { T.shRx = -0.9 + Math.sin(clock * 2.3) * 0.25; T.elR = -1.2 + Math.sin(clock * 3.1) * 0.35; T.torsoX = 0.1; }
        mouthOpen.visible = true; smile.visible = false;
        mouthOpen.scale.y = 0.15 + Math.abs(Math.sin(clock * 15) * Math.sin(clock * 5.3)) * 0.85;
        brows.forEach((b) => { b.position.y = H + 0.088 + Math.max(0, Math.sin(clock * 3)) * 0.012; });
      } else { mouthOpen.visible = !L.smile; smile.visible = !!L.smile; mouthOpen.scale.y = 0.22; }
      // blink
      blinkT -= dt;
      const closed = blinkT < 0 && blinkT > -0.12;
      if (blinkT < -0.12) blinkT = 2.5 + Math.random() * 3.5;
      eyes.forEach((e) => { e.scale.y = closed ? 0.1 : 1; });
      // smooth toward target
      const k = 1 - Math.exp(-dt * (state === 'swim' ? 30 : 12));
      for (const key in T) {
        if (state === 'swim' && (key === 'shLx' || key === 'shRx')) cur[key] = T[key];
        else cur[key] += (T[key] - cur[key]) * k;
      }
      J.hipL.rotation.x = -cur.hipL; J.hipR.rotation.x = -cur.hipR;
      J.kneeL.rotation.x = cur.kneeL; J.kneeR.rotation.x = cur.kneeR;
      J.shL.rotation.set(cur.shLx, 0, cur.shLz); J.shR.rotation.set(cur.shRx, 0, cur.shRz);
      J.elL.rotation.x = cur.elL; J.elR.rotation.x = cur.elR;
      J.torso.rotation.set(cur.torsoX, cur.torsoY, 0);
      J.head.rotation.set(cur.headX, cur.headY, cur.headZ);
      J.hips.position.y = 0.8 + cur.bob;
    },
  };
  root.traverse((n) => { if (n.isMesh) n.frustumCulled = true; });
  api.update(0.016);
  return api;
}

// Head-and-shoulders portrait of a character, used as their profile picture everywhere.
let pr = null;
export function portrait(look, size = 256) {
  if (!pr) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size); renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#4a3a2a', 1.1));
    const key = new THREE.DirectionalLight('#fff1dd', 2.2); key.position.set(1.5, 2.5, 3); scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc7ff', 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    pr = { renderer, scene, camera };
  }
  const ch = makeCharacter({ ...look, smile: true });
  ch.update(0.016);
  pr.scene.add(ch.root);
  const h = (look.height || 1);
  pr.camera.position.set(0.32, 1.7 * h, 1.6); pr.camera.lookAt(0, 1.6 * h, 0);
  pr.renderer.render(pr.scene, pr.camera);
  const url = pr.renderer.domElement.toDataURL('image/png');
  pr.scene.remove(ch.root);
  return url;
}

window.Characters = { makeCharacter, portrait };
window.dispatchEvent(new Event('characters-ready'));
