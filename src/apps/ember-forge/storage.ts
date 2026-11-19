import type { ForgeDifficulty, ForgeMetaSave, ForgeRunState } from './types.ts';

export const EMBER_FORGE_META_KEY = '43gg.ember_forge.meta.v1';
export const EMBER_FORGE_RUN_KEY = '43gg.ember_forge.run.v1';

const VALID_DIFFICULTIES = new Set<ForgeDifficulty>([
  'casual',
  'standard',
  'master',
]);

export function createDefaultMeta(): ForgeMetaSave {
  return {
    version: 1,
    preferredDifficulty: 'standard',
    tutorialCompleted: false,
    muted: false,
    runsPlayed: 0,
    victories: 0,
    bestScore: 0,
    bestCombo: 0,
    highestStageReached: 1,
  };
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseMetaJson(raw: string | null): ForgeMetaSave {
  const fallback = createDefaultMeta();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<ForgeMetaSave>;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const diff =
      typeof parsed.preferredDifficulty === 'string' &&
      VALID_DIFFICULTIES.has(parsed.preferredDifficulty as ForgeDifficulty)
        ? (parsed.preferredDifficulty as ForgeDifficulty)
        : 'standard';
    return {
      version: 1,
      preferredDifficulty: diff,
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
      muted: Boolean(parsed.muted),
      runsPlayed:
        typeof parsed.runsPlayed === 'number' && Number.isFinite(parsed.runsPlayed) && parsed.runsPlayed >= 0
          ? Math.floor(parsed.runsPlayed)
          : 0,
      victories:
        typeof parsed.victories === 'number' && Number.isFinite(parsed.victories) && parsed.victories >= 0
          ? Math.floor(parsed.victories)
          : 0,
      bestScore:
        typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore) && parsed.bestScore >= 0
          ? Math.floor(parsed.bestScore)
          : 0,
      bestCombo:
        typeof parsed.bestCombo === 'number' && Number.isFinite(parsed.bestCombo) && parsed.bestCombo >= 0
          ? Math.floor(parsed.bestCombo)
          : 0,
      highestStageReached:
        typeof parsed.highestStageReached === 'number' &&
        Number.isFinite(parsed.highestStageReached) &&
        parsed.highestStageReached >= 1
          ? Math.floor(parsed.highestStageReached)
          : 1,
    };
  } catch {
    return fallback;
  }
}

export function loadForgeMeta(storage: Storage | null = getStorage()): ForgeMetaSave {
  if (!storage) return createDefaultMeta();
  try {
    return parseMetaJson(storage.getItem(EMBER_FORGE_META_KEY));
  } catch {
    return createDefaultMeta();
  }
}

export function saveForgeMeta(
  meta: ForgeMetaSave,
  storage: Storage | null = getStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(EMBER_FORGE_META_KEY, JSON.stringify(meta));
  } catch {
    // Ignore quota / sandbox errors
  }
}

export function recordRunOutcome(
  prev: ForgeMetaSave,
  outcome: 'victory' | 'defeat',
  score: number,
  bestCombo: number,
  stageReached: number,
): ForgeMetaSave {
  return {
    ...prev,
    runsPlayed: prev.runsPlayed + 1,
    victories: outcome === 'victory' ? prev.victories + 1 : prev.victories,
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    bestCombo: Math.max(prev.bestCombo, Math.floor(bestCombo)),
    highestStageReached: Math.max(prev.highestStageReached, Math.floor(stageReached)),
  };
}

export function saveActiveForgeRun(
  run: ForgeRunState | null,
  storage: Storage | null = getStorage(),
): void {
  if (!storage) return;
  try {
    if (!run || run.phase === 'defeat') {
      storage.removeItem(EMBER_FORGE_RUN_KEY);
      return;
    }
    // Strip transient particles/trails before saving
    const compact: ForgeRunState = {
      ...run,
      balls: [],
      volleys: [],
      callouts: [],
      shockwaves: [],
      phase: run.phase === 'firing' || run.phase === 'volley' || run.phase === 'enemy_turn' ? 'aiming' : run.phase,
    };
    storage.setItem(EMBER_FORGE_RUN_KEY, JSON.stringify(compact));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveForgeRun(
  storage: Storage | null = getStorage(),
): ForgeRunState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(EMBER_FORGE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ForgeRunState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.hp !== 'number' ||
      typeof parsed.maxHp !== 'number' ||
      !Array.isArray(parsed.deck) ||
      parsed.deck.length === 0 ||
      !Array.isArray(parsed.pegs) ||
      !Array.isArray(parsed.enemies)
    ) {
      return null;
    }
    return parsed as ForgeRunState;
  } catch {
    return null;
  }
}
