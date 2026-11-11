import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  LANDLORDS_BY_ID,
  RARITY_META,
  RELICS,
  ROOMS,
  STREAMS,
  STREAMS_BY_ID,
  SYMBOLS,
} from './content.ts';
import { getSymbolBaseCoins } from './engine.ts';
import { RoomBadgeSvg, SymbolArtSvg } from './icons.tsx';
import type { MetaSaveData, StreamId } from './types.ts';

interface CompendiumModalProps {
  meta: MetaSaveData;
  onClose: () => void;
}

type TabId = 'symbols' | 'relics' | 'rooms' | 'records';

export const CompendiumModal: React.FC<CompendiumModalProps> = ({ meta, onClose }) => {
  const [tab, setTab] = useState<TabId>('symbols');
  const [streamFilter, setStreamFilter] = useState<StreamId | 'all'>('all');
  const [revealAll, setRevealAll] = useState<boolean>(true);

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

  const discoveredSymSet = new Set(meta.discoveredSymbols);
  const discoveredRelicSet = new Set(meta.discoveredRelics);

  const filteredSymbols = SYMBOLS.filter(
    (s) => streamFilter === 'all' || s.stream === streamFilter,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="吉星包租公全图鉴与收租档案"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1C1917]/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[88dvh] bg-[#FAF8F4] border border-[#D6D0C4] rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 bg-white border-b border-[#E4DFD5] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#1C1917]">房东总账图鉴与荣誉档案</h2>
            <p className="text-xs text-[#78716C] mt-0.5 tabular-nums">
              已收录符号 {discoveredSymSet.size}/{SYMBOLS.length} · 传家宝{' '}
              {discoveredRelicSet.size}/{RELICS.length} · 最高阶梯 难度 {meta.unlockedAscension}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭图鉴"
            className="p-2 rounded-lg border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] hover:bg-[#F2EFE9] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Sub-navigation Tabs */}
        <div className="px-6 py-3 bg-[#F2EFE9] border-b border-[#E4DFD5] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-[#E7E2D8] rounded-lg">
            {(
              [
                ['symbols', `符号图鉴 (${SYMBOLS.length})`],
                ['relics', `传家宝印章 (${RELICS.length})`],
                ['rooms', `装修房型 (${ROOMS.length})`],
                ['records', '历届榜单'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === id
                    ? 'bg-white text-[#1C1917]'
                    : 'text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'symbols' && (
            <label className="inline-flex items-center gap-2 text-xs text-[#57534E] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={revealAll}
                onChange={(e) => setRevealAll(e.target.checked)}
                className="accent-[#C2410C]"
              />
              <span>显示尚未偶遇的符号详情</span>
            </label>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'symbols' && (
            <>
              {/* Stream Segmented Filter */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStreamFilter('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    streamFilter === 'all'
                      ? 'bg-[#1C1917] text-white border-[#1C1917]'
                      : 'bg-white text-[#57534E] border-[#E4DFD5] hover:border-[#1C1917]'
                  }`}
                >
                  全部流派 ({SYMBOLS.length})
                </button>
                {STREAMS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStreamFilter(st.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      streamFilter === st.id
                        ? 'bg-[#1C1917] text-white border-[#1C1917]'
                        : 'bg-white text-[#57534E] border-[#E4DFD5] hover:border-[#1C1917]'
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredSymbols.map((sym) => {
                  const unlocked = discoveredSymSet.has(sym.id);
                  const show = unlocked || revealAll;
                  const st = STREAMS_BY_ID[sym.stream];
                  const rar = RARITY_META[sym.rarity];
                  return (
                    <div
                      key={sym.id}
                      className="p-4 rounded-lg bg-white border border-[#E4DFD5] flex items-start gap-3.5"
                    >
                      <div className="w-11 h-11 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-center justify-center shrink-0">
                        <SymbolArtSvg defId={sym.id} stars={1} className="w-8 h-8" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#1C1917] truncate">
                            {show ? sym.name : '？？？'}
                          </h3>
                          <span className="text-xs font-mono-num text-[#57534E] shrink-0">
                            1★ {sym.baseCoins >= 0 ? `+${sym.baseCoins}` : sym.baseCoins} · 2★ +
                            {getSymbolBaseCoins(sym.id, 2)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#78716C]">
                          <span style={{ color: st.colorHex }} className="font-semibold">
                            {st.name}
                          </span>
                          <span> · </span>
                          <span style={{ color: rar.colorHex }} className="font-medium">
                            {rar.label}
                          </span>
                          <span> · </span>
                          <span>{unlocked ? '已收录' : '未偶遇'}</span>
                        </div>
                        {show ? (
                          <>
                            <p className="text-xs text-[#1C1917] leading-relaxed">{sym.desc}</p>
                            <p className="text-[11px] text-[#9A3412] leading-relaxed">
                              {sym.star2Desc}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-[#78716C]">
                            在收租对局中招募一次即可解锁档案记录。
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'relics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {RELICS.map((rel) => {
                const unlocked = discoveredRelicSet.has(rel.id);
                const rar = RARITY_META[rel.rarity];
                return (
                  <div
                    key={rel.id}
                    className="p-4 rounded-lg bg-white border border-[#E4DFD5] space-y-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#1C1917]">{rel.name}</h3>
                      <span className="text-[11px] text-[#78716C]">
                        <span style={{ color: rar.colorHex }} className="font-semibold">
                          {rar.label}印章
                        </span>
                        <span> · </span>
                        <span>{unlocked ? '已收录' : '待收集'}</span>
                      </span>
                    </div>
                    <p className="text-xs text-[#57534E] leading-relaxed">{rel.desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'rooms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ROOMS.map((rm) => (
                <div
                  key={rm.id}
                  className="p-4 rounded-lg bg-white border border-[#E4DFD5] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RoomBadgeSvg room={rm.id} className="w-4 h-4" />
                      <h3 className="text-sm font-bold text-[#1C1917]">{rm.name}</h3>
                    </div>
                    <span className="text-xs font-mono-num text-[#78716C]">
                      {rm.baseCostCoins > 0 ? `基准造价 ${rm.baseCostCoins} 金币` : '初始房型'}
                    </span>
                  </div>
                  <p className="text-xs text-[#57534E] leading-relaxed">{rm.desc}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'records' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                  <div className="text-xs text-[#78716C]">累计开局</div>
                  <div className="text-2xl font-bold font-mono-num text-[#1C1917] mt-1">
                    {meta.totalRuns}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                  <div className="text-xs text-[#78716C]">通关次数</div>
                  <div className="text-2xl font-bold font-mono-num text-[#15803D] mt-1">
                    {meta.totalVictories}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                  <div className="text-xs text-[#78716C]">最高到达账期</div>
                  <div className="text-2xl font-bold font-mono-num text-[#1C1917] mt-1">
                    第 {meta.highestCycle} 期
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-white border border-[#E4DFD5]">
                  <div className="text-xs text-[#78716C]">单轮最高爆发</div>
                  <div className="text-2xl font-bold font-mono-num text-[#C2410C] mt-1">
                    +{meta.highestSingleSpin}
                  </div>
                </div>
              </div>

              {meta.recentRecords.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#E4DFD5] rounded-lg text-sm text-[#78716C]">
                  暂无完赛收租记录，完成一局游戏后将在此登记账册。
                </div>
              ) : (
                <div className="overflow-x-auto bg-white border border-[#E4DFD5] rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E4DFD5] text-[#78716C]">
                        <th className="py-2.5 px-4 font-medium">房东</th>
                        <th className="py-2.5 px-4 font-medium">阶梯</th>
                        <th className="py-2.5 px-4 font-medium">结局</th>
                        <th className="py-2.5 px-4 font-medium">账期</th>
                        <th className="py-2.5 px-4 font-medium">单轮最高</th>
                        <th className="py-2.5 px-4 font-medium">累计总营收</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4DFD5] font-mono-num">
                      {meta.recentRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td className="py-2.5 px-4 font-sans font-semibold text-[#1C1917]">
                            {LANDLORDS_BY_ID[rec.landlordId]?.name ?? rec.landlordId}
                          </td>
                          <td className="py-2.5 px-4">难度 {rec.ascension}</td>
                          <td className="py-2.5 px-4 font-sans">
                            {rec.outcome === 'victory'
                              ? '圆满通关'
                              : rec.outcome === 'endless'
                                ? '无尽结算'
                                : '断租破产'}
                          </td>
                          <td className="py-2.5 px-4">第 {rec.cycleReached} 期</td>
                          <td className="py-2.5 px-4 text-[#C2410C]">+{rec.bestSingleSpin}</td>
                          <td className="py-2.5 px-4 font-semibold">{rec.totalCoinsEarned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
