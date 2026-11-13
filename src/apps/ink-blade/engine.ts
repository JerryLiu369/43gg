import {
  ARENA_H,
  ARENA_W,
  BOON_DEFS,
  ENEMY_ARCHETYPES,
  STAGES,
} from './content.ts';
import type {
  ArenaObstacle,
  BoonId,
  EnemyArchetypeId,
  EnemyEntity,
  InkBladeRunState,
  PlayerInputFrame,
  PlayerState,
  PowderJar,
  ProjectileEntity,
  SimulationEvents,
  StageDef,
  Vec2,
} from './types.ts';

export const PLAYER_RADIUS = 16;
export const BASE_PLAYER_SPEED = 255;
export const BASE_SLASH_RANGE = 240;
export const BASE_SLASH_WIDTH = 36;
export const BASE_SLASH_COOLDOWN = 0.82;
export const BASE_PARRY_WINDOW = 0.27;
export const BASE_PARRY_COOLDOWN = 0.72;
export const MAX_CONCURRENT_TOKENS = 3;
export const JAR_BLAST_RADIUS = 128;

interface PendingWake {
  runStage: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  timer: number;
}

const pendingWakesByRun = new WeakMap<InkBladeRunState, PendingWake[]>();

function getPendingWakes(state: InkBladeRunState): PendingWake[] {
  let list = pendingWakesByRun.get(state);
  if (!list) {
    list = [];
    pendingWakesByRun.set(state, list);
  }
  return list;
}

export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  state.rngState = t >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function normalizeAngle(a: number): number {
  let res = a;
  while (res > Math.PI) res -= Math.PI * 2;
  while (res < -Math.PI) res += Math.PI * 2;
  return res;
}

export function angleDiff(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dSq: number; t: number; closestX: number; closestY: number } {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-6) {
    return { dSq: distSq(px, py, x1, y1), t: 0, closestX: x1, closestY: y1 };
  }
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / lenSq, 0, 1);
  const cx = x1 + vx * t;
  const cy = y1 + vy * t;
  return { dSq: distSq(px, py, cx, cy), t, closestX: cx, closestY: cy };
}

export function collideCircleWithRect(
  cx: number,
  cy: number,
  r: number,
  rect: ArenaObstacle,
): { x: number; y: number; hit: boolean } {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dSq = dx * dx + dy * dy;
  if (dSq >= r * r) {
    return { x: cx, y: cy, hit: false };
  }
  if (dSq > 1e-6) {
    const d = Math.sqrt(dSq);
    const push = r - d;
    return {
      x: cx + (dx / d) * push,
      y: cy + (dy / d) * push,
      hit: true,
    };
  }
  // Center is inside rect: push out along nearest edge
  const leftPen = cx - rect.x;
  const rightPen = rect.x + rect.w - cx;
  const topPen = cy - rect.y;
  const bottomPen = rect.y + rect.h - cy;
  const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
  if (minPen === leftPen) return { x: rect.x - r, y: cy, hit: true };
  if (minPen === rightPen) return { x: rect.x + rect.w + r, y: cy, hit: true };
  if (minPen === topPen) return { x: cx, y: rect.y - r, hit: true };
  return { x: cx, y: rect.y + rect.h + r, hit: true };
}

export function resolveActorPosition(
  x: number,
  y: number,
  radius: number,
  arenaW: number,
  arenaH: number,
  obstacles: ArenaObstacle[],
): Vec2 {
  const margin = 34;
  let nx = clamp(x, margin + radius, arenaW - margin - radius);
  let ny = clamp(y, margin + radius, arenaH - margin - radius);
  for (const obs of obstacles) {
    if (!obs.blocksMovement) continue;
    const res = collideCircleWithRect(nx, ny, radius, obs);
    nx = res.x;
    ny = res.y;
  }
  nx = clamp(nx, margin + radius, arenaW - margin - radius);
  ny = clamp(ny, margin + radius, arenaH - margin - radius);
  return { x: nx, y: ny };
}

export function raycastObstacles(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: ArenaObstacle[],
  mode: 'movement' | 'projectile',
  padding = 0,
): { blocked: boolean; hitT: number; stopX: number; stopY: number; obstacle?: ArenaObstacle } {
  let bestT = 1;
  let hitObs: ArenaObstacle | undefined;
  const dx = x2 - x1;
  const dy = y2 - y1;

  for (const obs of obstacles) {
    if (mode === 'movement' && !obs.blocksMovement) continue;
    if (mode === 'projectile' && !obs.blocksProjectiles) continue;

    const minX = obs.x - padding;
    const maxX = obs.x + obs.w + padding;
    const minY = obs.y - padding;
    const maxY = obs.y + obs.h + padding;

    // Slab intersection
    let tmin = 0;
    let tmax = bestT;

    if (Math.abs(dx) < 1e-8) {
      if (x1 < minX || x1 > maxX) continue;
    } else {
      const invX = 1 / dx;
      let t1 = (minX - x1) * invX;
      let t2 = (maxX - x1) * invX;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-8) {
      if (y1 < minY || y1 > maxY) continue;
    } else {
      const invY = 1 / dy;
      let t1 = (minY - y1) * invY;
      let t2 = (maxY - y1) * invY;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin < bestT && tmin >= 0) {
      bestT = tmin;
      hitObs = obs;
    }
  }

  if (hitObs) {
    const safeT = Math.max(0, bestT - 0.02);
    return {
      blocked: true,
      hitT: bestT,
      stopX: x1 + dx * safeT,
      stopY: y1 + dy * safeT,
      obstacle: hitObs,
    };
  }

  return { blocked: false, hitT: 1, stopX: x2, stopY: y2 };
}

export function getActiveStageDef(state: InkBladeRunState): StageDef {
  return STAGES[clamp(state.stageIndex, 0, STAGES.length - 1)];
}

export function hasBoon(state: InkBladeRunState, id: BoonId): boolean {
  return state.boons.includes(id);
}

export function getPlayerSlashRange(state: InkBladeRunState): number {
  return BASE_SLASH_RANGE * (hasBoon(state, 'wide_crescent') ? 1.22 : 1);
}

export function getPlayerSlashWidth(state: InkBladeRunState): number {
  return BASE_SLASH_WIDTH * (hasBoon(state, 'wide_crescent') ? 1.45 : 1);
}

export function getComboWindowSec(state: InkBladeRunState): number {
  return hasBoon(state, 'relentless_edge') ? 6.0 : 3.8;
}

export function createEmptyEvents(): SimulationEvents {
  return {
    playerSlashed: false,
    chainResetTriggered: false,
    perfectDeflectCount: 0,
    enemiesHit: 0,
    enemiesKilled: 0,
    shieldBrokenCount: 0,
    jarExplodedCount: 0,
    playerDamaged: false,
    enemyTelegraphStarted: false,
    waveCleared: false,
    stageCleared: false,
    bossPhaseShifted: false,
    runVictory: false,
    runDefeat: false,
    decalCommands: [],
  };
}

function createInitialPlayer(spawn: Vec2, boons: BoonId[] = [], prevHp?: number): PlayerState {
  const maxHp = 5 + (boons.includes('crimson_siphon') ? 1 : 0);
  const maxFocus = boons.includes('deep_mind') ? 140 : 100;
  const maxSlashCooldown = boons.includes('wind_stride')
    ? BASE_SLASH_COOLDOWN * 0.72
    : BASE_SLASH_COOLDOWN;

  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: 0,
    hp: prevHp !== undefined ? clamp(prevHp, 1, maxHp) : maxHp,
    maxHp,
    focus: maxFocus,
    maxFocus,
    slashCooldown: 0,
    maxSlashCooldown,
    parryCooldown: 0,
    parryActiveTimer: 0,
    invulnTimer: 0.6,
    dashTimer: 0,
    mindsEyeActive: false,
    slashBufferTimer: 0,
    parryBufferTimer: 0,
    scaleX: 1,
    scaleY: 1,
    gaitDist: 0,
    hitFlashTimer: 0,
    isenReadyFlash: 0,
  };
}

function cloneStageObstacles(stage: StageDef): ArenaObstacle[] {
  return stage.obstacles.map((o) => ({ ...o }));
}

function cloneStageJars(stage: StageDef): PowderJar[] {
  return stage.initialJars.map((j, idx) => ({
    id: `${stage.id}_jar_${idx}`,
    x: j.x,
    y: j.y,
    radius: 17,
    triggered: false,
    fuseTimer: 0,
    exploded: false,
  }));
}

function pickSpawnPosition(
  state: InkBladeRunState,
  archetype: EnemyArchetypeId,
  indexInWave: number,
  totalInWave: number,
): Vec2 {
  if (archetype === 'shogun_boss') {
    const resolved = resolveActorPosition(
      900,
      370,
      ENEMY_ARCHETYPES.shogun_boss.radius,
      state.arenaWidth,
      state.arenaHeight,
      state.obstacles,
    );
    return resolved;
  }

  const radius = ENEMY_ARCHETYPES[archetype].radius;
  const baseAngle =
    (indexInWave / Math.max(1, totalInWave)) * Math.PI * 2 +
    nextRandom(state) * 0.45;

  for (let attempt = 0; attempt < 18; attempt++) {
    const angle = baseAngle + attempt * 0.37;
    const distFromCenter = 340 + (attempt % 3) * 55;
    const rawX = state.arenaWidth * 0.5 + Math.cos(angle) * distFromCenter;
    const rawY = state.arenaHeight * 0.5 + Math.sin(angle) * (distFromCenter * 0.68);
    const candidate = resolveActorPosition(
      rawX,
      rawY,
      radius,
      state.arenaWidth,
      state.arenaHeight,
      state.obstacles,
    );

    const distToPlayer = Math.hypot(
      candidate.x - state.player.x,
      candidate.y - state.player.y,
    );
    if (distToPlayer >= 250) {
      return candidate;
    }
  }

  return resolveActorPosition(
    state.player.x > state.arenaWidth * 0.5 ? 140 : state.arenaWidth - 140,
    140 + (indexInWave % 4) * 145,
    radius,
    state.arenaWidth,
    state.arenaHeight,
    state.obstacles,
  );
}

export function spawnWaveEnemies(state: InkBladeRunState): void {
  const stage = getActiveStageDef(state);
  const waveTemplate = stage.waves[clamp(state.waveIndex, 0, stage.waves.length - 1)];
  const flatList: EnemyArchetypeId[] = [];

  for (const entry of waveTemplate) {
    const extraCount = state.isEndless ? Math.min(3, state.endlessLoop) : 0;
    const total =
      entry.archetype === 'shogun_boss' ? entry.count : entry.count + extraCount;
    for (let i = 0; i < total; i++) {
      flatList.push(entry.archetype);
    }
  }

  state.enemies = flatList.map((arch, idx) => {
    const def = ENEMY_ARCHETYPES[arch];
    const pos = pickSpawnPosition(state, arch, idx, flatList.length);
    const hpScale = state.isEndless ? 1 + state.endlessLoop * 0.35 : 1;
    const scaledHp = Math.max(1, Math.round(def.maxHp * hpScale));
    const facing = Math.atan2(state.player.y - pos.y, state.player.x - pos.x);
    return {
      uid: state.nextUid++,
      archetype: arch,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      facing,
      hp: scaledHp,
      maxHp: scaledHp,
      radius: def.radius,
      frontalShield: def.frontalShield,
      shieldBroken: false,
      aiPhase: 'spawning',
      phaseTimer: 0.75 + (idx % 3) * 0.14,
      attackCooldown: 0.75 + nextRandom(state) * 0.65,
      lockedAngle: facing,
      lockedTargetX: state.player.x,
      lockedTargetY: state.player.y,
      orbitSign: idx % 2 === 0 ? 1 : -1,
      hasAttackToken: false,
      hitFlashTimer: 0,
      gaitDist: 0,
      bossPhase: 1,
      koProgress: 0,
    };
  });
}

export function createNewRun(
  startStageIndex = 0,
  isEndless = false,
  seed = Date.now() >>> 0,
): InkBladeRunState {
  const clampedStage = clamp(startStageIndex, 0, STAGES.length - 1);
  const stage = STAGES[clampedStage];

  const state: InkBladeRunState = {
    seed,
    rngState: (seed ^ 0x9e3779b9) >>> 0,
    nextUid: 1,
    isEndless,
    endlessLoop: isEndless ? 1 : 0,
    phase: 'fighting',
    stageIndex: clampedStage,
    waveIndex: 0,
    arenaWidth: stage.arenaWidth,
    arenaHeight: stage.arenaHeight,

    elapsedSec: 0,
    hitstopTimer: 0,
    cameraTrauma: 0,
    phaseTransitionTimer: 0,
    lightningFlash: 0,

    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    deflects: 0,
    damageTaken: 0,

    boons: [],
    pendingBoonChoices: [],

    player: createInitialPlayer(stage.playerSpawn),
    obstacles: cloneStageObstacles(stage),
    jars: cloneStageJars(stage),
    enemies: [],
    projectiles: [],
    slashArcs: [],
    shockwaves: [],
    callouts: [],
    summarySnapshot: null,
  };

  spawnWaveEnemies(state);
  return state;
}

export interface SlashPreview {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
  targetEnemyUids: number[];
  blockedByShieldUids: number[];
  targetJarIds: string[];
}

export function computeSlashPreview(
  state: InkBladeRunState,
  aimWorldX: number,
  aimWorldY: number,
): SlashPreview {
  const p = state.player;
  const dx = aimWorldX - p.x;
  const dy = aimWorldY - p.y;
  const angle = Math.hypot(dx, dy) > 4 ? Math.atan2(dy, dx) : p.facing;
  const range = getPlayerSlashRange(state);
  const rawEndX = p.x + Math.cos(angle) * range;
  const rawEndY = p.y + Math.sin(angle) * range;

  const ray = raycastObstacles(
    p.x,
    p.y,
    rawEndX,
    rawEndY,
    state.obstacles,
    'movement',
    PLAYER_RADIUS * 0.75,
  );
  // If blocked only by a destructible lantern, blade slices right through it!
  let destX = ray.stopX;
  let destY = ray.stopY;
  if (ray.blocked && ray.obstacle?.destructible) {
    destX = rawEndX;
    destY = rawEndY;
  }
  const clamped = resolveActorPosition(
    destX,
    destY,
    PLAYER_RADIUS,
    state.arenaWidth,
    state.arenaHeight,
    state.obstacles.filter((o) => !o.destructible),
  );

  const sweepRadius = getPlayerSlashWidth(state);
  const targetEnemyUids: number[] = [];
  const blockedByShieldUids: number[] = [];

  for (const e of state.enemies) {
    if (e.aiPhase === 'dying') continue;
    const hit = pointToSegmentDistSq(e.x, e.y, p.x, p.y, clamped.x, clamped.y);
    const reach = sweepRadius + e.radius;
    if (hit.dSq <= reach * reach) {
      const attackFromAngle = Math.atan2(p.y - e.y, p.x - e.x);
      const isFrontHit =
        e.frontalShield &&
        !e.shieldBroken &&
        angleDiff(e.facing, attackFromAngle) < 1.15 &&
        !hasBoon(state, 'iron_breaker');
      if (isFrontHit) {
        blockedByShieldUids.push(e.uid);
      } else {
        targetEnemyUids.push(e.uid);
      }
    }
  }

  const targetJarIds: string[] = [];
  for (const jar of state.jars) {
    if (jar.exploded) continue;
    const hit = pointToSegmentDistSq(jar.x, jar.y, p.x, p.y, clamped.x, clamped.y);
    const reach = sweepRadius + jar.radius;
    if (hit.dSq <= reach * reach) {
      targetJarIds.push(jar.id);
    }
  }

  return {
    startX: p.x,
    startY: p.y,
    endX: clamped.x,
    endY: clamped.y,
    angle,
    targetEnemyUids,
    blockedByShieldUids,
    targetJarIds,
  };
}

function addCallout(
  state: InkBladeRunState,
  x: number,
  y: number,
  text: string,
  colorHex: string,
): void {
  state.callouts.push({
    x,
    y,
    vy: -42,
    text,
    colorHex,
    life: 0.78,
    maxLife: 0.78,
  });
  if (state.callouts.length > 24) {
    state.callouts.shift();
  }
}

function incrementCombo(state: InkBladeRunState, amount = 1): void {
  const prevCombo = state.combo;
  state.combo += amount;
  state.comboTimer = getComboWindowSec(state);
  if (state.combo > state.maxCombo) {
    state.maxCombo = state.combo;
  }
  if (
    hasBoon(state, 'crimson_siphon') &&
    Math.floor(state.combo / 8) > Math.floor(prevCombo / 8) &&
    state.player.hp < state.player.maxHp
  ) {
    state.player.hp += 1;
    addCallout(state, state.player.x, state.player.y - 26, '血墨归元 +1', '#B91C1C');
  }
}

function damageEnemy(
  state: InkBladeRunState,
  enemy: EnemyEntity,
  dmg: number,
  knockAngle: number,
  knockSpeed: number,
  events: SimulationEvents,
  fromDirectSlash: boolean,
): boolean {
  if (enemy.aiPhase === 'dying') return false;

  enemy.hp -= dmg;
  enemy.hitFlashTimer = 0.08;
  events.enemiesHit += 1;

  const kbScale = enemy.archetype === 'shogun_boss' ? 0.25 : 1;
  enemy.vx += Math.cos(knockAngle) * knockSpeed * kbScale;
  enemy.vy += Math.sin(knockAngle) * knockSpeed * kbScale;

  events.decalCommands.push({
    kind: 'splatter',
    x: enemy.x,
    y: enemy.y,
    angle: knockAngle,
    scale: enemy.archetype === 'shogun_boss' ? 1.35 : 0.9,
    colorHex: '#1C1917',
  });

  // Check Boss phase 2 transition at <= 50% HP
  if (
    enemy.archetype === 'shogun_boss' &&
    enemy.bossPhase === 1 &&
    enemy.hp > 0 &&
    enemy.hp <= enemy.maxHp * 0.5
  ) {
    enemy.bossPhase = 2;
    enemy.shieldBroken = true;
    enemy.aiPhase = 'recovery';
    enemy.phaseTimer = 0.55;
    enemy.hasAttackToken = false;
    state.hitstopTimer = Math.max(state.hitstopTimer, 0.09);
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.65);
    state.lightningFlash = 0.9;
    events.bossPhaseShifted = true;
    state.shockwaves.push({
      x: enemy.x,
      y: enemy.y,
      radius: 24,
      maxRadius: 240,
      life: 0.45,
      maxLife: 0.45,
      colorHex: '#B91C1C',
      lineWidth: 5,
    });
    addCallout(state, enemy.x, enemy.y - 38, '狂澜破甲 · 二段觉醒', '#B91C1C');
  }

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.aiPhase = 'dying';
    enemy.phaseTimer = 0.34;
    enemy.hasAttackToken = false;
    enemy.koProgress = 0;

    state.kills += 1;
    events.enemiesKilled += 1;
    incrementCombo(state, 1);

    const def = ENEMY_ARCHETYPES[enemy.archetype];
    const comboMult = 1 + Math.min(2.5, state.combo * 0.15);
    state.score += Math.round(def.scoreValue * comboMult);

    events.decalCommands.push({
      kind: 'splatter',
      x: enemy.x,
      y: enemy.y,
      angle: knockAngle,
      scale: 1.35,
      colorHex: '#991B1B',
    });
    events.decalCommands.push({
      kind: 'fallen_hat',
      x: enemy.x + Math.cos(knockAngle) * 18,
      y: enemy.y + Math.sin(knockAngle) * 18,
      angle: knockAngle + 0.6,
      scale: enemy.archetype === 'shogun_boss' ? 1.4 : 1,
      colorHex: def.coatHex,
    });

    if (fromDirectSlash && hasBoon(state, 'volatile_spark')) {
      state.shockwaves.push({
        x: enemy.x,
        y: enemy.y,
        radius: 14,
        maxRadius: 105,
        life: 0.28,
        maxLife: 0.28,
        colorHex: '#EA580C',
        lineWidth: 3.5,
      });
      for (const other of state.enemies) {
        if (other.uid === enemy.uid || other.aiPhase === 'dying') continue;
        if (distSq(enemy.x, enemy.y, other.x, other.y) <= 105 * 105) {
          damageEnemy(
            state,
            other,
            1,
            Math.atan2(other.y - enemy.y, other.x - enemy.x),
            190,
            events,
            false,
          );
        }
      }
    }

    return true;
  }

  return false;
}

function detonatePowderJar(
  state: InkBladeRunState,
  jar: PowderJar,
  events: SimulationEvents,
): void {
  if (jar.exploded) return;
  jar.exploded = true;
  jar.triggered = false;
  events.jarExplodedCount += 1;
  state.hitstopTimer = Math.max(state.hitstopTimer, 0.055);
  state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.55);

  state.shockwaves.push({
    x: jar.x,
    y: jar.y,
    radius: 18,
    maxRadius: JAR_BLAST_RADIUS,
    life: 0.34,
    maxLife: 0.34,
    colorHex: '#EA580C',
    lineWidth: 5,
  });

  events.decalCommands.push({
    kind: 'scorch',
    x: jar.x,
    y: jar.y,
    angle: 0,
    scale: 1.25,
    colorHex: '#1C1917',
  });

  addCallout(state, jar.x, jar.y - 22, '火瓮轰烈!', '#EA580C');

  // Shatter nearby destructible lanterns
  state.obstacles = state.obstacles.filter((obs) => {
    if (!obs.destructible) return true;
    const cx = obs.x + obs.w * 0.5;
    const cy = obs.y + obs.h * 0.5;
    if (distSq(jar.x, jar.y, cx, cy) <= (JAR_BLAST_RADIUS + 26) ** 2) {
      events.decalCommands.push({
        kind: 'scorch',
        x: cx,
        y: cy,
        angle: 0,
        scale: 0.7,
        colorHex: '#44403C',
      });
      return false;
    }
    return true;
  });

  // Chain-trigger adjacent jars
  for (const otherJar of state.jars) {
    if (otherJar.exploded || otherJar.triggered) continue;
    if (distSq(jar.x, jar.y, otherJar.x, otherJar.y) <= (JAR_BLAST_RADIUS + 25) ** 2) {
      otherJar.triggered = true;
      otherJar.fuseTimer = 0.1;
    }
  }

  // Heavy AoE damage & shield break on enemies
  let anyKill = false;
  for (const enemy of state.enemies) {
    if (enemy.aiPhase === 'dying') continue;
    const reach = JAR_BLAST_RADIUS + enemy.radius;
    if (distSq(jar.x, jar.y, enemy.x, enemy.y) <= reach * reach) {
      if (enemy.frontalShield && !enemy.shieldBroken) {
        enemy.shieldBroken = true;
        events.shieldBrokenCount += 1;
        addCallout(state, enemy.x, enemy.y - 30, '玄甲震碎!', '#D97706');
      }
      const ang = Math.atan2(enemy.y - jar.y, enemy.x - jar.x);
      const killed = damageEnemy(state, enemy, 3, ang, 340, events, false);
      if (killed) anyKill = true;
    }
  }

  if (anyKill) {
    state.player.slashCooldown = 0;
    state.player.isenReadyFlash = 0.35;
    events.chainResetTriggered = true;
  }
}

export function executeSlashDash(
  state: InkBladeRunState,
  aimWorldX: number,
  aimWorldY: number,
  events: SimulationEvents,
): boolean {
  const p = state.player;
  if (p.slashCooldown > 0 || state.phase !== 'fighting') return false;

  const preview = computeSlashPreview(state, aimWorldX, aimWorldY);
  const { startX, startY, endX, endY, angle } = preview;

  p.facing = angle;
  p.x = endX;
  p.y = endY;
  p.vx = Math.cos(angle) * 140;
  p.vy = Math.sin(angle) * 140;
  p.slashCooldown = p.maxSlashCooldown;
  p.dashTimer = 0.14;
  p.invulnTimer = Math.max(p.invulnTimer, 0.18);
  p.mindsEyeActive = false;
  p.slashBufferTimer = 0;
  p.scaleX = 1.28;
  p.scaleY = 0.76;

  events.playerSlashed = true;
  events.decalCommands.push({
    kind: 'slash_scuff',
    x: (startX + endX) * 0.5,
    y: (startY + endY) * 0.5,
    angle,
    scale: 1,
    colorHex: '#292524',
  });

  const sweepWidth = getPlayerSlashWidth(state);

  // Shatter destructible stone lanterns along blade path
  state.obstacles = state.obstacles.filter((obs) => {
    if (!obs.destructible) return true;
    const cx = obs.x + obs.w * 0.5;
    const cy = obs.y + obs.h * 0.5;
    const hit = pointToSegmentDistSq(cx, cy, startX, startY, endX, endY);
    if (hit.dSq <= (sweepWidth + obs.w * 0.5) ** 2) {
      events.decalCommands.push({
        kind: 'scorch',
        x: cx,
        y: cy,
        angle,
        scale: 0.65,
        colorHex: '#57534E',
      });
      return false;
    }
    return true;
  });

  // Trigger powder jars along blade path
  for (const jar of state.jars) {
    if (jar.exploded) continue;
    const hit = pointToSegmentDistSq(jar.x, jar.y, startX, startY, endX, endY);
    if (hit.dSq <= (sweepWidth + jar.radius) ** 2) {
      detonatePowderJar(state, jar, events);
    }
  }

  // Cut down hostile bolts along path
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    if (proj.owner !== 'enemy') continue;
    const hit = pointToSegmentDistSq(proj.x, proj.y, startX, startY, endX, endY);
    if (hit.dSq <= (sweepWidth + proj.radius + 6) ** 2) {
      state.projectiles.splice(i, 1);
      state.score += 25;
    }
  }

  let baseDamage = 2;
  if (hasBoon(state, 'executioner_seal') && state.combo >= 3) {
    baseDamage += 1;
  }

  let triggeredReset = false;

  for (const enemy of state.enemies) {
    if (enemy.aiPhase === 'dying') continue;
    const hit = pointToSegmentDistSq(enemy.x, enemy.y, startX, startY, endX, endY);
    const reach = sweepWidth + enemy.radius;
    if (hit.dSq > reach * reach) continue;

    const attackFromAngle = Math.atan2(startY - enemy.y, startX - enemy.x);
    const hitFrontCone = angleDiff(enemy.facing, attackFromAngle) < 1.15;

    if (enemy.frontalShield && !enemy.shieldBroken && hitFrontCone) {
      if (hasBoon(state, 'iron_breaker')) {
        enemy.shieldBroken = true;
        enemy.aiPhase = 'staggered';
        enemy.phaseTimer = 1.1;
        enemy.hasAttackToken = false;
        events.shieldBrokenCount += 1;
        triggeredReset = true;
        addCallout(state, enemy.x, enemy.y - 30, '断岳破甲!', '#D97706');
        const killed = damageEnemy(
          state,
          enemy,
          baseDamage + 1,
          angle,
          240,
          events,
          true,
        );
        if (killed) triggeredReset = true;
      } else {
        // Blocked by frontal heavy shield!
        enemy.hitFlashTimer = 0.08;
        state.hitstopTimer = Math.max(state.hitstopTimer, 0.035);
        state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.22);
        p.vx = -Math.cos(angle) * 210;
        p.vy = -Math.sin(angle) * 210;
        addCallout(state, enemy.x, enemy.y - 28, '正面玄甲 · 宜绕背!', '#78716C');
      }
      continue;
    }

    // Backstab / flank on shielded enemy cracks their shield immediately!
    let finalDmg = baseDamage;
    if (enemy.frontalShield && !enemy.shieldBroken && !hitFrontCone) {
      enemy.shieldBroken = true;
      events.shieldBrokenCount += 1;
      finalDmg += 1;
      triggeredReset = true;
      addCallout(state, enemy.x, enemy.y - 32, '背袭破甲!', '#C2410C');
    } else if (
      hasBoon(state, 'iron_breaker') &&
      (enemy.archetype === 'ironclad' || enemy.archetype === 'shogun_boss')
    ) {
      finalDmg += 1;
    }

    const killed = damageEnemy(state, enemy, finalDmg, angle, 260, events, true);
    if (killed) {
      triggeredReset = true;
    }
  }

  if (triggeredReset) {
    p.slashCooldown = 0;
    p.focus = Math.min(p.maxFocus, p.focus + 30);
    p.isenReadyFlash = 0.38;
    events.chainResetTriggered = true;
    state.hitstopTimer = Math.max(state.hitstopTimer, 0.048);
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.36);
    addCallout(state, p.x, p.y - 30, '一闪刷新!', '#C2410C');
  } else {
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.14);
  }

  state.slashArcs.push({
    id: state.nextUid++,
    startX,
    startY,
    endX,
    endY,
    angle,
    width: sweepWidth,
    life: 0.28,
    maxLife: 0.28,
    isChainReset: triggeredReset,
    isThunderWake: false,
  });

  if (hasBoon(state, 'thunder_wake')) {
    getPendingWakes(state).push({
      runStage: state.stageIndex,
      startX,
      startY,
      endX,
      endY,
      timer: 0.22,
    });
  }

  return true;
}

export function executeParryStance(
  state: InkBladeRunState,
  input: PlayerInputFrame,
  events: SimulationEvents,
): boolean {
  const p = state.player;
  if (p.parryCooldown > 0 || state.phase !== 'fighting') return false;

  const hasPhantom = hasBoon(state, 'phantom_step');
  p.parryActiveTimer = BASE_PARRY_WINDOW * (hasPhantom ? 1.35 : 1);
  p.parryCooldown = BASE_PARRY_COOLDOWN * (hasPhantom ? 0.75 : 1);
  p.parryBufferTimer = 0;
  p.mindsEyeActive = false;

  // Short micro-step in move direction (or toward cursor) to allow phasing behind shields
  const hasMove = Math.hypot(input.moveX, input.moveY) > 0.1;
  const stepAngle = hasMove
    ? Math.atan2(input.moveY, input.moveX)
    : Math.atan2(input.aimWorldY - p.y, input.aimWorldX - p.x);
  const stepDist = hasPhantom ? 68 : 48;
  p.vx = Math.cos(stepAngle) * (stepDist / 0.14);
  p.vy = Math.sin(stepAngle) * (stepDist / 0.14);
  p.invulnTimer = Math.max(p.invulnTimer, p.parryActiveTimer);
  p.scaleX = 0.88;
  p.scaleY = 1.14;

  state.shockwaves.push({
    x: p.x,
    y: p.y,
    radius: 22,
    maxRadius: 56,
    life: p.parryActiveTimer,
    maxLife: p.parryActiveTimer,
    colorHex: '#D97706',
    lineWidth: 3,
  });

  // Immediately check any incoming projectiles already inside the ward radius!
  deflectNearbyProjectiles(state, events);
  return true;
}

function findNearestEnemyAngle(
  state: InkBladeRunState,
  fromX: number,
  fromY: number,
  fallbackAngle: number,
): number {
  let bestDistSq = Infinity;
  let bestAngle = fallbackAngle;
  for (const e of state.enemies) {
    if (e.aiPhase === 'dying') continue;
    const d2 = distSq(fromX, fromY, e.x, e.y);
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestAngle = Math.atan2(e.y - fromY, e.x - fromX);
    }
  }
  return bestAngle;
}

function triggerDeflectReward(
  state: InkBladeRunState,
  x: number,
  y: number,
  events: SimulationEvents,
): void {
  const p = state.player;
  events.perfectDeflectCount += 1;
  events.chainResetTriggered = true;
  state.deflects += 1;
  incrementCombo(state, 1);
  state.score += 180;

  p.slashCooldown = 0;
  p.isenReadyFlash = 0.42;
  p.focus = hasBoon(state, 'mirror_ward')
    ? p.maxFocus
    : Math.min(p.maxFocus, p.focus + 45);
  p.invulnTimer = Math.max(p.invulnTimer, 0.32);

  state.hitstopTimer = Math.max(state.hitstopTimer, 0.065);
  state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.45);

  const wardRadius = hasBoon(state, 'mirror_ward') ? 165 : 88;
  state.shockwaves.push({
    x,
    y,
    radius: 16,
    maxRadius: wardRadius,
    life: 0.3,
    maxLife: 0.3,
    colorHex: '#F59E0B',
    lineWidth: 4.5,
  });

  if (hasBoon(state, 'mirror_ward')) {
    for (const e of state.enemies) {
      if (e.aiPhase === 'dying') continue;
      if (distSq(p.x, p.y, e.x, e.y) <= wardRadius * wardRadius) {
        e.aiPhase = 'staggered';
        e.phaseTimer = 1.8;
        e.hasAttackToken = false;
        e.shieldBroken = true;
      }
    }
  }

  addCallout(state, p.x, p.y - 34, '刹那弹反!', '#D97706');
}

function deflectNearbyProjectiles(
  state: InkBladeRunState,
  events: SimulationEvents,
): void {
  const p = state.player;
  if (p.parryActiveTimer <= 0) return;
  const deflectRadius = 60;

  const extraProjectiles: ProjectileEntity[] = [];

  for (const proj of state.projectiles) {
    if (proj.owner !== 'enemy') continue;
    const reach = deflectRadius + proj.radius;
    if (distSq(p.x, p.y, proj.x, proj.y) <= reach * reach) {
      const reverseAngle = Math.atan2(-proj.vy, -proj.vx);
      const aimAngle = findNearestEnemyAngle(state, proj.x, proj.y, reverseAngle);
      const speed = Math.max(820, Math.hypot(proj.vx, proj.vy) * 2.35);

      proj.owner = 'player';
      proj.kind = 'bolt';
      proj.deflected = true;
      proj.vx = Math.cos(aimAngle) * speed;
      proj.vy = Math.sin(aimAngle) * speed;
      proj.damage = 3;
      proj.pierceLeft = 2;
      proj.life = 1.35;
      proj.maxLife = 1.35;
      proj.targetX = undefined;
      proj.targetY = undefined;

      triggerDeflectReward(state, proj.x, proj.y, events);

      if (hasBoon(state, 'split_swallow')) {
        for (const offset of [-0.24, 0.24]) {
          const ang = aimAngle + offset;
          extraProjectiles.push({
            uid: state.nextUid++,
            kind: 'blade_wave',
            owner: 'player',
            x: proj.x,
            y: proj.y,
            vx: Math.cos(ang) * (speed * 0.92),
            vy: Math.sin(ang) * (speed * 0.92),
            radius: 9,
            damage: 2,
            life: 1.0,
            maxLife: 1.0,
            deflected: true,
            pierceLeft: 1,
          });
        }
      }
    }
  }

  if (extraProjectiles.length > 0) {
    state.projectiles.push(...extraProjectiles);
  }
}

function applyPlayerDamage(
  state: InkBladeRunState,
  dmg: number,
  sourceX: number,
  sourceY: number,
  events: SimulationEvents,
): void {
  const p = state.player;
  if (p.invulnTimer > 0 || state.phase !== 'fighting') return;

  p.hp = Math.max(0, p.hp - dmg);
  p.invulnTimer = 0.85;
  p.hitFlashTimer = 0.14;
  p.mindsEyeActive = false;
  state.damageTaken += dmg;
  state.combo = 0;
  state.comboTimer = 0;
  events.playerDamaged = true;

  const pushAng = Math.atan2(p.y - sourceY, p.x - sourceX);
  p.vx = Math.cos(pushAng) * 260;
  p.vy = Math.sin(pushAng) * 260;

  state.hitstopTimer = Math.max(state.hitstopTimer, 0.06);
  state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.65);

  if (p.hp <= 0) {
    state.phase = 'defeat';
    events.runDefeat = true;
    const stage = getActiveStageDef(state);
    state.summarySnapshot = {
      outcome: 'defeat',
      isEndless: state.isEndless,
      stageIndex: state.stageIndex,
      stageName: stage.name,
      waveNumber: state.waveIndex + 1,
      totalWavesInStage: stage.waves.length,
      kills: state.kills,
      maxCombo: state.maxCombo,
      deflects: state.deflects,
      damageTaken: state.damageTaken,
      clearTimeSec: state.elapsedSec,
      score: state.score,
      isNewBest: false,
      boonsCollected: [...state.boons],
    };
  }
}

function countActiveAttackTokens(state: InkBladeRunState): number {
  let count = 0;
  for (const e of state.enemies) {
    if (e.aiPhase !== 'dying' && e.hasAttackToken) {
      count += 1;
    }
  }
  return count;
}

function tryAcquireAttackToken(state: InkBladeRunState, enemy: EnemyEntity): boolean {
  if (enemy.archetype === 'shogun_boss') {
    enemy.hasAttackToken = true;
    return true;
  }
  const limit = MAX_CONCURRENT_TOKENS + (state.isEndless ? 1 : 0);
  if (countActiveAttackTokens(state) < limit) {
    enemy.hasAttackToken = true;
    return true;
  }
  return false;
}

function updateEnemies(
  state: InkBladeRunState,
  simDt: number,
  events: SimulationEvents,
): void {
  const p = state.player;

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const def = ENEMY_ARCHETYPES[e.archetype];

    if (e.hitFlashTimer > 0) {
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - simDt);
    }

    if (e.aiPhase === 'dying') {
      e.phaseTimer -= simDt;
      e.koProgress = clamp(1 - e.phaseTimer / 0.34, 0, 1);
      e.x += e.vx * simDt;
      e.y += e.vy * simDt;
      e.vx *= Math.exp(-9 * simDt);
      e.vy *= Math.exp(-9 * simDt);
      const pos = resolveActorPosition(
        e.x,
        e.y,
        e.radius,
        state.arenaWidth,
        state.arenaHeight,
        state.obstacles,
      );
      e.x = pos.x;
      e.y = pos.y;
      if (e.phaseTimer <= 0) {
        state.enemies.splice(i, 1);
      }
      continue;
    }

    if (e.aiPhase === 'spawning') {
      e.phaseTimer -= simDt;
      e.facing = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.phaseTimer <= 0) {
        e.aiPhase = 'pursuing';
      }
      continue;
    }

    if (e.aiPhase === 'staggered') {
      e.phaseTimer -= simDt;
      e.vx *= Math.exp(-8 * simDt);
      e.vy *= Math.exp(-8 * simDt);
      e.x += e.vx * simDt;
      e.y += e.vy * simDt;
      const pos = resolveActorPosition(
        e.x,
        e.y,
        e.radius,
        state.arenaWidth,
        state.arenaHeight,
        state.obstacles,
      );
      e.x = pos.x;
      e.y = pos.y;
      if (e.phaseTimer <= 0) {
        e.aiPhase = 'pursuing';
        e.attackCooldown = 0.45;
      }
      continue;
    }

    const dxToPlayer = p.x - e.x;
    const dyToPlayer = p.y - e.y;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);
    const angleToPlayer = Math.atan2(dyToPlayer, dxToPlayer);

    if (e.attackCooldown > 0) {
      e.attackCooldown = Math.max(0, e.attackCooldown - simDt);
    }

    if (e.aiPhase === 'pursuing') {
      // Smoothly turn facing toward player (slower turn for Ironclad so backstabs stay rewarding!)
      const turnRate = e.archetype === 'ironclad' ? 3.1 : 7.5;
      const diff = normalizeAngle(angleToPlayer - e.facing);
      e.facing = normalizeAngle(
        e.facing + clamp(diff, -turnRate * simDt, turnRate * simDt),
      );

      let moveDirX = 0;
      let moveDirY = 0;

      if (e.archetype === 'ronin' || e.archetype === 'ironclad') {
        moveDirX = Math.cos(angleToPlayer);
        moveDirY = Math.sin(angleToPlayer);
      } else if (e.archetype === 'marksman' || e.archetype === 'bombardier') {
        if (distToPlayer < def.preferredRange * 0.62) {
          // Kite away from player
          moveDirX = -Math.cos(angleToPlayer);
          moveDirY = -Math.sin(angleToPlayer);
        } else if (distToPlayer > def.preferredRange * 1.08) {
          moveDirX = Math.cos(angleToPlayer);
          moveDirY = Math.sin(angleToPlayer);
        } else {
          // Strafe gently
          const perp = angleToPlayer + e.orbitSign * (Math.PI * 0.5);
          moveDirX = Math.cos(perp) * 0.65;
          moveDirY = Math.sin(perp) * 0.65;
        }
      } else if (e.archetype === 'kusarigama') {
        // High-speed orbital flanker
        const radialWeight = clamp((distToPlayer - def.preferredRange) / 140, -0.7, 0.9);
        const tangentAngle = angleToPlayer + e.orbitSign * (Math.PI * 0.5);
        moveDirX =
          Math.cos(angleToPlayer) * radialWeight + Math.cos(tangentAngle) * 0.95;
        moveDirY =
          Math.sin(angleToPlayer) * radialWeight + Math.sin(tangentAngle) * 0.95;
        const mag = Math.hypot(moveDirX, moveDirY) || 1;
        moveDirX /= mag;
        moveDirY /= mag;
      } else if (e.archetype === 'shogun_boss') {
        const speedBoost = e.bossPhase === 2 ? 1.25 : 1;
        moveDirX = Math.cos(angleToPlayer) * speedBoost;
        moveDirY = Math.sin(angleToPlayer) * speedBoost;
      }

      // Soft separation between nearby enemies so they never stack on one pixel
      for (const other of state.enemies) {
        if (other.uid === e.uid || other.aiPhase === 'dying') continue;
        const sdx = e.x - other.x;
        const sdy = e.y - other.y;
        const minSep = e.radius + other.radius + 14;
        const sd2 = sdx * sdx + sdy * sdy;
        if (sd2 > 1 && sd2 < minSep * minSep) {
          const sd = Math.sqrt(sd2);
          moveDirX += (sdx / sd) * 0.9;
          moveDirY += (sdy / sd) * 0.9;
        }
      }

      const speed = def.moveSpeed;
      e.vx = e.vx * Math.exp(-10 * simDt) + moveDirX * speed * (1 - Math.exp(-10 * simDt));
      e.vy = e.vy * Math.exp(-10 * simDt) + moveDirY * speed * (1 - Math.exp(-10 * simDt));

      // Check attack initiation condition
      const hasLoS = !raycastObstacles(
        e.x,
        e.y,
        p.x,
        p.y,
        state.obstacles,
        'projectile',
      ).blocked;

      const inTriggerRange =
        e.archetype === 'marksman' || e.archetype === 'bombardier'
          ? distToPlayer <= 560 && hasLoS
          : e.archetype === 'kusarigama'
            ? distToPlayer <= 265 && hasLoS
            : e.archetype === 'shogun_boss'
              ? distToPlayer <= 460
              : distToPlayer <= def.preferredRange + 28;

      if (e.attackCooldown <= 0 && inTriggerRange && tryAcquireAttackToken(state, e)) {
        e.aiPhase = 'windup';
        e.phaseTimer =
          e.archetype === 'shogun_boss' && e.bossPhase === 2
            ? def.windupSec * 0.78
            : def.windupSec;
        e.lockedAngle = angleToPlayer;
        e.lockedTargetX = clamp(p.x + p.vx * 0.22, 60, state.arenaWidth - 60);
        e.lockedTargetY = clamp(p.y + p.vy * 0.22, 60, state.arenaHeight - 60);
        e.facing = angleToPlayer;
        events.enemyTelegraphStarted = true;
      }
    } else if (e.aiPhase === 'windup') {
      e.vx *= Math.exp(-12 * simDt);
      e.vy *= Math.exp(-12 * simDt);
      // Track player during first 45% of windup, then lock angle so player can cleanly dodge or parry!
      if (e.phaseTimer > def.windupSec * 0.55) {
        e.lockedAngle = angleToPlayer;
        e.facing = angleToPlayer;
      }
      e.phaseTimer -= simDt;
      if (e.phaseTimer <= 0) {
        e.aiPhase = 'active';
        e.phaseTimer = def.activeSec;

        // Fire ranged attacks at start of active phase
        if (e.archetype === 'marksman') {
          const boltSpeed = 560;
          state.projectiles.push({
            uid: state.nextUid++,
            kind: 'bolt',
            owner: 'enemy',
            x: e.x + Math.cos(e.lockedAngle) * (e.radius + 8),
            y: e.y + Math.sin(e.lockedAngle) * (e.radius + 8),
            vx: Math.cos(e.lockedAngle) * boltSpeed,
            vy: Math.sin(e.lockedAngle) * boltSpeed,
            radius: 7,
            damage: 1,
            life: 2.2,
            maxLife: 2.2,
            deflected: false,
            pierceLeft: 0,
          });
        } else if (e.archetype === 'bombardier') {
          const flightSec = 0.92;
          state.projectiles.push({
            uid: state.nextUid++,
            kind: 'mortar',
            owner: 'enemy',
            x: e.x,
            y: e.y,
            vx: (e.lockedTargetX - e.x) / flightSec,
            vy: (e.lockedTargetY - e.y) / flightSec,
            radius: 11,
            damage: 1,
            life: flightSec,
            maxLife: flightSec,
            deflected: false,
            pierceLeft: 0,
            targetX: e.lockedTargetX,
            targetY: e.lockedTargetY,
            blastRadius: 92,
          });
        } else if (e.archetype === 'shogun_boss') {
          if (distToPlayer > 210) {
            // Fan crossbow volley (3 bolts in Phase 1, 5 bolts in Phase 2)
            const count = e.bossPhase === 2 ? 5 : 3;
            const spread = 0.22;
            const boltSpeed = e.bossPhase === 2 ? 610 : 540;
            for (let k = 0; k < count; k++) {
              const ang = e.lockedAngle + (k - (count - 1) * 0.5) * spread;
              state.projectiles.push({
                uid: state.nextUid++,
                kind: 'bolt',
                owner: 'enemy',
                x: e.x + Math.cos(ang) * (e.radius + 10),
                y: e.y + Math.sin(ang) * (e.radius + 10),
                vx: Math.cos(ang) * boltSpeed,
                vy: Math.sin(ang) * boltSpeed,
                radius: 8,
                damage: 1,
                life: 2.4,
                maxLife: 2.4,
                deflected: false,
                pierceLeft: 0,
              });
            }
          } else {
            // Sweeping halberd lunge
            const lungeSpeed = e.bossPhase === 2 ? 780 : 640;
            e.vx = Math.cos(e.lockedAngle) * lungeSpeed;
            e.vy = Math.sin(e.lockedAngle) * lungeSpeed;
          }
        } else if (e.archetype === 'ronin') {
          e.vx = Math.cos(e.lockedAngle) * 660;
          e.vy = Math.sin(e.lockedAngle) * 660;
        } else if (e.archetype === 'kusarigama') {
          e.vx = Math.cos(e.lockedAngle) * 920;
          e.vy = Math.sin(e.lockedAngle) * 920;
        } else if (e.archetype === 'ironclad') {
          // Ground slam AoE shockwave!
          const slamRadius = 118;
          state.shockwaves.push({
            x: e.x,
            y: e.y,
            radius: 22,
            maxRadius: slamRadius,
            life: 0.28,
            maxLife: 0.28,
            colorHex: '#B45309',
            lineWidth: 4,
          });
          if (distToPlayer <= slamRadius + PLAYER_RADIUS) {
            if (p.parryActiveTimer > 0) {
              e.aiPhase = 'staggered';
              e.phaseTimer = 1.5;
              e.shieldBroken = true;
              e.hasAttackToken = false;
              triggerDeflectReward(state, p.x, p.y, events);
              continue;
            } else {
              applyPlayerDamage(state, def.damage, e.x, e.y, events);
            }
          }
        }
      }
    } else if (e.aiPhase === 'active') {
      e.phaseTimer -= simDt;

      // Melee hitbox check for lunging enemies
      if (
        e.archetype === 'ronin' ||
        e.archetype === 'kusarigama' ||
        (e.archetype === 'shogun_boss' && Math.hypot(e.vx, e.vy) > 220)
      ) {
        const hitReach = e.radius + PLAYER_RADIUS + 14;
        if (distSq(e.x, e.y, p.x, p.y) <= hitReach * hitReach) {
          if (p.parryActiveTimer > 0) {
            e.aiPhase = 'staggered';
            e.phaseTimer = e.archetype === 'shogun_boss' ? 1.0 : 1.5;
            e.shieldBroken = true;
            e.hasAttackToken = false;
            e.vx = -Math.cos(e.lockedAngle) * 240;
            e.vy = -Math.sin(e.lockedAngle) * 240;
            triggerDeflectReward(state, p.x, p.y, events);
            continue;
          } else {
            applyPlayerDamage(state, def.damage, e.x, e.y, events);
          }
        }
      }

      if (e.phaseTimer <= 0) {
        e.aiPhase = 'recovery';
        e.phaseTimer =
          e.archetype === 'shogun_boss' && e.bossPhase === 2
            ? def.recoverySec * 0.72
            : def.recoverySec;
        e.hasAttackToken = false;
      }
    } else if (e.aiPhase === 'recovery') {
      e.vx *= Math.exp(-10 * simDt);
      e.vy *= Math.exp(-10 * simDt);
      e.phaseTimer -= simDt;
      if (e.phaseTimer <= 0) {
        e.aiPhase = 'pursuing';
        e.attackCooldown =
          e.archetype === 'shogun_boss' && e.bossPhase === 2
            ? def.cooldownSec * 0.65
            : def.cooldownSec;
        if (e.archetype === 'kusarigama') {
          e.orbitSign = e.orbitSign === 1 ? -1 : 1;
        }
      }
    }

    const stepX = e.vx * simDt;
    const stepY = e.vy * simDt;
    e.gaitDist += Math.hypot(stepX, stepY);
    const resolved = resolveActorPosition(
      e.x + stepX,
      e.y + stepY,
      e.radius,
      state.arenaWidth,
      state.arenaHeight,
      state.obstacles,
    );
    e.x = resolved.x;
    e.y = resolved.y;
  }
}

function updateProjectiles(
  state: InkBladeRunState,
  simDt: number,
  events: SimulationEvents,
): void {
  const p = state.player;
  deflectNearbyProjectiles(state, events);

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    const prevX = proj.x;
    const prevY = proj.y;
    proj.x += proj.vx * simDt;
    proj.y += proj.vy * simDt;
    proj.life -= simDt;

    // Mortar shell explodes when its flight timer finishes!
    if (proj.kind === 'mortar' && proj.owner === 'enemy') {
      if (proj.life <= 0) {
        const bx = proj.targetX ?? proj.x;
        const by = proj.targetY ?? proj.y;
        const br = proj.blastRadius ?? 92;
        state.shockwaves.push({
          x: bx,
          y: by,
          radius: 14,
          maxRadius: br,
          life: 0.28,
          maxLife: 0.28,
          colorHex: '#EA580C',
          lineWidth: 4,
        });
        events.decalCommands.push({
          kind: 'scorch',
          x: bx,
          y: by,
          angle: 0,
          scale: 0.85,
          colorHex: '#292524',
        });
        if (distSq(bx, by, p.x, p.y) <= (br + PLAYER_RADIUS * 0.6) ** 2) {
          applyPlayerDamage(state, proj.damage, bx, by, events);
        }
        // Mortar blasts can also ignite powder jars!
        for (const jar of state.jars) {
          if (!jar.exploded && distSq(bx, by, jar.x, jar.y) <= (br + jar.radius) ** 2) {
            detonatePowderJar(state, jar, events);
          }
        }
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    // Out of bounds or expired
    if (
      proj.life <= 0 ||
      proj.x < 24 ||
      proj.x > state.arenaWidth - 24 ||
      proj.y < 24 ||
      proj.y > state.arenaHeight - 24
    ) {
      state.projectiles.splice(i, 1);
      continue;
    }

    // Obstacle hit check (skip for arcing mortars)
    const obsRay = raycastObstacles(
      prevX,
      prevY,
      proj.x,
      proj.y,
      state.obstacles,
      'projectile',
      proj.radius * 0.5,
    );
    if (obsRay.blocked) {
      if (obsRay.obstacle?.destructible && proj.owner === 'player') {
        state.obstacles = state.obstacles.filter((o) => o.id !== obsRay.obstacle!.id);
      }
      state.projectiles.splice(i, 1);
      continue;
    }

    // Powder jar hit check
    let hitJar = false;
    for (const jar of state.jars) {
      if (jar.exploded) continue;
      if (distSq(proj.x, proj.y, jar.x, jar.y) <= (proj.radius + jar.radius) ** 2) {
        detonatePowderJar(state, jar, events);
        hitJar = true;
        break;
      }
    }
    if (hitJar) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (proj.owner === 'enemy') {
      // Check parry ward first, then player hurtbox
      if (
        p.parryActiveTimer > 0 &&
        distSq(proj.x, proj.y, p.x, p.y) <= (60 + proj.radius) ** 2
      ) {
        deflectNearbyProjectiles(state, events);
        continue;
      }

      const hitSeg = pointToSegmentDistSq(p.x, p.y, prevX, prevY, proj.x, proj.y);
      if (hitSeg.dSq <= (PLAYER_RADIUS + proj.radius) ** 2) {
        applyPlayerDamage(state, proj.damage, prevX, prevY, events);
        state.projectiles.splice(i, 1);
        continue;
      }
    } else {
      // Deflected / player projectile hits enemies!
      for (const enemy of state.enemies) {
        if (enemy.aiPhase === 'dying') continue;
        const hitSeg = pointToSegmentDistSq(
          enemy.x,
          enemy.y,
          prevX,
          prevY,
          proj.x,
          proj.y,
        );
        if (hitSeg.dSq <= (enemy.radius + proj.radius + 6) ** 2) {
          if (enemy.frontalShield && !enemy.shieldBroken) {
            enemy.shieldBroken = true;
            enemy.aiPhase = 'staggered';
            enemy.phaseTimer = 1.25;
            enemy.hasAttackToken = false;
            events.shieldBrokenCount += 1;
            addCallout(state, enemy.x, enemy.y - 30, '返矢破甲!', '#D97706');
          }
          const boltAng = Math.atan2(proj.vy, proj.vx);
          const killed = damageEnemy(
            state,
            enemy,
            proj.damage,
            boltAng,
            280,
            events,
            false,
          );
          if (killed) {
            p.slashCooldown = 0;
            p.isenReadyFlash = 0.35;
            events.chainResetTriggered = true;
          }
          if (proj.pierceLeft > 0) {
            proj.pierceLeft -= 1;
          } else {
            state.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }
  }
}

export function rollBoonChoices(state: InkBladeRunState, count = 3): BoonId[] {
  const available = BOON_DEFS.map((b) => b.id).filter(
    (id) => !state.boons.includes(id),
  );
  const pool = available.length >= count ? [...available] : BOON_DEFS.map((b) => b.id);
  const picked: BoonId[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(nextRandom(state) * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

export function selectBoonAndAdvance(
  state: InkBladeRunState,
  boonId: BoonId,
): void {
  if (state.phase !== 'boon_select') return;

  if (!state.boons.includes(boonId)) {
    state.boons.push(boonId);
  }
  state.pendingBoonChoices = [];

  // Advance to next stage (or loop in Endless mode)
  if (state.stageIndex + 1 < STAGES.length) {
    state.stageIndex += 1;
  } else {
    state.isEndless = true;
    state.endlessLoop += 1;
    state.stageIndex = 0;
  }

  const nextStage = getActiveStageDef(state);
  state.waveIndex = 0;
  state.arenaWidth = nextStage.arenaWidth;
  state.arenaHeight = nextStage.arenaHeight;
  state.obstacles = cloneStageObstacles(nextStage);
  state.jars = cloneStageJars(nextStage);
  state.projectiles = [];
  state.slashArcs = [];
  state.shockwaves = [];

  const healAmount = 1 + (hasBoon(state, 'relentless_edge') ? 1 : 0) + (boonId === 'crimson_siphon' ? 1 : 0);
  const nextMaxHp = 5 + (hasBoon(state, 'crimson_siphon') ? 1 : 0);
  const restoredHp = clamp(state.player.hp + healAmount, 1, nextMaxHp);
  state.player = createInitialPlayer(nextStage.playerSpawn, state.boons, restoredHp);
  state.phase = 'fighting';

  spawnWaveEnemies(state);
}

export function enterEndlessAfterVictory(state: InkBladeRunState): void {
  state.isEndless = true;
  state.endlessLoop = 1;
  state.stageIndex = 0;
  state.waveIndex = 0;
  state.summarySnapshot = null;

  const firstStage = getActiveStageDef(state);
  state.obstacles = cloneStageObstacles(firstStage);
  state.jars = cloneStageJars(firstStage);
  state.projectiles = [];
  state.slashArcs = [];
  state.shockwaves = [];
  state.pendingBoonChoices = rollBoonChoices(state, 3);
  state.phase = 'boon_select';
}

export function stepSimulation(
  state: InkBladeRunState,
  rawDt: number,
  input: PlayerInputFrame,
): SimulationEvents {
  const events = createEmptyEvents();
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt <= 0) return events;

  // Decay visual-only flashes & camera trauma in real frame time
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.85);
  state.lightningFlash = Math.max(0, state.lightningFlash - dt * 2.1);

  for (let i = state.slashArcs.length - 1; i >= 0; i--) {
    state.slashArcs[i].life -= dt;
    if (state.slashArcs[i].life <= 0) state.slashArcs.splice(i, 1);
  }
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const sw = state.shockwaves[i];
    sw.life -= dt;
    const prog = 1 - clamp(sw.life / sw.maxLife, 0, 1);
    sw.radius = sw.maxRadius * (0.2 + 0.8 * (1 - (1 - prog) * (1 - prog)));
    if (sw.life <= 0) state.shockwaves.splice(i, 1);
  }
  for (let i = state.callouts.length - 1; i >= 0; i--) {
    const c = state.callouts[i];
    c.life -= dt;
    c.y += c.vy * dt;
    if (c.life <= 0) state.callouts.splice(i, 1);
  }

  if (state.phase === 'boon_select' || state.phase === 'victory' || state.phase === 'defeat') {
    return events;
  }

  // Hitstop freezes simulation physics while preserving visual punch!
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return events;
  }

  const p = state.player;
  p.facing =
    Math.hypot(input.aimWorldX - p.x, input.aimWorldY - p.y) > 4
      ? Math.atan2(input.aimWorldY - p.y, input.aimWorldX - p.x)
      : p.facing;

  // Buffer inputs slightly early so fast combat combos never drop presses
  if (input.slashJustPressed) {
    p.slashBufferTimer = 0.14;
  } else if (p.slashBufferTimer > 0) {
    p.slashBufferTimer = Math.max(0, p.slashBufferTimer - dt);
  }

  if (input.parryJustPressed) {
    p.parryBufferTimer = 0.13;
  } else if (p.parryBufferTimer > 0) {
    p.parryBufferTimer = Math.max(0, p.parryBufferTimer - dt);
  }

  // Mind's Eye slow-motion aiming (when holding aim while slash is ready and focus > 0)
  if (
    input.mindsEyeHeld &&
    p.slashCooldown <= 0 &&
    p.focus > 2 &&
    state.phase === 'fighting'
  ) {
    p.mindsEyeActive = true;
    p.focus = Math.max(0, p.focus - dt * 36);
    if (p.focus <= 0.5) {
      p.mindsEyeActive = false;
    }
  } else {
    p.mindsEyeActive = false;
    const regenRate = hasBoon(state, 'deep_mind') ? 27 : 20;
    p.focus = Math.min(p.maxFocus, p.focus + dt * regenRate);
  }

  const timeScale = p.mindsEyeActive ? 0.24 : 1.0;
  const simDt = dt * timeScale;
  state.elapsedSec += simDt;

  // Cooldowns & timers
  if (p.slashCooldown > 0) p.slashCooldown = Math.max(0, p.slashCooldown - dt);
  if (p.parryCooldown > 0) p.parryCooldown = Math.max(0, p.parryCooldown - dt);
  if (p.parryActiveTimer > 0) p.parryActiveTimer = Math.max(0, p.parryActiveTimer - dt);
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - simDt);
  if (p.dashTimer > 0) p.dashTimer = Math.max(0, p.dashTimer - dt);
  if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
  if (p.isenReadyFlash > 0) p.isenReadyFlash = Math.max(0, p.isenReadyFlash - dt);

  p.scaleX += (1 - p.scaleX) * (1 - Math.exp(-16 * dt));
  p.scaleY += (1 - p.scaleY) * (1 - Math.exp(-16 * dt));

  if (state.combo > 0) {
    state.comboTimer -= simDt;
    if (state.comboTimer <= 0) {
      state.combo = 0;
      state.comboTimer = 0;
    }
  }

  // Consume buffered Parry or Slash
  if (p.parryBufferTimer > 0 && p.parryCooldown <= 0 && state.phase === 'fighting') {
    executeParryStance(state, input, events);
  }

  const wantsReleaseSlash = input.slashJustReleased && p.slashCooldown <= 0;
  const wantsTapSlash =
    p.slashBufferTimer > 0 && !input.mindsEyeHeld && p.slashCooldown <= 0;
  if ((wantsReleaseSlash || wantsTapSlash) && state.phase === 'fighting') {
    executeSlashDash(state, input.aimWorldX, input.aimWorldY, events);
  }

  // Process pending Thunder Wake secondary strikes
  const wakes = getPendingWakes(state);
  for (let i = wakes.length - 1; i >= 0; i--) {
    const w = wakes[i];
    if (w.runStage !== state.stageIndex) {
      wakes.splice(i, 1);
      continue;
    }
    w.timer -= simDt;
    if (w.timer <= 0) {
      wakes.splice(i, 1);
      const ang = Math.atan2(w.endY - w.startY, w.endX - w.startX);
      state.slashArcs.push({
        id: state.nextUid++,
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
        angle: ang,
        width: 24,
        life: 0.22,
        maxLife: 0.22,
        isChainReset: false,
        isThunderWake: true,
      });
      for (const e of state.enemies) {
        if (e.aiPhase === 'dying') continue;
        const hit = pointToSegmentDistSq(e.x, e.y, w.startX, w.startY, w.endX, w.endY);
        if (hit.dSq <= (28 + e.radius) ** 2) {
          const killed = damageEnemy(state, e, 1, ang, 160, events, false);
          if (killed) {
            p.slashCooldown = 0;
            events.chainResetTriggered = true;
          }
        }
      }
    }
  }

  // Player movement
  const moveMag = Math.hypot(input.moveX, input.moveY);
  const normX = moveMag > 0.01 ? input.moveX / moveMag : 0;
  const normY = moveMag > 0.01 ? input.moveY / moveMag : 0;
  const moveSpeed =
    BASE_PLAYER_SPEED *
    (hasBoon(state, 'wind_stride') ? 1.22 : 1) *
    (p.mindsEyeActive ? 0.55 : 1);

  const targetVx = normX * moveSpeed;
  const targetVy = normY * moveSpeed;
  const accelBlend = 1 - Math.exp(-16 * dt);
  p.vx += (targetVx - p.vx) * accelBlend;
  p.vy += (targetVy - p.vy) * accelBlend;

  const dx = p.vx * (p.mindsEyeActive ? dt * 0.6 : simDt);
  const dy = p.vy * (p.mindsEyeActive ? dt * 0.6 : simDt);
  p.gaitDist += Math.hypot(dx, dy);

  const nextPos = resolveActorPosition(
    p.x + dx,
    p.y + dy,
    PLAYER_RADIUS,
    state.arenaWidth,
    state.arenaHeight,
    state.obstacles,
  );
  p.x = nextPos.x;
  p.y = nextPos.y;

  // Update powder jar fuses
  for (const jar of state.jars) {
    if (!jar.exploded && jar.triggered) {
      jar.fuseTimer -= simDt;
      if (jar.fuseTimer <= 0) {
        detonatePowderJar(state, jar, events);
      }
    }
  }

  // Update enemies & projectiles
  if (state.phase === 'fighting') {
    updateEnemies(state, simDt, events);
    updateProjectiles(state, simDt, events);

    // Check if all enemies in current wave are eliminated
    if (state.enemies.length === 0 && state.phase === 'fighting') {
      const stage = getActiveStageDef(state);
      if (state.waveIndex + 1 < stage.waves.length) {
        state.phase = 'wave_clear_pause';
        state.phaseTransitionTimer = 0.85;
        events.waveCleared = true;
        addCallout(
          state,
          p.x,
          p.y - 36,
          `第 ${state.waveIndex + 1} 阵肃清`,
          '#0F766E',
        );
      } else {
        // Stage completed!
        events.stageCleared = true;
        if (!state.isEndless && state.stageIndex === STAGES.length - 1) {
          // Campaign Boss defeated -> Victory!
          state.phase = 'victory';
          events.runVictory = true;
          state.score += 1000 + p.hp * 200;
          state.summarySnapshot = {
            outcome: 'victory',
            isEndless: false,
            stageIndex: state.stageIndex,
            stageName: stage.name,
            waveNumber: stage.waves.length,
            totalWavesInStage: stage.waves.length,
            kills: state.kills,
            maxCombo: state.maxCombo,
            deflects: state.deflects,
            damageTaken: state.damageTaken,
            clearTimeSec: state.elapsedSec,
            score: state.score,
            isNewBest: false,
            boonsCollected: [...state.boons],
          };
        } else {
          state.pendingBoonChoices = rollBoonChoices(state, 3);
          state.phase = 'boon_select';
        }
      }
    }
  } else if (state.phase === 'wave_clear_pause') {
    state.phaseTransitionTimer -= dt;
    if (state.phaseTransitionTimer <= 0) {
      state.waveIndex += 1;
      state.phase = 'fighting';
      spawnWaveEnemies(state);
    }
  }

  return events;
}
