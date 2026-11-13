import { sampleStageAtWorldPos } from './stages.ts';
import type {
  CarPhysicsState,
  DamageState,
  DrivingAssistPreset,
  InputSettings,
  MistakeRecord,
  RallyDifficulty,
  StageDefinition,
  SurfaceType,
  TireCompound,
  TuningSetup,
  WeatherType,
  WheelState,
} from './types.ts';

export interface RallyDifficultyDef {
  id: RallyDifficulty;
  labelZh: string;
  shortZh: string;
  summaryZh: string;
  damageScale: number;
  recoveryPenaltySec: number;
  aiTimeScale: number;
}

export const RALLY_DIFFICULTY_DEFS: Record<RallyDifficulty, RallyDifficultyDef> = {
  relaxed: {
    id: 'relaxed',
    labelZh: '轻松领航',
    shortZh: '轻松',
    summaryZh: '碰撞车损减半 · 救援罚时仅 +8s · AI 标杆放宽 8%',
    damageScale: 0.45,
    recoveryPenaltySec: 8,
    aiTimeScale: 1.08,
  },
  standard: {
    id: 'standard',
    labelZh: '标准竞技',
    shortZh: '标准',
    summaryZh: '标准物理车损 · 救援罚时 +15s · FIA 厂队标杆配速',
    damageScale: 1.0,
    recoveryPenaltySec: 15,
    aiTimeScale: 1.0,
  },
  master: {
    id: 'master',
    labelZh: '宗师拟真',
    shortZh: '宗师',
    summaryZh: '拟真严苛车损(+45%) · 救援罚时 +18s · 传奇车神配速',
    damageScale: 1.45,
    recoveryPenaltySec: 18,
    aiTimeScale: 0.96,
  },
};

export const FIXED_DT = 1 / 120;

export const REPAIR_COSTS_MIN: Record<
  'steering' | 'engine' | 'gearbox' | 'suspension' | 'tires' | 'lights',
  { costMin: number; labelZh: string; descZh: string }
> = {
  steering: {
    costMin: 8,
    labelZh: '转向拉杆与助力机构',
    descZh: '撞击护栏或山体会导致转向拉杆偏斜与最大转角衰减。',
  },
  suspension: {
    costMin: 10,
    labelZh: '四轮氮气避震与摆臂',
    descZh: '飞跳重着陆会加剧悬挂衰减，影响高速颠簸贴地性。',
  },
  engine: {
    costMin: 14,
    labelZh: '涡轮增压器与动力总成',
    descZh: '严重正面碰撞将降低高转涡轮增压值与峰值扭矩输出。',
  },
  gearbox: {
    costMin: 12,
    labelZh: '序列式变速箱与犬齿离合',
    descZh: '变速箱损伤会延长换挡切断时间，影响出弯衔接效率。',
  },
  tires: {
    costMin: 6,
    labelZh: '竞技轮胎组磨损更换',
    descZh: '长距离高滑移漂移会消耗胎面花纹并降低极限抓地系数。',
  },
  lights: {
    costMin: 4,
    labelZh: '车头四联拉力射灯组',
    descZh: '撞击将损坏辅助LED射灯，影响黄昏与暗夜赛段远距视野。',
  },
};

export const DEFAULT_TUNING: TuningSetup = {
  name: 'WRC 砂石全地形基准设定 (Gravel Spec)',
  drivetrain: 'AWD',
  finalDriveRatio: 1.0,
  frontSpringRate: 46,
  rearSpringRate: 42,
  suspensionTravel: 0.22,
  dampingStiffness: 1.05,
  awdFrontTorqueSplit: 0.44,
  diffLock: 0.65,
  brakeBiasFront: 0.62,
  tirePressurePsi: 24,
  tireCompound: 'gravel',
};

export const SPORT_INPUT_SETTINGS: InputSettings = {
  steerSensitivity: 1.0,
  steerDeadzone: 0.04,
  steerLinearity: 1.25,
  throttleGamma: 1.0,
  brakeGamma: 1.05,
  pacenoteLeadScale: 1.0,
  pacenoteAudioEnabled: true,
  pacenoteVisualEnabled: true,
  autoGearbox: true,
  autoClutch: true,
  absAssist: true,
  tcsAssist: false,
  difficulty: 'standard',
};

export const PRO_INPUT_SETTINGS: InputSettings = {
  ...SPORT_INPUT_SETTINGS,
  steerLinearity: 1.35,
  autoGearbox: false,
  autoClutch: false,
  absAssist: false,
  tcsAssist: false,
};

// Default to SPORT so players never stall or get stuck in neutral out of the box!
export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  ...SPORT_INPUT_SETTINGS,
};

export function getDrivingPreset(settings: InputSettings): DrivingAssistPreset {
  return settings.autoGearbox && settings.autoClutch ? 'sport' : 'pro';
}

export function applyDrivingPreset(
  current: InputSettings,
  preset: DrivingAssistPreset,
): InputSettings {
  if (preset === 'sport') {
    return {
      ...current,
      autoGearbox: true,
      autoClutch: true,
      absAssist: true,
    };
  }
  return {
    ...current,
    autoGearbox: false,
    autoClutch: false,
    absAssist: false,
  };
}

export interface RawControlsInput {
  steer: number; // -1 (Left: A / ArrowLeft) .. +1 (Right: D / ArrowRight)
  throttle: number; // 0..1 (W / ArrowUp)
  brake: number; // 0..1 (S / ArrowDown)
  handbrake: number; // 0..1 (Space)
  clutch: number; // 0..1 (Shift)
  shiftUpJustPressed: boolean;
  shiftDownJustPressed: boolean;
  ignitionJustPressed: boolean;
}

export interface SurfaceProfile {
  peakMu: number;
  slideRatio: number;
  plateauWidth: number;
  peakSlipAngleRad: number;
  rollingResistance: number;
  bumpAmplitude: number;
}

const BASE_SURFACE_PROFILES: Record<SurfaceType, SurfaceProfile> = {
  tarmac: {
    peakMu: 1.26,
    slideRatio: 0.82,
    plateauWidth: 0.85,
    peakSlipAngleRad: 0.125,
    rollingResistance: 0.013,
    bumpAmplitude: 0.004,
  },
  tarmac_dirty: {
    peakMu: 1.02,
    slideRatio: 0.8,
    plateauWidth: 0.95,
    peakSlipAngleRad: 0.15,
    rollingResistance: 0.017,
    bumpAmplitude: 0.01,
  },
  gravel: {
    peakMu: 0.98,
    slideRatio: 0.86,
    plateauWidth: 1.25,
    peakSlipAngleRad: 0.195,
    rollingResistance: 0.022,
    bumpAmplitude: 0.02,
  },
  snow: {
    peakMu: 0.84,
    slideRatio: 0.85,
    plateauWidth: 1.3,
    peakSlipAngleRad: 0.21,
    rollingResistance: 0.025,
    bumpAmplitude: 0.016,
  },
  ice: {
    peakMu: 0.66,
    slideRatio: 0.8,
    plateauWidth: 1.1,
    peakSlipAngleRad: 0.165,
    rollingResistance: 0.016,
    bumpAmplitude: 0.008,
  },
  water_puddle: {
    peakMu: 0.78,
    slideRatio: 0.82,
    plateauWidth: 1.15,
    peakSlipAngleRad: 0.19,
    rollingResistance: 0.042,
    bumpAmplitude: 0.024,
  },
  offtrack: {
    peakMu: 0.78,
    slideRatio: 0.84,
    plateauWidth: 1.35,
    peakSlipAngleRad: 0.23,
    rollingResistance: 0.038,
    bumpAmplitude: 0.036,
  },
};

const COMPOUND_MULTIPLIERS: Record<TireCompound, Record<SurfaceType, number>> = {
  tarmac_dry: {
    tarmac: 1.12,
    tarmac_dirty: 1.04,
    gravel: 0.88,
    snow: 0.74,
    ice: 0.68,
    water_puddle: 0.84,
    offtrack: 0.86,
  },
  tarmac_wet: {
    tarmac: 1.02,
    tarmac_dirty: 1.06,
    gravel: 0.94,
    snow: 0.86,
    ice: 0.8,
    water_puddle: 1.12,
    offtrack: 0.94,
  },
  gravel: {
    tarmac: 0.94,
    tarmac_dirty: 1.0,
    gravel: 1.1,
    snow: 0.92,
    ice: 0.82,
    water_puddle: 1.04,
    offtrack: 1.12,
  },
  snow: {
    tarmac: 0.86,
    tarmac_dirty: 0.92,
    gravel: 0.94,
    snow: 1.18,
    ice: 1.26,
    water_puddle: 0.96,
    offtrack: 1.04,
  },
};

export function getSurfaceProfile(
  surface: SurfaceType,
  weather: WeatherType,
  compound: TireCompound,
  tirePressurePsi: number,
): SurfaceProfile {
  const base = BASE_SURFACE_PROFILES[surface] ?? BASE_SURFACE_PROFILES.gravel;
  const compTable = COMPOUND_MULTIPLIERS[compound] ?? COMPOUND_MULTIPLIERS.gravel;
  let mult = compTable[surface] ?? 1.0;

  if (weather === 'rain') {
    if (surface === 'tarmac') mult *= compound === 'tarmac_wet' ? 0.96 : 0.86;
    else mult *= 0.93;
  } else if (weather === 'snow') {
    if (surface === 'tarmac') mult *= 0.84;
  }

  // Optimal tire pressure tuning window (~30 PSI on tarmac, ~23 PSI on gravel, ~20 PSI on snow)
  const idealPsi = surface === 'tarmac' ? 30 : surface === 'snow' || surface === 'ice' ? 20 : 24;
  const psiPenalty = Math.min(0.06, Math.abs(tirePressurePsi - idealPsi) * 0.0035);

  return {
    peakMu: base.peakMu * mult * (1 - psiPenalty),
    slideRatio: base.slideRatio,
    plateauWidth: base.plateauWidth,
    peakSlipAngleRad: base.peakSlipAngleRad,
    rollingResistance: base.rollingResistance,
    bumpAmplitude: base.bumpAmplitude,
  };
}

/**
 * Continuous Pacejka-inspired tire grip curve:
 * - Rises smoothly from 0 to `peakMu` right at `normSlip = 1.0`
 * - Progressively transitions across `plateauWidth` toward `peakMu * slideRatio` without ever dropping to 0
 */
export function evaluateContinuousTireCurve(
  normSlip: number,
  peakMu: number,
  slideRatio: number,
  plateauWidth: number,
): number {
  const s = Math.abs(normSlip);
  if (s <= 0) return 0;
  if (s <= 1.0) {
    // Smooth cubic/sine rise peaking with zero slope at s = 1.0
    return peakMu * Math.sin(s * Math.PI * 0.5);
  }
  const excess = (s - 1.0) / Math.max(0.25, plateauWidth);
  const decay = 1 - Math.exp(-excess * excess * 0.85);
  const factor = 1 - (1 - slideRatio) * decay;
  return peakMu * factor;
}

export function getEngineTorqueNm(
  rpm: number,
  boostBar: number,
  engineDamage: number,
): number {
  const r = Math.max(800, Math.min(8200, rpm));
  const norm = Math.max(0, Math.min(1, (r - 950) / 6400));
  const naTorque = 155 + 115 * Math.sin(norm * Math.PI * 0.86);
  const boostMult = 1 + Math.max(0, boostBar) * 0.78;
  const limiter = r > 7850 ? 0.12 : r > 7450 ? 0.88 : 1.0;
  const healthMult = Math.max(0.35, 1 - engineDamage * 0.58);
  return naTorque * boostMult * limiter * healthMult;
}

export function createInitialDamageState(): DamageState {
  return {
    steering: 0,
    engine: 0,
    gearbox: 0,
    suspension: 0,
    tires: 0,
    lights: 0,
    steeringPullDirection: 1,
    isTerminal: false,
    terminalReason: '',
  };
}

function createInitialWheel(id: WheelState['id'], surface: SurfaceType): WheelState {
  return {
    id,
    compression: 0.08,
    compressionVel: 0,
    normalLoadN: 3000,
    slipRatio: 0,
    slipAngleRad: 0,
    combinedSlip: 0,
    gripFactor: 1,
    angularVel: 0,
    surface,
    isGrounded: true,
    bottomedOutImpact: 0,
  };
}

export function createInitialCarState(stage: StageDefinition): CarPhysicsState {
  const spawnSeg = stage.segments[2] ?? stage.segments[0];
  const spawnYaw = Math.atan2(spawnSeg.tangentX, -spawnSeg.tangentZ);

  return {
    x: spawnSeg.x,
    y: spawnSeg.y,
    z: spawnSeg.z,
    yaw: spawnYaw,
    pitch: Math.atan(spawnSeg.slope),
    roll: spawnSeg.camberRad,
    pitchVel: 0,
    rollVel: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yawRate: 0,
    forwardSpeedMs: 0,
    lateralSpeedMs: 0,
    longitudinalAccelG: 0,
    lateralAccelG: 0,
    gear: 1,
    rpm: 1200,
    stalled: false,
    starterCranking: 0,
    turboBoostBar: 0,
    bovVentTrigger: 0,
    backfireTrigger: 0,
    shiftCooldownSec: 0,
    missedShiftCrunch: 0,
    clutchEngagement: 1,
    steerAngleRad: 0,
    steeringWheelDeg: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    clutchPedal: 0,
    currentSurface: spawnSeg.surface,
    tireDirtiness: 0,
    rutAccumulation: 0,
    airborneTimeSec: 0,
    lastLandingForceG: 0,
    wheels: [
      createInitialWheel('FL', spawnSeg.surface),
      createInitialWheel('FR', spawnSeg.surface),
      createInitialWheel('RL', spawnSeg.surface),
      createInitialWheel('RR', spawnSeg.surface),
    ],
    distanceAlongStageM: spawnSeg.distanceM,
    lateralOffsetM: 0,
    roadWidthM: spawnSeg.widthM,
    currentSegmentIndex: 2,
    damage: createInitialDamageState(),
  };
}

export function cloneCarState(s: CarPhysicsState): CarPhysicsState {
  return {
    ...s,
    wheels: [
      { ...s.wheels[0] },
      { ...s.wheels[1] },
      { ...s.wheels[2] },
      { ...s.wheels[3] },
    ],
    damage: { ...s.damage },
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function interpolateCarState(
  prev: CarPhysicsState,
  curr: CarPhysicsState,
  alpha: number,
): CarPhysicsState {
  const t = Math.max(0, Math.min(1, alpha));
  const out = cloneCarState(curr);
  out.x = prev.x + (curr.x - prev.x) * t;
  out.y = prev.y + (curr.y - prev.y) * t;
  out.z = prev.z + (curr.z - prev.z) * t;
  out.yaw = lerpAngle(prev.yaw, curr.yaw, t);
  out.pitch = prev.pitch + (curr.pitch - prev.pitch) * t;
  out.roll = prev.roll + (curr.roll - prev.roll) * t;
  out.steerAngleRad = prev.steerAngleRad + (curr.steerAngleRad - prev.steerAngleRad) * t;
  out.steeringWheelDeg = prev.steeringWheelDeg + (curr.steeringWheelDeg - prev.steeringWheelDeg) * t;
  return out;
}

const VEHICLE_MASS_KG = 1230;
const YAW_INERTIA = 1820;
const WHEELBASE_LF = 1.32;
const WHEELBASE_LR = 1.28;
const CG_HEIGHT_M = 0.48;
const WHEEL_RADIUS_M = 0.33;
const AERO_DRAG_COEFF = 0.44;
const AERO_DOWNFORCE_COEFF = 1.18;

const GEAR_RATIOS: Record<number, number> = {
  [-1]: -3.45,
  0: 0,
  1: 3.38,
  2: 2.36,
  3: 1.78,
  4: 1.41,
  5: 1.15,
  6: 0.96,
};
const BASE_FINAL_DRIVE = 3.92;

function applyInputCurve(val: number, deadzone: number, gamma: number): number {
  const abs = Math.abs(val);
  if (abs <= deadzone) return 0;
  const norm = Math.min(1, (abs - deadzone) / Math.max(0.01, 1 - deadzone));
  return Math.sign(val) * Math.pow(norm, Math.max(0.5, gamma));
}

export function stepCarPhysics(
  state: CarPhysicsState,
  rawInput: RawControlsInput,
  stage: StageDefinition,
  tuning: TuningSetup,
  inputSettings: InputSettings,
  weather: WeatherType,
  stageTimeSec: number,
  mistakes?: MistakeRecord[],
  dt: number = FIXED_DT,
): void {
  if (dt <= 0) return;
  const diffDef = RALLY_DIFFICULTY_DEFS[inputSettings.difficulty ?? 'standard'];

  // 1. Shape Inputs (steer < 0 = LEFT [A/ArrowLeft], steer > 0 = RIGHT [D/ArrowRight])
  const steerShaped =
    applyInputCurve(rawInput.steer, inputSettings.steerDeadzone, inputSettings.steerLinearity) *
    inputSettings.steerSensitivity;
  const steerCmd = Math.max(-1, Math.min(1, steerShaped));
  const rawThrottle = applyInputCurve(
    rawInput.throttle,
    inputSettings.steerDeadzone * 0.5,
    inputSettings.throttleGamma,
  );
  const rawBrake = applyInputCurve(
    rawInput.brake,
    inputSettings.steerDeadzone * 0.5,
    inputSettings.brakeGamma,
  );
  const rawHandbrake = Math.max(0, Math.min(1, rawInput.handbrake));
  const rawClutch = Math.max(0, Math.min(1, rawInput.clutch));

  // Right-handed local basis in XZ plane:
  // yaw = 0 => forward = (0, -1), right = (+1, 0)
  const fwdX = Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = Math.sin(state.yaw);

  let vLong = state.vx * fwdX + state.vz * fwdZ;
  let vLat = state.vx * rightX + state.vz * rightZ;

  // 2. Gearbox, Seamless Auto-Reverse & Anti-Stall Protection
  if (state.stalled) {
    if (rawInput.ignitionJustPressed || rawThrottle > 0.18 || inputSettings.autoClutch) {
      state.starterCranking = Math.min(1, state.starterCranking + dt * 6);
      if (state.starterCranking >= 0.35 || inputSettings.autoClutch) {
        state.stalled = false;
        state.starterCranking = 0;
        state.rpm = 1800;
      }
    }
  }

  state.shiftCooldownSec = Math.max(0, state.shiftCooldownSec - dt);
  state.missedShiftCrunch = Math.max(0, state.missedShiftCrunch - dt);
  state.bovVentTrigger = Math.max(0, state.bovVentTrigger - dt);
  state.backfireTrigger = Math.max(0, state.backfireTrigger - dt);

  if (rawInput.shiftUpJustPressed && state.gear < 6) {
    state.gear = state.gear === -1 ? 1 : state.gear + 1;
    state.shiftCooldownSec = 0.05 + state.damage.gearbox * 0.06;
    if (state.rpm > 4500) state.backfireTrigger = 0.22;
  } else if (rawInput.shiftDownJustPressed && state.gear > -1) {
    state.gear = state.gear === 1 ? -1 : state.gear - 1;
    state.shiftCooldownSec = 0.045 + state.damage.gearbox * 0.05;
    if (state.gear >= 1) state.backfireTrigger = 0.18;
  }

  let effectiveThrottle = rawThrottle;
  let effectiveBrake = rawBrake;

  if (inputSettings.autoGearbox) {
    // Seamless Auto-Reverse when holding S / Down near standstill
    if (state.gear >= 0 && vLong < 1.25 && rawBrake > 0.2 && rawThrottle < 0.15) {
      if (vLong <= 0.35) {
        state.gear = -1;
      }
    } else if (state.gear === -1 && rawThrottle > 0.15 && rawBrake < 0.2) {
      if (vLong >= -0.45) {
        state.gear = 1;
        state.shiftCooldownSec = 0.02;
      } else {
        effectiveThrottle = 0;
        effectiveBrake = rawThrottle;
      }
    }

    if (state.gear === -1) {
      if (rawBrake > 0.05 && rawThrottle < 0.2) {
        effectiveThrottle = rawBrake;
        effectiveBrake = 0;
      } else if (rawThrottle > 0.05 && vLong < -0.4) {
        effectiveThrottle = 0;
        effectiveBrake = rawThrottle;
      }
    } else {
      if (state.gear === 0 && rawThrottle > 0.08) {
        state.gear = 1;
      }
      if (state.airborneTimeSec <= 0 && state.shiftCooldownSec <= 0 && state.gear >= 1) {
        const finalDrive = BASE_FINAL_DRIVE * tuning.finalDriveRatio;
        const curRatio = GEAR_RATIOS[state.gear] * finalDrive;
        const coupledRpm = (Math.max(0, vLong) / WHEEL_RADIUS_M) * curRatio * (60 / (Math.PI * 2));

        if (state.gear < 6 && coupledRpm > 6750 && effectiveThrottle > 0.35) {
          state.gear += 1;
          state.shiftCooldownSec = 0.055;
          state.backfireTrigger = 0.24;
        } else if (state.gear > 1 && coupledRpm < 3600 && vLong < 48) {
          state.gear -= 1;
          state.shiftCooldownSec = 0.04;
          if (effectiveBrake > 0.25) state.backfireTrigger = 0.18;
        }
      }
    }
  } else {
    // Even in PRO mode, don't trap stationary player in Neutral if pressing W or S!
    if (state.gear === 0 && Math.abs(vLong) < 0.5) {
      if (rawThrottle > 0.25) state.gear = 1;
      else if (rawBrake > 0.6 && rawThrottle < 0.05) state.gear = -1;
    }
    if (state.gear === -1 && rawBrake > 0.1 && rawThrottle < 0.1) {
      effectiveThrottle = rawBrake;
      effectiveBrake = 0;
    }
  }

  // Trigger turbo BOV flutter when lifting off high boost
  if (state.throttle > 0.65 && effectiveThrottle < 0.2 && state.turboBoostBar > 0.65) {
    state.bovVentTrigger = 0.35;
  }

  state.throttle = effectiveThrottle;
  state.brake = effectiveBrake;
  state.handbrake = rawHandbrake;
  state.clutchPedal = rawClutch;

  // 3. Track & Surface Sampling
  const sample = sampleStageAtWorldPos(
    stage,
    state.x,
    state.z,
    state.currentSegmentIndex,
  );
  state.currentSegmentIndex = sample.segmentIndex;
  state.distanceAlongStageM = sample.distanceAlongStageM;
  state.lateralOffsetM = sample.lateralOffsetM;
  state.roadWidthM = sample.halfWidthM * 2;
  state.currentSurface = sample.surface;

  if (sample.surface === 'offtrack' || sample.surface === 'gravel') {
    state.tireDirtiness = Math.min(1, state.tireDirtiness + dt * 0.22);
  } else if (sample.surface === 'tarmac') {
    state.tireDirtiness = Math.max(0, state.tireDirtiness - dt * 0.35);
  }

  // 4. Vertical Jump & Suspension Contact
  const heightAboveRoad = state.y - sample.roadY;
  const isAirborne = heightAboveRoad > 0.14 || (state.airborneTimeSec > 0 && heightAboveRoad > 0.02);

  for (const w of state.wheels) {
    w.bottomedOutImpact = Math.max(0, w.bottomedOutImpact - dt * 4);
  }

  if (isAirborne) {
    state.airborneTimeSec += dt;
    state.vy -= 9.81 * dt;
    state.y += state.vy * dt;
    for (const w of state.wheels) {
      w.isGrounded = false;
      w.compression = 0.01;
      w.normalLoadN = 0;
    }

    if (state.y <= sample.roadY) {
      const impactVy = Math.abs(state.vy);
      state.y = sample.roadY;
      state.vy = 0;
      state.airborneTimeSec = 0;
      state.lastLandingForceG = impactVy / 9.81;
      state.pitchVel -= Math.min(0.6, impactVy * 0.05);
      for (const w of state.wheels) {
        w.isGrounded = true;
        w.bottomedOutImpact = Math.min(1, impactVy / 9.5);
      }
      if (impactVy > 9.5) {
        const suspWear = Math.min(0.14, (impactVy - 9.5) * 0.015) * diffDef.damageScale;
        state.damage.suspension = Math.min(0.85, state.damage.suspension + suspWear);
        mistakes?.push({
          id: `land_${Math.round(stageTimeSec * 10)}`,
          timeSec: stageTimeSec,
          distanceM: Math.round(state.distanceAlongStageM),
          sector: state.distanceAlongStageM < stage.sectorSplitsM[0] ? 1 : state.distanceAlongStageM < stage.sectorSplitsM[1] ? 2 : 3,
          type: 'hard_landing',
          label: '飞跳重着陆冲击悬挂',
          timeLossEstSec: 0.6,
        });
      }
    }
  } else {
    const nextSeg = stage.segments[Math.min(stage.segments.length - 1, sample.segmentIndex + 1)];
    const gradeDrop = sample.segment.slope - nextSeg.slope;
    if (gradeDrop > 0.032 && vLong > 24) {
      state.airborneTimeSec = dt;
      state.vy = sample.segment.slope * vLong * 0.92 + 1.3;
      state.y = sample.roadY + 0.15;
    } else {
      state.airborneTimeSec = 0;
      state.y = sample.roadY;
      state.vy = 0;
      for (const w of state.wheels) {
        w.isGrounded = true;
      }
    }
  }

  // 5. Turbo, Launch Clutch & Powertrain Torque
  const targetBoost =
    effectiveThrottle > 0.25
      ? Math.min(1.85, ((state.rpm - 1700) / 3500) * 1.8 * effectiveThrottle)
      : -0.15;
  state.turboBoostBar +=
    (targetBoost - state.turboBoostBar) * Math.min(1, dt * (effectiveThrottle > 0.25 ? 5.8 : 3.6));

  const finalDrive = BASE_FINAL_DRIVE * tuning.finalDriveRatio;
  const gearRatio = (GEAR_RATIOS[state.gear] ?? 0) * finalDrive;

  let clutchEngage = 1 - rawClutch;
  if (inputSettings.autoClutch || Math.abs(vLong) < 8.0) {
    if (state.gear === 0) {
      clutchEngage = 0;
    } else if (Math.abs(vLong) < 8.5 && effectiveThrottle > 0.08) {
      clutchEngage = Math.max(0.5, Math.min(1, 0.5 + (Math.abs(vLong) / 8.5) * 0.5));
    }
  }
  state.clutchEngagement = clutchEngage;

  const coupledRpm =
    gearRatio !== 0
      ? Math.abs((vLong / WHEEL_RADIUS_M) * gearRatio * (60 / (Math.PI * 2)))
      : 1150;
  const launchFloorRpm =
    effectiveThrottle > 0.12 && state.gear !== 0 ? 1200 + effectiveThrottle * 3550 : 1150;
  const targetRpm =
    state.gear === 0 || state.airborneTimeSec > 0
      ? 1150 + effectiveThrottle * 6500
      : Math.max(1150, coupledRpm, launchFloorRpm * (1 - clutchEngage * 0.52));

  state.rpm += (Math.min(7950, targetRpm) - state.rpm) * Math.min(1, dt * 16);

  const shiftCutScale = state.shiftCooldownSec > 0 ? 0.15 : 1.0;
  const engineTorqueNm =
    (effectiveThrottle > 0.03
      ? getEngineTorqueNm(state.rpm, state.turboBoostBar, state.damage.engine) * effectiveThrottle
      : -38 * (state.rpm / 7500)) * shiftCutScale;

  let driveForceTotalN = 0;
  if (state.airborneTimeSec <= 0 && gearRatio !== 0 && !state.stalled) {
    driveForceTotalN = ((engineTorqueNm * gearRatio) / WHEEL_RADIUS_M) * Math.max(0.58, clutchEngage);
    if (state.gear === -1 && vLong < -13.5 && driveForceTotalN < 0) {
      driveForceTotalN *= 0.1;
    }
  }

  let driveFrontShare = tuning.awdFrontTorqueSplit;
  if (tuning.drivetrain === 'RWD') driveFrontShare = 0;
  else if (tuning.drivetrain === 'FWD') driveFrontShare = 1;

  const fxDriveFront = driveForceTotalN * driveFrontShare;
  const fxDriveRear = driveForceTotalN * (1 - driveFrontShare);

  const absScale = inputSettings.absAssist ? 0.96 : 1.0;
  const maxBrakeN = 15800 * absScale;
  const motionSign = Math.tanh(vLong * 3.2);
  const fxBrakeFront = -effectiveBrake * maxBrakeN * tuning.brakeBiasFront * motionSign;
  const fxBrakeRear =
    -(effectiveBrake * maxBrakeN * (1 - tuning.brakeBiasFront) + rawHandbrake * 9800) * motionSign;

  // 6. Dynamic Longitudinal & Lateral Weight Transfer
  const aeroDownforceN = AERO_DOWNFORCE_COEFF * vLong * vLong;
  const totalNormalLoadN = Math.max(
    2200,
    VEHICLE_MASS_KG * 9.81 * Math.cos(sample.roadPitch) + aeroDownforceN,
  );

  const estLongAccelMs2 = (driveForceTotalN + fxBrakeFront + fxBrakeRear) / VEHICLE_MASS_KG;
  const longTransferN = Math.max(
    -2800,
    Math.min(
      2800,
      (VEHICLE_MASS_KG * estLongAccelMs2 * CG_HEIGHT_M) / (WHEELBASE_LF + WHEELBASE_LR),
    ),
  );
  // Note: static 50/50 balance so under acceleration `rearLoad > frontLoad`, under braking `frontLoad > rearLoad`!
  const frontAxleLoadN = Math.max(1400, totalNormalLoadN * 0.5 - longTransferN);
  const rearAxleLoadN = Math.max(1400, totalNormalLoadN * 0.5 + longTransferN);

  // 7. Speed-Sensitive Steering & Self-Aligning Counter-Steer Assist
  const absSpeed = Math.hypot(vLong, vLat);
  const speedRatio = Math.min(1, absSpeed / 45);
  const maxSteerRad = (0.5 - speedRatio * 0.27) * (1 - state.damage.steering * 0.25);

  let alignAssistRad = 0;
  if (vLong > 4.5) {
    const bodySlipRad = Math.atan2(vLat, vLong);
    alignAssistRad = Math.max(-0.22, Math.min(0.22, bodySlipRad * 0.4));
  }

  const steerPullBias = state.damage.steering * 0.04 * state.damage.steeringPullDirection;
  const frontWheelDelta = Math.max(
    -0.54,
    Math.min(
      0.54,
      steerCmd * maxSteerRad +
        alignAssistRad * (1 - Math.abs(steerCmd) * 0.45) +
        steerPullBias,
    ),
  );
  state.steerAngleRad = frontWheelDelta;
  state.steeringWheelDeg = Math.max(-540, Math.min(540, (frontWheelDelta / 0.5) * 420));

  // 8. Surface Grip & Axle Tire Forces
  const surfProfile = getSurfaceProfile(
    state.currentSurface,
    weather,
    tuning.tireCompound,
    tuning.tirePressurePsi,
  );
  const dirtyPenalty =
    state.currentSurface === 'tarmac' ? state.tireDirtiness * 0.08 : 0;
  const tireWearPenalty = state.damage.tires * 0.25;
  const effectivePeakMu = Math.max(
    0.42,
    surfProfile.peakMu * (1 - dirtyPenalty - tireWearPenalty),
  );

  let fxCar = 0;
  let fyCar = 0;
  let yawMomentNm = 0;

  if (state.airborneTimeSec <= 0) {
    const vFrontLat = vLat + state.yawRate * WHEELBASE_LF;
    const cosD = Math.cos(frontWheelDelta);
    const sinD = Math.sin(frontWheelDelta);
    const vWheelFLong = vLong * cosD + vFrontLat * sinD;
    const vWheelFLat = -vLong * sinD + vFrontLat * cosD;

    const alphaF =
      -Math.atan2(vWheelFLat, Math.max(2.0, Math.abs(vWheelFLong))) *
      Math.min(1, absSpeed / 0.8);
    const vRearLat = vLat - state.yawRate * WHEELBASE_LR;
    const alphaR =
      -Math.atan2(vRearLat, Math.max(2.0, Math.abs(vLong))) *
      Math.min(1, absSpeed / 0.8);

    const fMaxFront = frontAxleLoadN * effectivePeakMu;
    const fMaxRear = rearAxleLoadN * effectivePeakMu;

    const muLatF = evaluateContinuousTireCurve(
      alphaF / surfProfile.peakSlipAngleRad,
      effectivePeakMu,
      surfProfile.slideRatio,
      surfProfile.plateauWidth,
    );
    const muLatR = evaluateContinuousTireCurve(
      alphaR / surfProfile.peakSlipAngleRad,
      effectivePeakMu,
      surfProfile.slideRatio,
      surfProfile.plateauWidth,
    );

    const fxF = Math.max(-fMaxFront, Math.min(fMaxFront, fxDriveFront + fxBrakeFront));
    const fyCapF = Math.sqrt(
      Math.max(0.08 * fMaxFront * fMaxFront, fMaxFront * fMaxFront - fxF * fxF * 0.65),
    );
    const fyWheelF = Math.max(
      -fyCapF,
      Math.min(fyCapF, Math.sign(alphaF) * muLatF * frontAxleLoadN),
    );

    const hbRearScale = 1 - rawHandbrake * 0.58;
    const fxR = Math.max(-fMaxRear, Math.min(fMaxRear, fxDriveRear + fxBrakeRear));
    const fyCapR =
      Math.sqrt(
        Math.max(0.08 * fMaxRear * fMaxRear, fMaxRear * fMaxRear - fxR * fxR * 0.65),
      ) * hbRearScale;
    const fyR = Math.max(
      -fyCapR,
      Math.min(fyCapR, Math.sign(alphaR) * muLatR * rearAxleLoadN * hbRearScale),
    );

    const fxFrontChassis = fxF * cosD - fyWheelF * sinD;
    const fyFrontChassis = fxF * sinD + fyWheelF * cosD;

    fxCar = fxFrontChassis + fxR;
    fyCar = fyFrontChassis + fyR;

    const yawDamping = -state.yawRate * (1550 + absSpeed * 48);
    yawMomentNm = WHEELBASE_LF * fyFrontChassis - WHEELBASE_LR * fyR + yawDamping;

    // Populate 4-wheel telemetry
    const latTransferN = Math.max(
      -1600,
      Math.min(1600, (fyCar * CG_HEIGHT_M) / 1.62),
    );
    state.wheels[0].normalLoadN = Math.max(300, frontAxleLoadN * 0.5 - latTransferN * 0.5);
    state.wheels[1].normalLoadN = Math.max(300, frontAxleLoadN * 0.5 + latTransferN * 0.5);
    state.wheels[2].normalLoadN = Math.max(300, rearAxleLoadN * 0.5 - latTransferN * 0.5);
    state.wheels[3].normalLoadN = Math.max(300, rearAxleLoadN * 0.5 + latTransferN * 0.5);

    const combF = Math.hypot(
      alphaF / surfProfile.peakSlipAngleRad,
      fxF / Math.max(1, fMaxFront),
    );
    const combR = Math.hypot(
      alphaR / surfProfile.peakSlipAngleRad,
      fxR / Math.max(1, fMaxRear) + rawHandbrake * 0.95,
    );

    for (let i = 0; i < 4; i++) {
      const w = state.wheels[i];
      const isFront = i < 2;
      w.surface = state.currentSurface;
      w.gripFactor = effectivePeakMu;
      w.slipAngleRad = isFront ? alphaF : alphaR;
      w.slipRatio = isFront ? fxF / Math.max(1, fMaxFront) : fxR / Math.max(1, fMaxRear);
      w.combinedSlip = isFront ? combF : combR;
      const locked = !isFront && rawHandbrake > 0.68;
      w.angularVel = locked ? 0 : vLong / WHEEL_RADIUS_M + w.slipRatio * 18;
    }

    state.damage.tires = Math.min(
      0.85,
      state.damage.tires + (combF + combR) * 0.00012 * diffDef.damageScale * dt,
    );
  } else {
    yawMomentNm = -state.yawRate * 950;
  }

  // 9. Smooth Drag, Zero-Lockup Rolling Resistance & Slope Gravity
  const aeroDragN = -AERO_DRAG_COEFF * vLong * Math.abs(vLong);
  const rollingDragN =
    state.airborneTimeSec > 0
      ? 0
      : -VEHICLE_MASS_KG * 9.81 * surfProfile.rollingResistance * Math.tanh(vLong * 2.2);
  const slopeGravityLongN = -VEHICLE_MASS_KG * 9.81 * Math.sin(sample.roadPitch) * 0.66;
  const bankGravityLatN = VEHICLE_MASS_KG * 9.81 * Math.sin(sample.roadBank) * 0.45;
  const lateralScrubDragN =
    state.airborneTimeSec > 0 ? 0 : -VEHICLE_MASS_KG * 1.45 * Math.tanh(vLat * 1.8);

  const totalFx = fxCar + aeroDragN + rollingDragN + slopeGravityLongN;
  const totalFy = fyCar + bankGravityLatN + lateralScrubDragN;

  // 10. Integrate Motion
  const axWorld = (totalFx * fwdX + totalFy * rightX) / VEHICLE_MASS_KG;
  const azWorld = (totalFx * fwdZ + totalFy * rightZ) / VEHICLE_MASS_KG;

  state.vx += axWorld * dt;
  state.vz += azWorld * dt;

  if (
    state.airborneTimeSec <= 0 &&
    effectiveThrottle < 0.02 &&
    Math.hypot(state.vx, state.vz) < 0.35 &&
    (effectiveBrake > 0.15 || rawHandbrake > 0.2 || Math.abs(sample.roadPitch) < 0.04)
  ) {
    state.vx = 0;
    state.vz = 0;
    state.yawRate = 0;
  }

  state.yawRate += (yawMomentNm / YAW_INERTIA) * dt;
  state.yawRate = Math.max(-3.2, Math.min(3.2, state.yawRate));
  state.yaw += state.yawRate * dt;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // 11. Smooth Corridor Safety Boundary (Zero Sinking, Zero Getting Trapped!)
  const post = sampleStageAtWorldPos(stage, state.x, state.z, state.currentSegmentIndex);
  state.currentSegmentIndex = post.segmentIndex;
  state.distanceAlongStageM = post.distanceAlongStageM;
  state.lateralOffsetM = post.lateralOffsetM;

  const seg = post.segment;
  const maxCorridorM = post.halfWidthM + 4.4;

  if (Math.abs(post.lateralOffsetM) > maxCorridorM) {
    const side = Math.sign(post.lateralOffsetM);
    const pen = Math.abs(post.lateralOffsetM) - maxCorridorM;
    state.x -= seg.normalX * side * pen;
    state.z -= seg.normalZ * side * pen;
    state.lateralOffsetM = side * maxCorridorM;

    const vNorm = state.vx * seg.normalX + state.vz * seg.normalZ;
    if (vNorm * side > 0) {
      const impactSpeed = Math.abs(vNorm);
      const bounceFactor = impactSpeed > 4.0 ? 1.08 : 1.0;
      state.vx -= seg.normalX * (vNorm * bounceFactor);
      state.vz -= seg.normalZ * (vNorm * bounceFactor);
      const scrapeKeep = Math.max(0.88, 1 - dt * (0.45 + impactSpeed * 0.05));
      state.vx *= scrapeKeep;
      state.vz *= scrapeKeep;

      // Guide nose smoothly along guardrail/embankment so car never wedges perpendicular to wall
      let yawErr = post.roadYaw - state.yaw;
      while (yawErr > Math.PI) yawErr -= Math.PI * 2;
      while (yawErr < -Math.PI) yawErr += Math.PI * 2;
      if (Math.abs(yawErr) < Math.PI * 0.78) {
        state.yaw += yawErr * Math.min(0.5, dt * 9.5);
        state.yawRate *= Math.max(0.4, 1 - dt * 12);
      }

      if (impactSpeed > 7.5) {
        const hitDmg = Math.min(0.12, (impactSpeed - 7.5) * 0.008) * diffDef.damageScale;
        state.damage.steering = Math.min(0.75, state.damage.steering + hitDmg * 0.6);
        state.damage.lights = Math.min(0.8, state.damage.lights + hitDmg * 0.7);
        state.damage.engine = Math.min(0.75, state.damage.engine + hitDmg * 0.4);
      }
    }
  }

  // 12. Update Local Speeds & Chassis Attitude Springs
  const nFwdX = Math.sin(state.yaw);
  const nFwdZ = -Math.cos(state.yaw);
  const nRightX = Math.cos(state.yaw);
  const nRightZ = Math.sin(state.yaw);

  state.forwardSpeedMs = state.vx * nFwdX + state.vz * nFwdZ;
  state.lateralSpeedMs = state.vx * nRightX + state.vz * nRightZ;
  state.longitudinalAccelG = totalFx / (VEHICLE_MASS_KG * 9.81);
  state.lateralAccelG = totalFy / (VEHICLE_MASS_KG * 9.81);

  const squatPitch = Math.max(-0.055, Math.min(0.055, state.longitudinalAccelG * 0.032));
  const targetPitch = post.roadPitch + squatPitch;
  const bodyLeanRoll = Math.max(-0.075, Math.min(0.075, -state.lateralAccelG * 0.038));
  const targetRoll = post.roadBank + bodyLeanRoll;

  const kSpring = 42 * tuning.dampingStiffness;
  const cDamp = 10.5 * tuning.dampingStiffness;
  state.pitchVel += ((targetPitch - state.pitch) * kSpring - state.pitchVel * cDamp) * dt;
  state.pitch += state.pitchVel * dt;
  state.rollVel += ((targetRoll - state.roll) * kSpring - state.rollVel * cDamp) * dt;
  state.roll += state.rollVel * dt;

  // Suspension compression per wheel
  const bumpPhase = state.distanceAlongStageM * 1.85;
  const bumpAmp =
    state.airborneTimeSec > 0
      ? 0
      : surfProfile.bumpAmplitude * Math.min(1, Math.abs(state.forwardSpeedMs) / 18);
  const travel = tuning.suspensionTravel;

  if (state.airborneTimeSec <= 0) {
    state.wheels[0].compression = Math.max(
      0.01,
      Math.min(travel, travel * 0.42 - squatPitch * 1.2 - bodyLeanRoll * 1.1 + Math.sin(bumpPhase) * bumpAmp),
    );
    state.wheels[1].compression = Math.max(
      0.01,
      Math.min(travel, travel * 0.42 - squatPitch * 1.2 + bodyLeanRoll * 1.1 + Math.sin(bumpPhase + 1.6) * bumpAmp),
    );
    state.wheels[2].compression = Math.max(
      0.01,
      Math.min(travel, travel * 0.42 + squatPitch * 1.2 - bodyLeanRoll * 1.1 + Math.sin(bumpPhase + 3.1) * bumpAmp),
    );
    state.wheels[3].compression = Math.max(
      0.01,
      Math.min(travel, travel * 0.42 + squatPitch * 1.2 + bodyLeanRoll * 1.1 + Math.sin(bumpPhase + 4.7) * bumpAmp),
    );
  }
}
