import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BOON_DEFS, ENEMY_ARCHETYPES } from './content.ts';
import { BoonSealSvg } from './icons.tsx';

interface GuideModalProps {
  onClose: () => void;
}

type GuideTab = 'mechanics' | 'enemies' | 'boons';

export const GuideModal: React.FC<GuideModalProps> = ({ onClose }) => {
  const [tab, setTab] = useState<GuideTab>('mechanics');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const enemyList = Object.values(ENEMY_ARCHETYPES);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ink-blade-guide-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.72)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[82vh] flex flex-col bg-[#FAF8F4] text-[#1C1917] border-2 border-[#1C1917] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E4DFD5] flex items-center justify-between gap-4 bg-[#F3EFE6]">
          <div className="flex items-center gap-4 min-w-0">
            <h2
              id="ink-blade-guide-title"
              className="text-lg font-bold tracking-tight text-[#1C1917] whitespace-nowrap"
            >
              剑谱心法
            </h2>
            <div
              role="tablist"
              aria-label="剑谱章节"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#E6E0D3]"
            >
              {(
                [
                  ['mechanics', '核心招式'],
                  ['enemies', '敌阵图谱'],
                  ['boons', '刀铭秘传'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    tab === id
                      ? 'bg-[#FAF8F4] border-[#D6CEBE] text-[#1C1917]'
                      : 'border-transparent text-[#57534E] hover:text-[#1C1917]'
                  } focus:outline-none focus-visible:border-[#C2410C]`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label="关闭剑谱"
            onClick={onClose}
            className="w-8 h-8 rounded-md bg-white hover:bg-[#EFECE5] border border-[#D6D0C4] flex items-center justify-center text-[#1C1917] cursor-pointer focus:outline-none focus-visible:border-[#C2410C] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {tab === 'mechanics' && (
            <div className="space-y-4 text-sm leading-relaxed text-[#292524]">
              <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                <h3 className="font-bold text-[#1C1917] mb-1">
                  疾斩与一闪刷新（左键点击 / J 键）
                </h3>
                <p className="text-[#57534E]">
                  朝准星方向化作墨光瞬身突进并斩击沿途所有敌军。凡凭疾斩直接
                  <strong className="text-[#C2410C] font-semibold"> 击杀任一敌人 </strong>
                  或
                  <strong className="text-[#C2410C] font-semibold"> 破除敌方重盾</strong>
                  ，疾斩冷却将瞬间清零并回复心眼锋芒，实现行云流水的连续一闪收割。
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                <h3 className="font-bold text-[#1C1917] mb-1">
                  心眼慢镜（长按左键 / 长按 J 键松开出刀）
                </h3>
                <p className="text-[#57534E]">
                  疾斩就绪时长按攻击键可消耗「心眼锋芒」令全场时间减缓至四分之一，同时标出刀路终点与可斩杀目标（朱砂圆环为必中，虚线灰环为被正面重盾阻挡），松开按键即刻出刀。
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                <h3 className="font-bold text-[#1C1917] mb-1">
                  刹那弹反与踏影（右键 / Space / K 键）
                </h3>
                <p className="text-[#57534E]">
                  展开金色护身剑围并向移动方向轻踏一步（可穿过玄甲卫绕至其背后）。剑围展开瞬间若迎上敌方弩箭、火雷或近战红光突刺，即触发
                  <strong className="text-[#D97706] font-semibold"> 刹那弹反</strong>
                  ：将箭矢倍速奉还破甲杀敌、震晕近战袭击者，并立即刷新疾斩冷却。
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                <h3 className="font-bold text-[#1C1917] mb-1">
                  庭院机关与火药瓮
                </h3>
                <p className="text-[#57534E]">
                  石柱可阻挡弩手视线；挥刀掠过庭院中的朱红「火药瓮」可将其引爆，大范围轰碎敌群的玄甲重盾并触发连锁爆炸。
                </p>
              </div>
            </div>
          )}

          {tab === 'enemies' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {enemyList.map((e) => (
                <div
                  key={e.id}
                  className="p-4 rounded-lg bg-white border border-[#E4DFD5] flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: e.trimHex }}
                        aria-hidden="true"
                      />
                      <span className="font-bold text-sm text-[#1C1917] truncate">
                        {e.name}
                      </span>
                    </div>
                    <span className="text-xs text-[#78716C] font-mono-num whitespace-nowrap">
                      气血 {e.maxHp} · {e.roleLabel}
                    </span>
                  </div>
                  <p className="text-xs text-[#57534E] leading-relaxed">
                    {e.desc}
                  </p>
                </div>
              ))}
            </div>
          )}

          {tab === 'boons' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BOON_DEFS.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-lg bg-white border border-[#E4DFD5] flex items-start gap-3"
                >
                  <BoonSealSvg
                    category={b.category}
                    accentHex={b.accentHex}
                    className="w-8 h-8 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1C1917]">
                        {b.name}
                      </span>
                      <span className="text-xs text-[#78716C]">
                        · {b.shortTag}
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] mt-1 leading-relaxed">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
