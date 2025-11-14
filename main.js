// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const canvas = document.getElementById('c');
canvas.style.touchAction = 'none';
canvas.setAttribute('aria-label', 'Animazione bustina NBAnima');
const MOBILE_BREAKPOINT = 768;
let isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, isMobile ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

// --- Scene + Camera + Env ---------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080e);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0.6, 0.8, 2.2);

// EnvMap fisico
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

// Luce ambientale di base
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// Controlli orbitali
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 5;
controls.minDistance = 1.2;
controls.target.set(0, 0.35, 0);

// --- Luci extra (morbide) ---------------------------------------------------
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2, 3, 1);
const rim = new THREE.DirectionalLight(0xffffff, 1.2);
rim.position.set(-2, 2, -2);
scene.add(key, rim);

// --- Loader texture helper --------------------------------------------------
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function loadTex(url) {
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  return t;
}

function createCrimpTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f7ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(110, 126, 180, 0.55)';
  ctx.lineWidth = 8;
  for (let i = 0; i < 6; i++) {
    const y = 6 + i * 9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function sculptFoilGeometry(geo, w, h, depth) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const xNorm = v.x / (w / 2);
    const yNorm = v.y / (h / 2);
    const zNorm = v.z / (depth / 2);
    const isFrontOrBack = Math.abs(Math.abs(v.z) - depth / 2) < 1e-4;
    if (isFrontOrBack) {
      const bulge = 0.015 * Math.cos(xNorm * Math.PI * 0.9) * Math.cos(yNorm * Math.PI * 0.65);
      const wrinkle = 0.0035 * Math.sin(xNorm * 6 + yNorm * 4) + 0.002 * Math.sin(xNorm * 13);
      const gatherTop = 0.01 * Math.exp(-Math.pow((yNorm - 0.92) * 3.2, 2));
      const gatherBottom = 0.01 * Math.exp(-Math.pow((yNorm + 0.92) * 3.2, 2));
      const offset = bulge + wrinkle + gatherTop + gatherBottom;
      const dir = Math.sign(v.z) || 1;
      pos.setZ(i, dir * depth * 0.5 + dir * offset);
    }

    if (Math.abs(Math.abs(v.y) - h / 2) < 1e-4) {
      const dirY = Math.sign(v.y) || 1;
      const ripple = 0.0025 * Math.sin((xNorm + 1) * Math.PI * 9);
      pos.setY(i, dirY * h * 0.5 + dirY * ripple);
    }

    const edgeSoft = 0.08 * Math.pow(Math.abs(xNorm), 3);
    const newX = v.x * (1 - edgeSoft * 0.35);
    pos.setX(i, newX);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// --- Card factory -----------------------------------------------------------
// Card size (in metri "virtuali"). Regola per cambiare scale generale.
const CARD_W = 0.635; // ~63.5 mm
const CARD_H = 0.889; // ~88.9 mm
const CARD_T = 0.004; // spessore

function createCard(frontURL, backTex) {
  const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);

  // Materiali: [right, left, top, bottom, front, back]
  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.0,
    clearcoat: 0.3,
  });

  const matFront = new THREE.MeshPhysicalMaterial({
    map: loadTex(frontURL),
    roughness: 0.4,
    metalness: 0.05,
    clearcoat: 0.6,
  });
  const matBack = new THREE.MeshPhysicalMaterial({
    map: backTex,
    roughness: 0.45,
    metalness: 0.05,
    clearcoat: 0.6,
  });

  const mats = [sideMat, sideMat, sideMat, sideMat, matFront, matBack];
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Stato & API
  mesh.userData.isCard = true;
  mesh.userData.flipped = false;
  mesh.userData.flipProgress = 0; // 0 = front, 1 = back
  mesh.userData.flipAngle = 0; // angolo di flip (rad)
  mesh.userData.baseAngle = 0; // angolo “di ventaglio”
  mesh.userData.flipTo = (target = 1) => {
    mesh.userData.flipTarget = target;
  };
  mesh.userData.fanTilt = 0;
  mesh.userData.scatter = { x: 0, y: 0, z: 0 };

  return mesh;
}

// --- Pack (bustina) ---------------------------------------------------------
function createPack(frontTexture, backTexture) {
  const group = new THREE.Group();

  const w = CARD_W * 1.24;
  const h = CARD_H * 1.36;
  const depth = CARD_W * 0.25;

  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0xbec6df,
    roughness: 0.32,
    metalness: 0.45,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
  });
  const sealTexture = createCrimpTexture();

  const topMat = new THREE.MeshPhysicalMaterial({
    map: sealTexture,
    color: 0xf3f5ff,
    roughness: 0.32,
    metalness: 0.42,
    clearcoat: 0.5,
  });
  const bottomMat = topMat.clone();

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: frontTexture,
    roughness: 0.18,
    metalness: 0.8,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.35,
  });
  const backMat = frontMat.clone();
  backMat.map = backTexture;

  const bodyGeo = new THREE.BoxGeometry(w, h, depth, 28, 38, 2);
  sculptFoilGeometry(bodyGeo, w, h, depth);
  const body = new THREE.Mesh(bodyGeo, [sideMat, sideMat, topMat, bottomMat, frontMat, backMat]);

  const packInner = new THREE.Group();
  packInner.add(body);

  group.add(packInner);
  group.userData = {
    isPack: true,
    openProgress: 0,
  };
  group.scale.setScalar(1.06);
  group.position.set(0, 0.35, 0);

  return group;
}

// --- Setup assets -----------------------------------------------------------
const backTex = loadTex('./public/cards/Back.png');
const packFrontTex = loadTex('./public/Package/packagefronte.png');
const packBackTex = loadTex('./public/Package/packageretro.png');

const fronts = [
  './public/cards/MangaWembyAmazingBlock.png',
  './public/cards/PinkRiriCourtSide.png',
  './public/cards/MangaPrimeMJJumpGold.png',
  './public/cards/MangaReggieChokeGold.png',
];

// Bustina che copre le cards
const pack = createPack(packFrontTex, packBackTex);
scene.add(pack);
applyResponsiveLayout();

// Crea stack di cards (verticali, nascoste dietro la bustina)
const cardStack = new THREE.Group();
const baseY = pack.position.y + 0.02;
const STACK_HIDDEN_Z = -0.06;

const cardCenter = (fronts.length - 1) / 2;
fronts.forEach((src, i) => {
  const card = createCard(src, backTex);
  card.userData.baseAngle = THREE.MathUtils.degToRad((i - cardCenter) * 4.5);
  card.userData.scatter = {
    x: (Math.random() - 0.5) * 0.35,
    z: 0.15 + Math.random() * 0.2,
    y: Math.random() * 0.05,
  };
  card.rotation.set(0, 0, 0);
  card.position.set(0, baseY + i * (CARD_T * 1.05), STACK_HIDDEN_Z); // completamente avvolte
  cardStack.add(card);
});
scene.add(cardStack);

// --- Interazioni ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function onClick() {
  if (pack.userData.openProgress < 1) {
    // prima volta: apri bustina
    targetOpen = 1;
    return;
  }

  if (hovered && hovered.object.userData.isCard) {
    const m = hovered.object;
    m.userData.flipTo(m.userData.flipped ? 0 : 1);
  }
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('click', onClick);

// UI buttons
document.getElementById('openPack').onclick = () => (targetOpen = 1);
document.getElementById('reset').onclick = resetAll;

// --- Animazioni -------------------------------------------------------------
let targetOpen = 0; // 0 chiuso, 1 aperto

function applyResponsiveLayout() {
  isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const pixelRatio = Math.min(window.devicePixelRatio ?? 1, isMobile ? 1.6 : 2);
  renderer.setPixelRatio(pixelRatio);

  if (isMobile) {
    camera.position.set(0.35, 1.05, 2.9);
    controls.minDistance = 1.25;
    controls.maxDistance = 3.8;
    controls.enablePan = false;
    pack.scale.setScalar(0.95);
  } else {
    camera.position.set(0.6, 0.8, 2.2);
    controls.minDistance = 1.2;
    controls.maxDistance = 5;
    controls.enablePan = true;
    pack.scale.setScalar(1.06);
  }
  controls.update();
}

function animatePack(dt) {
  const cur = pack.userData.openProgress;
  const next = THREE.MathUtils.damp(cur, targetOpen, 3.2, dt);
  pack.userData.openProgress = next;

  // Cards: escono dall'alto e si allineano in fila
  const reveal = THREE.MathUtils.smoothstep(next, 0.35, 1.0);

  const n = cardStack.children.length;
  const centerIndex = (n - 1) / 2;
  const baseY = pack.position.y + 0.02;

  cardStack.children.forEach((card, i) => {
    const idx = i - centerIndex;
    const stackY = baseY + i * (CARD_T * 1.05);
    const cardReveal = THREE.MathUtils.clamp(reveal * n - i, 0, 1);
    const xTarget = idx * 0.8;
    const yTarget = baseY + 0.45;
    const zTarget = 0.45;

    const x = THREE.MathUtils.lerp(0, xTarget, cardReveal);
    const y = THREE.MathUtils.lerp(stackY, yTarget, cardReveal);
    const z = THREE.MathUtils.lerp(STACK_HIDDEN_Z, zTarget, cardReveal);

    card.userData.fanTilt = 0;
    card.position.set(x, y, z);
  });
}

function animateCardFlips(dt) {
  cardStack.children.forEach((card) => {
    const target = card.userData.flipTarget ?? (card.userData.flipped ? 1 : 0);
    card.userData.flipProgress = THREE.MathUtils.damp(
      card.userData.flipProgress,
      target,
      6.0,
      dt
    );

    const p = card.userData.flipProgress;
    card.userData.flipAngle = Math.PI * p; // 0 → 180°

    if (Math.abs(p - 1) < 0.001) card.userData.flipped = true;
    if (Math.abs(p - 0) < 0.001) card.userData.flipped = false;

    card.rotation.set(0, card.userData.flipAngle, 0);
    card.rotation.z = card.userData.fanTilt || 0;
  });
}

function resetAll() {
  targetOpen = 0;
  pack.userData.openProgress = 0;

  const n = cardStack.children.length;
  const baseY = pack.position.y + 0.02;

  cardStack.children.forEach((c, i) => {
    c.userData.flipTarget = 0;
    c.userData.flipped = false;
    c.userData.flipProgress = 0;
    c.userData.flipAngle = 0;
    c.userData.fanTilt = 0;
    c.position.set(0, baseY + i * (CARD_T * 1.05), STACK_HIDDEN_Z);
    c.rotation.set(0, 0, 0);
  });

  controls.reset();
  controls.target.set(0, 0.35, 0);
}

// --- Render loop + picking ---------------------------------------------------
const clock = new THREE.Clock();

function render() {
  const dt = Math.min(0.033, clock.getDelta());
  controls.update();

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(cardStack.children, false);
  hovered = hits[0] || null;
  document.body.style.cursor = hovered ? 'pointer' : 'default';

  animatePack(dt);
  animateCardFlips(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// --- Resize ---------------------------------------------------------------
function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  applyResponsiveLayout();
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', handleResize, { passive: true });
