import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { cn } from './utils.ts';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.2;

export function BoardViewport({
  children,
  className,
  fitSignal,
}: {
  children: ReactNode;
  className?: string;
  fitSignal?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.7 });
  const [scaleLabel, setScaleLabel] = useState(70);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number; cx: number; cy: number } | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const draggedRef = useRef(false);
  const interactedRef = useRef(false);

  const apply = () => {
    const inner = innerRef.current;
    if (!inner) return;
    const view = viewRef.current;
    inner.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    setScaleLabel(Math.round(view.scale * 100));
  };

  const fit = () => {
    const outer = outerRef.current;
    if (!outer) return;
    const box = outer.getBoundingClientRect();
    if (box.width < 10 || box.height < 10) return;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((box.width - 16) / 1920, (box.height - 16) / 1080)));
    viewRef.current = {
      x: (box.width - 1920 * scale) / 2,
      y: (box.height - 1080 * scale) / 2,
      scale,
    };
    interactedRef.current = false;
    apply();
  };

  const zoomAt = (factor: number, px?: number, py?: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const box = outer.getBoundingClientRect();
    const view = viewRef.current;
    const cx = px ?? box.width / 2;
    const cy = py ?? box.height / 2;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    view.x = cx - ((cx - view.x) * next) / view.scale;
    view.y = cy - ((cy - view.y) * next) / view.scale;
    view.scale = next;
    interactedRef.current = true;
    apply();
  };

  const zoomButton = (factor: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const box = outer.getBoundingClientRect();
    zoomAt(factor, box.width / 2, box.height / 2);
  };

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const raf = window.requestAnimationFrame(fit);
    const observer = new ResizeObserver(() => {
      if (!interactedRef.current) fit();
    });
    observer.observe(outer);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = outer.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      zoomAt(Math.exp(-event.deltaY * 0.0015), px, py);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 1) {
        dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
        outer.classList.add('is-dragging');
      } else if (pointersRef.current.size === 2) {
        const points = [...pointersRef.current.values()];
        pinchRef.current = {
          distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
          scale: viewRef.current.scale,
          cx: (points[0].x + points[1].x) / 2,
          cy: (points[0].y + points[1].y) / 2,
        };
        dragRef.current = null;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size >= 2 && pinchRef.current) {
        const points = [...pointersRef.current.values()].slice(0, 2);
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const box = outer.getBoundingClientRect();
        const cx = (points[0].x + points[1].x) / 2 - box.left;
        const cy = (points[0].y + points[1].y) / 2 - box.top;
        const view = viewRef.current;
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchRef.current.scale * (distance / Math.max(1, pinchRef.current.distance))),
        );
        view.x = cx - ((cx - view.x) * next) / view.scale;
        view.y = cy - ((cy - view.y) * next) / view.scale;
        view.scale = next;
        interactedRef.current = true;
        apply();
        event.preventDefault();
        return;
      }

      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) {
        interactedRef.current = true;
        if (!outer.hasPointerCapture(event.pointerId)) outer.setPointerCapture(event.pointerId);
      }
      viewRef.current.x += dx;
      viewRef.current.y += dy;
      drag.x = event.clientX;
      drag.y = event.clientY;
      apply();
    };

    const finishPointer = (event: PointerEvent) => {
      if (dragRef.current?.id === event.pointerId) {
        draggedRef.current = dragRef.current.moved > 4;
        dragRef.current = null;
      }
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) outer.classList.remove('is-dragging');
    };

    const onClickCapture = (event: MouseEvent) => {
      if (draggedRef.current) {
        event.stopPropagation();
        event.preventDefault();
        draggedRef.current = false;
      }
    };

    outer.addEventListener('wheel', onWheel, { passive: false });
    outer.addEventListener('pointerdown', onPointerDown);
    outer.addEventListener('pointermove', onPointerMove);
    outer.addEventListener('pointerup', finishPointer);
    outer.addEventListener('pointercancel', finishPointer);
    outer.addEventListener('click', onClickCapture, { capture: true });
    apply();

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      outer.removeEventListener('wheel', onWheel);
      outer.removeEventListener('pointerdown', onPointerDown);
      outer.removeEventListener('pointermove', onPointerMove);
      outer.removeEventListener('pointerup', finishPointer);
      outer.removeEventListener('pointercancel', finishPointer);
      outer.removeEventListener('click', onClickCapture, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (fitSignal === undefined) return;
    window.requestAnimationFrame(fit);
  }, [fitSignal]);

  return (
    <div
      ref={outerRef}
      className={cn('board-stage relative h-full w-full overflow-hidden rounded-2xl bg-[#241b15]', className)}
      aria-label="版图：拖动平移，滚轮或双指缩放"
    >
      <div ref={innerRef} style={{ width: 1920, height: 1080, transformOrigin: '0 0', willChange: 'transform' }}>
        {children}
      </div>

      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-xl border border-white/10 bg-ink-950/85 p-1 shadow-xl">
        <button
          type="button"
          onClick={() => zoomButton(1 / 1.2)}
          className="grid size-7 sm:size-8 place-items-center rounded-lg text-paper-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
          aria-label="缩小"
        >
          <Minus className="size-3.5 sm:size-4" />
        </button>
        <span className="w-10 text-center text-[10px] font-bold tabular-nums text-paper-400">{scaleLabel}%</span>
        <button
          type="button"
          onClick={() => zoomButton(1.2)}
          className="grid size-7 sm:size-8 place-items-center rounded-lg text-paper-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
          aria-label="放大"
        >
          <Plus className="size-3.5 sm:size-4" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={fit}
          className="grid size-7 sm:size-8 place-items-center rounded-lg text-paper-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
          aria-label="显示整张地图"
          title="显示整张地图"
        >
          <Maximize className="size-3.5 sm:size-4" />
        </button>
      </div>
    </div>
  );
}
