import React from 'react';
import { Compass, Play, X } from 'lucide-react';

interface TutorialModalProps {
  onClose: () => void;
  onStartGuidedPractice: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  onClose,
  onStartGuidedPractice,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="xuanji-tutorial-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-[#161310] border border-[#D97706] rounded-lg text-[#F7F3E8] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#1F1A15] border-b border-[#44382C] flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2
              id="xuanji-tutorial-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-[#FEF3C7]"
            >
              璇玑破阵 · 三分钟上手要诀
            </h2>
            <p className="text-xs text-[#A8A29E] mt-0.5">
              全明牌零随机战棋：看清红线弹道、旋转青铜罗盘、巧借地形击退四两拨千斤
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭新手指引"
            onClick={onClose}
            className="p-2 rounded bg-[#292118] hover:bg-[#382D20] border border-[#6B563E] text-[#E7E0D0] cursor-pointer focus:outline-none focus-visible:border-[#F59E0B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Card 1: Protect Citadels & Read Telegraphs */}
          <section className="p-4 rounded bg-[#1C1814] border border-[#44382C] grid grid-cols-1 sm:grid-cols-[108px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded bg-[#120F0D] border border-[#5C4D3C] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 96 96" className="w-20 h-20" aria-hidden="true">
                <polygon
                  points="48,14 70,26 48,38 26,26"
                  fill="#2A1215"
                  stroke="#EF4444"
                  strokeWidth="2"
                />
                <circle cx="48" cy="24" r="4" fill="#FCA5A5" />
                <line
                  x1="48"
                  y1="32"
                  x2="48"
                  y2="64"
                  stroke="#EF4444"
                  strokeWidth="3"
                  strokeDasharray="5 3"
                />
                <polygon points="48,68 42,58 54,58" fill="#EF4444" />
                <polygon
                  points="48,62 72,74 48,86 24,74"
                  fill="#2E2113"
                  stroke="#F59E0B"
                  strokeWidth="2"
                />
                <rect x="42" y="66" width="12" height="10" fill="#FBBF24" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[#FEF3C7]">
                第一步 · 读懂荒兽红线，守护「九州灵脉塔」
              </h3>
              <p className="text-xs text-[#D6D0C4] leading-relaxed">
                敌方荒兽每回合都会提前亮出<strong className="text-[#FCA5A5]"> 红色弹道线与右上角出手顺位（1、2、3）</strong>。只要守住金色的<strong>「九州灵脉塔」</strong>不被轰击、坚持完 <strong>4 个回合</strong>即可大捷！我方神机即使受创倒地，下回合也会自动修复重返战场。
              </p>
            </div>
          </section>

          {/* Card 2: Rotate the 3x3 Bronze Luopan Ring */}
          <section className="p-4 rounded bg-[#1C1814] border border-[#44382C] grid grid-cols-1 sm:grid-cols-[108px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded bg-[#120F0D] border border-[#5C4D3C] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 96 96" className="w-20 h-20" aria-hidden="true">
                <ellipse
                  cx="48"
                  cy="50"
                  rx="34"
                  ry="20"
                  fill="#231C14"
                  stroke="#F59E0B"
                  strokeWidth="2.2"
                />
                <path
                  d="M24 34 A 30 18 0 0 1 72 34"
                  fill="none"
                  stroke="#FDE047"
                  strokeWidth="2.5"
                />
                <polygon points="75,36 67,30 71,40" fill="#FDE047" />
                <circle cx="48" cy="50" r="6" fill="#10B981" />
                <text
                  x="48"
                  y="86"
                  textAnchor="middle"
                  fill="#FBBF24"
                  fontSize="10"
                  fontWeight="700"
                >
                  90° 移星换向
                </text>
              </svg>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[#FDE68A]">
                第二步 · 旋转中央 3×3「青铜璇玑环」，借刀杀人
              </h3>
              <p className="text-xs text-[#D6D0C4] leading-relaxed">
                棋盘正中央镶有金色刻度的 3×3 区域为<strong>「青铜璇玑环」</strong>。点击底部<strong>【顺旋】</strong>或<strong>【逆旋】</strong>，环上所有敌我单位会随罗盘旋转 90°，<strong>且荒兽已锁定的攻击朝向也会同步偏转 90°</strong>——既能瞬间化解攻城危机，更能让荒兽把炮火轰向自己的同伴！
              </p>
            </div>
          </section>

          {/* Card 3: Displacement, Terrain Kills & Dual-Device Controls */}
          <section className="p-4 rounded bg-[#1C1814] border border-[#44382C] grid grid-cols-1 sm:grid-cols-[108px_minmax(0,1fr)] gap-4 items-center">
            <div className="w-24 h-24 mx-auto rounded bg-[#120F0D] border border-[#5C4D3C] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 96 96" className="w-20 h-20" aria-hidden="true">
                <rect
                  x="14"
                  y="36"
                  width="22"
                  height="22"
                  rx="3"
                  fill="#065F46"
                  stroke="#34D399"
                  strokeWidth="2"
                />
                <line
                  x1="38"
                  y1="47"
                  x2="58"
                  y2="47"
                  stroke="#34D399"
                  strokeWidth="3"
                />
                <polygon points="62,47 54,41 54,53" fill="#34D399" />
                <rect
                  x="64"
                  y="36"
                  width="20"
                  height="22"
                  rx="3"
                  fill="#0C4A6E"
                  stroke="#38BDF8"
                  strokeWidth="2"
                />
                <text
                  x="48"
                  y="84"
                  textAnchor="middle"
                  fill="#67E8F9"
                  fontSize="10"
                  fontWeight="700"
                >
                  碰撞 · 落水 · 坠渊
                </text>
              </svg>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-[#34D399]">
                第三步 · 地形秒杀、司南锦囊与键鼠/触屏操作
              </h3>
              <p className="text-xs text-[#D6D0C4] leading-relaxed">
                善用重锤击退、曲射震爆与乾坤换位：将荒兽推撞山体或其他单位可造成<strong> +1 双向碰撞伤害</strong>；推入<strong>沧澜水脉</strong>令非飞行荒兽当场<strong>短路熄火</strong>取消攻击；推入<strong>千丈深渊</strong>直接秒杀！
              </p>
              <p className="text-xs text-[#A7F3D0] leading-relaxed">
                <strong>多端操作</strong>：电脑端鼠标悬停即显示全因果预演、单击执行；<strong>手机/平板触屏首次轻点方格先锁定预演，再次轻点同一格（或点【确认执行】）落子</strong>，绝不误触！拿不准时随时点右上角<strong>【司南推演】</strong>获取妙手提示。
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#1F1A15] border-t border-[#44382C] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartGuidedPractice}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#112A26] hover:bg-[#163832] border border-[#10B981] text-xs font-bold text-[#A7F3D0] cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>开启四步实战带教</span>
          </button>

          <button
            type="button"
            data-testid="close-xuanji-tutorial-btn"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded bg-[#D97706] hover:bg-[#B45309] text-xs font-bold text-white cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>知晓要领，进入沙盘</span>
          </button>
        </div>
      </div>
    </div>
  );
};
