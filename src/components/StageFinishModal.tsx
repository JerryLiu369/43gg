import React from 'react';
import { StageFinishSummary, formatRallyTime } from '../game/rallyEngine.ts';

interface StageFinishModalProps {
  summary: StageFinishSummary;
  onRetryStage: () => void;
  onNextStage: () => void;
  onOpenSetup: () => void;
  onBackToTitle: () => void;
}

export const StageFinishModal: React.FC<StageFinishModalProps> = ({
  summary,
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

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#090b0e]/92 p-4 pointer-events-auto"
      role="dialog"
      aria-label="赛段成绩结算表"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0f1319] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Top Banner */}
        <div className="px-6 py-5 border-b border-slate-800 bg-[#0b0e13] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono-num text-slate-400">
              {stage.code} · {stage.country} · {(stage.lengthM / 1000).toFixed(2)} KM
            </div>
            <h2 className="font-display text-3xl font-bold tracking-wide text-slate-100 mt-0.5">
              {completed ? '赛段冲线完成 (STAGE COMPLETE)' : '赛段强制退赛 (RETIRED / DNF)'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {completed
                ? stage.nameZh
                : retiredReason || '车辆核心机械损毁，未能完成赛段计时'}
            </p>
          </div>

          {completed && (
            <div className="text-right">
              <div className="text-xs text-slate-400">
                {isNewBest ? '刷新个人最佳纪录 (NEW PERSONAL BEST)' : '赛段最终总用时'}
              </div>
              <div className="font-mono-num text-3xl font-bold text-[#f59e0b]">
                {formatRallyTime(totalTimeSec)}
              </div>
              <div
                className={`font-mono-num text-xs font-semibold ${
                  deltaVsPar <= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                对比赛段标杆 ({formatRallyTime(stage.targetParTimeSec)}):{' '}
                {deltaVsPar <= 0 ? '' : '+'}
                {deltaVsPar.toFixed(2)}s
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 3-Sector Telemetry Split Times */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-2.5">
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
                    className="p-4 bg-[#131820] border border-slate-800 rounded flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>SECTOR 0{idx + 1}</span>
                      <span className="font-mono-num">
                        {Math.round(stage.sectorSplitsM[idx])}m
                      </span>
                    </div>
                    <div className="font-mono-num text-xl font-bold text-slate-100 mt-1.5">
                      {secTime > 0 ? formatRallyTime(secTime) : '--:--.---'}
                    </div>
                    <div className="font-mono-num text-xs mt-1">
                      {diff !== null ? (
                        <span className={diff <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          PB 差值: {diff <= 0 ? '' : '+'}
                          {diff.toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-slate-500">基准分段数据记录中</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mistake & Time Loss Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-400">
                赛段驾驶失误定位清单 (Driving Mistake &amp; Penalty Log)
              </h3>
              <span className="font-mono-num text-xs text-slate-400">
                累计失误 {mistakes.length} 次 · 救援罚时 +{penaltyTimeSec.toFixed(1)}s
              </span>
            </div>

            {mistakes.length === 0 ? (
              <div className="p-5 bg-[#131820] border border-slate-800 rounded text-center text-xs text-emerald-400 font-medium">
                零严重失误完成赛段！全程保持在路书节奏与抓地极限包络线内 (Clean Stage Run)。
              </div>
            ) : (
              <div className="bg-[#131820] border border-slate-800 rounded divide-y divide-slate-800/80 max-h-52 overflow-y-auto">
                {mistakes.map((m) => (
                  <div
                    key={m.id}
                    className="px-4 py-2.5 flex items-center justify-between text-xs"
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
              className="px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
            >
              返回赛事大厅
            </button>
            <button
              type="button"
              onClick={onOpenSetup}
              className="px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
            >
              调校与抢修车辆
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onRetryStage}
              className="px-5 py-2.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded transition-colors whitespace-nowrap shrink-0"
            >
              重跑本赛段挑战幽灵车 (Retry)
            </button>
            <button
              type="button"
              onClick={onNextStage}
              className="px-6 py-2.5 text-xs font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors whitespace-nowrap shrink-0"
            >
              进入下一赛段 (Next Stage)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
