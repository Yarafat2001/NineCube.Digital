/**
 * Order-processing showcase scene.
 *
 * Adapted from the Web Fueled reference implementation, vendored in `src/helix/reference/`:
 *   github.com/webfueled/web-fueled-helix @ v1.1.0  (main.js, styles.css, VALIDATION.md)
 *
 * The geometry, timing, camera, cover-crop maths and responsive closing-grid logic are the
 * reference values, unchanged. Only three things differ, and none of them touch the animation:
 *
 *   1. Three.js is imported from the npm package (0.180.0, the reference version) instead of a CDN.
 *   2. Element references are injected instead of looked up with `getElementById`, so React owns
 *      the markup. The adapter also creates and removes the canvas it renders into.
 *   3. The render loop and every listener are registered through a handle so `dispose()` can stop
 *      them and release the GPU resources - the reference was written for a single page load.
 */
import * as THREE from 'three';

export interface HelixSceneElements {
  /** Positioned container the canvas is created in. */
  canvasContainer: HTMLElement;
  track: HTMLElement;
  bar: HTMLElement;
  codexTitle: HTMLElement;
  threeTitle: HTMLElement;
  transitionShade: HTMLElement;
  transitionTitle: HTMLElement;
  introTrack: HTMLElement;
  introStage: HTMLElement;
  introBlock: HTMLElement;
  outro: HTMLElement;
  outroBlock: HTMLElement;
}

export interface HelixSceneHandle {
  dispose(): void;
}

export function createHelixScene(
  elements: HelixSceneElements,
  cardAssetUrls: readonly string[]
): HelixSceneHandle {
  const {
    canvasContainer,
    track,
    bar,
    codexTitle,
    threeTitle,
    transitionShade,
    transitionTitle,
    introTrack,
    introStage,
    introBlock,
    outro,
    outroBlock
  } = elements;

  // The canvas belongs to this scene: creating it here means a remount always gets a fresh
  // WebGL context instead of inheriting one that `dispose()` has just force-lost.
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  canvasContainer.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const rig = new THREE.Group();
  scene.add(rig);

  const outlineGroup = new THREE.Group();
  rig.add(outlineGroup);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9.25);

  const loader = new THREE.TextureLoader();
  const cards: THREE.Mesh[] = [];
  const gridCards: THREE.Mesh[] = [];
  const COUNT = 9;
  const W_SEGS = 32;
  const GRID_H_SEGS = 12;
  const OUTLINE_SAMPLES = 240;
  const HELIX_CARD_H = 1.34;
  const HELIX_CARD_W = 2.8;
  const GRID_CARD_H = 1.77;
  const GRID_CARD_W = 2.54;
  const CARD_ASSETS = cardAssetUrls;

  const R = 4.45;
  const Y_START = -1.09;
  const pitchPerRad = 0.82;

  const MID = 0.0;
  const DIP_A = 0.52;
  const DIP_S = 1.2;

  const dsPerRad = Math.sqrt(R * R + pitchPerRad * pitchPerRad);

  const CARD_ARC_WIDTH = 2.18;
  const GAP_ARC = 0.24;
  const STEP_ARC = CARD_ARC_WIDTH + GAP_ARC;

  const TRAVEL_TURNS = 3.18;
  const TRAVEL_ARC = Math.PI * 2 * TRAVEL_TURNS * dsPerRad;
  const BASE_ARC = -43.1;

  const HELIX_START = 0.095;
  const HELIX_END = 0.91;
  const HELIX_MID = (HELIX_START + HELIX_END) * 0.5;

  /*
    Closing transition: build into a 3x2 stacked grid before
    the final helix card fully exits the top of the viewport.
  */
  const STACK_START = 0.655;
  const STACK_END = 0.985;
  const GRID_ORDER = [1, 2, 3, 4, 5, 6];
  const GRID_TARGETS = [
    new THREE.Vector3(-2.72, 0.98, 0.12),
    new THREE.Vector3(0.0, 0.98, 0.1),
    new THREE.Vector3(2.72, 0.98, 0.08),
    new THREE.Vector3(-2.72, -0.98, 0.08),
    new THREE.Vector3(0.0, -0.98, 0.06),
    new THREE.Vector3(2.72, -0.98, 0.1)
  ];
  const DESKTOP_GRID_TARGETS = GRID_TARGETS.map((target) => target.clone());
  const GRID_ENTRANCES = [
    new THREE.Vector3(-8.2, 5.6, 0.55),
    new THREE.Vector3(0.0, 5.95, 0.4),
    new THREE.Vector3(8.2, 5.6, 0.55),
    new THREE.Vector3(-8.0, -5.75, 0.45),
    new THREE.Vector3(0.0, -6.05, 0.36),
    new THREE.Vector3(8.0, -5.75, 0.45)
  ];
  const GRID_START_ROT = [
    new THREE.Euler(0.06, -0.16, -0.18),
    new THREE.Euler(0.11, 0.0, -0.04),
    new THREE.Euler(0.06, 0.16, 0.18),
    new THREE.Euler(-0.05, -0.15, -0.17),
    new THREE.Euler(-0.1, 0.0, 0.05),
    new THREE.Euler(-0.05, 0.15, 0.17)
  ];
  const STACK_STAGGER = 0.07;
  const GRID_MOVE_DURATION = 0.34;
  const GRID_DESKTOP_BREAKPOINT = 1200;
  const GRID_MOBILE_BREAKPOINT = 600;

  let gridLayoutScale = 1;

  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  function dip(a: number) {
    const d = (a - MID) / DIP_S;
    return DIP_A * Math.exp(-d * d);
  }

  function hPos(a: number, out = new THREE.Vector3()) {
    out.set(R * Math.cos(a), Y_START + a * pitchPerRad - dip(a), R * Math.sin(a));
    return out;
  }

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  function tangent(a: number, out = new THREE.Vector3()) {
    const e = 0.0015;
    hPos(a - e, _a);
    hPos(a + e, _b);
    out.copy(_b).sub(_a).normalize();
    return out;
  }

  function upVector(a: number, tan: THREE.Vector3, out = new THREE.Vector3()) {
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize();
    out.set(0, 1, 0);
    out.lerp(radial, 0.07);
    out.addScaledVector(tan, -out.dot(tan)).normalize();
    return out;
  }

  function getTextureDimensions(tex: THREE.Texture) {
    const image = tex.image as { naturalWidth?: number; videoWidth?: number; width?: number; naturalHeight?: number; videoHeight?: number; height?: number } | undefined;
    return {
      width: image?.naturalWidth || image?.videoWidth || image?.width || 1,
      height: image?.naturalHeight || image?.videoHeight || image?.height || 1
    };
  }

  function updateCoverCrop(material: THREE.ShaderMaterial, tex: THREE.Texture, targetAspect: number) {
    const { width, height } = getTextureDimensions(tex);
    const imageAspect = width / height;
    const coverScale = material.uniforms.coverScale.value as THREE.Vector2;

    if (imageAspect > targetAspect) {
      coverScale.set(targetAspect / imageAspect, 1);
    } else {
      coverScale.set(1, imageAspect / targetAspect);
    }
  }

  function buildCardMaterial(tex: THREE.Texture) {
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        opacity: { value: 1.0 },
        coverScale: { value: new THREE.Vector2(1, 1) }
      },
      transparent: true,
      side: THREE.DoubleSide,
      vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
      fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      uniform vec2 coverScale;
      varying vec2 vUv;
      void main(){
        vec2 uv=(vUv-0.5)*coverScale+0.5;
        if(!gl_FrontFacing){
          uv.x=1.0-uv.x;
        }
        vec4 c=texture2D(map,uv);
        gl_FragColor=vec4(c.rgb,c.a*opacity);
      }
    `
    });
  }

  function loadCardTexture(url: string, targetAspect: number, onMaterialReady: () => THREE.Material | undefined) {
    const tex = loader.load(url, (loadedTexture) => {
      // A texture can resolve after the scene has been torn down (a fast route change), so the
      // crop update is skipped rather than touching a disposed material.
      if (disposed) return;
      const material = onMaterialReady();
      if (material) updateCoverCrop(material as THREE.ShaderMaterial, loadedTexture, targetAspect);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const outlineUpperMaterial = new THREE.LineBasicMaterial({
    color: 0xa9aaa6,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    depthTest: true
  });

  const outlineLowerMaterial = new THREE.LineBasicMaterial({
    color: 0xa9aaa6,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    depthTest: false
  });

  const outlineUpper = new THREE.Line(new THREE.BufferGeometry(), outlineUpperMaterial);
  const outlineLower = new THREE.Line(new THREE.BufferGeometry(), outlineLowerMaterial);
  outlineUpper.frustumCulled = false;
  outlineLower.frustumCulled = false;
  outlineUpper.renderOrder = 1;
  outlineLower.renderOrder = 10;
  outlineGroup.add(outlineUpper, outlineLower);

  for (let i = 0; i < COUNT; i++) {
    const cardNumber = COUNT - i;
    let material: THREE.ShaderMaterial | undefined;
    const tex = loadCardTexture(CARD_ASSETS[cardNumber - 1]!, HELIX_CARD_W / HELIX_CARD_H, () => material);
    material = buildCardMaterial(tex);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HELIX_CARD_W, HELIX_CARD_H, W_SEGS, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    cards.push(mesh);
    rig.add(mesh);
  }

  for (let i = 0; i < GRID_ORDER.length; i++) {
    const asset = GRID_ORDER[i]!;
    let material: THREE.ShaderMaterial | undefined;
    const tex = loadCardTexture(CARD_ASSETS[asset - 1]!, GRID_CARD_W / GRID_CARD_H, () => material);
    material = buildCardMaterial(tex);

    const geo = new THREE.PlaneGeometry(GRID_CARD_W, GRID_CARD_H, W_SEGS, GRID_H_SEGS);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.userData.base = Float32Array.from(geo.attributes.position.array);
    mesh.userData.slot = i;
    gridCards.push(mesh);
    scene.add(mesh);
  }

  function updateGridLayout() {
    if (window.innerWidth >= GRID_DESKTOP_BREAKPOINT) {
      gridLayoutScale = 1;
      GRID_TARGETS.forEach((target, index) => target.copy(DESKTOP_GRID_TARGETS[index]!));
      return;
    }

    const columns = window.innerWidth <= GRID_MOBILE_BREAKPOINT ? 1 : 2;
    const rows = Math.ceil(GRID_TARGETS.length / columns);
    const gapX = columns === 1 ? 0 : 0.18;
    const gapY = columns === 1 ? 0.12 : 0.18;
    const baseWidth = columns * GRID_CARD_W + (columns - 1) * gapX;
    const baseHeight = rows * GRID_CARD_H + (rows - 1) * gapY;
    const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
    const worldWidth = worldHeight * camera.aspect;
    const maxWidth = worldWidth * 0.9;
    const maxHeight = worldHeight * 0.88;

    gridLayoutScale = Math.min(1, maxWidth / baseWidth, maxHeight / baseHeight);

    GRID_TARGETS.forEach((target, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = (column - (columns - 1) * 0.5) * (GRID_CARD_W + gapX) * gridLayoutScale;
      const y = ((rows - 1) * 0.5 - row) * (GRID_CARD_H + gapY) * gridLayoutScale;
      target.set(x, y, DESKTOP_GRID_TARGETS[index]!.z);
    });
  }

  let target = 0;
  let current = 0;
  let introProgress = 0;
  let outroProgress = 0;

  function readScroll() {
    const r = track.getBoundingClientRect();
    target = clamp(-r.top / (track.offsetHeight - window.innerHeight));

    const ir = introTrack.getBoundingClientRect();

    /*
      The hero is not sticky; measure its natural upward travel
      through one viewport.
    */
    introProgress = clamp(-ir.top / window.innerHeight);

    const or = outro.getBoundingClientRect();
    /*
      Footer reverse-blend:
      begin once the footer starts entering the viewport and complete
      through most of its first viewport of travel.
    */
    outroProgress = clamp((window.innerHeight - or.top) / (window.innerHeight * 0.92));
  }

  function wrapCardOnHelix(mesh: THREE.Mesh, sArcStart: number) {
    const pos = mesh.geometry.attributes.position!;
    const cols = W_SEGS + 1;

    for (let row = 0; row < 2; row++) {
      const hOff = (row === 0 ? -0.5 : 0.5) * HELIX_CARD_H;

      for (let col = 0; col < cols; col++) {
        const u = col / W_SEGS;
        const arc = sArcStart + u * CARD_ARC_WIDTH;
        const a = arc / dsPerRad;

        const cp = hPos(a, new THREE.Vector3());
        const tan = tangent(a, new THREE.Vector3());
        const up = upVector(a, tan, new THREE.Vector3());
        const p = cp.clone().addScaledVector(up, hOff);

        const actualRow = row === 0 ? 1 : 0;
        const idx = actualRow * cols + col;
        pos.setXYZ(idx, p.x, p.y, p.z);
      }
    }

    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  function updateOutline(
    line: THREE.Line,
    centerArc: number,
    arcLength: number,
    heightOffset: number,
    opacity: number
  ) {
    const points: THREE.Vector3[] = [];
    const arcStart = centerArc - arcLength * 0.5;
    const arcEnd = centerArc + arcLength * 0.5;

    for (let i = 0; i < OUTLINE_SAMPLES; i++) {
      const u = i / (OUTLINE_SAMPLES - 1);
      const arc = arcStart + (arcEnd - arcStart) * u;
      const a = arc / dsPerRad;

      const cp = hPos(a, new THREE.Vector3());
      const tan = tangent(a, new THREE.Vector3());
      const up = upVector(a, tan, new THREE.Vector3());
      const p = cp.clone().addScaledVector(up, heightOffset);
      points.push(p);
    }

    line.geometry.setFromPoints(points);
    (line.material as THREE.LineBasicMaterial).opacity = opacity;
  }

  function updateGridCard(mesh: THREE.Mesh, moveT: number, settleT: number, time: number) {
    const posAttr = mesh.geometry.attributes.position!;
    const base = mesh.userData.base as Float32Array;
    const windBase = 1 - settleT;
    const waveAmp = (0.05 + 0.25 * (1 - moveT)) * Math.pow(windBase, 0.88);

    for (let i = 0; i < posAttr.count; i++) {
      const ix = i * 3;
      const x = base[ix]!;
      const y = base[ix + 1]!;

      const rip1 = Math.sin(x * 2.25 + time * 2.5 + mesh.userData.slot * 0.55);
      const rip2 = Math.sin(y * 6.4 + time * 3.35 + mesh.userData.slot * 0.31);
      const rip3 = Math.cos((x + y) * 1.95 + time * 2.05 + mesh.userData.slot * 0.77);

      const dx = (rip2 * 0.05 + rip3 * 0.02) * waveAmp;
      const dz = (rip1 * 0.82 + rip2 * 0.42 + rip3 * 0.52) * waveAmp;

      posAttr.setXYZ(i, x + dx, y, dz);
    }
    posAttr.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();

    const slot = mesh.userData.slot as number;
    const p0 = GRID_ENTRANCES[slot]!;
    const p1 = GRID_TARGETS[slot]!;
    mesh.position.lerpVectors(p0, p1, moveT);

    const drift = (0.025 + 0.095 * (1 - moveT)) * windBase;
    mesh.position.x += Math.sin(time * 3.0 + slot * 0.85) * drift;
    mesh.position.y += Math.cos(time * 3.35 + slot * 0.55) * drift * 1.22;
    mesh.position.z += Math.sin(time * 2.45 + slot) * drift * 0.75;

    const r0 = GRID_START_ROT[slot]!;
    mesh.rotation.x = lerp(r0.x, 0, moveT) + Math.sin(time * 3.55 + slot) * 0.04 * windBase;
    mesh.rotation.y = lerp(r0.y, 0, moveT) + Math.cos(time * 2.95 + slot * 0.7) * 0.05 * windBase;
    mesh.rotation.z = lerp(r0.z, 0, moveT) + Math.sin(time * 3.8 + slot * 0.9) * 0.035 * windBase;

    const sc = lerp(0.95, 1, moveT) * gridLayoutScale;
    mesh.scale.set(sc, sc, sc);
    (mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = clamp(moveT * 1.7);
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.position.z = window.innerWidth < 800 ? 11.8 : 9.25;
    updateGridLayout();
  }

  function animate(tms = 0) {
    const time = tms * 0.001;
    current += (target - current) * 0.105;
    // Supporting photography fills the intro while the original helix is off camera.
    // The geometry, travel, camera, title timeline and grid motion remain unchanged.
    track.style.setProperty('--category-preview-opacity', String(1 - smooth(clamp((current - 0.32) / 0.1))));

    const hp = clamp((current - HELIX_START) / (HELIX_END - HELIX_START));
    const scrollArc = hp * TRAVEL_ARC;

    rig.position.set(0, 0, 0);

    const stackRaw = clamp((current - STACK_START) / (STACK_END - STACK_START));
    const helixFade = 1 - smooth(clamp((current - (STACK_START + 0.12)) / (STACK_END - 0.04 - (STACK_START + 0.12))));

    cards.forEach((mesh, i) => {
      const sArcStart = BASE_ARC + i * STEP_ARC + scrollArc;
      wrapCardOnHelix(mesh, sArcStart);

      const centerA = (sArcStart + CARD_ARC_WIDTH * 0.5) / dsPerRad;
      const c = hPos(centerA, new THREE.Vector3());
      const worldY = c.y + rig.position.y;

      const fadeTop = 8.15;
      const fadeBottom = -7.9;
      const edge = Math.min(worldY - fadeBottom, fadeTop - worldY);
      const baseOpacity = clamp(edge / 0.85);
      (mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = baseOpacity * helixFade;
    });

    const bandMidOffset = ((COUNT - 1) * STEP_ARC + CARD_ARC_WIDTH) * 0.5;
    const bandStartCenter = BASE_ARC + bandMidOffset;

    let lineProgress: number;
    if (current <= HELIX_MID) {
      lineProgress = 0.5 * clamp(current / HELIX_MID);
    } else {
      lineProgress = 0.5 + 0.5 * clamp((current - HELIX_MID) / (HELIX_END - HELIX_MID));
    }

    const OUTLINE_PHASE_ARC = Math.PI * dsPerRad;
    const outlineCenterArc = bandStartCenter + (1.0 - lineProgress) * TRAVEL_ARC - OUTLINE_PHASE_ARC;

    const outlineArcLength = STEP_ARC * 2.5;
    const outlineOffset = HELIX_CARD_H * 0.72;
    const outlineShowIn = clamp(lineProgress / 0.035);
    const outlineShowOut = clamp((1 - lineProgress) / 0.08);
    const outlineFade = 1 - smooth(clamp((current - (STACK_START + 0.1)) / (STACK_END - 0.03 - (STACK_START + 0.1))));
    const outlineOpacity = 0.58 * Math.min(outlineShowIn, outlineShowOut) * outlineFade;

    updateOutline(outlineUpper, outlineCenterArc, outlineArcLength, outlineOffset, outlineOpacity);
    updateOutline(outlineLower, outlineCenterArc, outlineArcLength, -outlineOffset, outlineOpacity);

    const openT = clamp(hp / 0.28);
    const openSmooth = openT * openT * (3 - 2 * openT);
    const radialScale = 0.72 + openSmooth * 0.28;
    rig.scale.set(radialScale, 1, radialScale);

    rig.rotation.z = THREE.MathUtils.degToRad(-1.0);
    rig.rotation.x = THREE.MathUtils.degToRad(1.5);
    rig.rotation.y = THREE.MathUtils.degToRad(-1.0);

    gridCards.forEach((mesh, idx) => {
      const start = idx * STACK_STAGGER;
      const nextStart = idx < gridCards.length - 1 ? (idx + 1) * STACK_STAGGER : 1.0;

      /*
        Maintain visible overlap during arrival and settling so earlier
        cards continue floating while later cards are approaching.
      */
      const entryEnd = Math.min(start + GRID_MOVE_DURATION, 1.0);
      const moveT = smoother(clamp((stackRaw - start) / (entryEnd - start || 1)));

      const settleStart =
        idx < gridCards.length - 1 ? Math.min(nextStart + 0.02, 0.9) : Math.min(start + 0.1, 0.84);

      const settleEnd = idx < gridCards.length - 1 ? Math.min(settleStart + 0.4, 0.985) : 1.0;

      const settleT = smoother(clamp((stackRaw - settleStart) / (settleEnd - settleStart || 1)));

      updateGridCard(mesh, moveT, settleT, time);
    });

    camera.position.x = 0;
    camera.position.y = 0;
    camera.lookAt(0, 0.05, 0);

    /*
      Editorial title timeline:
        1) enter and settle
        2) hold centered
        3) exit outward completely
        4) clear before the closing grid resolves

      This is intentionally independent of the stack timing.
    */
    const TITLE_ENTER_START = 0.055;
    const TITLE_ENTER_END = 0.17;
    const TITLE_HOLD_END = 0.565;
    const TITLE_EXIT_END = 0.735;

    const enterRaw = clamp((current - TITLE_ENTER_START) / (TITLE_ENTER_END - TITLE_ENTER_START));
    const enterT = smoother(enterRaw);

    const exitRaw = clamp((current - TITLE_HOLD_END) / (TITLE_EXIT_END - TITLE_HOLD_END));
    const exitT = smoother(exitRaw);

    const leftEnter = (1 - enterT) * -72;
    const rightEnter = (1 - enterT) * 72;

    // Once the hold is over, send each title farther outward than its original entrance.
    const exitDistance = 86 * exitT;

    codexTitle.style.transform = `translate3d(${leftEnter - exitDistance}vw,0,0)`;
    threeTitle.style.transform = `translate3d(${rightEnter + exitDistance}vw,0,0)`;

    const titleOpacity = clamp(enterT * (1 - exitT * 0.35) * 1.2);
    track.style.setProperty('--stage-copy-opacity', String(titleOpacity * (1 - smooth(clamp((current - 0.32) / 0.1)))));
    codexTitle.style.opacity = String(titleOpacity);
    threeTitle.style.opacity = String(titleOpacity);

    /*
      Opening transition - no sticky hero.

      The hero scrolls upward with the document. During the first part
      of that travel, the background blends to paper, the intro text
      blends to dark ink, and the content receives a subtle lift/scale.
    */
    const introBlend = smoother(clamp((introProgress - 0.035) / 0.3));
    const introLift = smoother(clamp((introProgress - 0.02) / 0.42));

    introBlock.style.transform = `translateY(calc(-50% - ${introLift * 7.5}vh)) scale(${1 - introLift * 0.018})`;

    const introDark = [10, 15, 31];
    const introLight = [214, 214, 211];
    const introTextLight = [245, 249, 255];
    const introTextDark = [36, 36, 36];

    const br = Math.round(lerp(introDark[0]!, introLight[0]!, introBlend));
    const bg = Math.round(lerp(introDark[1]!, introLight[1]!, introBlend));
    const bb = Math.round(lerp(introDark[2]!, introLight[2]!, introBlend));
    const tr = Math.round(lerp(introTextLight[0]!, introTextDark[0]!, introBlend));
    const tg = Math.round(lerp(introTextLight[1]!, introTextDark[1]!, introBlend));
    const tb = Math.round(lerp(introTextLight[2]!, introTextDark[2]!, introBlend));

    introStage.style.backgroundColor = `rgb(${br},${bg},${bb})`;
    introBlock.style.color = `rgb(${tr},${tg},${tb})`;

    // Sticky scene begins already light; only a tiny residual dark carry remains.
    const shadeT = smoother(clamp(current / 0.035));
    transitionShade.style.opacity = String((1 - shadeT) * 0.18);

    // Large transition title: appear immediately, hold briefly, then fade away.
    const ttIn = smoother(clamp(current / 0.018));
    const ttOut = smoother(clamp((current - 0.04) / 0.07));
    const ttOpacity = clamp(ttIn * (1 - ttOut));
    transitionTitle.style.opacity = String(ttOpacity);
    const ttScale = lerp(0.965, 1, ttIn) - ttOut * 0.018;
    transitionTitle.style.transform = `translate(-50%,-50%) scale(${ttScale})`;

    /*
      Footer reverse of the hero:
      light -> dark background and dark -> light text as the footer enters.
    */
    const outroBlend = smoother(clamp((outroProgress - 0.05) / 0.82));
    const outroLift = smoother(clamp((outroProgress - 0.02) / 0.92));

    const outroLight = [214, 214, 211];
    const outroDark = [10, 15, 31];

    const obr = Math.round(lerp(outroLight[0]!, outroDark[0]!, outroBlend));
    const obg = Math.round(lerp(outroLight[1]!, outroDark[1]!, outroBlend));
    const obb = Math.round(lerp(outroLight[2]!, outroDark[2]!, outroBlend));
    // Interpolating foreground grey through background grey made the footer unreadable
    // midway through its blend. Choose the higher-contrast foreground at each frame.
    const linear = (channel: number) => {
      const s = channel / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    };
    const luminance = .2126 * linear(obr) + .7152 * linear(obg) + .0722 * linear(obb);
    const ink = (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? 0 : 255;

    outro.style.backgroundColor = `rgb(${obr},${obg},${obb})`;
    outro.style.color = `rgb(${ink},${ink},${ink})`;
    outroBlock.style.color = `rgb(${ink},${ink},${ink})`;
    outroBlock.style.transform = `translateY(${(1 - outroLift) * 2.4}vh) scale(${1 - outroLift * 0.015})`;

    bar.style.transform = `scaleX(${current})`;
    renderer.render(scene, camera);
  }

  let frameId: number | null = null;
  let disposed = false;

  function frame(tms: number) {
    animate(tms);
    frameId = requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', resize);

  resize();
  readScroll();
  animate(0);
  frameId = requestAnimationFrame(frame);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;

      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;

      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', resize);

      for (const mesh of [...cards, ...gridCards]) {
        mesh.geometry.dispose();
        const material = mesh.material as THREE.ShaderMaterial;
        (material.uniforms.map?.value as THREE.Texture | undefined)?.dispose();
        material.dispose();
      }

      outlineUpper.geometry.dispose();
      outlineLower.geometry.dispose();
      outlineUpperMaterial.dispose();
      outlineLowerMaterial.dispose();

      scene.clear();
      outlineGroup.clear();
      rig.clear();

      // Releases the context immediately instead of waiting for the canvas to be collected.
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}
