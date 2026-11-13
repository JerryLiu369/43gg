import { STAGES } from './content.ts';
import type {
  InkBladeDifficulty,
  InkBladeSaveMeta,
  RunSummarySnapshot,
} from './types.ts';

const META_STORAGE_KEY = 'gaistudio.ink_blade.meta.v1';

function isValidDifficulty(val: unknown): val is InkBladeDifficulty {
  return val === 'casual' || val === 'standard' || val === 'master';
}

export function createDefaultMeta(): InkBladeSaveMeta {
  return {
    version: 1,
    highestUnlockedStage: 0,
    bestScore: 0,
    bestMaxCombo: 0,
    fastestVictorySec: null,
    totalKills: 0,
    totalDeflects: 0,
    totalVictories: 0,
    muted: false,
    tutorialCompleted: false,
    preferredDifficulty: 'standard',
  };
}

export function loadInkBladeMeta(): InkBladeSaveMeta {
  if (typeof window === 'undefined') return createDefaultMeta();
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return createDefaultMeta();
    const parsed = JSON.parse(raw) as Partial<InkBladeSaveMeta>;
    if (!parsed || typeof parsed !== 'object') return createDefaultMeta();
    const def = createDefaultMeta();
    return {
      version: 1,
      highestUnlockedStage:
        typeof parsed.highestUnlockedStage === 'number'
          ? Math.max(0, Math.min(STAGES.length - 1, Math.floor(parsed.highestUnlockedStage)))
          : def.highestUnlockedStage,
      bestScore:
        typeof parsed.bestScore === 'number' && parsed.bestScore >= 0
          ? Math.floor(parsed.bestScore)
          : def.bestScore,
      bestMaxCombo:
        typeof parsed.bestMaxCombo === 'number' && parsed.bestMaxCombo >= 0
          ? Math.floor(parsed.bestMaxCombo)
          : def.bestMaxCombo,
      fastestVictorySec:
        typeof parsed.fastestVictorySec === 'number' && parsed.fastestVictorySec > 0
          ? parsed.fastestVictorySec
          : null,
      totalKills:
        typeof parsed.totalKills === 'number' && parsed.totalKills >= 0
          ? Math.floor(parsed.totalKills)
          : 0,
      totalDeflects:
        typeof parsed.totalDeflects === 'number' && parsed.totalDeflects >= 0
          ? Math.floor(parsed.totalDeflects)
          : 0,
      totalVictories:
        typeof parsed.totalVictories === 'number' && parsed.totalVictories >= 0
          ? Math.floor(parsed.totalVictories)
          : 0,
      muted: Boolean(parsed.muted),
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
      preferredDifficulty: isValidDifficulty(parsed.preferredDifficulty)
        ? parsed.preferredDifficulty
        : 'standard',
    };
  } catch {
    return createDefaultMeta();
  }
}

export function saveInkBladeMeta(meta: InkBladeSaveMeta): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors safely
  }
}

export function recordInkBladeOutcome(
  prev: InkBladeSaveMeta,
  summary: RunSummarySnapshot,
): { nextMeta: InkBladeSaveMeta; isNewBest: boolean } {
  const isNewBest = summary.score > prev.bestScore;
  const reachedStage =
    summary.outcome === 'victory'
      ? STAGES.length - 1
      : Math.min(STAGES.length - 1, summary.stageIndex);

  const nextFastest =
    summary.outcome === 'victory' && !summary.isEndless
      ? prev.fastestVictorySec === null
        ? summary.clearTimeSec
        : Math.min(prev.fastestVictorySec, summary.clearTimeSec)
      : prev.fastestVictorySec;

  const nextMeta: InkBladeSaveMeta = {
    ...prev,
    highestUnlockedStage: Math.max(prev.highestUnlockedStage, reachedStage),
    bestScore: Math.max(prev.bestScore, summary.score),
    bestMaxCombo: Math.max(prev.bestMaxCombo, summary.maxCombo),
    fastestVictorySec: nextFastest,
    totalKills: prev.totalKills + summary.kills,
    totalDeflects: prev.totalDeflects + summary.deflects,
    totalVictories:
      prev.totalVictories + (summary.outcome === 'victory' ? 1 : 0),
  };

  saveInkBladeMeta(nextMeta);
  return { nextMeta, isNewBest };
}
