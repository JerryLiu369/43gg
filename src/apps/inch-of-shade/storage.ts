import type { Difficulty, InchOfShadeMeta, LevelRecord } from './types.ts';

export const META_STORAGE_KEY = '43gg.inch_of_shade.meta.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'casual' || value === 'standard' || value === 'master';
}

export function createDefaultMeta(): InchOfShadeMeta {
  return {
    version: 1,
    records: {},
    lastLevelId: null,
    preferredDifficulty: 'standard',
    tutorialCompleted: false,
    muted: false,
  };
}

function sanitizeRecord(raw: unknown): LevelRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<LevelRecord>;
  const solved = Boolean(r.solved);
  const bestSteps =
    typeof r.bestSteps === 'number' && Number.isFinite(r.bestSteps) && r.bestSteps > 0
      ? Math.floor(r.bestSteps)
      : null;
  return { solved, bestSteps: solved ? bestSteps : null, seal: solved && Boolean(r.seal) };
}

/** 读取存档；损坏或未知结构时安全回退到初始状态 */
export function loadMeta(
  validLevelIds: ReadonlyArray<string>,
  storage: KeyValueStorage | null = browserStorage(),
): InchOfShadeMeta {
  const fallback = createDefaultMeta();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<InchOfShadeMeta> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const valid = new Set(validLevelIds);
    const records: Record<string, LevelRecord> = {};
    if (parsed.records && typeof parsed.records === 'object') {
      for (const [id, rec] of Object.entries(parsed.records)) {
        if (!valid.has(id)) continue;
        const clean = sanitizeRecord(rec);
        if (clean) records[id] = clean;
      }
    }
    return {
      version: 1,
      records,
      lastLevelId:
        typeof parsed.lastLevelId === 'string' && valid.has(parsed.lastLevelId)
          ? parsed.lastLevelId
          : null,
      preferredDifficulty: isDifficulty(parsed.preferredDifficulty)
        ? parsed.preferredDifficulty
        : 'standard',
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return fallback;
  }
}

export function saveMeta(
  meta: InchOfShadeMeta,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // 存储配额或隐私模式下忽略
  }
}

/** 记录一次通关，返回新存档与是否刷新了最佳步数 */
export function recordSolve(
  meta: InchOfShadeMeta,
  levelId: string,
  steps: number,
  par: number,
  pawsUsed: number,
): { meta: InchOfShadeMeta; improved: boolean; sealEarned: boolean } {
  const prev = meta.records[levelId];
  const sealNow = pawsUsed === 0 && steps <= par;
  const improved = !prev?.solved || prev.bestSteps === null || steps < prev.bestSteps;
  const record: LevelRecord = {
    solved: true,
    bestSteps: prev?.bestSteps != null ? Math.min(prev.bestSteps, steps) : steps,
    seal: Boolean(prev?.seal) || sealNow,
  };
  return {
    meta: { ...meta, records: { ...meta.records, [levelId]: record } },
    improved,
    sealEarned: sealNow && !prev?.seal,
  };
}
