import React, { useMemo, useRef } from 'react';
import type { Coord, LevelDef, LightSimulation, PuzzleAction, PuzzleState } from './types.ts';
import { LIGHT_CYAN, LIGHT_GOLD, LIGHT_ROSE } from './types.ts';

interface MoonBoardProps {
  level: LevelDef;
  state: PuzzleState;
  simulation: LightSimulation;
  selectedPieceId: string | null;
  legalTargets: Coord[];
  pendingAction: PuzzleAction | null;
  preview: boolean;
  onCellPress: (r: number, c: number, pointerType: string) => void;
  onCellHover: (r: number, c: number) => void;
  onHoverEnd: () => void;
}

const CELL = 100;
const center = (coord: Coord) => ({ x: coord.c * CELL + 50, y: coord.r * CELL + 50 });
const cellKey = (r: number, c: number) => `${r},${c}`;

function colorForMask(mask: number): string {
  if (mask === (LIGHT_GOLD | LIGHT_CYAN | LIGHT_ROSE)) return '#fff6d8';
  if (mask === (LIGHT_GOLD | LIGHT_CYAN)) return '#baf3cf';
  if (mask === LIGHT_CYAN) return '#8debf2';
  if (mask === LIGHT_ROSE) return '#ffadbd';
  return '#ffdc8f';
}

function directionLabel(dir: number): string {
  return ['向上', '向右', '向下', '向左'][dir] ?? '';
}

export function MoonBoard({
  level,
  state,
  simulation,
  selectedPieceId,
  legalTargets,
  pendingAction,
  preview,
  onCellPress,
  onCellHover,
  onHoverEnd,
}: MoonBoardProps) {
  const pointerTypeRef = useRef('mouse');
  const litFlowerIds = useMemo(
    () => new Set(simulation.flowers.filter((flower) => flower.lit).map((flower) => flower.id)),
    [simulation],
  );
  const targetKeys = useMemo(
    () => new Set(legalTargets.map((target) => cellKey(target.r, target.c))),
    [legalTargets],
  );
  const pieceCells = useMemo(() => new Map(state.pieces.map((piece) => [cellKey(piece.r, piece.c), piece])), [state.pieces]);
  const width = level.cols * CELL;
  const height = level.rows * CELL;
  const stars = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        x: 17 + ((index * 173 + level.index * 41) % Math.max(1, width - 34)),
        y: 13 + ((index * 97 + level.index * 29) % Math.max(1, height - 26)),
        r: index % 4 === 0 ? 1.25 : 0.65,
      })),
    [height, level.index, width],
  );

  return (
    <div
      className={`mm-board ${preview ? 'is-preview' : ''}`}
      style={{ aspectRatio: `${level.cols} / ${level.rows}` }}
      data-testid="moon-board"
      onPointerLeave={onHoverEnd}
    >
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${level.name}光路棋盘`}>
        <defs>
          <linearGradient id="mm-water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#102f34" />
            <stop offset="0.5" stopColor="#0a2228" />
            <stop offset="1" stopColor="#07191f" />
          </linearGradient>
          <linearGradient id="mm-mirror-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6c9399" />
            <stop offset="0.28" stopColor="#f2fbf5" />
            <stop offset="0.48" stopColor="#9ac4c5" />
            <stop offset="0.75" stopColor="#f4e8bd" />
            <stop offset="1" stopColor="#53747d" />
          </linearGradient>
          <radialGradient id="mm-source-gold">
            <stop offset="0" stopColor="#fff9d9" />
            <stop offset="0.35" stopColor="#ffdc8f" />
            <stop offset="1" stopColor="#9c6b2e" />
          </radialGradient>
          <radialGradient id="mm-source-cyan">
            <stop offset="0" stopColor="#efffff" />
            <stop offset="0.35" stopColor="#8debf2" />
            <stop offset="1" stopColor="#227681" />
          </radialGradient>
          <radialGradient id="mm-source-rose">
            <stop offset="0" stopColor="#fff1f1" />
            <stop offset="0.35" stopColor="#ffadbd" />
            <stop offset="1" stopColor="#914355" />
          </radialGradient>
          <filter id="mm-beam-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="mm-flower-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="mm-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="8" height="8" fill="#1b3437" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#345054" strokeWidth="2" />
          </pattern>
        </defs>

        <rect x="2" y="2" width={width - 4} height={height - 4} rx="25" fill="url(#mm-water)" />
        <g aria-hidden="true">
          {stars.map((star, index) => (
            <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#b6dad5" opacity={index % 3 === 0 ? 0.28 : 0.13} />
          ))}
          {Array.from({ length: level.rows }, (_, r) =>
            Array.from({ length: level.cols }, (_, c) => (
              <g key={`${r}-${c}`}>
                <rect
                  x={c * CELL + 7}
                  y={r * CELL + 7}
                  width={CELL - 14}
                  height={CELL - 14}
                  rx="14"
                  fill={(r + c) % 2 ? '#d7f2e8' : '#b8e2dc'}
                  opacity={(r + c) % 2 ? 0.018 : 0.028}
                  stroke="#9fc9c3"
                  strokeOpacity="0.075"
                />
                {(r * 3 + c + level.index) % 5 === 0 && (
                  <path
                    d={`M ${c * CELL + 21} ${r * CELL + 79} Q ${c * CELL + 50} ${r * CELL + 69} ${c * CELL + 79} ${r * CELL + 79}`}
                    fill="none"
                    stroke="#77a9a7"
                    strokeOpacity="0.13"
                    strokeWidth="1.2"
                  />
                )}
              </g>
            )),
          )}
        </g>

        <g className="mm-beams" aria-hidden="true">
          {simulation.paths.map((path) => {
            const points = path.points.map((point) => {
              const p = center(point);
              return `${p.x},${p.y}`;
            }).join(' ');
            const color = colorForMask(path.color);
            return (
              <g key={path.id}>
                <polyline points={points} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.16" filter="url(#mm-beam-glow)" />
                <polyline points={points} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" filter="url(#mm-beam-glow)" />
                <polyline points={points} fill="none" stroke="#fffdf1" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
              </g>
            );
          })}
        </g>

        <g aria-hidden="true">
          {level.walls.map((wall) => {
            const p = center(wall);
            return wall.variant === 'bamboo' ? (
              <g key={`${wall.r}-${wall.c}`} transform={`translate(${p.x} ${p.y})`} opacity="0.8">
                <path d="M-22 28L-13-28M0 28L8-28M21 28L27-20" stroke="#527b68" strokeWidth="6" strokeLinecap="round" />
                <path d="M-18 0L-29-10M4-8L18-19M17 9L31 0" stroke="#79a080" strokeWidth="3" strokeLinecap="round" />
                <path d="M-17 10L-8 10M3 7L12 7M20-3L28-3" stroke="#263f38" strokeWidth="2" />
              </g>
            ) : (
              <g key={`${wall.r}-${wall.c}`} transform={`translate(${p.x} ${p.y})`}>
                <rect x="-31" y="-29" width="62" height="58" rx="13" fill="url(#mm-hatch)" stroke="#526b6c" strokeWidth="1.4" />
                <path d="M-20-8L-4-17L17-11M-14 13L4 5L20 12" fill="none" stroke="#72908d" strokeOpacity="0.35" strokeWidth="1.4" />
              </g>
            );
          })}

          {level.portals.map((portal, index) => {
            const p = center(portal);
            return (
              <g key={portal.id} transform={`translate(${p.x} ${p.y})`}>
                <circle r="32" fill="#07191e" stroke="#7ea5a4" strokeOpacity="0.4" />
                <g className="mm-portal-ring">
                  <circle r="24" fill="none" stroke={index % 2 ? '#c3a8ef' : '#8edbd7'} strokeWidth="2" strokeDasharray="5 6" />
                  <circle r="16" fill="none" stroke={index % 2 ? '#8edbd7' : '#c3a8ef'} strokeWidth="1.2" strokeDasharray="2 5" />
                </g>
                <circle r="6" fill="#d9e8df" opacity="0.7" />
              </g>
            );
          })}

          {level.emitters.map((emitter) => {
            const p = center(emitter);
            const source = emitter.color === LIGHT_CYAN ? 'cyan' : emitter.color === LIGHT_ROSE ? 'rose' : 'gold';
            return (
              <g key={emitter.id} transform={`translate(${p.x} ${p.y}) rotate(${emitter.dir * 90 - 90})`}>
                <circle r="29" fill="#0a1d22" stroke={colorForMask(emitter.color)} strokeOpacity="0.45" strokeWidth="1.5" />
                <circle r="19" fill={`url(#mm-source-${source})`} filter="url(#mm-beam-glow)" />
                <path d="M18-6L29 0L18 6" fill="none" stroke="#fffbe8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <circle r="7" fill="#fffdf0" opacity="0.8" />
              </g>
            );
          })}

          {level.flowers.map((flower) => {
            const p = center(flower);
            const lit = litFlowerIds.has(flower.id);
            const color = colorForMask(flower.color);
            return (
              <g key={flower.id} transform={`translate(${p.x} ${p.y})`} className={lit ? 'mm-flower is-lit' : 'mm-flower'}>
                <circle r="35" fill={color} opacity={lit ? 0.12 : 0.025} />
                {Array.from({ length: 6 }, (_, index) => (
                  <ellipse key={index} cx="0" cy="-17" rx="9" ry="18" transform={`rotate(${index * 60})`} fill={lit ? color : '#284348'} stroke={lit ? '#fff9df' : '#607b7c'} strokeOpacity={lit ? 0.7 : 0.45} strokeWidth="1.2" filter={lit ? 'url(#mm-flower-glow)' : undefined} />
                ))}
                <circle r="10" fill={lit ? '#fff7cf' : '#152d33'} stroke={color} strokeOpacity={lit ? 0.95 : 0.4} strokeWidth="2" />
                <circle r="3.5" fill={lit ? color : '#77908c'} />
              </g>
            );
          })}

          {state.pieces.map((piece) => {
            const p = center(piece);
            const selected = selectedPieceId === piece.id;
            if (piece.kind === 'splitter') {
              return (
                <g key={piece.id} transform={`translate(${p.x} ${p.y})`}>
                  <circle r="35" fill="#4ac2ca" opacity="0.07" />
                  <path d="M0-30L30 24L-30 24Z" fill="#87e3df" fillOpacity="0.16" stroke="#b4f2e9" strokeWidth="2" />
                  <path d="M0-20L0 16M-20 17L20 17" stroke="#e5fff5" strokeOpacity="0.5" strokeWidth="1.2" />
                  <circle r="5" fill="#d8fff4" opacity="0.8" />
                </g>
              );
            }
            return (
              <g key={piece.id} transform={`translate(${p.x} ${p.y})`} className="mm-mirror">
                {piece.movable && <circle r="34" fill="#89b8b4" fillOpacity="0.04" stroke="#759d9b" strokeOpacity="0.34" strokeWidth="1.2" strokeDasharray="2 6" />}
                {selected && <circle r="39" fill="none" stroke="#f5d894" strokeWidth="2" strokeDasharray="4 4" className="mm-selected-ring" />}
                <circle r="23" fill="#0a1b20" stroke="#54777b" strokeWidth="1.4" />
                {piece.orientation === 0 ? (
                  <path d="M-23 23L23-23" stroke="#233e44" strokeWidth="12" strokeLinecap="round" />
                ) : (
                  <path d="M-23-23L23 23" stroke="#233e44" strokeWidth="12" strokeLinecap="round" />
                )}
                {piece.orientation === 0 ? (
                  <path d="M-23 23L23-23" stroke="url(#mm-mirror-metal)" strokeWidth="7" strokeLinecap="round" />
                ) : (
                  <path d="M-23-23L23 23" stroke="url(#mm-mirror-metal)" strokeWidth="7" strokeLinecap="round" />
                )}
                <circle r="4.5" fill="#f4e9c8" stroke="#56767b" strokeWidth="1.2" />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mm-cell-grid" style={{ gridTemplateColumns: `repeat(${level.cols}, 1fr)` }}>
        {Array.from({ length: level.rows * level.cols }, (_, index) => {
          const r = Math.floor(index / level.cols);
          const c = index % level.cols;
          const piece = pieceCells.get(cellKey(r, c));
          const isTarget = targetKeys.has(cellKey(r, c));
          const interactive = (piece?.kind === 'mirror' && (piece.rotatable || piece.movable)) || isTarget;
          const emitter = level.emitters.find((item) => item.r === r && item.c === c);
          const flower = level.flowers.find((item) => item.r === r && item.c === c);
          const label = piece?.kind === 'mirror'
            ? `银镜，${piece.orientation === 0 ? '左斜' : '右斜'}${piece.movable ? '，可移动' : '，位置固定'}`
            : isTarget
              ? `移动到第 ${r + 1} 行第 ${c + 1} 列`
              : emitter
                ? `光源，${directionLabel(emitter.dir)}`
                : flower
                  ? `花铃，${litFlowerIds.has(flower.id) ? '已点亮' : '未点亮'}`
                  : `第 ${r + 1} 行第 ${c + 1} 列`;
          const pendingHere = pendingAction && pendingAction.kind === 'move' && pendingAction.to?.r === r && pendingAction.to.c === c;
          return (
            <button
              key={index}
              type="button"
              className={`mm-cell-hit ${isTarget ? 'is-legal-target' : ''} ${pendingHere ? 'is-pending-target' : ''}`}
              disabled={!interactive}
              tabIndex={interactive ? 0 : -1}
              aria-label={label}
              aria-pressed={piece?.id === selectedPieceId}
              data-testid={`cell-${r}-${c}`}
              onPointerDown={(event) => { pointerTypeRef.current = event.pointerType; }}
              onMouseEnter={() => onCellHover(r, c)}
              onFocus={() => onCellHover(r, c)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  pointerTypeRef.current = 'keyboard';
                  return;
                }
                const deltas: Record<string, Coord> = {
                  ArrowUp: { r: -1, c: 0 },
                  ArrowRight: { r: 0, c: 1 },
                  ArrowDown: { r: 1, c: 0 },
                  ArrowLeft: { r: 0, c: -1 },
                };
                const delta = deltas[event.key];
                if (!delta) return;
                event.preventDefault();
                pointerTypeRef.current = 'keyboard';
                let nextR = r + delta.r;
                let nextC = c + delta.c;
                while (nextR >= 0 && nextR < level.rows && nextC >= 0 && nextC < level.cols) {
                  const target = document.querySelector<HTMLButtonElement>(`[data-testid="cell-${nextR}-${nextC}"]`);
                  if (target && !target.disabled) {
                    target.focus();
                    break;
                  }
                  nextR += delta.r;
                  nextC += delta.c;
                }
              }}
              onClick={() => onCellPress(r, c, pointerTypeRef.current)}
            />
          );
        })}
      </div>
    </div>
  );
}
