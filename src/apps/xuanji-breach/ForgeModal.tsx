import React, { useState } from 'react';
import { ArrowRight, Check, Hammer, Shield, Sparkles } from 'lucide-react';
import { MECH_DEFS, MECH_ORDER, RELIC_DEFS, SECTORS } from './content.ts';
import { getDraftableRelics } from './engine.ts';
import { MechClassIconSvg } from './icons.tsx';
import type { BattleState, MechClassId, RelicId } from './types.ts';

interface ForgeModalProps {
  battleState: BattleState;
  onClaimRelic: (relicId: RelicId) => void;
  onUpgradeMech: (
    mechId: MechClassId,
    stat: 'bonusDamage' | 'bonusMove' | 'bonusHp',
    cost: number,
  ) => void;
  onRepairGrid: (cost: number) => void;
  onProceedNextSector: () => void;
}

export const ForgeModal: React.FC<ForgeModalProps> = ({
  battleState,
  onClaimRelic,
  onUpgradeMech,
  onRepairGrid,
  onProceedNextSector,
}) => {
  const [draftedRelic, setDraftedRelic] = useState<RelicId | null>(null);
  const draftOptions = React.useMemo(
    () => getDraftableRelics(battleState, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battleState.sectorIndex, battleState.endlessLoop],
  );

  const nextSectorIdx = (battleState.sectorIndex + 1) % SECTORS.length;
  const nextSector = SECTORS[nextSectorIdx];

  const handleSelectRelic = (id: RelicId) => {
    if (draftedRelic) return;
    setDraftedRelic(id);
    onClaimRelic(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="xuanji-forge-title"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-[#161310] border border-[#D97706] rounded-lg text-[#F7F3E8] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1F1A15] border-b border-[#44382C] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#34D399]">
              战区封印完成 · 天工整备铸造坊
            </div>
            <h2
              id="xuanji-forge-title"
              className="text-xl font-bold tracking-tight text-[#FEF3C7] mt-0.5"
            >
              锻造神机核心与奇门秘宝
            </h2>
          </div>

          <div className="flex items-center gap-5 text-xs font-mono-num">
            <div className="px-3 py-1.5 rounded bg-[#292118] border border-[#6B563E]">
              可用星铁：<span className="text-sm font-bold text-[#FBBF24]">{battleState.starIron}</span>
            </div>
            <div className="px-3 py-1.5 rounded bg-[#292118] border border-[#6B563E]">
              九州灵脉：<span className="text-sm font-bold text-[#34D399]">{battleState.gridPower}/{battleState.maxGridPower}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Step 1: Draft 1 of 3 Relics */}
          {draftOptions.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#FDE68A] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                  <span>战利品秘宝三选一（免费择一铭刻）</span>
                </h3>
                {draftedRelic && (
                  <span className="text-xs text-[#34D399] font-semibold">
                    已铭刻：{RELIC_DEFS[draftedRelic].name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {draftOptions.map((relicId) => {
                  const relic = RELIC_DEFS[relicId];
                  const isChosen = draftedRelic === relicId;
                  const isLockedOut = draftedRelic !== null && !isChosen;
                  return (
                    <button
                      key={relicId}
                      type="button"
                      disabled={isLockedOut}
                      onClick={() => handleSelectRelic(relicId)}
                      className={`p-4 rounded text-left border transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
                        isChosen
                          ? 'bg-[#112A26] border-[#10B981] text-[#ECFDF5]'
                          : isLockedOut
                            ? 'bg-[#191512] border-[#2E261F] text-[#78716C] opacity-55 cursor-not-allowed'
                            : 'bg-[#1F1A15] hover:bg-[#29221B] border-[#5C4D3C] hover:border-[#F59E0B]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#FEF3C7]">
                            {relic.name}
                          </span>
                          <span className="text-[11px] text-[#FBBF24]">
                            {relic.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#D6D0C4] mt-1.5 leading-relaxed">
                          {relic.desc}
                        </p>
                      </div>

                      <div className="text-xs font-semibold pt-2 border-t border-[#382E26] flex items-center gap-1.5 text-[#34D399]">
                        {isChosen ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>已装配秘宝</span>
                          </>
                        ) : (
                          <span>点击铭刻此秘宝</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Step 2: Spend Star Iron on Mech Upgrades & Grid Repair */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#FDE68A] flex items-center gap-2">
                <Hammer className="w-4 h-4 text-[#F59E0B]" />
                <span>星铁熔炉强化（消耗星铁永久提升神机性能）</span>
              </h3>
              <button
                type="button"
                disabled={
                  battleState.starIron < 1 ||
                  battleState.gridPower >= battleState.maxGridPower
                }
                onClick={() => onRepairGrid(1)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#112A26] hover:bg-[#163832] disabled:opacity-40 border border-[#10B981] text-xs font-semibold text-[#A7F3D0] cursor-pointer disabled:cursor-not-allowed"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>修复 1 格九州灵脉（1 星铁）</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {MECH_ORDER.map((mechId) => {
                const def = MECH_DEFS[mechId];
                const upg = battleState.mechUpgrades[mechId];
                const dmgCost = 2 + upg.bonusDamage * 2;
                const moveCost = 2 + upg.bonusMove * 2;
                const hpCost = 1 + upg.bonusHp;

                return (
                  <div
                    key={mechId}
                    className="p-4 rounded bg-[#1F1A15] border border-[#44382C] flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <MechClassIconSvg mechId={mechId} className="w-7 h-7" />
                      <div>
                        <div className="text-sm font-bold text-[#FEF3C7]">
                          {def.name}
                        </div>
                        <div className="text-xs font-mono-num text-[#A8A29E]">
                          HP {def.maxHp + upg.bonusHp} · 移速{' '}
                          {def.moveRange + upg.bonusMove} · 增伤 +{upg.bonusDamage}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={battleState.starIron < dmgCost}
                        onClick={() =>
                          onUpgradeMech(mechId, 'bonusDamage', dmgCost)
                        }
                        className="w-full px-3 py-1.5 rounded bg-[#292118] hover:bg-[#382D20] disabled:opacity-40 border border-[#6B563E] flex items-center justify-between text-xs cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>武器威力 +1</span>
                        <span className="font-mono-num text-[#FBBF24]">
                          {dmgCost} 星铁
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={battleState.starIron < moveCost}
                        onClick={() =>
                          onUpgradeMech(mechId, 'bonusMove', moveCost)
                        }
                        className="w-full px-3 py-1.5 rounded bg-[#292118] hover:bg-[#382D20] disabled:opacity-40 border border-[#6B563E] flex items-center justify-between text-xs cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>机动射程 +1 格</span>
                        <span className="font-mono-num text-[#FBBF24]">
                          {moveCost} 星铁
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={battleState.starIron < hpCost}
                        onClick={() =>
                          onUpgradeMech(mechId, 'bonusHp', hpCost)
                        }
                        className="w-full px-3 py-1.5 rounded bg-[#292118] hover:bg-[#382D20] disabled:opacity-40 border border-[#6B563E] flex items-center justify-between text-xs cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>玄铁装甲 +1 HP</span>
                        <span className="font-mono-num text-[#FBBF24]">
                          {hpCost} 星铁
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#1C1814] border-t border-[#44382C] flex items-center justify-between gap-4">
          <div className="text-xs text-[#A8A29E]">
            下一战区：<strong className="text-[#FEF3C7]">{nextSector.name}</strong>（{nextSector.subtitle}）
          </div>
          <button
            type="button"
            onClick={onProceedNextSector}
            className="inline-flex items-center gap-2 px-5 py-2 rounded bg-[#D97706] hover:bg-[#B45309] text-sm font-bold text-white cursor-pointer"
          >
            <span>出征下一战区</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
