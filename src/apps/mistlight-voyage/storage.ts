import { LEVELS } from './content.ts';
import { createRun, isRotatable, traceLight } from './engine.ts';
import type { Difficulty, Level, Position, Progress, Run } from './types.ts';

export const SAVE_KEY = '43gg.mistlight_voyage.progress.v1';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const isDifficulty = (value: unknown): value is Difficulty =>
  value === 'relaxed' || value === 'standard' || value === 'expert';
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= max;
export function freshProgress(): Progress {
  return {
    version: 1,
    tutorialCompleted: false,
    preferredDifficulty: 'standard',
    muted: false,
    records: {},
    active: null,
  };
}
function parsePosition(value: unknown, level: Level): Position | null {
  if (
    !object(value) ||
    (value.tide !== 0 && value.tide !== 1) ||
    !object(value.turns)
  )
    return null;
  const turns: Record<string, number> = {};
  for (const tile of level.tiles.filter(isRotatable)) {
    const orientation = value.turns[tile.id];
    if (orientation !== 0 && orientation !== 1) return null;
    turns[tile.id] = orientation;
  }
  return { turns, tide: value.tide };
}
function parseRun(value: unknown, level: Level): Run | null {
  const position = parsePosition(value, level);
  if (
    !position ||
    !object(value) ||
    !integer(value.moves, 100000) ||
    !integer(value.hints, 100000)
  )
    return null;
  const history = Array.isArray(value.history)
    ? value.history.slice(-200).map((item) => parsePosition(item, level))
    : [];
  if (history.some((item) => item === null) || history.length > value.moves)
    return null;
  return {
    ...position,
    moves: value.moves,
    hints: value.hints,
    history: history as Position[],
    won: value.won === true && traceLight(level, position).solved,
  };
}
export function parseProgress(raw: string | null): Progress {
  const result = freshProgress();
  if (!raw) return result;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1) return result;
    result.tutorialCompleted = value.tutorialCompleted === true;
    result.muted = value.muted === true;
    if (isDifficulty(value.preferredDifficulty))
      result.preferredDifficulty = value.preferredDifficulty;
    if (object(value.records)) {
      for (const level of LEVELS) {
        const record = value.records[level.id];
        if (
          object(record) &&
          integer(record.stars, 3) &&
          record.stars >= 1 &&
          integer(record.moves, 100000) &&
          isDifficulty(record.difficulty)
        ) {
          result.records[level.id] = {
            stars: record.stars,
            moves: record.moves,
            difficulty: record.difficulty,
          };
        }
      }
    }
    if (object(value.active)) {
      const active = value.active;
      const level = LEVELS.find((level) => level.id === active.levelId);
      if (level && isUnlocked(level.id, result)) {
        const run = parseRun(active.run, level);
        result.active = { levelId: level.id, run: run ?? createRun(level) };
      }
    }
  } catch {
    /* 损坏存档安全回到新航程。 */
  }
  return result;
}
export function isUnlocked(id: string, progress: Progress): boolean {
  const index = LEVELS.findIndex((level) => level.id === id);
  return (
    index >= 0 &&
    (index === 0 || Boolean(progress.records[LEVELS[index - 1].id]))
  );
}
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export function loadProgress(
  storage: StorageLike | null = browserStorage(),
): Progress {
  try {
    return parseProgress(storage?.getItem(SAVE_KEY) ?? null);
  } catch {
    return freshProgress();
  }
}
export function saveProgress(
  progress: Progress,
  storage: StorageLike | null = browserStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
