import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react';
import { coordKey, type Rotation, type TileCatalog } from './engine/index.ts';
import type { ClientView } from './lib/types.ts';
import { TileArt, anchorOnBoard } from './TileArt.tsx';
import { FigureGlyph } from './FigureGlyph.tsx';

export interface SquareTarget {
  key: string;
  x: number;
  y: number;
  label?: string;
  selected?: boolean;
  onClick: () => void;
}

export interface FeatureTarget {
  key: string;
  x: number;
  y: number;
  feature: number;
  label: string;
  selected?: boolean;
  onClick: () => void;
}

interface Props {
  view: ClientView;
  cat: TileCatalog;
  colors: string[];
  squares?: SquareTarget[];
  ghost?: { tileId: string; x: number; y: number; rotation: Rotation; legal?: boolean } | null;
  features?: FeatureTarget[];
  focus?: { x: number; y: number } | null;
}

interface Viewport {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.08;
const MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

const sx = (x: number) => x * 100;
const sy = (y: number) => -y * 100;

export function BoardCanvas({ view, cat, colors, squares = [], ghost = null, features = [], focus = null }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [vp, setVp] = useState<Viewport | null>(null);
  const vpRef = useRef<Viewport | null>(null);
  vpRef.current = vp;
  const interactedRef = useRef(false);
  const drag = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    start: Viewport;
    origin: { x: number; y: number };
    dist0: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<number | null>(null);

  const tiles = useMemo(() => Object.values(view.board.tiles), [view.board.tiles]);

  const fit = useCallback(() => {
    if (!tiles.length || size.w <= 0 || size.h <= 0) return;
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    const minX = Math.min(...xs) - 1;
    const maxX = Math.max(...xs) + 2;
    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 2;
    const w = (maxX - minX) * 100;
    const h = (maxY - minY) * 100;
    const k = clampK(Math.min(size.w / w, size.h / h, 1.1));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2 - 1;
    interactedRef.current = false;
    setVp({ k, x: size.w / 2 - sx(cx) * k, y: size.h / 2 - sy(cy) * k });
  }, [tiles, size]);

  const centerOn = useCallback(
    (x: number, y: number) => {
      if (size.w <= 0 || size.h <= 0) return;
      interactedRef.current = true;
      setVp((v) => {
        const k = v?.k ?? 0.8;
        return { k, x: size.w / 2 - (sx(x) + 50) * k, y: size.h / 2 - (sy(y) + 50) * k };
      });
    },
    [size],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!interactedRef.current && tiles.length && size.w > 0 && size.h > 0) fit();
  }, [fit, tiles.length, size.w, size.h]);

  const focusKey = focus ? coordKey(focus.x, focus.y) : null;
  useEffect(() => {
    const v = vpRef.current;
    if (!focus || !v) return;
    const left = (sx(focus.x) * v.k + v.x) | 0;
    const top = (sy(focus.y) * v.k + v.y) | 0;
    const margin = 40;
    if (left < margin || top < margin || left + 100 * v.k > size.w - margin || top + 100 * v.k > size.h - margin) {
      centerOn(focus.x, focus.y);
    }
  }, [focusKey]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    interactedRef.current = true;
    setVp((v) => {
      if (!v) return v;
      const k = clampK(v.k * factor);
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-delta * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = vpRef.current;
    if (!v) return;
    const d = (drag.current ??= { pointers: new Map(), start: v, origin: local(e), dist0: 1, moved: false });
    d.pointers.set(e.pointerId, local(e));
    d.start = v;
    const pts = [...d.pointers.values()];
    if (pts.length === 2) {
      d.dist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      d.origin = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    } else {
      d.origin = local(e);
    }
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
      d.pointers.set(e.pointerId, local(e));
      const pts = [...d.pointers.values()];
      if (pts.length === 1) {
        const dx = pts[0].x - d.origin.x;
        const dy = pts[0].y - d.origin.y;
        if (!d.moved && Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        interactedRef.current = true;
        setVp({ k: d.start.k, x: d.start.x + dx, y: d.start.y + dy });
      } else if (pts.length >= 2) {
        d.moved = true;
        interactedRef.current = true;
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const k = clampK((d.start.k * dist) / d.dist0);
        const f = k / d.start.k;
        setVp({ k, x: mid.x - (d.origin.x - d.start.x) * f, y: mid.y - (d.origin.y - d.start.y) * f });
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !d.pointers.has(e.pointerId)) return;
      d.pointers.delete(e.pointerId);
      if (d.pointers.size === 0) {
        if (d.moved) {
          suppressClick.current = true;
          if (suppressTimer.current !== null) window.clearTimeout(suppressTimer.current);
          suppressTimer.current = window.setTimeout(() => {
            suppressTimer.current = null;
            suppressClick.current = false;
          }, 0);
        }
        drag.current = null;
      } else {
        const rest = [...d.pointers.values()][0];
        d.origin = rest;
        d.start = vpRef.current ?? d.start;
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (suppressTimer.current !== null) window.clearTimeout(suppressTimer.current);
    };
  }, []);

  const figureNodes: ReactNode[] = [];
  const perFeature = new Map<string, number>();
  for (const f of view.figures) {
    const p = view.board.tiles[coordKey(f.x, f.y)];
    const def = p && cat.tiles[p.tileId];
    if (!def) continue;
    const k = `${f.x},${f.y}#${f.feature}`;
    const n = perFeature.get(k) ?? 0;
    perFeature.set(k, n + 1);
    const a = anchorOnBoard(def, p.rotation, f.feature);
    const kind = def.features[f.feature]?.kind;
    figureNodes.push(
      <FigureGlyph
        key={`f${f.id}`}
        kind={f.kind}
        color={colors[f.owner] ?? '#999'}
        x={sx(f.x) + a.x + n * 9}
        y={sy(f.y) + a.y - n * 4}
        lying={kind === 'FIELD' && (f.kind === 'MEEPLE' || f.kind === 'LARGE')}
      />,
    );
  }
  for (const m of ['MAGE', 'WITCH'] as const) {
    const ref = view.magic[m];
    if (!ref) continue;
    const p = view.board.tiles[coordKey(ref.x, ref.y)];
    const def = p && cat.tiles[p.tileId];
    if (!def) continue;
    const a = anchorOnBoard(def, p.rotation, ref.feature);
    figureNodes.push(<FigureGlyph key={m} kind={m} color="" x={sx(ref.x) + a.x - 14} y={sy(ref.y) + a.y + 2} />);
  }

  const part = view.turn.part;
  const lastPlaced = part.placed ? { x: part.x, y: part.y } : null;

  return (
    <div className="fc-board" data-coach="board" ref={wrapRef} onPointerDown={onPointerDown}>
      <svg
        width="100%"
        height="100%"
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {vp && (
          <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.k})`}>
            {tiles.map((t) => {
              const def = cat.tiles[t.tileId];
              if (!def) return null;
              return (
                <g key={coordKey(t.x, t.y)} transform={`translate(${sx(t.x)} ${sy(t.y)})`} className="board-tile">
                  <TileArt def={def} rotation={t.rotation} />
                </g>
              );
            })}
            {view.board.ferries.map((fr) => {
              const p = view.board.tiles[coordKey(fr.x, fr.y)];
              const def = p && cat.tiles[p.tileId];
              if (!def) return null;
              const a = anchorOnBoard(def, p.rotation, fr.a);
              const b = anchorOnBoard(def, p.rotation, fr.b);
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={`fe${fr.x},${fr.y}`} transform={`translate(${sx(fr.x)} ${sy(fr.y)})`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7a4a1f" strokeWidth={3} strokeDasharray="5 3" />
                  <rect x={mx - 7} y={my - 4} width={14} height={8} rx={3} fill="#a0612b" stroke="#4d2c0e" />
                </g>
              );
            })}
            {Object.entries(view.gold).map(([k, n]) => {
              if (!n) return null;
              const [x, y] = k.split(',').map(Number);
              return (
                <g key={`g${k}`} transform={`translate(${sx(x) + 74} ${sy(y) + 80})`}>
                  {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                    <path key={i} d={`M${i * 4},${-i * 3} l4,-4 h8 l4,4 Z`} fill="#f2c230" stroke="#8a6d10" strokeWidth={1} />
                  ))}
                  {n > 1 && (
                    <text x={22} y={2} fontSize={11} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={0.6}>
                      {n}
                    </text>
                  )}
                </g>
              );
            })}
            {lastPlaced && (
              <rect
                x={sx(lastPlaced.x) + 1}
                y={sy(lastPlaced.y) + 1}
                width={98}
                height={98}
                rx={4}
                fill="none"
                stroke="#ecc878"
                strokeWidth={3}
                pointerEvents="none"
              />
            )}
            {figureNodes}
            <g data-coach="board-spots">
              {squares.map((s) => (
                <g
                  key={s.key}
                  className="target"
                  role="button"
                  tabIndex={0}
                  aria-label={s.label ? `银锭 (${s.x}, ${s.y})` : `放在 (${s.x}, ${s.y})`}
                  aria-pressed={s.selected ?? false}
                  data-square={`${s.x},${s.y}`}
                  onClick={s.onClick}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      s.onClick();
                    }
                  }}
                >
                  <rect
                    x={sx(s.x) + 2}
                    y={sy(s.y) + 2}
                    width={96}
                    height={96}
                    rx={5}
                    className={s.selected ? 'square-target selected' : 'square-target'}
                  />
                  {s.label && (
                    <text x={sx(s.x) + 50} y={sy(s.y) + 56} textAnchor="middle" className="square-label">
                      {s.label}
                    </text>
                  )}
                </g>
              ))}
            </g>
            {ghost && cat.tiles[ghost.tileId] && (
              <g transform={`translate(${sx(ghost.x)} ${sy(ghost.y)})`} opacity={0.92} pointerEvents="none">
                <TileArt def={cat.tiles[ghost.tileId]} rotation={ghost.rotation} />
                <rect
                  x={1}
                  y={1}
                  width={98}
                  height={98}
                  rx={4}
                  fill="none"
                  stroke={ghost.legal !== false ? '#ecc878' : '#f87171'}
                  strokeWidth={3}
                  strokeDasharray={ghost.legal !== false ? undefined : '6 4'}
                />
              </g>
            )}
            {features.map((f) => {
              const p = view.board.tiles[coordKey(f.x, f.y)];
              const def = p && cat.tiles[p.tileId];
              if (!def) return null;
              const a = anchorOnBoard(def, p.rotation, f.feature);
              return (
                <g
                  key={f.key}
                  className="target"
                  role="button"
                  tabIndex={0}
                  aria-label={f.label}
                  aria-pressed={f.selected ?? false}
                  data-spot={f.key}
                  onClick={f.onClick}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      f.onClick();
                    }
                  }}
                >
                  <circle
                    cx={sx(f.x) + a.x}
                    cy={sy(f.y) + a.y}
                    r={10}
                    className={f.selected ? 'feature-target selected' : 'feature-target'}
                  />
                  <title>{f.label}</title>
                </g>
              );
            })}
          </g>
        )}
      </svg>
      <div className="fc-board-controls">
        <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.25)} title="放大" aria-label="放大">
          <Plus className="size-4" />
        </button>
        <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.8)} title="缩小" aria-label="缩小">
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={fit} title="显示全部" aria-label="显示全部">
          <Maximize2 className="size-4" />
        </button>
        {lastPlaced && (
          <button
            type="button"
            onClick={() => centerOn(lastPlaced.x, lastPlaced.y)}
            title="定位到当前板块"
            aria-label="定位到当前板块"
          >
            <Crosshair className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
