import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from './ui.tsx';
import { sound } from './sound.ts';
import { markTtrTourDone } from './storage.ts';

interface Step {
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: 'board',
    title: '这是欧洲铁路版图',
    body: '一串彩色格子连成的就是一条路线。按住拖动可以平移，滚轮或双指可以缩放，点一条路线能看到它要多少张牌。',
  },
  {
    target: 'guide',
    title: '先看这里：现在该做什么',
    body: '每回合只能做一件事：摸牌、占领路线、拿新车票或建车站。这里会一直提示当前你能执行的行动。',
  },
  {
    target: 'market',
    title: '摸牌区',
    body: '轮到你时，点一张明牌直接拿走，或点右边的牌堆摸一张未知的牌，每回合摸 2 张。明牌里的火车头是万能牌，但拿它就算摸了 2 张。',
  },
  {
    target: 'hand',
    title: '你的手牌',
    body: '凑齐与路线同颜色、同数量的牌，就能占领它；灰色路线用任意一种颜色都行。能占领的路线会在版图上发光。',
  },
  {
    target: 'tickets',
    title: '你的车票',
    body: '把车票上的两座城市用自己的铁路连起来就能得分，没连上会扣分。鼠标移到车票上（手机点一下），版图会标出最省车厢的路线。',
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
    const timer = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const finish = useCallback(() => {
    markTtrTourDone();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(steps.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
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
  const cardWidth = Math.min(340, vw - 24);
  let cardStyle: React.CSSProperties = { left: (vw - cardWidth) / 2, top: Math.max(56, vh / 2 - 100), width: cardWidth };
  if (box) {
    const spaceRight = vw - (box.left + box.width);
    const spaceLeft = box.left;
    const spaceBelow = vh - (box.top + box.height);
    if (box.width > vw * 0.5 && box.height > vh * 0.45) {
      cardStyle = { left: Math.max(12, box.left + 16), top: Math.max(56, box.top + 16), width: cardWidth };
    } else if (spaceLeft > cardWidth + 24) {
      cardStyle = {
        left: box.left - cardWidth - 16,
        top: Math.max(56, Math.min(vh - 260, box.top)),
        width: cardWidth,
      };
    } else if (spaceRight > cardWidth + 24) {
      cardStyle = {
        left: box.left + box.width + 16,
        top: Math.max(56, Math.min(vh - 260, box.top)),
        width: cardWidth,
      };
    } else if (spaceBelow > 240) {
      cardStyle = {
        left: Math.max(12, Math.min(vw - cardWidth - 12, box.left)),
        top: Math.min(vh - 240, box.top + box.height + 12),
        width: cardWidth,
      };
    } else {
      cardStyle = {
        left: Math.max(12, Math.min(vw - cardWidth - 12, box.left)),
        top: Math.max(56, box.top - 250),
        width: cardWidth,
      };
    }
  }

  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="新手引导">
      {box ? (
        <div className="coach-spotlight" style={box} />
      ) : (
        <div className="absolute inset-0 bg-ink-950/75" />
      )}
      <div className="ttr-panel absolute z-[95] rounded-2xl p-4 shadow-2xl animate-rise" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold text-brass-300">
            新手引导 {index + 1} / {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="rounded p-0.5 text-paper-400 hover:text-paper-100 cursor-pointer"
            aria-label="跳过引导"
          >
            <X className="size-4" />
          </button>
        </div>
        <h3 className="mt-1 ttr-display text-lg text-paper-50">{step.title}</h3>
        <p className="mt-1.5 text-[13px] leading-6 text-paper-300">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-xs text-paper-400 hover:text-paper-200 cursor-pointer">
            跳过
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
                <ArrowLeft className="size-3.5" /> 上一步
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                sound.play('click');
                if (last) finish();
                else setIndex(index + 1);
              }}
            >
              {last ? '开始游戏' : '下一步'} {!last && <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
