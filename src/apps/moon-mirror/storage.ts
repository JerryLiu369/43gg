import { LEVELS } from './content.ts';
import { getStars } from './engine.ts';
import type { DifficultyTier, LevelRecord, MoonMirrorSave } from './types.ts';

export const MOON_MIRROR_SAVE_KEY = '43gg.moon_mirror.progress.v1';

export function createDefaultSave(): MoonMirrorSave {
  return {
    version: 1,
    unlockedLevel: 1,
    records: {},
    muted: false,
    tutorialCompleted: false,
    preferredDifficulty: 'standard',
  };
}

function isDifficulty(value: unknown): value is DifficultyTier {
  return value === 'casual' || value === 'standard' || value === 'master';
}

export function sanitizeSave(value: unknown): MoonMirrorSave {
  const fallback = createDefaultSave();
  if (!value || typeof value !== 'object') return fallback;
  const parsed = value as Partial<MoonMirrorSave>;
  if (parsed.version !== 1) return fallback;
  if (
    parsed.unlockedLevel !== undefined &&
    (!Number.isInteger(parsed.unlockedLevel) ||
      (parsed.unlockedLevel as number) < 1 ||
      (parsed.unlockedLevel as number) > LEVELS.length)
  ) {
    return fallback;
  }
  const records: Record<string, LevelRecord> = {};

  if (parsed.records && typeof parsed.records === 'object') {
    for (const level of LEVELS) {
      const record = (parsed.records as Record<string, unknown>)[level.id];
      if (!record || typeof record !== 'object') continue;
      const candidate = record as Partial<LevelRecord>;
      if (
        typeof candidate.bestMoves !== 'number' ||
        !Number.isFinite(candidate.bestMoves) ||
        candidate.bestMoves < 1
      ) {
        continue;
      }
      const completed: LevelRecord['completed'] = {};
      for (const difficulty of ['casual', 'standard', 'master'] as const) {
        if (candidate.completed?.[difficulty] === true) completed[difficulty] = true;
      }
      if (Object.keys(completed).length === 0) continue;
      const stars = typeof candidate.stars === 'number' && Number.isFinite(candidate.stars)
        ? candidate.stars
        : 1;
      records[level.id] = {
        bestMoves: Math.max(1, Math.floor(candidate.bestMoves)),
        stars: Math.max(1, Math.min(3, Math.floor(stars))) as 1 | 2 | 3,
        completed,
      };
    }
  }

  let inferredUnlock = 1;
  while (
    inferredUnlock < LEVELS.length &&
    records[LEVELS[inferredUnlock - 1].id]
  ) {
    inferredUnlock += 1;
  }

  return {
    version: 1,
    unlockedLevel: Math.max(inferredUnlock, Math.floor(parsed.unlockedLevel ?? 1)),
    records,
    muted: typeof parsed.muted === 'boolean' ? parsed.muted : fallback.muted,
    tutorialCompleted:
      typeof parsed.tutorialCompleted === 'boolean'
        ? parsed.tutorialCompleted
        : fallback.tutorialCompleted,
    preferredDifficulty: isDifficulty(parsed.preferredDifficulty)
      ? parsed.preferredDifficulty
      : fallback.preferredDifficulty,
  };
}

export function loadMoonMirrorSave(): MoonMirrorSave {
  if (typeof window === 'undefined') return createDefaultSave();
  try {
    const raw = window.localStorage.getItem(MOON_MIRROR_SAVE_KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : createDefaultSave();
  } catch {
    return createDefaultSave();
  }
}

export function saveMoonMirrorSave(save: MoonMirrorSave): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOON_MIRROR_SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable in private or embedded contexts; gameplay remains functional.
  }
}

export function recordLevelCompletion(
  previous: MoonMirrorSave,
  levelIndex: number,
  difficulty: DifficultyTier,
  moves: number,
): MoonMirrorSave {
  const level = LEVELS[levelIndex];
  if (!level) return previous;
  const old = previous.records[level.id];
  const bestMoves = old ? Math.min(old.bestMoves, moves) : moves;
  const record: LevelRecord = {
    bestMoves,
    stars: Math.max(old?.stars ?? 0, getStars(level, moves)) as 1 | 2 | 3,
    completed: { ...old?.completed, [difficulty]: true },
  };
  return {
    ...previous,
    unlockedLevel: Math.max(previous.unlockedLevel, Math.min(LEVELS.length, levelIndex + 2)),
    records: { ...previous.records, [level.id]: record },
  };
}
