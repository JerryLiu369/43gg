export type SurfaceType =
  | 'gravel'
  | 'tarmac'
  | 'tarmac_dirty'
  | 'snow'
  | 'ice'
  | 'water_puddle'
  | 'offtrack';

export type WeatherType = 'clear' | 'rain' | 'fog' | 'snow';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type DrivetrainType = 'AWD' | 'RWD' | 'FWD';
export type TireCompound = 'gravel' | 'tarmac_dry' | 'tarmac_wet' | 'snow';
export type CameraMode = 'cockpit' | 'hood' | 'chase' | 'chase_far';
export type DrivingAssistPreset = 'sport' | 'pro';
export type RallyEventMode = 'single' | 'championship';
export type RallyDifficulty = 'relaxed' | 'standard' | 'master';

export interface TuningSetup {
  name: string;
  drivetrain: DrivetrainType;
  /** Final drive ratio multiplier: 0.80 (Long/High Top Speed) to 1.25 (Short/Acceleration) */
  finalDriveRatio: number;
  /** Front spring stiffness (kN/m): 25 (Soft) to 75 (Stiff) */
  frontSpringRate: number;
  /** Rear spring stiffness (kN/m): 25 (Soft) to 75 (Stiff) */
  rearSpringRate: number;
  /** Suspension travel / ride height (m): 0.14 (Low Tarmac) to 0.28 (High Gravel) */
  suspensionTravel: number;
  /** Damper bump/rebound ratio: 0.5 (Soft/Compliant) to 1.5 (Firm/Responsive) */
  dampingStiffness: number;
  /** Front-to-Rear AWD torque split (front fraction 0.20 to 0.70, e.g., 0.42 means 42%F / 58%R) */
  awdFrontTorqueSplit: number;
  /** Center differential lock strength: 0.1 (Open/Agile) to 0.95 (Locked/Traction) */
  diffLock: number;
  /** Front brake bias fraction: 0.50 (Rearward/Trail-Brake Loose) to 0.78 (Forward/Stable) */
  brakeBiasFront: number;
  /** Tire pressure (PSI): 18 (High footprint/loose grip) to 36 (Crisp tarmac response) */
  tirePressurePsi: number;
  /** Selected tire compound */
  tireCompound: TireCompound;
}

export interface InputSettings {
  steerSensitivity: number; // 0.5 to 2.0
  steerDeadzone: number; // 0.0 to 0.25
  steerLinearity: number; // 1.0 (linear) to 2.8 (exponential fine center)
  throttleGamma: number; // 0.6 to 2.2
  brakeGamma: number; // 0.6 to 2.2
  pacenoteLeadScale: number; // 0.6 (Late) to 1.5 (Early)
  pacenoteAudioEnabled: boolean;
  pacenoteVisualEnabled: boolean;
  /** Optional mechanical assists */
  autoGearbox: boolean;
  autoClutch: boolean;
  absAssist: boolean;
  tcsAssist: boolean;
  /** Three-tier difficulty scaling damage, recovery penalty & AI pace */
  difficulty?: RallyDifficulty;
}

export interface DamageState {
  /** 0.0 (New) to 1.0 (Destroyed) for each of the 6 mechanical zones */
  steering: number; // Causes alignment pull left/right & reduced steering lock
  engine: number; // Causes torque loss, misfires, lower rev ceiling
  gearbox: number; // Causes slower shifts, missed gear crunches, random neutral pop-out
  suspension: number; // Causes reduced travel, asymmetric damping, bottoming out
  tires: number; // Causes grip loss & puncture drag
  lights: number; // Causes dimmed/flickering headlights in night stages
  /** Steering pull direction (-1 left, +1 right) */
  steeringPullDirection: number;
  /** Terminal retirement flag when engine or chassis suffers catastrophic impact */
  isTerminal: boolean;
  terminalReason: string;
}

export interface WheelState {
  id: 'FL' | 'FR' | 'RL' | 'RR';
  compression: number; // 0.0 (extended) to suspensionTravel (bottomed out)
  compressionVel: number; // m/s
  normalLoadN: number; // Vertical force in Newtons
  slipRatio: number; // Longitudinal slip (-1 locked to +1 spinning)
  slipAngleRad: number; // Lateral slip angle in radians
  combinedSlip: number; // Normalized combined slip (1.0 = peak grip)
  gripFactor: number; // Effective friction coefficient mu
  angularVel: number; // rad/s wheel rotation
  surface: SurfaceType;
  isGrounded: boolean;
  bottomedOutImpact: number; // 0..1 transient shock when hitting bump stops
}

export interface MistakeRecord {
  id: string;
  timeSec: number;
  distanceM: number;
  sector: 1 | 2 | 3;
  type: 'off_track' | 'obstacle_hit' | 'missed_braking' | 'engine_stall' | 'spin' | 'hard_landing';
  label: string;
  timeLossEstSec: number;
}

export interface CarPhysicsState {
  // World position & orientation
  x: number;
  y: number;
  z: number;
  yaw: number; // Heading in radians (0 = +Z forward along stage start)
  pitch: number; // Chassis pitch (+ = nose up, - = nose dive under braking)
  roll: number; // Chassis roll (+ = leaning right, - = leaning left)
  pitchVel: number;
  rollVel: number;

  // Velocities in world & local car frame
  vx: number;
  vy: number;
  vz: number;
  yawRate: number; // rad/s
  forwardSpeedMs: number; // Longitudinal speed in car local frame (m/s)
  lateralSpeedMs: number; // Lateral slide speed in car local frame (m/s)
  longitudinalAccelG: number; // + = acceleration squat, - = braking dive
  lateralAccelG: number; // Lateral G-force

  // Powertrain
  gear: number; // -1 = R, 0 = N, 1..6 = Forward gears
  rpm: number; // 0 to 8000
  stalled: boolean;
  starterCranking: number; // 0..1 progress when restarting stalled engine
  turboBoostBar: number; // -0.5 vacuum to +1.8 bar boost
  bovVentTrigger: number; // >0 triggers blow-off valve flutter sound
  backfireTrigger: number; // >0 triggers exhaust pop & flame
  shiftCooldownSec: number; // Remaining shift cut time
  missedShiftCrunch: number; // >0 triggers gearbox grind sound & warning
  clutchEngagement: number; // 0.0 (disengaged/pedal down) to 1.0 (engaged)

  // Controls state (after smoothing/curves)
  steerAngleRad: number; // Front wheel steering angle
  steeringWheelDeg: number; // Cockpit wheel angle (-540 to +540)
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: number; // 0..1
  clutchPedal: number; // 0..1 (1 = clutch depressed)

  // Surface & Tire state
  currentSurface: SurfaceType;
  tireDirtiness: number; // 0..1 gravel/mud carried onto tarmac ("dirty road" effect)
  rutAccumulation: number; // 0..1 cumulative rut wear
  airborneTimeSec: number;
  lastLandingForceG: number;

  // 4-wheel telemetry
  wheels: [WheelState, WheelState, WheelState, WheelState];

  // Track spline progress
  distanceAlongStageM: number;
  lateralOffsetM: number; // Distance from road center (+ right, - left)
  roadWidthM: number;
  currentSegmentIndex: number;

  // Damage
  damage: DamageState;
}

export interface PacenoteItem {
  id: string;
  triggerDistanceM: number;
  cornerDistanceM: number;
  type:
    | 'left_1'
    | 'left_2'
    | 'left_3'
    | 'left_4'
    | 'left_5'
    | 'left_6'
    | 'right_1'
    | 'right_2'
    | 'right_3'
    | 'right_4'
    | 'right_5'
    | 'right_6'
    | 'hairpin_left'
    | 'hairpin_right'
    | 'square_left'
    | 'square_right'
    | 'crest'
    | 'jump'
    | 'narrow_bridge'
    | 'water_splash'
    | 'surface_change'
    | 'straight'
    | 'finish';
  severity: 1 | 2 | 3 | 4 | 5 | 6 | 0; // 1 = Hairpin/Tightest, 6 = Fast Sweep, 0 = Hazard/Crest
  direction: 'left' | 'right' | 'center';
  modifier?: string; // e.g., '收紧 (Tightens)', '盲弯 (Blind)', '勿切 (Don't Cut)', '跳坡 (Big Jump)'
  calloutTextZh: string;
  calloutSpeechZh: string;
  distanceLinkM?: number; // e.g., 80, 120, 40
}

export interface RoadsideProp {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  type:
    | 'pine_tree'
    | 'birch_tree'
    | 'rock_outcrop'
    | 'guardrail'
    | 'bridge_parapet'
    | 'stone_wall'
    | 'chevron_sign'
    | 'brake_board'
    | 'spectator_tent'
    | 'marshal_hut'
    | 'start_arch'
    | 'split_arch'
    | 'finish_arch';
  collisionRadius: number;
  hardness: number; // 0.3 (bush/snowbank) to 1.0 (solid tree/rock/wall)
  side: 'left' | 'right';
}

export interface StageSegment {
  index: number;
  distanceM: number;
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
  normalX: number; // Road right vector X
  normalZ: number; // Road right vector Z
  camberRad: number; // Road banking angle
  widthM: number; // Road width (4.2m narrow bridge/alley to 9.5m wide sweep)
  surface: SurfaceType;
  curvature: number; // Signed curvature (1/radius)
  slope: number; // Longitudinal grade
  roughness: number; // Micro-bump amplitude
  sceneryType: 'forest' | 'cliff' | 'village' | 'bridge' | 'lake' | 'crest';
}

export interface StageDefinition {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  country: string;
  lengthM: number;
  primarySurface: SurfaceType;
  surfaceMixLabel: string;
  defaultWeather: WeatherType;
  defaultTimeOfDay: TimeOfDay;
  recommendedTire: TireCompound;
  elevationGainM: number;
  descriptionZh: string;
  targetParTimeSec: number;
  sectorSplitsM: [number, number, number]; // Distances for Sector 1, Sector 2, Finish
  segments: StageSegment[];
  props: RoadsideProp[];
  pacenotes: PacenoteItem[];
}

export interface GhostSample {
  t: number; // Elapsed stage time (s)
  d: number; // Distance along stage (m)
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface StageRecord {
  stageId: string;
  bestTimeSec: number;
  sectorTimesSec: [number, number, number];
  ghostSamples: GhostSample[];
  drivetrain: DrivetrainType;
  weather: WeatherType;
  timestamp: number;
}

export interface SplitNotification {
  sector: 1 | 2;
  splitTimeSec: number;
  deltaSec: number;
  referenceLabel: 'PB' | 'PAR';
}

export interface LaunchControlState {
  active: boolean;
  countdownSec: number;
  boostReady: boolean;
  bannerText: string;
  bannerTone: 'amber' | 'emerald' | 'rose';
}

export interface ChampionshipStandingEntry {
  driverId: string;
  driverCode: string;
  driverName: string;
  nationality: string;
  carName: string;
  isPlayer: boolean;
  totalTimeSec: number;
  lastStageTimeSec: number;
  retiredCount: number;
}

export interface ChampionshipStageHistory {
  stageId: string;
  stageCode: string;
  stageNameZh: string;
  playerTimeSec: number;
  playerRank: number;
  completed: boolean;
}

export interface ChampionshipProgress {
  currentStageIdx: number; // 0..stageOrderIds.length - 1
  stageOrderIds: string[];
  completedCount: number;
  isFinished: boolean;
  serviceParkDue: boolean;
  standings: ChampionshipStandingEntry[];
  history: ChampionshipStageHistory[];
}
