import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { DIFFICULTY_DEFS, DIFFICULTY_ORDER, FIXTURES, MOVABLES, PHASES } from './content.ts';
import { PawIcon } from './icons.tsx';
import { shadowRuleText } from './SunDial.tsx';

interface CodexModalProps {
  onClose: () => void;
}

/** 一格示意：物件 + 影子 */
const PhaseDiagram: React.FC<{ phase: number }> = ({ phase }) => {
  const def = PHASES[phase];
  const cell = 14;
  const cols = 7;
  const rows = 4;
  const ox = 3;
  const oy = 3;
  const obj = { x: 3, y: 3 };
  const len = 2 + def.lengthDelta; // 以高 2 的石灯为例
  const cells: Array<[number, number]> = [];
  for (let k = 1; k <= len; k++) cells.push([obj.x + def.shadowDir[0] * k, obj.y + def.shadowDir[1] * k]);
  return (
    <svg viewBox={`0 0 ${cols * cell + 6} ${rows * cell + 6}`} className="w-full h-auto" aria-hidden="true">
      {Array.from({ length: rows }).map((_, y) =>
        Array.from({ length: cols }).map((__, x) => (
          <rect
            key={`${x}-${y}`}
            x={ox + x * cell + 0.5}
            y={oy + y * cell + 0.5}
            width={cell - 1}
            height={cell - 1}
            rx="1.5"
            fill="#EAD9B8"
          />
        )),
      )}
      {cells.map(([x, y]) => (
        <rect
          key={`s${x}-${y}`}
          x={ox + x * cell + 0.5}
          y={oy + y * cell + 0.5}
          width={cell - 1}
          height={cell - 1}
          rx="1.5"
          fill="#7B819A"
        />
      ))}
      <rect x={ox + obj.x * cell + 3} y={oy + obj.y * cell + 1} width={cell - 6} height={cell - 3} rx="1.5" fill="#8D887F" />
      <rect x={ox + obj.x * cell + 2} y={oy + obj.y * cell} width={cell - 4} height="3" rx="1" fill="#5B606B" />
    </svg>
  );
};

export const CodexModal: React.FC<CodexModalProps> = ({ onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-[#2B2118]/45 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-codex-title"
        className="ios-scroll w-full sm:max-w-2xl max-h-[88%] sm:max-h-full overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#FFFBF3] border border-[#E5D9C3] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-[#FFFBF3] border-b border-[#EFE5D3]">
          <h2 id="ios-codex-title" className="text-lg font-bold text-[#2B2118] ios-serif">
            玩法手册
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="关闭玩法手册"
            className="ios-btn-ghost w-9 h-9 inline-flex items-center justify-center rounded-lg"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-7 text-sm leading-relaxed text-[#4A3F31]">
          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">橘猫只走阴凉</h3>
            <p>
              盛夏正午前后，院子里的地砖晒得发烫。橘猫只肯走在影子里：屋檐下终日阴凉，摆件投下的影子随时辰转动。鱼干架是终点，晒不晒都能直接踏上去。
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-[#EFD9AE] px-3 py-2 text-[#6B4E1F]">阳光地砖：不能走</div>
              <div className="rounded-lg bg-[#7F86A3] px-3 py-2 text-white">影子：可以走</div>
              <div className="rounded-lg bg-[#9C7A55] px-3 py-2 text-white">屋檐：始终阴凉</div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">时辰与影子</h3>
            <p className="mb-3">
              点「等日头」让太阳走一个时辰。一天从辰时到申时共五个时辰，申时之后日落，鱼干就被收走了。等日头之前，猫脚下这一格在下个时辰也必须有影子。
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PHASES.map((p) => (
                <div key={p.index} className="rounded-lg border border-[#EFE5D3] bg-white p-2">
                  <PhaseDiagram phase={p.index} />
                  <div className="mt-1.5 font-semibold text-[#2B2118] ios-serif">{p.name}</div>
                  <div className="text-xs text-[#7A6A55]">{shadowRuleText(p.index)}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#7A6A55]">示意图以两格高的石灯为例。</p>
          </section>

          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">物件高度</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              {Object.values(FIXTURES).map((f) => (
                <li key={f.kind} className="flex items-center justify-between border-b border-dashed border-[#EFE5D3] py-1">
                  <span>{f.name}</span>
                  <span className="font-mono-num text-[#7A6A55]">高 {f.height}</span>
                </li>
              ))}
              {Object.values(MOVABLES).map((m) => (
                <li key={m.kind} className="flex items-center justify-between border-b border-dashed border-[#EFE5D3] py-1">
                  <span>{m.name}（可推）</span>
                  <span className="font-mono-num text-[#7A6A55]">高 {m.height}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">推盆与流云</h3>
            <p>
              顶着花盆或水缸走一步就能推动它，前方必须是空地；它的影子会跟着挪。云影不看太阳，每过一个时辰顺着箭头飘一格，飘出院子就没了。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">操作</h3>
            <ul className="space-y-1">
              <li>
                <span className="font-semibold text-[#2B2118]">鼠标：</span>
                悬停看路线，单击前往；把鼠标停在「等日头」上可以预览下个时辰的影子。
              </li>
              <li>
                <span className="font-semibold text-[#2B2118]">触屏：</span>
                第一次点格子显示路线，再点一次或点「前往」才出发；在棋盘上滑动走一步；「等日头」同样先预览、再确认。
              </li>
              <li>
                <span className="font-semibold text-[#2B2118]">键盘：</span>
                方向键 / WASD 走一步，空格等日头，Q 开关预览，Z 撤回，R 重来，H 提示。
              </li>
              <li className="flex items-start gap-1.5">
                <PawIcon className="w-4 h-4 mt-0.5 text-[#4C5F8F] shrink-0" />
                <span>预览时带白色爪印的格子，现在和下个时辰都有影子，是安心等日头的地方；橙色格子下个时辰会被晒到。</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-[#2B2118] mb-2">难度</h3>
            <ul className="space-y-1.5">
              {DIFFICULTY_ORDER.map((d) => (
                <li key={d}>
                  <span className="font-semibold text-[#2B2118]">{DIFFICULTY_DEFS[d].label}：</span>
                  {DIFFICULTY_DEFS[d].desc}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#7A6A55]">
              不用凉爪、步数不超过最少步数通关，会在关卡上盖一枚「妙」字印。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
