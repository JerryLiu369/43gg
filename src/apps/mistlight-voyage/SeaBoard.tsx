import React, { useId } from 'react';
import { coordinate, isRotatable } from './engine.ts';
import { LIGHT_NAMES, TILE_NAMES } from './content.ts';
import type { Level, Position, Trace } from './types.ts';

export const seaPoint = (x: number, y: number) => ({
  x: 80 + x * 80,
  y: 116 + y * 66,
});
const COLORS = { 1: '#f3c779', 2: '#7cddd2', 3: '#eee7c8' };
function Island({
  x,
  y,
  small = false,
}: {
  x: number;
  y: number;
  small?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y + 20}) scale(${small ? 0.76 : 1})`}>
      <ellipse cy="15" rx="44" ry="21" fill="#081d24" opacity=".55" />
      <ellipse
        cy="8"
        rx="46"
        ry="24"
        fill="none"
        stroke="#7bb4af"
        strokeWidth="1"
        opacity=".18"
      />
      <path d="M-35 1 -28 19 -4 28 24 21 36 3 18-12 -12-14Z" fill="#25454a" />
      <path d="M-35 1 -28 19 -4 28 -3 9Z" fill="#1a333b" />
      <path d="M-3 9 -4 28 24 21 36 3Z" fill="#315157" />
      <path d="M-35 1 -16-14 16-13 36 3 11 14 -15 11Z" fill="#52716c" />
      <path d="M-27 0 -14-10 13-9 27 2 9 9 -13 7Z" fill="#6e8271" />
      <path
        d="M-35 1 -16-14 16-13"
        fill="none"
        stroke="#9ba58b"
        strokeWidth="1.2"
        opacity=".7"
      />
    </g>
  );
}
function Rock({
  x,
  y,
  submerged = false,
}: {
  x: number;
  y: number;
  submerged?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y + 12})`} opacity={submerged ? 0.26 : 1}>
      <ellipse
        cy="16"
        rx="33"
        ry="15"
        fill="none"
        stroke="#76aaa4"
        opacity=".3"
      />
      <path d="M-27 9 -20-8 -6-13 3-5 13-9 28 8 15 20 -9 23Z" fill="#29484c" />
      <path d="M-27 9 -20-8 -6-13 -8 7Z" fill="#69817b" />
      <path d="M-8 7 -6-13 3-5 13-9 28 8 9 13Z" fill="#4d6863" />
      <path d="M-27 9 -8 7 9 13 28 8 15 20 -9 23Z" fill="#345359" />
      <path d="M-16 0 -12-4M13 2 18 6" stroke="#91a293" strokeWidth="1.4" />
    </g>
  );
}
function Lighthouse({
  x,
  y,
  color,
  lit,
}: {
  x: number;
  y: number;
  color: 1 | 2 | 3;
  lit: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {lit && (
        <ellipse
          cy="8"
          rx="44"
          ry="28"
          fill={COLORS[color]}
          opacity=".07"
          className="ml-beacon-aura"
        />
      )}
      <path d="M-14 24 -10-17 10-17 14 24Q0 32-14 24" fill="#cbd0b7" />
      <path d="M3-17 10-17 14 24Q8 29 3 29Z" fill="#8fa99f" />
      <path
        d="M-12 8Q0 14 12 8L13 16Q0 22-13 16Z"
        fill={color === 2 ? '#4c8f88' : '#aa7151'}
      />
      <path d="M-4 28V17Q0 12 4 17V28" fill="#284248" />
      <path d="M-15-18 0-25 15-18 15-4 0 3 -15-4Z" fill="#536e68" />
      <path
        d="M-11-16 0-20 11-16 11-7 0-2 -11-7Z"
        fill={lit ? COLORS[color] : '#1a373d'}
      />
      {color === 3 && (
        <path d="M0-20 11-16 11-7 0-2Z" fill={lit ? COLORS[2] : '#2d5254'} />
      )}
      <path d="M0-22V0M-13-17V-5M13-17V-5" stroke="#d3bd8c" strokeWidth="1.6" />
      <path d="M-18-20 0-34 18-20 0-13Z" fill="#b39d71" />
      <path d="M0-34 18-20 0-13Z" fill="#786a51" />
      <path d="M0-34V-42" stroke="#d1bc88" strokeWidth="2" />
      {lit && (
        <>
          <circle cy="-10" r="23" fill={COLORS[color]} opacity=".12" />
          <circle cy="-10" r="4" fill="#fff6d8" />
        </>
      )}
    </g>
  );
}
function Mirror({
  x,
  y,
  turn,
  split,
  tidal,
}: {
  x: number;
  y: number;
  turn: number;
  split: boolean;
  tidal: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-16 15V23Q0 32 16 23V15" fill="#7e785c" />
      <ellipse cy="15" rx="18" ry="10" fill="#b6a980" />
      <ellipse cy="14" rx="11" ry="6" fill="#617a71" />
      <path d="M-4 14V0H4V14" fill="#c8bc94" />
      {tidal && (
        <ellipse
          cy="16"
          rx="30"
          ry="18"
          fill="none"
          stroke="#79bfc0"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      )}
      <g
        className="ml-mirror-head"
        style={{ transform: `rotate(${turn ? 90 : 0}deg)` }}
      >
        <path
          d="M-22 15 17-20 23-14 -16 21Z"
          fill={split ? '#73b9ae' : '#abc7be'}
          stroke="#d4c59a"
          strokeWidth="2.6"
        />
        <path d="M-17 14 17-15" stroke="#eff3d9" strokeWidth="2" opacity=".9" />
        {split && (
          <path
            d="M-11 14 20-12M-18 8 12-19"
            stroke="#224b4b"
            strokeWidth="1.2"
          />
        )}
      </g>
      {split && (
        <>
          <circle cx="-22" cy="25" r="2.5" fill="#eedba8" />
          <circle cx="-15" cy="28" r="2.5" fill="#eedba8" />
        </>
      )}
    </g>
  );
}
export function SeaBoard({
  level,
  position,
  trace,
  preview,
  previewPosition,
  selected,
  onHover,
  onChoose,
  cinematic = false,
  celebrating = false,
}: {
  level: Level;
  position: Position;
  trace: Trace;
  preview?: Trace | null;
  previewPosition?: Position | null;
  selected?: string | null;
  onHover?: (id: string | null) => void;
  onChoose?: (id: string, pointer: string) => void;
  cinematic?: boolean;
  celebrating?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const shown = previewPosition ?? position;
  const light = preview ?? trace;
  return (
    <div
      className={`ml-board ${cinematic ? 'ml-board-cinematic' : ''} ${celebrating ? 'ml-board-celebrating' : ''}`}
    >
      <svg viewBox="0 0 640 600" className="ml-sea" aria-hidden="true">
        <defs>
          <radialGradient id={`${uid}-sea`}>
            <stop stopColor="#245c60" stopOpacity=".7" />
            <stop offset="1" stopColor="#102b34" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-beam`}>
            <stop stopColor="#f3c779" stopOpacity="0" />
            <stop offset=".8" stopColor="#f3c779" stopOpacity=".12" />
          </linearGradient>
          <pattern
            id={`${uid}-water`}
            width="53"
            height="47"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M3 30Q9 27 16 30M36 7h3"
              stroke="#85b5af"
              strokeWidth=".8"
              opacity=".13"
              fill="none"
            />
          </pattern>
        </defs>
        <ellipse
          cx="320"
          cy="306"
          rx="320"
          ry="290"
          fill={`url(#${uid}-sea)`}
        />
        <rect
          x="10"
          y="25"
          width="620"
          height="550"
          rx="80"
          fill={`url(#${uid}-water)`}
        />
        <g fill="none" stroke="#73938a" opacity=".15" strokeWidth="1">
          <path d="M3 161Q69 132 27 65T137 11M0 174Q90 133 43 64T157 10M2 189Q111 135 59 66T179 8" />
          <path d="M634 419Q558 465 613 532T496 592M640 404Q533 461 593 536T475 598M640 388Q511 459 575 541T451 603" />
          <path d="M31 499Q76 472 104 498T204 537M18 512Q76 483 104 510T208 551" />
        </g>
        {!cinematic && (
          <g
            fill="#9cbbad"
            fontSize="12"
            fontFamily="var(--font-mono)"
            opacity=".55"
            textAnchor="middle"
          >
            {Array.from({ length: 7 }, (_, i) => (
              <React.Fragment key={i}>
                <text x={80 + i * 80} y="57">
                  {String.fromCharCode(65 + i)}
                </text>
                <text x="27" y={120 + i * 66}>
                  {i + 1}
                </text>
              </React.Fragment>
            ))}
          </g>
        )}
        <g fill="#8bb0a8" opacity=".22">
          {Array.from({ length: 49 }, (_, i) => {
            const p = seaPoint(i % 7, Math.floor(i / 7));
            return <circle key={i} cx={p.x} cy={p.y} r="1.3" />;
          })}
        </g>
        {level.tiles.map((tile) => {
          const p = seaPoint(tile.x, tile.y);
          return tile.kind === 'rock' || tile.kind === 'gate' ? (
            <g key={tile.id}>
              <Rock
                {...p}
                submerged={tile.kind === 'gate' && shown.tide === 1}
              />
              {tile.kind === 'gate' && (
                <path
                  d={`M${p.x - 23} ${p.y + 34}q12-7 24 0t24 0`}
                  fill="none"
                  stroke="#77b8b3"
                  strokeWidth="2"
                  opacity=".6"
                />
              )}
            </g>
          ) : (
            <Island key={tile.id} {...p} small />
          );
        })}
        {level.beacons.map((beacon) => (
          <Island key={beacon.id} {...seaPoint(beacon.x, beacon.y)} />
        ))}
        {level.sources.map((source, i) => (
          <Island key={`source-${i}`} {...seaPoint(source.x, source.y)} />
        ))}
        <g opacity={preview ? 0.18 : 1}>
          {trace.segments.map((segment, i) => {
            const a = seaPoint(segment.from.x, segment.from.y);
            const b = seaPoint(segment.to.x, segment.to.y);
            return (
              <g
                key={i}
                stroke={COLORS[segment.color]}
                fill="none"
                strokeLinecap="round"
              >
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  strokeWidth="13"
                  opacity=".055"
                />
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  strokeWidth="5"
                  opacity=".18"
                />
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  strokeWidth="2"
                  opacity=".9"
                />
                <path
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  stroke="#fff9df"
                  strokeWidth=".6"
                  className="ml-light-flow"
                />
              </g>
            );
          })}
        </g>
        {preview && (
          <g fill="none" strokeWidth="2.5" strokeDasharray="5 5">
            {preview.segments.map((segment, i) => {
              const a = seaPoint(segment.from.x, segment.from.y);
              const b = seaPoint(segment.to.x, segment.to.y);
              return (
                <path
                  key={i}
                  d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                  stroke={COLORS[segment.color]}
                />
              );
            })}
          </g>
        )}
        {level.tiles
          .filter((tile) => tile.kind !== 'rock' && tile.kind !== 'gate')
          .map((tile) => (
            <Mirror
              key={tile.id}
              {...seaPoint(tile.x, tile.y)}
              turn={
                tile.kind === 'tidal'
                  ? tile.initial ^ shown.tide
                  : (shown.turns[tile.id] ?? tile.initial)
              }
              split={tile.kind === 'splitter'}
              tidal={tile.kind === 'tidal'}
            />
          ))}
        {level.beacons.map((beacon) => (
          <Lighthouse
            key={beacon.id}
            {...seaPoint(beacon.x, beacon.y)}
            color={beacon.color}
            lit={light.lit.includes(beacon.id)}
          />
        ))}
        {level.sources.map((source, i) => {
          const p = seaPoint(source.x, source.y);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <path d="M-18 20 -12-8 12-8 18 20 0 29Z" fill="#8c8a6e" />
              <path d="M0-8 12-8 18 20 0 29Z" fill="#636f61" />
              <ellipse cy="-8" rx="18" ry="10" fill="#c4b38a" />
              <ellipse cy="-7" rx="12" ry="7" fill={COLORS[source.color]} />
              <path
                d="M-15-15V-3M15-15V-3M0-22V1"
                stroke="#bbad82"
                strokeWidth="3"
              />
              <path d="M-20-17 0-29 20-17 0-10Z" fill="#8b9d85" />
              <path d="M0-29 20-17 0-10Z" fill="#637c70" />
              <circle r="7" fill={COLORS[source.color]} />
              <circle r="3" fill="#fff8dc" />
              <g transform={`rotate(${source.direction * 90})`}>
                <path
                  d="M21-4 29 0 21 4"
                  fill="none"
                  stroke={COLORS[source.color]}
                  strokeWidth="2"
                />
              </g>
            </g>
          );
        })}
        <g className="ml-sailboat" transform="translate(529 555)">
          <path d="M-18 0Q0 20 18 0Z" fill="#a7b4a0" />
          <path
            d="M0-37V0M-21 5h-13M-21 10h-22"
            stroke="#a7b4a0"
            strokeWidth="1.5"
          />
          <path d="M-3-34 -3-4 -20-4Z" fill="#e2d8b7" />
          <path d="M2-29 2-4 17-4Z" fill="#929f91" />
        </g>
        <g
          transform="translate(91 552)"
          stroke="#a9b6a0"
          fill="none"
          opacity=".45"
        >
          <circle r="18" strokeWidth=".6" />
          <path d="M0-26V26M-26 0H26" strokeWidth=".6" />
          <path d="M0-18 4 0 0 18 -4 0Z" fill="#a9b6a0" strokeWidth=".5" />
        </g>
      </svg>
      {!cinematic &&
        level.tiles.filter(isRotatable).map((tile) => {
          const p = seaPoint(tile.x, tile.y);
          return (
            <button
              key={tile.id}
              type="button"
              className={`ml-tower-hit ${selected === tile.id ? 'is-selected' : ''}`}
              style={{
                left: `${(p.x / 640) * 100}%`,
                top: `${(p.y / 600) * 100}%`,
              }}
              aria-label={`${coordinate(tile)} ${TILE_NAMES[tile.kind]}，${position.turns[tile.id] ? '反斜向' : '正斜向'}，旋转`}
              aria-pressed={selected === tile.id}
              data-tower={tile.id}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') onHover?.(tile.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') onHover?.(null);
              }}
              onFocus={() => onHover?.(tile.id)}
              onBlur={() => onHover?.(null)}
              onPointerDown={(event) => {
                event.currentTarget.dataset.pointer = event.pointerType;
              }}
              onClick={(event) =>
                onChoose?.(
                  tile.id,
                  event.detail === 0
                    ? 'keyboard'
                    : (event.currentTarget.dataset.pointer ?? 'mouse'),
                )
              }
            >
              <span className="ml-tower-label">{coordinate(tile)}</span>
            </button>
          );
        })}
      <span className="ml-sr-only">
        已接通 {light.lit.length} 座，共 {level.beacons.length} 座灯塔。
        {level.beacons
          .map(
            (beacon) =>
              `${coordinate(beacon)} ${LIGHT_NAMES[beacon.color]}灯塔${light.lit.includes(beacon.id) ? '已接通' : '未接通'}`,
          )
          .join('，')}
      </span>
    </div>
  );
}
