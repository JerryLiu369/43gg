import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MODULES_BY_ID,
  ORBITAL_RINGS,
  RING_ORDER,
  ZODIAC_PALACES,
} from './content.ts';
import {
  TOTAL_SLOTS,
  TWO_PI,
  angularDistanceToZero,
  areModulesSynergistic,
  getSyzygyWindowRad,
  isSlotUnlocked,
  stepOrrery,
} from './engine.ts';
import type {
  CameraPresetId,
  ModuleTypeId,
  OrbitalRingId,
  OrreryMetaState,
  OrreryRunState,
  StepEvents,
} from './types.ts';

export interface OrreryBurstSpec {
  kind:
    | 'impulse'
    | 'perfect_impulse'
    | 'syzygy'
    | 'ascension'
    | 'comet'
    | 'supernova';
  bodyCount?: number;
  text?: string;
}

export interface OrrerySceneHandle {
  triggerBurst: (spec: OrreryBurstSpec) => void;
  snapToPreset: (preset: CameraPresetId) => void;
}

interface OrreryScene3DProps {
  runRef: React.MutableRefObject<OrreryRunState>;
  metaRef: React.MutableRefObject<OrreryMetaState>;
  pausedRef: React.MutableRefObject<boolean>;
  isTitleScreenRef: React.MutableRefObject<boolean>;
  selectedSlotRef: React.MutableRefObject<number>;
  gimbal3dModeRef: React.MutableRefObject<boolean>;
  cameraPreset: CameraPresetId;
  onStepEventsRef: React.MutableRefObject<(ev: StepEvents) => void>;
  onSelectSlotRef: React.MutableRefObject<(slotIndex: number) => void>;
  onCenterImpulseRef: React.MutableRefObject<() => void>;
  onCatchCometRef: React.MutableRefObject<() => void>;
}

const CAMERA_TARGETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [0, 7.6, 10.3], target: [0, -1.25, 0] },
  meridian: { pos: [2.4, 3.3, -8.2], target: [0, 0.1, -2.6] },
  crucible: { pos: [4.6, 0.8, 6.4], target: [0, -1.85, 0] },
  zenith: { pos: [0, 13.2, 0.35], target: [0, 0, 0] },
};

const SHOCKWAVE_POOL_SIZE = 6;
const STAR_COUNT = 320;
const TRAIL_POINTS = 28;

// Pre-allocated module-scope math scratchpads (Zero GC inside render loop)
const _mat4 = new THREE.Matrix4();
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3Mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _pointerNdc = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createAzimuthDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  ctx.fillStyle = '#09101E';
  ctx.fillRect(0, 0, 512, 512);

  // Concentric brass astrolabe rings
  const radii = [242, 224, 186, 138, 86];
  radii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.strokeStyle = idx % 2 === 0 ? '#C89B54' : '#475569';
    ctx.lineWidth = idx === 0 ? 4 : 2;
    ctx.stroke();
  });

  // 72 degree ticks
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TWO_PI;
    const major = i % 6 === 0;
    const r0 = major ? 204 : 214;
    const r1 = 224;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.strokeStyle = major ? '#F59E0B' : '#94A3B8';
    ctx.lineWidth = major ? 2.5 : 1.2;
    ctx.stroke();
  }

  // 12 Radial Meridian lines
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TWO_PI - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 86, cy + Math.sin(a) * 86);
    ctx.lineTo(cx + Math.cos(a) * 204, cy + Math.sin(a) * 204);
    ctx.strokeStyle = i === 0 ? '#FBBF24' : 'rgba(200, 155, 84, 0.28)';
    ctx.lineWidth = i === 0 ? 3.5 : 1.2;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBranchBadgeTexture(
  branch: string,
  isMeridian: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isMeridian ? '#3B2306' : '#0E1729';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = isMeridian ? '#FBBF24' : '#C89B54';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = isMeridian ? '#FEF08A' : '#F8FAFC';
  ctx.font = '700 62px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(branch, 64, 67);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSolarPlasmaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPrime: { value: 0 },
      uSupernova: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uPrime;
      uniform float uSupernova;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.4);

        vec3 q = vLocalPos * 3.8 + vec3(uTime * 0.45, -uTime * 0.32, uTime * 0.28);
        float n = noise(q) * 0.65 + noise(q * 2.3) * 0.35;

        vec3 deepCore = mix(vec3(0.86, 0.28, 0.03), vec3(0.18, 0.62, 0.95), uSupernova * 0.35);
        vec3 hotGold = mix(vec3(1.0, 0.74, 0.16), vec3(0.96, 0.90, 0.65), max(uPrime * 0.38, uSupernova * 0.32));
        vec3 whiteRim = vec3(1.0, 0.88, 0.56);

        vec3 col = mix(deepCore, hotGold, smoothstep(0.22, 0.82, n));
        col = mix(col, whiteRim, fresnel * 0.72 + uPrime * 0.25);
        gl_FragColor = vec4(col * (1.18 + uSupernova * 0.35 + uPrime * 0.28), 1.0);
      }
    `,
  });
}

export const OrreryScene3D = React.forwardRef<
  OrrerySceneHandle,
  OrreryScene3DProps
>(function OrreryScene3D(
  {
    runRef,
    metaRef,
    pausedRef,
    isTitleScreenRef,
    selectedSlotRef,
    gimbal3dModeRef,
    cameraPreset,
    onStepEventsRef,
    onSelectSlotRef,
    onCenterImpulseRef,
    onCatchCometRef,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetTargetRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: true,
    pos: new THREE.Vector3(...CAMERA_TARGETS.overview.pos),
    target: new THREE.Vector3(...CAMERA_TARGETS.overview.target),
  });
  const traumaRef = useRef<number>(0);
  const pendingBurstsRef = useRef<OrreryBurstSpec[]>([]);

  useImperativeHandle(ref, () => ({
    triggerBurst(spec: OrreryBurstSpec) {
      pendingBurstsRef.current.push(spec);
    },
    snapToPreset(preset: CameraPresetId) {
      const cfg = CAMERA_TARGETS[preset];
      presetTargetRef.current.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      presetTargetRef.current.target.set(
        cfg.target[0],
        cfg.target[1],
        cfg.target[2],
      );
      presetTargetRef.current.active = true;
    },
  }));

  // Trigger smooth camera glide whenever cameraPreset prop changes
  useEffect(() => {
    const cfg = CAMERA_TARGETS[cameraPreset];
    presetTargetRef.current.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    presetTargetRef.current.target.set(
      cfg.target[0],
      cfg.target[1],
      cfg.target[2],
    );
    presetTargetRef.current.active = true;
  }, [cameraPreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.dataset.testid = 'orrery-webgl-canvas';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a14);
    scene.fog = new THREE.FogExp2(0x060a14, 0.015);

    // Mandatory studio environment map for brushed metals & gemstones
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const initRect = container.getBoundingClientRect();
    const initW = Math.max(320, Math.floor(initRect.width));
    const initH = Math.max(240, Math.floor(initRect.height));

    const camera = new THREE.PerspectiveCamera(44, initW / initH, 0.1, 140);
    if (isTitleScreenRef.current) {
      camera.position.set(1.8, 5.4, 9.8);
    } else {
      camera.position.set(...CAMERA_TARGETS.overview.pos);
    }
    renderer.setSize(initW, initH, false);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 21.0;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.minPolarAngle = 0.08;
    if (isTitleScreenRef.current) {
      controls.target.set(-1.9, -0.25, 0);
    } else {
      controls.target.set(...CAMERA_TARGETS.overview.target);
    }
    camera.lookAt(controls.target);

    const onControlStart = () => {
      presetTargetRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // Disposables tracker
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [envTarget.texture];

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };
    const trackTex = <T extends THREE.Texture>(t: T): T => {
      textures.push(t);
      return t;
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // =========================================================================
    // 1. BALANCED WARM/COOL STUDIO CELESTIAL LIGHTING RIG
    // =========================================================================
    const hemiLight = new THREE.HemisphereLight(0x60a5fa, 0x0b1120, 1.15);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe7ba, 2.45);
    keyLight.position.set(6.5, 11.5, 7.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      const d = 8.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-7.5, 4.5, -8.5);
    scene.add(rimLight);

    const sunPointLight = new THREE.PointLight(0xfbbf24, 5.5, 16, 1.4);
    sunPointLight.position.set(0, 0, 0);
    scene.add(sunPointLight);

    const cruciblePointLight = new THREE.PointLight(0x06b6d4, 3.2, 10, 1.5);
    cruciblePointLight.position.set(0, -1.9, 0);
    scene.add(cruciblePointLight);

    // =========================================================================
    // 2. SHARED PBR HOROLOGICAL MATERIAL PALETTE
    // =========================================================================
    const brushedBrassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4a459,
        metalness: 0.9,
        roughness: 0.24,
      }),
    );
    const antiqueBronzeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x855d28,
        metalness: 0.82,
        roughness: 0.5,
      }),
    );
    const bluedSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e2d4a,
        metalness: 0.86,
        roughness: 0.48,
      }),
    );
    const obsidianMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0d1424,
        metalness: 0.22,
        roughness: 0.78,
      }),
    );
    const goldEmissiveMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
        metalness: 0.5,
        roughness: 0.2,
      }),
    );

    // =========================================================================
    // 3. DEEP-SPACE INSTANCED STARFIELD (320 Instances)
    // =========================================================================
    const starGeo = trackGeo(new THREE.OctahedronGeometry(0.065, 0));
    const starMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const starMesh = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
    starMesh.frustumCulled = false;

    const starPalette = [
      new THREE.Color(0xfef3c7),
      new THREE.Color(0xbae6fd),
      new THREE.Color(0xe0e7ff),
      new THREE.Color(0xfde68a),
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 16 + ((i * 37) % 28);
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      // Concentrate 60% near celestial equator, 40% across upper/lower dome
      const phiSpread = i % 5 < 3 ? 0.42 : 1.35;
      const phi = (((i * 73) % 100) / 50 - 1) * phiSpread;

      _vec3A.set(
        r * Math.cos(phi) * Math.cos(theta),
        r * Math.sin(phi) + 1.5,
        r * Math.cos(phi) * Math.sin(theta),
      );
      const s = 0.65 + ((i * 19) % 10) * 0.08;
      _scale.set(s, s, s);
      _quat.identity();
      _mat4.compose(_vec3A, _quat, _scale);
      starMesh.setMatrixAt(i, _mat4);
      starMesh.setColorAt(i, starPalette[i % starPalette.length]);
    }
    starMesh.instanceMatrix.needsUpdate = true;
    if (starMesh.instanceColor) starMesh.instanceColor.needsUpdate = true;
    scene.add(starMesh);

    // =========================================================================
    // 4. ALCHEMICAL ASTROLABE PEDESTAL & 3-CHAMBER CRUCIBLE (Composite Group)
    // =========================================================================
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(0, -2.85, 0);
    scene.add(pedestalGroup);

    // Contact shadow disc grounded beneath plinth
    const shadowDisc = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(5.6, 48)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x02040a,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.01;
    pedestalGroup.add(shadowDisc);

    // Primary Silhouette: Stepped Octagonal Obsidian Plinth
    const plinthLower = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(3.85, 4.35, 0.36, 8)),
      obsidianMat,
    );
    plinthLower.position.y = 0.2;
    plinthLower.receiveShadow = !isSoftwareGl;
    pedestalGroup.add(plinthLower);

    const plinthUpper = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(3.15, 3.55, 0.28, 16)),
      bluedSteelMat,
    );
    plinthUpper.position.y = 0.52;
    plinthUpper.receiveShadow = !isSoftwareGl;
    pedestalGroup.add(plinthUpper);

    // Engraved Brass Azimuth Dial Plate (offset +0.025 on Y to prevent Z-fighting)
    const dialTex = trackTex(createAzimuthDialTexture(maxAniso));
    const dialPlate = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(3.08, 48)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: dialTex,
          metalness: 0.55,
          roughness: 0.35,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      ),
    );
    dialPlate.rotation.x = -Math.PI / 2;
    dialPlate.position.y = 0.685;
    pedestalGroup.add(dialPlate);

    const brassBezel = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(3.12, 0.075, 12, 64)),
      brushedBrassMat,
    );
    brassBezel.rotation.x = Math.PI / 2;
    brassBezel.position.y = 0.68;
    pedestalGroup.add(brassBezel);

    // Central Vertical Spindle & 4 Buttress Ribs connecting Crucible to Sun Core
    const centralSpindle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.22, 2.8, 16)),
      bluedSteelMat,
    );
    centralSpindle.position.y = 1.65;
    pedestalGroup.add(centralSpindle);

    const buttressGeo = trackGeo(
      new THREE.TorusGeometry(1.45, 0.045, 10, 28, Math.PI * 0.52),
    );
    for (let b = 0; b < 4; b++) {
      const rib = new THREE.Mesh(buttressGeo, antiqueBronzeMat);
      rib.position.y = 0.72;
      rib.rotation.y = (b * Math.PI) / 2 + Math.PI / 4;
      pedestalGroup.add(rib);
    }

    // 3 Orbiting Alchemical Reaction Chambers (Fusion, Dilation, Crystallizer)
    const crucibleRotor = new THREE.Group();
    crucibleRotor.position.y = 1.08;
    pedestalGroup.add(crucibleRotor);

    const chamberColors = [0xf59e0b, 0x10b981, 0x06b6d4];
    const chamberMeshes: Array<{
      group: THREE.Group;
      coreMat: THREE.MeshStandardMaterial;
      beamMesh: THREE.Mesh;
      beamMat: THREE.MeshBasicMaterial;
      cageMesh: THREE.Mesh;
    }> = [];

    const chamberCageGeo = trackGeo(new THREE.TorusGeometry(0.38, 0.035, 10, 28));
    const chamberCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.24, 1));
    const chamberBeamGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.09, 1.75, 10));

    for (let c = 0; c < 3; c++) {
      const chAngle = (c / 3) * TWO_PI;
      const chGroup = new THREE.Group();
      chGroup.position.set(
        Math.sin(chAngle) * 1.65,
        0,
        -Math.cos(chAngle) * 1.65,
      );

      const collar = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.32, 0.4, 0.16, 12)),
        brushedBrassMat,
      );
      collar.position.y = -0.24;
      chGroup.add(collar);

      const cageMesh = new THREE.Mesh(chamberCageGeo, brushedBrassMat);
      chGroup.add(cageMesh);

      const coreMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: chamberColors[c],
          emissive: chamberColors[c],
          emissiveIntensity: 0.7,
          roughness: 0.18,
          metalness: 0.25,
        }),
      );
      const core = new THREE.Mesh(chamberCoreGeo, coreMat);
      chGroup.add(core);

      const beamMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: chamberColors[c],
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
        }),
      );
      const beamMesh = new THREE.Mesh(chamberBeamGeo, beamMat);
      beamMesh.position.set(
        -Math.sin(chAngle) * 0.75,
        0.85,
        Math.cos(chAngle) * 0.75,
      );
      beamMesh.rotation.z = Math.sin(chAngle) * 0.45;
      beamMesh.rotation.x = -Math.cos(chAngle) * 0.45;
      chGroup.add(beamMesh);

      crucibleRotor.add(chGroup);
      chamberMeshes.push({ group: chGroup, coreMat, beamMesh, beamMat, cageMesh });
    }

    // =========================================================================
    // 5. CENTRAL SINGULARITY ESCAPEMENT CORE & 12-O'CLOCK MERIDIAN GATE
    // =========================================================================
    const interactables: THREE.Object3D[] = [];

    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const solarMat = trackMat(createSolarPlasmaMaterial());
    const sunMesh = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.68, 32, 32)),
      solarMat,
    );
    coreGroup.add(sunMesh);

    const innerCage = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.92, 0.036, 12, 48)),
      brushedBrassMat,
    );
    coreGroup.add(innerCage);

    const outerCage = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(1.12, 0.03, 12, 48)),
      antiqueBronzeMat,
    );
    outerCage.rotation.x = Math.PI / 3;
    coreGroup.add(outerCage);

    // Clickable Layer-1 Proxy for Sun Core (Manual Escapement Impulse)
    const sunProxy = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(1.18, 12, 12)),
      trackMat(new THREE.MeshBasicMaterial({ visible: false })),
    );
    sunProxy.layers.set(1);
    sunProxy.userData = { kind: 'sun_core' };
    coreGroup.add(sunProxy);
    interactables.push(sunProxy);

    // 12-o'clock Golden Meridian Laser Gate & Conjunction Sector Fan (along -Z)
    const meridianGroup = new THREE.Group();
    scene.add(meridianGroup);

    const meridianBeamMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    const meridianBeam = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.028, 0.045, 4.7, 12)),
      meridianBeamMat,
    );
    meridianBeam.rotation.x = Math.PI / 2;
    meridianBeam.position.set(0, 0.02, -3.45);
    meridianGroup.add(meridianBeam);

    // Meridian North Spire Monument at (0, 0, -5.55)
    const spireGroup = new THREE.Group();
    spireGroup.position.set(0, -0.3, -5.55);
    const spireBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.3, 0.75, 8)),
      brushedBrassMat,
    );
    spireGroup.add(spireBase);
    const spireCrystal = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.22, 0.72, 6)),
      goldEmissiveMat,
    );
    spireCrystal.position.y = 0.7;
    spireGroup.add(spireCrystal);
    meridianGroup.add(spireGroup);

    // Translucent Golden Meridian Window Wedge Disc
    const meridianWedgeMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    let currentWedgeArc = 0.54;
    const meridianWedgeMesh = new THREE.Mesh(
      trackGeo(
        new THREE.RingGeometry(
          1.35,
          5.35,
          32,
          1,
          Math.PI / 2 - currentWedgeArc / 2,
          currentWedgeArc,
        ),
      ),
      meridianWedgeMat,
    );
    meridianWedgeMesh.rotation.x = -Math.PI / 2;
    meridianWedgeMesh.position.y = -0.02;
    meridianGroup.add(meridianWedgeMesh);

    // =========================================================================
    // 6. FIVE CONCENTRIC 3D GYROSCOPIC GIMBAL RINGS & PLANET ASSEMBLIES
    // =========================================================================
    interface RingVisualEntry {
      id: OrbitalRingId;
      gimbalGroup: THREE.Group;
      trackMat: THREE.MeshStandardMaterial;
      planetGroup: THREE.Group;
      planetCoreMat: THREE.MeshStandardMaterial;
      auraMesh: THREE.Mesh;
      auraMat: THREE.MeshBasicMaterial;
      eqRingMesh: THREE.Mesh;
      moonPivot: THREE.Group;
      moonMat: THREE.MeshStandardMaterial;
      trailLine: THREE.Line;
      trailPositions: Float32Array;
      currentTiltX: number;
      currentTiltZ: number;
    }

    const ringVisuals: Record<OrbitalRingId, RingVisualEntry> = {} as Record<
      OrbitalRingId,
      RingVisualEntry
    >;

    const trunnionGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10));
    const moonGeo = trackGeo(new THREE.SphereGeometry(0.075, 12, 12));

    ORBITAL_RINGS.forEach((def, idx) => {
      const gimbalGroup = new THREE.Group();
      gimbalGroup.rotation.x = def.tiltX;
      gimbalGroup.rotation.z = def.tiltZ;
      scene.add(gimbalGroup);

      const R = def.worldRadius;
      const trackMat = trackMatFn(
        new THREE.MeshStandardMaterial({
          color: 0xc89b54,
          metalness: 0.88,
          roughness: 0.28,
        }),
      );

      // Main beveled gimbal ring
      const ringTorus = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(R, 0.036, 12, 96)),
        trackMat,
      );
      ringTorus.rotation.x = Math.PI / 2;
      ringTorus.castShadow = !isSoftwareGl;
      gimbalGroup.add(ringTorus);

      // Secondary inner degree hairline ring
      const innerHairline = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(R - 0.11, 0.012, 8, 72)),
        bluedSteelMat,
      );
      innerHairline.rotation.x = Math.PI / 2;
      gimbalGroup.add(innerHairline);

      // Two opposing brass trunnion lugs + 12-o'clock Meridian strike jewel
      for (const side of [-1, 1]) {
        const lug = new THREE.Mesh(trunnionGeo, brushedBrassMat);
        lug.rotation.z = Math.PI / 2;
        lug.position.set(side * R, 0, 0);
        gimbalGroup.add(lug);
      }

      const northJewel = new THREE.Mesh(
        trackGeo(new THREE.OctahedronGeometry(0.085, 0)),
        goldEmissiveMat,
      );
      northJewel.position.set(0, 0, -R);
      gimbalGroup.add(northJewel);

      // 4-Part Composite Planet Assembly
      const planetGroup = new THREE.Group();
      const orbRadius = 0.19 + idx * 0.032;

      const planetCoreMat = trackMatFn(
        new THREE.MeshStandardMaterial({
          color: def.colorHex,
          emissive: def.colorHex,
          emissiveIntensity: 0.35,
          metalness: 0.32,
          roughness: 0.42,
        }),
      );
      const planetCore = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(orbRadius, 24, 24)),
        planetCoreMat,
      );
      planetCore.castShadow = !isSoftwareGl;
      planetGroup.add(planetCore);

      const auraMat = trackMatFn(
        new THREE.MeshBasicMaterial({
          color: def.glowHex,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        }),
      );
      const auraMesh = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(orbRadius * 1.55, 16, 16)),
        auraMat,
      );
      planetGroup.add(auraMesh);

      const eqRingMesh = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(orbRadius * 1.65, 0.022, 8, 36)),
        brushedBrassMat,
      );
      eqRingMesh.rotation.x = Math.PI * 0.38;
      planetGroup.add(eqRingMesh);

      const moonPivot = new THREE.Group();
      const moonMat = trackMatFn(
        new THREE.MeshStandardMaterial({
          color: def.glowHex,
          emissive: def.glowHex,
          emissiveIntensity: 0.6,
          roughness: 0.2,
          metalness: 0.6,
        }),
      );
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.position.set(orbRadius * 2.15, 0.06, 0);
      moonPivot.add(moonMesh);
      planetGroup.add(moonPivot);

      gimbalGroup.add(planetGroup);

      // Dynamic 3D Luminous Orbital Wake Ribbon
      const trailPositions = new Float32Array(TRAIL_POINTS * 3);
      const trailColors = new Float32Array(TRAIL_POINTS * 3);
      const baseCol = new THREE.Color(def.glowHex);
      for (let t = 0; t < TRAIL_POINTS; t++) {
        const fade = 1 - t / (TRAIL_POINTS - 1);
        trailColors[t * 3] = baseCol.r * fade;
        trailColors[t * 3 + 1] = baseCol.g * fade;
        trailColors[t * 3 + 2] = baseCol.b * fade;
      }
      const trailGeo = trackGeo(new THREE.BufferGeometry());
      trailGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(trailPositions, 3),
      );
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      const trailMat = trackMatFn(
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
        }),
      );
      const trailLine = new THREE.Line(trailGeo, trailMat);
      trailLine.frustumCulled = false;
      gimbalGroup.add(trailLine);

      ringVisuals[def.id] = {
        id: def.id,
        gimbalGroup,
        trackMat,
        planetGroup,
        planetCoreMat,
        auraMesh,
        auraMat,
        eqRingMesh,
        moonPivot,
        moonMat,
        trailLine,
        trailPositions,
        currentTiltX: def.tiltX,
        currentTiltZ: def.tiltZ,
      };
    });

    function trackMatFn<T extends THREE.Material>(m: T): T {
      materials.push(m);
      return m;
    }

    // =========================================================================
    // 7. OUTER 12 ZODIAC MONOLITH PYLONS & SYNERGY GOLDEN ARC BRIDGES
    // =========================================================================
    const ZODIAC_RADIUS = 6.08;
    const outerChapterTorus = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(ZODIAC_RADIUS, 0.055, 12, 120)),
      antiqueBronzeMat,
    );
    outerChapterTorus.rotation.x = Math.PI / 2;
    outerChapterTorus.position.y = -0.22;
    scene.add(outerChapterTorus);

    // Pre-shared module topper geometries
    const topperGeos: Record<ModuleTypeId, THREE.BufferGeometry> = {
      prism: trackGeo(new THREE.ConeGeometry(0.24, 0.46, 3)),
      mainspring: trackGeo(new THREE.TorusGeometry(0.22, 0.065, 10, 20)),
      resonator: trackGeo(new THREE.CylinderGeometry(0.08, 0.22, 0.48, 6)),
      lens: trackGeo(new THREE.TorusKnotGeometry(0.16, 0.045, 36, 8)),
      condenser: trackGeo(new THREE.OctahedronGeometry(0.25, 0)),
      chrono: trackGeo(new THREE.DodecahedronGeometry(0.23, 0)),
    };

    interface ZodiacVisualSlot {
      group: THREE.Group;
      pedestalMat: THREE.MeshStandardMaterial;
      selectHalo: THREE.Mesh;
      topperHolder: THREE.Group;
      installedType: ModuleTypeId | null;
      installedTier: number;
      topperMesh: THREE.Mesh | null;
      topperMat: THREE.MeshStandardMaterial | null;
    }

    const zodiacSlots: ZodiacVisualSlot[] = [];
    const pylonBaseGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.42, 0.62, 6));
    const pylonCapGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.32, 0.12, 6));
    const selectHaloGeo = trackGeo(new THREE.TorusGeometry(0.5, 0.032, 8, 32));
    const badgePlaneGeo = trackGeo(new THREE.PlaneGeometry(0.42, 0.42));
    const slotProxyGeo = trackGeo(new THREE.BoxGeometry(0.95, 1.45, 0.95));
    const invisibleProxyMat = trackMat(
      new THREE.MeshBasicMaterial({ visible: false }),
    );

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const a = (i / TOTAL_SLOTS) * TWO_PI;
      const sx = Math.sin(a) * ZODIAC_RADIUS;
      const sz = -Math.cos(a) * ZODIAC_RADIUS;

      const zGroup = new THREE.Group();
      zGroup.position.set(sx, -0.22, sz);
      scene.add(zGroup);

      const pedestalMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x162033,
          metalness: 0.65,
          roughness: 0.48,
        }),
      );
      const baseMesh = new THREE.Mesh(pylonBaseGeo, pedestalMat);
      baseMesh.position.y = -0.15;
      zGroup.add(baseMesh);

      const capMesh = new THREE.Mesh(pylonCapGeo, brushedBrassMat);
      capMesh.position.y = 0.22;
      zGroup.add(capMesh);

      // Branch Character Plaque facing upward/outward
      const badgeTex = trackTex(
        createBranchBadgeTexture(ZODIAC_PALACES[i].branch, i === 0, maxAniso),
      );
      const badgeMesh = new THREE.Mesh(
        badgePlaneGeo,
        trackMat(
          new THREE.MeshBasicMaterial({
            map: badgeTex,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        ),
      );
      badgeMesh.rotation.x = -Math.PI / 2;
      badgeMesh.position.y = 0.295;
      zGroup.add(badgeMesh);

      const selectHalo = new THREE.Mesh(selectHaloGeo, goldEmissiveMat);
      selectHalo.rotation.x = Math.PI / 2;
      selectHalo.position.y = 0.28;
      selectHalo.visible = false;
      zGroup.add(selectHalo);

      const topperHolder = new THREE.Group();
      topperHolder.position.y = 0.72;
      zGroup.add(topperHolder);

      // Layer-1 Raycast Proxy
      const proxy = new THREE.Mesh(slotProxyGeo, invisibleProxyMat);
      proxy.position.y = 0.35;
      proxy.layers.set(1);
      proxy.userData = { kind: 'zodiac_slot', slotIndex: i };
      zGroup.add(proxy);
      interactables.push(proxy);

      zodiacSlots.push({
        group: zGroup,
        pedestalMat,
        selectHalo,
        topperHolder,
        installedType: null,
        installedTier: 0,
        topperMesh: null,
        topperMat: null,
      });
    }

    // 12 Pre-built Golden Synergy Arc Conduits between adjacent Zodiac Pylons
    const synergyBridgeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.4,
        metalness: 0.6,
        roughness: 0.2,
      }),
    );
    const synergyBridges: THREE.Mesh[] = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const next = (i + 1) % TOTAL_SLOTS;
      const a0 = (i / TOTAL_SLOTS) * TWO_PI;
      const a1 = (next / TOTAL_SLOTS) * TWO_PI;
      const p0 = new THREE.Vector3(
        Math.sin(a0) * ZODIAC_RADIUS,
        0.35,
        -Math.cos(a0) * ZODIAC_RADIUS,
      );
      const p2 = new THREE.Vector3(
        Math.sin(a1) * ZODIAC_RADIUS,
        0.35,
        -Math.cos(a1) * ZODIAC_RADIUS,
      );
      const mid = p0.clone().add(p2).multiplyScalar(0.5);
      mid.y += 0.58;
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
      const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 18, 0.036, 8, false));
      const bridge = new THREE.Mesh(tubeGeo, synergyBridgeMat);
      bridge.visible = false;
      scene.add(bridge);
      synergyBridges.push(bridge);
    }

    // =========================================================================
    // 8. 3D CATCHABLE GOLDEN COMET & POOLED SHOCKWAVES / SYZYGY LASERS
    // =========================================================================
    const cometGroup = new THREE.Group();
    cometGroup.visible = false;
    scene.add(cometGroup);

    const cometHead = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.26, 1)),
      goldEmissiveMat,
    );
    cometGroup.add(cometHead);

    const cometHalo = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.46, 14, 14)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      ),
    );
    cometGroup.add(cometHalo);

    const cometTail = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.24, 1.85, 12, 1, true)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.48,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    cometTail.position.set(0, -0.95, 0);
    cometGroup.add(cometTail);

    const cometProxy = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(1.05, 10, 10)),
      invisibleProxyMat,
    );
    cometProxy.layers.set(1);
    cometProxy.userData = { kind: 'golden_comet' };
    cometGroup.add(cometProxy);
    interactables.push(cometProxy);

    // Pooled 3D Expanding Shockwave Tori (Zero runtime allocation)
    const shockGeo = trackGeo(new THREE.TorusGeometry(1, 0.045, 8, 64));
    interface PooledShockwave {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      active: boolean;
      age: number;
      duration: number;
      startScale: number;
      endScale: number;
    }
    const shockwaves: PooledShockwave[] = [];
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const mesh = new THREE.Mesh(shockGeo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      shockwaves.push({
        mesh,
        mat,
        active: false,
        age: 0,
        duration: 0.9,
        startScale: 0.8,
        endScale: 5.5,
      });
    }

    let shockCursor = 0;
    const spawnShockwave = (
      colorHex: number,
      endScale: number,
      duration = 0.85,
      yOffset = 0,
    ) => {
      const sw = shockwaves[shockCursor % SHOCKWAVE_POOL_SIZE];
      shockCursor++;
      sw.active = true;
      sw.age = 0;
      sw.duration = duration;
      sw.startScale = 0.85;
      sw.endScale = endScale;
      sw.mat.color.setHex(colorHex);
      sw.mesh.position.set(0, yOffset, 0);
      sw.mesh.visible = true;
    };

    // Pooled Syzygy Core-to-Planet Laser Beams (5 max)
    const beamUnitGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 1, 8));
    interface PooledLaser {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      life: number;
    }
    const syzygyLasers: PooledLaser[] = [];
    for (let i = 0; i < 5; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const mesh = new THREE.Mesh(beamUnitGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      syzygyLasers.push({ mesh, mat, life: 0 });
    }

    const firePlanetLaser = (slotIdx: number, targetWorld: THREE.Vector3, colHex: number) => {
      const lz = syzygyLasers[slotIdx % 5];
      const dist = targetWorld.length();
      if (dist < 0.1) return;
      lz.life = 0.55;
      lz.mat.color.setHex(colHex);
      lz.mat.opacity = 0.9;
      lz.mesh.visible = true;
      _vec3Mid.copy(targetWorld).multiplyScalar(0.5);
      lz.mesh.position.copy(_vec3Mid);
      lz.mesh.scale.set(1, dist, 1);
      _vec3B.copy(targetWorld).normalize();
      _quat.setFromUnitVectors(_upAxis, _vec3B);
      lz.mesh.quaternion.copy(_quat);
    };

    // =========================================================================
    // 9. POINTER RAYCASTING (Restricted to Layer 1 Proxies)
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    let downX = 0;
    let downY = 0;
    let lastHoverTime = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isTitleScreenRef.current) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 7) return; // Ignore camera orbit drags

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length === 0) return;

      for (const hit of hits) {
        const ud = hit.object.userData;
        if (ud.kind === 'golden_comet' && runRef.current.comet.active) {
          onCatchCometRef.current();
          return;
        }
        if (ud.kind === 'sun_core') {
          onCenterImpulseRef.current();
          return;
        }
        if (ud.kind === 'zodiac_slot' && typeof ud.slotIndex === 'number') {
          onSelectSlotRef.current(ud.slotIndex);
          return;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isTitleScreenRef.current) return;
      const now = performance.now();
      if (now - lastHoverTime < 65) return;
      lastHoverTime = now;

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      const validHit = hits.some(
        (h) =>
          h.object.userData.kind !== 'golden_comet' ||
          runRef.current.comet.active,
      );
      renderer.domElement.style.cursor = validHit ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // ResizeObserver with >= 1px guard
    let lastW = initW;
    let lastH = initH;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      if (Math.abs(w - lastW) < 1 && Math.abs(h - lastH) < 1) return;
      lastW = w;
      lastH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    });
    ro.observe(container);

    // Pre-warm shaders on GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // =========================================================================
    // 10. ANIMATION & SIMULATION LOOP WITH MANDATORY SOFTWARE-GL FENCESYNC
    // =========================================================================
    let frameId = 0;
    let disposed = false;
    let lastTimeMs = performance.now();
    let elapsedTotal = 0;
    let wasTitle = isTitleScreenRef.current;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync
        ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const nowMs = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;
      elapsedTotal += rawDt;

      const state = runRef.current;
      const meta = metaRef.current;
      const isTitle = isTitleScreenRef.current;

      // Smoothly transition to overview preset when exiting Title Screen
      if (wasTitle && !isTitle) {
        const cfg = CAMERA_TARGETS[cameraPreset];
        presetTargetRef.current.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        presetTargetRef.current.target.set(
          cfg.target[0],
          cfg.target[1],
          cfg.target[2],
        );
        presetTargetRef.current.active = true;
      }
      wasTitle = isTitle;

      // Advance simulation when playing
      if (!pausedRef.current && !isTitle) {
        const ev = stepOrrery(state, meta, rawDt);
        if (
          ev.meridianStrikes.length > 0 ||
          ev.syzygy ||
          ev.eraUnlocked ||
          ev.tutorialCompletedStep !== null ||
          ev.unlockedAchievements.length > 0 ||
          ev.cometAutoCaptured ||
          ev.automatorTriggeredRuleId !== null ||
          ev.automatorAscended !== null
        ) {
          onStepEventsRef.current(ev);
        }

        if (ev.supernovaTriggeredByAuto) {
          spawnShockwave(0x38bdf8, 6.4, 1.05, 0);
          traumaRef.current = Math.min(1, traumaRef.current + 0.45);
        }

        if (ev.syzygy) {
          spawnShockwave(0xfde047, 5.8, 0.95, 0);
          traumaRef.current = Math.min(1, traumaRef.current + 0.38);
          let beamIdx = 0;
          for (const rid of RING_ORDER) {
            if (!state.rings[rid].unlocked) continue;
            if (
              angularDistanceToZero(state.rings[rid].angle) <=
              getSyzygyWindowRad(state, meta, rid)
            ) {
              ringVisuals[rid].planetGroup.getWorldPosition(_vec3A);
              firePlanetLaser(beamIdx++, _vec3A, 0xfef08a);
            }
          }
        } else if (ev.meridianStrikes.length > 0) {
          spawnShockwave(0xf59e0b, 3.2, 0.55, 0);
        }
      }

      // Consume imperative UI bursts
      while (pendingBurstsRef.current.length > 0) {
        const b = pendingBurstsRef.current.shift()!;
        if (b.kind === 'supernova') {
          spawnShockwave(0x38bdf8, 6.6, 1.1, 0);
          spawnShockwave(0xf59e0b, 5.0, 0.8, -1.2);
          traumaRef.current = Math.min(1, traumaRef.current + 0.5);
        } else if (b.kind === 'perfect_impulse') {
          spawnShockwave(0xfef08a, 4.8, 0.75, 0);
          traumaRef.current = Math.min(1, traumaRef.current + 0.25);
        } else if (b.kind === 'impulse') {
          spawnShockwave(0xd97706, 2.8, 0.5, 0);
        } else if (b.kind === 'comet' || b.kind === 'ascension') {
          spawnShockwave(0x818cf8, 6.8, 1.15, 0);
          traumaRef.current = Math.min(1, traumaRef.current + 0.45);
        }
      }

      // Camera Choreography: Title Orbit Tour vs Smooth Damped Presets vs Manual OrbitControls
      if (isTitle) {
        const tourAngle = elapsedTotal * 0.18;
        const tx = Math.sin(tourAngle) * 9.8 + 1.8;
        const tz = Math.cos(tourAngle) * 9.8;
        const ty = 5.4 + Math.sin(elapsedTotal * 0.35) * 1.1;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, tx, 3.5, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, ty, 3.5, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, tz, 3.5, rawDt);
        controls.target.set(-1.9, -0.25, 0);
        camera.lookAt(controls.target);
      } else if (presetTargetRef.current.active) {
        const goalP = presetTargetRef.current.pos;
        const goalT = presetTargetRef.current.target;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, goalP.x, 5.2, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, goalP.y, 5.2, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, goalP.z, 5.2, rawDt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, goalT.x, 5.2, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, goalT.y, 5.2, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, goalT.z, 5.2, rawDt);
        if (
          camera.position.distanceToSquared(goalP) < 0.002 &&
          controls.target.distanceToSquared(goalT) < 0.002
        ) {
          camera.position.copy(goalP);
          controls.target.copy(goalT);
          presetTargetRef.current.active = false;
        }
        controls.update();
      } else {
        controls.update();
      }

      // Subtle decaying trauma shake on Syzygy / Supernova
      if (traumaRef.current > 0.001) {
        const shake = traumaRef.current * traumaRef.current * 0.06;
        camera.position.y += Math.sin(elapsedTotal * 47) * shake;
        traumaRef.current = Math.max(0, traumaRef.current - rawDt * 1.9);
      }

      // Update Starfield slow celestial drift
      starMesh.rotation.y = elapsedTotal * 0.012;

      // Update Sun Shader & Core Escapement Cages
      solarMat.uniforms.uTime.value = elapsedTotal;
      solarMat.uniforms.uPrime.value = state.primeIgnited ? 1.0 : 0.0;
      solarMat.uniforms.uSupernova.value =
        state.crucible.supernovaSecondsLeft > 0 ? 1.0 : 0.0;

      const coreSpeed = 0.6 + state.impulseBoost * 1.4;
      innerCage.rotation.y += rawDt * coreSpeed;
      innerCage.rotation.x += rawDt * coreSpeed * 0.45;
      outerCage.rotation.z -= rawDt * coreSpeed * 0.7;
      outerCage.rotation.y -= rawDt * coreSpeed * 0.35;
      sunPointLight.intensity =
        5.2 +
        (state.frenzySecondsLeft > 0 ? 2.5 : 0) +
        (state.crucible.supernovaSecondsLeft > 0 ? 3.0 : 0);

      // Update Meridian Window Wedge Arc dynamically if changed significantly
      const winArc = getSyzygyWindowRad(state, meta) * 2;
      if (Math.abs(winArc - currentWedgeArc) > 0.04) {
        currentWedgeArc = winArc;
        const oldGeo = meridianWedgeMesh.geometry;
        const newGeo = new THREE.RingGeometry(
          1.35,
          5.35,
          32,
          1,
          Math.PI / 2 - currentWedgeArc / 2,
          currentWedgeArc,
        );
        meridianWedgeMesh.geometry = newGeo;
        oldGeo.dispose();
      }
      meridianBeamMat.opacity =
        state.crucible.supernovaSecondsLeft > 0 ? 0.96 : 0.75;

      // Update Alchemical Crucible Rotor & Chambers
      const totalCrucibleLv =
        state.crucible.chambers.fusion +
        state.crucible.chambers.dilation +
        state.crucible.chambers.crystallizer;
      crucibleRotor.rotation.y +=
        rawDt * (0.28 + totalCrucibleLv * 0.06 + (state.crucible.supernovaSecondsLeft > 0 ? 1.2 : 0));
      cruciblePointLight.intensity = 2.6 + Math.min(5.0, totalCrucibleLv * 0.4);

      const chLevels = [
        state.crucible.chambers.fusion,
        state.crucible.chambers.dilation,
        state.crucible.chambers.crystallizer,
      ];
      for (let c = 0; c < 3; c++) {
        const cm = chamberMeshes[c];
        const lv = chLevels[c];
        cm.cageMesh.rotation.x += rawDt * (0.8 + lv * 0.25);
        cm.cageMesh.rotation.y += rawDt * 0.6;
        cm.coreMat.emissiveIntensity =
          0.55 + Math.min(2.2, lv * 0.3) + (state.crucible.supernovaSecondsLeft > 0 ? 1.0 : 0);
        const targetBeamOpacity =
          lv > 0 || state.crucible.supernovaSecondsLeft > 0
            ? Math.min(0.68, 0.16 + lv * 0.09 + (state.crucible.supernovaSecondsLeft > 0 ? 0.35 : 0))
            : 0.04;
        cm.beamMat.opacity = targetBeamOpacity;
      }

      // Update 5 Concentric 3D Gimbal Rings & Planets
      const use3dTilt = gimbal3dModeRef.current;
      ORBITAL_RINGS.forEach((def, idx) => {
        const rState = state.rings[def.id];
        const vis = ringVisuals[def.id];

        // On Title Screen, showcase 4 rings spinning majestically even on a fresh save
        const visibleUnlocked = isTitle ? idx < 4 : rState.unlocked;
        vis.gimbalGroup.visible = visibleUnlocked;
        if (!visibleUnlocked) return;

        const angle = isTitle
          ? (elapsedTotal * def.baseOmega * 0.65 + idx * 1.1) % TWO_PI
          : rState.angle;

        // Coplanar alignment near 0° Meridian so Syzygies physically lock into the laser gate!
        const distZero = angularDistanceToZero(angle);
        const coplanarBlend =
          !use3dTilt || state.crucible.supernovaSecondsLeft > 0
            ? 0
            : THREE.MathUtils.smoothstep(distZero, 0.12, 0.95);
        const precession = Math.sin(elapsedTotal * 0.28 + idx * 1.3) * 0.06;
        const desiredTiltX = (def.tiltX + precession) * coplanarBlend;
        const desiredTiltZ = (def.tiltZ - precession * 0.8) * coplanarBlend;

        vis.currentTiltX = THREE.MathUtils.damp(
          vis.currentTiltX,
          desiredTiltX,
          6.0,
          rawDt,
        );
        vis.currentTiltZ = THREE.MathUtils.damp(
          vis.currentTiltZ,
          desiredTiltZ,
          6.0,
          rawDt,
        );
        vis.gimbalGroup.rotation.x = vis.currentTiltX;
        vis.gimbalGroup.rotation.z = vis.currentTiltZ;

        const R = def.worldRadius;
        const px = Math.sin(angle) * R;
        const pz = -Math.cos(angle) * R;
        vis.planetGroup.position.set(px, 0, pz);

        // Strike flash & gear mode visual signature
        const sinceStrike = isTitle ? 99 : state.runSeconds - rState.lastStrikeAt;
        const strikeGlow =
          sinceStrike >= 0 && sinceStrike < 0.35 ? (1 - sinceStrike / 0.35) * 1.4 : 0;
        vis.planetCoreMat.emissiveIntensity = 0.35 + strikeGlow;
        vis.auraMat.opacity = 0.22 + strikeGlow * 0.35;
        const pulseScale = 1 + strikeGlow * 0.28;
        vis.auraMesh.scale.set(pulseScale, pulseScale, pulseScale);

        const moonSpeed =
          rState.gearMode === 'blitz'
            ? 5.5
            : rState.gearMode === 'syzygy'
              ? 3.0
              : 1.8;
        vis.moonPivot.rotation.y += rawDt * moonSpeed;
        vis.eqRingMesh.rotation.z += rawDt * 1.2;

        // Update 3D trailing ribbon arc in-place (Zero GC)
        const arcSpan = 0.62 + (rState.gearMode === 'blitz' ? 0.28 : 0);
        const posArr = vis.trailPositions;
        for (let t = 0; t < TRAIL_POINTS; t++) {
          const frac = t / (TRAIL_POINTS - 1);
          const a = angle - frac * arcSpan;
          posArr[t * 3] = Math.sin(a) * R;
          posArr[t * 3 + 1] = 0;
          posArr[t * 3 + 2] = -Math.cos(a) * R;
        }
        vis.trailLine.geometry.attributes.position.needsUpdate = true;
      });

      // Update 12 Zodiac Monolith Pylons & Golden Synergy Conduits
      const selSlot = selectedSlotRef.current;
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        const zv = zodiacSlots[i];
        const unlocked = isTitle ? i % 3 === 0 : isSlotUnlocked(state, i);
        zv.pedestalMat.color.setHex(unlocked ? 0x1c2b45 : 0x0c1220);
        zv.selectHalo.visible = !isTitle && selSlot === i;

        const mod = isTitle
          ? i === 0
            ? { typeId: 'prism' as ModuleTypeId, tier: 2 }
            : i === 3
              ? { typeId: 'resonator' as ModuleTypeId, tier: 2 }
              : null
          : state.slots[i];

        if (!mod) {
          if (zv.topperMesh) {
            zv.topperHolder.remove(zv.topperMesh);
            zv.topperMat?.dispose();
            zv.topperMesh = null;
            zv.topperMat = null;
            zv.installedType = null;
            zv.installedTier = 0;
          }
        } else {
          if (zv.installedType !== mod.typeId) {
            if (zv.topperMesh) {
              zv.topperHolder.remove(zv.topperMesh);
              zv.topperMat?.dispose();
            }
            const mDef = MODULES_BY_ID[mod.typeId];
            const tMat = new THREE.MeshStandardMaterial({
              color: mDef.accentHex,
              emissive: mDef.accentHex,
              emissiveIntensity: 0.75,
              metalness: 0.45,
              roughness: 0.22,
            });
            const tMesh = new THREE.Mesh(topperGeos[mod.typeId], tMat);
            zv.topperHolder.add(tMesh);
            zv.topperMesh = tMesh;
            zv.topperMat = tMat;
            zv.installedType = mod.typeId;
          }
          zv.installedTier = mod.tier;
          const sc = 0.9 + (mod.tier - 1) * 0.14;
          zv.topperHolder.scale.set(sc, sc, sc);
          zv.topperHolder.rotation.y = elapsedTotal * 1.4 + i;
          zv.topperHolder.position.y =
            0.74 + Math.sin(elapsedTotal * 2.2 + i) * 0.06;
        }

        // Adjacent Synergy Bridge check
        const nextIdx = (i + 1) % TOTAL_SLOTS;
        const modA = state.slots[i]?.typeId;
        const modB = state.slots[nextIdx]?.typeId;
        synergyBridges[i].visible =
          !isTitle && areModulesSynergistic(modA, modB);
      }

      // Update 3D Golden Comet flight path
      if (!isTitle && state.comet.active) {
        cometGroup.visible = true;
        const p = state.comet.progress;
        const curA = THREE.MathUtils.lerp(
          state.comet.startAngle,
          state.comet.endAngle,
          p,
        );
        const nextA = THREE.MathUtils.lerp(
          state.comet.startAngle,
          state.comet.endAngle,
          Math.min(1, p + 0.02),
        );
        const arcHeight = Math.sin(p * Math.PI) * 2.2 + 0.65;
        const cRad = 5.4 - Math.sin(p * Math.PI) * 1.35;

        _vec3A.set(Math.sin(curA) * cRad, arcHeight, -Math.cos(curA) * cRad);
        const nextH = Math.sin(Math.min(1, p + 0.02) * Math.PI) * 2.2 + 0.65;
        const nextR = 5.4 - Math.sin(Math.min(1, p + 0.02) * Math.PI) * 1.35;
        _vec3B
          .set(Math.sin(nextA) * nextR, nextH, -Math.cos(nextA) * nextR)
          .sub(_vec3A)
          .normalize();

        cometGroup.position.copy(_vec3A);
        _quat.setFromUnitVectors(_upAxis, _vec3B);
        cometGroup.quaternion.copy(_quat);
        cometHead.rotation.y += rawDt * 5.0;
      } else {
        cometGroup.visible = false;
      }

      // Update Pooled Shockwaves & Syzygy Lasers
      for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
        const sw = shockwaves[i];
        if (!sw.active) continue;
        sw.age += rawDt;
        if (sw.age >= sw.duration) {
          sw.active = false;
          sw.mesh.visible = false;
        } else {
          const t = sw.age / sw.duration;
          const ease = 1 - Math.pow(1 - t, 3);
          const s = THREE.MathUtils.lerp(sw.startScale, sw.endScale, ease);
          sw.mesh.scale.set(s, s, 1);
          sw.mat.opacity = (1 - t) * 0.72;
        }
      }

      for (let i = 0; i < syzygyLasers.length; i++) {
        const lz = syzygyLasers[i];
        if (lz.life <= 0) continue;
        lz.life -= rawDt;
        if (lz.life <= 0) {
          lz.mesh.visible = false;
        } else {
          lz.mat.opacity = (lz.life / 0.55) * 0.88;
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);

      for (const zv of zodiacSlots) {
        zv.topperMat?.dispose();
      }
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-[#060A14]"
    />
  );
});
