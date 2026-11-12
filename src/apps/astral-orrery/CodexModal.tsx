import React, { useState } from 'react';
import { Award, RotateCcw, X } from 'lucide-react';
import { ACHIEVEMENTS, CRUCIBLE_CHAMBERS, ERAS, MODULE_DEFS } from './content.ts';
import { getUnlockedAchievementCount } from './engine.ts';
import { formatDuration, formatNum } from './format.ts';
import { ModuleGlyphSvg } from './icons.tsx';
import type { OrreryMetaState, OrreryRunState } from './types.ts';

interface CodexModalProps {
  run: OrreryRunState;
  meta: OrreryMetaState;
  onHardReset: () => void;
  onClose: () => void;
}

export const CodexModal: React.FC<CodexModalProps> = ({
  run,
  meta,
  onHardReset,
  onClose,
}) => {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const unlockedAchCount = getUnlockedAchievementCount(meta);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="浑天法则与星宫图鉴"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="w-full max-w-3xl bg-[#0B1222] border border-[#C89B54] rounded-xl shadow-2xl overflow-hidden text-[#F8FAFC] flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 bg-[#070C18] border-b border-[#243452] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#FDE68A]">
              司天监典籍 · 浑天法则、星炉图谱与成就铭文
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              每达成一项司天成就，跨周目永久提供 +12% 全局星辉加成
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭典籍窗口"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#131F36] hover:bg-[#1E2F52] border border-[#334155] text-[#F8FAFC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Horological Achievements Grid */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h3 className="text-sm font-bold text-[#F8FAFC] inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[#F59E0B]" />
                <span>司天成就录</span>
              </h3>
              <span className="text-xs font-mono-num font-semibold text-[#FDE68A]">
                已铭刻 {unlockedAchCount} / {ACHIEVEMENTS.length} · 全局星辉 +{unlockedAchCount * 12}%
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ACHIEVEMENTS.map((ach) => {
                const unlocked = Boolean(meta.achievements[ach.id]);
                return (
                  <div
                    key={ach.id}
                    className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                      unlocked
                        ? 'bg-[#121E36] border-[#C89B54]'
                        : 'bg-[#090F1C] border-[#1D2942] opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC]">
                        {ach.name}
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
                        {ach.conditionText}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-mono-num font-semibold shrink-0 ${
                        unlocked ? 'text-[#FDE68A]' : 'text-[#64748B]'
                      }`}
                    >
                      {unlocked ? '已达成 +12%' : '未达成'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Crucible Three Chambers */}
          <section>
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-2.5">
              底座以太星炉 · 三态反应釜原理
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CRUCIBLE_CHAMBERS.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3.5 rounded-lg bg-[#101A2E] border border-[#243452]"
                >
                  <div
                    className="text-xs font-bold"
                    style={{ color: ch.accentHex }}
                  >
                    {ch.name}
                  </div>
                  <p className="text-xs text-[#CBD5E1] leading-relaxed mt-1">
                    {ch.summary}
                  </p>
                  <p className="text-[11px] font-mono-num text-[#94A3B8] mt-1.5">
                    {ch.formulaHint}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Four Unfolding Eras */}
          <section>
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-2.5">
              四重纪元展开脉络
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ERAS.map((e) => {
                const reached = run.era >= e.era;
                return (
                  <div
                    key={e.era}
                    className={`p-3.5 rounded-lg border ${
                      reached
                        ? 'bg-[#121E36] border-[#C89B54]'
                        : 'bg-[#090F1C] border-[#1D2942] opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#FDE68A]">{e.title}</span>
                      <span className="font-mono-num text-[#94A3B8]">
                        {e.unlockLuminance === 0
                          ? '初始开启'
                          : `${formatNum(e.unlockLuminance)} 星辉`}
                      </span>
                    </div>
                    <p className="text-xs text-[#CBD5E1] mt-1">{e.summary}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Module Catalog */}
          <section>
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-2.5">
              黄道十二宫石碑机关图谱
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULE_DEFS.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg bg-[#101A2E] border border-[#243452] flex items-start gap-3"
                >
                  <ModuleGlyphSvg typeId={m.id} className="w-6 h-6 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#F8FAFC]">
                      {m.name} · 第 {m.unlockEra} 纪解锁
                    </div>
                    <p className="text-xs text-[#CBD5E1] mt-0.5 leading-relaxed">
                      {m.roleSummary}
                    </p>
                    <p className="text-[11px] text-[#FDE68A] mt-1">
                      协同：{m.synergyHint}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Lifetime Records & Reset */}
          <section className="pt-4 border-t border-[#243452] flex flex-wrap items-center justify-between gap-4 text-xs text-[#94A3B8]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-num">
              <span>本局时长 {formatDuration(run.runSeconds)}</span>
              <span aria-hidden="true">·</span>
              <span>子午撞击 {formatNum(run.totalMeridianStrikes)} 次</span>
              <span aria-hidden="true">·</span>
              <span>朔望连珠 {formatNum(run.totalSyzygies)} 次</span>
              <span aria-hidden="true">·</span>
              <span>智械执行 {formatNum(run.automator.totalActionsExecuted)} 次</span>
              <span aria-hidden="true">·</span>
              <span>最高连珠 {meta.bestSyzygyEver} 曜</span>
              {meta.fastestPrimeSec !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>最快归一 {formatDuration(meta.fastestPrimeSec)}</span>
                </>
              )}
            </div>

            {!confirmWipe ? (
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131F36] hover:bg-[#3B1219] border border-[#334155] text-xs font-medium text-[#CBD5E1] hover:text-[#FCA5A5] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>清空全部存档</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmWipe(false);
                    onHardReset();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  确认永久重置
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWipe(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#131F36] border border-[#334155] text-xs text-[#CBD5E1] cursor-pointer whitespace-nowrap"
                >
                  取消
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
