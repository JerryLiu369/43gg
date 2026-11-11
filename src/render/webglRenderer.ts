import type {
  CameraMode,
  CarPhysicsState,
  GhostSample,
  StageDefinition,
  TimeOfDay,
  WeatherType,
} from '../game/types.ts';
import {
  type Mat4,
  composeTransformMat4,
  createMat4,
  lookAtMat4,
  multiplyMat4,
  perspectiveMat4,
} from './math3d.ts';
import {
  DynamicMeshBuilder,
  FLOATS_PER_VERTEX,
  buildBrakeGlowMesh,
  buildCarContactShadowMesh,
  buildCockpitInteriorMesh,
  buildExhaustBackfireMesh,
  buildHoodCameraMesh,
  buildRallyCarChassisMesh,
  buildStageStaticMesh,
  buildSteeringWheelAndHandsMesh,
  buildWheelMesh,
} from './meshBuilder.ts';

// ============================================================================
// PROCEDURAL ATMOSPHERIC SKY, SUN/MOON, CLOUDS & ALPINE HORIZON SHADER
// ============================================================================
const SKY_VERTEX_SHADER_SRC = `
attribute vec2 aSkyScreenPos;
varying vec2 vScreenUv;
void main() {
  vScreenUv = aSkyScreenPos;
  gl_Position = vec4(aSkyScreenPos, 0.999, 1.0);
}
`;

const SKY_FRAGMENT_SHADER_SRC = `
precision mediump float;

varying vec2 vScreenUv;

uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;
uniform float uAspect;

uniform vec3 uSkyZenith;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uCloudDensity;
uniform float uIsNight;
uniform float uTimeSec;

float skyHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = skyHash(i);
  float b = skyHash(i + vec2(1.0, 0.0));
  float c = skyHash(i + vec2(0.0, 1.0));
  float d = skyHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float ridgeHeight(float az, float seed, float scale) {
  float h = sin(az * 3.0 + seed) * 0.42
          + sin(az * 7.0 - seed * 1.7) * 0.28
          + cos(az * 13.0 + seed * 2.3) * 0.16
          + sin(az * 23.0 - seed * 0.9) * 0.08;
  return max(0.0, (h * 0.5 + 0.46) * scale);
}

void main() {
  vec3 ray = normalize(
    uCamForward +
    uCamRight * (vScreenUv.x * uAspect * uTanHalfFov) +
    uCamUp * (vScreenUv.y * uTanHalfFov)
  );

  float elev = clamp(ray.y, -0.25, 1.0);
  float skyT = pow(clamp(elev, 0.0, 1.0), 0.58);
  vec3 col = mix(uFogColor, uSkyZenith, skyT);

  // Warm/cool atmospheric horizon band & Mie sun/moon halo
  float sunCos = max(dot(ray, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sunCos, 7.0) * 0.28;
  // Crisp solar / lunar disc
  float disc = smoothstep(0.9982, 0.9993, sunCos);
  col += uSunColor * disc * (uIsNight > 0.5 ? 2.4 : 1.6);

  // Night starfield above horizon
  if (uIsNight > 0.5 && elev > 0.06) {
    vec2 starCell = floor(vec2(atan(ray.x, ray.z) * 95.0, elev * 150.0));
    float st = skyHash(starCell);
    if (st > 0.992) {
      float twinkle = 0.65 + 0.35 * sin(uTimeSec * 3.2 + st * 80.0);
      col += vec3(0.80, 0.88, 1.0) * twinkle * smoothstep(0.06, 0.26, elev);
    }
  }

  // Procedural drifting cloud deck
  if (elev > 0.03) {
    vec2 cloudUv = ray.xz / (elev + 0.16) * 0.85 + vec2(uTimeSec * 0.008, uTimeSec * 0.004);
    float n = skyNoise(cloudUv * 2.2) * 0.65 + skyNoise(cloudUv * 5.1) * 0.35;
    float cloudMask = smoothstep(0.56 - uCloudDensity * 0.22, 0.86, n) * smoothstep(0.03, 0.22, elev);
    vec3 cloudLit = mix(uFogColor * 0.92, uFogColor * 1.18 + uSunColor * 0.22, n);
    col = mix(col, cloudLit, cloudMask * 0.72);
  }

  // Dual-layer 360-degree Alpine Horizon Mountain Silhouettes (fading cleanly into horizon fog)
  float az = atan(ray.x, ray.z);
  float farPeak = ridgeHeight(az, 1.4, 0.145);
  float nearPeak = ridgeHeight(az + 1.9, 4.2, 0.092);

  if (elev < farPeak) {
    vec3 farMtnCol = mix(uFogColor * 0.74, uSkyZenith * 0.68, 0.35);
    float haze = smoothstep(-0.02, farPeak, elev);
    col = mix(farMtnCol, uFogColor, 0.58 + 0.22 * haze);
  }
  if (elev < nearPeak) {
    vec3 nearMtnCol = uFogColor * 0.60;
    col = mix(nearMtnCol, uFogColor, 0.38);
  }

  // Below horizon ground skirt blends smoothly to fogColor so zero seam ever shows
  if (elev < 0.0) {
    col = mix(col, uFogColor * 0.75, clamp(-elev * 5.0, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// MAIN 3D WORLD & VEHICLE SHADER
// ============================================================================
const VERTEX_SHADER_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aMatType;

uniform mat4 uViewProj;
uniform mat4 uModel;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMatType;

void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal);
  vColor = aColor;
  vMatType = aMatType;
  gl_Position = uViewProj * worldPos;
}
`;

const FRAGMENT_SHADER_SRC = `
precision mediump float;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMatType;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;

uniform vec3 uHeadlightPos;
uniform vec3 uHeadlightDir;
uniform float uHeadlightIntensity;
uniform float uAlpha;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float dist = length(vWorldPos - uCamPos);

  // Unlit atmospheric particle / contact shadow (matType == 6): never darkens into black cubes!
  if (vMatType > 5.5) {
    float fogFactor = clamp(exp(-dist * uFogDensity), 0.0, 1.0);
    vec3 col = mix(uFogColor, vColor, fogFactor);
    gl_FragColor = vec4(col, uAlpha);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 baseColor = vColor;

  // Procedural high-frequency surface micro-detail on Road & Terrain
  if (vMatType > 0.5 && vMatType < 1.5) {
    float grainFine = hash21(floor(vWorldPos.xz * 14.0));
    float grainCoarse = hash21(floor(vWorldPos.xz * 2.5));
    baseColor *= 0.88 + 0.22 * grainFine * 0.65 + 0.12 * grainCoarse;
  } else if (vMatType < 0.5) {
    float grassNoise = hash21(floor(vWorldPos.xz * 3.5));
    baseColor *= 0.90 + 0.18 * grassNoise;
  }

  // Emissive material (lamps, brake lights, ghost car, shift LEDs, anti-lag flames)
  if (vMatType > 2.5 && vMatType < 3.5) {
    float fogFactor = clamp(exp(-dist * uFogDensity * 0.55), 0.0, 1.0);
    vec3 col = mix(uFogColor, baseColor * 1.28, fogFactor);
    gl_FragColor = vec4(col, uAlpha);
    return;
  }

  // Hemisphere ambient + Directional Sun/Moon diffuse
  float hemiBlend = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uGroundAmbient, uSkyAmbient, hemiBlend);
  float ndotl = max(dot(N, uSunDir), 0.0);
  vec3 diffuse = uSunColor * ndotl;

  // Specular highlights for glossy car paint (matType=2) or ice/water (matType=5)
  vec3 H = normalize(uSunDir + V);
  float specPower = (vMatType > 4.5) ? 48.0 : (vMatType > 1.5 && vMatType < 2.5) ? 30.0 : 8.0;
  float specStrength = (vMatType > 4.5) ? 0.55 : (vMatType > 1.5 && vMatType < 2.5) ? 0.40 : 0.06;
  float spec = pow(max(dot(N, H), 0.0), specPower) * specStrength;

  // Dual Rally Headlight Cone Illumination
  vec3 headlightContrib = vec3(0.0);
  if (uHeadlightIntensity > 0.01) {
    vec3 toFrag = vWorldPos - uHeadlightPos;
    float dLight = length(toFrag);
    if (dLight < 140.0 && dLight > 0.5) {
      vec3 L = toFrag / dLight;
      float spotCos = dot(L, uHeadlightDir);
      if (spotCos > 0.72) {
        float spotCone = smoothstep(0.72, 0.96, spotCos);
        float atten = 1.0 / (1.0 + dLight * 0.018 + dLight * dLight * 0.00036);
        float hNdotL = max(dot(N, -L), 0.24);
        float retroBoost = (vMatType > 3.5 && vMatType < 4.5) ? 4.4 : 1.0;
        headlightContrib = vec3(1.0, 0.95, 0.84) * spotCone * atten * hNdotL * uHeadlightIntensity * retroBoost * 2.4;
      }
    }
  }

  vec3 litColor = baseColor * (ambient + diffuse) + vec3(spec) + baseColor * headlightContrib;

  // Distance exponential horizon fog + gentle ACES-like highlight roll-off
  float fogFactor = clamp(exp(-dist * uFogDensity), 0.0, 1.0);
  vec3 finalColor = mix(uFogColor, litColor, fogFactor);
  finalColor = finalColor / (1.0 + finalColor * 0.16);

  gl_FragColor = vec4(finalColor, uAlpha);
}
`;

interface Particle {
  active: boolean;
  isStreak: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  age: number;
  maxAge: number;
  r: number;
  g: number;
  b: number;
}

interface SoftTriangle {
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
  sx2: number;
  sy2: number;
  depth: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

interface AtmosphereEnv {
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  skyZenith: [number, number, number];
  skyAmb: [number, number, number];
  gndAmb: [number, number, number];
  fogColor: [number, number, number];
  fogDensity: number;
  cloudDensity: number;
  isNight: number;
  headlightIntensity: number;
}

const MAX_PARTICLES = 220;
const MAX_SOFT_TRIS = 3400;

function acquireWebGLContext(
  canvas: HTMLCanvasElement,
  isHeadless: boolean
): WebGLRenderingContext | null {
  const attrs: WebGLContextAttributes = {
    antialias: !isHeadless,
    alpha: false,
    depth: true,
    preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: false,
  };
  const fallbackAttrs: WebGLContextAttributes = {
    alpha: false,
    depth: true,
    failIfMajorPerformanceCaveat: false,
  };
  const names = ['webgl2', 'webgl', 'experimental-webgl'] as const;

  for (const name of names) {
    try {
      const ctx = canvas.getContext(name, attrs) as WebGLRenderingContext | null;
      if (ctx) return ctx;
    } catch {
      // try next
    }
  }
  for (const name of names) {
    try {
      const ctx = canvas.getContext(name, fallbackAttrs) as WebGLRenderingContext | null;
      if (ctx) return ctx;
    } catch {
      // try next
    }
  }
  for (const name of names) {
    try {
      const ctx = canvas.getContext(name) as WebGLRenderingContext | null;
      if (ctx) return ctx;
    } catch {
      // try next
    }
  }
  return null;
}

export class RallyWebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private skyProgram: WebGLProgram | null = null;
  private isHeadless: boolean;

  // Main World Shader Locations
  private aPosLoc = -1;
  private aNormalLoc = -1;
  private aColorLoc = -1;
  private aMatTypeLoc = -1;

  private uViewProjLoc: WebGLUniformLocation | null = null;
  private uModelLoc: WebGLUniformLocation | null = null;
  private uCamPosLoc: WebGLUniformLocation | null = null;
  private uSunDirLoc: WebGLUniformLocation | null = null;
  private uSunColorLoc: WebGLUniformLocation | null = null;
  private uSkyAmbientLoc: WebGLUniformLocation | null = null;
  private uGroundAmbientLoc: WebGLUniformLocation | null = null;
  private uFogColorLoc: WebGLUniformLocation | null = null;
  private uFogDensityLoc: WebGLUniformLocation | null = null;
  private uHeadlightPosLoc: WebGLUniformLocation | null = null;
  private uHeadlightDirLoc: WebGLUniformLocation | null = null;
  private uHeadlightIntensityLoc: WebGLUniformLocation | null = null;
  private uAlphaLoc: WebGLUniformLocation | null = null;

  // Sky Shader Locations & Fullscreen Quad Buffer
  private skyQuadBuffer: WebGLBuffer | null = null;
  private aSkyScreenPosLoc = -1;
  private uSkyCamForwardLoc: WebGLUniformLocation | null = null;
  private uSkyCamRightLoc: WebGLUniformLocation | null = null;
  private uSkyCamUpLoc: WebGLUniformLocation | null = null;
  private uSkyTanHalfFovLoc: WebGLUniformLocation | null = null;
  private uSkyAspectLoc: WebGLUniformLocation | null = null;
  private uSkyZenithLoc: WebGLUniformLocation | null = null;
  private uSkyFogColorLoc: WebGLUniformLocation | null = null;
  private uSkySunDirLoc: WebGLUniformLocation | null = null;
  private uSkySunColorLoc: WebGLUniformLocation | null = null;
  private uSkyCloudDensityLoc: WebGLUniformLocation | null = null;
  private uSkyIsNightLoc: WebGLUniformLocation | null = null;
  private uSkyTimeSecLoc: WebGLUniformLocation | null = null;

  // CPU Mesh Data
  private stageMeshData: Float32Array = new Float32Array(0);
  private carChassisData: Float32Array;
  private contactShadowData: Float32Array;
  private brakeGlowData: Float32Array;
  private exhaustBackfireData: Float32Array;
  private ghostCarData: Float32Array;
  private wheelData: Float32Array;
  private cockpitInteriorData: Float32Array;
  private hoodCameraData: Float32Array;
  private steeringWheelData: Float32Array;

  // Static & dynamic GPU buffers
  private stageBuffer: WebGLBuffer | null = null;
  private stageVertexCount = 0;
  private currentStageId = '';

  private carChassisBuffer: WebGLBuffer | null = null;
  private carChassisVertexCount = 0;

  private contactShadowBuffer: WebGLBuffer | null = null;
  private contactShadowVertexCount = 0;

  private brakeGlowBuffer: WebGLBuffer | null = null;
  private brakeGlowVertexCount = 0;

  private exhaustBackfireBuffer: WebGLBuffer | null = null;
  private exhaustBackfireVertexCount = 0;

  private ghostCarBuffer: WebGLBuffer | null = null;
  private ghostCarVertexCount = 0;

  private wheelBuffer: WebGLBuffer | null = null;
  private wheelVertexCount = 0;

  private cockpitInteriorBuffer: WebGLBuffer | null = null;
  private cockpitInteriorVertexCount = 0;

  private hoodCameraBuffer: WebGLBuffer | null = null;
  private hoodCameraVertexCount = 0;

  private steeringWheelBuffer: WebGLBuffer | null = null;
  private steeringWheelVertexCount = 0;

  private particleBuffer: WebGLBuffer | null = null;
  private particleMeshBuilder = new DynamicMeshBuilder();
  private particles: Particle[] = [];
  private particleCursor = 0;

  // Pre-allocated scratch matrices & software triangle pool (Zero GC)
  private projMat: Mat4 = createMat4();
  private viewMat: Mat4 = createMat4();
  private viewProjMat: Mat4 = createMat4();
  private modelMat: Mat4 = createMat4();
  private softTriPool: SoftTriangle[] = [];
  private softTriRefs: SoftTriangle[] = [];

  // Smoothly damped chase camera & trauma impact shake state
  private chaseCamX = 0;
  private chaseCamY = 14;
  private chaseCamZ = -6;
  private chaseCamInitialized = false;
  private wheelSpinAngle = 0;
  private elapsedRenderSec = 0;
  private camTrauma = 0;
  private prevForwardSpeedMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    this.carChassisData = buildRallyCarChassisMesh(false);
    this.carChassisVertexCount = this.carChassisData.length / FLOATS_PER_VERTEX;

    this.contactShadowData = buildCarContactShadowMesh();
    this.contactShadowVertexCount = this.contactShadowData.length / FLOATS_PER_VERTEX;

    this.brakeGlowData = buildBrakeGlowMesh();
    this.brakeGlowVertexCount = this.brakeGlowData.length / FLOATS_PER_VERTEX;

    this.exhaustBackfireData = buildExhaustBackfireMesh();
    this.exhaustBackfireVertexCount = this.exhaustBackfireData.length / FLOATS_PER_VERTEX;

    this.ghostCarData = buildRallyCarChassisMesh(true);
    this.ghostCarVertexCount = this.ghostCarData.length / FLOATS_PER_VERTEX;

    this.wheelData = buildWheelMesh();
    this.wheelVertexCount = this.wheelData.length / FLOATS_PER_VERTEX;

    this.cockpitInteriorData = buildCockpitInteriorMesh();
    this.cockpitInteriorVertexCount = this.cockpitInteriorData.length / FLOATS_PER_VERTEX;

    this.hoodCameraData = buildHoodCameraMesh();
    this.hoodCameraVertexCount = this.hoodCameraData.length / FLOATS_PER_VERTEX;

    this.steeringWheelData = buildSteeringWheelAndHandsMesh();
    this.steeringWheelVertexCount = this.steeringWheelData.length / FLOATS_PER_VERTEX;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        isStreak: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.2,
        age: 0,
        maxAge: 1,
        r: 0.7,
        g: 0.6,
        b: 0.5,
      });
    }

    const gl = acquireWebGLContext(canvas, this.isHeadless);
    if (gl) {
      try {
        this.gl = gl;
        this.program = this.createShaderProgram(VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC);
        this.skyProgram = this.createShaderProgram(SKY_VERTEX_SHADER_SRC, SKY_FRAGMENT_SHADER_SRC);

        gl.useProgram(this.program);
        this.aPosLoc = gl.getAttribLocation(this.program, 'aPos');
        this.aNormalLoc = gl.getAttribLocation(this.program, 'aNormal');
        this.aColorLoc = gl.getAttribLocation(this.program, 'aColor');
        this.aMatTypeLoc = gl.getAttribLocation(this.program, 'aMatType');

        this.uViewProjLoc = gl.getUniformLocation(this.program, 'uViewProj');
        this.uModelLoc = gl.getUniformLocation(this.program, 'uModel');
        this.uCamPosLoc = gl.getUniformLocation(this.program, 'uCamPos');
        this.uSunDirLoc = gl.getUniformLocation(this.program, 'uSunDir');
        this.uSunColorLoc = gl.getUniformLocation(this.program, 'uSunColor');
        this.uSkyAmbientLoc = gl.getUniformLocation(this.program, 'uSkyAmbient');
        this.uGroundAmbientLoc = gl.getUniformLocation(this.program, 'uGroundAmbient');
        this.uFogColorLoc = gl.getUniformLocation(this.program, 'uFogColor');
        this.uFogDensityLoc = gl.getUniformLocation(this.program, 'uFogDensity');
        this.uHeadlightPosLoc = gl.getUniformLocation(this.program, 'uHeadlightPos');
        this.uHeadlightDirLoc = gl.getUniformLocation(this.program, 'uHeadlightDir');
        this.uHeadlightIntensityLoc = gl.getUniformLocation(this.program, 'uHeadlightIntensity');
        this.uAlphaLoc = gl.getUniformLocation(this.program, 'uAlpha');

        gl.useProgram(this.skyProgram);
        this.aSkyScreenPosLoc = gl.getAttribLocation(this.skyProgram, 'aSkyScreenPos');
        this.uSkyCamForwardLoc = gl.getUniformLocation(this.skyProgram, 'uCamForward');
        this.uSkyCamRightLoc = gl.getUniformLocation(this.skyProgram, 'uCamRight');
        this.uSkyCamUpLoc = gl.getUniformLocation(this.skyProgram, 'uCamUp');
        this.uSkyTanHalfFovLoc = gl.getUniformLocation(this.skyProgram, 'uTanHalfFov');
        this.uSkyAspectLoc = gl.getUniformLocation(this.skyProgram, 'uAspect');
        this.uSkyZenithLoc = gl.getUniformLocation(this.skyProgram, 'uSkyZenith');
        this.uSkyFogColorLoc = gl.getUniformLocation(this.skyProgram, 'uFogColor');
        this.uSkySunDirLoc = gl.getUniformLocation(this.skyProgram, 'uSunDir');
        this.uSkySunColorLoc = gl.getUniformLocation(this.skyProgram, 'uSunColor');
        this.uSkyCloudDensityLoc = gl.getUniformLocation(this.skyProgram, 'uCloudDensity');
        this.uSkyIsNightLoc = gl.getUniformLocation(this.skyProgram, 'uIsNight');
        this.uSkyTimeSecLoc = gl.getUniformLocation(this.skyProgram, 'uTimeSec');

        this.skyQuadBuffer = this.createStaticBuffer(
          new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])
        );

        this.carChassisBuffer = this.createStaticBuffer(this.carChassisData);
        this.contactShadowBuffer = this.createStaticBuffer(this.contactShadowData);
        this.brakeGlowBuffer = this.createStaticBuffer(this.brakeGlowData);
        this.exhaustBackfireBuffer = this.createStaticBuffer(this.exhaustBackfireData);
        this.ghostCarBuffer = this.createStaticBuffer(this.ghostCarData);
        this.wheelBuffer = this.createStaticBuffer(this.wheelData);
        this.cockpitInteriorBuffer = this.createStaticBuffer(this.cockpitInteriorData);
        this.hoodCameraBuffer = this.createStaticBuffer(this.hoodCameraData);
        this.steeringWheelBuffer = this.createStaticBuffer(this.steeringWheelData);
        this.particleBuffer = gl.createBuffer();

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } catch {
        this.gl = null;
      }
    }

    if (!this.gl) {
      this.initSoftwareFallback();
    }
  }

  private initSoftwareFallback(): void {
    this.ctx2d = this.canvas.getContext('2d');
    if (this.softTriPool.length === 0) {
      for (let i = 0; i < MAX_SOFT_TRIS; i++) {
        const tri: SoftTriangle = {
          sx0: 0,
          sy0: 0,
          sx1: 0,
          sy1: 0,
          sx2: 0,
          sy2: 0,
          depth: 0,
          r: 128,
          g: 128,
          b: 128,
          alpha: 1,
        };
        this.softTriPool.push(tri);
        this.softTriRefs.push(tri);
      }
    }
  }

  public setStage(stage: StageDefinition): void {
    if (this.currentStageId === stage.id && this.stageMeshData.length > 0) return;
    this.currentStageId = stage.id;
    this.stageMeshData = buildStageStaticMesh(stage);
    this.stageVertexCount = this.stageMeshData.length / FLOATS_PER_VERTEX;

    if (this.gl) {
      if (this.stageBuffer) {
        this.gl.deleteBuffer(this.stageBuffer);
      }
      this.stageBuffer = this.createStaticBuffer(this.stageMeshData);
    }

    this.chaseCamInitialized = false;
    this.camTrauma = 0;
    for (const p of this.particles) p.active = false;
  }

  public resize(width: number, height: number): void {
    const dpr = this.isHeadless || !this.gl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.floor(width * dpr));
    const targetH = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  public dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.stageBuffer) gl.deleteBuffer(this.stageBuffer);
      if (this.skyQuadBuffer) gl.deleteBuffer(this.skyQuadBuffer);
      if (this.carChassisBuffer) gl.deleteBuffer(this.carChassisBuffer);
      if (this.contactShadowBuffer) gl.deleteBuffer(this.contactShadowBuffer);
      if (this.brakeGlowBuffer) gl.deleteBuffer(this.brakeGlowBuffer);
      if (this.exhaustBackfireBuffer) gl.deleteBuffer(this.exhaustBackfireBuffer);
      if (this.ghostCarBuffer) gl.deleteBuffer(this.ghostCarBuffer);
      if (this.wheelBuffer) gl.deleteBuffer(this.wheelBuffer);
      if (this.cockpitInteriorBuffer) gl.deleteBuffer(this.cockpitInteriorBuffer);
      if (this.hoodCameraBuffer) gl.deleteBuffer(this.hoodCameraBuffer);
      if (this.steeringWheelBuffer) gl.deleteBuffer(this.steeringWheelBuffer);
      if (this.particleBuffer) gl.deleteBuffer(this.particleBuffer);
      if (this.program) gl.deleteProgram(this.program);
      if (this.skyProgram) gl.deleteProgram(this.skyProgram);
      this.gl = null;
    }
    this.stageBuffer = null;
    this.skyQuadBuffer = null;
    this.carChassisBuffer = null;
    this.contactShadowBuffer = null;
    this.brakeGlowBuffer = null;
    this.exhaustBackfireBuffer = null;
    this.ghostCarBuffer = null;
    this.wheelBuffer = null;
    this.cockpitInteriorBuffer = null;
    this.hoodCameraBuffer = null;
    this.steeringWheelBuffer = null;
    this.particleBuffer = null;
    this.program = null;
    this.skyProgram = null;
    this.ctx2d = null;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  public updateParticles(
    car: CarPhysicsState,
    weather: WeatherType,
    dt: number
  ): void {
    const speed = Math.abs(car.forwardSpeedMs);
    const maxSlip = Math.max(
      car.wheels[0].combinedSlip,
      car.wheels[1].combinedSlip,
      car.wheels[2].combinedSlip,
      car.wheels[3].combinedSlip
    );

    // Trigger trauma camera shake on heavy jump landings or sudden collision deceleration
    const speedDrop = this.prevForwardSpeedMs - car.forwardSpeedMs;
    this.prevForwardSpeedMs = car.forwardSpeedMs;
    if (speedDrop > 5.5 && dt > 0) {
      this.camTrauma = Math.min(1.0, this.camTrauma + Math.min(0.65, speedDrop * 0.05));
    }
    if (car.lastLandingForceG > 2.0 && car.wheels[0].bottomedOutImpact > 0.25) {
      this.camTrauma = Math.min(1.0, Math.max(this.camTrauma, Math.min(0.55, car.lastLandingForceG * 0.14)));
    }
    this.camTrauma = Math.max(0, this.camTrauma - 2.2 * dt);

    // 1. Tire surface roost & bright dust/snow/water spray when moving & sliding
    if (speed > 2.5 && (car.wheels[2].isGrounded || car.wheels[3].isGrounded)) {
      const emitChance = Math.min(1.0, (speed / 24) * 0.58 + maxSlip * 0.45);
      if (Math.random() < emitChance) {
        const sinY = Math.sin(car.yaw);
        const cosY = Math.cos(car.yaw);
        const sideSign = Math.random() < 0.5 ? -0.78 : 0.78;
        const wx = car.x - sinY * 1.42 + cosY * sideSign + (Math.random() - 0.5) * 0.16;
        const wy = car.y + 0.10;
        const wz = car.z - cosY * 1.42 - sinY * sideSign + (Math.random() - 0.5) * 0.16;

        let r = 0.76, g = 0.67, b = 0.54;
        let size = 0.13 + Math.min(0.12, maxSlip * 0.06);
        let maxAge = 0.62;
        let upVel = 0.65 + Math.random() * 0.75;

        if (car.currentSurface === 'gravel' || car.currentSurface === 'tarmac_dirty') {
          if (Math.random() < 0.38) {
            r = 0.58; g = 0.49; b = 0.37;
            size = 0.048;
            maxAge = 0.38;
            upVel = 1.6 + Math.random() * 1.3;
          } else {
            r = 0.78; g = 0.69; b = 0.56;
            size = 0.14 + Math.min(0.13, maxSlip * 0.07);
            maxAge = 0.68;
          }
        } else if (car.currentSurface === 'snow' || car.currentSurface === 'ice') {
          r = 0.94; g = 0.97; b = 1.0;
          size = 0.14 + Math.min(0.12, maxSlip * 0.06);
          maxAge = 0.65;
        } else if (car.currentSurface === 'water_puddle') {
          r = 0.82; g = 0.91; b = 0.98;
          size = 0.13;
          upVel = 1.9 + Math.random() * 1.3;
          maxAge = 0.48;
        } else if (car.currentSurface === 'offtrack') {
          r = 0.48; g = 0.40; b = 0.28;
          size = 0.09;
          upVel = 1.4 + Math.random() * 1.0;
          maxAge = 0.48;
        } else {
          if (maxSlip > 1.15) {
            r = 0.88; g = 0.90; b = 0.94;
            size = 0.14;
            maxAge = 0.52;
          } else {
            size = 0;
          }
        }

        if (size > 0) {
          this.spawnParticle(
            false,
            wx,
            wy,
            wz,
            -sinY * speed * 0.26 + (Math.random() - 0.5) * 1.6,
            upVel,
            -cosY * speed * 0.26 + (Math.random() - 0.5) * 1.6,
            size,
            maxAge,
            r,
            g,
            b
          );
        }
      }
    }

    // 2. Weather precipitation (Thin silver-blue rain streaks or bright snow crystals)
    if (weather === 'rain' || weather === 'snow') {
      const sinY = Math.sin(car.yaw);
      const cosY = Math.cos(car.yaw);
      for (let k = 0; k < 2; k++) {
        const ahead = 5 + Math.random() * 26;
        const spread = (Math.random() - 0.5) * 22;
        const px = car.x + sinY * ahead + cosY * spread;
        const py = car.y + 4.8 + Math.random() * 5.0;
        const pz = car.z + cosY * ahead - sinY * spread;

        if (weather === 'rain') {
          this.spawnParticle(true, px, py, pz, -0.6, -15.5, -0.6, 0.032, 0.38, 0.78, 0.86, 0.95);
        } else {
          this.spawnParticle(
            false,
            px,
            py,
            pz,
            (Math.random() - 0.5) * 1.8,
            -3.2,
            (Math.random() - 0.5) * 1.8,
            0.085,
            1.15,
            0.96,
            0.98,
            1.0
          );
        }
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.isStreak) {
        p.vy -= 3.8 * dt;
      }
    }
  }

  private spawnParticle(
    isStreak: boolean,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    maxAge: number,
    r: number,
    g: number,
    b: number
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.isStreak = isStreak;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.age = 0;
    p.maxAge = maxAge;
    p.r = r;
    p.g = g;
    p.b = b;
  }

  public render(
    car: CarPhysicsState,
    cameraMode: CameraMode,
    weather: WeatherType,
    timeOfDay: TimeOfDay,
    isTitleFlyover: boolean,
    flyoverTimeSec: number,
    ghostSample: GhostSample | null,
    dt: number
  ): void {
    this.elapsedRenderSec += dt;
    this.wheelSpinAngle = (this.wheelSpinAngle + (car.forwardSpeedMs / 0.33) * dt) % (Math.PI * 2);

    const env = this.getAtmosphereParams(weather, timeOfDay, car);
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const hlPos: [number, number, number] = [
      car.x + sinY * 1.95,
      car.y + 0.82 - Math.sin(car.pitch) * 1.95,
      car.z + cosY * 1.95,
    ];
    const hlDir: [number, number, number] = [
      sinY * Math.cos(car.pitch),
      -Math.sin(car.pitch) - 0.04,
      cosY * Math.cos(car.pitch),
    ];

    if (!this.gl) {
      this.renderSoftwareFallback(
        car,
        cameraMode,
        env,
        hlPos,
        hlDir,
        isTitleFlyover,
        flyoverTimeSec,
        ghostSample,
        dt
      );
      return;
    }

    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Main Full-Screen Viewport
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, w, h);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = w / Math.max(1, h);
    const speedFovBoost = Math.min(0.15, Math.abs(car.forwardSpeedMs) * 0.0032);
    const baseFovRad =
      cameraMode === 'cockpit'
        ? 1.08 + speedFovBoost * 0.35
        : cameraMode === 'chase_far'
          ? 1.02 + speedFovBoost
          : 1.05 + speedFovBoost;
    perspectiveMat4(this.projMat, baseFovRad, aspect, 0.12, 460.0);

    const cam = this.computeCameraPose(car, cameraMode, isTitleFlyover, flyoverTimeSec, dt);

    // Draw Procedural Sky, Sun/Moon, Clouds & Alpine Horizon Mountains First (depthMask = false)
    this.drawProceduralSky(cam, baseFovRad, aspect, env);

    // Switch to Main 3D World Shader
    gl.useProgram(this.program);
    gl.uniform3f(this.uSunDirLoc, env.sunDir[0], env.sunDir[1], env.sunDir[2]);
    gl.uniform3f(this.uSunColorLoc, env.sunColor[0], env.sunColor[1], env.sunColor[2]);
    gl.uniform3f(this.uSkyAmbientLoc, env.skyAmb[0], env.skyAmb[1], env.skyAmb[2]);
    gl.uniform3f(this.uGroundAmbientLoc, env.gndAmb[0], env.gndAmb[1], env.gndAmb[2]);
    gl.uniform3f(this.uFogColorLoc, env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    gl.uniform1f(this.uFogDensityLoc, env.fogDensity);
    gl.uniform3f(this.uHeadlightPosLoc, hlPos[0], hlPos[1], hlPos[2]);
    gl.uniform3f(this.uHeadlightDirLoc, hlDir[0], hlDir[1], hlDir[2]);
    gl.uniform1f(this.uHeadlightIntensityLoc, env.headlightIntensity);

    lookAtMat4(
      this.viewMat,
      cam.eyeX,
      cam.eyeY,
      cam.eyeZ,
      cam.lookX,
      cam.lookY,
      cam.lookZ,
      cam.upX,
      cam.upY,
      cam.upZ
    );
    multiplyMat4(this.viewProjMat, this.projMat, this.viewMat);

    gl.uniformMatrix4fv(this.uViewProjLoc, false, this.viewProjMat);
    gl.uniform3f(this.uCamPosLoc, cam.eyeX, cam.eyeY, cam.eyeZ);
    gl.uniform1f(this.uAlphaLoc, 1.0);

    // Draw 3D Stage & Roadside Obstacles
    this.drawStage();

    // Draw Personal Best Ghost Car if present
    if (ghostSample && !isTitleFlyover) {
      this.drawGhostCar(ghostSample);
    }

    // Draw Player Car (in Chase / Chase Far / Title Flyover) OR Cockpit / Hood
    if (isTitleFlyover || cameraMode === 'chase' || cameraMode === 'chase_far') {
      this.drawPlayerCar(car);
    } else if (cameraMode === 'cockpit') {
      this.drawCockpitAndSteeringWheel(car);
    } else if (cameraMode === 'hood') {
      this.drawHoodBonnet(car);
    }

    // Draw 3D Unlit Atmospheric Particles
    this.drawParticles();

    // 2. Cockpit Rear-View Mirror Pass at Top-Center
    if (!isTitleFlyover && cameraMode === 'cockpit' && w >= 480) {
      const mirrorW = Math.floor(Math.min(w * 0.28, 340));
      const mirrorH = Math.floor(Math.min(h * 0.095, 76));
      const mirrorX = Math.floor((w - mirrorW) * 0.5);
      const mirrorY = Math.floor(h - mirrorH - h * 0.025);
      const mirrorAspect = mirrorW / Math.max(1, mirrorH);

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(mirrorX, mirrorY, mirrorW, mirrorH);
      gl.viewport(mirrorX, mirrorY, mirrorW, mirrorH);
      gl.clearColor(env.fogColor[0] * 0.9, env.fogColor[1] * 0.9, env.fogColor[2] * 0.9, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const rearCam = {
        eyeX: car.x - sinY * 0.8,
        eyeY: car.y + 1.12,
        eyeZ: car.z - cosY * 0.8,
        lookX: car.x - sinY * 30.0,
        lookY: car.y + 0.85,
        lookZ: car.z - cosY * 30.0,
        upX: 0,
        upY: 1,
        upZ: 0,
      };

      this.drawProceduralSky(rearCam, 0.95, mirrorAspect, env);

      gl.useProgram(this.program);
      perspectiveMat4(this.projMat, 0.95, mirrorAspect, 0.2, 240.0);
      lookAtMat4(
        this.viewMat,
        rearCam.eyeX,
        rearCam.eyeY,
        rearCam.eyeZ,
        rearCam.lookX,
        rearCam.lookY,
        rearCam.lookZ,
        0,
        1,
        0
      );
      multiplyMat4(this.viewProjMat, this.projMat, this.viewMat);

      gl.uniformMatrix4fv(this.uViewProjLoc, false, this.viewProjMat);
      gl.uniform3f(this.uCamPosLoc, rearCam.eyeX, rearCam.eyeY, rearCam.eyeZ);
      gl.uniform1f(this.uAlphaLoc, 1.0);

      this.drawStage();
      this.drawParticles();
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  private drawProceduralSky(
    cam: {
      eyeX: number;
      eyeY: number;
      eyeZ: number;
      lookX: number;
      lookY: number;
      lookZ: number;
      upX: number;
      upY: number;
      upZ: number;
    },
    fovRad: number,
    aspect: number,
    env: AtmosphereEnv
  ): void {
    const gl = this.gl;
    if (!gl || !this.skyProgram || !this.skyQuadBuffer) return;

    // Orthonormal camera basis vectors
    let fx = cam.lookX - cam.eyeX;
    let fy = cam.lookY - cam.eyeY;
    let fz = cam.lookZ - cam.eyeZ;
    const fLen = Math.hypot(fx, fy, fz) || 1;
    fx /= fLen;
    fy /= fLen;
    fz /= fLen;

    // right = normalize(cross(forward, up))
    let rx = fy * cam.upZ - fz * cam.upY;
    let ry = fz * cam.upX - fx * cam.upZ;
    let rz = fx * cam.upY - fy * cam.upX;
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;

    // trueUp = cross(right, forward)
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    gl.useProgram(this.skyProgram);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // Disable extra vertex attribute arrays from the main program while drawing the 2D sky quad
    if (this.aNormalLoc >= 0) gl.disableVertexAttribArray(this.aNormalLoc);
    if (this.aColorLoc >= 0) gl.disableVertexAttribArray(this.aColorLoc);
    if (this.aMatTypeLoc >= 0) gl.disableVertexAttribArray(this.aMatTypeLoc);

    gl.uniform3f(this.uSkyCamForwardLoc, fx, fy, fz);
    gl.uniform3f(this.uSkyCamRightLoc, rx, ry, rz);
    gl.uniform3f(this.uSkyCamUpLoc, ux, uy, uz);
    gl.uniform1f(this.uSkyTanHalfFovLoc, Math.tan(fovRad * 0.5));
    gl.uniform1f(this.uSkyAspectLoc, aspect);

    gl.uniform3f(this.uSkyZenithLoc, env.skyZenith[0], env.skyZenith[1], env.skyZenith[2]);
    gl.uniform3f(this.uSkyFogColorLoc, env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    gl.uniform3f(this.uSkySunDirLoc, env.sunDir[0], env.sunDir[1], env.sunDir[2]);
    gl.uniform3f(this.uSkySunColorLoc, env.sunColor[0], env.sunColor[1], env.sunColor[2]);
    gl.uniform1f(this.uSkyCloudDensityLoc, env.cloudDensity);
    gl.uniform1f(this.uSkyIsNightLoc, env.isNight);
    gl.uniform1f(this.uSkyTimeSecLoc, this.elapsedRenderSec);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyQuadBuffer);
    if (this.aSkyScreenPosLoc >= 0) {
      gl.enableVertexAttribArray(this.aSkyScreenPosLoc);
      gl.vertexAttribPointer(this.aSkyScreenPosLoc, 2, gl.FLOAT, false, 8, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.aSkyScreenPosLoc >= 0) {
      gl.disableVertexAttribArray(this.aSkyScreenPosLoc);
    }
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  private renderSoftwareFallback(
    car: CarPhysicsState,
    cameraMode: CameraMode,
    env: AtmosphereEnv,
    hlPos: [number, number, number],
    hlDir: [number, number, number],
    isTitleFlyover: boolean,
    flyoverTimeSec: number,
    ghostSample: GhostSample | null,
    dt: number
  ): void {
    if (!this.ctx2d) {
      this.initSoftwareFallback();
      if (!this.ctx2d) return;
    }
    const ctx = this.ctx2d;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const aspect = w / Math.max(1, h);
    const speedFovBoost = Math.min(0.14, Math.abs(car.forwardSpeedMs) * 0.003);
    const baseFovRad = cameraMode === 'cockpit' ? 1.08 : 1.05 + speedFovBoost;
    perspectiveMat4(this.projMat, baseFovRad, aspect, 0.15, 320.0);

    const cam = this.computeCameraPose(car, cameraMode, isTitleFlyover, flyoverTimeSec, dt);
    lookAtMat4(
      this.viewMat,
      cam.eyeX,
      cam.eyeY,
      cam.eyeZ,
      cam.lookX,
      cam.lookY,
      cam.lookZ,
      cam.upX,
      cam.upY,
      cam.upZ
    );
    multiplyMat4(this.viewProjMat, this.projMat, this.viewMat);

    this.renderSoftwareViewport(
      ctx,
      0,
      0,
      w,
      h,
      cam.eyeX,
      cam.eyeY,
      cam.eyeZ,
      env,
      hlPos,
      hlDir,
      car,
      cameraMode,
      isTitleFlyover,
      ghostSample,
      false
    );

    if (!isTitleFlyover && cameraMode === 'cockpit' && w >= 480) {
      const mirrorW = Math.floor(Math.min(w * 0.28, 340));
      const mirrorH = Math.floor(Math.min(h * 0.095, 76));
      const mirrorX = Math.floor((w - mirrorW) * 0.5);
      const mirrorY = Math.floor(h * 0.025);

      const sinY = Math.sin(car.yaw);
      const cosY = Math.cos(car.yaw);
      const rearEyeX = car.x - sinY * 0.8;
      const rearEyeY = car.y + 1.12;
      const rearEyeZ = car.z - cosY * 0.8;
      const rearLookX = car.x - sinY * 30.0;
      const rearLookY = car.y + 0.85;
      const rearLookZ = car.z - cosY * 30.0;

      perspectiveMat4(this.projMat, 0.95, mirrorW / Math.max(1, mirrorH), 0.2, 180.0);
      lookAtMat4(this.viewMat, rearEyeX, rearEyeY, rearEyeZ, rearLookX, rearLookY, rearLookZ, 0, 1, 0);
      multiplyMat4(this.viewProjMat, this.projMat, this.viewMat);

      ctx.save();
      ctx.beginPath();
      ctx.rect(mirrorX, mirrorY, mirrorW, mirrorH);
      ctx.clip();

      this.renderSoftwareViewport(
        ctx,
        mirrorX,
        mirrorY,
        mirrorW,
        mirrorH,
        rearEyeX,
        rearEyeY,
        rearEyeZ,
        env,
        hlPos,
        hlDir,
        car,
        cameraMode,
        false,
        null,
        true
      );
      ctx.restore();
    }
  }

  private renderSoftwareViewport(
    ctx: CanvasRenderingContext2D,
    vpX: number,
    vpY: number,
    vpW: number,
    vpH: number,
    camX: number,
    camY: number,
    camZ: number,
    env: AtmosphereEnv,
    hlPos: [number, number, number],
    hlDir: [number, number, number],
    car: CarPhysicsState,
    cameraMode: CameraMode,
    isTitleFlyover: boolean,
    ghostSample: GhostSample | null,
    isMirrorPass: boolean
  ): void {
    // 1. Atmospheric Sky Gradient + Alpine Horizon Ridge Silhouette
    const zenR = Math.round(Math.min(255, env.skyZenith[0] * 255));
    const zenG = Math.round(Math.min(255, env.skyZenith[1] * 255));
    const zenB = Math.round(Math.min(255, env.skyZenith[2] * 255));
    const fogR = Math.round(Math.min(255, env.fogColor[0] * 255));
    const fogG = Math.round(Math.min(255, env.fogColor[1] * 255));
    const fogB = Math.round(Math.min(255, env.fogColor[2] * 255));

    const grad = ctx.createLinearGradient(vpX, vpY, vpX, vpY + vpH * 0.62);
    grad.addColorStop(0, `rgb(${zenR},${zenG},${zenB})`);
    grad.addColorStop(1, `rgb(${fogR},${fogG},${fogB})`);
    ctx.fillStyle = grad;
    ctx.fillRect(vpX, vpY, vpW, vpH);

    // Mountain silhouette along horizon
    const horizonY = vpY + vpH * 0.48;
    ctx.fillStyle = `rgba(${Math.round(fogR * 0.72)},${Math.round(fogG * 0.74)},${Math.round(fogB * 0.80)},0.65)`;
    ctx.beginPath();
    ctx.moveTo(vpX, horizonY + vpH * 0.12);
    for (let s = 0; s <= 16; s++) {
      const px = vpX + (s / 16) * vpW;
      const py = horizonY - (Math.sin(s * 0.9 + car.yaw * 2) * 0.5 + 0.55) * vpH * 0.09;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(vpX + vpW, horizonY + vpH * 0.12);
    ctx.closePath();
    ctx.fill();

    let triCount = 0;

    if (this.stageMeshData.length > 0) {
      composeTransformMat4(this.modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);
      triCount = this.appendSoftwareMesh(
        this.stageMeshData,
        true,
        1.0,
        triCount,
        vpX,
        vpY,
        vpW,
        vpH,
        camX,
        camY,
        camZ,
        env,
        hlPos,
        hlDir,
        145.0
      );
    }

    if (!isMirrorPass) {
      if (ghostSample && !isTitleFlyover && this.ghostCarData.length > 0) {
        composeTransformMat4(
          this.modelMat,
          ghostSample.x,
          ghostSample.y + 0.05,
          ghostSample.z,
          ghostSample.yaw,
          ghostSample.pitch,
          ghostSample.roll,
          1,
          1,
          1
        );
        triCount = this.appendSoftwareMesh(
          this.ghostCarData,
          false,
          0.38,
          triCount,
          vpX,
          vpY,
          vpW,
          vpH,
          camX,
          camY,
          camZ,
          env,
          hlPos,
          hlDir,
          120.0
        );
      }

      if (isTitleFlyover || cameraMode === 'chase' || cameraMode === 'chase_far') {
        composeTransformMat4(
          this.modelMat,
          car.x,
          car.y + 0.04,
          car.z,
          car.yaw,
          car.pitch,
          car.roll,
          1,
          1,
          1
        );
        triCount = this.appendSoftwareMesh(
          this.carChassisData,
          false,
          1.0,
          triCount,
          vpX,
          vpY,
          vpW,
          vpH,
          camX,
          camY,
          camZ,
          env,
          hlPos,
          hlDir,
          60.0
        );

        const sinY = Math.sin(car.yaw);
        const cosY = Math.cos(car.yaw);
        const wheelPositions = [
          { lx: -0.81, lz: 1.28, isFront: true, wIdx: 0 },
          { lx: 0.81, lz: 1.28, isFront: true, wIdx: 1 },
          { lx: -0.81, lz: -1.28, isFront: false, wIdx: 2 },
          { lx: 0.81, lz: -1.28, isFront: false, wIdx: 3 },
        ];
        for (const wp of wheelPositions) {
          const wState = car.wheels[wp.wIdx];
          const wx = car.x + wp.lx * cosY + wp.lz * sinY;
          const wy = car.y + 0.33 + Math.max(0, wState.compression - 0.08) * 0.45;
          const wz = car.z - wp.lx * sinY + wp.lz * cosY;
          const wYaw = car.yaw + (wp.isFront ? car.steerAngleRad : 0);
          composeTransformMat4(this.modelMat, wx, wy, wz, wYaw, this.wheelSpinAngle, 0, 1, 1, 1);
          triCount = this.appendSoftwareMesh(
            this.wheelData,
            false,
            1.0,
            triCount,
            vpX,
            vpY,
            vpW,
            vpH,
            camX,
            camY,
            camZ,
            env,
            hlPos,
            hlDir,
            60.0
          );
        }
      } else if (cameraMode === 'cockpit') {
        composeTransformMat4(
          this.modelMat,
          car.x,
          car.y,
          car.z,
          car.yaw,
          car.pitch,
          car.roll,
          1,
          1,
          1
        );
        triCount = this.appendSoftwareMesh(
          this.cockpitInteriorData,
          false,
          1.0,
          triCount,
          vpX,
          vpY,
          vpW,
          vpH,
          camX,
          camY,
          camZ,
          env,
          hlPos,
          hlDir,
          20.0
        );

        const sinY = Math.sin(car.yaw);
        const cosY = Math.cos(car.yaw);
        const lx = -0.32;
        const ly = 0.74 - Math.sin(car.pitch) * 0.36;
        const lz = 0.36;
        const swX = car.x + lx * cosY + lz * sinY;
        const swY = car.y + ly;
        const swZ = car.z - lx * sinY + lz * cosY;
        const wheelRotRad = -(car.steeringWheelDeg * Math.PI) / 180;
        composeTransformMat4(
          this.modelMat,
          swX,
          swY,
          swZ,
          car.yaw,
          car.pitch,
          car.roll + wheelRotRad,
          1,
          1,
          1
        );
        triCount = this.appendSoftwareMesh(
          this.steeringWheelData,
          false,
          1.0,
          triCount,
          vpX,
          vpY,
          vpW,
          vpH,
          camX,
          camY,
          camZ,
          env,
          hlPos,
          hlDir,
          20.0
        );
      } else if (cameraMode === 'hood') {
        composeTransformMat4(
          this.modelMat,
          car.x,
          car.y,
          car.z,
          car.yaw,
          car.pitch,
          car.roll,
          1,
          1,
          1
        );
        triCount = this.appendSoftwareMesh(
          this.hoodCameraData,
          false,
          1.0,
          triCount,
          vpX,
          vpY,
          vpW,
          vpH,
          camX,
          camY,
          camZ,
          env,
          hlPos,
          hlDir,
          20.0
        );
      }
    }

    this.particleMeshBuilder.clear();
    let activeParticles = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      activeParticles++;
      const lifeRatio = 1.0 - p.age / p.maxAge;
      const curSize = p.size * (p.isStreak ? 1.0 : 0.75 + (1.0 - lifeRatio) * 0.9) * (0.45 + 0.55 * lifeRatio);
      this.particleMeshBuilder.addBox(
        p.x,
        p.y,
        p.z,
        curSize,
        p.isStreak ? 0.52 : curSize,
        curSize,
        p.r,
        p.g,
        p.b,
        6
      );
    }
    if (activeParticles > 0) {
      triCount = this.appendSoftwareMesh(
        this.particleMeshBuilder.getFloat32Array(),
        true,
        0.65,
        triCount,
        vpX,
        vpY,
        vpW,
        vpH,
        camX,
        camY,
        camZ,
        env,
        hlPos,
        hlDir,
        80.0
      );
    }

    const refs = this.softTriRefs;
    for (let i = 0; i < triCount; i++) {
      refs[i] = this.softTriPool[i];
    }
    const activeSlice = refs.slice(0, triCount);
    activeSlice.sort((a, b) => b.depth - a.depth);

    for (let i = 0; i < triCount; i++) {
      const t = activeSlice[i];
      ctx.fillStyle =
        t.alpha < 0.99
          ? `rgba(${t.r},${t.g},${t.b},${t.alpha.toFixed(2)})`
          : `rgb(${t.r},${t.g},${t.b})`;
      ctx.beginPath();
      ctx.moveTo(t.sx0, t.sy0);
      ctx.lineTo(t.sx1, t.sy1);
      ctx.lineTo(t.sx2, t.sy2);
      ctx.closePath();
      ctx.fill();
    }
  }

  private appendSoftwareMesh(
    data: Float32Array,
    isIdentityModel: boolean,
    alpha: number,
    startTriCount: number,
    vpX: number,
    vpY: number,
    vpW: number,
    vpH: number,
    camX: number,
    _camY: number,
    camZ: number,
    env: AtmosphereEnv,
    hlPos: [number, number, number],
    hlDir: [number, number, number],
    maxDist: number
  ): number {
    let triIdx = startTriCount;
    const maxDistSq = maxDist * maxDist;
    const m = this.modelMat;
    const vp = this.viewProjMat;
    const stride = FLOATS_PER_VERTEX * 3;

    for (let base = 0; base <= data.length - stride; base += stride) {
      if (triIdx >= MAX_SOFT_TRIS) break;

      let x0 = data[base];
      let y0 = data[base + 1];
      let z0 = data[base + 2];

      if (isIdentityModel) {
        const dx = x0 - camX;
        const dz = z0 - camZ;
        if (dx * dx + dz * dz > maxDistSq) continue;
      }

      let x1 = data[base + 10];
      let y1 = data[base + 11];
      let z1 = data[base + 12];

      let x2 = data[base + 20];
      let y2 = data[base + 21];
      let z2 = data[base + 22];

      let nx = data[base + 3];
      let ny = data[base + 4];
      let nz = data[base + 5];

      if (!isIdentityModel) {
        const tx0 = m[0] * x0 + m[4] * y0 + m[8] * z0 + m[12];
        const ty0 = m[1] * x0 + m[5] * y0 + m[9] * z0 + m[13];
        const tz0 = m[2] * x0 + m[6] * y0 + m[10] * z0 + m[14];
        x0 = tx0; y0 = ty0; z0 = tz0;

        const tx1 = m[0] * x1 + m[4] * y1 + m[8] * z1 + m[12];
        const ty1 = m[1] * x1 + m[5] * y1 + m[9] * z1 + m[13];
        const tz1 = m[2] * x1 + m[6] * y1 + m[10] * z1 + m[14];
        x1 = tx1; y1 = ty1; z1 = tz1;

        const tx2 = m[0] * x2 + m[4] * y2 + m[8] * z2 + m[12];
        const ty2 = m[1] * x2 + m[5] * y2 + m[9] * z2 + m[13];
        const tz2 = m[2] * x2 + m[6] * y2 + m[10] * z2 + m[14];
        x2 = tx2; y2 = ty2; z2 = tz2;

        const tnx = m[0] * nx + m[4] * ny + m[8] * nz;
        const tny = m[1] * nx + m[5] * ny + m[9] * nz;
        const tnz = m[2] * nx + m[6] * ny + m[10] * nz;
        nx = tnx; ny = tny; nz = tnz;
      }

      let w0 = vp[3] * x0 + vp[7] * y0 + vp[11] * z0 + vp[15];
      let w1 = vp[3] * x1 + vp[7] * y1 + vp[11] * z1 + vp[15];
      let w2 = vp[3] * x2 + vp[7] * y2 + vp[11] * z2 + vp[15];

      const nearW = 0.25;
      if (w0 < nearW && w1 < nearW && w2 < nearW) continue;

      if (w0 < nearW || w1 < nearW || w2 < nearW) {
        const fx = w0 >= nearW ? x0 : w1 >= nearW ? x1 : x2;
        const fy = w0 >= nearW ? y0 : w1 >= nearW ? y1 : y2;
        const fz = w0 >= nearW ? z0 : w1 >= nearW ? z1 : z2;
        const fw = w0 >= nearW ? w0 : w1 >= nearW ? w1 : w2;

        if (w0 < nearW) {
          const t = (fw - nearW) / Math.max(0.001, fw - w0);
          x0 = fx + (x0 - fx) * t;
          y0 = fy + (y0 - fy) * t;
          z0 = fz + (z0 - fz) * t;
          w0 = nearW;
        }
        if (w1 < nearW) {
          const t = (fw - nearW) / Math.max(0.001, fw - w1);
          x1 = fx + (x1 - fx) * t;
          y1 = fy + (y1 - fy) * t;
          z1 = fz + (z1 - fz) * t;
          w1 = nearW;
        }
        if (w2 < nearW) {
          const t = (fw - nearW) / Math.max(0.001, fw - w2);
          x2 = fx + (x2 - fx) * t;
          y2 = fy + (y2 - fy) * t;
          z2 = fz + (z2 - fz) * t;
          w2 = nearW;
        }
      }

      const cx0 = (vp[0] * x0 + vp[4] * y0 + vp[8] * z0 + vp[12]) / w0;
      const cy0 = (vp[1] * x0 + vp[5] * y0 + vp[9] * z0 + vp[13]) / w0;
      const cx1 = (vp[0] * x1 + vp[4] * y1 + vp[8] * z1 + vp[12]) / w1;
      const cy1 = (vp[1] * x1 + vp[5] * y1 + vp[9] * z1 + vp[13]) / w1;
      const cx2 = (vp[0] * x2 + vp[4] * y2 + vp[8] * z2 + vp[12]) / w2;
      const cy2 = (vp[1] * x2 + vp[5] * y2 + vp[9] * z2 + vp[13]) / w2;

      if (
        (cx0 < -1.35 && cx1 < -1.35 && cx2 < -1.35) ||
        (cx0 > 1.35 && cx1 > 1.35 && cx2 > 1.35) ||
        (cy0 < -1.35 && cy1 < -1.35 && cy2 < -1.35) ||
        (cy0 > 1.35 && cy1 > 1.35 && cy2 > 1.35)
      ) {
        continue;
      }

      const sx0 = vpX + (cx0 * 0.5 + 0.5) * vpW;
      const sy0 = vpY + (0.5 - cy0 * 0.5) * vpH;
      const sx1 = vpX + (cx1 * 0.5 + 0.5) * vpW;
      const sy1 = vpY + (0.5 - cy1 * 0.5) * vpH;
      const sx2 = vpX + (cx2 * 0.5 + 0.5) * vpW;
      const sy2 = vpY + (0.5 - cy2 * 0.5) * vpH;

      const baseR = data[base + 6];
      const baseG = data[base + 7];
      const baseB = data[base + 8];
      const matType = data[base + 9];

      const avgW = (w0 + w1 + w2) * 0.3333;
      const fogFactor = Math.max(0, Math.min(1, Math.exp(-avgW * env.fogDensity)));

      let litR = baseR;
      let litG = baseG;
      let litB = baseB;

      if (matType > 5.5) {
        litR = baseR;
        litG = baseG;
        litB = baseB;
      } else if (matType > 2.5 && matType < 3.5) {
        litR = baseR * 1.25;
        litG = baseG * 1.25;
        litB = baseB * 1.25;
      } else {
        const hemi = ny * 0.5 + 0.5;
        const ambR = env.gndAmb[0] + (env.skyAmb[0] - env.gndAmb[0]) * hemi;
        const ambG = env.gndAmb[1] + (env.skyAmb[1] - env.gndAmb[1]) * hemi;
        const ambB = env.gndAmb[2] + (env.skyAmb[2] - env.gndAmb[2]) * hemi;
        const ndotl = Math.max(0, nx * env.sunDir[0] + ny * env.sunDir[1] + nz * env.sunDir[2]);

        let hlBoost = 0;
        if (env.headlightIntensity > 0.01 && avgW < 120) {
          const toX = x0 - hlPos[0];
          const toY = y0 - hlPos[1];
          const toZ = z0 - hlPos[2];
          const d = Math.hypot(toX, toY, toZ) || 1;
          const spotCos = (toX * hlDir[0] + toY * hlDir[1] + toZ * hlDir[2]) / d;
          if (spotCos > 0.72) {
            const cone = Math.min(1, (spotCos - 0.72) / 0.24);
            const atten = 1 / (1 + d * 0.02 + d * d * 0.0004);
            const retro = matType > 3.5 && matType < 4.5 ? 4.0 : 1.0;
            hlBoost = cone * atten * env.headlightIntensity * retro * 1.8;
          }
        }

        litR = baseR * (ambR + env.sunColor[0] * ndotl + hlBoost);
        litG = baseG * (ambG + env.sunColor[1] * ndotl + hlBoost * 0.95);
        litB = baseB * (ambB + env.sunColor[2] * ndotl + hlBoost * 0.84);
      }

      const finalR = env.fogColor[0] + (litR - env.fogColor[0]) * fogFactor;
      const finalG = env.fogColor[1] + (litG - env.fogColor[1]) * fogFactor;
      const finalB = env.fogColor[2] + (litB - env.fogColor[2]) * fogFactor;

      const tri = this.softTriPool[triIdx++];
      tri.sx0 = sx0;
      tri.sy0 = sy0;
      tri.sx1 = sx1;
      tri.sy1 = sy1;
      tri.sx2 = sx2;
      tri.sy2 = sy2;
      tri.depth = isIdentityModel ? avgW : avgW * 0.45;
      tri.r = Math.max(0, Math.min(255, Math.round(finalR * 255)));
      tri.g = Math.max(0, Math.min(255, Math.round(finalG * 255)));
      tri.b = Math.max(0, Math.min(255, Math.round(finalB * 255)));
      tri.alpha = alpha;
    }

    return triIdx;
  }

  private getAtmosphereParams(
    weather: WeatherType,
    timeOfDay: TimeOfDay,
    car: CarPhysicsState
  ): AtmosphereEnv {
    let sunDir: [number, number, number] = [0.38, 0.56, 0.73];
    let sunColor: [number, number, number] = [1.05, 0.98, 0.88];
    let skyZenith: [number, number, number] = [0.21, 0.44, 0.78];
    let skyAmb: [number, number, number] = [0.50, 0.58, 0.70];
    let gndAmb: [number, number, number] = [0.22, 0.24, 0.20];
    let fogColor: [number, number, number] = [0.68, 0.78, 0.90];
    let fogDensity = 0.0042;
    let cloudDensity = 0.35;
    let isNight = 0.0;
    let headlightIntensity = 0.0;

    if (timeOfDay === 'dusk') {
      sunDir = [0.65, 0.19, 0.73];
      sunColor = [1.25, 0.62, 0.26];
      skyZenith = [0.18, 0.22, 0.46];
      skyAmb = [0.46, 0.36, 0.50];
      gndAmb = [0.19, 0.14, 0.16];
      fogColor = [0.84, 0.50, 0.34];
      fogDensity = 0.0052;
      cloudDensity = 0.45;
      headlightIntensity = 0.68;
    } else if (timeOfDay === 'night') {
      sunDir = [-0.28, 0.52, 0.81];
      sunColor = [0.16, 0.22, 0.36];
      skyZenith = [0.02, 0.04, 0.09];
      skyAmb = [0.05, 0.08, 0.14];
      gndAmb = [0.02, 0.03, 0.05];
      fogColor = [0.04, 0.07, 0.13];
      fogDensity = 0.0088;
      cloudDensity = 0.25;
      isNight = 1.0;
      headlightIntensity = 1.4;
    }

    if (weather === 'rain') {
      fogDensity *= 1.45;
      cloudDensity = 0.88;
      sunColor = [sunColor[0] * 0.55, sunColor[1] * 0.58, sunColor[2] * 0.65];
      if (timeOfDay === 'day') {
        skyZenith = [0.24, 0.31, 0.41];
        fogColor = [0.46, 0.52, 0.59];
        skyAmb = [0.38, 0.43, 0.50];
      }
      headlightIntensity = Math.max(headlightIntensity, 0.58);
    } else if (weather === 'fog') {
      fogDensity = 0.0165;
      cloudDensity = 0.92;
      if (timeOfDay === 'day') {
        skyZenith = [0.54, 0.60, 0.68];
        fogColor = [0.74, 0.78, 0.82];
      } else if (timeOfDay === 'dusk') {
        skyZenith = [0.32, 0.30, 0.44];
        fogColor = [0.76, 0.58, 0.50];
      }
      headlightIntensity = Math.max(headlightIntensity, 0.78);
    } else if (weather === 'snow') {
      fogDensity = 0.0078;
      cloudDensity = 0.78;
      if (timeOfDay === 'day') {
        skyZenith = [0.48, 0.62, 0.82];
        fogColor = [0.82, 0.87, 0.94];
        skyAmb = [0.66, 0.72, 0.82];
      }
    }

    if (headlightIntensity > 0 && car.damage.lights > 0.05) {
      let dmgMult = Math.max(0.14, 1.0 - car.damage.lights * 0.78);
      if (car.damage.lights > 0.45 && Math.sin(this.elapsedRenderSec * 37.0) > 0.65) {
        dmgMult *= 0.25;
      }
      headlightIntensity *= dmgMult;
    }

    return {
      sunDir,
      sunColor,
      skyZenith,
      skyAmb,
      gndAmb,
      fogColor,
      fogDensity,
      cloudDensity,
      isNight,
      headlightIntensity,
    };
  }

  private computeCameraPose(
    car: CarPhysicsState,
    cameraMode: CameraMode,
    isTitleFlyover: boolean,
    flyoverTimeSec: number,
    dt: number
  ): {
    eyeX: number;
    eyeY: number;
    eyeZ: number;
    lookX: number;
    lookY: number;
    lookZ: number;
    upX: number;
    upY: number;
    upZ: number;
  } {
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);

    if (isTitleFlyover) {
      // Orbit around rear-quarter of WRC car so the Start Truss Arch + Alpine mountain horizon are framed ahead!
      const orbitAngle = car.yaw + Math.PI + 0.52 * Math.sin(flyoverTimeSec * 0.34);
      const dist = 6.1 + Math.cos(flyoverTimeSec * 0.26) * 0.9;
      const eyeX = car.x + Math.sin(orbitAngle) * dist;
      const eyeY = car.y + 2.05 + Math.sin(flyoverTimeSec * 0.42) * 0.32;
      const eyeZ = car.z + Math.cos(orbitAngle) * dist;
      return {
        eyeX,
        eyeY,
        eyeZ,
        lookX: car.x + sinY * 6.5,
        lookY: car.y + 1.25,
        lookZ: car.z + cosY * 6.5,
        upX: 0,
        upY: 1,
        upZ: 0,
      };
    }

    const shakeSq = this.camTrauma * this.camTrauma;
    const traumaRoll = shakeSq * 0.055 * Math.sin(this.elapsedRenderSec * 43.0);
    const traumaPitch = shakeSq * 0.28 * Math.cos(this.elapsedRenderSec * 51.0);

    const bumpVib =
      (car.wheels[0].compression - car.wheels[1].compression) * 0.08 +
      car.wheels[0].bottomedOutImpact * 0.04 * Math.sin(this.elapsedRenderSec * 65.0) +
      traumaRoll;

    if (cameraMode === 'cockpit') {
      const localX = -0.32;
      const localY = 1.08 - Math.max(0, car.wheels[0].compression - 0.08) * 0.32;
      const localZ = 0.06;

      const eyeX = car.x + localX * cosY + localZ * sinY;
      const eyeY = car.y + localY;
      const eyeZ = car.z - localX * sinY + localZ * cosY;

      const lookDist = 26.0;
      const lookYaw = car.yaw + car.steerAngleRad * 0.15;
      const lookX = eyeX + Math.sin(lookYaw) * lookDist;
      const lookY = eyeY - Math.sin(car.pitch * 1.3) * lookDist + traumaPitch;
      const lookZ = eyeZ + Math.cos(lookYaw) * lookDist;

      const rollAngle = car.roll * 1.2 + bumpVib;
      const upX = Math.sin(rollAngle) * cosY;
      const upY = Math.cos(rollAngle);
      const upZ = -Math.sin(rollAngle) * sinY;

      return { eyeX, eyeY, eyeZ, lookX, lookY, lookZ, upX, upY, upZ };
    }

    if (cameraMode === 'hood') {
      const eyeX = car.x + sinY * 0.92;
      const eyeY = car.y + 0.98 - Math.sin(car.pitch) * 0.92;
      const eyeZ = car.z + cosY * 0.92;

      const lookDist = 30.0;
      const lookX = eyeX + sinY * lookDist;
      const lookY = eyeY - Math.sin(car.pitch * 1.25) * lookDist - 0.32 + traumaPitch;
      const lookZ = eyeZ + cosY * lookDist;

      const rollAngle = car.roll * 1.15 + bumpVib;
      return {
        eyeX,
        eyeY,
        eyeZ,
        lookX,
        lookY,
        lookZ,
        upX: Math.sin(rollAngle) * cosY,
        upY: Math.cos(rollAngle),
        upZ: -Math.sin(rollAngle) * sinY,
      };
    }

    const isFar = cameraMode === 'chase_far';
    const baseDist = isFar ? 7.65 : 5.35;
    const baseHeight = isFar ? 2.85 : 2.05;
    const targetDist = baseDist + Math.min(0.9, Math.abs(car.forwardSpeedMs) * 0.024);
    const targetX = car.x - sinY * targetDist;
    const targetY = car.y + baseHeight + Math.max(0, -car.pitch * 1.5);
    const targetZ = car.z - cosY * targetDist;

    if (!this.chaseCamInitialized) {
      this.chaseCamX = targetX;
      this.chaseCamY = targetY;
      this.chaseCamZ = targetZ;
      this.chaseCamInitialized = true;
    } else {
      const damp = 1.0 - Math.exp(-(isFar ? 9.5 : 12.0) * dt);
      this.chaseCamX += (targetX - this.chaseCamX) * damp;
      this.chaseCamY += (targetY - this.chaseCamY) * damp;
      this.chaseCamZ += (targetZ - this.chaseCamZ) * damp;
    }

    const chaseRoll = car.roll * 0.42 + traumaRoll;
    return {
      eyeX: this.chaseCamX,
      eyeY: this.chaseCamY,
      eyeZ: this.chaseCamZ,
      lookX: car.x + sinY * 5.2,
      lookY: car.y + 0.95 - Math.sin(car.pitch) * 3.5 + traumaPitch,
      lookZ: car.z + cosY * 5.2,
      upX: Math.sin(chaseRoll) * cosY,
      upY: 1,
      upZ: -Math.sin(chaseRoll) * sinY,
    };
  }

  private drawStage(): void {
    if (!this.gl || !this.stageBuffer || this.stageVertexCount === 0) return;
    composeTransformMat4(this.modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.stageBuffer, this.stageVertexCount);
  }

  private drawPlayerCar(car: CarPhysicsState): void {
    const gl = this.gl;
    if (!gl || !this.carChassisBuffer || !this.wheelBuffer) return;

    // 1. Ground contact shadow when wheels are near road surface
    if (this.contactShadowBuffer && car.airborneTimeSec < 0.25) {
      gl.depthMask(false);
      gl.uniform1f(this.uAlphaLoc, 0.46);
      composeTransformMat4(this.modelMat, car.x, car.y, car.z, car.yaw, 0, 0, 1, 1, 1);
      gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
      this.bindAndDrawBuffer(this.contactShadowBuffer, this.contactShadowVertexCount);
      gl.uniform1f(this.uAlphaLoc, 1.0);
      gl.depthMask(true);
    }

    // 2. WRC Widebody Chassis
    const sprungY = car.y + 0.04;
    composeTransformMat4(
      this.modelMat,
      car.x,
      sprungY,
      car.z,
      car.yaw,
      car.pitch,
      car.roll,
      1,
      1,
      1
    );
    gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.carChassisBuffer, this.carChassisVertexCount);

    // 3. Dynamic High-Intensity Brake Light Strip when braking
    if (car.brake > 0.05 && this.brakeGlowBuffer) {
      this.bindAndDrawBuffer(this.brakeGlowBuffer, this.brakeGlowVertexCount);
    }

    // 4. Dynamic Twin Anti-Lag Exhaust Flame Cones on gear shifts / high-boost liftoff
    if (car.backfireTrigger > 0.03 && this.exhaustBackfireBuffer) {
      const flickerScale = 0.75 + Math.sin(this.elapsedRenderSec * 90.0) * 0.3;
      composeTransformMat4(
        this.modelMat,
        car.x,
        sprungY,
        car.z,
        car.yaw,
        car.pitch,
        car.roll,
        1,
        1,
        flickerScale
      );
      gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
      this.bindAndDrawBuffer(this.exhaustBackfireBuffer, this.exhaustBackfireVertexCount);
    }

    // 5. Independent 4 Wheels with Suspension Compression & Steering Angle
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const wheelPositions: Array<{ lx: number; lz: number; isFront: boolean; wIdx: number }> = [
      { lx: -0.81, lz: 1.28, isFront: true, wIdx: 0 },
      { lx: 0.81, lz: 1.28, isFront: true, wIdx: 1 },
      { lx: -0.81, lz: -1.28, isFront: false, wIdx: 2 },
      { lx: 0.81, lz: -1.28, isFront: false, wIdx: 3 },
    ];

    for (const wp of wheelPositions) {
      const wState = car.wheels[wp.wIdx];
      const wx = car.x + wp.lx * cosY + wp.lz * sinY;
      const wy = car.y + 0.33 + Math.max(0, wState.compression - 0.08) * 0.45;
      const wz = car.z - wp.lx * sinY + wp.lz * cosY;
      const wYaw = car.yaw + (wp.isFront ? car.steerAngleRad : 0);

      composeTransformMat4(this.modelMat, wx, wy, wz, wYaw, this.wheelSpinAngle, 0, 1, 1, 1);
      gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
      this.bindAndDrawBuffer(this.wheelBuffer, this.wheelVertexCount);
    }
  }

  private drawGhostCar(ghost: GhostSample): void {
    if (!this.gl || !this.ghostCarBuffer) return;
    this.gl.uniform1f(this.uAlphaLoc, 0.38);
    composeTransformMat4(
      this.modelMat,
      ghost.x,
      ghost.y + 0.05,
      ghost.z,
      ghost.yaw,
      ghost.pitch,
      ghost.roll,
      1,
      1,
      1
    );
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.ghostCarBuffer, this.ghostCarVertexCount);
    this.gl.uniform1f(this.uAlphaLoc, 1.0);
  }

  private drawHoodBonnet(car: CarPhysicsState): void {
    if (!this.gl || !this.hoodCameraBuffer) return;
    composeTransformMat4(
      this.modelMat,
      car.x,
      car.y,
      car.z,
      car.yaw,
      car.pitch,
      car.roll,
      1,
      1,
      1
    );
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.hoodCameraBuffer, this.hoodCameraVertexCount);
  }

  private drawCockpitAndSteeringWheel(car: CarPhysicsState): void {
    if (!this.gl || !this.cockpitInteriorBuffer || !this.steeringWheelBuffer) return;

    composeTransformMat4(
      this.modelMat,
      car.x,
      car.y,
      car.z,
      car.yaw,
      car.pitch,
      car.roll,
      1,
      1,
      1
    );
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.cockpitInteriorBuffer, this.cockpitInteriorVertexCount);

    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const lx = -0.32;
    const ly = 0.74 - Math.sin(car.pitch) * 0.36;
    const lz = 0.36;

    const swX = car.x + lx * cosY + lz * sinY;
    const swY = car.y + ly;
    const swZ = car.z - lx * sinY + lz * cosY;

    const wheelRotRad = -(car.steeringWheelDeg * Math.PI) / 180;
    composeTransformMat4(
      this.modelMat,
      swX,
      swY,
      swZ,
      car.yaw,
      car.pitch,
      car.roll + wheelRotRad,
      1,
      1,
      1
    );
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.steeringWheelBuffer, this.steeringWheelVertexCount);
  }

  private drawParticles(): void {
    if (!this.gl || !this.particleBuffer) return;
    const gl = this.gl;
    gl.depthMask(false);
    composeTransformMat4(this.modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);

    // Pass A: Soft low-opacity wheel dust/snow/spray puffs
    this.particleMeshBuilder.clear();
    let puffCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active || p.isStreak) continue;
      puffCount++;
      const lifeRatio = 1.0 - p.age / p.maxAge;
      const curSize = p.size * (0.72 + (1.0 - lifeRatio) * 0.65) * (0.35 + 0.65 * lifeRatio);
      this.particleMeshBuilder.addBox(
        p.x,
        p.y,
        p.z,
        curSize,
        curSize * 0.58,
        curSize,
        p.r,
        p.g,
        p.b,
        6
      );
    }
    if (puffCount > 0) {
      const arr = this.particleMeshBuilder.getFloat32Array();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      gl.uniform1f(this.uAlphaLoc, 0.25);
      this.bindAndDrawBuffer(this.particleBuffer, arr.length / FLOATS_PER_VERTEX);
    }

    // Pass B: Crisp thin weather rain streaks
    this.particleMeshBuilder.clear();
    let streakCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active || !p.isStreak) continue;
      streakCount++;
      this.particleMeshBuilder.addBox(p.x, p.y, p.z, p.size, 0.52, p.size, p.r, p.g, p.b, 6);
    }
    if (streakCount > 0) {
      const arr = this.particleMeshBuilder.getFloat32Array();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      gl.uniform1f(this.uAlphaLoc, 0.46);
      this.bindAndDrawBuffer(this.particleBuffer, arr.length / FLOATS_PER_VERTEX);
    }

    gl.uniform1f(this.uAlphaLoc, 1.0);
    gl.depthMask(true);
  }

  private bindAndDrawBuffer(buffer: WebGLBuffer, vertexCount: number): void {
    const gl = this.gl;
    if (!gl) return;
    const stride = FLOATS_PER_VERTEX * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    if (this.aPosLoc >= 0) {
      gl.enableVertexAttribArray(this.aPosLoc);
      gl.vertexAttribPointer(this.aPosLoc, 3, gl.FLOAT, false, stride, 0);
    }
    if (this.aNormalLoc >= 0) {
      gl.enableVertexAttribArray(this.aNormalLoc);
      gl.vertexAttribPointer(this.aNormalLoc, 3, gl.FLOAT, false, stride, 12);
    }
    if (this.aColorLoc >= 0) {
      gl.enableVertexAttribArray(this.aColorLoc);
      gl.vertexAttribPointer(this.aColorLoc, 3, gl.FLOAT, false, stride, 24);
    }
    if (this.aMatTypeLoc >= 0) {
      gl.enableVertexAttribArray(this.aMatTypeLoc);
      gl.vertexAttribPointer(this.aMatTypeLoc, 1, gl.FLOAT, false, stride, 36);
    }

    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  }

  private createStaticBuffer(data: Float32Array): WebGLBuffer {
    const gl = this.gl!;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  private createShaderProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl!;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link error: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
}
