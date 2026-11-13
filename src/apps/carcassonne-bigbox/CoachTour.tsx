import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { sound } from './sound.ts';
import { markCarcTourDone } from './storage.ts';

interface Step {
  target: string;
  title: string;
  body: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    target: 'board',
    title: '共享版图与视野操作',
    body: '桌案上共同拼建中世纪卡卡颂。按住拖动可以平移视野，滚轮或双指缩放。中央是起始板块，所有人都必须贴着已有版图的边缘向外延伸。',
    tip: '每局版图都会根据走法自然生长成一幅完全不同的大地画卷。',
  },
  {
    target: 'tile-hand',
    title: '抽牌与旋转对接',
    body: '轮到你时已摸出一张新板块。边缘必须吻合：道路接道路、城堡接城堡、草地连草地。点击 ⟲ / ⟳ 按钮（或按键盘 R）可自由旋转 90 度。',
    tip: '若当前朝向边缘与邻近不匹配，系统会提示红字警示并禁用放置，避免误下。',
  },
  {
    target: 'board-spots',
    title: '选择金色落点放置',
    body: '棋盘边缘闪烁金光的方格是合法落点。点击任意金色方格预览放置，再点击【确认放置】即可将板块卡入版图。',
    tip: '也可以随时换选其他金色方格，或继续旋转板块寻找更优位置。',
  },
  {
    target: 'meeple-actions',
    title: '派遣米宝占领设施',
    body: '刚放好的板块上，可派 1 个米宝占领设施：骑士进城、强盗占路、修士进修道院、农夫躺草地。手里米宝有限，也可以选择不派随从。',
    tip: '如果该设施通过拼接已经连着其他玩家的米宝，不能直接空降，只能通过后续合流争夺。',
  },
  {
    target: 'player-hud',
    title: '闭合计分与米宝回收',
    body: '城墙合围（2分/块+2分/盾）、道路封死（1分/块）、修道院九宫格填满（9分）都会立即完工！得分最高的领主收回米宝回手。',
    tip: '多做 2~3 块的小城堡快速回收米宝，谨防手头工人全被卡死。',
  },
];

function findTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-coach="${name}"]`);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

export function CoachTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [steps, setSteps] = useState<Step[]>(STEPS);

  useEffect(() => {
    if (!open) return;
    const available = STEPS.filter((step) => findTarget(step.target));
    setSteps(available.length > 0 ? available : STEPS);
    setIndex(0);
  }, [open]);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const node = findTarget(step.target);
    if (!node) return setRect(null);
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setRect(node.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const timer = window.setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const finish = useCallback(() => {
    markCarcTourDone();
    sound.play('toggle');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight') {
        sound.play('click');
        setIndex((value) => Math.min(steps.length - 1, value + 1));
      }
      if (event.key === 'ArrowLeft') {
        sound.play('click');
        setIndex((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;

  const pad = 8;
  const box = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const cardWidth = Math.min(360, vw - 24);

  let cardStyle: React.CSSProperties = {
    left: (vw - cardWidth) / 2,
    top: Math.max(56, vh / 2 - 110),
    width: cardWidth,
  };
  if (box) {
    const spaceRight = vw - (box.left + box.width);
    const spaceLeft = box.left;
    const spaceBelow = vh - (box.top + box.height);

    if (box.width > vw * 0.55 && box.height > vh * 0.5) {
      cardStyle = { left: Math.max(12, box.left + 16), top: Math.max(56, box.top + 16), width: cardWidth };
    } else if (spaceRight >= cardWidth + 24) {
      cardStyle = {
        left: box.left + box.width + 14,
        top: Math.min(vh - 260, Math.max(56, box.top)),
        width: cardWidth,
      };
    } else if (spaceLeft >= cardWidth + 24) {
      cardStyle = {
        left: box.left - cardWidth - 14,
        top: Math.min(vh - 260, Math.max(56, box.top)),
        width: cardWidth,
      };
    } else if (spaceBelow >= 220) {
      cardStyle = {
        left: Math.min(vw - cardWidth - 12, Math.max(12, box.left)),
        top: Math.min(vh - 250, box.top + box.height + 12),
        width: cardWidth,
      };
    } else {
      cardStyle = {
        left: Math.min(vw - cardWidth - 12, Math.max(12, box.left)),
        top: Math.max(56, box.top - 250),
        width: cardWidth,
      };
    }
  }

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <div className="coach-overlay" role="dialog" aria-modal="true" aria-label="卡卡颂新手引导">
      <div className="coach-backdrop" onClick={finish} />

      {box && (
        <div
          className="coach-spotlight"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        />
      )}

      <div className="coach-card" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <span className="text-[11px] font-bold tracking-wider text-amber-300">
            新手导引 · {index + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="跳过引导"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3">
          <h3 className="carc-display text-lg font-bold text-amber-50">{step.title}</h3>
          <p className="mt-1.5 text-xs leading-6 text-slate-300">{step.body}</p>
          {step.tip && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2.5 text-[11px] leading-5 text-amber-100">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
              <span>{step.tip}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <button type="button" onClick={finish} className="text-xs text-slate-400 hover:text-white cursor-pointer">
            跳过
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  setIndex((i) => Math.max(0, i - 1));
                }}
                className="carc-btn text-xs py-1.5 px-2.5"
              >
                <ArrowLeft className="size-3.5" /> 上一步
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                if (isLast) finish();
                else setIndex((i) => Math.min(steps.length - 1, i + 1));
              }}
              className="carc-btn primary text-xs py-1.5 px-3.5"
            >
              {isLast ? '进入对局' : '下一步'}
              {!isLast && <ArrowRight className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
