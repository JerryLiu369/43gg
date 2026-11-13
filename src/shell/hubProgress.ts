export interface StorageReader {
  getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export interface HubProgressSnapshot {
  lastPlayedAppId: string | null;
  progressByAppId: Record<string, string>;
}

export const HUB_LAST_PLAYED_KEY = '43gg.hub.last_played.v1';

const XUANJI_META_KEY = '43gg.xuanji_breach.meta.v1';
const INK_BLADE_META_KEY = '43gg.ink_blade.meta.v1';
const ORRERY_RUN_KEY = '43gg.astral_orrery.run.v1';
const ORRERY_META_KEY = '43gg.astral_orrery.meta.v1';
const LANDLORD_RUN_KEY = '43gg.lucky_landlord.active_run.v1';
const LANDLORD_META_KEY = '43gg.lucky_landlord.meta.v1';
const RALLY_RECORDS_KEY = '43gg.chrono_stage.records.v1';

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}

function getBrowserStorage(): StorageWriter | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function recordLastPlayedApp(
  appId: string,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  if (!storage || !appId) return;
  try {
    storage.setItem(
      HUB_LAST_PLAYED_KEY,
      JSON.stringify({
        appId,
        playedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage quota or sandbox errors
  }
}

function summarizeXuanji(storage: StorageReader): string | null {
  const meta = safeParseJson<{
    runsPlayed?: unknown;
    victories?: unknown;
    bestScore?: unknown;
    highestSectorReached?: unknown;
  }>(storage.getItem(XUANJI_META_KEY));
  if (!meta) return null;

  const victories = typeof meta.victories === 'number' ? Math.floor(meta.victories) : 0;
  const runsPlayed = typeof meta.runsPlayed === 'number' ? Math.floor(meta.runsPlayed) : 0;
  const bestScore = typeof meta.bestScore === 'number' ? Math.floor(meta.bestScore) : 0;
  const highestSector =
    typeof meta.highestSectorReached === 'number' ? Math.floor(meta.highestSectorReached) : 0;

  if (victories > 0) {
    return `已破阵通关 ${victories} 次 · 最高 ${bestScore} 分`;
  }
  if (runsPlayed > 0 || highestSector > 0) {
    return `最高抵达第 ${Math.max(1, highestSector)} 阵 · 累计 ${Math.max(1, runsPlayed)} 局`;
  }
  return null;
}

function summarizeInkBlade(storage: StorageReader): string | null {
  const meta = safeParseJson<{
    highestUnlockedStage?: unknown;
    bestScore?: unknown;
    totalKills?: unknown;
    totalVictories?: unknown;
  }>(storage.getItem(INK_BLADE_META_KEY));
  if (!meta) return null;

  const victories =
    typeof meta.totalVictories === 'number' ? Math.floor(meta.totalVictories) : 0;
  const bestScore = typeof meta.bestScore === 'number' ? Math.floor(meta.bestScore) : 0;
  const totalKills = typeof meta.totalKills === 'number' ? Math.floor(meta.totalKills) : 0;
  const unlockedStage =
    typeof meta.highestUnlockedStage === 'number'
      ? Math.max(0, Math.floor(meta.highestUnlockedStage))
      : 0;

  if (victories > 0) {
    return `剑破终幕 ${victories} 次 · 最高 ${bestScore} 分`;
  }
  if (totalKills > 0 || bestScore > 0 || unlockedStage > 0) {
    return `解锁至第 ${unlockedStage + 1} 幕 · 累计斩敌 ${totalKills}`;
  }
  return null;
}

function summarizeAstralOrrery(storage: StorageReader): string | null {
  const meta = safeParseJson<{
    ascensionCount?: unknown;
    completedFinale?: unknown;
  }>(storage.getItem(ORRERY_META_KEY));
  const run = safeParseJson<{
    totalLuminanceEarned?: unknown;
    syzygyCount?: unknown;
  }>(storage.getItem(ORRERY_RUN_KEY));

  const ascensions =
    meta && typeof meta.ascensionCount === 'number' ? Math.floor(meta.ascensionCount) : 0;
  const completedFinale = Boolean(meta?.completedFinale);
  const totalLum =
    run && typeof run.totalLuminanceEarned === 'number' ? run.totalLuminanceEarned : 0;
  const syzygyCount =
    run && typeof run.syzygyCount === 'number' ? Math.floor(run.syzygyCount) : 0;

  if (completedFinale) {
    return `已铸就天枢终章 · 重铸 ${ascensions} 次`;
  }
  if (ascensions > 0) {
    return `星盘重铸 ${ascensions} 次 · 朔望连珠 ${syzygyCount} 次`;
  }
  if (totalLum > 0 || syzygyCount > 0) {
    return syzygyCount > 0
      ? `星轨运转中 · 朔望连珠 ${syzygyCount} 次`
      : '星轨工坊存档进行中';
  }
  return null;
}

function summarizeLuckyLandlord(storage: StorageReader): string | null {
  const activeRun = safeParseJson<{
    phase?: unknown;
    cycle?: unknown;
    coins?: unknown;
  }>(storage.getItem(LANDLORD_RUN_KEY));
  const meta = safeParseJson<{
    totalRuns?: unknown;
    totalVictories?: unknown;
    highestCycle?: unknown;
  }>(storage.getItem(LANDLORD_META_KEY));

  if (
    activeRun &&
    activeRun.phase !== 'gameover' &&
    typeof activeRun.cycle === 'number' &&
    activeRun.cycle >= 1
  ) {
    const coins = typeof activeRun.coins === 'number' ? Math.floor(activeRun.coins) : 0;
    return `第 ${Math.floor(activeRun.cycle)} 周期收租进行中 · 账面 ${coins} 金`;
  }

  if (!meta) return null;
  const totalVictories =
    typeof meta.totalVictories === 'number' ? Math.floor(meta.totalVictories) : 0;
  const totalRuns = typeof meta.totalRuns === 'number' ? Math.floor(meta.totalRuns) : 0;
  const highestCycle =
    typeof meta.highestCycle === 'number' ? Math.floor(meta.highestCycle) : 1;

  if (totalVictories > 0) {
    return `已缴清通关 ${totalVictories} 次 · 最高第 ${highestCycle} 周期`;
  }
  if (totalRuns > 0 || highestCycle > 1) {
    return `最高抵达第 ${highestCycle} 周期 · 累计 ${Math.max(1, totalRuns)} 局`;
  }
  return null;
}

function summarizeChronoStage(storage: StorageReader): string | null {
  const records = safeParseJson<Record<string, { bestTimeSec?: unknown }>>(
    storage.getItem(RALLY_RECORDS_KEY),
  );
  if (!records) return null;

  const validCount = Object.values(records).filter(
    (entry) => entry && typeof entry.bestTimeSec === 'number' && entry.bestTimeSec > 0,
  ).length;

  if (validCount > 0) {
    return `已刷新 ${validCount} / 6 站赛段最佳成绩`;
  }
  return null;
}

export function readHubSnapshot(
  validAppIds: ReadonlyArray<string>,
  storage: StorageReader | null = getBrowserStorage(),
): HubProgressSnapshot {
  if (!storage) {
    return { lastPlayedAppId: null, progressByAppId: {} };
  }

  const validSet = new Set(validAppIds);
  const lastRaw = safeParseJson<{ appId?: unknown }>(
    storage.getItem(HUB_LAST_PLAYED_KEY),
  );
  const candidateId =
    lastRaw && typeof lastRaw.appId === 'string' ? lastRaw.appId : null;
  const lastPlayedAppId =
    candidateId && validSet.has(candidateId) ? candidateId : null;

  const progressByAppId: Record<string, string> = {};

  const summaries: Array<[string, string | null]> = [
    ['xuanji-breach', summarizeXuanji(storage)],
    ['ink-blade', summarizeInkBlade(storage)],
    ['astral-orrery', summarizeAstralOrrery(storage)],
    ['lucky-landlord', summarizeLuckyLandlord(storage)],
    ['chrono-stage', summarizeChronoStage(storage)],
  ];

  for (const [id, text] of summaries) {
    if (text && validSet.has(id)) {
      progressByAppId[id] = text;
    }
  }

  return {
    lastPlayedAppId,
    progressByAppId,
  };
}
