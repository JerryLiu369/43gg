import {
  ACHIEVEMENTS,
  ASCENSION_NODES_BY_ID,
  AUTOMATOR_ACTIONS_BY_ID,
  AUTOMATOR_PRESETS,
  CRUCIBLE_BY_ID,
  CRUCIBLE_CHAMBERS,
  DIRECTIVES_BY_ID,
  ERAS,
  LEVEL_MILESTONES,
  MODULES_BY_ID,
  ORBITAL_RINGS,
  RINGS_BY_ID,
  RING_ORDER,
  TUTORIAL_QUESTS,
  buildAutomatorRulesFromPreset,
} from './content.ts';
import type {
  AchievementId,
  AscensionNodeId,
  AutomatorActionId,
  AutomatorConditionId,
  AutomatorPresetId,
  AutomatorRule,
  AutomatorState,
  BuyMode,
  CrucibleChamberId,
  DirectiveId,
  EraIndex,
  InstalledModule,
  ModuleTypeId,
  OfflineProgressSummary,
  OrbitalRingId,
  OrreryMetaState,
  OrreryRunState,
  OverdriveSpeed,
  RingGearMode,
  StepEvents,
  SyzygyRecord,
} from './types.ts';

export const TWO_PI = Math.PI * 2;
export const TOTAL_SLOTS = 12;

const CARDINAL_SLOTS = new Set([0, 3, 6, 9]);
const OCTAGON_SLOTS = new Set([0, 1, 3, 4, 6, 7, 9, 10]);

const SYNERGY_ZODIAC_BLUEPRINT: readonly ModuleTypeId[] = [
  'prism',
  'resonator',
  'prism',
  'lens',
  'prism',
  'condenser',
  'mainspring',
  'chrono',
  'prism',
  'resonator',
  'condenser',
  'lens',
];

export function createInitialMetaState(): OrreryMetaState {
  return {
    stardust: 0,
    totalStardustEarned: 0,
    ascensionCount: 0,
    highestLuminanceEver: 0,
    fastestPrimeSec: null,
    bestSyzygyEver: 1,
    tutorialCompletedEver: false,
    ascensionNodes: {
      star_seed: false,
      golden_ratio: false,
      wide_meridian: false,
      aether_fountain: false,
      perpetual_spring: false,
      harmonic_overtone: false,
      zodiac_memory: false,
      cosmic_architect: false,
    },
    achievements: {
      first_perfect: false,
      first_syzygy_2: false,
      first_syzygy_3: false,
      grand_syzygy_5: false,
      first_module: false,
      octagon_grid: false,
      milestone_25: false,
      overdrive_burst: false,
      crucible_ignited: false,
      smart_automator: false,
      first_ascension: false,
      prime_singularity: false,
    },
    lastSavedAt: Date.now(),
  };
}

export function createInitialAutomatorState(
  enabledByDefault = false,
): AutomatorState {
  return {
    enabled: enabledByDefault,
    reserveRatio: 0.2,
    activePreset: 'breakthrough_sniper',
    tickTimer: 0,
    totalActionsExecuted: 0,
    lastActionLabel: null,
    rules: buildAutomatorRulesFromPreset('breakthrough_sniper'),
  };
}

export function createNewOrreryRun(
  meta: OrreryMetaState,
  previousSlots?: Array<InstalledModule | null>,
  previousAutomator?: AutomatorState,
): OrreryRunState {
  const hasStarSeed = meta.ascensionNodes.star_seed;
  const hasCosmic = meta.ascensionNodes.cosmic_architect;
  const keepSlots = meta.ascensionNodes.zodiac_memory && previousSlots;

  const slots: Array<InstalledModule | null> = Array.from(
    { length: TOTAL_SLOTS },
    (_, idx) => {
      if (keepSlots && previousSlots[idx]) {
        return { typeId: previousSlots[idx]!.typeId, tier: 1 };
      }
      return null;
    },
  );

  const baseMaxTension = meta.ascensionNodes.perpetual_spring ? 600 : 240;

  const automator: AutomatorState = previousAutomator
    ? {
        ...previousAutomator,
        tickTimer: 0,
        rules: previousAutomator.rules.map((r) => ({
          ...r,
          lastTriggeredAt: -10,
        })),
      }
    : createInitialAutomatorState(hasCosmic);

  return {
    seed: Math.floor(Math.random() * 1_000_000_000),
    era: hasStarSeed ? 2 : 1,
    luminance: hasStarSeed ? 900 : 0,
    totalLuminanceRun: hasStarSeed ? 900 : 0,
    aether: 0,
    totalAetherRun: 0,
    luminancePerSec: 0,
    springTensionSec: hasStarSeed ? 40 : 18,
    maxSpringTensionSec: baseMaxTension,
    overdriveSpeed: 1,
    impulseBoost: 0,
    frenzySecondsLeft: 0,
    comet: {
      active: false,
      progress: 0,
      durationSec: 9,
      startAngle: 0.6,
      endAngle: 3.9,
    },
    nextCometSpawnSec: 26,
    resonatorCharges: 0,
    maxResonatorCharges: 6,
    harmonicOvertoneBonus: 0,
    rings: {
      mercury: {
        id: 'mercury',
        unlocked: true,
        level: 1,
        angle: 0.4,
        lastStrikeAt: -10,
        gearMode: 'harmonic',
      },
      venus: {
        id: 'venus',
        unlocked: hasStarSeed,
        level: hasStarSeed ? 1 : 0,
        angle: 2.1,
        lastStrikeAt: -10,
        gearMode: 'syzygy',
      },
      terra: {
        id: 'terra',
        unlocked: false,
        level: 0,
        angle: 3.8,
        lastStrikeAt: -10,
        gearMode: 'syzygy',
      },
      mars: {
        id: 'mars',
        unlocked: false,
        level: 0,
        angle: 5.0,
        lastStrikeAt: -10,
        gearMode: 'harmonic',
      },
      jupiter: {
        id: 'jupiter',
        unlocked: false,
        level: 0,
        angle: 1.2,
        lastStrikeAt: -10,
        gearMode: 'harmonic',
      },
    },
    slots,
    directives: {
      meridian_chime: false,
      auto_impulse: false,
      quadrant_unlock_8: meta.ascensionNodes.aether_fountain,
      phase_coupler: false,
      syzygy_cascade: false,
      quadrant_unlock_12: false,
      auto_architect: hasCosmic,
      prime_ignition: false,
    },
    crucible: {
      stellarFlux: hasStarSeed ? 32 : 0,
      totalFluxRun: hasStarSeed ? 32 : 0,
      chambers: {
        fusion: 0,
        dilation: 0,
        crystallizer: 0,
      },
      supernovaSecondsLeft: 0,
      supernovaCooldownSec: 0,
      aetherSynthProgress: 0,
    },
    automator,
    autoUpgradeEnabled: automator.enabled,
    tutorialStep: meta.tutorialCompletedEver || meta.ascensionCount > 0 ? 5 : 0,
    usedOverdriveRun: false,
    runSeconds: 0,
    totalImpulses: 0,
    perfectImpulses: 0,
    totalMeridianStrikes: 0,
    totalSyzygies: 0,
    bestSyzygyBodies: 1,
    cometsCaughtRun: 0,
    lastSyzygy: null,
    autoImpulseTimer: 0,
    autoUpgradeTimer: 0,
    primeIgnited: false,
    endlessMode: false,
  };
}

export function getUnlockedAchievementCount(meta: OrreryMetaState): number {
  let count = 0;
  for (const ach of ACHIEVEMENTS) {
    if (meta.achievements[ach.id]) count++;
  }
  return count;
}

export function getTotalCrucibleLevels(state: OrreryRunState): number {
  const c = state.crucible.chambers;
  return c.fusion + c.dilation + c.crystallizer;
}

export function getCrucibleChamberCost(
  chamberId: CrucibleChamberId,
  state: OrreryRunState,
): { flux: number; aether: number } {
  const def = CRUCIBLE_BY_ID[chamberId];
  const lv = state.crucible.chambers[chamberId];
  const flux = Math.floor(def.baseFluxCost * Math.pow(def.costGrowth, lv));
  const aether =
    chamberId === 'crystallizer' && lv >= 3 ? Math.floor((lv - 2) * 3) : 0;
  return { flux, aether };
}

export function getFluxMultiplier(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  let mult = 1 + state.crucible.chambers.crystallizer * 0.15;
  if (meta.ascensionNodes.aether_fountain) mult *= 2.0;
  if (state.crucible.supernovaSecondsLeft > 0) mult *= 1.8;
  return mult;
}

export function getSupernovaMaxCooldown(state: OrreryRunState): number {
  return Math.max(26, 58 - state.crucible.chambers.dilation * 2.0);
}

export function triggerSupernovaPulse(
  state: OrreryRunState,
  meta: OrreryMetaState,
): { alignedPlanets: number; tensionBonus: number } | null {
  if (state.crucible.supernovaCooldownSec > 0) return null;

  state.crucible.supernovaCooldownSec = getSupernovaMaxCooldown(state);
  state.crucible.supernovaSecondsLeft = 8.0;

  let alignedPlanets = 0;
  for (const rid of RING_ORDER) {
    const r = state.rings[rid];
    if (!r.unlocked) continue;
    // Pull every unlocked planet 72% closer toward just before 0° Meridian so they sweep through together
    const target = TWO_PI - 0.06;
    const diff = shortestSignedAngleDiff(target, r.angle);
    r.angle = (((r.angle + diff * 0.74) % TWO_PI) + TWO_PI) % TWO_PI;
    alignedPlanets++;
  }

  const tensionBonus = 3;
  state.springTensionSec = Math.min(
    state.maxSpringTensionSec,
    state.springTensionSec + tensionBonus,
  );
  state.impulseBoost = Math.min(1.8, state.impulseBoost + 0.65);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);

  return { alignedPlanets, tensionBonus };
}

export function upgradeCrucibleChamber(
  state: OrreryRunState,
  meta: OrreryMetaState,
  chamberId: CrucibleChamberId,
): boolean {
  const cost = getCrucibleChamberCost(chamberId, state);
  if (
    state.crucible.stellarFlux < cost.flux ||
    state.aether < cost.aether
  ) {
    return false;
  }
  state.crucible.stellarFlux -= cost.flux;
  state.aether -= cost.aether;
  state.crucible.chambers[chamberId] += 1;
  evaluateAchievements(state, meta);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function setRingGearMode(
  state: OrreryRunState,
  meta: OrreryMetaState,
  ringId: OrbitalRingId,
  mode: RingGearMode,
): boolean {
  const ring = state.rings[ringId];
  if (!ring.unlocked) return false;
  ring.gearMode = mode;
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function areModulesSynergistic(
  a: ModuleTypeId | undefined,
  b: ModuleTypeId | undefined,
): boolean {
  if (!a || !b) return false;
  if (
    a === 'prism' &&
    (b === 'prism' || b === 'resonator' || b === 'condenser')
  ) {
    return true;
  }
  if (b === 'prism' && (a === 'resonator' || a === 'condenser')) {
    return true;
  }
  if (
    (a === 'mainspring' && b === 'chrono') ||
    (a === 'chrono' && b === 'mainspring')
  ) {
    return true;
  }
  return false;
}

export function isSlotUnlocked(
  state: OrreryRunState,
  slotIndex: number,
): boolean {
  if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS) return false;
  if (state.era < 2 && !state.directives.quadrant_unlock_8) return false;
  if (state.directives.quadrant_unlock_12) return true;
  if (state.directives.quadrant_unlock_8) return OCTAGON_SLOTS.has(slotIndex);
  return CARDINAL_SLOTS.has(slotIndex);
}

export function getUnlockedSlotCount(state: OrreryRunState): number {
  let count = 0;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (isSlotUnlocked(state, i)) count++;
  }
  return count;
}

export function getInstalledSlotCount(state: OrreryRunState): number {
  return state.slots.reduce((acc, m) => acc + (m ? 1 : 0), 0);
}

export function getModulePowerScale(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  let scale = 1;
  if (state.directives.quadrant_unlock_8) scale *= 1.15;
  if (meta.ascensionNodes.cosmic_architect) scale *= 1.3;
  return scale;
}

export function getAdjacentSlots(slotIndex: number): [number, number] {
  const prev = (slotIndex + TOTAL_SLOTS - 1) % TOTAL_SLOTS;
  const next = (slotIndex + 1) % TOTAL_SLOTS;
  return [prev, next];
}

export function getGlobalLuminanceMultiplier(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  let mult = 1;
  // Unspent Stardust passive: +12% each (so spending Stardust on Constellation nodes is always net-positive)
  mult *= 1 + meta.stardust * 0.12;
  // Unlocked Horological Achievements: +12% each
  mult *= 1 + getUnlockedAchievementCount(meta) * 0.12;
  // Alchemical Crucible Solar Fusion exponential multiplier: x1.18^Lv
  if (state.crucible.chambers.fusion > 0) {
    mult *= Math.pow(1.18, state.crucible.chambers.fusion);
  }
  if (state.directives.meridian_chime) mult *= 1.6;
  if (
    state.directives.quadrant_unlock_12 &&
    getInstalledSlotCount(state) === TOTAL_SLOTS
  ) {
    mult *= 2.0;
  }
  if (meta.ascensionNodes.cosmic_architect) mult *= 2.5;
  mult *= 1 + state.harmonicOvertoneBonus;
  if (state.frenzySecondsLeft > 0) mult *= 2.5;
  if (state.crucible.supernovaSecondsLeft > 0) mult *= 2.0;
  if (state.primeIgnited) mult *= 2.5;
  return mult;
}

export function getRingMilestoneMultiplier(
  level: number,
  meta: OrreryMetaState,
): { mult: number; nextLevel: number | null; nextMult: number | null } {
  let mult = 1;
  const bonusScale = meta.ascensionNodes.golden_ratio ? 1.15 : 1.0;
  let nextLevel: number | null = null;
  let nextMult: number | null = null;

  for (const ms of LEVEL_MILESTONES) {
    if (level >= ms.level) {
      mult *= ms.mult * bonusScale;
    } else if (nextLevel === null) {
      nextLevel = ms.level;
      nextMult = Number((ms.mult * bonusScale).toFixed(2));
    }
  }
  return { mult, nextLevel, nextMult };
}

export function getSingleLevelCostAt(
  ringId: OrbitalRingId,
  currentLevel: number,
  meta: OrreryMetaState,
): number {
  const def = RINGS_BY_ID[ringId];
  const growth = meta.ascensionNodes.golden_ratio
    ? 1 + (def.costGrowth - 1) * 0.9
    : def.costGrowth;
  return Math.floor(def.baseUpgradeCost * Math.pow(growth, currentLevel - 1));
}

export function getRingUpgradeCost(
  ringId: OrbitalRingId,
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const def = RINGS_BY_ID[ringId];
  const ring = state.rings[ringId];
  if (!ring.unlocked) {
    return def.unlockCost;
  }
  return getSingleLevelCostAt(ringId, ring.level, meta);
}

export interface BulkUpgradeQuote {
  levels: number;
  totalCost: number;
  isUnlock: boolean;
  canAfford: boolean;
}

export function getBulkRingUpgradeQuote(
  ringId: OrbitalRingId,
  state: OrreryRunState,
  meta: OrreryMetaState,
  buyMode: BuyMode,
): BulkUpgradeQuote {
  const def = RINGS_BY_ID[ringId];
  const ring = state.rings[ringId];
  if (!ring.unlocked) {
    return {
      levels: 1,
      totalCost: def.unlockCost,
      isUnlock: true,
      canAfford: state.luminance >= def.unlockCost,
    };
  }

  let targetLevels = 1;
  if (buyMode === '10') {
    targetLevels = 10;
  } else if (buyMode === 'next') {
    const ms = getRingMilestoneMultiplier(ring.level, meta);
    targetLevels = ms.nextLevel
      ? Math.max(1, ms.nextLevel - ring.level)
      : 10;
  } else if (buyMode === 'max') {
    let runningTotal = 0;
    let count = 0;
    while (count < 100) {
      const stepCost = getSingleLevelCostAt(ringId, ring.level + count, meta);
      if (runningTotal + stepCost > state.luminance) break;
      runningTotal += stepCost;
      count++;
    }
    if (count === 0) {
      const single = getSingleLevelCostAt(ringId, ring.level, meta);
      return {
        levels: 1,
        totalCost: single,
        isUnlock: false,
        canAfford: false,
      };
    }
    return {
      levels: count,
      totalCost: runningTotal,
      isUnlock: false,
      canAfford: true,
    };
  }

  let sum = 0;
  for (let i = 0; i < targetLevels; i++) {
    sum += getSingleLevelCostAt(ringId, ring.level + i, meta);
  }
  return {
    levels: targetLevels,
    totalCost: sum,
    isUnlock: false,
    canAfford: state.luminance >= sum,
  };
}

export function getRingMeridianYield(
  ringId: OrbitalRingId,
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const def = RINGS_BY_ID[ringId];
  const ring = state.rings[ringId];
  if (!ring.unlocked || ring.level <= 0) return 0;
  const { mult: milestoneMult } = getRingMilestoneMultiplier(ring.level, meta);
  const globalMult = getGlobalLuminanceMultiplier(state, meta);
  const gearMult = ring.gearMode === 'harmonic' ? 1.4 : 1.0;
  return def.baseYield * ring.level * milestoneMult * globalMult * gearMult;
}

export function getGlobalSpeedMultiplier(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const modScale = getModulePowerScale(state, meta);
  let mainspringBonus = 0;

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const mod = state.slots[i];
    if (!mod || mod.typeId !== 'mainspring') continue;
    let boost = 0.09 * mod.tier * modScale;
    const [left, right] = getAdjacentSlots(i);
    if (
      state.slots[left]?.typeId === 'chrono' ||
      state.slots[right]?.typeId === 'chrono'
    ) {
      boost *= 1.2;
    }
    mainspringBonus += boost;
  }

  const dilationScale = 1 + state.crucible.chambers.dilation * 0.06;
  let speed =
    (1 + mainspringBonus) * (1 + state.impulseBoost) * dilationScale;
  if (meta.ascensionNodes.cosmic_architect) speed *= 1.2;
  return speed;
}

export function getRingAngularVelocity(
  ringId: OrbitalRingId,
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const def = RINGS_BY_ID[ringId];
  const ring = state.rings[ringId];
  if (!ring.unlocked) return 0;
  const levelSpeedScale = 1 + Math.min(0.45, (ring.level - 1) * 0.006);
  const gearSpeed =
    ring.gearMode === 'blitz'
      ? 1.38
      : ring.gearMode === 'harmonic'
        ? 0.92
        : 1.0;
  return (
    def.baseOmega *
    levelSpeedScale *
    gearSpeed *
    getGlobalSpeedMultiplier(state, meta)
  );
}

export function getSyzygyWindowRad(
  state: OrreryRunState,
  meta: OrreryMetaState,
  ringId?: OrbitalRingId,
): number {
  const modScale = getModulePowerScale(state, meta);
  let lensRad = 0;
  for (const mod of state.slots) {
    if (mod?.typeId === 'lens') {
      lensRad += 0.031 * mod.tier * modScale;
    }
  }
  let win = 0.24 + lensRad;
  if (state.impulseBoost > 0.5) win += 0.05;
  if (state.crucible.supernovaSecondsLeft > 0) win += 0.08;
  if (meta.ascensionNodes.wide_meridian) win *= 1.4;
  if (ringId && state.rings[ringId].gearMode === 'syzygy') {
    win *= 1.35;
  }
  return Math.min(1.02, win);
}

export function computeMaxSpringTension(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const base = meta.ascensionNodes.perpetual_spring ? 600 : 240;
  const modScale = getModulePowerScale(state, meta);
  let extra = 0;
  for (const mod of state.slots) {
    if (mod?.typeId === 'chrono') {
      extra += Math.round(100 * mod.tier * modScale);
    }
  }
  return base + extra;
}

export function computeMaxResonatorCharges(state: OrreryRunState): number {
  let base = 6;
  for (const mod of state.slots) {
    if (mod?.typeId === 'resonator') {
      base += 3 * mod.tier;
    }
  }
  return base;
}

export function angularDistanceToZero(angle: number): number {
  const norm = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.min(norm, TWO_PI - norm);
}

export function shortestSignedAngleDiff(
  target: number,
  current: number,
): number {
  let diff = ((target - current + Math.PI) % TWO_PI) - Math.PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

export function computeSyzygyMultiplier(
  bodyCount: number,
  resonatorCharges: number,
  state: OrreryRunState,
): number {
  if (bodyCount < 2) return 1;
  const baseTable: Record<number, number> = {
    2: 2.2,
    3: 9.0,
    4: 20.0,
    5: 45.0,
  };
  let mult = baseTable[Math.min(5, bodyCount)] ?? 45;
  if (state.directives.syzygy_cascade) {
    mult *= Math.pow(1.28, bodyCount - 1);
  }
  if (resonatorCharges > 0) {
    mult *= 1 + resonatorCharges * 0.1;
  }
  if (state.crucible.chambers.crystallizer > 0) {
    mult *= 1 + state.crucible.chambers.crystallizer * 0.1;
  }
  return mult;
}

export function getModuleInstallCost(
  typeId: ModuleTypeId,
  state: OrreryRunState,
): { luminance: number; aether: number } {
  const def = MODULES_BY_ID[typeId];
  const existingCount = state.slots.filter((m) => m?.typeId === typeId).length;
  const lum = Math.floor(
    def.baseCostLuminance * Math.pow(1.85, existingCount),
  );
  const aeth =
    def.baseCostAether > 0
      ? Math.floor(def.baseCostAether * Math.pow(1.5, existingCount))
      : 0;
  return { luminance: lum, aether: aeth };
}

export function getModuleUpgradeCost(module: InstalledModule): {
  luminance: number;
  aether: number;
} {
  const def = MODULES_BY_ID[module.typeId];
  const lum = Math.floor(def.baseCostLuminance * Math.pow(4.2, module.tier));
  const aeth =
    module.tier >= 2 || def.baseCostAether > 0
      ? Math.max(
          1,
          Math.floor(
            (def.baseCostAether + 2) * Math.pow(1.9, module.tier - 1),
          ),
        )
      : 0;
  return { luminance: lum, aether: aeth };
}

export function estimateLuminancePerSec(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  let rate = 0;
  const modScale = getModulePowerScale(state, meta);

  let prismEchoFractionPerOrbit = 0;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const mod = state.slots[i];
    if (!mod || mod.typeId !== 'prism') continue;
    let frac = (0.24 + 0.12 * (mod.tier - 1)) * modScale;
    const [left, right] = getAdjacentSlots(i);
    if (
      state.slots[left]?.typeId === 'prism' ||
      state.slots[left]?.typeId === 'resonator'
    ) {
      frac *= 1.2;
    }
    if (
      state.slots[right]?.typeId === 'prism' ||
      state.slots[right]?.typeId === 'resonator'
    ) {
      frac *= 1.2;
    }
    prismEchoFractionPerOrbit += frac;
  }

  for (const ringId of RING_ORDER) {
    const r = state.rings[ringId];
    if (!r.unlocked) continue;
    const omega = getRingAngularVelocity(ringId, state, meta);
    const orbitsPerSec = omega / TWO_PI;
    const baseStrike = getRingMeridianYield(ringId, state, meta);
    const sectorPotency = r.gearMode === 'blitz' ? 1.45 : 1.0;
    rate +=
      orbitsPerSec *
      baseStrike *
      (1 + prismEchoFractionPerOrbit * sectorPotency);
  }

  return rate * state.overdriveSpeed;
}

function evaluateEraUnlocks(state: OrreryRunState): EraIndex | null {
  let nextEra: EraIndex = state.era;
  for (const e of ERAS) {
    if (state.totalLuminanceRun >= e.unlockLuminance && e.era > nextEra) {
      nextEra = e.era;
    }
  }
  if (nextEra !== state.era) {
    state.era = nextEra;
    return nextEra;
  }
  return null;
}

export function evaluateTutorialQuests(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number | null {
  if (state.tutorialStep >= TUTORIAL_QUESTS.length) return null;

  let completedStep: number | null = null;

  while (state.tutorialStep < TUTORIAL_QUESTS.length) {
    const step = state.tutorialStep;
    let done = false;
    if (step === 0 && state.totalImpulses >= 3) done = true;
    else if (step === 1 && state.rings.venus.unlocked) done = true;
    else if (step === 2 && (state.usedOverdriveRun || state.overdriveSpeed > 1))
      done = true;
    else if (step === 3 && getInstalledSlotCount(state) >= 1) done = true;
    else if (step === 4 && state.rings.mercury.level >= 10) done = true;

    if (!done) break;

    const quest = TUTORIAL_QUESTS[step];
    state.luminance += quest.rewardLuminance;
    state.totalLuminanceRun += quest.rewardLuminance;
    state.aether += quest.rewardAether;
    state.totalAetherRun += quest.rewardAether;
    state.crucible.stellarFlux += quest.rewardFlux;
    state.crucible.totalFluxRun += quest.rewardFlux;
    state.springTensionSec = Math.min(
      state.maxSpringTensionSec,
      state.springTensionSec + quest.rewardTensionSec,
    );

    completedStep = step;
    state.tutorialStep += 1;
    if (state.tutorialStep >= TUTORIAL_QUESTS.length) {
      meta.tutorialCompletedEver = true;
    }
    evaluateEraUnlocks(state);
  }

  return completedStep;
}

export function skipTutorial(
  state: OrreryRunState,
  meta: OrreryMetaState,
): void {
  state.tutorialStep = TUTORIAL_QUESTS.length;
  meta.tutorialCompletedEver = true;
}

export function evaluateAchievements(
  state: OrreryRunState,
  meta: OrreryMetaState,
): AchievementId[] {
  const newlyUnlocked: AchievementId[] = [];
  const tryUnlock = (id: AchievementId, cond: boolean) => {
    if (cond && !meta.achievements[id]) {
      meta.achievements[id] = true;
      newlyUnlocked.push(id);
    }
  };

  tryUnlock('first_perfect', state.perfectImpulses >= 1);
  tryUnlock('first_syzygy_2', state.bestSyzygyBodies >= 2);
  tryUnlock('first_syzygy_3', state.bestSyzygyBodies >= 3);
  tryUnlock('grand_syzygy_5', state.bestSyzygyBodies >= 5);
  tryUnlock('first_module', getInstalledSlotCount(state) >= 1);
  tryUnlock('octagon_grid', getInstalledSlotCount(state) >= 8);
  tryUnlock(
    'milestone_25',
    RING_ORDER.some((rid) => state.rings[rid].level >= 25),
  );
  tryUnlock('overdrive_burst', state.overdriveSpeed >= 4);
  tryUnlock('crucible_ignited', getTotalCrucibleLevels(state) >= 5);
  tryUnlock('smart_automator', state.automator.totalActionsExecuted >= 15);
  tryUnlock('first_ascension', meta.ascensionCount >= 1);
  tryUnlock('prime_singularity', state.primeIgnited);

  return newlyUnlocked;
}

export function catchGoldenComet(
  state: OrreryRunState,
  meta: OrreryMetaState,
  isAutoCapture = false,
): {
  gainedLuminance: number;
  gainedAether: number;
  gainedFlux: number;
  frenzyAddedSec: number;
} | null {
  if (!state.comet.active) return null;
  state.comet.active = false;
  state.comet.progress = 0;
  state.nextCometSpawnSec = 32 + Math.random() * 14;
  state.cometsCaughtRun += 1;

  // Strip temporary spikes (Overdrive, Frenzy, Supernova, Impulse) so Comets award steady unbuffed production
  const prevOverdrive = state.overdriveSpeed;
  const prevFrenzy = state.frenzySecondsLeft;
  const prevSuper = state.crucible.supernovaSecondsLeft;
  const prevImpulse = state.impulseBoost;
  state.overdriveSpeed = 1;
  state.frenzySecondsLeft = 0;
  state.crucible.supernovaSecondsLeft = 0;
  state.impulseBoost = 0;
  const steadyRate = Math.max(4, estimateLuminancePerSec(state, meta));
  state.overdriveSpeed = prevOverdrive;
  state.frenzySecondsLeft = prevFrenzy;
  state.crucible.supernovaSecondsLeft = prevSuper;
  state.impulseBoost = prevImpulse;

  const potency = isAutoCapture ? 0.65 : 1.0;
  const gainedLuminance = Math.floor(steadyRate * 8 * potency);
  const frenzyAddedSec = isAutoCapture ? 8 : 15;
  const gainedAether = state.era >= 3 && !isAutoCapture ? 1 : 0;
  const gainedFlux = Math.max(
    2,
    Math.round(9 * potency * getFluxMultiplier(state, meta)),
  );

  state.luminance += gainedLuminance;
  state.totalLuminanceRun += gainedLuminance;
  state.aether += gainedAether;
  state.totalAetherRun += gainedAether;
  state.crucible.stellarFlux += gainedFlux;
  state.crucible.totalFluxRun += gainedFlux;
  state.frenzySecondsLeft = Math.min(
    30,
    state.frenzySecondsLeft + frenzyAddedSec,
  );
  evaluateEraUnlocks(state);

  return { gainedLuminance, gainedAether, gainedFlux, frenzyAddedSec };
}

// ============================================================================
// PROGRAMMABLE CLOCKWORK LOGIC AUTOMATOR ENGINE
// ============================================================================

export function getUnlockedAutomatorSlots(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  if (
    state.directives.auto_architect ||
    meta.ascensionNodes.cosmic_architect ||
    state.era >= 3
  ) {
    return 6;
  }
  if (state.era >= 2) {
    return 4;
  }
  return 2;
}

export function getAutomatorIntervalSec(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  let base = 0.85;
  if (state.directives.auto_architect || meta.ascensionNodes.cosmic_architect) {
    base = 0.28;
  } else if (state.era >= 2) {
    base = 0.55;
  }
  const dilationFactor = 1 / (1 + state.crucible.chambers.dilation * 0.12);
  return Math.max(0.16, Number((base * dilationFactor).toFixed(2)));
}

export function isAutomatorActionUnlocked(
  actionId: AutomatorActionId,
  state: OrreryRunState,
  meta: OrreryMetaState,
): boolean {
  if (actionId === 'fire_perfect_impulse') {
    return state.directives.auto_impulse || state.era >= 2;
  }
  if (actionId === 'install_or_upgrade_zodiac') {
    return state.era >= 2 || state.directives.quadrant_unlock_8;
  }
  if (actionId === 'auto_ascend') {
    return (
      state.directives.auto_architect ||
      meta.ascensionNodes.cosmic_architect ||
      meta.ascensionCount >= 1
    );
  }
  return true;
}

export function applyAutomatorPreset(
  state: OrreryRunState,
  presetId: AutomatorPresetId,
): void {
  const preset =
    AUTOMATOR_PRESETS.find((p) => p.id === presetId) ?? AUTOMATOR_PRESETS[0];
  state.automator.activePreset = preset.id;
  state.automator.reserveRatio = preset.reserveRatio;
  state.automator.rules = buildAutomatorRulesFromPreset(preset.id);
  state.automator.enabled = true;
  state.autoUpgradeEnabled = true;
}

export function updateAutomatorRule(
  state: OrreryRunState,
  ruleIndex: number,
  patch: Partial<
    Pick<AutomatorRule, 'enabled' | 'condition' | 'threshold' | 'action'>
  >,
): void {
  const target = state.automator.rules[ruleIndex];
  if (!target) return;
  if (patch.enabled !== undefined) target.enabled = patch.enabled;
  if (patch.condition !== undefined) target.condition = patch.condition;
  if (patch.threshold !== undefined) target.threshold = patch.threshold;
  if (patch.action !== undefined) target.action = patch.action;
  state.automator.activePreset = 'custom';
}

export function getSpendableAutomatorLuminance(state: OrreryRunState): number {
  const ratio = Math.min(0.9, Math.max(0, state.automator.reserveRatio));
  return state.luminance * (1 - ratio);
}

export function findAffordableMilestoneRing(
  state: OrreryRunState,
  meta: OrreryMetaState,
  budget: number,
): OrbitalRingId | null {
  let chosen: OrbitalRingId | null = null;
  let fewestLevels = Infinity;

  for (const rid of RING_ORDER) {
    const r = state.rings[rid];
    if (!r.unlocked) continue;
    const ms = getRingMilestoneMultiplier(r.level, meta);
    if (!ms.nextLevel) continue;
    const quote = getBulkRingUpgradeQuote(rid, state, meta, 'next');
    if (quote.totalCost <= budget && quote.levels < fewestLevels) {
      fewestLevels = quote.levels;
      chosen = rid;
    }
  }
  return chosen;
}

export function findBestRoiRing(
  state: OrreryRunState,
  meta: OrreryMetaState,
  budget: number,
): OrbitalRingId | null {
  let bestRing: OrbitalRingId | null = null;
  let bestRoi = -1;

  const baseRate = estimateLuminancePerSec(state, meta);

  for (const rid of RING_ORDER) {
    const r = state.rings[rid];
    if (!r.unlocked) continue;
    const cost = getSingleLevelCostAt(rid, r.level, meta);
    if (cost > budget || cost <= 0) continue;

    // Pure marginal Δ(rate)/cost calculation
    r.level += 1;
    const nextRate = estimateLuminancePerSec(state, meta);
    r.level -= 1;

    const deltaRate = Math.max(0.0001, nextRate - baseRate);
    // Slight bonus if next level hits a milestone
    const ms = getRingMilestoneMultiplier(r.level, meta);
    const proximityWeight =
      ms.nextLevel && ms.nextLevel - r.level <= 2 ? 1.85 : 1.0;
    const roi = (deltaRate / cost) * proximityWeight;

    if (roi > bestRoi) {
      bestRoi = roi;
      bestRing = rid;
    }
  }

  return bestRing;
}

function countPlanetsNearMeridian(
  state: OrreryRunState,
  meta: OrreryMetaState,
): number {
  const perfectWin = meta.ascensionNodes.wide_meridian ? 0.44 : 0.28;
  let count = 0;
  for (const rid of RING_ORDER) {
    if (
      state.rings[rid].unlocked &&
      angularDistanceToZero(state.rings[rid].angle) <= perfectWin
    ) {
      count++;
    }
  }
  return count;
}

function isRuleConditionMet(
  condition: AutomatorConditionId,
  threshold: number,
  state: OrreryRunState,
  meta: OrreryMetaState,
): boolean {
  const budget = getSpendableAutomatorLuminance(state);

  switch (condition) {
    case 'always':
      return true;
    case 'milestone_affordable':
      return findAffordableMilestoneRing(state, meta, budget) !== null;
    case 'ring_roi_ready':
      return findBestRoiRing(state, meta, budget) !== null;
    case 'planets_near_meridian':
      return countPlanetsNearMeridian(state, meta) >= Math.max(1, threshold);
    case 'tension_above_pct': {
      const pct =
        (state.springTensionSec / Math.max(1, state.maxSpringTensionSec)) * 100;
      return pct >= threshold;
    }
    case 'tension_below_pct': {
      const pct =
        (state.springTensionSec / Math.max(1, state.maxSpringTensionSec)) * 100;
      return pct <= threshold;
    }
    case 'crucible_affordable':
      return CRUCIBLE_CHAMBERS.some((c) => {
        const cost = getCrucibleChamberCost(c.id, state);
        return (
          state.crucible.stellarFlux >= cost.flux && state.aether >= cost.aether
        );
      });
    case 'stardust_ready':
      return calculatePendingStardust(state) >= Math.max(1, threshold);
  }
}

function executeAutomatorAction(
  action: AutomatorActionId,
  state: OrreryRunState,
  meta: OrreryMetaState,
): {
  executed: boolean;
  ascended?: { nextRun: OrreryRunState; earnedStardust: number };
  supernovaFired?: boolean;
} {
  if (!isAutomatorActionUnlocked(action, state, meta)) {
    return { executed: false };
  }

  const budget = getSpendableAutomatorLuminance(state);

  switch (action) {
    case 'unlock_next_ring': {
      for (let i = 1; i < ORBITAL_RINGS.length; i++) {
        const prevId = ORBITAL_RINGS[i - 1].id;
        const def = ORBITAL_RINGS[i];
        if (
          state.rings[prevId].unlocked &&
          !state.rings[def.id].unlocked &&
          state.luminance >= def.unlockCost
        ) {
          return {
            executed: upgradeOrUnlockRing(state, meta, def.id, '1'),
          };
        }
      }
      return { executed: false };
    }

    case 'buy_milestone_ring': {
      const target = findAffordableMilestoneRing(state, meta, budget);
      if (!target) return { executed: false };
      return { executed: upgradeOrUnlockRing(state, meta, target, 'next') };
    }

    case 'buy_best_roi_ring': {
      // Do not drain Luminance on minor levels when within ~15s of unlocking the next orbital ring or Prime Ignition
      for (let i = 1; i < ORBITAL_RINGS.length; i++) {
        const prev = ORBITAL_RINGS[i - 1];
        const cur = ORBITAL_RINGS[i];
        if (state.rings[prev.id].unlocked && !state.rings[cur.id].unlocked) {
          if (
            state.luminance >= cur.unlockCost * 0.35 &&
            state.luminance + state.luminancePerSec * 16 >= cur.unlockCost
          ) {
            return { executed: false };
          }
          break;
        }
      }
      if (
        state.era >= 4 &&
        !state.primeIgnited &&
        state.luminance >= 220_000_000_000 &&
        state.luminance + state.luminancePerSec * 22 >= 1_000_000_000_000
      ) {
        return { executed: false };
      }
      const target = findBestRoiRing(state, meta, budget);
      if (!target) return { executed: false };
      return { executed: upgradeOrUnlockRing(state, meta, target, '1') };
    }

    case 'fire_perfect_impulse': {
      if (state.impulseBoost > 1.25) return { executed: false };
      if (countPlanetsNearMeridian(state, meta) < 1) return { executed: false };
      triggerManualImpulse(state, meta);
      return { executed: true };
    }

    case 'trigger_supernova': {
      const res = triggerSupernovaPulse(state, meta);
      if (!res) return { executed: false };
      return { executed: true, supernovaFired: true };
    }

    case 'upgrade_lowest_crucible': {
      const sorted = [...CRUCIBLE_CHAMBERS].sort(
        (a, b) =>
          state.crucible.chambers[a.id] - state.crucible.chambers[b.id],
      );
      for (const ch of sorted) {
        if (upgradeCrucibleChamber(state, meta, ch.id)) {
          return { executed: true };
        }
      }
      return { executed: false };
    }

    case 'engage_overdrive_max': {
      const desired: OverdriveSpeed = meta.ascensionNodes.perpetual_spring
        ? 8
        : 4;
      if (state.overdriveSpeed === desired || state.springTensionSec < 4) {
        return { executed: false };
      }
      return { executed: setOverdriveSpeed(state, meta, desired) };
    }

    case 'fallback_overdrive_1x': {
      if (state.overdriveSpeed === 1) return { executed: false };
      return { executed: setOverdriveSpeed(state, meta, 1) };
    }

    case 'install_or_upgrade_zodiac': {
      // First try filling any empty unlocked slot using the golden synergy blueprint
      for (let idx = 0; idx < TOTAL_SLOTS; idx++) {
        if (!isSlotUnlocked(state, idx) || state.slots[idx] !== null) continue;
        let desiredMod = SYNERGY_ZODIAC_BLUEPRINT[idx];
        if (MODULES_BY_ID[desiredMod].unlockEra > state.era) {
          desiredMod = idx % 2 === 0 ? 'prism' : 'resonator';
        }
        const cost = getModuleInstallCost(desiredMod, state);
        if (cost.luminance <= budget && state.aether >= cost.aether) {
          if (installSlotModule(state, meta, idx, desiredMod)) {
            return { executed: true };
          }
        }
      }
      // Otherwise upgrade the lowest-tier installed module within budget
      let lowestSlot = -1;
      let lowestTier = 99;
      for (let idx = 0; idx < TOTAL_SLOTS; idx++) {
        const mod = state.slots[idx];
        if (mod && mod.tier < 5 && mod.tier < lowestTier) {
          const upCost = getModuleUpgradeCost(mod);
          if (upCost.luminance <= budget && state.aether >= upCost.aether) {
            lowestTier = mod.tier;
            lowestSlot = idx;
          }
        }
      }
      if (lowestSlot >= 0) {
        return { executed: upgradeSlotModule(state, meta, lowestSlot) };
      }
      return { executed: false };
    }

    case 'auto_ascend': {
      const pending = calculatePendingStardust(state);
      if (pending <= 0) return { executed: false };
      const res = performAstrolabeAscension(state, meta);
      if (!res) return { executed: false };
      return { executed: true, ascended: res };
    }
  }
}

export function evaluateAutomatorStep(
  state: OrreryRunState,
  meta: OrreryMetaState,
): {
  triggeredRuleId: string | null;
  ascended: { earnedStardust: number } | null;
  supernovaFired: boolean;
} {
  if (!state.automator.enabled) {
    return { triggeredRuleId: null, ascended: null, supernovaFired: false };
  }

  const unlockedSlots = getUnlockedAutomatorSlots(state, meta);

  for (
    let i = 0;
    i < Math.min(unlockedSlots, state.automator.rules.length);
    i++
  ) {
    const rule = state.automator.rules[i];
    if (!rule.enabled) continue;
    if (!isRuleConditionMet(rule.condition, rule.threshold, state, meta)) {
      continue;
    }

    const res = executeAutomatorAction(rule.action, state, meta);
    if (!res.executed) continue;

    if (res.ascended) {
      const next = res.ascended.nextRun;
      const prevTotalExec = state.automator.totalActionsExecuted + 1;
      Object.assign(state, next);
      state.automator.totalActionsExecuted = prevTotalExec;
      state.automator.lastActionLabel =
        AUTOMATOR_ACTIONS_BY_ID[rule.action].label;
      if (state.automator.rules[i]) {
        state.automator.rules[i].triggerCount += 1;
        state.automator.rules[i].lastTriggeredAt = state.runSeconds;
      }
      return {
        triggeredRuleId: rule.id,
        ascended: { earnedStardust: res.ascended.earnedStardust },
        supernovaFired: false,
      };
    }

    rule.triggerCount += 1;
    rule.lastTriggeredAt = state.runSeconds;
    state.automator.totalActionsExecuted += 1;
    state.automator.lastActionLabel =
      AUTOMATOR_ACTIONS_BY_ID[rule.action].label;
    evaluateAchievements(state, meta);

    return {
      triggeredRuleId: rule.id,
      ascended: null,
      supernovaFired: Boolean(res.supernovaFired),
    };
  }

  return { triggeredRuleId: null, ascended: null, supernovaFired: false };
}

// ============================================================================
// MAIN SIMULATION STEP
// ============================================================================

export function stepOrrery(
  state: OrreryRunState,
  meta: OrreryMetaState,
  rawDtSec: number,
): StepEvents {
  const dt = Math.min(Math.max(0, rawDtSec), 0.05);
  const events: StepEvents = {
    meridianStrikes: [],
    syzygy: null,
    sectorTriggers: [],
    eraUnlocked: null,
    tutorialCompletedStep: null,
    unlockedAchievements: [],
    cometAutoCaptured: false,
    automatorTriggeredRuleId: null,
    automatorAscended: null,
    supernovaTriggeredByAuto: false,
    primeJustIgnited: false,
  };
  if (dt <= 0) return events;

  state.maxSpringTensionSec = computeMaxSpringTension(state, meta);
  state.maxResonatorCharges = computeMaxResonatorCharges(state);

  // Decay Frenzy & Crucible Supernova timers in real seconds
  if (state.frenzySecondsLeft > 0) {
    state.frenzySecondsLeft = Math.max(0, state.frenzySecondsLeft - dt);
  }
  if (state.crucible.supernovaSecondsLeft > 0) {
    state.crucible.supernovaSecondsLeft = Math.max(
      0,
      state.crucible.supernovaSecondsLeft - dt,
    );
  }
  if (state.crucible.supernovaCooldownSec > 0) {
    state.crucible.supernovaCooldownSec = Math.max(
      0,
      state.crucible.supernovaCooldownSec - dt,
    );
  }

  // Passive Aether synthesis from Crystallizer chamber (Lv.2+)
  const crystLv = state.crucible.chambers.crystallizer;
  if (crystLv >= 2) {
    const synthPeriod = Math.max(9, 30 - crystLv * 2.2);
    state.crucible.aetherSynthProgress +=
      (dt * Math.sqrt(state.overdriveSpeed)) / synthPeriod;
    if (state.crucible.aetherSynthProgress >= 1) {
      const batches = Math.floor(state.crucible.aetherSynthProgress);
      state.crucible.aetherSynthProgress -= batches;
      const aetherMult = meta.ascensionNodes.aether_fountain ? 2.0 : 1;
      const gained = Math.max(1, Math.round(batches * aetherMult));
      state.aether += gained;
      state.totalAetherRun += gained;
    }
  }

  // Golden Comet spawn & flight lifecycle
  if (state.comet.active) {
    state.comet.progress += dt / state.comet.durationSec;
    if (state.directives.auto_impulse && state.comet.progress >= 0.72) {
      catchGoldenComet(state, meta, true);
      events.cometAutoCaptured = true;
    } else if (state.comet.progress >= 1) {
      state.comet.active = false;
      state.comet.progress = 0;
      state.nextCometSpawnSec = 36 + Math.random() * 14;
    }
  } else {
    state.nextCometSpawnSec -= dt;
    if (state.nextCometSpawnSec <= 0) {
      const startA = Math.random() * TWO_PI;
      state.comet = {
        active: true,
        progress: 0,
        durationSec: 9.0,
        startAngle: startA,
        endAngle: startA + Math.PI * (0.78 + Math.random() * 0.44),
      };
    }
  }

  // Overdrive spring tension management
  const modScale = getModulePowerScale(state, meta);
  let chronoRegenPerSec = 0;
  for (const mod of state.slots) {
    if (mod?.typeId === 'chrono') {
      chronoRegenPerSec += 0.2 * mod.tier * modScale;
    }
  }
  const dilationRegenMult = 1 + state.crucible.chambers.dilation * 0.15;
  const passiveRegen =
    ((state.overdriveSpeed === 1 ? 0.16 : 0) + chronoRegenPerSec) *
    dilationRegenMult;
  const springMult = meta.ascensionNodes.perpetual_spring ? 1.8 : 1.0;
  state.springTensionSec = Math.min(
    state.maxSpringTensionSec,
    state.springTensionSec + passiveRegen * springMult * dt,
  );

  if (state.overdriveSpeed > 1) {
    const drain = (state.overdriveSpeed - 1) * 0.85 * dt;
    if (state.springTensionSec >= drain) {
      state.springTensionSec -= drain;
    } else {
      state.springTensionSec = 0;
      state.overdriveSpeed = 1;
    }
  }

  const simDt = dt * state.overdriveSpeed;
  state.runSeconds += dt;

  // Decay manual impulse boost smoothly
  if (state.impulseBoost > 0) {
    state.impulseBoost = Math.max(0, state.impulseBoost - dt * 0.55);
  }

  // Auto-impulse pendulum
  if (state.directives.auto_impulse) {
    state.autoImpulseTimer += simDt;
    if (state.autoImpulseTimer >= 2.4) {
      state.autoImpulseTimer %= 2.4;
      state.impulseBoost = Math.min(1.4, state.impulseBoost + 0.38);
    }
  }

  // Magnetic Phase-Locking torque (enhanced per-ring by 'syzygy' gear mode!)
  let lensCount = 0;
  for (const mod of state.slots) {
    if (mod?.typeId === 'lens') lensCount += mod.tier;
  }
  const baseCoupling =
    (state.directives.phase_coupler ? 0.15 : 0.025) +
    lensCount * 0.04 * modScale +
    (state.crucible.supernovaSecondsLeft > 0 ? 0.22 : 0);

  const leadAngle = state.rings.mercury.angle;
  for (let i = 1; i < RING_ORDER.length; i++) {
    const rid = RING_ORDER[i];
    const r = state.rings[rid];
    if (!r.unlocked) continue;
    const gearPull = r.gearMode === 'syzygy' ? 2.2 : 1.0;
    const strength =
      baseCoupling * gearPull -
      (!state.directives.phase_coupler &&
      lensCount === 0 &&
      r.gearMode !== 'syzygy' &&
      state.crucible.supernovaSecondsLeft <= 0
        ? 0.025
        : 0);
    if (strength <= 0) continue;

    const diff = shortestSignedAngleDiff(leadAngle, r.angle);
    if (Math.abs(diff) < 1.35) {
      r.angle =
        (((r.angle + Math.sin(diff) * strength * simDt) % TWO_PI) + TWO_PI) %
        TWO_PI;
    }
  }

  // Advance orbital angles & detect Meridian + Zodiac sector crossings
  const crossedRings: OrbitalRingId[] = [];
  const aetherMult = meta.ascensionNodes.aether_fountain ? 2.0 : 1.0;
  const fluxMult = getFluxMultiplier(state, meta);

  for (const ringId of RING_ORDER) {
    const ring = state.rings[ringId];
    if (!ring.unlocked) continue;

    const def = RINGS_BY_ID[ringId];
    const omega = getRingAngularVelocity(ringId, state, meta);
    const prevAngle = ring.angle;
    const rawNext = prevAngle + omega * simDt;

    const startTotalSector = Math.floor((prevAngle / TWO_PI) * TOTAL_SLOTS);
    const endTotalSector = Math.floor((rawNext / TWO_PI) * TOTAL_SLOTS);
    const sectorSteps = Math.min(TOTAL_SLOTS, endTotalSector - startTotalSector);

    const baseStrike = getRingMeridianYield(ringId, state, meta);
    const blitzPotency = ring.gearMode === 'blitz' ? 1.45 : 1.0;

    for (let s = 1; s <= sectorSteps; s++) {
      const slotIdx = (startTotalSector + s) % TOTAL_SLOTS;
      const mod = state.slots[slotIdx];
      if (!mod) continue;

      if (mod.typeId === 'prism') {
        let frac = (0.24 + 0.12 * (mod.tier - 1)) * modScale * blitzPotency;
        const [left, right] = getAdjacentSlots(slotIdx);
        if (
          state.slots[left]?.typeId === 'prism' ||
          state.slots[left]?.typeId === 'resonator'
        ) {
          frac *= 1.2;
        }
        if (
          state.slots[right]?.typeId === 'prism' ||
          state.slots[right]?.typeId === 'resonator'
        ) {
          frac *= 1.2;
        }
        const bonusLum = baseStrike * frac;
        state.luminance += bonusLum;
        state.totalLuminanceRun += bonusLum;
        events.sectorTriggers.push({
          slotIndex: slotIdx,
          moduleType: 'prism',
          ringId,
          bonusLuminance: bonusLum,
          bonusAether: 0,
        });
      } else if (mod.typeId === 'resonator') {
        const addedCharges = Math.max(1, Math.round(mod.tier * blitzPotency));
        state.resonatorCharges = Math.min(
          state.maxResonatorCharges,
          state.resonatorCharges + addedCharges,
        );
        events.sectorTriggers.push({
          slotIndex: slotIdx,
          moduleType: 'resonator',
          ringId,
          bonusLuminance: 0,
          bonusAether: 0,
        });
      } else if (mod.typeId === 'condenser' && state.era >= 3) {
        const [left, right] = getAdjacentSlots(slotIdx);
        const adjPrism =
          state.slots[left]?.typeId === 'prism' ||
          state.slots[right]?.typeId === 'prism';
        const chance = Math.min(
          0.75,
          0.1 * mod.tier * blitzPotency * (adjPrism ? 2.0 : 1.0),
        );
        if (Math.random() < chance) {
          const gainedAether = Math.max(1, Math.round(aetherMult));
          state.aether += gainedAether;
          state.totalAetherRun += gainedAether;
          events.sectorTriggers.push({
            slotIndex: slotIdx,
            moduleType: 'condenser',
            ringId,
            bonusLuminance: 0,
            bonusAether: gainedAether,
          });
        }
      }
    }

    const wraps = Math.floor(rawNext / TWO_PI);
    ring.angle = ((rawNext % TWO_PI) + TWO_PI) % TWO_PI;

    if (wraps > 0) {
      ring.lastStrikeAt = state.runSeconds;
      state.totalMeridianStrikes += wraps;
      const payout = baseStrike * wraps;
      state.luminance += payout;
      state.totalLuminanceRun += payout;

      const gearFlux = ring.gearMode === 'harmonic' ? 1.35 : 1.0;
      const fluxGain =
        (0.75 + def.index * 0.55) * wraps * fluxMult * gearFlux;
      state.crucible.stellarFlux += fluxGain;
      state.crucible.totalFluxRun += fluxGain;

      crossedRings.push(ringId);
      events.meridianStrikes.push({ ringId, payout });
    }
  }

  // Syzygy Conjunction evaluation
  if (crossedRings.length > 0) {
    const alignedRings = RING_ORDER.filter(
      (rid) =>
        state.rings[rid].unlocked &&
        angularDistanceToZero(state.rings[rid].angle) <=
          getSyzygyWindowRad(state, meta, rid),
    );

    if (alignedRings.length >= 2) {
      const bodyCount = alignedRings.length;
      const chargesUsed = state.resonatorCharges;
      state.resonatorCharges = 0;

      const syzMult = computeSyzygyMultiplier(bodyCount, chargesUsed, state);
      let combinedBase = 0;
      for (const rid of alignedRings) {
        combinedBase += getRingMeridianYield(rid, state, meta);
      }
      const syzPayout = combinedBase * (syzMult - 1);
      state.luminance += syzPayout;
      state.totalLuminanceRun += syzPayout;

      const syzFlux = bodyCount * bodyCount * 1.4 * fluxMult;
      state.crucible.stellarFlux += syzFlux;
      state.crucible.totalFluxRun += syzFlux;

      let condenserMult = 1;
      for (const mod of state.slots) {
        if (mod?.typeId === 'condenser') {
          condenserMult += 0.25 * mod.tier;
        }
      }
      let aetherEarned = 0;
      const rawBaseAeth =
        (bodyCount >= 3 ? bodyCount - 2 : 0) +
        (state.directives.syzygy_cascade ? 1 : 0);
      if (rawBaseAeth > 0) {
        aetherEarned = Math.max(
          1,
          Math.round(rawBaseAeth * condenserMult * aetherMult),
        );
        state.aether += aetherEarned;
        state.totalAetherRun += aetherEarned;
      }

      if (meta.ascensionNodes.harmonic_overtone) {
        state.harmonicOvertoneBonus = Math.min(
          1.5,
          state.harmonicOvertoneBonus + 0.006 * (bodyCount - 1),
        );
      }

      state.totalSyzygies += 1;
      if (bodyCount > state.bestSyzygyBodies) {
        state.bestSyzygyBodies = bodyCount;
      }

      const record: SyzygyRecord = {
        id: state.totalSyzygies,
        bodyCount,
        multiplier: Number(syzMult.toFixed(1)),
        payout: syzPayout + combinedBase,
        aetherEarned,
        isPerfectImpulse: false,
        timestamp: state.runSeconds,
      };
      state.lastSyzygy = record;
      events.syzygy = record;
    }
  }

  // Programmable Clockwork Logic Automator tick
  state.autoUpgradeEnabled = state.automator.enabled;
  if (state.automator.enabled) {
    state.automator.tickTimer += dt;
    const interval = getAutomatorIntervalSec(state, meta);
    if (state.automator.tickTimer >= interval) {
      state.automator.tickTimer = 0;
      const autoRes = evaluateAutomatorStep(state, meta);
      events.automatorTriggeredRuleId = autoRes.triggeredRuleId;
      events.automatorAscended = autoRes.ascended;
      events.supernovaTriggeredByAuto = autoRes.supernovaFired;
    }
  }

  const est = estimateLuminancePerSec(state, meta);
  state.luminancePerSec =
    state.luminancePerSec === 0
      ? est
      : state.luminancePerSec * 0.85 + est * 0.15;

  if (state.totalLuminanceRun > meta.highestLuminanceEver) {
    meta.highestLuminanceEver = state.totalLuminanceRun;
  }
  if (state.bestSyzygyBodies > meta.bestSyzygyEver) {
    meta.bestSyzygyEver = state.bestSyzygyBodies;
  }

  events.eraUnlocked = evaluateEraUnlocks(state);
  events.tutorialCompletedStep = evaluateTutorialQuests(state, meta);
  events.unlockedAchievements = evaluateAchievements(state, meta);
  return events;
}

export interface ManualImpulseResult {
  gainedLuminance: number;
  gainedFlux: number;
  isPerfect: boolean;
  alignedRingCount: number;
  tutorialCompletedStep: number | null;
}

export function triggerManualImpulse(
  state: OrreryRunState,
  meta: OrreryMetaState,
): ManualImpulseResult {
  state.totalImpulses += 1;
  state.impulseBoost = Math.min(1.85, state.impulseBoost + 0.65);

  const perfectWin = meta.ascensionNodes.wide_meridian ? 0.42 : 0.28;
  let nearMeridianCount = 0;
  let strongestStrike = 1.5;

  for (const rid of RING_ORDER) {
    const r = state.rings[rid];
    if (!r.unlocked) continue;
    const y = getRingMeridianYield(rid, state, meta);
    if (y > strongestStrike) strongestStrike = y;
    if (angularDistanceToZero(r.angle) <= perfectWin) {
      nearMeridianCount++;
    }
  }

  const isPerfect = nearMeridianCount > 0;
  const critMult = isPerfect
    ? meta.ascensionNodes.wide_meridian
      ? 4.2
      : 3.0
    : 1.0;

  if (isPerfect) {
    state.perfectImpulses += 1;
    state.springTensionSec = Math.min(
      state.maxSpringTensionSec,
      state.springTensionSec + 1.5,
    );
    for (const rid of RING_ORDER) {
      const r = state.rings[rid];
      if (!r.unlocked) continue;
      const diff = shortestSignedAngleDiff(0, r.angle);
      r.angle = (((r.angle + diff * 0.24) % TWO_PI) + TWO_PI) % TWO_PI;
    }
  } else {
    for (const rid of RING_ORDER) {
      const r = state.rings[rid];
      if (!r.unlocked) continue;
      r.angle = (r.angle + 0.14) % TWO_PI;
    }
  }

  const gained = Math.max(1.5, strongestStrike * 0.5 * critMult);
  const gainedFlux = (isPerfect ? 1.8 : 0.45) * getFluxMultiplier(state, meta);

  state.luminance += gained;
  state.totalLuminanceRun += gained;
  state.crucible.stellarFlux += gainedFlux;
  state.crucible.totalFluxRun += gainedFlux;

  evaluateEraUnlocks(state);
  const tutorialCompletedStep = evaluateTutorialQuests(state, meta);
  evaluateAchievements(state, meta);

  return {
    gainedLuminance: gained,
    gainedFlux,
    isPerfect,
    alignedRingCount: nearMeridianCount,
    tutorialCompletedStep,
  };
}

export function upgradeOrUnlockRing(
  state: OrreryRunState,
  meta: OrreryMetaState,
  ringId: OrbitalRingId,
  buyMode: BuyMode = '1',
): boolean {
  const quote = getBulkRingUpgradeQuote(ringId, state, meta, buyMode);
  if (!quote.canAfford || state.luminance < quote.totalCost) return false;

  state.luminance -= quote.totalCost;
  const ring = state.rings[ringId];
  if (!ring.unlocked) {
    ring.unlocked = true;
    ring.level = 1;
    ring.angle = (state.rings.mercury.angle + TWO_PI - 0.35) % TWO_PI;
  } else {
    ring.level += quote.levels;
  }
  evaluateEraUnlocks(state);
  evaluateTutorialQuests(state, meta);
  evaluateAchievements(state, meta);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function installSlotModule(
  state: OrreryRunState,
  meta: OrreryMetaState,
  slotIndex: number,
  typeId: ModuleTypeId,
): boolean {
  if (!isSlotUnlocked(state, slotIndex)) return false;
  if (state.slots[slotIndex] !== null) return false;
  const def = MODULES_BY_ID[typeId];
  if (state.era < def.unlockEra) return false;

  const cost = getModuleInstallCost(typeId, state);
  if (state.luminance < cost.luminance || state.aether < cost.aether) {
    return false;
  }

  state.luminance -= cost.luminance;
  state.aether -= cost.aether;
  state.slots[slotIndex] = { typeId, tier: 1 };
  state.maxSpringTensionSec = computeMaxSpringTension(state, meta);
  state.maxResonatorCharges = computeMaxResonatorCharges(state);
  evaluateTutorialQuests(state, meta);
  evaluateAchievements(state, meta);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function upgradeSlotModule(
  state: OrreryRunState,
  meta: OrreryMetaState,
  slotIndex: number,
): boolean {
  const mod = state.slots[slotIndex];
  if (!mod || mod.tier >= 5) return false;
  const cost = getModuleUpgradeCost(mod);
  if (state.luminance < cost.luminance || state.aether < cost.aether) {
    return false;
  }
  state.luminance -= cost.luminance;
  state.aether -= cost.aether;
  mod.tier += 1;
  state.maxSpringTensionSec = computeMaxSpringTension(state, meta);
  state.maxResonatorCharges = computeMaxResonatorCharges(state);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function removeSlotModule(
  state: OrreryRunState,
  meta: OrreryMetaState,
  slotIndex: number,
): boolean {
  const mod = state.slots[slotIndex];
  if (!mod) return false;
  const def = MODULES_BY_ID[mod.typeId];
  state.luminance += Math.floor(def.baseCostLuminance * 0.5 * mod.tier);
  state.slots[slotIndex] = null;
  state.maxSpringTensionSec = computeMaxSpringTension(state, meta);
  state.maxResonatorCharges = computeMaxResonatorCharges(state);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function swapSlotModules(
  state: OrreryRunState,
  meta: OrreryMetaState,
  slotA: number,
  slotB: number,
): boolean {
  if (!isSlotUnlocked(state, slotA) || !isSlotUnlocked(state, slotB)) {
    return false;
  }
  if (slotA === slotB) return false;
  const temp = state.slots[slotA];
  state.slots[slotA] = state.slots[slotB];
  state.slots[slotB] = temp;
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function purchaseDirective(
  state: OrreryRunState,
  meta: OrreryMetaState,
  directiveId: DirectiveId,
): boolean {
  if (state.directives[directiveId]) return false;
  const def = DIRECTIVES_BY_ID[directiveId];
  if (state.era < def.era) return false;
  if (
    state.luminance < def.costLuminance ||
    state.aether < def.costAether
  ) {
    return false;
  }

  state.luminance -= def.costLuminance;
  state.aether -= def.costAether;
  state.directives[directiveId] = true;

  if (directiveId === 'auto_architect') {
    state.automator.enabled = true;
    state.autoUpgradeEnabled = true;
  }
  if (directiveId === 'prime_ignition') {
    state.primeIgnited = true;
    if (
      meta.fastestPrimeSec === null ||
      state.runSeconds < meta.fastestPrimeSec
    ) {
      meta.fastestPrimeSec = Math.round(state.runSeconds);
    }
  }

  evaluateAchievements(state, meta);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export function setOverdriveSpeed(
  state: OrreryRunState,
  meta: OrreryMetaState,
  speed: OverdriveSpeed,
): boolean {
  if (speed === 8 && !meta.ascensionNodes.perpetual_spring) {
    return false;
  }
  if (speed > 1 && state.springTensionSec < 1) {
    return false;
  }
  state.overdriveSpeed = speed;
  if (speed > 1) {
    state.usedOverdriveRun = true;
  }
  evaluateTutorialQuests(state, meta);
  evaluateAchievements(state, meta);
  state.luminancePerSec = estimateLuminancePerSec(state, meta);
  return true;
}

export const ASCENSION_MIN_LUMINANCE = 1_500_000;

export function calculatePendingStardust(state: OrreryRunState): number {
  if (state.totalLuminanceRun < ASCENSION_MIN_LUMINANCE) return 0;
  const raw = Math.pow(
    state.totalLuminanceRun / ASCENSION_MIN_LUMINANCE,
    0.305,
  );
  const primeBonus = state.primeIgnited ? 8 : 0;
  return Math.max(1, Math.floor(raw)) + primeBonus;
}

export function performAstrolabeAscension(
  state: OrreryRunState,
  meta: OrreryMetaState,
): { nextRun: OrreryRunState; earnedStardust: number } | null {
  const earned = calculatePendingStardust(state);
  if (earned <= 0) return null;

  meta.stardust += earned;
  meta.totalStardustEarned += earned;
  meta.ascensionCount += 1;
  meta.tutorialCompletedEver = true;
  meta.achievements.first_ascension = true;

  const nextRun = createNewOrreryRun(meta, state.slots, state.automator);
  return { nextRun, earnedStardust: earned };
}

export function unlockAscensionNode(
  meta: OrreryMetaState,
  nodeId: AscensionNodeId,
  currentRun?: OrreryRunState,
): boolean {
  if (meta.ascensionNodes[nodeId]) return false;
  const def = ASCENSION_NODES_BY_ID[nodeId];
  if (def.requires && !meta.ascensionNodes[def.requires]) return false;
  if (meta.stardust < def.costStardust) return false;

  meta.stardust -= def.costStardust;
  meta.ascensionNodes[nodeId] = true;

  if (currentRun) {
    if (nodeId === 'star_seed') {
      if (!currentRun.rings.venus.unlocked) {
        currentRun.rings.venus.unlocked = true;
        currentRun.rings.venus.level = Math.max(1, currentRun.rings.venus.level);
      }
      if (currentRun.totalLuminanceRun < 900) {
        const delta = 900 - currentRun.totalLuminanceRun;
        currentRun.luminance += delta;
        currentRun.totalLuminanceRun += delta;
      }
      if (currentRun.crucible.totalFluxRun < 32) {
        const fluxDelta = 32 - currentRun.crucible.totalFluxRun;
        currentRun.crucible.stellarFlux += fluxDelta;
        currentRun.crucible.totalFluxRun += fluxDelta;
      }
      currentRun.era = Math.max(2, currentRun.era) as EraIndex;
      currentRun.springTensionSec = Math.min(
        computeMaxSpringTension(currentRun, meta),
        Math.max(40, currentRun.springTensionSec),
      );
    } else if (nodeId === 'aether_fountain') {
      currentRun.directives.quadrant_unlock_8 = true;
    } else if (nodeId === 'cosmic_architect') {
      currentRun.directives.auto_architect = true;
      currentRun.automator.enabled = true;
      currentRun.autoUpgradeEnabled = true;
    }
    currentRun.maxSpringTensionSec = computeMaxSpringTension(currentRun, meta);
    currentRun.luminancePerSec = estimateLuminancePerSec(currentRun, meta);
  }
  return true;
}

export function applyOfflineProgress(
  state: OrreryRunState,
  meta: OrreryMetaState,
  elapsedSec: number,
): OfflineProgressSummary | null {
  const clamped = Math.min(Math.max(0, elapsedSec), 86_400);
  if (clamped < 15) return null;

  const prevOverdrive = state.overdriveSpeed;
  const prevFrenzy = state.frenzySecondsLeft;
  const prevSuper = state.crucible.supernovaSecondsLeft;
  state.overdriveSpeed = 1;
  state.frenzySecondsLeft = 0;
  state.crucible.supernovaSecondsLeft = 0;
  const baseRate = estimateLuminancePerSec(state, meta);
  state.overdriveSpeed = prevOverdrive;
  state.frenzySecondsLeft = prevFrenzy;
  state.crucible.supernovaSecondsLeft = prevSuper;

  const luminanceGained = Math.floor(baseRate * clamped * 0.65);
  state.luminance += luminanceGained;
  state.totalLuminanceRun += luminanceGained;

  const unlockedRings = getUnlockedRingCount(state);
  const fluxGained = Math.floor(
    (clamped / 8) * unlockedRings * getFluxMultiplier(state, meta),
  );
  state.crucible.stellarFlux += fluxGained;
  state.crucible.totalFluxRun += fluxGained;

  let aetherGained = 0;
  if (state.era >= 3 || state.crucible.chambers.crystallizer >= 2) {
    const condenserTiers = state.slots.reduce(
      (sum, m) => sum + (m?.typeId === 'condenser' ? m.tier : 0),
      0,
    );
    const crystBonus =
      state.crucible.chambers.crystallizer >= 2
        ? state.crucible.chambers.crystallizer
        : 0;
    const totalAetherPower = condenserTiers + crystBonus;
    if (totalAetherPower > 0) {
      const aetherMult = meta.ascensionNodes.aether_fountain ? 2.0 : 1;
      aetherGained = Math.floor(
        (clamped / 50) * totalAetherPower * aetherMult,
      );
      state.aether += aetherGained;
      state.totalAetherRun += aetherGained;
    }
  }

  state.maxSpringTensionSec = computeMaxSpringTension(state, meta);
  const springRate =
    (meta.ascensionNodes.perpetual_spring ? 0.54 : 0.3) *
    (1 + state.crucible.chambers.dilation * 0.15);
  const beforeTension = state.springTensionSec;
  state.springTensionSec = Math.min(
    state.maxSpringTensionSec,
    state.springTensionSec + clamped * springRate,
  );
  const tensionGainedSec = Math.max(0, state.springTensionSec - beforeTension);

  evaluateEraUnlocks(state);

  if (
    luminanceGained <= 0 &&
    aetherGained <= 0 &&
    fluxGained <= 0 &&
    tensionGainedSec < 5
  ) {
    return null;
  }

  return {
    elapsedSec: Math.round(clamped),
    luminanceGained,
    aetherGained,
    fluxGained,
    tensionGainedSec: Math.round(tensionGainedSec),
  };
}

export function getUnlockedRingCount(state: OrreryRunState): number {
  let count = 0;
  for (const r of ORBITAL_RINGS) {
    if (state.rings[r.id].unlocked) count++;
  }
  return count;
}
