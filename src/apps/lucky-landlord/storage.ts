import { LANDLORDS_BY_ID, ROOMS_BY_ID, SYMBOLS_BY_ID } from './content.ts';
import type { MetaSaveData, RoomTypeId, RunRecordSummary, RunState } from './types.ts';

const ACTIVE_RUN_KEY = 'gaistudio.lucky_landlord.active_run.v1';
const META_SAVE_KEY = 'gaistudio.lucky_landlord.meta.v1';
const PREFS_KEY = 'gaistudio.lucky_landlord.prefs.v1';

export interface UserPrefs {
  muted: boolean;
  fastSpin: boolean;
  tutorialCompleted: boolean;
}

export function createInitialMetaSave(): MetaSaveData {
  return {
    version: 1,
    unlockedAscension: 1,
    discoveredSymbols: [
      'worker_tenant',
      'milk_tea',
      'orange_cat',
      'parcel_box',
      'lease_contract',
    ],
    discoveredRelics: [],
    discoveredRooms: ['plain', 'gold_shop', 'sun_greenhouse', 'craft_workshop', 'express_hub'],
    totalRuns: 0,
    totalVictories: 0,
    highestCycle: 1,
    highestSingleSpin: 0,
    recentRecords: [],
  };
}

export function loadMetaSave(): MetaSaveData {
  if (typeof window === 'undefined') return createInitialMetaSave();
  try {
    const raw = window.localStorage.getItem(META_SAVE_KEY);
    if (!raw) return createInitialMetaSave();
    const parsed = JSON.parse(raw) as Partial<MetaSaveData>;
    if (!parsed || typeof parsed !== 'object') return createInitialMetaSave();
    const base = createInitialMetaSave();
    return {
      version: 1,
      unlockedAscension: Math.max(1, Math.min(10, Number(parsed.unlockedAscension) || 1)),
      discoveredSymbols: Array.isArray(parsed.discoveredSymbols)
        ? parsed.discoveredSymbols.filter((id) => Boolean(SYMBOLS_BY_ID[id]))
        : base.discoveredSymbols,
      discoveredRelics: Array.isArray(parsed.discoveredRelics) ? parsed.discoveredRelics : [],
      discoveredRooms: Array.isArray(parsed.discoveredRooms)
        ? (parsed.discoveredRooms.filter((r) => Boolean(ROOMS_BY_ID[r as RoomTypeId])) as RoomTypeId[])
        : base.discoveredRooms,
      totalRuns: Number(parsed.totalRuns) || 0,
      totalVictories: Number(parsed.totalVictories) || 0,
      highestCycle: Number(parsed.highestCycle) || 1,
      highestSingleSpin: Number(parsed.highestSingleSpin) || 0,
      recentRecords: Array.isArray(parsed.recentRecords) ? parsed.recentRecords.slice(0, 12) : [],
    };
  } catch {
    return createInitialMetaSave();
  }
}

export function saveMetaSave(meta: MetaSaveData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_SAVE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore quota errors
  }
}

export function syncDiscoveredFromRun(meta: MetaSaveData, run: RunState): MetaSaveData {
  const symSet = new Set(meta.discoveredSymbols);
  for (const inst of run.deck) {
    symSet.add(inst.defId);
  }
  const relSet = new Set(meta.discoveredRelics);
  for (const rId of run.relicIds) {
    relSet.add(rId);
  }
  const roomSet = new Set<RoomTypeId>(meta.discoveredRooms);
  for (const cell of run.board) {
    roomSet.add(cell.room);
  }

  const next: MetaSaveData = {
    ...meta,
    discoveredSymbols: Array.from(symSet),
    discoveredRelics: Array.from(relSet),
    discoveredRooms: Array.from(roomSet),
    highestCycle: Math.max(meta.highestCycle, run.cycle),
    highestSingleSpin: Math.max(meta.highestSingleSpin, run.bestSingleSpin),
  };
  saveMetaSave(next);
  return next;
}

export function recordRunCompletion(
  meta: MetaSaveData,
  run: RunState,
  outcome: 'victory' | 'endless' | 'bankrupt',
): MetaSaveData {
  const synced = syncDiscoveredFromRun(meta, run);
  const isWin = outcome === 'victory' || (outcome === 'endless' && run.cycle >= 12);
  const nextAsc =
    isWin && run.ascension >= synced.unlockedAscension
      ? Math.min(10, synced.unlockedAscension + 1)
      : synced.unlockedAscension;

  const entry: RunRecordSummary = {
    id: `rec_${Date.now()}`,
    dateIso: new Date().toISOString(),
    landlordId: run.landlordId,
    ascension: run.ascension,
    outcome,
    cycleReached: run.cycle,
    totalCoinsEarned: run.totalCoinsEarned,
    bestSingleSpin: run.bestSingleSpin,
  };

  const next: MetaSaveData = {
    ...synced,
    unlockedAscension: nextAsc,
    totalRuns: synced.totalRuns + 1,
    totalVictories: synced.totalVictories + (isWin ? 1 : 0),
    recentRecords: [entry, ...synced.recentRecords].slice(0, 10),
  };
  saveMetaSave(next);
  return next;
}

export function loadSavedActiveRun(): RunState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunState;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !LANDLORDS_BY_ID[parsed.landlordId] ||
      !Array.isArray(parsed.deck) ||
      !Array.isArray(parsed.board) ||
      parsed.board.length !== 20 ||
      parsed.phase === 'gameover'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveRun(run: RunState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!run || run.phase === 'gameover') {
      window.localStorage.removeItem(ACTIVE_RUN_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(run));
    }
  } catch {
    // Ignore storage quota failures
  }
}

export function loadUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') {
    return { muted: false, fastSpin: false, tutorialCompleted: false };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { muted: false, fastSpin: false, tutorialCompleted: false };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      muted: Boolean(parsed.muted),
      fastSpin: Boolean(parsed.fastSpin),
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
    };
  } catch {
    return { muted: false, fastSpin: false, tutorialCompleted: false };
  }
}

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}
