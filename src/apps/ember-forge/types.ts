export type ForgeDifficulty = 'casual' | 'standard' | 'master';

export type ScreenMode = 'title' | 'playing' | 'paused';

export type BattlePhase =
  | 'aiming'
  | 'firing'
  | 'volley'
  | 'enemy_turn'
  | 'forge_reward'
  | 'victory'
  | 'defeat';

export type PegKind =
  | 'bronze'    // 普通青铜钉：稳定充能
  | 'crit'      // 金铃钉：暴击触发（伤害×2 + 清脆编钟）
  | 'mult'      // 火鼓钉：本发倍率 +0.5x
  | 'bomb'      // 赤药钉：引爆周围范围钉并造成范围爆炸伤
  | 'wind'      // 风纹钉：恢复 +1 次风箱磁冲充能并强力上托
  | 'prism'     // 分光钉：立刻分裂出一枚同源子铁球
  | 'shield';   // 铁砧钉：为炉心锻造护盾

export type OrbTypeId =
  | 'iron_core'     // 赤铁丸：均衡重击，击中暴击钉额外+4底伤
  | 'twin_spark'    // 子母分裂弹：发射时自带双球齐飞
  | 'thunder_mag'   // 引雷磁弹：自动微吸附近未点亮符钉，连击触发连锁落雷
  | 'meteor_pierce' // 陨铁贯通弹：重质量，前4次撞击直接穿透符钉不减速
  | 'blast_cinder'  // 炎爆药弹：每撞击4次在球身引爆小范围火花
  | 'frost_echo'    // 寒霜回旋弹：低重力慢飘，命中冻结敌军降低其下次攻击
  | 'bell_chime'    // 金钟共鸣弹：每次撞击震响邻近1枚未亮符钉
  | 'crimson_leech';// 淬火虹吸弹：本发造成伤害的15%化作炉心修复

export type RelicId =
  | 'bellows_heart'     // 鼓风之心：每发初始风箱充能 +1
  | 'double_anvil'      // 双砧护壁：每回合开始自动获得 6 点炉心护盾
  | 'ember_chain'       // 炽链共鸣：单发连击每满 10 次，倍率额外 +0.6x
  | 'crucible_magnet'   // 金盂引流：炉底金盂加宽 35%，入盂额外 +50% 伤害
  | 'spark_rebound'     // 炉底回弹：每发首枚落底铁球自动强力反弹回炉膛一次
  | 'crit_resonance'    // 金铃齐鸣：触发金铃暴击时同时为炉心+4盾并恢复1点风箱
  | 'powder_keg'        // 硫磺火药：所有爆炸半径 +35% 且爆炸基础伤害 +14
  | 'heavy_quench'      // 淬火重锻：所有铁球基础伤害 +3，质量略增
  | 'prism_bloom'       // 棱光绽放：每场战斗开局额外将 2 枚青铜钉转化为分光钉
  | 'phoenix_ash'       // 涅槃炉灰：每局首次炉心归零时回满 35% 血量并震退敌军
  | 'overheat_core'     // 过热炉胆：连击超过 15 后，后续每次撞击伤害翻倍
  | 'master_smith';     // 宗师锤印：风箱磁冲触发时直接对前排敌人造成 12 点灼烧伤

export type EnemyArchetypeId =
  | 'cinder_mask'   // 灰面傩偶：近战稳步攻击（热身基础敌）
  | 'frost_weaver'  // 寒霜傀儡：施放寒气冻结盘面2枚符钉并轻击
  | 'bronze_guard'  // 铁壁镇兽：高护甲，轮流举盾自保与重锤猛击
  | 'ember_archer'  // 曜火弓偶：后排蓄力齐射，高伤但身板脆
  | 'mirror_warden' // 铜镜侍从：治疗自身与同伴并强化攻势
  | 'taotie_boss';  // 玄铁饕餮（终幕 Boss）：二阶段狂暴，吞火护盾+冰封+重击

export type EnemyIntentKind = 'attack' | 'heavy_attack' | 'defend' | 'freeze' | 'heal';

export interface EnemyIntent {
  kind: EnemyIntentKind;
  value: number;
  label: string;
}

export interface EnemyInstance {
  uid: string;
  archetype: EnemyArchetypeId;
  name: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  shield: number;
  chilled: boolean; // 寒霜减攻标记
  bossPhase: 1 | 2;
  intentIndex: number;
  intent: EnemyIntent;
  hitFlash: number;
  attackAnim: number;
  dyingTimer: number;
  dead: boolean;
}

export interface PegEntity {
  id: number;
  kind: PegKind;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  radius: number;
  lit: boolean;
  hitCount: number;
  frozen: boolean;
  flashTimer: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitPhase?: number;
  swayAmpX?: number;
  swaySpeed?: number;
  swayPhase?: number;
}

export interface BumperEntity {
  id: number;
  cx: number;
  cy: number;
  halfLen: number;
  angle: number;
  rotSpeed: number; // rad/s
  thickness: number;
  flashTimer: number;
}

export interface ActiveBall {
  id: number;
  orbId: OrbTypeId;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pierceLeft: number;
  reboundUsed: boolean;
  hitCount: number;
  age: number;
  stuckTimer: number;
  trail: Array<{ x: number; y: number }>;
  alive: boolean;
}

export interface VolleyProjectile {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetUid: string;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  damage: number;
  isCrit: boolean;
  color: string;
  appliesChill: boolean;
  leechRatio: number;
}

export interface FloatingCallout {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface ShockwaveRing {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface OwnedOrb {
  uid: string;
  typeId: OrbTypeId;
  level: number; // 1..3
}

export interface ForgeRewardOption {
  id: string;
  kind: 'new_orb' | 'upgrade_orb' | 'relic' | 'temper_furnace';
  title: string;
  subtitle: string;
  description: string;
  orbTypeId?: OrbTypeId;
  targetOrbUid?: string;
  relicId?: RelicId;
  healAmount?: number;
  bonusMaxHp?: number;
}

export interface ShotTally {
  hits: number;
  baseDamage: number;
  multiplier: number;
  critTriggered: boolean;
  shieldGained: number;
  bombDamage: number;
  crucibleBonus: boolean;
  leechRatio: number;
  chillApplied: boolean;
  aoeTriggered: boolean;
}

export interface SimEventBatch {
  pegHits: Array<{ x: number; y: number; kind: PegKind; combo: number }>;
  bellowsTriggered: Array<{ x: number; y: number }>;
  bombsDetonated: Array<{ x: number; y: number; radius: number }>;
  crucibleCaught: boolean;
  volleyLaunched: boolean;
  enemyHit: Array<{ x: number; y: number; damage: number; isCrit: boolean; killed: boolean }>;
  playerDamaged: number;
  stageCleared: boolean;
  victory: boolean;
  defeat: boolean;
}

export interface DifficultyDef {
  id: ForgeDifficulty;
  name: string;
  tagline: string;
  startHp: number;
  baseBellowsCharges: number;
  enemyHpScale: number;
  enemyDmgScale: number;
  scoreMult: number;
}

export interface OrbDef {
  id: OrbTypeId;
  name: string;
  tag: string;
  description: string;
  baseDamage: number;
  critBonus: number;
  gravityScale: number;
  bounciness: number;
  radius: number;
  color: string;
  coreColor: string;
  aoe: boolean;
}

export interface RelicDef {
  id: RelicId;
  name: string;
  tag: string;
  description: string;
}

export interface StageDef {
  index: number;
  act: 1 | 2 | 3;
  name: string;
  subtitle: string;
  layoutKind: 'hearth' | 'twin_mills' | 'vault_ring' | 'frost_arch' | 'wheel_forge' | 'taotie_kiln';
  enemies: EnemyArchetypeId[];
  isBoss?: boolean;
}

export interface RunSummary {
  outcome: 'victory' | 'defeat';
  stageReached: number;
  totalStages: number;
  score: number;
  bestCombo: number;
  totalShots: number;
  enemiesSlain: number;
  difficulty: ForgeDifficulty;
  isEndless: boolean;
}

export interface ForgeRunState {
  seed: number;
  rngState: number;
  difficulty: ForgeDifficulty;
  phase: BattlePhase;
  stageIndex: number; // 0..5 for campaign, 6+ for endless
  isEndless: boolean;
  turnNumber: number;
  score: number;
  bestCombo: number;
  totalShots: number;
  enemiesSlain: number;

  hp: number;
  maxHp: number;
  shield: number;
  phoenixUsed: boolean;

  deck: OwnedOrb[];
  activeOrbIndex: number;
  relics: RelicId[];

  aimAngle: number; // radians, pointing downward (0.15*PI .. 0.85*PI)
  selectedEnemyUid: string | null;

  bellowsCharges: number;
  maxBellowsCharges: number;
  bellowsCooldown: number;

  crucibleX: number;
  crucibleDir: 1 | -1;
  crucibleWidth: number;

  pegs: PegEntity[];
  bumpers: BumperEntity[];
  balls: ActiveBall[];
  enemies: EnemyInstance[];
  volleys: VolleyProjectile[];
  callouts: FloatingCallout[];
  shockwaves: ShockwaveRing[];

  shotTally: ShotTally;
  enemyTurnTimer: number;
  enemyTurnActorIdx: number;
  phaseTimer: number;
  elapsedTime: number;

  hitstopTimer: number;
  shakeTrauma: number;
  playerHitFlash: number;

  pendingRewards: ForgeRewardOption[];
  nextUid: number;
  summary: RunSummary | null;
}

export interface ForgeMetaSave {
  version: number;
  preferredDifficulty: ForgeDifficulty;
  tutorialCompleted: boolean;
  muted: boolean;
  runsPlayed: number;
  victories: number;
  bestScore: number;
  bestCombo: number;
  highestStageReached: number; // 1-based
}

export interface AimPreviewResult {
  points: Array<{ x: number; y: number }>;
  hitPoint: { x: number; y: number } | null;
  hitPegKind: PegKind | null;
  bouncePoints: Array<{ x: number; y: number }>;
}
