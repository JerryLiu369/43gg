import React from 'react';
import { getPlayerOverallStanding } from '../game/championship.ts';
import { formatRallyTime } from '../game/rallyEngine.ts';
import type { StageFinishSummary } from '../game/rallyEngine.ts';
import type { ChampionshipProgress, RallyEventMode } from '../game/types.ts';

interface StageFinishModalProps {
  summary: StageFinishSummary;
  eventMode: RallyEventMode;
  championship: ChampionshipProgress | null;
  serviceMinutesLeft: number;
  onRetryStage: () => void;
  onNextStage: () => void;
  onOpenSetup: () => void;
  onBackToTitle: () => void;
}

export const StageFinishModal: React.FC<StageFinishModalProps> = ({
  summary,
  eventMode,
  championship,
  serviceMinutesLeft,
  onRetryStage,
  onNextStage,
  onOpenSetup,
  onBackToTitle,
}) => {
  const {
    stage,
    completed,
    retiredReason,
    totalTimeSec,
    penaltyTimeSec,
    sectorTimesSec,
    bestRecord,
    isNewBest,
    mistakes,
  } = summary;

  const deltaVsPar = totalTimeSec - stage.targetParTimeSec;
  const isChamp = eventMode === 'championship' && championship !== null;
  const playerStanding = isChamp ? getPlayerOverallStanding(championship) : null;
  const leaderTotalSec = isChamp ? championship.standings[0]?.totalTimeSec ?? 0 : 0;

  const nextStageLabel = (() => {
    if (!isChamp) return '进入下一赛段 (Next Stage)';
    if (championship.isFinished) return '开启新一届 WRC 锦标赛';
    const nextNum = championship.completedCount + 1;
    return `发车下一站 (SS0${nextNum} / 共 ${championship.stageOrderIds.length} 站)`;
  })();

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#090b0e]/92 p-4 pointer-events-auto"
      role="dialog"
      aria-label="赛段成绩结算表"
    >
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0f1319] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Top Banner */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#0b0e13] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-num text-slate-400">
              <span>
                {stage.code} · {stage.country} · {(stage.lengthM / 1000).toFixed(2)} KM
              </span>
              {isChamp && (
                <span className="px-2 py-0.5 rounded bg-[#f59e0b]/15 border border-[#f59e0b]/50 text-[#f59e0b] font-semibold">
                  WRC 锦标赛 第 {championship.completedCount}/{championship.stageOrderIds.length} 站
                </span>
              )}
            </div>
            <h2 className="font-display text-3xl font-bold tracking-wide text-slate-100 mt-0.5">
              {isChamp && championship.isFinished
                ? `WRC 锦标赛完美收官 · 总排名 P${playerStanding?.rank ?? 1}`
                : completed
                  ? '赛段冲线完成 (STAGE COMPLETE)'
                  : '赛段退赛 · 超级拉力罚时完赛 (SUPER-RALLY)'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {completed
                ? stage.nameZh
                : retiredReason || '核心机械损毁未能冲线（锦标赛按标杆 +60s 超级拉力规则计入总成绩）'}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400">
              {completed
                ? isNewBest
                  ? '刷新个人最佳纪录 (NEW PERSONAL BEST)'
                  : '赛段最终总用时'
                : 'Super-Rally 计入时间'}
            </div>
            <div className="font-mono-num text-3xl font-bold text-[#f59e0b]">
              {formatRallyTime(completed ? totalTimeSec : stage.targetParTimeSec + 60)}
            </div>
            {completed && (
              <div
                className={`font-mono-num text-xs font-semibold ${
                  deltaVsPar <= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                对比赛段标杆 ({formatRallyTime(stage.targetParTimeSec)}):{' '}
                {deltaVsPar <= 0 ? '' : '+'}
                {deltaVsPar.toFixed(2)}s
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Championship Service Park / Finale Banner */}
          {isChamp && championship.isFinished && playerStanding && (
            <div className="p-4 rounded border border-[#f59e0b]/60 bg-[#1a150b] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono-num text-[#f59e0b] font-semibold">
                  FIA WORLD RALLY CHAMPIONSHIP FINAL CLASSIFICATION
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  {playerStanding.rank === 1
                    ? '总冠军加冕！你击败了全部 7 支厂队车组夺得年度分站总冠军！'
                    : playerStanding.rank <= 3
                      ? `登上领奖台！最终总成绩位列全场第 ${playerStanding.rank} 名！`
                      : `完成全部 ${championship.stageOrderIds.length} 站严苛考验，总成绩位列第 ${playerStanding.rank} 名。`}
                </div>
              </div>
              <div className="font-mono-num text-right">
                <div className="text-xs text-slate-400">累计总用时</div>
                <div className="text-xl font-bold text-[#f59e0b]">
                  {formatRallyTime(playerStanding.entry.totalTimeSec)}
                </div>
              </div>
            </div>
          )}

          {isChamp && championship.serviceParkDue && !championship.isFinished && (
            <div className="p-3.5 rounded border border-emerald-700/70 bg-emerald-950/35 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-emerald-200">
                <span className="font-bold text-emerald-400">中心维修区开放 (SERVICE PARK OPEN)：</span>
                已完成 {championship.completedCount} 个赛段，维修工时已重新补满至{' '}
                <span className="font-mono-num font-bold">{serviceMinutesLeft} 分钟</span>
                ！发车下一站前请点击下方「调校与抢修车辆」整备赛车。
              </div>
              <button
                type="button"
                onClick={onOpenSetup}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                立即进入维修区整备
              </button>
            </div>
          )}

          {/* WRC Championship Overall Standings Table */}
          {isChamp && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-300">
                  WRC 锦标赛总成绩积分榜 (Overall Classification · 累计用时排序)
                </h3>
                <span className="font-mono-num text-xs text-slate-400">
                  当前排名: P{playerStanding?.rank ?? 1} / {championship.standings.length} · 剩余工时{' '}
                  {serviceMinutesLeft}m
                </span>
              </div>
              <div className="bg-[#121720] border border-slate-800 rounded overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0d1118] text-[11px] text-slate-400 font-mono-num">
                      <th className="py-2 px-3 w-12">POS</th>
                      <th className="py-2 px-3">车组 (CREW)</th>
                      <th className="py-2 px-3 hidden sm:table-cell">赛车 (CAR)</th>
                      <th className="py-2 px-3 text-right">本站用时</th>
                      <th className="py-2 px-3 text-right">累计总时</th>
                      <th className="py-2 px-3 text-right">差距 (GAP)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono-num">
                    {championship.standings.map((row, i) => {
                      const gap = row.totalTimeSec - leaderTotalSec;
                      return (
                        <tr
                          key={row.driverId}
                          className={
                            row.isPlayer
                              ? 'bg-[#f59e0b]/14 text-white font-semibold'
                              : 'text-slate-300'
                          }
                        >
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block w-6 text-center rounded py-0.5 text-[11px] font-bold ${
                                i === 0
                                  ? 'bg-[#f59e0b] text-black'
                                  : i <= 2
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-400'
                              }`}
                            >
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <span className="font-mono-num text-[10px] text-slate-400 mr-1.5">
                              [{row.nationality}]
                            </span>
                            <span className={row.isPlayer ? 'text-[#f59e0b] font-bold' : ''}>
                              {row.driverName}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400 hidden sm:table-cell">
                            {row.carName}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {formatRallyTime(row.lastStageTimeSec)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold">
                            {formatRallyTime(row.totalTimeSec)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${
                              gap === 0 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {gap === 0 ? 'LEADER' : `+${gap.toFixed(2)}s`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3-Sector Telemetry Split Times */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-2">
              三段计时分段成绩与最佳幽灵车对比 (Sector Split Telemetry)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((idx) => {
                const secTime = sectorTimesSec[idx];
                const pbSecTime = bestRecord?.sectorTimesSec?.[idx] || 0;
                const diff = pbSecTime > 0 && secTime > 0 ? secTime - pbSecTime : null;

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-[#131820] border border-slate-800 rounded flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>SECTOR 0{idx + 1}</span>
                      <span className="font-mono-num">
                        {Math.round(stage.sectorSplitsM[idx])}m
                      </span>
                    </div>
                    <div className="font-mono-num text-xl font-bold text-slate-100 mt-1">
                      {secTime > 0 ? formatRallyTime(secTime) : '--:--.---'}
                    </div>
                    <div className="font-mono-num text-xs mt-1">
                      {diff !== null ? (
                        <span className={diff <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          PB 差值: {diff <= 0 ? '' : '+'}
                          {diff.toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-slate-500">基准分段数据已记录</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mistake & Time Loss Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-400">
                赛段驾驶失误定位清单 (Driving Mistake &amp; Penalty Log)
              </h3>
              <span className="font-mono-num text-xs text-slate-400">
                累计失误 {mistakes.length} 次 · 救援罚时 +{penaltyTimeSec.toFixed(1)}s
              </span>
            </div>

            {mistakes.length === 0 ? (
              <div className="p-4 bg-[#131820] border border-slate-800 rounded text-center text-xs text-emerald-400 font-medium">
                零严重失误完成赛段！全程保持在路书节奏与抓地极限包络线内 (Clean Stage Run)。
              </div>
            ) : (
              <div className="bg-[#131820] border border-slate-800 rounded divide-y divide-slate-800/80 max-h-40 overflow-y-auto">
                {mistakes.map((m) => (
                  <div
                    key={m.id}
                    className="px-4 py-2 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num text-slate-400">
                        S{m.sector} · {m.distanceM}m ({formatRallyTime(m.timeSec)})
                      </span>
                      <span className="font-medium text-slate-200">{m.label}</span>
                    </div>
                    <span className="font-mono-num font-semibold text-rose-400">
                      约损失 -{m.timeLossEstSec.toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0b0e13] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToTitle}
              className="px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              返回赛事大厅
            </button>
            <button
              type="button"
              onClick={onOpenSetup}
              className="px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              调校与抢修车辆 ({serviceMinutesLeft}m)
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!isChamp && (
              <button
                type="button"
                data-start="true"
                onClick={onRetryStage}
                className="px-5 py-2.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                重跑本赛段挑战幽灵车 (Retry)
              </button>
            )}
            <button
              type="button"
              data-start={isChamp ? 'true' : undefined}
              onClick={onNextStage}
              className="px-6 py-2.5 text-xs font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {nextStageLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
