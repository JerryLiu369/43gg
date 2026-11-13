export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type RunPhase =
  | 'fighting'
  | 'wave_clear_pause'
  | 'boon_select'
  | 'victory'
  | 'defeat';

export type StageThemeId =
  | 'bamboo_rain'
  | 'vermilion_bridge'
  | 'crucible_forge'
  | 'misty_pine'
  | 'storm_tenshu';

export type EnemyArchetypeId =
  | 'ronin'
  | 'marksman'
  | 'ironclad'
  | 'kusarigama'
  | 'bombardier'
  | 'shogun_boss';

export type ObstacleKind =
  | 'pillar'
  | 'lantern'
  | 'bamboo_grove'
  | 'water_trench'
  | 'brazier'
  | 'wall';

export type BoonId =
  | 'thunder_wake'
  | 'split_swallow'
  | 'crimson_siphon'
  | 'wide_crescent'
  | 'deep_mind'
  | 'iron_breaker'
  | 'phantom_step'
  | 'volatile_spark'
  | 'wind_stride'
  | 'executioner_seal'
  | 'mirror_ward'
  | 'relentless_edge';

export interface Vec2 {
  x: number;
  y: number;
}

export interface ArenaObstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
  /** Blocks walking movement */
  blocksMovement: boolean;
  /** Blocks arrows and sightlines (water trenches block movement but not arrows!) */
  blocksProjectiles: boolean;
  /** Destructible stone lanterns shatter on heavy slash/explosion */
  destructible?: boolean;
  hp?: number;
}

export interface PowderJar {
  id: string;
  x: number;
  y: number;
  radius: number;
  triggered: boolean;
  fuseTimer: number;
  exploded: boolean;
}

export interface WaveSpawnEntry {
  archetype: EnemyArchetypeId;
  count: number;
}

export interface StageDef {
  index: number;
  id: string;
  numeral: string;
  name: string;
  subtitle: string;
  theme: StageThemeId;
  arenaWidth: number;
  arenaHeight: number;
  playerSpawn: Vec2;
  obstacles: ArenaObstacle[];
  initialJars: Array<{ x: number; y: number }>;
  waves: WaveSpawnEntry[][];
  palette: {
    groundPrimary: string;
    groundSecondary: string;
    gridLine: string;
    borderInk: string;
    accentHex: string;
    ambientTint: string;
  };
}

export interface EnemyArchetypeDef {
  id: EnemyArchetypeId;
  name: string;
  roleLabel: string;
  maxHp: number;
  radius: number;
  moveSpeed: number;
  preferredRange: number;
  windupSec: number;
  activeSec: number;
  recoverySec: number;
  cooldownSec: number;
  damage: number;
  frontalShield: boolean;
  scoreValue: number;
  coatHex: string;
  trimHex: string;
  desc: string;
}

export interface BoonDef {
  id: BoonId;
  name: string;
  category: 'slash' | 'deflect' | 'focus' | 'vitality';
  shortTag: string;
  desc: string;
  accentHex: string;
}

export type EnemyAiPhase =
  | 'spawning'
  | 'pursuing'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'staggered'
  | 'dying';

export interface EnemyEntity {
  uid: number;
  archetype: EnemyArchetypeId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
  frontalShield: boolean;
  shieldBroken: boolean;
  aiPhase: EnemyAiPhase;
  phaseTimer: number;
  attackCooldown: number;
  /** Locked target direction or destination during windup/lunge */
  lockedAngle: number;
  lockedTargetX: number;
  lockedTargetY: number;
  /** Orbit direction (+1 or -1) for flankers/kiters */
  orbitSign: 1 | -1;
  hasAttackToken: boolean;
  hitFlashTimer: number;
  gaitDist: number;
  bossPhase: 1 | 2;
  /** Death topple progress 0 -> 1 */
  koProgress: number;
}

export type ProjectileKind = 'bolt' | 'mortar' | 'blade_wave';

export interface ProjectileEntity {
  uid: number;
  kind: ProjectileKind;
  owner: 'enemy' | 'player';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  deflected: boolean;
  pierceLeft: number;
  /** For mortar ground target ring */
  targetX?: number;
  targetY?: number;
  blastRadius?: number;
}

export interface SlashArcEffect {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
  width: number;
  life: number;
  maxLife: number;
  isChainReset: boolean;
  isThunderWake: boolean;
}

export interface ShockwaveRingEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  colorHex: string;
  lineWidth: number;
  isDangerTelegraph?: boolean;
}

export interface InkDecalCommand {
  kind: 'splatter' | 'slash_scuff' | 'scorch' | 'fallen_hat';
  x: number;
  y: number;
  angle: number;
  scale: number;
  colorHex: string;
}

export interface FloatingCallout {
  x: number;
  y: number;
  vy: number;
  text: string;
  colorHex: string;
  life: number;
  maxLife: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  slashCooldown: number;
  maxSlashCooldown: number;
  parryCooldown: number;
  parryActiveTimer: number;
  invulnTimer: number;
  dashTimer: number;
  mindsEyeActive: boolean;
  /** Buffered input timers for responsive combat feel */
  slashBufferTimer: number;
  parryBufferTimer: number;
  scaleX: number;
  scaleY: number;
  gaitDist: number;
  hitFlashTimer: number;
  isenReadyFlash: number;
}

export interface SimulationEvents {
  playerSlashed: boolean;
  chainResetTriggered: boolean;
  perfectDeflectCount: number;
  enemiesHit: number;
  enemiesKilled: number;
  shieldBrokenCount: number;
  jarExplodedCount: number;
  playerDamaged: boolean;
  enemyTelegraphStarted: boolean;
  waveCleared: boolean;
  stageCleared: boolean;
  bossPhaseShifted: boolean;
  runVictory: boolean;
  runDefeat: boolean;
  decalCommands: InkDecalCommand[];
}

export interface RunSummarySnapshot {
  outcome: 'victory' | 'defeat';
  isEndless: boolean;
  stageIndex: number;
  stageName: string;
  waveNumber: number;
  totalWavesInStage: number;
  kills: number;
  maxCombo: number;
  deflects: number;
  damageTaken: number;
  clearTimeSec: number;
  score: number;
  isNewBest: boolean;
  boonsCollected: BoonId[];
}

export interface InkBladeRunState {
  seed: number;
  rngState: number;
  nextUid: number;
  isEndless: boolean;
  endlessLoop: number;
  phase: RunPhase;
  stageIndex: number;
  waveIndex: number;
  arenaWidth: number;
  arenaHeight: number;

  elapsedSec: number;
  hitstopTimer: number;
  cameraTrauma: number;
  phaseTransitionTimer: number;
  lightningFlash: number;

  score: number;
  kills: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  deflects: number;
  damageTaken: number;

  boons: BoonId[];
  pendingBoonChoices: BoonId[];

  player: PlayerState;
  obstacles: ArenaObstacle[];
  jars: PowderJar[];
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  slashArcs: SlashArcEffect[];
  shockwaves: ShockwaveRingEffect[];
  callouts: FloatingCallout[];
  summarySnapshot: RunSummarySnapshot | null;
}

export interface PlayerInputFrame {
  moveX: number;
  moveY: number;
  aimWorldX: number;
  aimWorldY: number;
  mindsEyeHeld: boolean;
  slashJustPressed: boolean;
  slashJustReleased: boolean;
  parryJustPressed: boolean;
}

export interface InkBladeSaveMeta {
  version: number;
  highestUnlockedStage: number;
  bestScore: number;
  bestMaxCombo: number;
  fastestVictorySec: number | null;
  totalKills: number;
  totalDeflects: number;
  totalVictories: number;
  muted: boolean;
}
