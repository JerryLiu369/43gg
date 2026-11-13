import { RALLY_DIFFICULTY_DEFS } from './physics.ts';
import type {
  ChampionshipProgress,
  ChampionshipStandingEntry,
  DrivetrainType,
  RallyDifficulty,
  StageDefinition,
  SurfaceType,
} from './types.ts';

interface AiCrewProfile {
  driverId: string;
  driverCode: string;
  driverName: string;
  nationality: string;
  carName: string;
  paceRatio: number; // < 1.0 faster than par, > 1.0 slightly slower than par
  favoredSurface: SurfaceType;
}

const AI_RALLY_CREWS: AiCrewProfile[] = [
  {
    driverId: 'ai_rov',
    driverCode: 'ROV',
    driverName: 'K. 罗万佩拉 (Rovanperä)',
    nationality: 'FIN',
    carName: 'GR Yaris Rally1',
    paceRatio: 0.965,
    favoredSurface: 'gravel',
  },
  {
    driverId: 'ai_neu',
    driverCode: 'NEU',
    driverName: 'T. 诺伊维尔 (Neuville)',
    nationality: 'BEL',
    carName: 'i20 N Rally1',
    paceRatio: 0.975,
    favoredSurface: 'tarmac',
  },
  {
    driverId: 'ai_ogi',
    driverCode: 'OGI',
    driverName: 'S. 奥吉尔 (Ogier)',
    nationality: 'FRA',
    carName: 'GR Yaris Rally1',
    paceRatio: 0.982,
    favoredSurface: 'tarmac',
  },
  {
    driverId: 'ai_tan',
    driverCode: 'TAN',
    driverName: 'O. 塔纳克 (Tänak)',
    nationality: 'EST',
    carName: 'i20 N Rally1',
    paceRatio: 0.992,
    favoredSurface: 'snow',
  },
  {
    driverId: 'ai_eva',
    driverCode: 'EVA',
    driverName: 'E. 埃文斯 (Evans)',
    nationality: 'GBR',
    carName: 'GR Yaris Rally1',
    paceRatio: 1.008,
    favoredSurface: 'gravel',
  },
  {
    driverId: 'ai_kat',
    driverCode: 'KAT',
    driverName: '胜田贵元 (Katsuta)',
    nationality: 'JPN',
    carName: 'GR Yaris Rally1',
    paceRatio: 1.028,
    favoredSurface: 'snow',
  },
  {
    driverId: 'ai_lin',
    driverCode: 'LIN',
    driverName: '林致远 (Lin Z.Y.)',
    nationality: 'CHN',
    carName: 'Puma Rally1 Hybrid',
    paceRatio: 1.045,
    favoredSurface: 'gravel',
  },
];

function deterministicStageJitter(driverId: string, stageId: string): number {
  const key = `${driverId}:${stageId}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const norm = ((h >>> 0) % 10000) / 10000; // 0..1
  return (norm - 0.5) * 0.036; // +-1.8% stage-to-stage pace variance
}

export function computeAiStageTimeSec(
  crew: AiCrewProfile,
  stage: StageDefinition,
  difficulty: RallyDifficulty = 'standard'
): number {
  const surfaceBonus = crew.favoredSurface === stage.primarySurface ? -0.014 : 0.004;
  const jitter = deterministicStageJitter(crew.driverId, stage.id);
  const aiScale = RALLY_DIFFICULTY_DEFS[difficulty]?.aiTimeScale ?? 1.0;
  const raw = stage.targetParTimeSec * (crew.paceRatio + surfaceBonus + jitter) * aiScale;
  return Number(Math.max(45, raw).toFixed(3));
}

export function createNewChampionship(
  stages: StageDefinition[],
  drivetrain: DrivetrainType = 'AWD'
): ChampionshipProgress {
  const playerEntry: ChampionshipStandingEntry = {
    driverId: 'player',
    driverCode: 'YOU',
    driverName: '你 · 厂队一号车组 (Player)',
    nationality: 'WRC',
    carName: `Chrono ${drivetrain} Prototype`,
    isPlayer: true,
    totalTimeSec: 0,
    lastStageTimeSec: 0,
    retiredCount: 0,
  };

  const aiEntries: ChampionshipStandingEntry[] = AI_RALLY_CREWS.map((c) => ({
    driverId: c.driverId,
    driverCode: c.driverCode,
    driverName: c.driverName,
    nationality: c.nationality,
    carName: c.carName,
    isPlayer: false,
    totalTimeSec: 0,
    lastStageTimeSec: 0,
    retiredCount: 0,
  }));

  return {
    currentStageIdx: 0,
    stageOrderIds: stages.map((s) => s.id),
    completedCount: 0,
    isFinished: false,
    serviceParkDue: false,
    standings: [playerEntry, ...aiEntries],
    history: [],
  };
}

/**
 * Records a completed (or Super-Rally retired) stage in the WRC Championship,
 * computes deterministic AI rival stage times, sorts overall standings, and checks if a
 * 45-minute Service Park window opens (every 2 stages).
 */
export function recordChampionshipStageResult(
  prev: ChampionshipProgress,
  stage: StageDefinition,
  completed: boolean,
  playerRawTimeSec: number,
  difficulty: RallyDifficulty = 'standard'
): ChampionshipProgress {
  // Under FIA Super-Rally rules, retiring on a stage incurs Target Par + 60s penalty so the rally continues!
  const effectivePlayerStageTime = completed
    ? Number(playerRawTimeSec.toFixed(3))
    : Number((stage.targetParTimeSec + 60.0).toFixed(3));

  const stageRankList: Array<{ driverId: string; stageTime: number }> = [];

  const updatedStandings = prev.standings.map((entry) => {
    if (entry.isPlayer) {
      stageRankList.push({ driverId: entry.driverId, stageTime: effectivePlayerStageTime });
      return {
        ...entry,
        lastStageTimeSec: effectivePlayerStageTime,
        totalTimeSec: Number((entry.totalTimeSec + effectivePlayerStageTime).toFixed(3)),
        retiredCount: entry.retiredCount + (completed ? 0 : 1),
      };
    }

    const crew = AI_RALLY_CREWS.find((c) => c.driverId === entry.driverId) || AI_RALLY_CREWS[0];
    const aiStageTime = computeAiStageTimeSec(crew, stage, difficulty);
    stageRankList.push({ driverId: entry.driverId, stageTime: aiStageTime });
    return {
      ...entry,
      lastStageTimeSec: aiStageTime,
      totalTimeSec: Number((entry.totalTimeSec + aiStageTime).toFixed(3)),
    };
  });

  stageRankList.sort((a, b) => a.stageTime - b.stageTime);
  const playerStageRank =
    Math.max(0, stageRankList.findIndex((r) => r.driverId === 'player')) + 1;

  updatedStandings.sort((a, b) => a.totalTimeSec - b.totalTimeSec);

  const completedCount = prev.completedCount + 1;
  const isFinished = completedCount >= prev.stageOrderIds.length;
  const nextStageIdx = isFinished
    ? prev.stageOrderIds.length - 1
    : Math.min(prev.stageOrderIds.length - 1, prev.currentStageIdx + 1);

  // Full 45-min Service Park opens after every 2 stages (SS02, SS04)
  const serviceParkDue = !isFinished && completedCount % 2 === 0;

  return {
    currentStageIdx: nextStageIdx,
    stageOrderIds: prev.stageOrderIds,
    completedCount,
    isFinished,
    serviceParkDue,
    standings: updatedStandings,
    history: [
      ...prev.history,
      {
        stageId: stage.id,
        stageCode: stage.code,
        stageNameZh: stage.nameZh,
        playerTimeSec: effectivePlayerStageTime,
        playerRank: playerStageRank,
        completed,
      },
    ],
  };
}

export function getPlayerOverallStanding(progress: ChampionshipProgress): {
  rank: number;
  entry: ChampionshipStandingEntry;
  leaderTimeSec: number;
  gapToLeaderSec: number;
} {
  const idx = Math.max(
    0,
    progress.standings.findIndex((s) => s.isPlayer)
  );
  const entry = progress.standings[idx];
  const leaderTimeSec = progress.standings[0]?.totalTimeSec ?? 0;
  return {
    rank: idx + 1,
    entry,
    leaderTimeSec,
    gapToLeaderSec: Number((entry.totalTimeSec - leaderTimeSec).toFixed(3)),
  };
}
