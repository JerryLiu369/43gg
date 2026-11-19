import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  CAMPAIGN_STAGE_COUNT,
  CRUCIBLE_Y,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  LAUNCHER_X,
  LAUNCHER_Y,
  ORB_DEFS,
  ORB_LIST,
  PEG_META,
  RELIC_DEFS,
  RELIC_LIST,
  STAGE_DEFS,
  WORLD_H,
  WORLD_W,
} from './content.ts';
import type {
  ActiveBall,
  AimPreviewResult,
  BumperEntity,
  EnemyInstance,
  ForgeDifficulty,
  ForgeRewardOption,
  ForgeRunState,
  OrbTypeId,
  OwnedOrb,
  PegEntity,
  PegKind,
  RelicId,
  ShotTally,
  SimEventBatch,
  StageDef,
} from './types.ts';

export const GRAVITY = 680;
export const LAUNCH_SPEED = 560;
export const AIM_MIN_ANGLE = 0.14 * Math.PI;
export const AIM_MAX_ANGLE = 0.86 * Math.PI;
export const WALL_BOUNCE = 0.82;
export const MAX_BALL_SPEED = 860;
export const PHYSICS_SUBSTEPS = 4;

export function nextRand(state: ForgeRunState): number {
  let t = (state.rngState + 0x6d2b79f5) | 0;
  state.rngState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function allocUid(state: ForgeRunState): number {
  const id = state.nextUid;
  state.nextUid += 1;
  return id;
}

export function createEmptyEvents(): SimEventBatch {
  return {
    pegHits: [],
    bellowsTriggered: [],
    bombsDetonated: [],
    crucibleCaught: false,
    volleyLaunched: false,
    enemyHit: [],
    playerDamaged: 0,
    stageCleared: false,
    victory: false,
    defeat: false,
  };
}

export function hasRelic(state: ForgeRunState, id: RelicId): boolean {
  return state.relics.includes(id);
}

export function getStageDef(stageIndex: number): StageDef {
  if (stageIndex < STAGE_DEFS.length) {
    return STAGE_DEFS[stageIndex];
  }
  // Endless loop reuses layouts with escalating enemy rosters
  const template = STAGE_DEFS[stageIndex % STAGE_DEFS.length];
  const cycle = Math.floor(stageIndex / STAGE_DEFS.length);
  return {
    ...template,
    index: stageIndex,
    name: `无尽熔炉 · 第 ${stageIndex + 1} 阵`,
    subtitle: `第 ${cycle + 1} 轮劫火考验`,
    isBoss: stageIndex % 3 === 2,
  };
}

export function getActiveOrb(state: ForgeRunState): OwnedOrb {
  const safeIdx =
    state.deck.length > 0
      ? ((state.activeOrbIndex % state.deck.length) + state.deck.length) %
        state.deck.length
      : 0;
  return (
    state.deck[safeIdx] ?? {
      uid: 'orb_fallback',
      typeId: 'iron_core',
      level: 1,
    }
  );
}

export function getMaxBellowsCharges(state: ForgeRunState): number {
  const diff = DIFFICULTY_DEFS[state.difficulty];
  return diff.baseBellowsCharges + (hasRelic(state, 'bellows_heart') ? 1 : 0);
}

export function getCrucibleWidth(state: ForgeRunState): number {
  return hasRelic(state, 'crucible_magnet') ? 132 : 96;
}

export function createEmptyShotTally(state: ForgeRunState): ShotTally {
  const orb = getActiveOrb(state);
  const def = ORB_DEFS[orb.typeId];
  return {
    hits: 0,
    baseDamage: 0,
    multiplier: 1.0,
    critTriggered: false,
    shieldGained: 0,
    bombDamage: 0,
    crucibleBonus: false,
    leechRatio: orb.typeId === 'crimson_leech' ? 0.15 + (orb.level - 1) * 0.04 : 0,
    chillApplied: orb.typeId === 'frost_echo',
    aoeTriggered: def.aoe,
  };
}

export function computeExpectedShotDamage(state: ForgeRunState): number {
  const t = state.shotTally;
  if (t.hits === 0 && t.bombDamage === 0) return 0;
  const critFactor = t.critTriggered ? 2.0 : 1.0;
  const crucibleFactor = t.crucibleBonus
    ? hasRelic(state, 'crucible_magnet')
      ? 1.5
      : 1.35
    : 1.0;
  const chainBonus = hasRelic(state, 'ember_chain')
    ? Math.floor(t.hits / 10) * 0.6
    : 0;
  const totalMult = t.multiplier + chainBonus;
  return Math.max(
    1,
    Math.round(t.baseDamage * totalMult * critFactor * crucibleFactor + t.bombDamage),
  );
}

function buildEnemyInstance(
  state: ForgeRunState,
  archetypeId: StageDef['enemies'][number],
  slotIdx: number,
  totalEnemies: number,
): EnemyInstance {
  const def = ENEMY_DEFS[archetypeId];
  const diff = DIFFICULTY_DEFS[state.difficulty];
  const stageScale = 1 + state.stageIndex * 0.14;
  const endlessScale = state.stageIndex >= CAMPAIGN_STAGE_COUNT
    ? Math.pow(1.22, state.stageIndex - CAMPAIGN_STAGE_COUNT + 1)
    : 1;
  // Opening stage 1 warm-up tuning so players feel strong on turn 1-2
  const warmupScale = state.stageIndex === 0 ? 0.78 : 1.0;
  const maxHp = Math.max(
    24,
    Math.round(def.baseHp * diff.enemyHpScale * stageScale * endlessScale * warmupScale),
  );

  const spacing = totalEnemies === 1 ? 0 : totalEnemies === 2 ? 156 : 140;
  const startX = WORLD_W / 2 - ((totalEnemies - 1) * spacing) / 2;
  const x = startX + slotIdx * spacing;
  const y = def.id === 'taotie_boss' ? 66 : 70;

  const firstIntent = scaleIntent(def.intents[0], state, 1);

  return {
    uid: `enemy_${allocUid(state)}`,
    archetype: def.id,
    name: def.name,
    x,
    y,
    radius: def.radius,
    hp: maxHp,
    maxHp,
    shield: 0,
    chilled: false,
    bossPhase: 1,
    intentIndex: 0,
    intent: firstIntent,
    hitFlash: 0,
    attackAnim: 0,
    dyingTimer: 0,
    dead: false,
  };
}

function scaleIntent(
  raw: { kind: EnemyInstance['intent']['kind']; value: number; label: string },
  state: ForgeRunState,
  bossPhase: 1 | 2,
): EnemyInstance['intent'] {
  const diff = DIFFICULTY_DEFS[state.difficulty];
  if (raw.kind === 'freeze') {
    return { ...raw };
  }
  const endlessScale =
    state.stageIndex >= CAMPAIGN_STAGE_COUNT
      ? 1 + (state.stageIndex - CAMPAIGN_STAGE_COUNT + 1) * 0.15
      : 1;
  const phaseMult = bossPhase === 2 ? 1.25 : 1.0;
  const val = Math.max(
    4,
    Math.round(raw.value * diff.enemyDmgScale * endlessScale * phaseMult),
  );
  const prefix = raw.label.split(' ')[0] || raw.label;
  return {
    kind: raw.kind,
    value: val,
    label: `${prefix} ${val}`,
  };
}

function makePeg(
  state: ForgeRunState,
  x: number,
  y: number,
  kind: PegKind,
  motion?: Partial<Pick<PegEntity, 'orbitRadius' | 'orbitSpeed' | 'orbitPhase' | 'swayAmpX' | 'swaySpeed' | 'swayPhase'>>,
): PegEntity {
  const meta = PEG_META[kind];
  const clampedX = Math.max(BOARD_LEFT + meta.radius + 10, Math.min(BOARD_RIGHT - meta.radius - 10, x));
  const clampedY = Math.max(BOARD_TOP + 54, Math.min(CRUCIBLE_Y - 52, y));
  return {
    id: allocUid(state),
    kind,
    baseX: clampedX,
    baseY: clampedY,
    x: clampedX,
    y: clampedY,
    radius: meta.radius,
    lit: false,
    hitCount: 0,
    frozen: false,
    flashTimer: 0,
    ...motion,
  };
}

function buildStageBoard(
  state: ForgeRunState,
  layoutKind: StageDef['layoutKind'],
): { pegs: PegEntity[]; bumpers: BumperEntity[] } {
  const pegs: PegEntity[] = [];
  const bumpers: BumperEntity[] = [];

  const pushUnique = (
    x: number,
    y: number,
    kind: PegKind,
    motion?: Partial<Pick<PegEntity, 'orbitRadius' | 'orbitSpeed' | 'orbitPhase' | 'swayAmpX' | 'swaySpeed' | 'swayPhase'>>,
  ) => {
    if (!motion?.orbitRadius) {
      for (const existing of pegs) {
        if (existing.orbitRadius) continue;
        if (Math.hypot(existing.baseX - x, existing.baseY - y) < 34) {
          return;
        }
      }
    }
    pegs.push(makePeg(state, x, y, kind, motion));
  };

  if (layoutKind === 'hearth') {
    // Stage 1: Welcoming diamond & arc constellation with clear high-value targets
    const rows = [
      { y: 248, count: 6, span: 350 },
      { y: 312, count: 7, span: 400 },
      { y: 376, count: 6, span: 360 },
      { y: 440, count: 7, span: 400 },
      { y: 504, count: 6, span: 340 },
      { y: 562, count: 5, span: 280 },
    ];
    rows.forEach((row, rIdx) => {
      for (let i = 0; i < row.count; i++) {
        const t = row.count === 1 ? 0.5 : i / (row.count - 1);
        const x = WORLD_W / 2 - row.span / 2 + t * row.span;
        let kind: PegKind = 'bronze';
        if (rIdx === 1 && (i === 2 || i === 4)) kind = 'crit';
        else if (rIdx === 2 && (i === 1 || i === 4)) kind = 'mult';
        else if (rIdx === 3 && i === 3) kind = 'bomb';
        else if (rIdx === 4 && (i === 1 || i === 4)) kind = 'wind';
        else if (rIdx === 2 && i === 2) kind = 'prism';
        else if (rIdx === 5 && (i === 1 || i === 3)) kind = 'shield';
        pushUnique(x, row.y, kind);
      }
    });
  } else if (layoutKind === 'twin_mills') {
    // Stage 2: Two counter-rotating bronze bars + bomb diamond
    bumpers.push(
      {
        id: allocUid(state),
        cx: 158,
        cy: 396,
        halfLen: 48,
        angle: 0.3,
        rotSpeed: 0.85,
        thickness: 9,
        flashTimer: 0,
      },
      {
        id: allocUid(state),
        cx: WORLD_W - 158,
        cy: 396,
        halfLen: 48,
        angle: -0.3,
        rotSpeed: -0.85,
        thickness: 9,
        flashTimer: 0,
      },
    );

    // Upper fan
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 60;
      const y = 246 + Math.abs(i - 3) * 14;
      const kind: PegKind =
        i === 3 ? 'prism' : i === 1 || i === 5 ? 'crit' : 'bronze';
      pushUnique(x, y, kind);
    }
    // Center diamond between mills
    pushUnique(WORLD_W / 2, 336, 'mult');
    pushUnique(WORLD_W / 2 - 44, 396, 'bomb');
    pushUnique(WORLD_W / 2 + 44, 396, 'bomb');
    pushUnique(WORLD_W / 2, 456, 'crit');
    // Outer flanks
    for (let i = 0; i < 4; i++) {
      const y = 310 + i * 62;
      pushUnique(66, y, i === 2 ? 'wind' : 'bronze');
      pushUnique(WORLD_W - 66, y, i === 2 ? 'wind' : 'bronze');
    }
    // Lower catch rows
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 60;
      const kind: PegKind =
        i === 2 || i === 4 ? 'shield' : i === 3 ? 'mult' : 'bronze';
      pushUnique(x, 536 + (i % 2) * 26, kind);
    }
  } else if (layoutKind === 'vault_ring') {
    // Stage 3: Orbiting bronze ring around a central gold vault
    const cx = WORLD_W / 2;
    const cy = 392;
    pushUnique(cx, cy, 'bomb');
    const innerCount = 6;
    for (let i = 0; i < innerCount; i++) {
      const phase = (i / innerCount) * Math.PI * 2;
      const kind: PegKind =
        i % 3 === 0 ? 'crit' : i % 3 === 1 ? 'mult' : 'prism';
      pushUnique(cx, cy, kind, {
        orbitRadius: 68,
        orbitSpeed: 0.58,
        orbitPhase: phase,
      });
    }
    const outerCount = 12;
    for (let i = 0; i < outerCount; i++) {
      const ang = (i / outerCount) * Math.PI * 2;
      const x = cx + Math.cos(ang) * 144;
      const y = cy + Math.sin(ang) * 124;
      const kind: PegKind =
        i % 4 === 0 ? 'wind' : i % 4 === 2 ? 'shield' : 'bronze';
      pushUnique(x, y, kind);
    }
    // Corner anchor pegs
    const corners: Array<[number, number, PegKind]> = [
      [82, 244, 'bronze'],
      [142, 232, 'mult'],
      [WORLD_W - 142, 232, 'mult'],
      [WORLD_W - 82, 244, 'bronze'],
      [82, 550, 'shield'],
      [152, 566, 'bronze'],
      [WORLD_W - 152, 566, 'bronze'],
      [WORLD_W - 82, 550, 'shield'],
    ];
    for (const [x, y, k] of corners) pushUnique(x, y, k);
  } else if (layoutKind === 'frost_arch') {
    // Stage 4: Swaying ice-bridge rows + twin central prism pillars
    for (let r = 0; r < 5; r++) {
      const y = 252 + r * 72;
      const count = r % 2 === 0 ? 6 : 5;
      const span = r % 2 === 0 ? 370 : 310;
      const swayDir = r % 2 === 0 ? 1 : -1;
      for (let i = 0; i < count; i++) {
        const x = WORLD_W / 2 - span / 2 + (i / (count - 1)) * span;
        let kind: PegKind = 'bronze';
        if (r === 1 && (i === 1 || i === 3)) kind = 'crit';
        else if (r === 2 && i === 2) kind = 'prism';
        else if (r === 2 && (i === 0 || i === 5)) kind = 'wind';
        else if (r === 3 && (i === 1 || i === 3)) kind = 'mult';
        else if (r === 4 && (i === 2 || i === 3)) kind = 'bomb';
        else if (r === 0 && (i === 2 || i === 3)) kind = 'shield';
        pushUnique(x, y, kind, {
          swayAmpX: r === 1 || r === 3 ? 26 * swayDir : 0,
          swaySpeed: 1.1,
          swayPhase: r * 0.9,
        });
      }
    }
    pushUnique(WORLD_W / 2, 574, 'wind');
    pushUnique(WORLD_W / 2 - 90, 568, 'shield');
    pushUnique(WORLD_W / 2 + 90, 568, 'shield');
  } else if (layoutKind === 'wheel_forge') {
    // Stage 5: Central spinning cross bar + explosive outer nodes
    bumpers.push(
      {
        id: allocUid(state),
        cx: WORLD_W / 2,
        cy: 392,
        halfLen: 66,
        angle: 0,
        rotSpeed: 0.72,
        thickness: 9,
        flashTimer: 0,
      },
      {
        id: allocUid(state),
        cx: WORLD_W / 2,
        cy: 392,
        halfLen: 66,
        angle: Math.PI / 2,
        rotSpeed: 0.72,
        thickness: 9,
        flashTimer: 0,
      },
    );
    const ringCount = 10;
    for (let i = 0; i < ringCount; i++) {
      const ang = (i / ringCount) * Math.PI * 2;
      const x = WORLD_W / 2 + Math.cos(ang) * 124;
      const y = 392 + Math.sin(ang) * 116;
      const kind: PegKind =
        i % 5 === 0
          ? 'crit'
          : i % 5 === 2
            ? 'bomb'
            : i % 5 === 3
              ? 'mult'
              : 'bronze';
      pushUnique(x, y, kind);
    }
    const flankRows = [244, 302, 488, 550];
    flankRows.forEach((y, idx) => {
      for (let i = 0; i < 6; i++) {
        const x = 76 + i * 77;
        let kind: PegKind = 'bronze';
        if (idx === 0 && (i === 2 || i === 3)) kind = 'prism';
        else if (idx === 2 && (i === 0 || i === 5)) kind = 'wind';
        else if (idx === 3 && (i === 1 || i === 4)) kind = 'shield';
        else if (idx === 3 && (i === 2 || i === 3)) kind = 'mult';
        pushUnique(x, y, kind);
      }
    });
  } else {
    // Stage 6 Boss: Taotie Kiln — Grand concentric furnace with twin side gates
    bumpers.push(
      {
        id: allocUid(state),
        cx: 122,
        cy: 432,
        halfLen: 44,
        angle: 0.4,
        rotSpeed: 0.9,
        thickness: 9,
        flashTimer: 0,
      },
      {
        id: allocUid(state),
        cx: WORLD_W - 122,
        cy: 432,
        halfLen: 44,
        angle: -0.4,
        rotSpeed: -0.9,
        thickness: 9,
        flashTimer: 0,
      },
    );
    const cx = WORLD_W / 2;
    const cy = 368;
    pushUnique(cx, cy, 'prism');
    for (let i = 0; i < 6; i++) {
      const phase = (i / 6) * Math.PI * 2;
      const kind: PegKind = i % 2 === 0 ? 'crit' : 'mult';
      pushUnique(cx, cy, kind, {
        orbitRadius: 62,
        orbitSpeed: -0.65,
        orbitPhase: phase,
      });
    }
    for (let i = 0; i < 8; i++) {
      const x = 72 + i * 56;
      pushUnique(x, 244 + (i % 2) * 18, i === 3 || i === 4 ? 'bomb' : 'bronze');
    }
    for (let i = 0; i < 7; i++) {
      const x = 84 + i * 62;
      const kind: PegKind =
        i === 0 || i === 6
          ? 'wind'
          : i === 2 || i === 4
            ? 'shield'
            : i === 3
              ? 'bomb'
              : 'bronze';
      pushUnique(x, 512 + (i % 2) * 24, kind);
    }
    pushUnique(cx - 72, 574, 'mult');
    pushUnique(cx, 578, 'wind');
    pushUnique(cx + 72, 574, 'mult');
  }

  // Apply prism_bloom relic: convert up to 2 bronze pegs into prism pegs
  if (hasRelic(state, 'prism_bloom')) {
    let converted = 0;
    for (const peg of pegs) {
      if (peg.kind === 'bronze' && converted < 2) {
        peg.kind = 'prism';
        peg.radius = PEG_META.prism.radius;
        converted += 1;
      }
    }
  }

  return { pegs, bumpers };
}

export function updateBoardKinematics(state: ForgeRunState, dt: number): void {
  const t = state.elapsedTime;
  for (const peg of state.pegs) {
    if (peg.flashTimer > 0) peg.flashTimer = Math.max(0, peg.flashTimer - dt);
    if (peg.orbitRadius && peg.orbitSpeed) {
      const ang = (peg.orbitPhase ?? 0) + t * peg.orbitSpeed;
      peg.x = peg.baseX + Math.cos(ang) * peg.orbitRadius;
      peg.y = peg.baseY + Math.sin(ang) * peg.orbitRadius;
    } else if (peg.swayAmpX && peg.swaySpeed) {
      const offset = Math.sin((peg.swayPhase ?? 0) + t * peg.swaySpeed) * peg.swayAmpX;
      peg.x = peg.baseX + offset;
      peg.y = peg.baseY;
    } else {
      peg.x = peg.baseX;
      peg.y = peg.baseY;
    }
  }

  for (const b of state.bumpers) {
    if (b.flashTimer > 0) b.flashTimer = Math.max(0, b.flashTimer - dt);
    b.angle += b.rotSpeed * dt;
  }

  // Move golden crucible basket smoothly along furnace floor
  const halfW = state.crucibleWidth / 2;
  const minX = BOARD_LEFT + halfW + 12;
  const maxX = BOARD_RIGHT - halfW - 12;
  state.crucibleX += state.crucibleDir * 112 * dt;
  if (state.crucibleX <= minX) {
    state.crucibleX = minX;
    state.crucibleDir = 1;
  } else if (state.crucibleX >= maxX) {
    state.crucibleX = maxX;
    state.crucibleDir = -1;
  }
}

export function setupStageInPlace(state: ForgeRunState, stageIndex: number): void {
  state.stageIndex = stageIndex;
  const def = getStageDef(stageIndex);
  const { pegs, bumpers } = buildStageBoard(state, def.layoutKind);
  state.pegs = pegs;
  state.bumpers = bumpers;
  state.balls = [];
  state.volleys = [];
  state.shockwaves = [];
  state.callouts = [];
  state.enemies = def.enemies.map((arch, idx) =>
    buildEnemyInstance(state, arch, idx, def.enemies.length),
  );
  state.selectedEnemyUid = state.enemies[0]?.uid ?? null;
  state.phase = 'aiming';
  state.turnNumber = 1;
  state.shield = hasRelic(state, 'double_anvil') ? 7 : 0;
  state.crucibleWidth = getCrucibleWidth(state);
  state.crucibleX = WORLD_W / 2;
  state.bellowsCharges = getMaxBellowsCharges(state);
  state.maxBellowsCharges = getMaxBellowsCharges(state);
  state.bellowsCooldown = 0;
  state.shotTally = createEmptyShotTally(state);
  state.pendingRewards = [];
  updateBoardKinematics(state, 0);
}

export function createNewForgeRun(
  difficulty: ForgeDifficulty = 'standard',
  seed: number = 1337,
  startStageIndex: number = 0,
): ForgeRunState {
  const diff = DIFFICULTY_DEFS[difficulty];
  const state: ForgeRunState = {
    seed,
    rngState: seed >>> 0 || 1,
    difficulty,
    phase: 'aiming',
    stageIndex: startStageIndex,
    isEndless: false,
    turnNumber: 1,
    score: 0,
    bestCombo: 0,
    totalShots: 0,
    enemiesSlain: 0,
    hp: diff.startHp,
    maxHp: diff.startHp,
    shield: 0,
    phoenixUsed: false,
    deck: [
      { uid: 'orb_1', typeId: 'iron_core', level: 1 },
      { uid: 'orb_2', typeId: 'twin_spark', level: 1 },
      { uid: 'orb_3', typeId: 'blast_cinder', level: 1 },
    ],
    activeOrbIndex: 0,
    relics: [],
    aimAngle: Math.PI / 2,
    selectedEnemyUid: null,
    bellowsCharges: diff.baseBellowsCharges,
    maxBellowsCharges: diff.baseBellowsCharges,
    bellowsCooldown: 0,
    crucibleX: WORLD_W / 2,
    crucibleDir: 1,
    crucibleWidth: 96,
    pegs: [],
    bumpers: [],
    balls: [],
    enemies: [],
    volleys: [],
    callouts: [],
    shockwaves: [],
    shotTally: {
      hits: 0,
      baseDamage: 0,
      multiplier: 1,
      critTriggered: false,
      shieldGained: 0,
      bombDamage: 0,
      crucibleBonus: false,
      leechRatio: 0,
      chillApplied: false,
      aoeTriggered: false,
    },
    enemyTurnTimer: 0,
    enemyTurnActorIdx: 0,
    phaseTimer: 0,
    elapsedTime: 0,
    hitstopTimer: 0,
    shakeTrauma: 0,
    playerHitFlash: 0,
    pendingRewards: [],
    nextUid: 10,
    summary: null,
  };
  setupStageInPlace(state, startStageIndex);
  return state;
}

export function clampAimAngle(angle: number): number {
  return Math.max(AIM_MIN_ANGLE, Math.min(AIM_MAX_ANGLE, angle));
}

export function setAimTowardPoint(
  state: ForgeRunState,
  worldX: number,
  worldY: number,
): number {
  const dx = worldX - LAUNCHER_X;
  const dy = Math.max(24, worldY - LAUNCHER_Y);
  const angle = clampAimAngle(Math.atan2(dy, dx));
  state.aimAngle = angle;
  return angle;
}

export function selectOrbIndex(state: ForgeRunState, index: number): void {
  if (state.phase !== 'aiming' || state.deck.length === 0) return;
  state.activeOrbIndex = ((index % state.deck.length) + state.deck.length) % state.deck.length;
  state.shotTally = createEmptyShotTally(state);
}

export function selectEnemyTarget(state: ForgeRunState, uid: string): void {
  const found = state.enemies.find((e) => e.uid === uid && !e.dead);
  if (found) {
    state.selectedEnemyUid = found.uid;
  }
}

function getLivingEnemies(state: ForgeRunState): EnemyInstance[] {
  return state.enemies.filter((e) => !e.dead);
}

function getPrimaryTarget(state: ForgeRunState): EnemyInstance | null {
  const living = getLivingEnemies(state);
  if (living.length === 0) return null;
  const selected = living.find((e) => e.uid === state.selectedEnemyUid);
  if (selected) return selected;
  state.selectedEnemyUid = living[0].uid;
  return living[0];
}

/**
 * Predicts exact initial ballistic arc + first bounce direction using the same
 * physics step as live orb simulation.
 */
export function computeAimPreview(
  state: ForgeRunState,
  angle: number = state.aimAngle,
): AimPreviewResult {
  const orb = getActiveOrb(state);
  const def = ORB_DEFS[orb.typeId];
  const clamped = clampAimAngle(angle);
  let x = LAUNCHER_X;
  let y = LAUNCHER_Y;
  let vx = Math.cos(clamped) * LAUNCH_SPEED;
  let vy = Math.sin(clamped) * LAUNCH_SPEED;
  const g = GRAVITY * def.gravityScale;
  const r = def.radius;

  const points: Array<{ x: number; y: number }> = [{ x, y }];
  const bouncePoints: Array<{ x: number; y: number }> = [];
  let hitPoint: { x: number; y: number } | null = null;
  let hitPegKind: PegKind | null = null;

  const dt = 1 / 120;
  let bounced = false;
  let postBounceSteps = 0;

  for (let step = 0; step < 110; step++) {
    vy += g * dt;
    x += vx * dt;
    y += vy * dt;

    // Wall reflection
    if (x - r < BOARD_LEFT) {
      x = BOARD_LEFT + r;
      vx = Math.abs(vx) * WALL_BOUNCE;
    } else if (x + r > BOARD_RIGHT) {
      x = BOARD_RIGHT - r;
      vx = -Math.abs(vx) * WALL_BOUNCE;
    }

    if (y > BOARD_BOTTOM) break;

    if (!bounced) {
      // Check first peg collision
      for (const peg of state.pegs) {
        const dx = x - peg.x;
        const dy = y - peg.y;
        const minDist = r + peg.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq <= minDist * minDist) {
          const dist = Math.max(0.001, Math.sqrt(distSq));
          const nx = dx / dist;
          const ny = dy / dist;
          x = peg.x + nx * minDist;
          y = peg.y + ny * minDist;
          hitPoint = { x, y };
          hitPegKind = peg.kind;
          if (orb.typeId !== 'meteor_pierce') {
            const dot = vx * nx + vy * ny;
            vx = (vx - 2 * dot * nx) * def.bounciness;
            vy = (vy - 2 * dot * ny) * def.bounciness;
          }
          bounced = true;
          bouncePoints.push({ x, y });
          break;
        }
      }
      if (!bounced && step % 3 === 0) {
        points.push({ x, y });
      }
    } else {
      postBounceSteps += 1;
      if (postBounceSteps % 3 === 0) {
        bouncePoints.push({ x, y });
      }
      if (postBounceSteps >= 26) break;
    }
  }

  return { points, hitPoint, hitPegKind, bouncePoints };
}

/**
 * Picks a rewarding aim angle targeting a high-value unlit peg (used by tutorial demo button).
 */
export function computeAutoAimAngle(state: ForgeRunState): number {
  let bestAngle = Math.PI / 2;
  let bestScore = -1;
  const kindScore: Record<PegKind, number> = {
    crit: 100,
    mult: 85,
    prism: 80,
    bomb: 75,
    wind: 60,
    shield: 45,
    bronze: 25,
  };

  for (let i = 0; i <= 32; i++) {
    const candidate =
      AIM_MIN_ANGLE + ((AIM_MAX_ANGLE - AIM_MIN_ANGLE) * i) / 32;
    const preview = computeAimPreview(state, candidate);
    if (preview.hitPegKind) {
      const score = kindScore[preview.hitPegKind];
      if (score > bestScore) {
        bestScore = score;
        bestAngle = candidate;
      }
    }
  }
  return bestAngle;
}

function addCallout(
  state: ForgeRunState,
  x: number,
  y: number,
  text: string,
  color: string,
  scale: number = 1,
): void {
  state.callouts.push({
    id: allocUid(state),
    x,
    y,
    vy: -42,
    text,
    color,
    scale,
    life: 0.9,
    maxLife: 0.9,
  });
  if (state.callouts.length > 24) {
    state.callouts.shift();
  }
}

function addShockwave(
  state: ForgeRunState,
  x: number,
  y: number,
  maxRadius: number,
  color: string,
): void {
  state.shockwaves.push({
    id: allocUid(state),
    x,
    y,
    radius: 10,
    maxRadius,
    color,
    life: 0.34,
    maxLife: 0.34,
  });
  if (state.shockwaves.length > 16) {
    state.shockwaves.shift();
  }
}

export function fireOrb(state: ForgeRunState, angle?: number): boolean {
  if (state.phase !== 'aiming') return false;
  if (typeof angle === 'number' && Number.isFinite(angle)) {
    state.aimAngle = clampAimAngle(angle);
  }
  const orb = getActiveOrb(state);
  const def = ORB_DEFS[orb.typeId];
  state.shotTally = createEmptyShotTally(state);
  state.bellowsCharges = getMaxBellowsCharges(state);
  state.maxBellowsCharges = state.bellowsCharges;
  state.bellowsCooldown = 0;
  state.totalShots += 1;
  state.balls = [];

  const spawnBall = (angleOffset: number) => {
    const a = clampAimAngle(state.aimAngle + angleOffset);
    const ball: ActiveBall = {
      id: allocUid(state),
      orbId: orb.typeId,
      level: orb.level,
      x: LAUNCHER_X,
      y: LAUNCHER_Y,
      vx: Math.cos(a) * LAUNCH_SPEED,
      vy: Math.sin(a) * LAUNCH_SPEED,
      radius: def.radius,
      pierceLeft: orb.typeId === 'meteor_pierce' ? 3 + orb.level : 0,
      reboundUsed: false,
      hitCount: 0,
      age: 0,
      stuckTimer: 0,
      trail: [],
      alive: true,
    };
    state.balls.push(ball);
  };

  if (orb.typeId === 'twin_spark') {
    spawnBall(-0.075);
    spawnBall(0.075);
  } else {
    spawnBall(0);
  }

  state.phase = 'firing';
  return true;
}

function triggerPegEffect(
  state: ForgeRunState,
  peg: PegEntity,
  ball: ActiveBall,
  events: SimEventBatch,
  fromChain: boolean = false,
): void {
  if (peg.frozen) {
    peg.frozen = false;
    peg.flashTimer = 0.25;
    addCallout(state, peg.x, peg.y - 12, '破冰!', '#38BDF8', 0.95);
    events.pegHits.push({
      x: peg.x,
      y: peg.y,
      kind: peg.kind,
      combo: Math.max(1, state.shotTally.hits),
    });
    return;
  }

  const orbDef = ORB_DEFS[ball.orbId];
  const levelBonus = (ball.level - 1) * 2;
  const heavyQuench = hasRelic(state, 'heavy_quench') ? 2 : 0;

  peg.lit = true;
  peg.hitCount += 1;
  peg.flashTimer = 0.28;

  state.shotTally.hits += 1;
  if (state.shotTally.hits > state.bestCombo) {
    state.bestCombo = state.shotTally.hits;
  }

  const overheatMult =
    hasRelic(state, 'overheat_core') && state.shotTally.hits > 14 ? 2 : 1;
  const pegPower =
    (PEG_META[peg.kind].basePower + orbDef.baseDamage + levelBonus + heavyQuench) *
    overheatMult;
  state.shotTally.baseDamage += pegPower;

  events.pegHits.push({
    x: peg.x,
    y: peg.y,
    kind: peg.kind,
    combo: state.shotTally.hits,
  });

  if (peg.kind === 'crit') {
    if (!state.shotTally.critTriggered) {
      state.shotTally.critTriggered = true;
      state.shotTally.baseDamage += orbDef.critBonus;
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.045);
      state.shakeTrauma = Math.min(1, state.shakeTrauma + 0.36);
      addShockwave(state, peg.x, peg.y, 68, '#FDE047');
      addCallout(state, peg.x, peg.y - 14, '暴击 ×2!', '#FDE047', 1.2);
    } else {
      state.shotTally.multiplier += 0.35;
      addCallout(state, peg.x, peg.y - 14, '+0.35x', '#FDE047', 1.0);
    }
    if (hasRelic(state, 'crit_resonance')) {
      state.shield += 5;
      state.shotTally.shieldGained += 5;
      state.bellowsCharges = Math.min(
        state.maxBellowsCharges + 1,
        state.bellowsCharges + 1,
      );
    }
  } else if (peg.kind === 'mult') {
    const multGain = 0.5;
    state.shotTally.multiplier = Number(
      (state.shotTally.multiplier + multGain).toFixed(2),
    );
    addShockwave(state, peg.x, peg.y, 56, '#FB923C');
    addCallout(state, peg.x, peg.y - 12, '+0.5x', '#FB923C', 1.05);
  } else if (peg.kind === 'shield') {
    const shieldGain = 5 + (ball.level - 1);
    state.shield += shieldGain;
    state.shotTally.shieldGained += shieldGain;
    addShockwave(state, peg.x, peg.y, 48, '#60A5FA');
    addCallout(state, peg.x, peg.y - 12, `盾 +${shieldGain}`, '#60A5FA', 0.95);
  } else if (peg.kind === 'wind') {
    state.bellowsCharges = Math.min(
      state.maxBellowsCharges + 1,
      state.bellowsCharges + 1,
    );
    ball.vy = Math.min(ball.vy, -420);
    addShockwave(state, peg.x, peg.y, 62, '#2DD4BF');
    addCallout(state, peg.x, peg.y - 12, '鼓风 +1', '#2DD4BF', 1.05);
  } else if (peg.kind === 'prism' && !fromChain && state.balls.length < 5) {
    // Spawn a split orb!
    const clone: ActiveBall = {
      id: allocUid(state),
      orbId: ball.orbId,
      level: ball.level,
      x: ball.x + (ball.vx >= 0 ? -8 : 8),
      y: ball.y - 4,
      vx: -ball.vx * 0.9 + (ball.vx >= 0 ? -90 : 90),
      vy: Math.min(ball.vy, -240),
      radius: Math.max(8, ball.radius * 0.9),
      pierceLeft: Math.max(0, ball.pierceLeft - 1),
      reboundUsed: true,
      hitCount: 0,
      age: 0,
      stuckTimer: 0,
      trail: [],
      alive: true,
    };
    state.balls.push(clone);
    addShockwave(state, peg.x, peg.y, 66, '#818CF8');
    addCallout(state, peg.x, peg.y - 14, '分光分裂!', '#A5B4FC', 1.15);
  } else if (peg.kind === 'bomb' && !fromChain) {
    detonateBlast(state, peg.x, peg.y, ball, events);
  }

  // Special orb passive triggers on direct hit
  if (!fromChain) {
    ball.hitCount += 1;
    if (ball.orbId === 'blast_cinder' && ball.hitCount % 4 === 0) {
      detonateBlast(state, ball.x, ball.y, ball, events, 0.78);
    }
    if (ball.orbId === 'bell_chime') {
      // Resonate nearest unlit peg within 88px
      let nearest: PegEntity | null = null;
      let bestDist = 88;
      for (const other of state.pegs) {
        if (other.id === peg.id || other.lit) continue;
        const d = Math.hypot(other.x - peg.x, other.y - peg.y);
        if (d < bestDist) {
          bestDist = d;
          nearest = other;
        }
      }
      if (nearest) {
        triggerPegEffect(state, nearest, ball, events, true);
      }
    }
  }
}

function detonateBlast(
  state: ForgeRunState,
  cx: number,
  cy: number,
  ball: ActiveBall,
  events: SimEventBatch,
  scale: number = 1,
): void {
  const powderBonus = hasRelic(state, 'powder_keg');
  const radius = Math.round(92 * scale * (powderBonus ? 1.35 : 1));
  const blastDmg = Math.round((18 + (powderBonus ? 14 : 0)) * scale);
  state.shotTally.bombDamage += blastDmg;
  state.shotTally.aoeTriggered = true;
  state.hitstopTimer = Math.max(state.hitstopTimer, 0.05);
  state.shakeTrauma = Math.min(1, state.shakeTrauma + 0.48);

  events.bombsDetonated.push({ x: cx, y: cy, radius });
  addShockwave(state, cx, cy, radius, '#FF4D4D');
  addCallout(state, cx, cy - 16, `爆破 +${blastDmg}`, '#FCA5A5', 1.18);

  for (const other of state.pegs) {
    if (other.lit && !other.frozen) continue;
    const d = Math.hypot(other.x - cx, other.y - cy);
    if (d <= radius) {
      triggerPegEffect(state, other, ball, events, true);
    }
  }
}

/**
 * Active Mid-Flight Skill: Bellows Magnetic Pulse (鼓风磁冲)
 * Lifts active orbs back upward toward high-value unlit pegs & rings pegs in shockwave radius!
 */
export function triggerBellowsPulse(
  state: ForgeRunState,
  events: SimEventBatch = createEmptyEvents(),
): boolean {
  if (state.phase !== 'firing') return false;
  if (state.bellowsCharges <= 0 || state.bellowsCooldown > 0) return false;
  const aliveBalls = state.balls.filter((b) => b.alive);
  if (aliveBalls.length === 0) return false;

  state.bellowsCharges -= 1;
  state.bellowsCooldown = 0.24;
  state.hitstopTimer = Math.max(state.hitstopTimer, 0.042);
  state.shakeTrauma = Math.min(1, state.shakeTrauma + 0.4);

  const valueWeight: Record<PegKind, number> = {
    crit: 4,
    mult: 3.4,
    prism: 3.2,
    bomb: 3.0,
    wind: 2.5,
    shield: 2.0,
    bronze: 1.0,
  };

  for (const ball of aliveBalls) {
    // Choose an appealing unlit target peg above or near the ball
    let targetPeg: PegEntity | null = null;
    let bestUtility = -1;
    for (const peg of state.pegs) {
      if (peg.lit && !peg.frozen) continue;
      const dist = Math.hypot(peg.x - ball.x, peg.y - ball.y);
      if (dist < 22 || dist > 260) continue;
      const upwardBonus = peg.y < ball.y ? 1.35 : 0.75;
      const utility = (valueWeight[peg.kind] * upwardBonus) / (dist + 40);
      if (utility > bestUtility) {
        bestUtility = utility;
        targetPeg = peg;
      }
    }

    if (targetPeg) {
      const dx = targetPeg.x - ball.x;
      const dy = Math.min(-140, targetPeg.y - ball.y - 45);
      const len = Math.max(1, Math.hypot(dx, dy));
      ball.vx = (dx / len) * 430;
      ball.vy = Math.min(-370, (dy / len) * 510);
    } else {
      ball.vy = -480;
      ball.vx = ball.vx * 0.65 + (ball.x > WORLD_W / 2 ? -120 : 120);
    }

    events.bellowsTriggered.push({ x: ball.x, y: ball.y });
    addShockwave(state, ball.x, ball.y, 88, '#2DD4BF');
    addCallout(state, ball.x, ball.y - 16, '鼓风磁冲!', '#5EEAD4', 1.1);

    // Shockwave rings nearby unlit pegs
    for (const peg of state.pegs) {
      if (peg.lit && !peg.frozen) continue;
      if (Math.hypot(peg.x - ball.x, peg.y - ball.y) <= 84) {
        triggerPegEffect(state, peg, ball, events, true);
      }
    }
  }

  // Master Smith relic: bellows directly sears locked enemy
  if (hasRelic(state, 'master_smith')) {
    const target = getPrimaryTarget(state);
    if (target) {
      applyDamageToEnemy(state, target, 14, false, events);
    }
  }

  return true;
}

function collideBallWithBumper(ball: ActiveBall, bumper: BumperEntity): boolean {
  const cos = Math.cos(bumper.angle);
  const sin = Math.sin(bumper.angle);
  const ax = bumper.cx - cos * bumper.halfLen;
  const ay = bumper.cy - sin * bumper.halfLen;
  const bx = bumper.cx + cos * bumper.halfLen;
  const by = bumper.cy + sin * bumper.halfLen;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = ball.x - ax;
  const apy = ball.y - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(1, abLenSq)));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;

  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const minDist = ball.radius + bumper.thickness * 0.65;
  const distSq = dx * dx + dy * dy;
  if (distSq > minDist * minDist) return false;

  const dist = Math.max(0.001, Math.sqrt(distSq));
  const nx = dx / dist;
  const ny = dy / dist;
  ball.x = closestX + nx * (minDist + 0.5);
  ball.y = closestY + ny * (minDist + 0.5);

  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx = (ball.vx - 2 * dot * nx) * 0.92 + nx * 55;
    ball.vy = (ball.vy - 2 * dot * ny) * 0.92 + ny * 55;
  }
  bumper.flashTimer = 0.2;
  return true;
}

function launchVolleyFromTally(
  state: ForgeRunState,
  events: SimEventBatch,
): void {
  const living = getLivingEnemies(state);
  if (living.length === 0) {
    handleStageCleared(state, events);
    return;
  }

  const totalDamage = computeExpectedShotDamage(state);
  if (totalDamage <= 0) {
    // Missed everything: tiny consolation ember so the turn smoothly advances
    const fallbackTarget = getPrimaryTarget(state);
    if (fallbackTarget) {
      state.volleys.push({
        id: allocUid(state),
        x: state.crucibleX,
        y: CRUCIBLE_Y - 12,
        startX: state.crucibleX,
        startY: CRUCIBLE_Y - 12,
        targetUid: fallbackTarget.uid,
        targetX: fallbackTarget.x,
        targetY: fallbackTarget.y,
        progress: 0,
        duration: 0.34,
        damage: 4,
        isCrit: false,
        color: '#F59E0B',
        appliesChill: false,
        leechRatio: 0,
      });
    }
  } else {
    const targets = state.shotTally.aoeTriggered
      ? living
      : [getPrimaryTarget(state)!];
    const orb = getActiveOrb(state);
    const orbColor = ORB_DEFS[orb.typeId].color;

    targets.forEach((enemy, idx) => {
      const dmg =
        targets.length > 1 && idx > 0
          ? Math.max(1, Math.round(totalDamage * 0.78))
          : totalDamage;
      state.volleys.push({
        id: allocUid(state),
        x: state.crucibleX + (idx - (targets.length - 1) / 2) * 18,
        y: CRUCIBLE_Y - 14,
        startX: state.crucibleX + (idx - (targets.length - 1) / 2) * 18,
        startY: CRUCIBLE_Y - 14,
        targetUid: enemy.uid,
        targetX: enemy.x,
        targetY: enemy.y,
        progress: 0,
        duration: 0.34 + idx * 0.06,
        damage: dmg,
        isCrit: state.shotTally.critTriggered,
        color: state.shotTally.critTriggered ? '#FDE047' : orbColor,
        appliesChill: state.shotTally.chillApplied,
        leechRatio: idx === 0 ? state.shotTally.leechRatio : 0,
      });
    });
  }

  events.volleyLaunched = true;
  state.phase = 'volley';
}

function applyDamageToEnemy(
  state: ForgeRunState,
  enemy: EnemyInstance,
  damage: number,
  isCrit: boolean,
  events: SimEventBatch,
): void {
  if (enemy.dead) return;
  let remaining = damage;
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, remaining);
    enemy.shield -= absorbed;
    remaining -= absorbed;
  }
  enemy.hp = Math.max(0, enemy.hp - remaining);
  enemy.hitFlash = 0.24;

  const killed = enemy.hp <= 0;
  if (killed) {
    enemy.dead = true;
    enemy.dyingTimer = 0.42;
    state.enemiesSlain += 1;
    state.score += Math.round(
      (enemy.archetype === 'taotie_boss' ? 450 : 120) *
        DIFFICULTY_DEFS[state.difficulty].scoreMult,
    );
  }

  state.score += Math.round(damage * 2 * DIFFICULTY_DEFS[state.difficulty].scoreMult);
  state.hitstopTimer = Math.max(state.hitstopTimer, isCrit || killed ? 0.055 : 0.03);
  state.shakeTrauma = Math.min(1, state.shakeTrauma + (isCrit || killed ? 0.45 : 0.25));

  events.enemyHit.push({
    x: enemy.x,
    y: enemy.y,
    damage,
    isCrit,
    killed,
  });

  addShockwave(
    state,
    enemy.x,
    enemy.y,
    isCrit ? 76 : 54,
    isCrit ? '#FDE047' : '#F97316',
  );
  addCallout(
    state,
    enemy.x,
    enemy.y - 24,
    isCrit ? `暴击 -${damage}` : `-${damage}`,
    isCrit ? '#FDE047' : '#FB923C',
    isCrit ? 1.3 : 1.05,
  );

  // Boss Phase 2 transition at 50% HP
  if (
    !enemy.dead &&
    enemy.archetype === 'taotie_boss' &&
    enemy.bossPhase === 1 &&
    enemy.hp <= enemy.maxHp * 0.5
  ) {
    enemy.bossPhase = 2;
    enemy.shield += 24;
    enemy.intent = scaleIntent(
      ENEMY_DEFS.taotie_boss.intents[3],
      state,
      2,
    );
    addCallout(state, enemy.x, enemy.y - 44, '玄铁饕餮 · 狂暴二阶段!', '#F59E0B', 1.2);
  }
}

function generateForgeRewards(state: ForgeRunState): ForgeRewardOption[] {
  const options: ForgeRewardOption[] = [];

  // Option 1: New Orb not currently saturated in deck
  const ownedTypes = new Set(state.deck.map((o) => o.typeId));
  const unseenOrbs = ORB_LIST.filter((o) => !ownedTypes.has(o.id));
  const orbPool = unseenOrbs.length > 0 ? unseenOrbs : ORB_LIST;
  const pickedOrb = orbPool[Math.floor(nextRand(state) * orbPool.length)];
  options.push({
    id: `rew_${allocUid(state)}`,
    kind: 'new_orb',
    title: `锻造 · ${pickedOrb.name}`,
    subtitle: pickedOrb.tag,
    description: pickedOrb.description,
    orbTypeId: pickedOrb.id,
  });

  // Option 2: New Relic (or Upgrade existing orb if all relics owned)
  const unownedRelics = RELIC_LIST.filter((r) => !state.relics.includes(r.id));
  if (unownedRelics.length > 0) {
    const pickedRelic =
      unownedRelics[Math.floor(nextRand(state) * unownedRelics.length)];
    options.push({
      id: `rew_${allocUid(state)}`,
      kind: 'relic',
      title: `铭刻 · ${pickedRelic.name}`,
      subtitle: pickedRelic.tag,
      description: pickedRelic.description,
      relicId: pickedRelic.id,
    });
  } else {
    const upgradable = state.deck.filter((o) => o.level < 3);
    const target = upgradable[0] ?? state.deck[0];
    const def = ORB_DEFS[target.typeId];
    options.push({
      id: `rew_${allocUid(state)}`,
      kind: 'upgrade_orb',
      title: `淬炼 · ${def.name} Lv.${Math.min(3, target.level + 1)}`,
      subtitle: '弹丸升阶',
      description: '基础伤害 +2，特殊触发效能显著增强，并修复 15 点炉心血量。',
      targetOrbUid: target.uid,
      orbTypeId: target.typeId,
      healAmount: 15,
    });
  }

  // Option 3: Upgrade an existing orb OR Temper Furnace (heal + maxHp)
  const upgradable = state.deck.filter((o) => o.level < 3);
  if (upgradable.length > 0 && state.hp > state.maxHp * 0.55) {
    const target = upgradable[Math.floor(nextRand(state) * upgradable.length)];
    const def = ORB_DEFS[target.typeId];
    options.push({
      id: `rew_${allocUid(state)}`,
      kind: 'upgrade_orb',
      title: `精炼 · ${def.name} → Lv.${target.level + 1}`,
      subtitle: '弹丸强化 + 回血',
      description: '将该弹丸锻造升阶（每击底伤 +2），同时修复 16 点炉心耐久。',
      targetOrbUid: target.uid,
      orbTypeId: target.typeId,
      healAmount: 16,
    });
  } else {
    options.push({
      id: `rew_${allocUid(state)}`,
      kind: 'temper_furnace',
      title: '重添旺炭 · 炉心修缮',
      subtitle: '耐久恢复 + 上限提升',
      description: '立刻恢复 28 点炉心耐久，并使最大炉心耐久永久 +10。',
      healAmount: 28,
      bonusMaxHp: 10,
    });
  }

  return options;
}

function handleStageCleared(
  state: ForgeRunState,
  events: SimEventBatch,
): void {
  events.stageCleared = true;
  state.score += Math.round(
    250 * (state.stageIndex + 1) * DIFFICULTY_DEFS[state.difficulty].scoreMult,
  );
  // Small breather recovery between stages
  state.hp = Math.min(state.maxHp, state.hp + 10);

  if (!state.isEndless && state.stageIndex >= CAMPAIGN_STAGE_COUNT - 1) {
    state.phase = 'victory';
    events.victory = true;
    state.summary = {
      outcome: 'victory',
      stageReached: state.stageIndex + 1,
      totalStages: CAMPAIGN_STAGE_COUNT,
      score: state.score,
      bestCombo: state.bestCombo,
      totalShots: state.totalShots,
      enemiesSlain: state.enemiesSlain,
      difficulty: state.difficulty,
      isEndless: state.isEndless,
    };
    return;
  }

  state.pendingRewards = generateForgeRewards(state);
  state.phase = 'forge_reward';
}

export function selectForgeReward(
  state: ForgeRunState,
  rewardIndex: number,
): boolean {
  if (state.phase !== 'forge_reward') return false;
  const opt = state.pendingRewards[rewardIndex];
  if (!opt) return false;

  if (opt.kind === 'new_orb' && opt.orbTypeId) {
    if (state.deck.length < 6) {
      state.deck.push({
        uid: `orb_${allocUid(state)}`,
        typeId: opt.orbTypeId,
        level: 1,
      });
    } else {
      // Upgrade existing matching orb or replace lowest-level iron core
      const existing = state.deck.find((o) => o.typeId === opt.orbTypeId && o.level < 3);
      if (existing) {
        existing.level += 1;
      } else {
        state.deck[0] = {
          uid: `orb_${allocUid(state)}`,
          typeId: opt.orbTypeId,
          level: 1,
        };
      }
    }
  } else if (opt.kind === 'relic' && opt.relicId) {
    if (!state.relics.includes(opt.relicId)) {
      state.relics.push(opt.relicId);
    }
  } else if (opt.kind === 'upgrade_orb' && opt.targetOrbUid) {
    const found = state.deck.find((o) => o.uid === opt.targetOrbUid);
    if (found && found.level < 3) {
      found.level += 1;
    }
    if (opt.healAmount) {
      state.hp = Math.min(state.maxHp, state.hp + opt.healAmount);
    }
  } else if (opt.kind === 'temper_furnace') {
    if (opt.bonusMaxHp) state.maxHp += opt.bonusMaxHp;
    if (opt.healAmount) {
      state.hp = Math.min(state.maxHp, state.hp + opt.healAmount);
    }
  }

  setupStageInPlace(state, state.stageIndex + 1);
  return true;
}

export function enterEndlessMode(state: ForgeRunState): boolean {
  if (state.phase !== 'victory') return false;
  state.isEndless = true;
  state.summary = null;
  state.pendingRewards = generateForgeRewards(state);
  state.phase = 'forge_reward';
  return true;
}

function executeEnemyAction(
  state: ForgeRunState,
  enemy: EnemyInstance,
  events: SimEventBatch,
): void {
  const intent = enemy.intent;
  enemy.attackAnim = 0.34;

  if (intent.kind === 'attack' || intent.kind === 'heavy_attack') {
    const chillMult = enemy.chilled ? 0.55 : 1.0;
    const rawDmg = Math.max(1, Math.round(intent.value * chillMult));
    let rem = rawDmg;
    if (state.shield > 0) {
      const blocked = Math.min(state.shield, rem);
      state.shield -= blocked;
      rem -= blocked;
      if (blocked > 0) {
        addCallout(state, WORLD_W / 2 - 42, CRUCIBLE_Y - 36, `格挡 ${blocked}`, '#60A5FA', 0.95);
      }
    }
    if (rem > 0) {
      state.hp = Math.max(0, state.hp - rem);
      state.playerHitFlash = 0.36;
      state.shakeTrauma = Math.min(1, state.shakeTrauma + 0.45);
      events.playerDamaged += rem;
      addCallout(state, WORLD_W / 2, CRUCIBLE_Y - 24, `炉心 -${rem}`, '#F87171', 1.2);
    }

    // Phoenix Ash rescue check
    if (state.hp <= 0 && hasRelic(state, 'phoenix_ash') && !state.phoenixUsed) {
      state.phoenixUsed = true;
      state.hp = Math.max(1, Math.round(state.maxHp * 0.35));
      for (const e of getLivingEnemies(state)) {
        e.shield = 0;
      }
      addCallout(state, WORLD_W / 2, WORLD_H / 2, '涅槃炉灰触发!', '#FDE047', 1.35);
    }
  } else if (intent.kind === 'defend') {
    enemy.shield += intent.value;
    addCallout(state, enemy.x, enemy.y - 24, `护甲 +${intent.value}`, '#60A5FA', 1.0);
  } else if (intent.kind === 'heal') {
    const allies = getLivingEnemies(state);
    for (const ally of allies) {
      const gain = Math.min(ally.maxHp - ally.hp, intent.value);
      ally.hp += gain;
    }
    addCallout(state, enemy.x, enemy.y - 24, `修补 +${intent.value}`, '#34D399', 1.0);
  } else if (intent.kind === 'freeze') {
    const candidates = state.pegs.filter((p) => !p.frozen && !p.lit);
    let count = Math.min(intent.value, candidates.length);
    while (count > 0 && candidates.length > 0) {
      const idx = Math.floor(nextRand(state) * candidates.length);
      const picked = candidates.splice(idx, 1)[0];
      picked.frozen = true;
      picked.flashTimer = 0.3;
      addShockwave(state, picked.x, picked.y, 38, '#38BDF8');
      count -= 1;
    }
    addCallout(state, enemy.x, enemy.y - 24, '冰封符钉!', '#38BDF8', 1.05);
  }

  enemy.chilled = false;
  const def = ENEMY_DEFS[enemy.archetype];
  enemy.intentIndex = (enemy.intentIndex + 1) % def.intents.length;
  enemy.intent = scaleIntent(def.intents[enemy.intentIndex], state, enemy.bossPhase);
}

function beginNextPlayerTurn(state: ForgeRunState): void {
  state.turnNumber += 1;
  state.activeOrbIndex = (state.activeOrbIndex + 1) % Math.max(1, state.deck.length);
  state.bellowsCharges = getMaxBellowsCharges(state);
  state.maxBellowsCharges = state.bellowsCharges;
  state.bellowsCooldown = 0;

  // Refresh board if fewer than 42% pegs are unlit
  const unlitCount = state.pegs.filter((p) => !p.lit).length;
  if (unlitCount < Math.max(6, Math.floor(state.pegs.length * 0.42))) {
    for (const peg of state.pegs) {
      peg.lit = false;
      peg.hitCount = 0;
    }
    addCallout(state, WORLD_W / 2, 340, '符钉重燃!', '#F59E0B', 1.15);
  }

  // Carry over half of unused shield + double_anvil bonus
  state.shield = Math.floor(state.shield * 0.5) + (hasRelic(state, 'double_anvil') ? 7 : 0);
  state.shotTally = createEmptyShotTally(state);
  state.phase = 'aiming';
}

export function stepSimulation(
  state: ForgeRunState,
  rawDt: number,
): SimEventBatch {
  const dt = Math.min(0.05, Math.max(0, rawDt));
  const events = createEmptyEvents();

  // Visual timers tick even during hitstop
  if (state.shakeTrauma > 0) {
    state.shakeTrauma = Math.max(0, state.shakeTrauma - dt * 1.9);
  }
  if (state.playerHitFlash > 0) {
    state.playerHitFlash = Math.max(0, state.playerHitFlash - dt);
  }

  for (const enemy of state.enemies) {
    if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    if (enemy.attackAnim > 0) enemy.attackAnim = Math.max(0, enemy.attackAnim - dt);
    if (enemy.dead && enemy.dyingTimer > 0) {
      enemy.dyingTimer = Math.max(0, enemy.dyingTimer - dt);
    }
  }

  for (let i = state.callouts.length - 1; i >= 0; i--) {
    const c = state.callouts[i];
    c.y += c.vy * dt;
    c.vy *= 0.94;
    c.life -= dt;
    if (c.life <= 0) state.callouts.splice(i, 1);
  }

  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const s = state.shockwaves[i];
    s.life -= dt;
    const t = 1 - Math.max(0, s.life) / s.maxLife;
    s.radius = 10 + (s.maxRadius - 10) * (1 - Math.pow(1 - t, 3));
    if (s.life <= 0) state.shockwaves.splice(i, 1);
  }

  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return events;
  }

  state.elapsedTime += dt;
  if (state.bellowsCooldown > 0) {
    state.bellowsCooldown = Math.max(0, state.bellowsCooldown - dt);
  }

  // Always animate board kinematics when in active combat phases
  if (
    state.phase === 'aiming' ||
    state.phase === 'firing' ||
    state.phase === 'volley' ||
    state.phase === 'enemy_turn'
  ) {
    updateBoardKinematics(state, dt);
  }

  if (state.phase === 'firing') {
    const subDt = dt / PHYSICS_SUBSTEPS;
    for (let step = 0; step < PHYSICS_SUBSTEPS; step++) {
      for (const ball of state.balls) {
        if (!ball.alive) continue;
        const orbDef = ORB_DEFS[ball.orbId];
        ball.age += subDt;

        // Magnetic pull for Thunder Magnet orb
        if (ball.orbId === 'thunder_mag') {
          let nearestPeg: PegEntity | null = null;
          let minD = 96;
          for (const peg of state.pegs) {
            if (peg.lit && !peg.frozen) continue;
            const d = Math.hypot(peg.x - ball.x, peg.y - ball.y);
            if (d < minD && d > 1) {
              minD = d;
              nearestPeg = peg;
            }
          }
          if (nearestPeg) {
            const dx = nearestPeg.x - ball.x;
            const dy = nearestPeg.y - ball.y;
            const pull = 340 * subDt;
            ball.vx += (dx / minD) * pull;
            ball.vy += (dy / minD) * pull;
          }
        }

        ball.vy += GRAVITY * orbDef.gravityScale * subDt;

        // Clamp max speed
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_BALL_SPEED) {
          const s = MAX_BALL_SPEED / speed;
          ball.vx *= s;
          ball.vy *= s;
        }

        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;

        // Anti-stuck safeguard
        if (speed < 34) {
          ball.stuckTimer += subDt;
          if (ball.stuckTimer > 0.55) {
            ball.vx += ball.x < WORLD_W / 2 ? 120 : -120;
            ball.vy -= 160;
            ball.stuckTimer = 0;
          }
        } else {
          ball.stuckTimer = 0;
        }

        // Side walls & top ceiling
        if (ball.x - ball.radius < BOARD_LEFT) {
          ball.x = BOARD_LEFT + ball.radius;
          ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
        } else if (ball.x + ball.radius > BOARD_RIGHT) {
          ball.x = BOARD_RIGHT - ball.radius;
          ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
        }
        if (ball.y - ball.radius < BOARD_TOP) {
          ball.y = BOARD_TOP + ball.radius;
          ball.vy = Math.abs(ball.vy) * 0.72;
        }

        // Rotating bumpers
        for (const bumper of state.bumpers) {
          collideBallWithBumper(ball, bumper);
        }

        // Peg collisions
        for (const peg of state.pegs) {
          const dx = ball.x - peg.x;
          const dy = ball.y - peg.y;
          const minDist = ball.radius + peg.radius;
          const distSq = dx * dx + dy * dy;
          if (distSq <= minDist * minDist) {
            const dist = Math.max(0.001, Math.sqrt(distSq));
            const nx = dx / dist;
            const ny = dy / dist;

            const shouldTrigger = !peg.lit || peg.frozen || peg.flashTimer <= 0.02;
            if (ball.pierceLeft > 0) {
              ball.pierceLeft -= 1;
              if (shouldTrigger) {
                triggerPegEffect(state, peg, ball, events, false);
              }
            } else {
              ball.x = peg.x + nx * (minDist + 0.4);
              ball.y = peg.y + ny * (minDist + 0.4);
              const dot = ball.vx * nx + ball.vy * ny;
              if (dot < 0) {
                ball.vx = (ball.vx - 2 * dot * nx) * orbDef.bounciness;
                ball.vy = (ball.vy - 2 * dot * ny) * orbDef.bounciness;
                // Ensure crisp minimum bounce speed so ball never dies on top of a peg
                const postSpeed = Math.hypot(ball.vx, ball.vy);
                if (postSpeed < 160) {
                  ball.vx += nx * 130;
                  ball.vy += ny * 130;
                }
              }
              if (shouldTrigger) {
                triggerPegEffect(state, peg, ball, events, false);
              }
            }
          }
        }

        // Check floor / crucible catch
        if (ball.y + ball.radius >= CRUCIBLE_Y || ball.age > 13.5) {
          const halfW = state.crucibleWidth / 2;
          const inCrucible =
            Math.abs(ball.x - state.crucibleX) <= halfW + ball.radius * 0.5 &&
            ball.age <= 13.5;

          if (inCrucible && !state.shotTally.crucibleBonus) {
            state.shotTally.crucibleBonus = true;
            state.shield += 6;
            state.shotTally.shieldGained += 6;
            events.crucibleCaught = true;
            addShockwave(state, ball.x, CRUCIBLE_Y, 72, '#FBBF24');
            addCallout(state, state.crucibleX, CRUCIBLE_Y - 26, '金盂接火 +35%!', '#FDE047', 1.2);
          }

          if (
            hasRelic(state, 'spark_rebound') &&
            !ball.reboundUsed &&
            ball.age <= 10
          ) {
            ball.reboundUsed = true;
            ball.y = CRUCIBLE_Y - ball.radius - 4;
            ball.vy = -560;
            ball.vx = ball.vx * 0.8 + (ball.x > WORLD_W / 2 ? -80 : 80);
            addShockwave(state, ball.x, CRUCIBLE_Y, 54, '#F97316');
            addCallout(state, ball.x, CRUCIBLE_Y - 20, '炉底回弹!', '#FB923C', 1.05);
          } else {
            ball.alive = false;
          }
        }
      }
    }

    // Record trails once per frame
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 14) ball.trail.shift();
    }

    if (state.balls.every((b) => !b.alive)) {
      state.balls = [];
      launchVolleyFromTally(state, events);
    }
  } else if (state.phase === 'volley') {
    for (let i = state.volleys.length - 1; i >= 0; i--) {
      const v = state.volleys[i];
      v.progress = Math.min(1, v.progress + dt / v.duration);
      const ease = 1 - Math.pow(1 - v.progress, 2);
      v.x = v.startX + (v.targetX - v.startX) * ease;
      v.y =
        v.startY +
        (v.targetY - v.startY) * ease -
        Math.sin(v.progress * Math.PI) * 34;

      if (v.progress >= 1) {
        const target = state.enemies.find((e) => e.uid === v.targetUid);
        if (target && !target.dead) {
          applyDamageToEnemy(state, target, v.damage, v.isCrit, events);
          if (v.appliesChill && !target.dead) {
            target.chilled = true;
          }
          if (v.leechRatio > 0) {
            const heal = Math.max(1, Math.round(v.damage * v.leechRatio));
            state.hp = Math.min(state.maxHp, state.hp + heal);
            addCallout(state, WORLD_W / 2, CRUCIBLE_Y - 30, `虹吸 +${heal}`, '#FB7185', 1.0);
          }
        }
        state.volleys.splice(i, 1);
      }
    }

    if (state.volleys.length === 0) {
      const living = getLivingEnemies(state);
      if (living.length === 0) {
        handleStageCleared(state, events);
      } else {
        state.phase = 'enemy_turn';
        state.enemyTurnActorIdx = 0;
        state.enemyTurnTimer = 0.24;
      }
    }
  } else if (state.phase === 'enemy_turn') {
    state.enemyTurnTimer -= dt;
    if (state.enemyTurnTimer <= 0) {
      const living = getLivingEnemies(state);
      if (state.enemyTurnActorIdx < living.length) {
        const actor = living[state.enemyTurnActorIdx];
        executeEnemyAction(state, actor, events);
        state.enemyTurnActorIdx += 1;
        state.enemyTurnTimer = 0.34;

        if (state.hp <= 0) {
          state.phase = 'defeat';
          events.defeat = true;
          state.summary = {
            outcome: 'defeat',
            stageReached: state.stageIndex + 1,
            totalStages: CAMPAIGN_STAGE_COUNT,
            score: state.score,
            bestCombo: state.bestCombo,
            totalShots: state.totalShots,
            enemiesSlain: state.enemiesSlain,
            difficulty: state.difficulty,
            isEndless: state.isEndless,
          };
          return events;
        }
      } else {
        beginNextPlayerTurn(state);
      }
    }
  }

  return events;
}
