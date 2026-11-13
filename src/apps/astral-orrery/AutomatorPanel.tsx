import React from 'react';
import { ArrowDown, ArrowUp, Cpu, Power } from 'lucide-react';
import {
  AUTOMATOR_ACTIONS,
  AUTOMATOR_ACTIONS_BY_ID,
  AUTOMATOR_CONDITIONS,
  AUTOMATOR_CONDITIONS_BY_ID,
  AUTOMATOR_PRESETS,
  ERAS,
} from './content.ts';
import {
  getAutomatorIntervalSec,
  getSpendableAutomatorLuminance,
  getUnlockedAutomatorSlots,
  isAutomatorActionUnlocked,
} from './engine.ts';
import { formatNum } from './format.ts';
import type {
  AutomatorActionId,
  AutomatorConditionId,
  AutomatorPresetId,
  AutomatorRule,
  OrreryMetaState,
  OrreryRunState,
} from './types.ts';

interface AutomatorPanelProps {
  run: OrreryRunState;
  meta: OrreryMetaState;
  onToggleMaster: () => void;
  onChangeReserveRatio: (ratio: number) => void;
  onApplyPreset: (presetId: AutomatorPresetId) => void;
  onUpdateRule: (
    index: number,
    patch: Partial<
      Pick<AutomatorRule, 'enabled' | 'condition' | 'threshold' | 'action'>
    >,
  ) => void;
  onMoveRule: (index: number, direction: -1 | 1) => void;
}

const RESERVE_OPTIONS: ReadonlyArray<{ ratio: number; label: string }> = [
  { ratio: 0, label: '0%' },
  { ratio: 0.2, label: '20%' },
  { ratio: 0.5, label: '50%' },
  { ratio: 0.8, label: '80%' },
];

export const AutomatorPanel: React.FC<AutomatorPanelProps> = ({
  run,
  meta,
  onToggleMaster,
  onChangeReserveRatio,
  onApplyPreset,
  onUpdateRule,
  onMoveRule,
}) => {
  const auto = run.automator;
  const unlockedSlots = getUnlockedAutomatorSlots(run, meta);
  const intervalSec = getAutomatorIntervalSec(run, meta);
  const spendableLum = getSpendableAutomatorLuminance(run);

  return (
    <div className="space-y-3">
      {/* Top Telemetry & Master Switch Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-[#09101E] border border-[#243452]">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="automator-master-toggle"
            onClick={onToggleMaster}
            className={`px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border whitespace-nowrap ${
              auto.enabled
                ? 'bg-[#F59E0B] text-[#090D16] border-[#FDE68A]'
                : 'bg-[#131F36] text-[#CBD5E1] border-[#334155] hover:border-[#C89B54]'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{auto.enabled ? '智械总控：运转中' : '智械总控：已停机'}</span>
          </button>

          <div className="text-xs text-[#94A3B8] font-mono-num flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>主频 {intervalSec.toFixed(2)}s/拍</span>
            <span aria-hidden="true">·</span>
            <span>逻辑轨 {unlockedSlots}/6</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#FDE68A]">
              累计执行 {formatNum(auto.totalActionsExecuted)} 次
            </span>
            {auto.lastActionLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#38BDF8]">
                  最近：{auto.lastActionLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Luminance Reserve Budget Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#94A3B8] whitespace-nowrap">
            安全底池保留
          </span>
          <div
            role="group"
            aria-label="星辉安全底池保留比例"
            className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-[#111B30] border border-[#243452]"
          >
            {RESERVE_OPTIONS.map((opt) => {
              const active = Math.abs(auto.reserveRatio - opt.ratio) < 0.01;
              return (
                <button
                  key={opt.label}
                  type="button"
                  aria-label={`保留底池 ${opt.label}`}
                  onClick={() => onChangeReserveRatio(opt.ratio)}
                  className={`px-2 py-0.5 rounded text-xs font-mono-num font-semibold cursor-pointer ${
                    active
                      ? 'bg-[#C89B54] text-[#090D16]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <span className="hidden sm:inline text-xs font-mono-num text-[#CBD5E1]">
            可支配 {formatNum(spendableLum)}
          </span>
        </div>
      </div>

      {/* 1-Click Smart Strategy Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {AUTOMATOR_PRESETS.map((preset) => {
          const isCurrent = auto.activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              onClick={() => onApplyPreset(preset.id)}
              className={`p-2.5 rounded-lg border text-left cursor-pointer flex flex-col justify-between gap-1 ${
                isCurrent
                  ? 'bg-[#182642] border-[#F59E0B] text-white'
                  : 'bg-[#0E172A] hover:bg-[#142038] border-[#243452] text-[#E2E8F0]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#FDE68A] inline-flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <span>{preset.name}</span>
                </span>
                <span className="text-[11px] font-mono-num text-[#94A3B8]">
                  {isCurrent ? '当前启用' : '一键载入'}
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] leading-snug">
                {preset.tagline}
              </p>
            </button>
          );
        })}
      </div>

      {/* 6-Track Priority IF -> THEN Sequencer */}
      <div className="space-y-1.5">
        {auto.rules.map((rule, idx) => {
          const slotUnlocked = idx < unlockedSlots;
          if (!slotUnlocked) {
            const unlockLabel =
              idx < 4
                ? `进入【第二纪 · 朔望谐振】(累计 ${formatNum(ERAS[1].unlockLuminance)} 星辉) 解锁该逻辑轨`
                : `进入【第三纪 · 以太炼金】(${formatNum(ERAS[2].unlockLuminance)} 星辉) 或解锁【高频差分智械核】开放该逻辑轨`;
            return (
              <div
                key={rule.id}
                className="px-3 py-2 rounded-lg bg-[#090F1C] border border-[#1B2740] text-xs text-[#64748B] flex items-center justify-between"
              >
                <span className="font-mono-num">优先级 #{idx + 1} · 未解锁</span>
                <span>{unlockLabel}</span>
              </div>
            );
          }

          const condDef = AUTOMATOR_CONDITIONS_BY_ID[rule.condition];
          const actionUnlocked = isAutomatorActionUnlocked(
            rule.action,
            run,
            meta,
          );
          const actionDef = AUTOMATOR_ACTIONS_BY_ID[rule.action];
          const recentlyFired =
            run.runSeconds - rule.lastTriggeredAt >= 0 &&
            run.runSeconds - rule.lastTriggeredAt < 1.1;

          return (
            <div
              key={rule.id}
              className={`px-2.5 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
                recentlyFired
                  ? 'bg-[#1D2B44] border-[#F59E0B]'
                  : rule.enabled
                    ? 'bg-[#0E172A] border-[#293B5C]'
                    : 'bg-[#090E1A] border-[#1A253B] opacity-70'
              }`}
            >
              {/* Left: Priority Rank + Toggle + IF Condition + Threshold + THEN Action */}
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  aria-label={`切换逻辑轨 #${idx + 1} 启用状态`}
                  onClick={() => onUpdateRule(idx, { enabled: !rule.enabled })}
                  className={`px-2 py-1 rounded text-xs font-mono-num font-bold cursor-pointer border ${
                    rule.enabled
                      ? 'bg-[#0D9488] text-white border-[#2DD4BF]'
                      : 'bg-[#162136] text-[#94A3B8] border-[#334155]'
                  }`}
                >
                  #{idx + 1} {rule.enabled ? '开' : '关'}
                </button>

                <span className="text-xs font-semibold text-[#94A3B8]">若</span>

                <select
                  aria-label={`逻辑轨 #${idx + 1} 触发条件`}
                  value={rule.condition}
                  onChange={(e) => {
                    const nextCond = e.target.value as AutomatorConditionId;
                    const nextDef = AUTOMATOR_CONDITIONS_BY_ID[nextCond];
                    onUpdateRule(idx, {
                      condition: nextCond,
                      threshold: nextDef.thresholdOptions[0] ?? 0,
                    });
                  }}
                  className="px-2 py-1 rounded bg-[#142038] border border-[#334155] text-xs text-[#F8FAFC] cursor-pointer"
                >
                  {AUTOMATOR_CONDITIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {condDef.hasThreshold && (
                  <select
                    aria-label={`逻辑轨 #${idx + 1} 条件阈值`}
                    value={rule.threshold}
                    onChange={(e) =>
                      onUpdateRule(idx, { threshold: Number(e.target.value) })
                    }
                    className="px-2 py-1 rounded bg-[#1A2A4A] border border-[#C89B54] text-xs font-mono-num font-semibold text-[#FDE68A] cursor-pointer"
                  >
                    {condDef.thresholdOptions.map((val) => (
                      <option key={val} value={val}>
                        {val} {condDef.thresholdUnit}
                      </option>
                    ))}
                  </select>
                )}

                <span className="text-xs font-semibold text-[#F59E0B]">则</span>

                <select
                  aria-label={`逻辑轨 #${idx + 1} 执行动作`}
                  value={rule.action}
                  onChange={(e) =>
                    onUpdateRule(idx, {
                      action: e.target.value as AutomatorActionId,
                    })
                  }
                  className="px-2 py-1 rounded bg-[#142038] border border-[#334155] text-xs text-[#F8FAFC] cursor-pointer"
                >
                  {AUTOMATOR_ACTIONS.map((a) => {
                    const ok = isAutomatorActionUnlocked(a.id, run, meta);
                    return (
                      <option key={a.id} value={a.id}>
                        {ok ? a.label : `🔒 ${a.label}`}
                      </option>
                    );
                  })}
                </select>

                {!actionUnlocked && actionDef.unlockHint && (
                  <span className="text-[11px] text-[#F59E0B]">
                    ({actionDef.unlockHint})
                  </span>
                )}
              </div>

              {/* Right: Trigger Counter + Reorder Up/Down */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono-num text-[#94A3B8] mr-1">
                  触发 {formatNum(rule.triggerCount)}
                </span>
                <button
                  type="button"
                  aria-label={`上移逻辑轨 #${idx + 1}`}
                  disabled={idx === 0}
                  onClick={() => onMoveRule(idx, -1)}
                  className="p-1 rounded bg-[#142038] hover:bg-[#1E2F52] disabled:opacity-35 border border-[#2B3E63] text-[#CBD5E1] cursor-pointer disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label={`下移逻辑轨 #${idx + 1}`}
                  disabled={idx >= unlockedSlots - 1}
                  onClick={() => onMoveRule(idx, 1)}
                  className="p-1 rounded bg-[#142038] hover:bg-[#1E2F52] disabled:opacity-35 border border-[#2B3E63] text-[#CBD5E1] cursor-pointer disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
