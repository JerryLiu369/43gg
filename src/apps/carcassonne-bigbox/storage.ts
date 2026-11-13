import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';
import type { BotLevel, CarcLocalMatch, CarcMetaSave } from './lib/types.ts';

export const CARC_META_KEY = '43gg.carcassonne_bigbox.meta.v1';
export const CARC_ACTIVE_RUN_KEY = '43gg.carcassonne_bigbox.active_run.v1';
export const CARC_TOUR_KEY = '43gg.carcassonne_bigbox.tour.v1';

const VALID_EXPANSIONS = new Set<ExpansionId>(ALL_EXPANSIONS);

const DEFAULT_META: CarcMetaSave = {
  gamesPlayed: 0,
  victories: 0,
  bestScore: 0,
  preferredName: '领主',
  preferredDifficulty: 'NORMAL',
  preferredBotCount: 2,
  preferredExpansions: ['RIVER', 'ABBOT'],
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

export function loadCarcMeta(storage: Storage | null = getStorage()): CarcMetaSave {
  if (!storage) return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
  try {
    const raw = storage.getItem(CARC_META_KEY);
    if (!raw) return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
    const parsed = JSON.parse(raw) as Partial<CarcMetaSave>;
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
      ? parsed.preferredExpansions.filter((e): e is ExpansionId => typeof e === 'string' && VALID_EXPANSIONS.has(e as ExpansionId))
      : [...DEFAULT_META.preferredExpansions];
    return {
      gamesPlayed: typeof parsed.gamesPlayed === 'number' && parsed.gamesPlayed >= 0 ? Math.floor(parsed.gamesPlayed) : 0,
      victories: typeof parsed.victories === 'number' && parsed.victories >= 0 ? Math.floor(parsed.victories) : 0,
      bestScore: typeof parsed.bestScore === 'number' ? Math.floor(parsed.bestScore) : 0,
      preferredName: typeof parsed.preferredName === 'string' && parsed.preferredName.trim() ? parsed.preferredName.trim().slice(0, 16) : '领主',
      preferredDifficulty: diff,
      preferredBotCount: botCount,
      preferredExpansions: expansions,
      lastPlayedAt: typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : null,
    };
  } catch {
    return { ...DEFAULT_META, preferredExpansions: [...DEFAULT_META.preferredExpansions] };
  }
}

export function saveCarcMeta(meta: CarcMetaSave, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CARC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

export function recordCarcMatchOutcome(
  won: boolean,
  score: number,
  storage: Storage | null = getStorage(),
): CarcMetaSave {
  const prev = loadCarcMeta(storage);
  const next: CarcMetaSave = {
    ...prev,
    gamesPlayed: prev.gamesPlayed + 1,
    victories: prev.victories + (won ? 1 : 0),
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    lastPlayedAt: new Date().toISOString(),
  };
  saveCarcMeta(next, storage);
  return next;
}

export function updateCarcPreferences(
  patch: {
    preferredName?: string;
    preferredDifficulty?: BotLevel;
    preferredBotCount?: number;
    preferredExpansions?: ExpansionId[];
  },
  storage: Storage | null = getStorage(),
): CarcMetaSave {
  const prev = loadCarcMeta(storage);
  const next: CarcMetaSave = {
    ...prev,
    ...(patch.preferredName !== undefined ? { preferredName: patch.preferredName.trim().slice(0, 16) || '领主' } : {}),
    ...(patch.preferredDifficulty !== undefined ? { preferredDifficulty: patch.preferredDifficulty } : {}),
    ...(patch.preferredBotCount !== undefined
      ? { preferredBotCount: Math.min(5, Math.max(1, Math.floor(patch.preferredBotCount))) }
      : {}),
    ...(patch.preferredExpansions !== undefined ? { preferredExpansions: [...patch.preferredExpansions] } : {}),
  };
  saveCarcMeta(next, storage);
  return next;
}

export function loadActiveCarcRun(storage: Storage | null = getStorage()): CarcLocalMatch | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CARC_ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CarcLocalMatch>;
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
    return parsed as CarcLocalMatch;
  } catch {
    return null;
  }
}

export function saveActiveCarcRun(match: CarcLocalMatch | null, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    if (!match || match.state.finished) {
      storage.removeItem(CARC_ACTIVE_RUN_KEY);
    } else {
      storage.setItem(CARC_ACTIVE_RUN_KEY, JSON.stringify(match));
    }
  } catch {
    // ignore storage errors
  }
}

export function isCarcTourDone(storage: Storage | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(CARC_TOUR_KEY) === '1';
  } catch {
    return true;
  }
}

export function markCarcTourDone(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CARC_TOUR_KEY, '1');
  } catch {
    // ignore
  }
}
