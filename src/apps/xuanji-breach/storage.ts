import type { DifficultyTier, XuanjiMetaSave } from './types.ts';

const META_STORAGE_KEY = '43gg.xuanji_breach.meta.v1';

function isValidDifficulty(val: unknown): val is DifficultyTier {
  return val === 'casual' || val === 'standard' || val === 'master';
}

export function createDefaultMetaSave(): XuanjiMetaSave {
  return {
    runsPlayed: 0,
    victories: 0,
    bestScore: 0,
    highestSectorReached: 0,
    totalChainKills: 0,
    unlockedRelics: ['thunder_conductor', 'seismic_shock', 'jade_aegis'],
    muted: false,
    tutorialCompleted: false,
    preferredDifficulty: 'standard',
  };
}

export function loadXuanjiMeta(): XuanjiMetaSave {
  if (typeof window === 'undefined') return createDefaultMetaSave();
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return createDefaultMetaSave();
    const parsed = JSON.parse(raw) as Partial<XuanjiMetaSave>;
    const def = createDefaultMetaSave();
    return {
      runsPlayed:
        typeof parsed.runsPlayed === 'number' ? parsed.runsPlayed : def.runsPlayed,
      victories:
        typeof parsed.victories === 'number' ? parsed.victories : def.victories,
      bestScore:
        typeof parsed.bestScore === 'number' ? parsed.bestScore : def.bestScore,
      highestSectorReached:
        typeof parsed.highestSectorReached === 'number'
          ? parsed.highestSectorReached
          : def.highestSectorReached,
      totalChainKills:
        typeof parsed.totalChainKills === 'number'
          ? parsed.totalChainKills
          : def.totalChainKills,
      unlockedRelics: Array.isArray(parsed.unlockedRelics)
        ? parsed.unlockedRelics
        : def.unlockedRelics,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : def.muted,
      tutorialCompleted:
        typeof parsed.tutorialCompleted === 'boolean'
          ? parsed.tutorialCompleted
          : def.tutorialCompleted,
      preferredDifficulty: isValidDifficulty(parsed.preferredDifficulty)
        ? parsed.preferredDifficulty
        : def.preferredDifficulty,
    };
  } catch {
    return createDefaultMetaSave();
  }
}

export function saveXuanjiMeta(meta: XuanjiMetaSave): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors
  }
}

export function recordXuanjiRunOutcome(
  prev: XuanjiMetaSave,
  score: number,
  sectorReached: number,
  chainKills: number,
  wonCampaign: boolean,
): XuanjiMetaSave {
  const next: XuanjiMetaSave = {
    ...prev,
    runsPlayed: prev.runsPlayed + 1,
    victories: prev.victories + (wonCampaign ? 1 : 0),
    bestScore: Math.max(prev.bestScore, score),
    highestSectorReached: Math.max(prev.highestSectorReached, sectorReached),
    totalChainKills: prev.totalChainKills + chainKills,
  };
  saveXuanjiMeta(next);
  return next;
}
