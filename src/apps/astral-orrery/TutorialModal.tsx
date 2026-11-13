import React from 'react';
import { Compass, Play, X } from 'lucide-react';

interface TutorialModalProps {
  isTitleScreen: boolean;
  onClose: () => void;
  onStartFromTutorial?: () => void;
  onReplayInteractiveGuide?: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isTitleScreen,
  onClose,
  onStartFromTutorial,
  onReplayInteractiveGuide,
}) => {
  const handlePrimaryConfirm = () => {
    if (isTitleScreen && onStartFromTutorial) {
      onStartFromTutorial();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="天枢浑仪新手指引"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="w-full max-w-3xl bg-[#0B1222] border border-[#C89B54] rounded-xl shadow-2xl overflow-hidden text-[#F8FAFC] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#070C18] border-b border-[#243452] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#FDE68A]">
              天枢浑仪 · 三维天文台与智械上手指南
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              拖拽/双指触控旋转 3D 天球仪、切换四大观测机位，用齿比、星炉与可编程发条智械构筑指数增长引擎
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭新手指引"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#131F36] hover:bg-[#1E2F52] border border-[#334155] text-[#F8FAFC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Step 1: 3D Gyroscopic Meridian & Gear Modes */}
          <section className="p-4 rounded-xl bg-[#101A2E] border border-[#243452] grid grid-cols-1 sm:grid-cols-[116px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded-lg bg-[#070B14] border border-[#C89B54] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-20 h-20" aria-hidden="true">
                <ellipse cx="50" cy="52" rx="40" ry="18" transform="rotate(-22 50 52)" fill="none" stroke="#38BDF8" strokeOpacity="0.6" strokeWidth="1.5" />
                <ellipse cx="50" cy="52" rx="30" ry="14" transform="rotate(24 50 52)" fill="none" stroke="#F59E0B" strokeOpacity="0.8" strokeWidth="1.5" />
                <line x1="50" y1="6" x2="50" y2="52" stroke="#FDE047" strokeWidth="2.4" />
                <polygon points="50,4 45,12 55,12" fill="#FDE047" />
                <circle cx="50" cy="18" r="4.6" fill="#14B8A6" stroke="#F8FAFC" strokeWidth="1.3" />
                <circle cx="50" cy="31" r="4.2" fill="#F59E0B" stroke="#F8FAFC" strokeWidth="1.3" />
                <circle cx="50" cy="52" r="7.5" fill="#F59E0B" stroke="#FEF9C3" strokeWidth="1.6" />
                <text x="50" y="90" textAnchor="middle" fill="#FDE047" fontSize="10" fontWeight="700">
                  五曜连珠 ×45+
                </text>
              </svg>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-bold text-[#F8FAFC]">
                第一步：三维陀螺共面连珠 · 三态齿比微调
              </div>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                五条星轨在 3D 空间各自倾角进动，每当星体驶近正北 12 点方向的<span className="font-semibold text-[#FDE047]">「黄金子午激光门」</span>时会自动校准共面，产出<strong>星辉</strong>与<strong>星芒通量</strong>。多星同步跨门即引爆阶乘级<strong>【朔望连珠】</strong>！
              </p>
              <div className="text-xs text-[#38BDF8]">
                进阶机制：每条星轨均可独立切换<strong>「重锤（高产通量） / 锁相（磁吸连珠） / 掠宫（极速刷星宫）」</strong>三种机械齿比！
              </div>
            </div>
          </section>

          {/* Step 2: Alchemical Crucible & Supernova Collapse */}
          <section className="p-4 rounded-xl bg-[#101A2E] border border-[#243452] grid grid-cols-1 sm:grid-cols-[116px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded-lg bg-[#070B14] border border-[#C89B54] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-20 h-20" aria-hidden="true">
                <polygon points="50,14 68,46 50,78 32,46" fill="#EA580C" stroke="#FDE047" strokeWidth="2" />
                <circle cx="24" cy="64" r="8" fill="#10B981" fillOpacity="0.85" />
                <circle cx="76" cy="64" r="8" fill="#06B6D4" fillOpacity="0.85" />
                <line x1="24" y1="64" x2="50" y2="36" stroke="#6EE7B7" strokeWidth="2" />
                <line x1="76" y1="64" x2="50" y2="36" stroke="#67E8F9" strokeWidth="2" />
                <text x="50" y="92" textAnchor="middle" fill="#67E8F9" fontSize="9.5" fontWeight="700">
                  以太三态星炉
                </text>
              </svg>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-bold text-[#F8FAFC]">
                第二步：底座以太星炉 · 超新星坍缩脉冲 [E]
              </div>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                天球底座悬浮着三座炼金反应釜：注入<strong>星芒通量</strong>即可升阶<strong>【曜火聚变】</strong>（指数星辉乘区）、<strong>【时隙曲率】</strong>（全局提速+发条回充）与<strong>【谐振结晶】</strong>（连珠增幅+自发合成以太）。
              </p>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                随时按下 <kbd className="px-1.5 py-0.5 rounded bg-[#1B2A47] border border-[#C89B54] font-mono-num text-[11px] text-[#FDE68A]">E</kbd>（或点击底栏【超新星脉冲】）释放主动技，瞬间将全场星体强行聚拢至子午门前引爆大满贯连珠，并赋予 8 秒 ×2.0 星辉超载！
              </p>
            </div>
          </section>

          {/* Step 3: Programmable Clockwork Logic Automator */}
          <section className="p-4 rounded-xl bg-[#101A2E] border border-[#243452] grid grid-cols-1 sm:grid-cols-[116px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded-lg bg-[#070B14] border border-[#C89B54] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-20 h-20" aria-hidden="true">
                <rect x="16" y="20" width="68" height="16" rx="3" fill="#1E293B" stroke="#F59E0B" strokeWidth="1.6" />
                <rect x="16" y="42" width="68" height="16" rx="3" fill="#1E293B" stroke="#14B8A6" strokeWidth="1.6" />
                <rect x="16" y="64" width="68" height="16" rx="3" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.6" />
                <circle cx="26" cy="28" r="3.5" fill="#FDE047" />
                <circle cx="26" cy="50" r="3.5" fill="#2DD4BF" />
                <circle cx="26" cy="72" r="3.5" fill="#38BDF8" />
                <text x="54" y="31" textAnchor="middle" fill="#FDE68A" fontSize="8.5" fontWeight="700">IF 突破 → 狙击</text>
                <text x="54" y="53" textAnchor="middle" fill="#99F6E4" fontSize="8.5" fontWeight="700">IF 蓄能≥75%→4×</text>
                <text x="54" y="75" textAnchor="middle" fill="#BAE6FD" fontSize="8.5" fontWeight="700">IF ROI → 升阶</text>
              </svg>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-bold text-[#F8FAFC]">
                第三步：可编程【发条智械】· 节奏自选的增量大脑
              </div>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                打开底部<strong>【发条智械】</strong>可一键套用 4 套流派预设（含全自动重铸悠闲托管、突破狙击精算流），也可自编最多 6 轨带优先级的 <span className="font-mono-num text-[#FDE68A]">若(IF) → 则(THEN)</span> 差分机逻辑，手机触屏与桌面键鼠皆可顺畅游玩。
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#070C18] border-t border-[#243452] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-[#94A3B8]">
            提示：按 <kbd className="px-1.5 py-0.5 rounded bg-[#131F36] border border-[#334155] font-mono-num text-[11px] text-[#F8FAFC]">Tab</kbd> 或点「收起」可隐藏底部控制台，全屏观赏 3D 浑天仪运转
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {onReplayInteractiveGuide && (
              <button
                type="button"
                data-testid="replay-orrery-guide-btn"
                onClick={onReplayInteractiveGuide}
                className="px-3.5 py-2 rounded-lg bg-[#131F36] hover:bg-[#1E2F52] border border-[#C89B54]/70 text-[#FDE68A] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>重温五步实战带教</span>
              </button>
            )}
            <button
              type="button"
              data-testid="close-tutorial-btn"
              onClick={handlePrimaryConfirm}
              className="px-5 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isTitleScreen ? '明白了，启动三维浑仪！' : '明白了，继续调校'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
