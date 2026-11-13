import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';
import { LEGACY_KEYS, isMatchOnCurrentCatalog, migrateLegacyMatch, migrateModuleList } from './legacy.ts';
import type { BotLevel, FcLocalMatch, FcMetaSave } from './lib/types.ts';

export const FC_META_KEY = '43gg.fangcun_realms.meta.v1';
export const FC_ACTIVE_RUN_KEY = '43gg.fangcun_realms.active_run.v1';
export const FC_AUDIO_KEY = '43gg.fangcun_realms.audio.v1';

const VALID_EXPANSIONS = new Set<string>(ALL_EXPANSIONS);

const DEFAULT_META: FcMetaSave = {
  gamesPlayed: 0,
  victories: 0,
  bestScore: 0,
  preferredName: '山人',
  preferredDifficulty: 'NORMAL',
  preferredBotCount: 2,
  preferredExpansions: ['STREAM', 'HERMIT'],
  tutorialCompleted: false,
  lastPlayedAt: null,
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const migrated = new WeakSet<Storage>();

/**
 * Moves saves of the retired app id to the current keys, once per storage. A current key always
 * wins; a legacy key is removed only after its data has been written (or found unusable).
 */
export function migrateLegacySaves(storage: Storage | null = getStorage()): void {
  if (!storage || migrated.has(storage)) return;
  migrated.add(storage);
  try {
    const legacyMeta = storage.getItem(LEGACY_KEYS.meta);
    const legacyTour = storage.getItem(LEGACY_KEYS.tour);
    if (storage.getItem(FC_META_KEY) === null && (legacyMeta !== null || legacyTour !== null)) {
      let parsed: Record<string, unknown> = {};
      try {
        const value = legacyMeta ? (JSON.parse(legacyMeta) as unknown) : null;
        if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
      } catch {
        // corrupt legacy meta: keep only the tutorial flag
      }
      const next: Record<string, unknown> = { ...parsed, tutorialCompleted: legacyTour === '1' || parsed.tutorialCompleted === true };
      if ('preferredExpansions' in parsed) next.preferredExpansions = migrateModuleList(parsed.preferredExpansions, VALID_EXPANSIONS);
      storage.setItem(FC_META_KEY, JSON.stringify(next));
    }
    const legacyRun = storage.getItem(LEGACY_KEYS.activeRun);
    if (legacyRun !== null && storage.getItem(FC_ACTIVE_RUN_KEY) === null) {
      let next: FcLocalMatch | null = null;
      try {
        next = migrateLegacyMatch(JSON.parse(legacyRun));
      } catch {
        next = null;
      }
      if (next) storage.setItem(FC_ACTIVE_RUN_KEY, JSON.stringify(next));
    }
    const legacyAudio = storage.getItem(LEGACY_KEYS.audio);
    if (legacyAudio !== null && storage.getItem(FC_AUDIO_KEY) === null) storage.setItem(FC_AUDIO_KEY, legacyAudio);
    for (const key of Object.values(LEGACY_KEYS)) storage.removeItem(key);
  } catch {
    migrated.delete(storage);
  }
}

export function loadFcMeta(storage: Storage | null = getStorage()): FcMetaSave {
  if (!storage) return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
  migrateLegacySaves(storage);
  try {
    const raw = storage.getItem(FC_META_KEY);
    if (!raw) return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
    const parsed = JSON.parse(raw) as Partial<FcMetaSave>;
    const diff: BotLevel =
      parsed.preferredDifficulty === 'EASY' ||
      parsed.preferredDifficulty === 'NORMAL' ||
      parsed.preferredDifficulty === 'HARD'
        ? parsed.preferredDifficulty
        : 'NORMAL';
    const botCount =
      typeof parsed.preferredBotCount === 'number' &&
      Number.isInteger(parsed.preferredBotCount) &&
      parsed.preferredBotCount >= 1 &&
      parsed.preferredBotCount <= 5
        ? parsed.preferredBotCount
        : 2;
    const expansions = Array.isArray(parsed.preferredExpansions)
      ? migrateModuleList(parsed.preferredExpansions, VALID_EXPANSIONS)
      : [...DEFAULT_META.preferredExpansions];
    return {
      gamesPlayed: typeof parsed.gamesPlayed === 'number' && parsed.gamesPlayed >= 0 ? Math.floor(parsed.gamesPlayed) : 0,
      victories: typeof parsed.victories === 'number' && parsed.victories >= 0 ? Math.floor(parsed.victories) : 0,
      bestScore: typeof parsed.bestScore === 'number' ? Math.floor(parsed.bestScore) : 0,
      preferredName: typeof parsed.preferredName === 'string' && parsed.preferredName.trim() ? parsed.preferredName.trim().slice(0, 16) : '山人',
      preferredDifficulty: diff,
      preferredBotCount: botCount,
      preferredExpansions: expansions,
      tutorialCompleted: parsed.tutorialCompleted === true,
      lastPlayedAt: typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : null,
    };
  } catch {
    return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
  }
}

export function saveFcMeta(meta: FcMetaSave, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(FC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

export function recordFcMatchOutcome(
  won: boolean,
  score: number,
  storage: Storage | null = getStorage(),
): FcMetaSave {
  const prev = loadFcMeta(storage);
  const next: FcMetaSave = {
    ...prev,
    gamesPlayed: prev.gamesPlayed + 1,
    victories: prev.victories + (won ? 1 : 0),
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    lastPlayedAt: new Date().toISOString(),
  };
  saveFcMeta(next, storage);
  return next;
}

export function updateFcPreferences(
  patch: {
    preferredName?: string;
    preferredDifficulty?: BotLevel;
    preferredBotCount?: number;
    preferredExpansions?: ExpansionId[];
    tutorialCompleted?: boolean;
  },
  storage: Storage | null = getStorage(),
): FcMetaSave {
  const prev = loadFcMeta(storage);
  const next: FcMetaSave = {
    ...prev,
    ...(patch.preferredName !== undefined ? { preferredName: patch.preferredName.trim().slice(0, 16) || '山人' } : {}),
    ...(patch.preferredDifficulty !== undefined ? { preferredDifficulty: patch.preferredDifficulty } : {}),
    ...(patch.preferredBotCount !== undefined
      ? { preferredBotCount: Math.min(5, Math.max(1, Math.floor(patch.preferredBotCount))) }
      : {}),
    ...(patch.preferredExpansions !== undefined ? { preferredExpansions: [...patch.preferredExpansions] } : {}),
    ...(patch.tutorialCompleted !== undefined ? { tutorialCompleted: patch.tutorialCompleted } : {}),
  };
  saveFcMeta(next, storage);
  return next;
}

export function loadActiveFcRun(storage: Storage | null = getStorage()): FcLocalMatch | null {
  if (!storage) return null;
  migrateLegacySaves(storage);
  try {
    const raw = storage.getItem(FC_ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FcLocalMatch>;
    if (
      !parsed ||
      typeof parsed.humanSeat !== 'number' ||
      !parsed.state ||
      !Array.isArray(parsed.seats) ||
      !Array.isArray(parsed.state.players)
    ) {
      return null;
    }
    if (parsed.state.finished) return null;
    if (!isMatchOnCurrentCatalog(parsed as FcLocalMatch)) return null;
    return parsed as FcLocalMatch;
  } catch {
    return null;
  }
}

export function saveActiveFcRun(match: FcLocalMatch | null, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    if (!match || match.state.finished) {
      storage.removeItem(FC_ACTIVE_RUN_KEY);
    } else {
      storage.setItem(FC_ACTIVE_RUN_KEY, JSON.stringify(match));
    }
  } catch {
    // ignore storage errors
  }
}
