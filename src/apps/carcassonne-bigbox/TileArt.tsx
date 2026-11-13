import { memo } from 'react';
import type { Rotation, TileDef } from './engine/index.ts';
import { rotatePoint, tileShape } from './lib/tileGeometry.ts';

const GOOD_COLORS = { WINE: '#9b1c55', WHEAT: '#d49419', CLOTH: '#2563eb' } as const;
const GOOD_LETTER = { WINE: '酒', WHEAT: '麦', CLOTH: '布' } as const;
const FLIGHT_ANGLE: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

function Shield({ x, y }: { x: number; y: number }) {
  return (
    <g className="shield" transform={`translate(${x} ${y})`}>
      <path d="M-5,-5 h10 v5 q0,6 -5,8 q-5,-2 -5,-8 Z" fill="rgba(0,0,0,0.3)" transform="translate(1, 1)" />
      <path d="M-5,-6 h10 v5 q0,6 -5,8 q-5,-2 -5,-8 Z" fill="#1d4ed8" stroke="#f8fafc" strokeWidth={1.2} />
      <path d="M-5,-2 L0,2 L5,-2" fill="none" stroke="#fbbf24" strokeWidth={1.2} />
      <circle cx={0} cy={-2} r={1.2} fill="#fbbf24" />
    </g>
  );
}

export const TileArt = memo(function TileArt({ def, rotation }: { def: TileDef; rotation: Rotation }) {
  const shape = tileShape(def);
  const upright = (x: number, y: number) => `rotate(${-rotation} ${x} ${y})`;

  return (
    <g transform={rotation ? `rotate(${rotation} 50 50)` : undefined} className="carc-tile select-none">
      <rect width={100} height={100} rx={3} fill="#466624" stroke="#233512" strokeWidth={1} />
      <rect x={1} y={1} width={98} height={98} rx={2.5} fill="#5e8732" />

      <circle cx={20} cy={22} r={7} fill="#6c9a3b" opacity={0.65} />
      <circle cx={78} cy={30} r={9} fill="#567e2b" opacity={0.6} />
      <circle cx={32} cy={76} r={8} fill="#699539" opacity={0.65} />
      <circle cx={80} cy={78} r={10} fill="#557b2b" opacity={0.55} />
      <circle cx={50} cy={50} r={12} fill="#638f35" opacity={0.4} />

      {shape.rivers.map((r) => (
        <g key={`r${r.feature}`}>
          <path d={r.path} stroke="#173e6d" strokeWidth={16} fill="none" strokeLinecap="round" />
          <path d={r.path} stroke="#2b6cb0" strokeWidth={12} fill="none" strokeLinecap="round" />
          <path d={r.path} stroke="#60a5fa" strokeWidth={6} fill="none" strokeLinecap="round" />
          <path d={r.path} stroke="#bfdbfe" strokeWidth={2} fill="none" strokeDasharray="6 8" strokeLinecap="round" />
        </g>
      ))}

      {shape.roads.map((r) => (
        <g key={`d${r.feature}`}>
          <path d={r.path} stroke="#453321" strokeWidth={10} fill="none" />
          <path d={r.path} stroke="#8c7353" strokeWidth={8} fill="none" />
          <path d={r.path} stroke="#ebdcc4" strokeWidth={5.5} fill="none" />
          <path d={r.path} stroke="#baa07d" strokeWidth={1.2} strokeDasharray="3 4" fill="none" />
        </g>
      ))}

      {shape.cities.map((c) => (
        <g key={`c${c.feature}`}>
          <path d={c.path} fill="none" stroke="#362211" strokeWidth={4.5} strokeLinejoin="round" />
          <path d={c.path} fill="#c89657" stroke="#68421f" strokeWidth={2.4} strokeLinejoin="round" />
          <path d={c.path} fill="none" stroke="#a47239" strokeWidth={1.2} />
        </g>
      ))}

      {shape.hub === 'MONASTERY' && (
        <g className="monastery">
          <rect x={36} y={43} width={28} height={22} fill="rgba(0,0,0,0.3)" rx={2} />
          <rect x={37} y={42} width={26} height={22} fill="#f1e5d1" stroke="#5a3d21" strokeWidth={1.5} rx={1} />
          <path d="M34,43 L50,29 L66,43 Z" fill="#c2410c" stroke="#7c2d12" strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M42,36 L50,29 L58,36" fill="none" stroke="#ea580c" strokeWidth={1} />
          <path d="M47,64 V54 A3,3 0 0,1 53,54 V64 Z" fill="#451a03" stroke="#292524" strokeWidth={0.8} />
          <path d="M50,25 V29 M48,27 H52" stroke="#fbbf24" strokeWidth={1.4} strokeLinecap="round" />
        </g>
      )}

      {shape.hub === 'VILLAGE' && (
        <g className="village">
          <rect x={43} y={46} width={14} height={11} fill="#ebdcc4" stroke="#5c3f22" strokeWidth={1.2} rx={1} />
          <path d="M41,47 L50,38 L59,47 Z" fill="#b91c1c" stroke="#7f1d1d" strokeWidth={1.2} />
          <rect x={48} y={51} width={4} height={6} fill="#451a03" />
        </g>
      )}

      {shape.hub === 'LAKE' && (
        <g>
          <ellipse cx={50} cy={50} rx={def.ferryLake ? 25 : 21} ry={def.ferryLake ? 21 : 17} fill="#1d4ed8" opacity={0.35} />
          <ellipse cx={50} cy={50} rx={def.ferryLake ? 23 : 19} ry={def.ferryLake ? 19 : 15} fill="#3b82f6" stroke="#1e40af" strokeWidth={2} />
          <ellipse cx={48} cy={48} rx={def.ferryLake ? 16 : 13} ry={def.ferryLake ? 12 : 9} fill="#93c5fd" opacity={0.5} />
        </g>
      )}
      {shape.hub === 'SPRING' && (
        <g>
          <circle cx={50} cy={50} r={10} fill="#2563eb" stroke="#1e40af" strokeWidth={2} />
          <circle cx={50} cy={50} r={5} fill="#bfdbfe" />
        </g>
      )}

      {def.features.map((f) => {
        const a = shape.anchors[f.index];
        return (
          <g key={`s${f.index}`}>
            {f.kind === 'GARDEN' && (
              <g>
                <circle cx={a.x} cy={a.y} r={10} fill="#2d6a1e" stroke="#1b4312" strokeWidth={1.5} />
                <circle cx={a.x} cy={a.y} r={7.5} fill="#3f8a32" />
                <circle cx={a.x - 3} cy={a.y - 2.5} r={2.5} fill="#f43f5e" />
                <circle cx={a.x + 3.5} cy={a.y - 1} r={2.5} fill="#fb7185" />
                <circle cx={a.x} cy={a.y + 3.5} r={2.5} fill="#fde047" />
              </g>
            )}

            {f.pennants > 0 &&
              Array.from({ length: f.pennants }, (_, i) => <Shield key={i} x={a.x + 10 + i * 12} y={a.y - 8} />)}

            {f.cathedral && (
              <g transform={upright(a.x - 14, a.y + 4)}>
                <rect x={a.x - 21} y={a.y - 1} width={14} height={12} fill="#e2e8f0" stroke="#334155" strokeWidth={1.2} />
                <path d={`M${a.x - 22},${a.y - 1} L${a.x - 14},${a.y - 12} L${a.x - 6},${a.y - 1} Z`} fill="#6366f1" stroke="#3730a3" strokeWidth={1.2} />
                <circle cx={a.x - 14} cy={a.y - 4} r={2.2} fill="#fde047" stroke="#334155" strokeWidth={0.8} />
              </g>
            )}

            {f.inn && (
              <g>
                <rect x={a.x + 5} y={a.y - 15} width={12} height={10} fill="#fef3c7" stroke="#78350f" strokeWidth={1.2} rx={1} />
                <path d={`M${a.x + 3},${a.y - 14} L${a.x + 11},${a.y - 22} L${a.x + 19},${a.y - 14} Z`} fill="#dc2626" stroke="#991b1b" strokeWidth={1.2} />
                <rect x={a.x + 9} y={a.y - 10} width={4} height={5} fill="#451a03" />
                <circle cx={a.x + 20} cy={a.y - 7} r={2.8} fill="#38bdf8" stroke="#0284c7" strokeWidth={0.8} />
              </g>
            )}

            {f.goods && (
              <g transform={upright(a.x - 12, a.y + 10)}>
                <circle cx={a.x - 12} cy={a.y + 10} r={7.5} fill={GOOD_COLORS[f.goods]} stroke="#fff" strokeWidth={1.3} />
                <text x={a.x - 12} y={a.y + 13.5} fontSize={7.5} fontWeight="bold" textAnchor="middle" fill="#fff">
                  {GOOD_LETTER[f.goods]}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {def.cropCircle && (
        <g>
          <circle cx={50} cy={50} r={14} fill="none" stroke="#eab308" strokeWidth={3} opacity={0.85} />
          <circle cx={50} cy={50} r={6.5} fill="#eab308" />
          <text x={50} y={53.5} fontSize={8.5} fontWeight="bold" textAnchor="middle" fill="#713f12" transform={upright(50, 50)}>
            {def.cropCircle === 'RAKE' ? '耙' : def.cropCircle === 'CLUB' ? '棍' : '盾'}
          </text>
        </g>
      )}

      {def.flight && (
        <g transform={`rotate(${FLIGHT_ANGLE[def.flight]} 50 50)`}>
          <path d="M50,22 L58,36 L53,35 L53,47 L47,47 L47,35 L42,36 Z" fill="#ffffff" stroke="#0f172a" strokeWidth={1.4} strokeLinejoin="round" />
        </g>
      )}

      {def.goldmine && (
        <g>
          <path d="M9,86 L16,79 L23,86 L16,93 Z" fill="#facc15" stroke="#854d0e" strokeWidth={1.4} />
          <circle cx={16} cy={86} r={2.2} fill="#fef08a" />
        </g>
      )}

      {def.magic && (
        <g>
          <path d="M86,7 L88,14 L95,14 L89,19 L91,26 L86,21 L81,26 L83,19 L77,14 L84,14 Z" fill="#a855f7" stroke="#ffffff" strokeWidth={1} />
        </g>
      )}

      {def.robber && (
        <g>
          <circle cx={14} cy={14} r={7} fill="#18181b" stroke="#71717a" strokeWidth={1} />
          <rect x={8} y={12} width={12} height={3.5} fill="#e4e4e7" rx={1} />
        </g>
      )}
    </g>
  );
});

export function anchorOnBoard(def: TileDef, rotation: Rotation, feature: number): { x: number; y: number } {
  return rotatePoint(tileShape(def).anchors[feature] ?? { x: 50, y: 50 }, rotation);
}
