import type { BotLevel } from './engine.ts';
import type { TtrLocalMatch, TtrMetaSave } from './types.ts';

export const TTR_META_KEY = '43gg.ticket_to_ride_europe.meta.v1';
export const TTR_ACTIVE_RUN_KEY = '43gg.ticket_to_ride_europe.active_run.v1';
export const TTR_TOUR_KEY = '43gg.ticket_to_ride_europe.tour.v1';

const DEFAULT_META: TtrMetaSave = {
  gamesPlayed: 0,
  victories: 0,
  bestScore: 0,
  preferredName: '旅人',
  preferredDifficulty: 'MEDIUM',
  preferredBotCount: 2,
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

export function loadTtrMeta(storage: Storage | null = getStorage()): TtrMetaSave {
  if (!storage) return { ...DEFAULT_META };
  try {
    const raw = storage.getItem(TTR_META_KEY);
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<TtrMetaSave>;
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
      lastPlayedAt: typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : null,
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function saveTtrMeta(meta: TtrMetaSave, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TTR_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}

export function recordTtrMatchOutcome(
  won: boolean,
  score: number,
  storage: Storage | null = getStorage(),
): TtrMetaSave {
  const prev = loadTtrMeta(storage);
  const next: TtrMetaSave = {
    ...prev,
    gamesPlayed: prev.gamesPlayed + 1,
    victories: prev.victories + (won ? 1 : 0),
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    lastPlayedAt: new Date().toISOString(),
  };
  saveTtrMeta(next, storage);
  return next;
}

export function updateTtrPreferences(
  patch: { preferredName?: string; preferredDifficulty?: BotLevel; preferredBotCount?: number },
  storage: Storage | null = getStorage(),
): TtrMetaSave {
  const prev = loadTtrMeta(storage);
  const next: TtrMetaSave = {
    ...prev,
    ...(patch.preferredName !== undefined ? { preferredName: patch.preferredName.trim().slice(0, 16) || '旅人' } : {}),
    ...(patch.preferredDifficulty !== undefined ? { preferredDifficulty: patch.preferredDifficulty } : {}),
    ...(patch.preferredBotCount !== undefined
      ? { preferredBotCount: Math.min(4, Math.max(1, Math.floor(patch.preferredBotCount))) }
      : {}),
  };
  saveTtrMeta(next, storage);
  return next;
}

export function loadActiveTtrRun(storage: Storage | null = getStorage()): TtrLocalMatch | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TTR_ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TtrLocalMatch>;
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
    return parsed as TtrLocalMatch;
  } catch {
    return null;
  }
}

export function saveActiveTtrRun(match: TtrLocalMatch | null, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    if (!match || match.state.status === 'GAME_OVER' || match.state.status === 'ABANDONED') {
      storage.removeItem(TTR_ACTIVE_RUN_KEY);
    } else {
      storage.setItem(TTR_ACTIVE_RUN_KEY, JSON.stringify(match));
    }
  } catch {
    // ignore storage errors
  }
}

export function isTtrTourDone(storage: Storage | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TTR_TOUR_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTtrTourDone(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TTR_TOUR_KEY, '1');
  } catch {
    // ignore
  }
}
