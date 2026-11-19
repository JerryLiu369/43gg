import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ORB_LIST, PEG_META } from './content.ts';
import { OrbGlyphSvg, PegGlyphSvg } from './icons.tsx';
import type { PegKind } from './types.ts';

interface HandbookModalProps {
  open: boolean;
  onClose: () => void;
  onReplayTutorial: () => void;
}

const PEG_ORDER: PegKind[] = [
  'bronze',
  'crit',
  'mult',
  'bomb',
  'wind',
  'prism',
  'shield',
];

export const HandbookModal: React.FC<HandbookModalProps> = ({
  open,
  onClose,
  onReplayTutorial,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ef-handbook-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[86dvh] flex flex-col rounded-xl bg-[#1A1412] border border-[#4D3D34] text-[#FAF5EE] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#342923] flex items-center justify-between gap-4">
          <div>
            <h2
              id="ef-handbook-title"
              className="text-base font-bold text-[#FAF5EE]"
            >
              锻造手册 · 玩法与符钉图鉴
            </h2>
            <p className="text-xs text-[#C7B8AC] mt-0.5">
              物理弹射攒连击，半空鼓风控球，落底齐射破敌
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="关闭锻造手册"
            className="w-8 h-8 flex items-center justify-center rounded-md bg-[#28201C] hover:bg-[#3A2E28] border border-[#4D3D34] focus:outline-none focus-visible:border-[#F59E0B] text-[#E6DAD0] cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Controls */}
          <section>
            <h3 className="text-xs font-bold text-[#F59E0B] mb-2">
              核心操作（桌面键鼠 + 手机触屏）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#E6DAD0]">
              <div className="p-3 rounded-lg bg-[#221B18] border border-[#382C26]">
                <div className="font-semibold text-[#FAF5EE]">瞄准与发射</div>
                <p className="mt-1 text-[#C7B8AC] leading-relaxed">
                  桌面移动鼠标查看抛物线与首次反弹预测，左键发射；触屏在炉膛内拖动瞄准，松手或点底部「发射」出球。点击上方敌军可切换锁定目标。
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#221B18] border border-[#382C26]">
                <div className="font-semibold text-[#2DD4BF]">
                  鼓风磁冲（半空控球）
                </div>
                <p className="mt-1 text-[#C7B8AC] leading-relaxed">
                  铁球飞行中按 <kbd className="px-1 py-0.5 rounded bg-[#14100E] border border-[#4D3D34] font-mono">Space</kbd> / 右键或点击底部「鼓风磁冲」，立即引爆气浪将铁球托举回高价值符钉区并震响周遭符钉。
                </p>
              </div>
            </div>
          </section>

          {/* Peg legend */}
          <section>
            <h3 className="text-xs font-bold text-[#F59E0B] mb-2">
              七类炉壁符钉与承火金盂
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PEG_ORDER.map((kind) => {
                const meta = PEG_META[kind];
                return (
                  <div
                    key={kind}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#221B18] border border-[#342923]"
                  >
                    <div className="mt-0.5 shrink-0">
                      <PegGlyphSvg kind={kind} size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#FAF5EE]">
                        {meta.name}
                        <span className="ml-1.5 font-normal text-[#F59E0B]">
                          · {meta.short}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#C7B8AC] mt-0.5 leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[#D6C7B9]">
              炉底游走的「承火金盂」接住落球时，本发齐射伤害额外 +35% 并铸造 +6 炉心护盾。
            </p>
          </section>

          {/* Orbs */}
          <section>
            <h3 className="text-xs font-bold text-[#F59E0B] mb-2">
              八种可锻造弹丸
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ORB_LIST.map((orb) => (
                <div
                  key={orb.id}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#221B18] border border-[#342923]"
                >
                  <div className="mt-0.5 shrink-0">
                    <OrbGlyphSvg orbId={orb.id} size={24} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#FAF5EE]">
                      {orb.name}
                      <span className="ml-1.5 font-normal text-[#C7B8AC]">
                        · {orb.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#C7B8AC] mt-0.5 leading-snug">
                      {orb.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-[#342923] bg-[#15100E] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onReplayTutorial();
            }}
            className="px-3 py-1.5 rounded-md bg-[#28201C] hover:bg-[#382C26] border border-[#4D3D34] focus:outline-none focus-visible:border-[#F59E0B] text-xs font-medium text-[#FAF5EE] cursor-pointer"
          >
            重温实战指引
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[#E85D26] hover:bg-[#C2410C] text-xs font-semibold text-white cursor-pointer"
          >
            回到熔炉
          </button>
        </div>
      </div>
    </div>
  );
};
