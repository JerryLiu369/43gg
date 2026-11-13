import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  ENEMY_DEFS,
  MECH_DEFS,
  MECH_ORDER,
  RELIC_LIST,
  TERRAIN_META,
} from './content.ts';
import { MechClassIconSvg } from './icons.tsx';

interface CodexModalProps {
  onClose: () => void;
}

type CodexTab = 'tactics' | 'mechs' | 'enemies' | 'relics';

export const CodexModal: React.FC<CodexModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<CodexTab>('tactics');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="xuanji-codex-title"
    >
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#161310] border border-[#6B563E] rounded-lg text-[#F7F3E8] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#382E26] flex items-center justify-between gap-4">
          <div>
            <h2 id="xuanji-codex-title" className="text-lg font-bold tracking-tight text-[#FEF3C7]">
              璇玑兵法与神机图谱
            </h2>
            <p className="text-xs text-[#A8A29E] mt-0.5">
              全明牌弹道预演 · 借力打力 · 旋转罗盘扭转乾坤
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭战术典籍"
            className="p-1.5 rounded bg-[#26201B] hover:bg-[#382E26] border border-[#5C4D3C] text-[#E7E0D0] focus:outline-none focus-visible:border-[#F59E0B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2.5 bg-[#1C1814] border-b border-[#382E26] flex items-center gap-2">
          {(
            [
              ['tactics', '破阵法则与地形'],
              ['mechs', '三尊青铜神机'],
              ['enemies', '蚀铁荒兽图鉴'],
              ['relics', '奇门秘宝铭文'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === id
                  ? 'bg-[#3B2D1E] border-[#F59E0B] text-[#FEF3C7]'
                  : 'bg-transparent border-transparent text-[#A8A29E] hover:text-[#F7F3E8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm leading-relaxed">
          {activeTab === 'tactics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded bg-[#1F1A15] border border-[#44382C]">
                  <h3 className="text-sm font-bold text-[#FBBF24] mb-1.5">
                    璇玑移星（内环旋转 90°）
                  </h3>
                  <p className="text-xs text-[#D6D0C4]">
                    棋盘中央 3×3 区域为「青铜璇玑环」。点击顺旋或逆旋按钮，环上所有敌我单位会随齿轮同步旋转 90°，且荒兽已锁定的攻击朝向也会一并偏转，常可一举化解多路攻城危机或令敌军自相残杀。
                  </p>
                </div>
                <div className="p-4 rounded bg-[#1F1A15] border border-[#44382C]">
                  <h3 className="text-sm font-bold text-[#34D399] mb-1.5">
                    碰撞连击与借刀杀人
                  </h3>
                  <p className="text-xs text-[#D6D0C4]">
                    将荒兽推撞至山体、城垣或其他单位时，双方均承受额外碰撞伤害。若将荒兽推入其他荒兽的红色攻击预示格内，敌方回合结算时将直接误伤友军！
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#A8A29E] mb-3">
                  立体沙盘地形机制
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(TERRAIN_META).map(([key, meta]) => (
                    <div
                      key={key}
                      className="p-3 rounded bg-[#1C1814] border border-[#382E26] flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-bold"
                          style={{ color: meta.badgeColor }}
                        >
                          {meta.name}
                        </span>
                      </div>
                      <p className="text-xs text-[#A8A29E]">{meta.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mechs' && (
            <div className="space-y-4">
              {MECH_ORDER.map((mechId) => {
                const m = MECH_DEFS[mechId];
                return (
                  <div
                    key={mechId}
                    className="p-4 rounded bg-[#1F1A15] border border-[#44382C] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <MechClassIconSvg mechId={mechId} className="w-8 h-8" />
                        <div>
                          <div className="text-base font-bold text-[#FEF3C7]">
                            {m.name}
                          </div>
                          <div className="text-xs text-[#A8A29E]">
                            {m.title} · {m.roleLabel}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-mono-num text-[#D6D0C4]">
                        耐久 {m.maxHp} · 移动 {m.moveRange} 格
                        {m.flying ? ' · 浮空' : ''}
                        {m.armor > 0 ? ` · 重甲减伤 ${m.armor}` : ''}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded bg-[#161310] border border-[#382E26]">
                        <div className="text-xs font-bold text-[#34D399]">
                          主武器 [Q]：{m.primaryWeapon.name}
                        </div>
                        <p className="text-xs text-[#A8A29E] mt-1">
                          {m.primaryWeapon.detailDesc}
                        </p>
                      </div>
                      <div className="p-3 rounded bg-[#161310] border border-[#382E26]">
                        <div className="text-xs font-bold text-[#FBBF24]">
                          副武器 [E]：{m.secondaryWeapon.name}
                        </div>
                        <p className="text-xs text-[#A8A29E] mt-1">
                          {m.secondaryWeapon.detailDesc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'enemies' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.values(ENEMY_DEFS).map((e) => (
                <div
                  key={e.id}
                  className="p-4 rounded bg-[#1F1A15] border border-[#44382C] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#FCA5A5]">
                      {e.name}
                    </span>
                    <span className="text-xs font-mono-num text-[#A8A29E]">
                      HP {e.maxHp} · 伤害 {e.damage}
                    </span>
                  </div>
                  <div className="text-xs text-[#FBBF24]">{e.subtitle}</div>
                  <p className="text-xs text-[#D6D0C4]">{e.attackDesc}</p>
                  <p className="text-xs text-[#78716C]">{e.aiPolicyDesc}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'relics' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RELIC_LIST.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded bg-[#1F1A15] border border-[#44382C] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#FDE68A]">
                      {r.name}
                    </span>
                    <span className="text-xs text-[#A8A29E]">{r.category}</span>
                  </div>
                  <p className="text-xs text-[#D6D0C4]">{r.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#1C1814] border-t border-[#382E26] flex items-center justify-between text-xs text-[#A8A29E]">
          <span>快捷键：[1/2/3] 切换神机 · [Q/E] 武器瞄准 · [R/T] 旋转璇玑 · [H] 司南推演提示</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#D97706] hover:bg-[#B45309] text-white font-semibold cursor-pointer"
          >
            知晓兵法
          </button>
        </div>
      </div>
    </div>
  );
};
