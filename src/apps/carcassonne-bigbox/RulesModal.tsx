import { useEffect } from 'react';
import { BookOpen, Sparkles, X } from 'lucide-react';
import { EXPANSION_INFO } from './lib/labels.ts';
import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const expList = ALL_EXPANSIONS.filter((id): id is Exclude<ExpansionId, 'BASE'> => id !== 'BASE');

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/75 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="卡卡颂规则速查"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-400/25 bg-[#111920] text-[#f5f2e9] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
              <Sparkles className="size-3" /> 规则速成
            </span>
            <h2 className="mt-1.5 carc-display text-xl font-bold text-white">卡卡颂 · 大盒版玩法规则</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭规则"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="max-h-[min(70dvh,680px)] space-y-5 overflow-y-auto px-5 py-4 text-xs leading-6 text-slate-300">
          <section className="space-y-2">
            <h3 className="carc-display text-base font-bold text-amber-200">每回合三步流程</h3>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">拼放地形板块</p>
                <p className="mt-1 text-slate-300">摸出 1 张版图接在已有版图旁。边缘必须吻合：路接路、城接城、草连草。</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">派遣随从（可选）</p>
                <p className="mt-1 text-slate-300">可派 1 枚棋子占领刚放版图上的路、城、修道院或草地（若相连地形已有棋子则不能空降）。</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">闭合计分与回收</p>
                <p className="mt-1 text-slate-300">道路、城堡或修道院一旦合围闭合，立即按多数控制计分，并将棋子收回手中。</p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="carc-display text-base font-bold text-amber-200">四大核心地形计分</h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">道路（强盗）</p>
                <p className="mt-1">两端封闭即完工：每块板块得 1 分（含客栈得 2 分，未完工含客栈 0 分）。</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">城堡（骑士）</p>
                <p className="mt-1">城墙完全闭合即完工：每块 2 分 + 每盾 2 分（含大教堂每格 3 分；终局未完工 1 分/块，含大教堂 0 分）。</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">修道院 / 花园（修士 / 修道院长）</p>
                <p className="mt-1">周围 8 格填满得 9 分；终局未满按九宫格内已有板块数计分。修道院长可提前主动召回得分。</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-bold text-white">草地（农夫 · 终局计分）</p>
                <p className="mt-1">躺卧在草地上直到终局。该片连续草地接壤的每座已完工城堡，为占多数的农夫提供 3 分。</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
            <h3 className="carc-display text-sm font-bold text-amber-200">进阶技巧：合流抢城</h3>
            <p className="mt-1">
              不能直接空降到已经有人的领地，但可以先在旁边独立占城再拼接合流：棋子多的一方独吞全部分数；数量打平则双方各自拿到满分！
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="carc-display text-base font-bold text-amber-200">大盒版 11 个扩展模块</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {expList.map((id) => (
                <div key={id} className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                  <p className="font-semibold text-white">{EXPANSION_INFO[id].name}</p>
                  <p className="text-[11px] text-slate-400">{EXPANSION_INFO[id].hint}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <BookOpen className="size-3.5 text-amber-300" />
            单机对局无回合倒计时限制，放心推演版图拼接
          </span>
          <button type="button" onClick={onClose} className="carc-btn primary px-4 py-1.5">
            知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
