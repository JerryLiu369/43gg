import {
  CameraMode,
  CarPhysicsState,
  GhostSample,
  StageDefinition,
  TimeOfDay,
  WeatherType,
} from '../game/types.ts';
import {
  Mat4,
  composeTransformMat4,
  createMat4,
  lookAtMat4,
  multiplyMat4,
  perspectiveMat4,
} from './math3d.ts';
import {
  DynamicMeshBuilder,
  FLOATS_PER_VERTEX,
  buildCockpitInteriorMesh,
  buildHoodCameraMesh,
  buildRallyCarChassisMesh,
  buildStageStaticMesh,
  buildSteeringWheelAndHandsMesh,
  buildWheelMesh,
} from './meshBuilder.ts';

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

// Headlight cone uniforms for Night / Dusk / Fog stages
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

  // Emissive material (lamps, brake lights, ghost car, shift LEDs)
  if (vMatType > 2.5 && vMatType < 3.5) {
    float dist = length(vWorldPos - uCamPos);
    float fogFactor = clamp(exp(-dist * uFogDensity * 0.65), 0.0, 1.0);
    vec3 col = mix(uFogColor, baseColor * 1.25, fogFactor);
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
  float specPower = (vMatType > 4.5) ? 48.0 : (vMatType > 1.5 && vMatType < 2.5) ? 28.0 : 8.0;
  float specStrength = (vMatType > 4.5) ? 0.55 : (vMatType > 1.5 && vMatType < 2.5) ? 0.38 : 0.06;
  float spec = pow(max(dot(N, H), 0.0), specPower) * specStrength;

  // Dual Rally Headlight Cone Illumination
  vec3 headlightContrib = vec3(0.0);
  if (uHeadlightIntensity > 0.01) {
    vec3 toFrag = vWorldPos - uHeadlightPos;
    float dLight = length(toFrag);
    if (dLight < 135.0 && dLight > 0.5) {
      vec3 L = toFrag / dLight;
      float spotCos = dot(L, uHeadlightDir);
      // Wide flood beam + intense long-throw central rally spot beam
      if (spotCos > 0.72) {
        float spotCone = smoothstep(0.72, 0.96, spotCos);
        float atten = 1.0 / (1.0 + dLight * 0.018 + dLight * dLight * 0.00038);
        float hNdotL = max(dot(N, -L), 0.22);
        // Retro-reflective roadside chevrons (matType == 4) bounce intense light back to driver!
        float retroBoost = (vMatType > 3.5 && vMatType < 4.5) ? 4.2 : 1.0;
        headlightContrib = vec3(1.0, 0.95, 0.84) * spotCone * atten * hNdotL * uHeadlightIntensity * retroBoost * 2.4;
      }
    }
  }

  vec3 litColor = baseColor * (ambient + diffuse) + vec3(spec) + baseColor * headlightContrib;

  // Distance exponential horizon fog
  float dist = length(vWorldPos - uCamPos);
  float fogFactor = clamp(exp(-dist * uFogDensity), 0.0, 1.0);
  vec3 finalColor = mix(uFogColor, litColor, fogFactor);

  gl_FragColor = vec4(finalColor, uAlpha);
}
`;

interface Particle {
  active: boolean;
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

const MAX_PARTICLES = 220;

export class RallyWebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private isHeadless: boolean;

  // Attribute & Uniform locations
  private aPosLoc: number;
  private aNormalLoc: number;
  private aColorLoc: number;
  private aMatTypeLoc: number;

  private uViewProjLoc: WebGLUniformLocation | null;
  private uModelLoc: WebGLUniformLocation | null;
  private uCamPosLoc: WebGLUniformLocation | null;
  private uSunDirLoc: WebGLUniformLocation | null;
  private uSunColorLoc: WebGLUniformLocation | null;
  private uSkyAmbientLoc: WebGLUniformLocation | null;
  private uGroundAmbientLoc: WebGLUniformLocation | null;
  private uFogColorLoc: WebGLUniformLocation | null;
  private uFogDensityLoc: WebGLUniformLocation | null;
  private uHeadlightPosLoc: WebGLUniformLocation | null;
  private uHeadlightDirLoc: WebGLUniformLocation | null;
  private uHeadlightIntensityLoc: WebGLUniformLocation | null;
  private uAlphaLoc: WebGLUniformLocation | null;

  // Static & dynamic GPU buffers
  private stageBuffer: WebGLBuffer | null = null;
  private stageVertexCount = 0;
  private currentStageId = '';

  private carChassisBuffer: WebGLBuffer | null = null;
  private carChassisVertexCount = 0;

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

  // Pre-allocated scratch matrices (Zero GC inside render loop)
  private projMat: Mat4 = createMat4();
  private viewMat: Mat4 = createMat4();
  private viewProjMat: Mat4 = createMat4();
  private modelMat: Mat4 = createMat4();

  // Smoothly damped chase camera state
  private chaseCamX = 0;
  private chaseCamY = 14;
  private chaseCamZ = -6;
  private chaseCamInitialized = false;
  private wheelSpinAngle = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    const gl =
      canvas.getContext('webgl2', { antialias: !this.isHeadless, alpha: false, preserveDrawingBuffer: true }) ||
      canvas.getContext('webgl', { antialias: !this.isHeadless, alpha: false, preserveDrawingBuffer: true });

    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;

    this.program = this.createShaderProgram(VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC);
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

    // Initialize static vehicle & cockpit meshes
    const chassisData = buildRallyCarChassisMesh(false);
    this.carChassisBuffer = this.createStaticBuffer(chassisData);
    this.carChassisVertexCount = chassisData.length / FLOATS_PER_VERTEX;

    const ghostData = buildRallyCarChassisMesh(true);
    this.ghostCarBuffer = this.createStaticBuffer(ghostData);
    this.ghostCarVertexCount = ghostData.length / FLOATS_PER_VERTEX;

    const wheelData = buildWheelMesh();
    this.wheelBuffer = this.createStaticBuffer(wheelData);
    this.wheelVertexCount = wheelData.length / FLOATS_PER_VERTEX;

    const cockpitData = buildCockpitInteriorMesh();
    this.cockpitInteriorBuffer = this.createStaticBuffer(cockpitData);
    this.cockpitInteriorVertexCount = cockpitData.length / FLOATS_PER_VERTEX;

    const hoodData = buildHoodCameraMesh();
    this.hoodCameraBuffer = this.createStaticBuffer(hoodData);
    this.hoodCameraVertexCount = hoodData.length / FLOATS_PER_VERTEX;

    const steerWheelData = buildSteeringWheelAndHandsMesh();
    this.steeringWheelBuffer = this.createStaticBuffer(steerWheelData);
    this.steeringWheelVertexCount = steerWheelData.length / FLOATS_PER_VERTEX;

    this.particleBuffer = gl.createBuffer();

    // Initialize fixed-size particle pool (Zero GC)
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
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

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  public setStage(stage: StageDefinition): void {
    if (this.currentStageId === stage.id && this.stageBuffer) return;
    this.currentStageId = stage.id;
    if (this.stageBuffer) {
      this.gl.deleteBuffer(this.stageBuffer);
    }
    const stageData = buildStageStaticMesh(stage);
    this.stageBuffer = this.createStaticBuffer(stageData);
    this.stageVertexCount = stageData.length / FLOATS_PER_VERTEX;
    this.chaseCamInitialized = false;
    for (const p of this.particles) p.active = false;
  }

  public resize(width: number, height: number): void {
    const dpr = this.isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.floor(width * dpr));
    const targetH = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  public dispose(): void {
    const gl = this.gl;
    if (this.stageBuffer) gl.deleteBuffer(this.stageBuffer);
    if (this.carChassisBuffer) gl.deleteBuffer(this.carChassisBuffer);
    if (this.ghostCarBuffer) gl.deleteBuffer(this.ghostCarBuffer);
    if (this.wheelBuffer) gl.deleteBuffer(this.wheelBuffer);
    if (this.cockpitInteriorBuffer) gl.deleteBuffer(this.cockpitInteriorBuffer);
    if (this.hoodCameraBuffer) gl.deleteBuffer(this.hoodCameraBuffer);
    if (this.steeringWheelBuffer) gl.deleteBuffer(this.steeringWheelBuffer);
    if (this.particleBuffer) gl.deleteBuffer(this.particleBuffer);
    gl.deleteProgram(this.program);
  }

  /**
   * Emits surface feedback particles (gravel stones, dust clouds, snow mist, water spray, mud clods)
   * and ambient weather precipitation (rain/snow).
   */
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

    // 1. Tire surface roost & dust/snow/water spray when moving & sliding
    if (speed > 2.5 && (car.wheels[2].isGrounded || car.wheels[3].isGrounded)) {
      const emitChance = Math.min(1.0, (speed / 25) * 0.55 + maxSlip * 0.45);
      if (Math.random() < emitChance) {
        const sinY = Math.sin(car.yaw);
        const cosY = Math.cos(car.yaw);
        const sideSign = Math.random() < 0.5 ? -0.78 : 0.78;
        // Rear wheel contact point in world space
        const wx = car.x - sinY * 1.28 + cosY * sideSign;
        const wy = car.y + 0.15;
        const wz = car.z - cosY * 1.28 - sinY * sideSign;

        let r = 0.64, g = 0.55, b = 0.44;
        let size = 0.22 + Math.min(0.45, maxSlip * 0.22);
        let maxAge = 0.85;
        let upVel = 1.6 + Math.random() * 1.8;

        if (car.currentSurface === 'gravel' || car.currentSurface === 'tarmac_dirty') {
          // Gravel stones + lingering dust plume
          if (Math.random() < 0.35) {
            // Fast flying gravel stone pebble
            r = 0.42; g = 0.36; b = 0.28;
            size = 0.09;
            maxAge = 0.45;
            upVel = 2.8 + Math.random() * 2.2;
          } else {
            // Lingering dust cloud
            r = 0.68; g = 0.59; b = 0.47;
            size = 0.38 + Math.min(0.55, maxSlip * 0.3);
            maxAge = 1.25;
          }
        } else if (car.currentSurface === 'snow' || car.currentSurface === 'ice') {
          r = 0.90; g = 0.94; b = 0.99;
          size = 0.34 + Math.min(0.45, maxSlip * 0.25);
          maxAge = 0.95;
        } else if (car.currentSurface === 'water_puddle') {
          r = 0.72; g = 0.84; b = 0.94;
          size = 0.28;
          upVel = 3.4 + Math.random() * 2.0;
          maxAge = 0.55;
        } else if (car.currentSurface === 'offtrack') {
          // Mud & grass clods
          r = 0.28; g = 0.23; b = 0.16;
          size = 0.16;
          upVel = 2.5 + Math.random() * 1.8;
          maxAge = 0.6;
        } else {
          // Tarmac tire smoke only when combinedSlip > 1.15
          if (maxSlip > 1.15) {
            r = 0.82; g = 0.84; b = 0.88;
            size = 0.32;
            maxAge = 0.75;
          } else {
            size = 0;
          }
        }

        if (size > 0) {
          this.spawnParticle(
            wx,
            wy,
            wz,
            -sinY * speed * 0.35 + (Math.random() - 0.5) * 2.5,
            upVel,
            -cosY * speed * 0.35 + (Math.random() - 0.5) * 2.5,
            size,
            maxAge,
            r,
            g,
            b
          );
        }
      }
    }

    // 2. Weather precipitation (Rain streaks or Snowflakes ahead of the car)
    if (weather === 'rain' || weather === 'snow') {
      const sinY = Math.sin(car.yaw);
      const cosY = Math.cos(car.yaw);
      for (let k = 0; k < 2; k++) {
        const ahead = 4 + Math.random() * 28;
        const spread = (Math.random() - 0.5) * 22;
        const px = car.x + sinY * ahead + cosY * spread;
        const py = car.y + 4.5 + Math.random() * 5.0;
        const pz = car.z + cosY * ahead - sinY * spread;

        if (weather === 'rain') {
          this.spawnParticle(px, py, pz, -0.5, -14.0, -0.5, 0.06, 0.4, 0.68, 0.78, 0.90);
        } else {
          this.spawnParticle(
            px,
            py,
            pz,
            (Math.random() - 0.5) * 1.8,
            -3.2,
            (Math.random() - 0.5) * 1.8,
            0.11,
            1.2,
            0.94,
            0.96,
            1.0
          );
        }
      }
    }

    // Advance active particles
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
      p.vy -= 4.2 * dt; // Gentle gravity
    }
  }

  private spawnParticle(
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

  /**
   * Main render entry point.
   */
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
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    gl.useProgram(this.program);

    // 1. Configure Lighting & Atmosphere Uniforms based on TimeOfDay & Weather
    const env = this.getAtmosphereParams(weather, timeOfDay, car);
    gl.uniform3f(this.uSunDirLoc, env.sunDir[0], env.sunDir[1], env.sunDir[2]);
    gl.uniform3f(this.uSunColorLoc, env.sunColor[0], env.sunColor[1], env.sunColor[2]);
    gl.uniform3f(this.uSkyAmbientLoc, env.skyAmb[0], env.skyAmb[1], env.skyAmb[2]);
    gl.uniform3f(this.uGroundAmbientLoc, env.gndAmb[0], env.gndAmb[1], env.gndAmb[2]);
    gl.uniform3f(this.uFogColorLoc, env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    gl.uniform1f(this.uFogDensityLoc, env.fogDensity);

    // Headlight beam direction & position in world space
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const hlX = car.x + sinY * 1.95;
    const hlY = car.y + 0.82 - Math.sin(car.pitch) * 1.95;
    const hlZ = car.z + cosY * 1.95;
    const hlDirX = sinY * Math.cos(car.pitch);
    const hlDirY = -Math.sin(car.pitch) - 0.04;
    const hlDirZ = cosY * Math.cos(car.pitch);

    gl.uniform3f(this.uHeadlightPosLoc, hlX, hlY, hlZ);
    gl.uniform3f(this.uHeadlightDirLoc, hlDirX, hlDirY, hlDirZ);
    gl.uniform1f(this.uHeadlightIntensityLoc, env.headlightIntensity);

    // Advance wheel rotation angle
    this.wheelSpinAngle = (this.wheelSpinAngle + (car.forwardSpeedMs / 0.33) * dt) % (Math.PI * 2);

    // 2. Render Main Full-Screen Viewport
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, w, h);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = w / Math.max(1, h);
    // Dynamic speed FOV widening in chase/hood view, natural 62 deg FOV in cockpit
    const speedFovBoost = Math.min(0.14, Math.abs(car.forwardSpeedMs) * 0.003);
    const baseFovRad = cameraMode === 'cockpit' ? 1.08 : 1.05 + speedFovBoost;
    perspectiveMat4(this.projMat, baseFovRad, aspect, 0.12, 420.0);

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

    gl.uniformMatrix4fv(this.uViewProjLoc, false, this.viewProjMat);
    gl.uniform3f(this.uCamPosLoc, cam.eyeX, cam.eyeY, cam.eyeZ);
    gl.uniform1f(this.uAlphaLoc, 1.0);

    // Draw 3D Stage & Roadside Obstacles
    this.drawStage();

    // Draw Personal Best Ghost Car if present
    if (ghostSample && !isTitleFlyover) {
      this.drawGhostCar(ghostSample);
    }

    // Draw Player Car (in Chase or Title Flyover) OR Draw 3D Cockpit Interior & Steering Wheel (in Cockpit mode)
    if (isTitleFlyover || cameraMode === 'chase') {
      this.drawPlayerCar(car);
    } else if (cameraMode === 'cockpit') {
      this.drawCockpitAndSteeringWheel(car);
    } else if (cameraMode === 'hood') {
      this.drawHoodBonnet(car);
    }

    // Draw 3D Particles (Gravel, Dust, Snow, Water, Rain)
    this.drawParticles();

    // 3. In Cockpit Mode during gameplay: Render Functional 3D Rear-View Mirror Pass at Top-Center!
    if (!isTitleFlyover && cameraMode === 'cockpit' && w >= 480) {
      const mirrorW = Math.floor(Math.min(w * 0.28, 340));
      const mirrorH = Math.floor(Math.min(h * 0.095, 76));
      const mirrorX = Math.floor((w - mirrorW) * 0.5);
      const mirrorY = Math.floor(h - mirrorH - h * 0.025);

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(mirrorX, mirrorY, mirrorW, mirrorH);
      gl.viewport(mirrorX, mirrorY, mirrorW, mirrorH);
      gl.clearColor(env.fogColor[0] * 0.85, env.fogColor[1] * 0.85, env.fogColor[2] * 0.85, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      perspectiveMat4(this.projMat, 0.95, mirrorW / Math.max(1, mirrorH), 0.2, 240.0);
      // Rear-facing camera looking out the back window
      const rearEyeX = car.x - sinY * 0.8;
      const rearEyeY = car.y + 1.12;
      const rearEyeZ = car.z - cosY * 0.8;
      const rearLookX = car.x - sinY * 30.0;
      const rearLookY = car.y + 0.85;
      const rearLookZ = car.z - cosY * 30.0;

      lookAtMat4(this.viewMat, rearEyeX, rearEyeY, rearEyeZ, rearLookX, rearLookY, rearLookZ, 0, 1, 0);
      multiplyMat4(this.viewProjMat, this.projMat, this.viewMat);

      gl.uniformMatrix4fv(this.uViewProjLoc, false, this.viewProjMat);
      gl.uniform3f(this.uCamPosLoc, rearEyeX, rearEyeY, rearEyeZ);

      this.drawStage();
      this.drawParticles();
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  private getAtmosphereParams(
    weather: WeatherType,
    timeOfDay: TimeOfDay,
    car: CarPhysicsState
  ): {
    sunDir: [number, number, number];
    sunColor: [number, number, number];
    skyAmb: [number, number, number];
    gndAmb: [number, number, number];
    fogColor: [number, number, number];
    fogDensity: number;
    headlightIntensity: number;
  } {
    let sunDir: [number, number, number] = [0.42, 0.78, 0.45];
    let sunColor: [number, number, number] = [1.0, 0.96, 0.90];
    let skyAmb: [number, number, number] = [0.48, 0.56, 0.68];
    let gndAmb: [number, number, number] = [0.22, 0.24, 0.20];
    let fogColor: [number, number, number] = [0.62, 0.72, 0.84];
    let fogDensity = 0.0045;
    let headlightIntensity = 0.0;

    if (timeOfDay === 'dusk') {
      // Golden hour low-angle sidelight & warm amber horizon
      sunDir = [0.82, 0.22, -0.52];
      sunColor = [1.18, 0.62, 0.28];
      skyAmb = [0.44, 0.34, 0.48];
      gndAmb = [0.18, 0.14, 0.16];
      fogColor = [0.76, 0.45, 0.32];
      fogDensity = 0.0055;
      headlightIntensity = 0.65;
    } else if (timeOfDay === 'night') {
      // Deep alpine night: relies heavily on intact rally headlight pods!
      sunDir = [-0.25, 0.85, -0.45];
      sunColor = [0.07, 0.10, 0.18];
      skyAmb = [0.04, 0.06, 0.11];
      gndAmb = [0.02, 0.03, 0.05];
      fogColor = [0.03, 0.05, 0.09];
      fogDensity = 0.0095;
      headlightIntensity = 1.35;
    }

    // Weather overrides
    if (weather === 'rain') {
      fogDensity *= 1.55;
      sunColor = [sunColor[0] * 0.55, sunColor[1] * 0.58, sunColor[2] * 0.65];
      if (timeOfDay === 'day') {
        fogColor = [0.38, 0.43, 0.49];
        skyAmb = [0.34, 0.38, 0.44];
      }
      headlightIntensity = Math.max(headlightIntensity, 0.55);
    } else if (weather === 'fog') {
      fogDensity = 0.0185;
      if (timeOfDay !== 'night') {
        fogColor = [0.68, 0.71, 0.75];
      }
      headlightIntensity = Math.max(headlightIntensity, 0.75);
    } else if (weather === 'snow') {
      fogDensity = 0.0085;
      if (timeOfDay === 'day') {
        fogColor = [0.78, 0.83, 0.90];
        skyAmb = [0.64, 0.70, 0.80];
      }
    }

    // Apply headlight damage (dimming + occasional electrical flicker when damaged > 0.45)
    if (headlightIntensity > 0 && car.damage.lights > 0.05) {
      let dmgMult = Math.max(0.14, 1.0 - car.damage.lights * 0.78);
      if (car.damage.lights > 0.45 && Math.sin(performance.now() * 0.037) > 0.65) {
        dmgMult *= 0.25;
      }
      headlightIntensity *= dmgMult;
    }

    return {
      sunDir,
      sunColor,
      skyAmb,
      gndAmb,
      fogColor,
      fogDensity,
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
      // Smooth orbital flyover around the staged rally car on the start line
      const orbitAngle = car.yaw + 0.55 + Math.sin(flyoverTimeSec * 0.32) * 0.65;
      const dist = 6.2 + Math.cos(flyoverTimeSec * 0.25) * 1.2;
      const eyeX = car.x + Math.sin(orbitAngle) * dist;
      const eyeY = car.y + 2.15 + Math.sin(flyoverTimeSec * 0.4) * 0.45;
      const eyeZ = car.z + Math.cos(orbitAngle) * dist;
      return {
        eyeX,
        eyeY,
        eyeZ,
        lookX: car.x + sinY * 1.4,
        lookY: car.y + 0.85,
        lookZ: car.z + cosY * 1.4,
        upX: 0,
        upY: 1,
        upZ: 0,
      };
    }

    // Subtle high-frequency road vibration transferred through chassis suspension
    const bumpVib =
      (car.wheels[0].compression - car.wheels[1].compression) * 0.08 +
      car.wheels[0].bottomedOutImpact * 0.04 * Math.sin(performance.now() * 0.08);

    if (cameraMode === 'cockpit') {
      // Driver eye position inside cockpit (left-hand drive seat: -0.32m left, +1.08m high, +0.05m forward)
      const localX = -0.32;
      const localY = 1.07 - Math.max(0, car.wheels[0].compression - 0.08) * 0.35;
      const localZ = 0.04;

      const eyeX = car.x + localX * cosY + localZ * sinY;
      const eyeY = car.y + localY;
      const eyeZ = car.z - localX * sinY + localZ * cosY;

      // Pitch and Roll genuinely tilt the driver's horizon & sightline!
      const lookDist = 25.0;
      const lookYaw = car.yaw + car.steerAngleRad * 0.14; // Subtle head-turn into apex
      const lookX = eyeX + Math.sin(lookYaw) * lookDist;
      const lookY = eyeY - Math.sin(car.pitch * 1.35) * lookDist;
      const lookZ = eyeZ + Math.cos(lookYaw) * lookDist;

      const rollAngle = car.roll * 1.25 + bumpVib;
      const upX = Math.sin(rollAngle) * cosY;
      const upY = Math.cos(rollAngle);
      const upZ = -Math.sin(rollAngle) * sinY;

      return { eyeX, eyeY, eyeZ, lookX, lookY, lookZ, upX, upY, upZ };
    }

    if (cameraMode === 'hood') {
      // Bonnet/hood camera mounted center-front ahead of windshield
      const eyeX = car.x + sinY * 0.92;
      const eyeY = car.y + 0.98 - Math.sin(car.pitch) * 0.92;
      const eyeZ = car.z + cosY * 0.92;

      const lookDist = 30.0;
      const lookX = eyeX + sinY * lookDist;
      const lookY = eyeY - Math.sin(car.pitch * 1.25) * lookDist - 0.35;
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

    // Chase Camera with exponential damping & slip-angle lag so powerslides look dramatic
    const targetDist = 5.45 + Math.min(0.85, Math.abs(car.forwardSpeedMs) * 0.022);
    const targetX = car.x - sinY * targetDist;
    const targetY = car.y + 2.08 + Math.max(0, -car.pitch * 1.5);
    const targetZ = car.z - cosY * targetDist;

    if (!this.chaseCamInitialized) {
      this.chaseCamX = targetX;
      this.chaseCamY = targetY;
      this.chaseCamZ = targetZ;
      this.chaseCamInitialized = true;
    } else {
      const damp = 1.0 - Math.exp(-11.5 * dt);
      this.chaseCamX += (targetX - this.chaseCamX) * damp;
      this.chaseCamY += (targetY - this.chaseCamY) * damp;
      this.chaseCamZ += (targetZ - this.chaseCamZ) * damp;
    }

    return {
      eyeX: this.chaseCamX,
      eyeY: this.chaseCamY,
      eyeZ: this.chaseCamZ,
      lookX: car.x + sinY * 4.5,
      lookY: car.y + 0.92 - Math.sin(car.pitch) * 3.5,
      lookZ: car.z + cosY * 4.5,
      upX: Math.sin(car.roll * 0.45) * cosY,
      upY: 1,
      upZ: -Math.sin(car.roll * 0.45) * sinY,
    };
  }

  private drawStage(): void {
    if (!this.stageBuffer || this.stageVertexCount === 0) return;
    composeTransformMat4(this.modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.stageBuffer, this.stageVertexCount);
  }

  private drawPlayerCar(car: CarPhysicsState): void {
    if (!this.carChassisBuffer || !this.wheelBuffer) return;

    // 1. Draw sprung chassis with real pitch & roll attitude
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
    this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    this.bindAndDrawBuffer(this.carChassisBuffer, this.carChassisVertexCount);

    // 2. Draw 4 independently articulating wheels
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
      // Wheel vertical position reflects suspension travel/compression
      const wy = car.y + 0.33 + Math.max(0, wState.compression - 0.08) * 0.45;
      const wz = car.z - wp.lx * sinY + wp.lz * cosY;
      const wYaw = car.yaw + (wp.isFront ? car.steerAngleRad : 0);

      composeTransformMat4(this.modelMat, wx, wy, wz, wYaw, this.wheelSpinAngle, 0, 1, 1, 1);
      this.gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
      this.bindAndDrawBuffer(this.wheelBuffer, this.wheelVertexCount);
    }
  }

  private drawGhostCar(ghost: GhostSample): void {
    if (!this.ghostCarBuffer) return;
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
    if (!this.hoodCameraBuffer) return;
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
    if (!this.cockpitInteriorBuffer || !this.steeringWheelBuffer) return;

    // 1. Draw Cockpit Interior anchored to car sprung body
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

    // 2. Draw 3D Steering Wheel + Driver Hands positioned at (-0.32, 0.81, 0.36) in car local space
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const lx = -0.32;
    const ly = 0.81 - Math.sin(car.pitch) * 0.36;
    const lz = 0.36;

    const swX = car.x + lx * cosY + lz * sinY;
    const swY = car.y + ly;
    const swZ = car.z - lx * sinY + lz * cosY;

    // Steering wheel rotates cleanly around its Z shaft axis
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
    if (!this.particleBuffer) return;
    this.particleMeshBuilder.clear();

    let activeCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      activeCount++;
      const lifeRatio = 1.0 - p.age / p.maxAge;
      const curSize = p.size * (1.0 + (1.0 - lifeRatio) * 1.35);
      this.particleMeshBuilder.addBox(
        p.x,
        p.y,
        p.z,
        curSize,
        curSize,
        curSize,
        p.r * lifeRatio,
        p.g * lifeRatio,
        p.b * lifeRatio,
        0
      );
    }

    if (activeCount === 0) return;

    const gl = this.gl;
    const arr = this.particleMeshBuilder.getFloat32Array();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);

    composeTransformMat4(this.modelMat, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMat);
    gl.uniform1f(this.uAlphaLoc, 0.72);
    this.bindAndDrawBuffer(this.particleBuffer, arr.length / FLOATS_PER_VERTEX);
    gl.uniform1f(this.uAlphaLoc, 1.0);
  }

  private bindAndDrawBuffer(buffer: WebGLBuffer, vertexCount: number): void {
    const gl = this.gl;
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
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  private createShaderProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
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
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
}
