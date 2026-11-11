import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sampleStageAtWorldPos } from '../game/stages.ts';
import type {
  CameraMode,
  CarPhysicsState,
  GhostSample,
  StageDefinition,
  TimeOfDay,
  WeatherType,
} from '../game/types.ts';
import {
  applyCarPoseToObject,
  createWrcRallyCarRig,
  getCarBasisVectors,
  updateWrcCarRigFromState,
} from './rallyCarModel.ts';
import type { WrcCarRig } from './rallyCarModel.ts';
import { buildThreeStageScene } from './rallyStageScene.ts';
import type { BuiltStageScene } from './rallyStageScene.ts';

interface DustParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const MAX_DUST = 96;
const WEATHER_DROPS = 140;

// Reusable math objects (Zero GC inside per-frame render!)
const _carRight = new THREE.Vector3();
const _carUp = new THREE.Vector3();
const _carFwd = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _tmpColor = new THREE.Color();

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RallyWebGLRenderer {
  public readonly isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envTex: THREE.Texture;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private fog: THREE.FogExp2;

  private carRig: WrcCarRig;
  private activeStage: StageDefinition | null = null;
  private builtStage: BuiltStageScene | null = null;

  // Pooled Dust / Spray / Snow Plume InstancedMesh
  private dustParticles: DustParticle[] = [];
  private dustCursor = 0;
  private dustSpawnAccum = 0;
  private dustMesh: THREE.InstancedMesh;
  private dustGeom: THREE.BufferGeometry;
  private dustMat: THREE.MeshBasicMaterial;

  // Pooled Rain / Snowfall Weather InstancedMesh
  private weatherMesh: THREE.InstancedMesh;
  private weatherGeom: THREE.BufferGeometry;
  private weatherMat: THREE.MeshBasicMaterial;
  private weatherOffsets: Float32Array;

  // Exponentially damped camera tracking vectors
  private camPosInitialized = false;
  private smoothCamPos = new THREE.Vector3(0, 26, 8);
  private smoothLookAt = new THREE.Vector3(0, 24, -12);
  private lastCameraMode: CameraMode | 'title' = 'title';

  constructor(canvas: HTMLCanvasElement) {
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = canvas.clientWidth || window.innerWidth || 1280;
    const initH = canvas.clientHeight || window.innerHeight || 720;
    this.renderer.setSize(initW, initH, false);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x9ec2e6, 0.0028);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x8bb6e0);

    // Mandatory Studio Environment Map (RoomEnvironment + PMREMGenerator) on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, initW / Math.max(1, initH), 0.18, 950);

    // Balanced Warm Key Light + Cool Sky/Ground Hemisphere Fill
    this.hemiLight = new THREE.HemisphereLight(0xbce0ff, 0x4b553a, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 2.35);
    this.sunLight.position.set(60, 95, 45);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 260;
      const d = 48;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0005;
      this.sunLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.carRig = createWrcRallyCarRig(maxAniso, this.isSoftwareGl);
    this.scene.add(this.carRig.root);
    this.scene.add(this.carRig.contactShadow);
    this.scene.add(this.carRig.ghostRoot);

    // Initialize Pooled Dust / Spray Plume InstancedMesh
    for (let i = 0; i < MAX_DUST; i++) {
      this.dustParticles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        size: 0.4,
        r: 0.8,
        g: 0.7,
        b: 0.55,
      });
    }
    this.dustGeom = new THREE.DodecahedronGeometry(0.45, 0);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.dustMesh = new THREE.InstancedMesh(this.dustGeom, this.dustMat, MAX_DUST);
    this.dustMesh.frustumCulled = false;
    for (let i = 0; i < MAX_DUST; i++) {
      _dummyObj.position.set(0, -500, 0);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      this.dustMesh.setMatrixAt(i, _dummyObj.matrix);
      this.dustMesh.setColorAt(i, _tmpColor.setRGB(1, 1, 1));
    }
    this.scene.add(this.dustMesh);

    // Initialize Pooled Weather Precipitation InstancedMesh
    this.weatherGeom = new THREE.BoxGeometry(0.035, 0.45, 0.035);
    this.weatherMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.weatherMesh = new THREE.InstancedMesh(this.weatherGeom, this.weatherMat, WEATHER_DROPS);
    this.weatherMesh.frustumCulled = false;
    this.weatherMesh.visible = false;
    this.weatherOffsets = new Float32Array(WEATHER_DROPS * 3);
    for (let i = 0; i < WEATHER_DROPS; i++) {
      this.weatherOffsets[i * 3] = (Math.random() - 0.5) * 34;
      this.weatherOffsets[i * 3 + 1] = Math.random() * 16;
      this.weatherOffsets[i * 3 + 2] = (Math.random() - 0.5) * 38;
    }
    this.scene.add(this.weatherMesh);
  }

  /**
   * Software-WebGL frame pacing helper (`gl.fenceSync` + 80ms breathe pause)
   * so headless Chromium / SwiftShader never starves the main thread or times out screenshots!
   */
  public afterDraw(cb: () => void, scheduleTimeout: (fn: () => void, ms: number) => number): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl || typeof gl.fenceSync !== 'function') {
      scheduleTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!sync) {
        scheduleTimeout(cb, 80);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        scheduleTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        scheduleTimeout(cb, 80);
      }
    };
    scheduleTimeout(poll, 5);
  }

  public setStage(stage: StageDefinition): void {
    if (this.activeStage?.id === stage.id && this.builtStage) {
      return;
    }
    if (this.builtStage) {
      this.scene.remove(this.builtStage.group);
      this.builtStage.dispose();
      this.builtStage = null;
    }
    this.activeStage = stage;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.builtStage = buildThreeStageScene(stage, maxAniso, this.isSoftwareGl);
    this.scene.add(this.builtStage.group);
    this.camPosInitialized = false;

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public updateParticles(car: CarPhysicsState, _weather: WeatherType, dt: number): void {
    const speed = Math.abs(car.forwardSpeedMs);
    const rearSlip = Math.max(car.wheels[2].combinedSlip, car.wheels[3].combinedSlip);
    const isDusty =
      car.currentSurface === 'gravel' ||
      car.currentSurface === 'snow' ||
      car.currentSurface === 'water_puddle' ||
      car.currentSurface === 'offtrack' ||
      rearSlip > 0.85;

    if (car.airborneTimeSec <= 0 && speed > 4.5 && isDusty) {
      const rate = Math.min(48, speed * 1.15 + rearSlip * 18);
      this.dustSpawnAccum += rate * dt;

      getCarBasisVectors(car.yaw, car.pitch, car.roll, _carRight, _carUp, _carFwd);

      while (this.dustSpawnAccum >= 1) {
        this.dustSpawnAccum -= 1;
        const p = this.dustParticles[this.dustCursor];
        this.dustCursor = (this.dustCursor + 1) % MAX_DUST;

        const side = this.dustCursor % 2 === 0 ? -0.78 : 0.78;
        p.active = true;
        p.x = car.x + _carRight.x * side - _carFwd.x * 1.65;
        p.y = car.y + 0.22;
        p.z = car.z + _carRight.z * side - _carFwd.z * 1.65;

        p.vx = -_carFwd.x * (speed * 0.18) + (Math.random() - 0.5) * 1.8;
        p.vy = 0.85 + Math.random() * 1.4;
        p.vz = -_carFwd.z * (speed * 0.18) + (Math.random() - 0.5) * 1.8;
        p.age = 0;
        p.life = 0.55 + Math.random() * 0.45;
        p.size = 0.35 + Math.min(0.65, speed * 0.015);

        if (car.currentSurface === 'snow' || car.currentSurface === 'ice') {
          p.r = 0.94;
          p.g = 0.97;
          p.b = 1.0;
        } else if (car.currentSurface === 'water_puddle') {
          p.r = 0.82;
          p.g = 0.9;
          p.b = 0.98;
        } else if (car.currentSurface === 'tarmac') {
          p.r = 0.85;
          p.g = 0.86;
          p.b = 0.88;
        } else {
          p.r = 0.78;
          p.g = 0.66;
          p.b = 0.5;
        }
      }
    }

    for (let i = 0; i < MAX_DUST; i++) {
      const p = this.dustParticles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        _dummyObj.position.set(0, -500, 0);
        _dummyObj.scale.setScalar(0.001);
        _dummyObj.updateMatrix();
        this.dustMesh.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 0.96;

      const prog = p.age / p.life;
      const scale = p.size * (1 + prog * 2.4) * (1 - prog * 0.55);
      _dummyObj.position.set(p.x, p.y, p.z);
      _dummyObj.rotation.set(p.age * 2, p.age * 1.5, 0);
      _dummyObj.scale.setScalar(Math.max(0.05, scale));
      _dummyObj.updateMatrix();
      this.dustMesh.setMatrixAt(i, _dummyObj.matrix);
      this.dustMesh.setColorAt(i, _tmpColor.setRGB(p.r, p.g, p.b));
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
    if (this.dustMesh.instanceColor) this.dustMesh.instanceColor.needsUpdate = true;
  }

  private applyAtmosphere(weather: WeatherType, timeOfDay: TimeOfDay): void {
    const isSnowStage = this.activeStage?.primarySurface === 'snow';
    let skyHex = 0x82b4e8;
    let fogHex = 0xa8cbe8;
    let fogDensity = 0.0024;
    let sunHex = 0xfff4d6;
    let sunInt = 2.4;
    let hemiSky = 0xc2e2ff;
    let hemiGround = isSnowStage ? 0x8ea4bc : 0x4d5c3b;
    let hemiInt = 0.92;

    if (timeOfDay === 'dusk') {
      skyHex = 0xd97b54;
      fogHex = 0xc97b5d;
      sunHex = 0xffab66;
      sunInt = 2.15;
      hemiSky = 0xfca5a5;
      hemiGround = 0x3b333a;
      hemiInt = 0.78;
    } else if (timeOfDay === 'night') {
      skyHex = 0x0b1324;
      fogHex = 0x0f1a2e;
      sunHex = 0x93c5fd;
      sunInt = 0.48;
      hemiSky = 0x1e3a5f;
      hemiGround = 0x0f172a;
      hemiInt = 0.42;
      fogDensity = 0.0036;
    } else if (isSnowStage) {
      skyHex = 0xa8c8e8;
      fogHex = 0xd4e4f4;
      hemiSky = 0xe0f2fe;
      sunInt = 2.1;
    }

    if (weather === 'fog') {
      fogHex = timeOfDay === 'night' ? 0x182334 : 0xbcc7d4;
      skyHex = fogHex;
      fogDensity = 0.0095;
      sunInt *= 0.55;
    } else if (weather === 'rain') {
      fogHex = timeOfDay === 'night' ? 0x111b2b : 0x6f7f91;
      skyHex = fogHex;
      fogDensity = 0.0048;
      sunInt *= 0.62;
    } else if (weather === 'snow') {
      fogHex = timeOfDay === 'night' ? 0x182438 : 0xdce6f2;
      skyHex = fogHex;
      fogDensity = 0.0046;
      sunInt *= 0.78;
    }

    (this.scene.background as THREE.Color).setHex(skyHex);
    this.fog.color.setHex(fogHex);
    this.fog.density = fogDensity;
    this.sunLight.color.setHex(sunHex);
    this.sunLight.intensity = sunInt;
    this.hemiLight.color.setHex(hemiSky);
    this.hemiLight.groundColor.setHex(hemiGround);
    this.hemiLight.intensity = hemiInt;
  }

  public render(
    car: CarPhysicsState,
    cameraMode: CameraMode,
    weather: WeatherType,
    timeOfDay: TimeOfDay,
    isTitleFlyover: boolean,
    flyoverTimeSec: number,
    ghostPose: GhostSample | null,
    dt: number,
  ): void {
    this.applyAtmosphere(weather, timeOfDay);

    const groundY = this.activeStage
      ? sampleStageAtWorldPos(this.activeStage, car.x, car.z, car.currentSegmentIndex).roadY
      : car.y;

    const isCockpit = !isTitleFlyover && cameraMode === 'cockpit';
    const isNightOrDusk = timeOfDay === 'night' || timeOfDay === 'dusk' || weather === 'rain' || weather === 'fog';

    updateWrcCarRigFromState(this.carRig, car, groundY, isCockpit, isNightOrDusk, dt);

    // Update Personal-Best Ghost Car
    if (!isTitleFlyover && ghostPose) {
      this.carRig.ghostRoot.visible = true;
      applyCarPoseToObject(
        this.carRig.ghostRoot,
        ghostPose.x,
        ghostPose.y,
        ghostPose.z,
        ghostPose.yaw,
        ghostPose.pitch,
        ghostPose.roll,
      );
    } else {
      this.carRig.ghostRoot.visible = false;
    }

    // Move Directional Key Light Shadow Frustum with Car
    const sunElevY = timeOfDay === 'dusk' ? 36 : 85;
    this.sunLight.position.set(car.x + 52, car.y + sunElevY, car.z + 42);
    this.sunLight.target.position.set(car.x, car.y, car.z - 12);

    // Update Camera Rig (with silky-smooth exponential damping)
    const activeViewKey: CameraMode | 'title' = isTitleFlyover ? 'title' : cameraMode;
    if (activeViewKey !== this.lastCameraMode) {
      this.lastCameraMode = activeViewKey;
      this.camPosInitialized = false;
    }

    getCarBasisVectors(car.yaw, car.pitch, car.roll, _carRight, _carUp, _carFwd);

    if (isTitleFlyover) {
      // Dramatic 3/4 Front-Quarter Paddock Showcase framing car + door livery + Start Gantry in center viewport!
      const angle = 2.38 + Math.sin(flyoverTimeSec * 0.35) * 0.34;
      const dist = 5.15;
      _desiredCamPos.set(
        car.x + Math.sin(angle) * dist,
        car.y + 1.52,
        car.z + Math.cos(angle) * dist,
      );
      _desiredLookAt.set(car.x, car.y + 0.88, car.z - 0.35);
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(_desiredCamPos);
      this.camera.lookAt(_desiredLookAt);
    } else if (cameraMode === 'cockpit') {
      // Driver Eye Inside Rollcage Looking Over Suede Steering Wheel & Hood
      _desiredCamPos
        .set(car.x, car.y, car.z)
        .addScaledVector(_carRight, -0.34)
        .addScaledVector(_carUp, 1.12)
        .addScaledVector(_carFwd, -0.05);
      _desiredLookAt
        .copy(_desiredCamPos)
        .addScaledVector(_carFwd, 24)
        .addScaledVector(_carUp, -0.45);
      if (this.camera.fov !== 68) {
        this.camera.fov = 68;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.copy(_desiredCamPos);
      this.camera.lookAt(_desiredLookAt);
    } else if (cameraMode === 'hood') {
      _desiredCamPos
        .set(car.x, car.y, car.z)
        .addScaledVector(_carUp, 1.08)
        .addScaledVector(_carFwd, 0.55);
      _desiredLookAt
        .copy(_desiredCamPos)
        .addScaledVector(_carFwd, 28)
        .addScaledVector(_carUp, -0.4);
      if (this.camera.fov !== 66) {
        this.camera.fov = 66;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.copy(_desiredCamPos);
      this.camera.lookAt(_desiredLookAt);
    } else {
      // Dynamic Speed-Sensing WRC Chase / Far Chase Camera!
      const isFar = cameraMode === 'chase_far';
      const backDist = isFar ? 7.4 : 5.45;
      const upHeight = isFar ? 2.55 : 1.98;
      const speedKmh = Math.abs(car.forwardSpeedMs) * 3.6;
      const targetFov = (isFar ? 62 : 60) + Math.min(11, speedKmh * 0.055);
      if (Math.abs(this.camera.fov - targetFov) > 0.25) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }

      // Horizontal forward/right basis so chase camera stays level with horizon while feeling banked corners
      const flatFwdX = Math.sin(car.yaw);
      const flatFwdZ = -Math.cos(car.yaw);
      _desiredCamPos.set(
        car.x - flatFwdX * backDist,
        Math.max(groundY + 1.15, car.y + upHeight),
        car.z - flatFwdZ * backDist,
      );
      _desiredLookAt.set(
        car.x + flatFwdX * 8.5,
        car.y + 0.85,
        car.z + flatFwdZ * 8.5,
      );

      if (!this.camPosInitialized) {
        this.smoothCamPos.copy(_desiredCamPos);
        this.smoothLookAt.copy(_desiredLookAt);
        this.camPosInitialized = true;
      } else {
        const lambdaPos = 14;
        const lambdaLook = 18;
        this.smoothCamPos.x = THREE.MathUtils.damp(this.smoothCamPos.x, _desiredCamPos.x, lambdaPos, dt);
        this.smoothCamPos.y = THREE.MathUtils.damp(this.smoothCamPos.y, _desiredCamPos.y, lambdaPos, dt);
        this.smoothCamPos.z = THREE.MathUtils.damp(this.smoothCamPos.z, _desiredCamPos.z, lambdaPos, dt);

        this.smoothLookAt.x = THREE.MathUtils.damp(this.smoothLookAt.x, _desiredLookAt.x, lambdaLook, dt);
        this.smoothLookAt.y = THREE.MathUtils.damp(this.smoothLookAt.y, _desiredLookAt.y, lambdaLook, dt);
        this.smoothLookAt.z = THREE.MathUtils.damp(this.smoothLookAt.z, _desiredLookAt.z, lambdaLook, dt);
      }

      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothLookAt);
    }

    // Update Rain / Snowfall Particles Around Camera
    if (weather === 'rain' || weather === 'snow') {
      this.weatherMesh.visible = true;
      const isRain = weather === 'rain';
      const fallSpeed = isRain ? 22 : 4.2;
      const tNow = performance.now() * 0.001;
      for (let i = 0; i < WEATHER_DROPS; i++) {
        const ox = this.weatherOffsets[i * 3];
        const oy = this.weatherOffsets[i * 3 + 1];
        const oz = this.weatherOffsets[i * 3 + 2];
        const yFall = ((oy - tNow * fallSpeed) % 16 + 16) % 16 - 4;
        _dummyObj.position.set(
          this.camera.position.x + ox,
          this.camera.position.y + yFall,
          this.camera.position.z + oz,
        );
        _dummyObj.scale.set(1, isRain ? 1.4 : 0.22, 1);
        _dummyObj.updateMatrix();
        this.weatherMesh.setMatrixAt(i, _dummyObj.matrix);
      }
      this.weatherMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.weatherMesh.visible = false;
    }

    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);

    // Functional 3D Rear-View Mirror Scissor Pass in Cockpit View (skipped on software WebGL)
    if (isCockpit && !this.isSoftwareGl) {
      const size = this.renderer.getSize(new THREE.Vector2());
      if (size.x >= 640 && size.y >= 360) {
        const mW = Math.floor(Math.min(size.x * 0.28, 340));
        const mH = Math.floor(Math.min(size.y * 0.095, 72));
        const mX = Math.floor((size.x - mW) * 0.5);
        const mY = Math.floor(size.y - size.y * 0.022 - mH);

        const prevFov = this.camera.fov;
        const prevAspect = this.camera.aspect;
        this.camera.fov = 52;
        this.camera.aspect = mW / Math.max(1, mH);
        this.camera.updateProjectionMatrix();

        _desiredCamPos
          .set(car.x, car.y, car.z)
          .addScaledVector(_carUp, 1.25)
          .addScaledVector(_carFwd, -1.8);
        _desiredLookAt
          .copy(_desiredCamPos)
          .addScaledVector(_carFwd, -28)
          .addScaledVector(_carUp, -0.35);
        this.camera.position.copy(_desiredCamPos);
        this.camera.lookAt(_desiredLookAt);

        this.renderer.autoClear = false;
        this.renderer.setViewport(mX, mY, mW, mH);
        this.renderer.setScissor(mX, mY, mW, mH);
        this.renderer.setScissorTest(true);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);

        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, size.x, size.y);
        this.renderer.autoClear = true;
        this.camera.fov = prevFov;
        this.camera.aspect = prevAspect;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  public dispose(): void {
    if (this.builtStage) {
      this.builtStage.dispose();
      this.builtStage = null;
    }
    this.carRig.dispose();
    this.dustGeom.dispose();
    this.dustMat.dispose();
    this.weatherGeom.dispose();
    this.weatherMat.dispose();
    this.envTex.dispose();
    this.renderer.dispose();
  }
}
