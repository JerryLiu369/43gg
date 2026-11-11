import React, { useEffect } from 'react';
import { Sparkles, Trash2, X } from 'lucide-react';
import { STREAMS_BY_ID, SYMBOLS_BY_ID } from './content.ts';
import { getMergeableDefIds, getSymbolBaseCoins } from './engine.ts';
import { SymbolArtSvg } from './icons.tsx';
import type { RunState } from './types.ts';

interface DeckAndMergeModalProps {
  run: RunState;
  onMergeDefId: (defId: string) => void;
  onRemoveSymbolUid: (uid: string) => void;
  onClose: () => void;
}

export const DeckAndMergeModal: React.FC<DeckAndMergeModalProps> = ({
  run,
  onMergeDefId,
  onRemoveSymbolUid,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mergeableIds = getMergeableDefIds(run);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="当前账本牌库与三连升星管理"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1C1917]/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[86dvh] bg-[#FAF8F4] border border-[#D6D0C4] rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 bg-white border-b border-[#E4DFD5] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#1C1917]">
              当前牌库名册（共 {run.deck.length} 张 · 棋盘容量 20 格）
            </h2>
            <p className="text-xs text-[#78716C] mt-0.5 tabular-nums">
              可用移除券：{run.removeTokens} 张 · 集齐 3 张同名 1★ 符号即可合成为 2★ 精装金卡并腾出 2 个格位
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭牌库面板"
            className="p-2 rounded-lg border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2EFE9] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Triple Merge Banner if available */}
          {mergeableIds.length > 0 && (
            <div className="p-4 rounded-lg bg-[#FFFBEB] border border-[#F59E0B] flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#92400E]">
                  发现可三连升星的符号（共 {mergeableIds.length} 组）
                </div>
                <p className="text-xs text-[#78350F]">
                  合并 3 张 1★ 符号将保留全部已积累永久加成，大幅提升产出并精简牌库密度。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {mergeableIds.map((defId) => (
                  <button
                    key={defId}
                    type="button"
                    onClick={() => onMergeDefId(defId)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>升星合成 {SYMBOLS_BY_ID[defId]?.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deck Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {run.deck.map((inst) => {
              const def = SYMBOLS_BY_ID[inst.defId];
              if (!def) return null;
              const st = STREAMS_BY_ID[def.stream];
              const baseVal = getSymbolBaseCoins(def.id, inst.stars) + inst.permBonus;
              const canRemove = run.removeTokens > 0 && run.deck.length > 3;

              return (
                <div
                  key={inst.uid}
                  className="p-3.5 rounded-lg bg-white border border-[#E4DFD5] flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-center justify-center shrink-0">
                      <SymbolArtSvg defId={def.id} stars={inst.stars} className="w-7 h-7" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#1C1917] truncate">
                          {def.name}
                        </span>
                        <span className="text-xs font-mono-num font-bold text-[#B45309] shrink-0">
                          {inst.stars === 2 ? '2★' : '1★'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#78716C] tabular-nums">
                        <span style={{ color: st.colorHex }} className="font-semibold">
                          {st.shortName}
                        </span>
                        <span> · 基准 </span>
                        <span className="font-mono-num font-semibold text-[#1C1917]">
                          {baseVal >= 0 ? `+${baseVal}` : baseVal}
                        </span>
                        {inst.permBonus > 0 && (
                          <span className="text-[#15803D]"> (养成+{inst.permBonus})</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#57534E] mt-1 line-clamp-2">
                        {inst.stars === 2 ? def.star2Desc : def.desc}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canRemove}
                    onClick={() => onRemoveSymbolUid(inst.uid)}
                    title={
                      canRemove
                        ? `消耗 1 张移除券请退 ${def.name}`
                        : '移除券不足或牌库已达最低 3 张下限'
                    }
                    aria-label={`移除 ${def.name}`}
                    className={`p-1.5 rounded border text-xs transition-colors shrink-0 ${
                      canRemove
                        ? 'border-[#E4DFD5] text-[#57534E] hover:border-[#C2410C] hover:text-[#C2410C] cursor-pointer'
                        : 'border-transparent text-[#D6D0C4] cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
