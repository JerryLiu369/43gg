import { sampleStageAtWorldPos } from './stages.ts';
import type {
  CarPhysicsState,
  DamageState,
  DrivingAssistPreset,
  InputSettings,
  MistakeRecord,
  StageDefinition,
  SurfaceType,
  TuningSetup,
  WeatherType,
  WheelState,
} from './types.ts';

export const FIXED_DT = 1 / 120; // 120Hz deterministic physics step

export const DEFAULT_TUNING: TuningSetup = {
  name: 'WRC 厂队均衡设定 (Gravel/Mixed)',
  drivetrain: 'AWD',
  finalDriveRatio: 1.0,
  frontSpringRate: 44,
  rearSpringRate: 42,
  suspensionTravel: 0.22,
  dampingStiffness: 1.0,
  awdFrontTorqueSplit: 0.42, // 42% Front / 58% Rear slightly tail-happy AWD
  diffLock: 0.65,
  brakeBiasFront: 0.62,
  tirePressurePsi: 24,
  tireCompound: 'gravel',
};

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  steerSensitivity: 1.0,
  steerDeadzone: 0.04,
  steerLinearity: 1.55,
  throttleGamma: 1.25,
  brakeGamma: 1.35,
  pacenoteLeadScale: 1.0,
  pacenoteAudioEnabled: true,
  pacenoteVisualEnabled: true,
  // Pure Pro Manual simulation profile (all assists OFF)
  autoGearbox: false,
  autoClutch: false,
  absAssist: false,
  tcsAssist: false,
};

export const SPORT_INPUT_SETTINGS: InputSettings = {
  ...DEFAULT_INPUT_SETTINGS,
  autoGearbox: true,
  autoClutch: true,
  absAssist: false,
  tcsAssist: false,
};

export function getDrivingPreset(settings: InputSettings): DrivingAssistPreset {
  return settings.autoGearbox && settings.autoClutch ? 'sport' : 'pro';
}

export function applyDrivingPreset(
  current: InputSettings,
  preset: DrivingAssistPreset
): InputSettings {
  if (preset === 'sport') {
    return {
      ...current,
      autoGearbox: true,
      autoClutch: true,
    };
  }
  return {
    ...current,
    autoGearbox: false,
    autoClutch: false,
    absAssist: false,
    tcsAssist: false,
  };
}

export interface RawControlsInput {
  steer: number; // -1 (left) to +1 (right)
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  handbrake: number; // 0 to 1
  clutch: number; // 0 to 1 (1 = clutch depressed)
  shiftUpJustPressed: boolean;
  shiftDownJustPressed: boolean;
  ignitionJustPressed: boolean;
}

export interface SurfacePhysicsProfile {
  peakMu: number;
  slideMuRatio: number; // Slide friction / Peak friction (0.72..0.88 for recoverable transition)
  peakSlipAngleRad: number; // Angle where lateral grip peaks
  peakSlipRatio: number; // Longitudinal slip ratio where traction/braking peaks
  plateauWidth: number; // Width of progressive warning plateau past peak
  rollingResistance: number;
  bumpFreqHz: number;
  bumpAmpM: number;
  dirtContribution: number; // Rate at which surface contaminates tires (- cleans, + dirties)
}

export function getSurfaceProfile(
  surface: SurfaceType,
  weather: WeatherType,
  tireCompound: TuningSetup['tireCompound'],
  tirePressurePsi: number
): SurfacePhysicsProfile {
  let base: SurfacePhysicsProfile;

  switch (surface) {
    case 'tarmac':
      base = {
        peakMu: 1.32,
        slideMuRatio: 0.76,
        peakSlipAngleRad: 0.115, // ~6.6 deg: crisp turn-in
        peakSlipRatio: 0.11,
        plateauWidth: 0.55,
        rollingResistance: 0.014,
        bumpFreqHz: 14.0,
        bumpAmpM: 0.005,
        dirtContribution: -0.35, // Scrubs dirt off tires
      };
      break;
    case 'tarmac_dirty':
      base = {
        peakMu: 0.86,
        slideMuRatio: 0.78,
        peakSlipAngleRad: 0.155, // ~8.9 deg
        peakSlipRatio: 0.15,
        plateauWidth: 0.75,
        rollingResistance: 0.022,
        bumpFreqHz: 18.0,
        bumpAmpM: 0.018,
        dirtContribution: 0.45,
      };
      break;
    case 'gravel':
      base = {
        peakMu: 0.96,
        slideMuRatio: 0.85, // Broad progressive drift recovery on loose gravel
        peakSlipAngleRad: 0.21, // ~12 deg: loves slip angle
        peakSlipRatio: 0.19,
        plateauWidth: 0.95,
        rollingResistance: 0.032,
        bumpFreqHz: 24.0,
        bumpAmpM: 0.034,
        dirtContribution: 0.65,
      };
      break;
    case 'snow':
      base = {
        peakMu: 0.72,
        slideMuRatio: 0.84,
        peakSlipAngleRad: 0.23, // ~13.2 deg
        peakSlipRatio: 0.22,
        plateauWidth: 1.05,
        rollingResistance: 0.044,
        bumpFreqHz: 11.0,
        bumpAmpM: 0.026,
        dirtContribution: -0.2,
      };
      break;
    case 'ice':
      base = {
        peakMu: 0.42,
        slideMuRatio: 0.82, // Low grip but communicative & recoverable transition
        peakSlipAngleRad: 0.14,
        peakSlipRatio: 0.12,
        plateauWidth: 0.9,
        rollingResistance: 0.012,
        bumpFreqHz: 16.0,
        bumpAmpM: 0.009,
        dirtContribution: -0.1,
      };
      break;
    case 'water_puddle':
      base = {
        peakMu: 0.54,
        slideMuRatio: 0.79,
        peakSlipAngleRad: 0.15,
        peakSlipRatio: 0.14,
        plateauWidth: 0.8,
        rollingResistance: 0.085, // Strong hydrodynamic drag
        bumpFreqHz: 20.0,
        bumpAmpM: 0.024,
        dirtContribution: -0.8, // Washes dirt off
      };
      break;
    case 'offtrack':
      base = {
        peakMu: 0.58,
        slideMuRatio: 0.78,
        peakSlipAngleRad: 0.24,
        peakSlipRatio: 0.24,
        plateauWidth: 0.85,
        rollingResistance: 0.115, // Heavy grass/rough verge drag slows car down
        bumpFreqHz: 19.0,
        bumpAmpM: 0.078,
        dirtContribution: 1.2, // Quickly coats tires in mud/gravel
      };
      break;
  }

  // Weather modifier
  let weatherMult = 1.0;
  if (weather === 'rain') {
    if (surface === 'tarmac') weatherMult = 0.83;
    else if (surface === 'tarmac_dirty') weatherMult = 0.78;
    else if (surface === 'gravel') weatherMult = 0.91;
    else if (surface === 'offtrack') weatherMult = 0.76;
  } else if (weather === 'snow') {
    if (surface === 'tarmac' || surface === 'tarmac_dirty') weatherMult = 0.68;
    else if (surface === 'gravel') weatherMult = 0.78;
  } else if (weather === 'fog') {
    weatherMult = 0.95; // Damp morning dew
  }

  // Tire compound match modifier
  let compoundMult = 1.0;
  if (tireCompound === 'tarmac_dry') {
    if (surface === 'tarmac' && weather === 'clear') compoundMult = 1.1;
    else if (surface === 'tarmac' && weather === 'rain') compoundMult = 0.86;
    else if (surface === 'gravel') compoundMult = 0.82;
    else if (surface === 'snow' || surface === 'ice') compoundMult = 0.62;
  } else if (tireCompound === 'tarmac_wet') {
    if (surface === 'tarmac' && weather === 'rain') compoundMult = 1.08;
    else if (surface === 'water_puddle') compoundMult = 1.18;
    else if (surface === 'tarmac') compoundMult = 0.98;
    else if (surface === 'gravel') compoundMult = 0.88;
    else if (surface === 'snow' || surface === 'ice') compoundMult = 0.75;
  } else if (tireCompound === 'gravel') {
    if (surface === 'gravel' || surface === 'tarmac_dirty' || surface === 'offtrack') {
      compoundMult = 1.08;
    } else if (surface === 'tarmac') {
      compoundMult = 0.9;
    } else if (surface === 'snow') {
      compoundMult = 0.92;
    }
  } else if (tireCompound === 'snow') {
    if (surface === 'snow' || surface === 'ice') compoundMult = 1.22; // Studded snow tire bite!
    else if (surface === 'gravel') compoundMult = 0.92;
    else if (surface === 'tarmac') compoundMult = 0.78; // Studs squirm on dry tarmac
  }

  // Tire pressure effect: lower PSI helps loose gravel/snow footprint; higher PSI helps tarmac precision
  const idealPsi =
    surface === 'tarmac' ? 31 : surface === 'gravel' || surface === 'tarmac_dirty' ? 23 : 20;
  const psiDiff = Math.abs(tirePressurePsi - idealPsi);
  const psiMult = Math.max(0.9, 1.0 - psiDiff * 0.0055);

  return {
    ...base,
    peakMu: base.peakMu * weatherMult * compoundMult * psiMult,
  };
}

/**
 * Continuous Pacejka-like non-linear tire curve with a communicative peak,
 * controllable transition plateau, and progressive post-peak slide drop-off.
 */
export function evaluateContinuousTireCurve(
  normalizedSlip: number,
  peakMu: number,
  slideMuRatio: number,
  plateauWidth: number
): number {
  const s = Math.abs(normalizedSlip);
  if (s <= 0.0001) return 0;

  if (s <= 1.0) {
    // Smooth cubic-sine build up to peak at s = 1.0
    // Gives crisp linear feel at low slip (0..0.5) and progressive softening near peak (0.6..1.0)
    return peakMu * Math.sin((s * Math.PI) * 0.5);
  }

  // Above peak (s > 1.0): enter the transition zone where driver feels the car starting to slide
  // but still has strong recovery authority before settling to sliding friction
  const excess = s - 1.0;
  const decay = Math.exp((-excess * excess) / (plateauWidth * plateauWidth * 1.4));
  const slideMu = peakMu * slideMuRatio;
  return slideMu + (peakMu - slideMu) * decay;
}

/**
 * Engine torque curve (Nm) from 0 to 8000 RPM, including low-RPM lugging deficiency
 * and turbocharger boost pressure multiplication.
 */
export function getEngineTorqueNm(
  rpm: number,
  turboBoostBar: number,
  engineDamage: number
): number {
  if (rpm < 500) return 45;
  // Naturally aspirated baseline 2.0L curve (weak at low RPM, peaks around 5500)
  let baseTorque = 115;
  if (rpm < 2200) {
    // Low RPM torque deficit (easy to bog down or stall on hill starts without clutch!)
    baseTorque = 78 + ((rpm - 500) / 1700) * 85;
  } else if (rpm < 6200) {
    baseTorque = 163 + ((rpm - 2200) / 4000) * 65;
  } else if (rpm <= 7800) {
    baseTorque = 228 - ((rpm - 6200) / 1600) * 58;
  } else {
    // Soft rev limiter cut above 7800 RPM
    baseTorque = 15;
  }

  // Turbo boost multiplier (up to +1.65 bar adds dramatic mid-to-high range punch)
  const effectiveBoost = Math.max(0, turboBoostBar);
  const turboMult = 1.0 + effectiveBoost * 0.72;

  // Engine damage reduces power and causes high-RPM misfire loss
  const healthMult = Math.max(0.38, 1.0 - engineDamage * 0.58);

  return baseTorque * turboMult * healthMult;
}

const BASE_GEAR_RATIOS: Record<number, number> = {
  [-1]: -3.45, // Reverse
  [0]: 0, // Neutral
  [1]: 3.35,
  [2]: 2.26,
  [3]: 1.64,
  [4]: 1.25,
  [5]: 0.99,
  [6]: 0.81,
};

const FINAL_DRIVE_BASE = 4.15;
const WHEEL_RADIUS_M = 0.33;
const CAR_MASS_KG = 1230;
const CAR_INERTIA_YAW = 1680; // kg * m^2
const WHEELBASE_M = 2.56;
const HALF_WHEELBASE_M = WHEELBASE_M * 0.5;
const TRACK_WIDTH_M = 1.62;
const CG_HEIGHT_M = 0.52;

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

export function createInitialCarState(stage: StageDefinition): CarPhysicsState {
  const startSeg = stage.segments[2] || stage.segments[0];
  const startYaw = Math.atan2(startSeg.tangentX, startSeg.tangentZ);

  const makeWheel = (id: WheelState['id']): WheelState => ({
    id,
    compression: 0.08,
    compressionVel: 0,
    normalLoadN: (CAR_MASS_KG * 9.81) / 4,
    slipRatio: 0,
    slipAngleRad: 0,
    combinedSlip: 0,
    gripFactor: 1.0,
    angularVel: 0,
    surface: stage.primarySurface,
    isGrounded: true,
    bottomedOutImpact: 0,
  });

  return {
    x: startSeg.x,
    y: startSeg.y,
    z: startSeg.z,
    yaw: startYaw,
    pitch: 0,
    roll: 0,
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
    rpm: 1050,
    stalled: false,
    starterCranking: 0,
    turboBoostBar: 0,
    bovVentTrigger: 0,
    backfireTrigger: 0,
    shiftCooldownSec: 0,
    missedShiftCrunch: 0,
    clutchEngagement: 0,
    steerAngleRad: 0,
    steeringWheelDeg: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    clutchPedal: 0,
    currentSurface: stage.primarySurface,
    tireDirtiness: 0,
    rutAccumulation: 0,
    airborneTimeSec: 0,
    lastLandingForceG: 0,
    wheels: [makeWheel('FL'), makeWheel('FR'), makeWheel('RL'), makeWheel('RR')],
    distanceAlongStageM: startSeg.distanceM,
    lateralOffsetM: 0,
    roadWidthM: startSeg.widthM,
    currentSegmentIndex: startSeg.index,
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

export function interpolateCarState(
  prev: CarPhysicsState,
  curr: CarPhysicsState,
  alpha: number
): CarPhysicsState {
  const t = Math.max(0, Math.min(1, alpha));
  const lerp = (a: number, b: number) => a + (b - a) * t;

  // Shortest angle interpolation for yaw
  let dYaw = curr.yaw - prev.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;

  return {
    ...curr,
    x: lerp(prev.x, curr.x),
    y: lerp(prev.y, curr.y),
    z: lerp(prev.z, curr.z),
    yaw: prev.yaw + dYaw * t,
    pitch: lerp(prev.pitch, curr.pitch),
    roll: lerp(prev.roll, curr.roll),
    forwardSpeedMs: lerp(prev.forwardSpeedMs, curr.forwardSpeedMs),
    lateralSpeedMs: lerp(prev.lateralSpeedMs, curr.lateralSpeedMs),
    longitudinalAccelG: lerp(prev.longitudinalAccelG, curr.longitudinalAccelG),
    lateralAccelG: lerp(prev.lateralAccelG, curr.lateralAccelG),
    rpm: lerp(prev.rpm, curr.rpm),
    turboBoostBar: lerp(prev.turboBoostBar, curr.turboBoostBar),
    steerAngleRad: lerp(prev.steerAngleRad, curr.steerAngleRad),
    steeringWheelDeg: lerp(prev.steeringWheelDeg, curr.steeringWheelDeg),
    distanceAlongStageM: lerp(prev.distanceAlongStageM, curr.distanceAlongStageM),
    lateralOffsetM: lerp(prev.lateralOffsetM, curr.lateralOffsetM),
  };
}

/**
 * Advances the rally car simulation by one fixed step `dt` (typically 1/120s).
 */
export function stepCarPhysics(
  state: CarPhysicsState,
  rawInput: RawControlsInput,
  stage: StageDefinition,
  tuning: TuningSetup,
  inputSettings: InputSettings,
  weather: WeatherType,
  stageTimeSec: number,
  mistakesOut?: MistakeRecord[],
  dt: number = FIXED_DT
): void {
  if (state.damage.isTerminal) {
    state.throttle = 0;
    state.brake = 1.0;
    state.forwardSpeedMs *= 0.92;
    state.vx *= 0.92;
    state.vz *= 0.92;
    return;
  }

  // 1. Input shaping (deadzone, linearity, gamma, steering damage pull)
  let rawSteer = rawInput.steer;
  if (Math.abs(rawSteer) < inputSettings.steerDeadzone) {
    rawSteer = 0;
  } else {
    const sign = Math.sign(rawSteer);
    const norm = (Math.abs(rawSteer) - inputSettings.steerDeadzone) / (1 - inputSettings.steerDeadzone);
    rawSteer = sign * Math.pow(Math.max(0, Math.min(1, norm)), inputSettings.steerLinearity);
  }

  // Speed-sensitive steering limit only at very high speed so low-speed hairpins have full 32 deg lock
  const maxSteerRad = (0.56 - Math.min(0.18, Math.abs(state.forwardSpeedMs) * 0.0032)) * (1 - state.damage.steering * 0.28);
  const damagePullRad = state.damage.steering * 0.085 * state.damage.steeringPullDirection;
  const targetSteerRad =
    Math.max(-maxSteerRad, Math.min(maxSteerRad, rawSteer * maxSteerRad * inputSettings.steerSensitivity)) +
    damagePullRad;

  const steerRate = 9.5; // Fast counter-steer response
  state.steerAngleRad += (targetSteerRad - state.steerAngleRad) * Math.min(1, steerRate * dt);
  state.steeringWheelDeg = (state.steerAngleRad / 0.56) * 540;

  state.throttle = Math.pow(Math.max(0, Math.min(1, rawInput.throttle)), inputSettings.throttleGamma);
  state.brake = Math.pow(Math.max(0, Math.min(1, rawInput.brake)), inputSettings.brakeGamma);
  state.handbrake = Math.max(0, Math.min(1, rawInput.handbrake));
  state.clutchPedal = Math.max(0, Math.min(1, rawInput.clutch));

  // Decay one-shot audio/visual triggers
  state.bovVentTrigger = Math.max(0, state.bovVentTrigger - dt);
  state.backfireTrigger = Math.max(0, state.backfireTrigger - dt);
  state.missedShiftCrunch = Math.max(0, state.missedShiftCrunch - dt);

  // 2. Sample stage spline at car center
  const trackSample = sampleStageAtWorldPos(
    stage,
    state.x,
    state.z,
    state.currentSegmentIndex
  );
  state.currentSegmentIndex = trackSample.segmentIndex;
  state.distanceAlongStageM = Math.max(state.distanceAlongStageM, trackSample.distanceM);
  state.lateralOffsetM = trackSample.lateralOffsetM;
  state.roadWidthM = trackSample.widthM;
  state.currentSurface = trackSample.surface;

  // Hard invisible valley safety boundary at +-18m so the car can never fall off the world
  const maxExcursionM = trackSample.widthM * 0.5 + 11.5;
  if (Math.abs(trackSample.lateralOffsetM) > maxExcursionM) {
    const seg = stage.segments[trackSample.segmentIndex];
    const sign = Math.sign(trackSample.lateralOffsetM);
    const pushBack = Math.abs(trackSample.lateralOffsetM) - maxExcursionM;
    state.x -= seg.normalX * sign * pushBack;
    state.z -= seg.normalZ * sign * pushBack;
    state.vx *= 0.65;
    state.vz *= 0.65;
  }

  // Record off-track mistake if driver goes > 1.8m outside road edge at speed
  if (
    mistakesOut &&
    trackSample.surface === 'offtrack' &&
    Math.abs(trackSample.lateralOffsetM) > trackSample.widthM * 0.5 + 1.8 &&
    Math.abs(state.forwardSpeedMs) > 6
  ) {
    const lastMistake = mistakesOut[mistakesOut.length - 1];
    if (!lastMistake || stageTimeSec - lastMistake.timeSec > 4.5) {
      const sector: 1 | 2 | 3 =
        state.distanceAlongStageM < stage.sectorSplitsM[0]
          ? 1
          : state.distanceAlongStageM < stage.sectorSplitsM[1]
            ? 2
            : 3;
      mistakesOut.push({
        id: `off_${ Math.round(stageTimeSec * 10) }`,
        timeSec: stageTimeSec,
        distanceM: Math.round(state.distanceAlongStageM),
        sector,
        type: 'off_track',
        label: '冲出赛道边界 (草坡/排水沟减速)',
        timeLossEstSec: 2.4,
      });
    }
  }

  // 3. Transform world velocity into local car frame
  // Car forward vector is (sin(yaw), cos(yaw)), right vector is (cos(yaw), -sin(yaw))
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const prevForwardSpeed = state.forwardSpeedMs;

  const vLong = state.vx * sinYaw + state.vz * cosYaw;
  const vLat = state.vx * cosYaw - state.vz * sinYaw;
  state.forwardSpeedMs = vLong;
  state.lateralSpeedMs = vLat;

  // 4. Gearbox, Clutch, Engine & Turbo Dynamics
  if (state.shiftCooldownSec > 0) {
    state.shiftCooldownSec = Math.max(0, state.shiftCooldownSec - dt);
  }

  // Optional sequential auto-gearbox assist (with instant manual Q/E override & smart auto-reverse)
  let wantShiftUp = rawInput.shiftUpJustPressed;
  let wantShiftDown = rawInput.shiftDownJustPressed;
  if (
    inputSettings.autoGearbox &&
    state.shiftCooldownSec <= 0 &&
    !wantShiftUp &&
    !wantShiftDown
  ) {
    if (state.gear <= 0 && state.throttle > 0.2 && state.forwardSpeedMs > -1.5) {
      state.gear = 1;
      state.shiftCooldownSec = 0.12;
    } else if (
      state.gear >= 1 &&
      state.forwardSpeedMs < 0.65 &&
      state.brake > 0.65 &&
      state.throttle < 0.08
    ) {
      state.gear = -1;
      state.shiftCooldownSec = 0.25;
    } else if (
      state.gear >= 1 &&
      state.gear < 6 &&
      state.rpm > 7180 &&
      state.throttle > 0.25 &&
      state.forwardSpeedMs >=
        ([0, 11.2, 17.2, 23.6, 30.5, 38.0][state.gear] || 12) / tuning.finalDriveRatio &&
      (state.wheels[2].isGrounded || state.wheels[3].isGrounded)
    ) {
      wantShiftUp = true;
    } else if (
      state.gear > 1 &&
      state.rpm < 3650 &&
      state.forwardSpeedMs < (state.gear - 1) * 12.2 + 2.5
    ) {
      wantShiftDown = true;
    }
  }

  // Process gear shift requests
  if (wantShiftUp && state.gear < 6) {
    const nextGear = state.gear + 1;
    // Check if shifting under load without clutch when autoClutch is off & gearbox has wear
    const harshNoClutchShift =
      !inputSettings.autoClutch &&
      state.clutchPedal < 0.35 &&
      state.throttle > 0.75 &&
      state.gear >= 1;

    if (harshNoClutchShift && state.damage.gearbox > 0.25) {
      state.missedShiftCrunch = 0.45;
      state.damage.gearbox = Math.min(1, state.damage.gearbox + 0.04);
    }
    state.gear = nextGear;
    state.shiftCooldownSec = 0.11 + state.damage.gearbox * 0.14;
    if (state.turboBoostBar > 0.5) {
      state.bovVentTrigger = 0.28;
      state.backfireTrigger = 0.22;
    }
  } else if (wantShiftDown && state.gear > -1) {
    // Prevent shifting into Reverse while moving forward fast
    if (state.gear === 0 && state.forwardSpeedMs > 3.5) {
      state.missedShiftCrunch = 0.35;
    } else {
      state.gear = state.gear - 1;
      state.shiftCooldownSec = 0.10 + state.damage.gearbox * 0.14;
      if (state.rpm > 4300) {
        state.backfireTrigger = 0.24;
      }
    }
  }

  // Random gear pop-out to Neutral if gearbox damage is severe (> 0.65) over bumps
  if (
    state.damage.gearbox > 0.65 &&
    state.gear > 1 &&
    state.wheels[0].bottomedOutImpact > 0.5 &&
    Math.sin(stageTimeSec * 47.3) > 0.75
  ) {
    state.gear = 0;
    state.missedShiftCrunch = 0.5;
  }

  // Clutch engagement calculation (supports manual clutch pedal, launch bite point, and hill starts)
  if (state.gear === 0 || state.shiftCooldownSec > 0) {
    state.clutchEngagement = 0;
  } else if (inputSettings.autoClutch) {
    // Automatic launch & anti-stall clutch modulation
    const launchSlip = Math.max(0, Math.min(1, (state.rpm - 1350) / 1800));
    const speedLock = Math.max(0, Math.min(1, Math.abs(state.forwardSpeedMs) / 5.5));
    state.clutchEngagement = Math.max(launchSlip * state.throttle, speedLock);
  } else {
    // Pure manual clutch with realistic half-clutch bite zone
    // If player doesn't press clutch pedal (clutchPedal = 0), clutch is engaged,
    // with a small mechanical flywheel slip buffer at launch if throttle is applied
    const pedalEngage = 1.0 - state.clutchPedal;
    if (Math.abs(state.forwardSpeedMs) < 3.5 && state.throttle > 0.15 && state.clutchPedal < 0.1) {
      // Allow slight clutch slip on standing start if throttle > 0.4, but bog/stall if throttle is too low on steep hill!
      const hillLoad = Math.max(0, trackSample.slope * 12);
      if (state.throttle < 0.22 + hillLoad * 0.25 && state.rpm < 1100) {
        state.clutchEngagement = 1.0; // Direct lock -> can stall!
      } else {
        state.clutchEngagement = Math.min(pedalEngage, 0.35 + state.throttle * 0.65);
      }
    } else {
      state.clutchEngagement = pedalEngage;
    }
  }

  // Handle engine stall & restart
  if (state.stalled) {
    state.rpm = Math.max(0, state.rpm - 2200 * dt);
    state.turboBoostBar = Math.max(0, state.turboBoostBar - 3.0 * dt);
    if (
      rawInput.ignitionJustPressed ||
      (state.throttle > 0.5 && (state.clutchPedal > 0.5 || state.gear === 0 || state.forwardSpeedMs < 1.0))
    ) {
      state.starterCranking += dt * 2.2;
      if (state.starterCranking >= 1.0) {
        state.stalled = false;
        state.starterCranking = 0;
        state.rpm = 1250;
      }
    } else {
      state.starterCranking = Math.max(0, state.starterCranking - dt);
    }
  }

  const gearRatio = (BASE_GEAR_RATIOS[state.gear] || 0) *FINAL_DRIVE_BASE * tuning.finalDriveRatio;
  const wheelAvgAngularVel =
    (state.wheels[0].angularVel +
      state.wheels[1].angularVel +
      state.wheels[2].angularVel +
      state.wheels[3].angularVel) *
    0.25;

  const transmissionRpm = Math.abs(wheelAvgAngularVel * gearRatio * (60 / (Math.PI * 2)));

  if (!state.stalled) {
    // Free-rev target RPM from throttle
    const idleRpm = 980;
    const maxRpm = 7850 - state.damage.engine * 950;
    const freeRevRpm = idleRpm + state.throttle * (maxRpm - idleRpm);

    // Blend between free engine revving and coupled transmission RPM via clutch engagement
    const coupledWeight = state.gear === 0 ? 0 : state.clutchEngagement;
    const targetRpm = freeRevRpm * (1 - coupledWeight * 0.78) + transmissionRpm * (coupledWeight * 0.78);

    const rpmRate = state.gear === 0 || state.clutchEngagement < 0.2 ? 14.0 : 9.5;
    state.rpm += (targetRpm - state.rpm) * Math.min(1, rpmRate * dt);

    // Low-RPM stall check: in gear, clutch engaged, climbing or braking without clutch at < 620 RPM
    if (
      !inputSettings.autoClutch &&
      state.gear !== 0 &&
      state.clutchEngagement > 0.85 &&
      state.throttle < 0.12 &&
      state.rpm < 640 &&
      Math.abs(state.forwardSpeedMs) < 1.2 &&
      (state.brake > 0.5 || trackSample.slope > 0.035)
    ) {
      state.stalled = true;
      state.rpm = 0;
      if (mistakesOut) {
        const sector: 1 | 2 | 3 =
          state.distanceAlongStageM < stage.sectorSplitsM[0]
            ? 1
            : state.distanceAlongStageM < stage.sectorSplitsM[1]
              ? 2
              : 3;
        mistakesOut.push({
          id: `stall_${Math.round(stageTimeSec * 10)}`,
          timeSec: stageTimeSec,
          distanceM: Math.round(state.distanceAlongStageM),
          sector,
          type: 'engine_stall',
          label: '低转速未踩离合熄火 (Stall)',
          timeLossEstSec: 1.8,
        });
      }
    }

    state.rpm = Math.max(state.stalled ? 0 : 750, Math.min(8000, state.rpm));
  }

  // Turbocharger spool & lag simulation
  const prevBoost = state.turboBoostBar;
  const spoolFactor = Math.max(0, (state.rpm - 2600) / 4200);
  const maxBoost = (1.65 - state.damage.engine * 0.65) * spoolFactor;
  const targetBoost = state.throttle > 0.25 ? state.throttle * maxBoost : -0.25;
  // Spool up has realistic turbo lag (rate ~ 2.4/s), blow-off drop is much faster (rate ~ 8.5/s)
  const boostRate = targetBoost > state.turboBoostBar ? 2.4 : 8.5;
  state.turboBoostBar += (targetBoost - state.turboBoostBar) * Math.min(1, boostRate * dt);

  if (prevBoost > 0.65 && state.throttle < 0.15 && state.bovVentTrigger <= 0) {
    state.bovVentTrigger = 0.32;
    if (state.rpm > 4800) {
      state.backfireTrigger = 0.22;
    }
  }

  // 5. 4-Wheel Suspension Kinematics & True Weight Transfer
  // Longitudinal and lateral load transfer from previous step's chassis accelerations
  const totalWeightN = CAR_MASS_KG * 9.81;
  const staticWheelLoadN = totalWeightN * 0.25;

  // Longitudinal weight transfer: braking (longitudinalAccelG < 0) shifts load to front axle!
  const longLoadTransferN =
    (CAR_MASS_KG * (-state.longitudinalAccelG * 9.81) * CG_HEIGHT_M) / WHEELBASE_M;

  // Lateral weight transfer: cornering shifts load to outside wheels, distributed by F/R spring stiffness
  const totalSpringStiffness = tuning.frontSpringRate + tuning.rearSpringRate;
  const frontRollShare = tuning.frontSpringRate / totalSpringStiffness;
  const rearRollShare = tuning.rearSpringRate / totalSpringStiffness;
  const totalLatLoadTransferN =
    (CAR_MASS_KG * (state.lateralAccelG * 9.81) * CG_HEIGHT_M) / TRACK_WIDTH_M;

  // Elevation & jump dynamics
  const targetCarElevation = trackSample.roadY;
  const heightAboveRoad = state.y - targetCarElevation;

  let groundedCount = 0;
  const wheelOffsets: Array<{ id: WheelState['id']; xSign: number; zSign: number }> = [
    { id: 'FL', xSign: -1, zSign: 1 },
    { id: 'FR', xSign: 1, zSign: 1 },
    { id: 'RL', xSign: -1, zSign: -1 },
    { id: 'RR', xSign: 1, zSign: -1 },
  ];

  // Update tire dirtiness (carrying gravel/mud onto tarmac reduces grip until scrubbed clean)
  const currentProf = getSurfaceProfile(
    state.currentSurface,
    weather,
    tuning.tireCompound,
    tuning.tirePressurePsi
  );
  const speedNorm = Math.min(1, Math.abs(state.forwardSpeedMs) / 22);
  state.tireDirtiness = Math.max(
    0,
    Math.min(1, state.tireDirtiness + currentProf.dirtContribution * speedNorm * dt * 0.35)
  );
  if (state.currentSurface === 'gravel' || state.currentSurface === 'snow') {
    state.rutAccumulation = Math.min(1, state.rutAccumulation + speedNorm * dt * 0.008);
  }

  for (let i = 0; i < 4; i++) {
    const w = state.wheels[i];
    const meta = wheelOffsets[i];
    const isFront = meta.zSign > 0;
    w.surface = state.currentSurface;
    w.bottomedOutImpact = Math.max(0, w.bottomedOutImpact - dt * 3.5);

    // High-frequency surface micro-bumps at each wheel contact patch
    const wheelPhase = state.distanceAlongStageM * 0.85 + i * 1.7;
    const roadBump =
      Math.sin(wheelPhase * currentProf.bumpFreqHz * 0.15) *
      currentProf.bumpAmpM *
      (1 + state.rutAccumulation * 0.35);

    if (heightAboveRoad > tuning.suspensionTravel * 0.65) {
      // Airborne over crest/jump!
      w.isGrounded = false;
      w.compression += (0 - w.compression) * Math.min(1, 12 * dt);
      w.normalLoadN = 0;
    } else {
      w.isGrounded = true;
      groundedCount++;

      // Calculate dynamic normal load on this wheel from weight transfer
      const axleLongDelta = isFront ? longLoadTransferN * 0.5 : -longLoadTransferN * 0.5;
      const rollShare = isFront ? frontRollShare : rearRollShare;
      // meta.xSign: -1 = Left, +1 = Right. Turning right (lateralAccelG < 0) loads Left wheels
      const wheelLatDelta = -meta.xSign * totalLatLoadTransferN * rollShare;

      const bumpLoadDelta = roadBump * (isFront ? tuning.frontSpringRate : tuning.rearSpringRate) * 420;
      const rawLoadN = staticWheelLoadN + axleLongDelta + wheelLatDelta + bumpLoadDelta;
      w.normalLoadN = Math.max(120, Math.min(totalWeightN * 0.72, rawLoadN));

      // Spring compression from vertical load
      const springRateNPerM = (isFront ? tuning.frontSpringRate : tuning.rearSpringRate) * 1000 * (1 - state.damage.suspension * 0.35);
      const targetCompression = Math.min(
        tuning.suspensionTravel,
        Math.max(0.01, w.normalLoadN / springRateNPerM + roadBump)
      );
      const damperRate = 11.5 * tuning.dampingStiffness * (1 - state.damage.suspension * 0.3);
      w.compressionVel = (targetCompression - w.compression) / dt;
      w.compression += (targetCompression - w.compression) * Math.min(1, damperRate * dt);

      // Check bump stop bottoming-out
      if (w.compression >= tuning.suspensionTravel * 0.95) {
        w.bottomedOutImpact = Math.max(w.bottomedOutImpact, 0.75);
      }
    }
  }

  // Vertical jump & landing physics
  if (groundedCount === 0) {
    state.airborneTimeSec += dt;
    state.vy -= 9.81 * dt;
    state.y += state.vy * dt;
    // Slight mid-air pitch response to throttle/brake (wheel inertia effect)
    state.pitch += (state.throttle * 0.08 - state.brake * 0.1) * dt;
  } else {
    if (state.airborneTimeSec > 0.18) {
      // Just landed from a jump!
      const landingG = Math.min(6.0, Math.abs(state.vy) * 0.55 + state.airborneTimeSec * 2.2);
      state.lastLandingForceG = landingG;
      for (const w of state.wheels) {
        w.compression = Math.min(tuning.suspensionTravel, w.compression + landingG * 0.035);
        if (landingG > 2.2) {
          w.bottomedOutImpact = Math.min(1.0, landingG / 3.5);
        }
      }
      // Heavy jump landing pitches chassis and can damage suspension if > 3.4G
      state.pitchVel -= landingG * 0.65;
      if (landingG > 3.4) {
        state.damage.suspension = Math.min(1, state.damage.suspension + (landingG - 3.2) * 0.06);
      }
    }
    state.airborneTimeSec = 0;
    state.vy = (targetCarElevation - state.y) * 18;
    state.y += (targetCarElevation - state.y) * Math.min(1, 22 * dt);
  }

  // Integrate physical chassis Pitch & Roll from suspension and weight transfer
  const frontAvgComp = (state.wheels[0].compression + state.wheels[1].compression) * 0.5;
  const rearAvgComp = (state.wheels[2].compression + state.wheels[3].compression) * 0.5;
  const leftAvgComp = (state.wheels[0].compression + state.wheels[2].compression) * 0.5;
  const rightAvgComp = (state.wheels[1].compression + state.wheels[3].compression) * 0.5;

  // Pitch: front compression > rear compression means nose dive (negative pitch)
  const targetPitch =
    trackSample.slope * 0.55 +
    ((rearAvgComp - frontAvgComp) / WHEELBASE_M) * 1.45 +
    state.longitudinalAccelG * 0.055;
  // Roll: left vs right compression + road banking camber
  const targetRoll =
    trackSample.camberRad * 0.7 +
    ((leftAvgComp - rightAvgComp) / TRACK_WIDTH_M) * 1.55 -
    state.lateralAccelG * 0.068;

  const pitchSpring = 38 * tuning.dampingStiffness;
  const pitchDamp = 7.5 * tuning.dampingStiffness;
  state.pitchVel += ((targetPitch - state.pitch) * pitchSpring - state.pitchVel * pitchDamp) * dt;
  state.pitch += state.pitchVel * dt;

  const rollSpring = 42 * tuning.dampingStiffness;
  const rollDamp = 8.0 * tuning.dampingStiffness;
  state.rollVel += ((targetRoll - state.roll) * rollSpring - state.rollVel * rollDamp) * dt;
  state.roll += state.rollVel * dt;

  // 6. Per-Wheel Tire Forces (Combined Longitudinal + Lateral Slip)
  const engineTorqueNm =
    state.stalled || state.shiftCooldownSec > 0
      ? 0
      : getEngineTorqueNm(state.rpm, state.turboBoostBar, state.damage.engine);

  // Engine compression braking when throttle is closed in gear and moving above idle speed
  const engineBrakingTorqueNm =
    state.gear > 0 && state.forwardSpeedMs > 1.8 && state.clutchEngagement > 0.3
      ? (1 - state.throttle) * Math.max(0, (state.rpm - 1100) / 6500) * 95 * state.clutchEngagement
      : 0;

  const netEngineTorqueNm = engineTorqueNm * state.throttle - engineBrakingTorqueNm;
  const totalDriveWheelTorqueNm = netEngineTorqueNm * gearRatio * Math.max(0.25, state.clutchEngagement);

  // Distribute drive torque by Drivetrain type (AWD, RWD, FWD)
  let frontAxleDriveTorqueNm = 0;
  let rearAxleDriveTorqueNm = 0;
  if (tuning.drivetrain === 'AWD') {
    frontAxleDriveTorqueNm = totalDriveWheelTorqueNm * tuning.awdFrontTorqueSplit;
    rearAxleDriveTorqueNm = totalDriveWheelTorqueNm * (1 - tuning.awdFrontTorqueSplit);
  } else if (tuning.drivetrain === 'RWD') {
    rearAxleDriveTorqueNm = totalDriveWheelTorqueNm;
  } else {
    // FWD
    frontAxleDriveTorqueNm = totalDriveWheelTorqueNm;
  }

  // Optional TCS assist (OFF by default)
  if (inputSettings.tcsAssist) {
    const maxSlip = Math.max(
      Math.abs(state.wheels[0].slipRatio),
      Math.abs(state.wheels[1].slipRatio),
      Math.abs(state.wheels[2].slipRatio),
      Math.abs(state.wheels[3].slipRatio)
    );
    if (maxSlip > 0.35) {
      const cut = Math.max(0.25, 1 - (maxSlip - 0.35) * 1.5);
      frontAxleDriveTorqueNm *= cut;
      rearAxleDriveTorqueNm *= cut;
    }
  }

  // Total hydraulic braking torque distributed by Brake Bias
  const maxBrakeTorqueNm = 4600;
  let effectiveBrakeInput = state.brake;
  if (inputSettings.absAssist && state.brake > 0.5) {
    const minSlip = Math.min(state.wheels[0].slipRatio, state.wheels[1].slipRatio);
    if (minSlip < -0.22) {
      effectiveBrakeInput *= 0.65;
    }
  }
  const frontWheelBrakeTorqueNm = effectiveBrakeInput * maxBrakeTorqueNm * tuning.brakeBiasFront * 0.5;
  const rearWheelBrakeTorqueNm = effectiveBrakeInput * maxBrakeTorqueNm * (1 - tuning.brakeBiasFront) * 0.5;

  let totalFxLocal = 0; // Longitudinal force in car frame
  let totalFyLocal = 0; // Lateral force in car frame
  let totalYawTorque = 0; // Yaw moment around CG

  // Effective surface grip reduced by carried dirt on tarmac and tire wear/damage
  const dirtyTarmacPenalty =
    state.currentSurface === 'tarmac' ? state.tireDirtiness * 0.26 : state.tireDirtiness * 0.06;
  const tireHealthMult = Math.max(0.45, 1.0 - state.damage.tires * 0.48 - dirtyTarmacPenalty);

  for (let i = 0; i < 4; i++) {
    const w = state.wheels[i];
    const meta = wheelOffsets[i];
    const isFront = meta.zSign > 0;

    if (!w.isGrounded || w.normalLoadN <= 10) {
      w.slipRatio = 0;
      w.slipAngleRad = 0;
      w.combinedSlip = 0;
      continue;
    }

    const wheelSteer = isFront ? state.steerAngleRad : 0;
    const cosSteer = Math.cos(wheelSteer);
    const sinSteer = Math.sin(wheelSteer);

    // Local velocity at wheel hub including yaw rotation
    const wxLocal = vLat + (isFront ? HALF_WHEELBASE_M : -HALF_WHEELBASE_M) * state.yawRate;
    const wzLocal = vLong + (meta.xSign * TRACK_WIDTH_M * 0.5) * state.yawRate;

    // Transform hub velocity into steered wheel plane
    const vWheelLong = wzLocal * cosSteer + wxLocal * sinSteer;
    const vWheelLat = -wzLocal * sinSteer + wxLocal * cosSteer;

    // Wheel drive and brake torques
    const wheelDriveTorque = (isFront ? frontAxleDriveTorqueNm : rearAxleDriveTorqueNm) * 0.5;
    const wheelBrakeTorque = isFront ? frontWheelBrakeTorqueNm : rearWheelBrakeTorqueNm;

    // Update wheel angular velocity
    const freeRollingOmega = vWheelLong / WHEEL_RADIUS_M;
    const driveAccelOmega = (wheelDriveTorque / (1.35 * WHEEL_RADIUS_M)) * dt;
    w.angularVel = freeRollingOmega + driveAccelOmega;

    // Apply brake / handbrake lockup
    if (!isFront && state.handbrake > 0.08) {
      // Handbrake locks rear wheels immediately, creating yaw rotation!
      w.angularVel *= 1 - state.handbrake * 0.92;
    } else if (wheelBrakeTorque > 10) {
      const brakeLockRatio = Math.min(
        1.15,
        wheelBrakeTorque / Math.max(300, w.normalLoadN * currentProf.peakMu * WHEEL_RADIUS_M * 1.15)
      );
      w.angularVel *= Math.max(0, 1 - brakeLockRatio * 0.45);
    }

    // Longitudinal slip ratio kappa
    const denomLong = Math.max(2.2, Math.abs(vWheelLong));
    let kappa = (w.angularVel * WHEEL_RADIUS_M - vWheelLong) / denomLong;
    if (!isFront && state.handbrake > 0.1) {
      kappa = -state.handbrake * 0.95 * Math.sign(vWheelLong || 1);
    }
    kappa = Math.max(-1.5, Math.min(1.5, kappa));
    w.slipRatio = kappa;

    // Lateral slip angle alpha (in radians)
    const denomLat = Math.max(2.0, Math.abs(vWheelLong));
    const alpha = Math.atan2(vWheelLat, denomLat);
    w.slipAngleRad = alpha;

    // Normalized slip components relative to surface peaks
    const normKappa = kappa / currentProf.peakSlipRatio;
    const normAlpha = alpha / currentProf.peakSlipAngleRad;
    const combinedSlip = Math.hypot(normKappa, normAlpha);
    w.combinedSlip = combinedSlip;

    // Tire load sensitivity: vertical load increase yields slightly less than linear grip (makes weight transfer matter!)
    const loadRatio = w.normalLoadN / staticWheelLoadN;
    const loadSensitivity = Math.pow(Math.max(0.1, loadRatio), 0.88) / Math.max(0.1, loadRatio);

    // Transient grip shock if suspension just bottomed out on landing
    const bottomOutPenalty = 1.0 - w.bottomedOutImpact * 0.35;

    const effectivePeakMu =
      currentProf.peakMu * tireHealthMult * loadSensitivity * bottomOutPenalty;
    w.gripFactor = effectivePeakMu;

    const totalMu = evaluateContinuousTireCurve(
      combinedSlip,
      effectivePeakMu,
      currentProf.slideMuRatio,
      currentProf.plateauWidth
    );

    const totalForceMagN = w.normalLoadN * totalMu;

    // Split total tire force vector into longitudinal (fWheelLong) and lateral (fWheelLat) via friction circle
    let fWheelLong = 0;
    let fWheelLat = 0;
    if (combinedSlip > 0.0001) {
      fWheelLong = totalForceMagN * (normKappa / combinedSlip);
      // Lateral force opposes lateral velocity vWheelLat
      // On loose gravel/snow, high slip angle creates a "plowing/digging" edge bite
      const looseDigBonus =
        (state.currentSurface === 'gravel' || state.currentSurface === 'snow') && combinedSlip > 0.8
          ? 1.08
          : 1.0;
      fWheelLat = -totalForceMagN * (normAlpha / combinedSlip) * looseDigBonus;
    }

    // Add direct low-speed braking stopping force so car comes to a crisp standstill on hills
    if (effectiveBrakeInput > 0.05 && Math.abs(vWheelLong) < 3.5) {
      fWheelLong -= Math.sign(vWheelLong) * Math.min(w.normalLoadN * effectivePeakMu, wheelBrakeTorque / WHEEL_RADIUS_M);
    }

    // Drivetrain behavior distinction:
    // - RWD: rear throttle slip slightly reduces rear lateral stability -> pronounced throttle-on oversteer
    // - FWD: front throttle slip saturates front tires -> power-on understeer, liftoff tucks nose in
    // - AWD: center diff lock pulls car forward along steered vector when on throttle
    if (tuning.drivetrain === 'RWD' && !isFront && state.throttle > 0.35) {
      fWheelLat *= 1.0 - state.throttle * 0.16;
    } else if (tuning.drivetrain === 'FWD' && isFront && state.throttle > 0.4) {
      fWheelLat *= 1.0 - state.throttle * 0.18;
    } else if (tuning.drivetrain === 'AWD' && isFront && state.throttle > 0.4) {
      fWheelLong *= 1.0 + tuning.diffLock * 0.08;
    }

    // Rotate wheel forces back into car body frame
    const fxCar = fWheelLat * cosSteer + fWheelLong * sinSteer;
    const fzCar = fWheelLong * cosSteer - fWheelLat * sinSteer;

    totalFxLocal += fxCar;
    totalFyLocal += fzCar;

    // Yaw moment = lever arm x force
    const leverZ = isFront ? HALF_WHEELBASE_M : -HALF_WHEELBASE_M;
    const leverX = meta.xSign * TRACK_WIDTH_M * 0.5;
    totalYawTorque += leverZ * fxCar - leverX * fzCar * 0.25;
  }

  // 7. Aerodynamic Drag, Rolling Resistance & Gravity Grade
  const speedSq = vLong * vLong + vLat * vLat;
  const aeroDragN = 0.46 * speedSq * Math.sign(vLong || 1);
  const rollingDragN =
    CAR_MASS_KG * 9.81 * currentProf.rollingResistance * Math.sign(vLong || 1);
  const gravitySlopeForceN = CAR_MASS_KG * 9.81 * Math.sin(Math.atan(trackSample.slope));

  if (
    Math.abs(vLong) < 0.35 &&
    state.throttle < 0.05 &&
    (state.brake > 0.25 || state.handbrake > 0.35)
  ) {
    // Hold car stationary when brake or handbrake is applied at standstill (crucial for hill-start!)
    state.vx = 0;
    state.vz = 0;
    state.forwardSpeedMs = 0;
    state.lateralSpeedMs = 0;
    state.yawRate = 0;
    state.longitudinalAccelG = 0;
    state.lateralAccelG = 0;
    return;
  }

  const netFzCar = totalFyLocal - aeroDragN - rollingDragN - gravitySlopeForceN;
  const netFxCar = totalFxLocal - vLat * 145; // Natural tire pneumatic trail damping

  const accelLongMs2 = netFzCar / CAR_MASS_KG;
  const accelLatMs2 = netFxCar / CAR_MASS_KG;

  // Smooth G-force telemetry for weight transfer
  state.longitudinalAccelG +=
    ((accelLongMs2 / 9.81) - state.longitudinalAccelG) * Math.min(1, 14 * dt);
  state.lateralAccelG +=
    ((accelLatMs2 / 9.81) - state.lateralAccelG) * Math.min(1, 14 * dt);

  // Convert local acceleration back to world frame (X, Z)
  const axWorld = accelLongMs2 * sinYaw + accelLatMs2 * cosYaw;
  const azWorld = accelLongMs2 * cosYaw - accelLatMs2 * sinYaw;

  state.vx += axWorld * dt;
  state.vz += azWorld * dt;
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Yaw angular acceleration & natural self-aligning torque (makes counter-steer rescues tactile and predictable!)
  const slipAngleCg = Math.atan2(vLat, Math.max(2.5, Math.abs(vLong)));
  const selfAligningTorque =
    -slipAngleCg * 2400 * currentProf.peakMu -
    state.yawRate * (1180 + Math.abs(vLong) * 28);

  const yawAlpha = (totalYawTorque + selfAligningTorque) / CAR_INERTIA_YAW;
  state.yawRate += yawAlpha * dt;

  // Low-speed yaw damping so car never spins in place when stopped
  const speedYawGate = Math.min(1, Math.hypot(state.vx, state.vz) / 1.4);
  state.yawRate *= speedYawGate;
  state.yaw += state.yawRate * dt;

  // Detect spin mistake (> 115 deg off road tangent while moving)
  let headingError = state.yaw - trackSample.roadYaw;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;

  if (mistakesOut && Math.abs(headingError) > 2.0 && Math.hypot(state.vx, state.vz) > 3.5) {
    const lastMistake = mistakesOut[mistakesOut.length - 1];
    if (!lastMistake || stageTimeSec - lastMistake.timeSec > 5.0) {
      const sector: 1 | 2 | 3 =
        state.distanceAlongStageM < stage.sectorSplitsM[0]
          ? 1
          : state.distanceAlongStageM < stage.sectorSplitsM[1]
            ? 2
            : 3;
      mistakesOut.push({
        id: `spin_${Math.round(stageTimeSec * 10)}`,
        timeSec: stageTimeSec,
        distanceM: Math.round(state.distanceAlongStageM),
        sector,
        type: 'spin',
        label: '抓地突破极限打转 (Spin)',
        timeLossEstSec: 4.5,
      });
    }
  }

  // 8. Roadside Natural Obstacle Collision Detection & Partitioned Damage
  const carRadius = 1.05;
  for (let i = 0; i < stage.props.length; i++) {
    const p = stage.props[i];
    if (p.collisionRadius <= 0) continue;
    const dx = state.x - p.x;
    const dz = state.z - p.z;
    const distSq = dx * dx + dz * dz;
    const minDist = carRadius + p.collisionRadius;

    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      // Push car cleanly outside obstacle collision cylinder (Zero clipping / never stuck!)
      state.x += nx * (overlap + 0.08);
      state.z += nz * (overlap + 0.08);

      const impactSpeed = Math.max(0, -(state.vx * nx + state.vz * nz));
      if (impactSpeed > 1.5) {
        // Elastic-plastic bounce & speed loss
        const restitution = 0.28;
        state.vx += nx * impactSpeed * (1 + restitution);
        state.vz += nz * impactSpeed * (1 + restitution);
        state.vx *= 0.68;
        state.vz *= 0.68;
        state.yawRate += (p.side === 'left' ? 1 : -1) * Math.min(2.5, impactSpeed * 0.12);

        // Apply Partitioned Damage based on impact severity & angle
        const severity = Math.min(1.0, (impactSpeed / 26) * p.hardness);
        if (severity > 0.05) {
          state.damage.steering = Math.min(1, state.damage.steering + severity * 0.35);
          state.damage.suspension = Math.min(1, state.damage.suspension + severity * 0.32);
          state.damage.engine = Math.min(1, state.damage.engine + severity * 0.25);
          state.damage.gearbox = Math.min(1, state.damage.gearbox + severity * 0.20);
          state.damage.tires = Math.min(1, state.damage.tires + severity * 0.24);
          state.damage.lights = Math.min(1, state.damage.lights + severity * 0.42);
          state.damage.steeringPullDirection = p.side === 'left' ? 1 : -1;

          // Terminal crash only on catastrophic high-speed impact into a solid obstacle after heavy prior damage
          if (state.damage.engine >= 0.98 && impactSpeed > 24) {
            state.damage.isTerminal = true;
            state.damage.terminalReason = '引擎缸体与散热器严重损毁，无法继续比赛 (Retired)';
          }

          if (mistakesOut) {
            const lastMistake = mistakesOut[mistakesOut.length - 1];
            if (!lastMistake || stageTimeSec - lastMistake.timeSec > 2.5) {
              const sector: 1 | 2 | 3 =
                state.distanceAlongStageM < stage.sectorSplitsM[0]
                  ? 1
                  : state.distanceAlongStageM < stage.sectorSplitsM[1]
                    ? 2
                    : 3;
              const propLabel =
                p.type === 'pine_tree' || p.type === 'birch_tree'
                  ? '撞击路边树木'
                  : p.type === 'rock_outcrop'
                    ? '撞击山体岩石'
                    : p.type === 'bridge_parapet' || p.type === 'stone_wall'
                      ? '刮撞石墙/桥栏'
                      : '刮擦护栏路标';
              mistakesOut.push({
                id: `hit_${Math.round(stageTimeSec * 10)}`,
                timeSec: stageTimeSec,
                distanceM: Math.round(state.distanceAlongStageM),
                sector,
                type: 'obstacle_hit',
                label: `${propLabel} (${Math.round(impactSpeed * 3.6)} km/h)`,
                timeLossEstSec: Math.round((1.5 + severity * 5.0) * 10) / 10,
              });
            }
          }
        }
      }
    }
  }

  // Update forwardSpeedMs after collision resolution
  state.forwardSpeedMs = state.vx * sinYaw + state.vz * cosYaw;
  state.lateralSpeedMs = state.vx * cosYaw - state.vz * sinYaw;
  void prevForwardSpeed;
}

/**
 * Service Park repair helper: repairs a specific vehicle subsystem within the 45-minute service budget.
 */
export const REPAIR_COSTS_MIN: Record<
  'steering' | 'engine' | 'gearbox' | 'suspension' | 'tires' | 'lights',
  { labelZh: string; costMin: number; descZh: string }
> = {
  steering: {
    labelZh: '转向拉杆与四轮定位',
    costMin: 10,
    descZh: '消除方向盘跑偏，恢复最大转向角',
  },
  suspension: {
    labelZh: '避震器与悬挂摆臂',
    costMin: 15,
    descZh: '恢复悬挂行程与阻尼支撑，防止触底失控',
  },
  engine: {
    labelZh: '发动机与涡轮增压器',
    costMin: 20,
    descZh: '恢复全转速扭矩输出与涡轮增压值',
  },
  gearbox: {
    labelZh: '序列式变速箱与离合',
    costMin: 15,
    descZh: '消除换挡延迟、打齿与颠簸跳挡故障',
  },
  tires: {
    labelZh: '更换全新拉力轮胎组',
    costMin: 10,
    descZh: '恢复 100% 胎面抓地力并清除泥沙附着',
  },
  lights: {
    labelZh: '车头拉力射灯组',
    costMin: 5,
    descZh: '修复夜间远光灯锥亮度，防止闪烁黑屏',
  },
};
