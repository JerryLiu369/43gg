import React from 'react';
import { Flame, Hammer, Sparkles } from 'lucide-react';
import { OrbGlyphSvg } from './icons.tsx';
import type { ForgeRewardOption } from './types.ts';

interface ForgeRewardModalProps {
  stageClearedNum: number;
  options: ForgeRewardOption[];
  onSelect: (index: number) => void;
}

export const ForgeRewardModal: React.FC<ForgeRewardModalProps> = ({
  stageClearedNum,
  options,
  onSelect,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ef-reward-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/78 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#1A1412] border border-[#5C483C] text-[#FAF5EE] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#342923] flex items-center justify-between">
          <div>
            <h2
              id="ef-reward-title"
              className="text-lg font-bold text-[#FAF5EE]"
            >
              第 {stageClearedNum} 阵肃清 · 铁砧择一锻造
            </h2>
            <p className="text-xs text-[#C7B8AC] mt-0.5">
              已自动回温 +10 点炉心耐久，请选择一项强化进入下一炉阵
            </p>
          </div>
          <Hammer className="w-5 h-5 text-[#F59E0B] shrink-0" aria-hidden="true" />
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`forge-reward-${idx}`}
              onClick={() => onSelect(idx)}
              className="group text-left p-4 rounded-lg bg-[#231B18] hover:bg-[#2F241F] border border-[#46372E] hover:border-[#F59E0B] focus:outline-none focus-visible:border-[#F59E0B] flex flex-col justify-between gap-3 transition-colors cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  {opt.orbTypeId ? (
                    <OrbGlyphSvg orbId={opt.orbTypeId} size={28} />
                  ) : opt.kind === 'relic' ? (
                    <div className="w-7 h-7 rounded-md bg-[#342518] border border-[#B45309] flex items-center justify-center text-[#FBBF24]">
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-[#341D18] border border-[#C2410C] flex items-center justify-center text-[#FB923C]">
                      <Flame className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}
                  <span className="text-[11px] font-medium text-[#D6B594]">
                    {opt.subtitle}
                  </span>
                </div>

                <div className="text-sm font-bold text-[#FAF5EE] group-hover:text-[#FDE047] transition-colors">
                  {opt.title}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#C7B8AC]">
                  {opt.description}
                </p>
              </div>

              <div className="pt-2.5 border-t border-[#342923] text-xs font-semibold text-[#F59E0B] group-hover:text-[#FDE047]">
                选择此项锻造 →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
