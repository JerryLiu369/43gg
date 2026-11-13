export type GridCoord = {
  r: number;
  c: number;
};

export type TerrainType =
  | 'plain'
  | 'water'
  | 'chasm'
  | 'mountain'
  | 'magma'
  | 'citadel';

export type Direction4 = 0 | 1 | 2 | 3; // 0: North (-r), 1: East (+c), 2: South (+r), 3: West (-c)

export type MechClassId = 'titan' | 'arbalest' | 'geomancer';

export type EnemyArchetypeId =
  | 'juggernaut'
  | 'scorpion'
  | 'bastion'
  | 'stormwing'
  | 'taotie_boss';

export type DifficultyTier = 'casual' | 'standard' | 'master';

export interface DifficultyDef {
  id: DifficultyTier;
  label: string;
  shortTag: string;
  desc: string;
  gridPower: number;
  luopanCharges: number;
  resets: number;
  mechBonusHp: number;
  startShielded: boolean;
  maxConcurrentEnemiesBase: number;
  scoreMult: number;
}

export type WeaponSlotKey = 'primary' | 'secondary';

export type WeaponPattern =
  | 'melee_cleave_push'
  | 'grapple_pull'
  | 'mortar_cross_push'
  | 'arc_lightning'
  | 'swap_teleport'
  | 'aegis_pulse';

export interface WeaponDef {
  id: string;
  name: string;
  slot: WeaponSlotKey;
  pattern: WeaponPattern;
  rangeMin: number;
  rangeMax: number;
  baseDamage: number;
  shortDesc: string;
  detailDesc: string;
  cooldownTurns: number;
}

export interface MechDef {
  id: MechClassId;
  name: string;
  title: string;
  roleLabel: string;
  maxHp: number;
  moveRange: number;
  flying: boolean;
  armor: number;
  accentHex: string;
  primaryWeapon: WeaponDef;
  secondaryWeapon: WeaponDef;
}

export interface EnemyDef {
  id: EnemyArchetypeId;
  name: string;
  subtitle: string;
  maxHp: number;
  moveRange: number;
  damage: number;
  flying: boolean;
  frontShielded: boolean;
  isBoss?: boolean;
  attackDesc: string;
  aiPolicyDesc: string;
  accentHex: string;
}

export type RelicId =
  | 'thunder_conductor'
  | 'seismic_shock'
  | 'jade_aegis'
  | 'double_luopan'
  | 'fissure_spikes'
  | 'overclock_thrusters'
  | 'vampiric_bronze'
  | 'artillery_echo';

export interface RelicDef {
  id: RelicId;
  name: string;
  category: string;
  desc: string;
}

export interface SectorDef {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  terrainTheme: 'waterway' | 'foundry' | 'imperial';
  description: string;
  enemyWaveBudget: number;
  bossArchetype?: EnemyArchetypeId;
}

export interface TileState {
  r: number;
  c: number;
  terrain: TerrainType;
  elevation: number;
  isLuopanRing: boolean;
  isLuopanCenter: boolean;
  citadelHp: number;
  citadelMaxHp: number;
  hasEmergenceCrack: boolean;
  emergingEnemyType: EnemyArchetypeId | null;
  onFire: boolean;
}

export type EnemyIntentPattern =
  | 'charge_line'
  | 'lob_artillery'
  | 'wide_cleave'
  | 'pierce_beam'
  | 'boss_crush';

export interface EnemyIntent {
  pattern: EnemyIntentPattern;
  dir: Direction4;
  targetCoord: GridCoord;
  affectedTiles: GridCoord[];
  pushDir: Direction4 | null;
  damage: number;
}

export interface UnitState {
  uid: string;
  team: 'player' | 'enemy';
  mechId?: MechClassId;
  enemyId?: EnemyArchetypeId;
  name: string;
  r: number;
  c: number;
  hp: number;
  maxHp: number;
  moveRange: number;
  flying: boolean;
  armor: number;
  frontShielded: boolean;
  facing: Direction4;
  shielded: boolean;
  shocked: boolean;
  waterlogged: boolean;
  burning: boolean;
  hasMoved: boolean;
  hasActed: boolean;
  moveStartCoord: GridCoord | null;
  secondaryCooldown: number;
  bonusDamage: number;
  intent: EnemyIntent | null;
  orderIndex: number;
}

export type TacticalAction =
  | {
      kind: 'move';
      unitUid: string;
      to: GridCoord;
    }
  | {
      kind: 'weapon';
      unitUid: string;
      slot: WeaponSlotKey;
      target: GridCoord;
    }
  | {
      kind: 'luopan_rotate';
      clockwise: boolean;
    };

export interface DisplacementVector {
  unitUid: string;
  from: GridCoord;
  to: GridCoord;
  collided: boolean;
  droppedInChasm: boolean;
  drownedInWater: boolean;
}

export interface TileEffectPreview {
  coord: GridCoord;
  damage: number;
  shieldApplied: boolean;
  healAmount: number;
  badgeText: string | null;
  badgeTone: 'danger' | 'amber' | 'jade' | 'cyan';
  pushDir: Direction4 | null;
}

export interface ActionPreviewResult {
  valid: boolean;
  action: TacticalAction;
  summaryTitle: string;
  summaryDetail: string;
  affectedTiles: TileEffectPreview[];
  displacements: DisplacementVector[];
  lightningPath: GridCoord[];
  savedCitadels: GridCoord[];
  friendlyFireRedirects: number;
  enemyKills: number;
  resultingState: BattleState;
}

export interface CombatEventLog {
  id: number;
  turn: number;
  text: string;
  tone: 'info' | 'jade' | 'amber' | 'danger';
}

export interface VisualFxEvent {
  kind:
    | 'slash_impact'
    | 'mortar_arc'
    | 'lightning_chain'
    | 'grapple_line'
    | 'swap_flash'
    | 'shield_dome'
    | 'luopan_spin'
    | 'push_bump'
    | 'chasm_fall'
    | 'beam_laser';
  from: GridCoord;
  to: GridCoord;
  path?: GridCoord[];
  clockwise?: boolean;
  colorHex: string;
  label?: string;
}

export type BattlePhase = 'player_turn' | 'victory' | 'defeat';

export interface BattleObjectives {
  zeroGridDamage: boolean;
  chainKillsTarget: number;
  chainKillsAchieved: number;
  blockedSpawnsTarget: number;
  blockedSpawnsAchieved: number;
}

export interface BattleState {
  seed: number;
  difficulty: DifficultyTier;
  sectorIndex: number;
  isEndless: boolean;
  endlessLoop: number;
  turn: number;
  maxTurns: number;
  phase: BattlePhase;
  gridPower: number;
  maxGridPower: number;
  starIron: number;
  score: number;
  totalKills: number;
  chainKills: number;
  friendlyFireCount: number;
  luopanCharges: number;
  maxLuopanCharges: number;
  resetsRemaining: number;
  board: TileState[][];
  units: UnitState[];
  relics: RelicId[];
  mechUpgrades: Record<
    MechClassId,
    {
      bonusHp: number;
      bonusMove: number;
      bonusDamage: number;
    }
  >;
  objectives: BattleObjectives;
  logs: CombatEventLog[];
  turnStartSnapshot: string | null;
  lastFxEvents: VisualFxEvent[];
}

export interface XuanjiMetaSave {
  runsPlayed: number;
  victories: number;
  bestScore: number;
  highestSectorReached: number;
  totalChainKills: number;
  unlockedRelics: RelicId[];
  muted: boolean;
  tutorialCompleted: boolean;
  preferredDifficulty: DifficultyTier;
}
