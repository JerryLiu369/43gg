import type { BotLevel } from './engine.ts';
import { LEGACY_KEYS, isMatchOnCurrentBoard, migrateLegacyMatch } from './legacy.ts';
import type { MerLocalMatch, MerMetaSave } from './types.ts';

export const MER_META_KEY = '43gg.meridian_rails.meta.v1';
export const MER_ACTIVE_RUN_KEY = '43gg.meridian_rails.active_run.v1';
export const MER_AUDIO_KEY = '43gg.meridian_rails.audio.v1';

const DEFAULT_META: MerMetaSave = {
  gamesPlayed: 0,
  victories: 0,
  bestScore: 0,
  preferredName: '旅人',
  preferredDifficulty: 'MEDIUM',
  preferredBotCount: 2,
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
    if (storage.getItem(MER_META_KEY) === null && (legacyMeta !== null || legacyTour !== null)) {
      let parsed: Record<string, unknown> = {};
      try {
        const value = legacyMeta ? (JSON.parse(legacyMeta) as unknown) : null;
        if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
      } catch {
        // corrupt legacy meta: keep only the tutorial flag
      }
      storage.setItem(MER_META_KEY, JSON.stringify({ ...parsed, tutorialCompleted: legacyTour === '1' || parsed.tutorialCompleted === true }));
    }
    const legacyRun = storage.getItem(LEGACY_KEYS.activeRun);
    if (legacyRun !== null && storage.getItem(MER_ACTIVE_RUN_KEY) === null) {
      let next: MerLocalMatch | null = null;
      try {
        next = migrateLegacyMatch(JSON.parse(legacyRun));
      } catch {
        next = null;
      }
      if (next) storage.setItem(MER_ACTIVE_RUN_KEY, JSON.stringify(next));
    }
    const legacyAudio = storage.getItem(LEGACY_KEYS.audio);
    if (legacyAudio !== null && storage.getItem(MER_AUDIO_KEY) === null) storage.setItem(MER_AUDIO_KEY, legacyAudio);
    for (const key of Object.values(LEGACY_KEYS)) storage.removeItem(key);
  } catch {
    // quota or sandbox errors: legacy keys stay put and are retried next session
    migrated.delete(storage);
  }
}

export function loadMerMeta(storage: Storage | null = getStorage()): MerMetaSave {
  if (!storage) return { ...DEFAULT_META };
  migrateLegacySaves(storage);
  try {
    const raw = storage.getItem(MER_META_KEY);
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<MerMetaSave>;
    const diff =
      parsed.preferredDifficulty === 'EASY' ||
      parsed.preferredDifficulty === 'MEDIUM' ||
      parsed.preferredDifficulty === 'ADVANCED'
        ? parsed.preferredDifficulty
        : 'MEDIUM';
    const botCount =
      typeof parsed.preferredBotCount === 'number' &&
      Number.isInteger(parsed.preferredBotCount) &&
      parsed.preferredBotCount >= 1 &&
      parsed.preferredBotCount <= 4
        ? parsed.preferredBotCount
        : 2;
    return {
      gamesPlayed: typeof parsed.gamesPlayed === 'number' && parsed.gamesPlayed >= 0 ? Math.floor(parsed.gamesPlayed) : 0,
      victories: typeof parsed.victories === 'number' && parsed.victories >= 0 ? Math.floor(parsed.victories) : 0,
      bestScore: typeof parsed.bestScore === 'number' ? Math.floor(parsed.bestScore) : 0,
      preferredName: typeof parsed.preferredName === 'string' && parsed.preferredName.trim() ? parsed.preferredName.trim().slice(0, 16) : '旅人',
      preferredDifficulty: diff,
      preferredBotCount: botCount,
      tutorialCompleted: parsed.tutorialCompleted === true,
      lastPlayedAt: typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : null,
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function saveMerMeta(meta: MerMetaSave, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(MER_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}

export function recordMerMatchOutcome(
  won: boolean,
  score: number,
  storage: Storage | null = getStorage(),
): MerMetaSave {
  const prev = loadMerMeta(storage);
  const next: MerMetaSave = {
    ...prev,
    gamesPlayed: prev.gamesPlayed + 1,
    victories: prev.victories + (won ? 1 : 0),
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    lastPlayedAt: new Date().toISOString(),
  };
  saveMerMeta(next, storage);
  return next;
}

export function updateMerPreferences(
  patch: { preferredName?: string; preferredDifficulty?: BotLevel; preferredBotCount?: number; tutorialCompleted?: boolean },
  storage: Storage | null = getStorage(),
): MerMetaSave {
  const prev = loadMerMeta(storage);
  const next: MerMetaSave = {
    ...prev,
    ...(patch.preferredName !== undefined ? { preferredName: patch.preferredName.trim().slice(0, 16) || '旅人' } : {}),
    ...(patch.preferredDifficulty !== undefined ? { preferredDifficulty: patch.preferredDifficulty } : {}),
    ...(patch.preferredBotCount !== undefined
      ? { preferredBotCount: Math.min(4, Math.max(1, Math.floor(patch.preferredBotCount))) }
      : {}),
    ...(patch.tutorialCompleted !== undefined ? { tutorialCompleted: patch.tutorialCompleted } : {}),
  };
  saveMerMeta(next, storage);
  return next;
}

export function loadActiveMerRun(storage: Storage | null = getStorage()): MerLocalMatch | null {
  if (!storage) return null;
  migrateLegacySaves(storage);
  try {
    const raw = storage.getItem(MER_ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MerLocalMatch>;
    if (
      !parsed ||
      typeof parsed.humanPlayerId !== 'string' ||
      !parsed.state ||
      !Array.isArray(parsed.state.players) ||
      !Array.isArray(parsed.log)
    ) {
      return null;
    }
    if (parsed.state.status === 'GAME_OVER' || parsed.state.status === 'ABANDONED') {
      return null;
    }
    // A save that references cities, routes or tickets the board no longer has is unusable.
    if (!isMatchOnCurrentBoard(parsed as MerLocalMatch)) return null;
    return parsed as MerLocalMatch;
  } catch {
    return null;
  }
}

export function saveActiveMerRun(match: MerLocalMatch | null, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    if (!match || match.state.status === 'GAME_OVER' || match.state.status === 'ABANDONED') {
      storage.removeItem(MER_ACTIVE_RUN_KEY);
    } else {
      storage.setItem(MER_ACTIVE_RUN_KEY, JSON.stringify(match));
    }
  } catch {
    // ignore storage errors
  }
}
