import { memo } from 'react';
import type { Rotation, TileDef } from './engine/index.ts';
import { rotatePoint, tileShape } from './lib/tileGeometry.ts';

const GOOD_COLORS = { WINE: '#8a2f3c', WHEAT: '#c08a2b', CLOTH: '#3f7f8a' } as const;
const GOOD_LETTER = { WINE: '酒', WHEAT: '粮', CLOTH: '丝' } as const;
const FLIGHT_ANGLE: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** A city's banner (counts as a pennant for scoring). */
function Shield({ x, y }: { x: number; y: number }) {
  return (
    <g className="shield" transform={`translate(${x} ${y})`}>
      <path d="M-4,-7 V8" stroke="#2f3a44" strokeWidth={1.4} strokeLinecap="round" />
      <path d="M-3.4,-7 L7,-4 L-3.4,-0.5 Z" fill="#b8432b" stroke="#6d2414" strokeWidth={0.9} strokeLinejoin="round" />
    </g>
  );
}

export const TileArt = memo(function TileArt({ def, rotation }: { def: TileDef; rotation: Rotation }) {
  const shape = tileShape(def);
  const upright = (x: number, y: number) => `rotate(${-rotation} ${x} ${y})`;

  return (
    <g transform={rotation ? `rotate(${rotation} 50 50)` : undefined} className="fc-tile select-none">
      <rect width={100} height={100} rx={3} fill="#7f9a6f" stroke="#4d6243" strokeWidth={1} />
      <rect x={1} y={1} width={98} height={98} rx={2.5} fill="#b3c69a" />
      <path d="M8,30 q10,-6 20,0 M62,18 q9,-5 18,0 M18,80 q8,-5 16,0 M66,74 q10,-6 20,0" stroke="#93ab7c" strokeWidth={1.2} fill="none" strokeLinecap="round" />

      {shape.rivers.map((r) => (
        <g key={`r${r.feature}`}>
          <path d={r.path} stroke="#2f5f73" strokeWidth={16} fill="none" strokeLinecap="round" />
          <path d={r.path} stroke="#5d9bb0" strokeWidth={12} fill="none" strokeLinecap="round" />
          <path d={r.path} stroke="#dceef2" strokeWidth={1.4} fill="none" strokeDasharray="3 9" strokeLinecap="round" />
        </g>
      ))}

      {shape.roads.map((r) => (
        <g key={`d${r.feature}`}>
          <path d={r.path} stroke="#6b5a42" strokeWidth={9} fill="none" />
          <path d={r.path} stroke="#eadcbd" strokeWidth={6.5} fill="none" />
        </g>
      ))}

      {shape.cities.map((c) => (
        <g key={`c${c.feature}`}>
          <path d={c.path} fill="none" stroke="#26303a" strokeWidth={5} strokeLinejoin="round" />
          <path d={c.path} fill="#ece6d8" stroke="#4a5866" strokeWidth={2.6} strokeLinejoin="round" />
          <path d={c.path} fill="none" stroke="#a7b1ba" strokeWidth={1} strokeDasharray="2 3" />
        </g>
      ))}

      {shape.hub === 'MONASTERY' && (
        <g className="monastery">
          <rect x={33} y={60} width={34} height={6} rx={1} fill="#cfc4ad" stroke="#5b5146" strokeWidth={1} />
          <rect x={38} y={46} width={24} height={14} fill="#efe6d2" stroke="#5b5146" strokeWidth={1.2} />
          <rect x={41} y={47} width={3} height={13} fill="#a8442f" />
          <rect x={56} y={47} width={3} height={13} fill="#a8442f" />
          <rect x={47.5} y={51} width={5} height={9} fill="#3a2e26" />
          <path d="M28,45 Q38,43 41,36 H59 Q62,43 72,45 Q60,47 50,46 Q40,47 28,45 Z" fill="#3e4a55" stroke="#1f272e" strokeWidth={1} strokeLinejoin="round" />
          <path d="M44,36 Q50,30 56,36 Z" fill="#3e4a55" stroke="#1f272e" strokeWidth={1} />
        </g>
      )}

      {shape.hub === 'VILLAGE' && (
        <g className="village">
          <rect x={43} y={47} width={14} height={10} fill="#efe6d2" stroke="#5b5146" strokeWidth={1.1} />
          <path d="M39,48 Q47,46 50,40 Q53,46 61,48 Z" fill="#3e4a55" stroke="#1f272e" strokeWidth={1} strokeLinejoin="round" />
          <rect x={48} y={51} width={4} height={6} fill="#3a2e26" />
        </g>
      )}

      {shape.hub === 'LAKE' && (
        <g>
          <ellipse cx={50} cy={50} rx={def.ferryLake ? 25 : 21} ry={def.ferryLake ? 21 : 17} fill="#2f5f73" opacity={0.35} />
          <ellipse cx={50} cy={50} rx={def.ferryLake ? 23 : 19} ry={def.ferryLake ? 19 : 15} fill="#5d9bb0" stroke="#2f5f73" strokeWidth={2} />
          <ellipse cx={48} cy={48} rx={def.ferryLake ? 16 : 13} ry={def.ferryLake ? 12 : 9} fill="#dceef2" opacity={0.45} />
        </g>
      )}
      {shape.hub === 'SPRING' && (
        <g>
          <circle cx={50} cy={50} r={10} fill="#5d9bb0" stroke="#2f5f73" strokeWidth={2} />
          <circle cx={50} cy={50} r={4.5} fill="#dceef2" />
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
                <rect x={a.x - 19} y={a.y - 8} width={10} height={18} fill="#efe6d2" stroke="#4a5866" strokeWidth={1.1} />
                <path d={`M${a.x - 22},${a.y - 8} Q${a.x - 14},${a.y - 10} ${a.x - 14},${a.y - 16} Q${a.x - 14},${a.y - 10} ${a.x - 6},${a.y - 8} Z`} fill="#3e4a55" stroke="#1f272e" strokeWidth={0.9} />
                <circle cx={a.x - 14} cy={a.y - 1} r={2.6} fill="#c9a24a" stroke="#6b5420" strokeWidth={0.8} />
              </g>
            )}

            {f.inn && (
              <g>
                <rect x={a.x + 7} y={a.y - 13} width={2} height={9} fill="#a8442f" />
                <rect x={a.x + 15} y={a.y - 13} width={2} height={9} fill="#a8442f" />
                <path d={`M${a.x + 3},${a.y - 13} Q${a.x + 12},${a.y - 15} ${a.x + 12},${a.y - 21} Q${a.x + 12},${a.y - 15} ${a.x + 21},${a.y - 13} Z`} fill="#3e4a55" stroke="#1f272e" strokeWidth={0.9} />
                <circle cx={a.x + 22} cy={a.y - 6} r={2.6} fill="#5d9bb0" stroke="#2f5f73" strokeWidth={0.8} />
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
          <rect x={41} y={41} width={18} height={18} rx={3} fill="#b8432b" stroke="#fff4e0" strokeWidth={1.4} transform="rotate(45 50 50)" />
          <text x={50} y={53.5} fontSize={8.5} fontWeight="bold" textAnchor="middle" fill="#fff4e0" transform={upright(50, 50)}>
            {def.cropCircle === 'RAKE' ? '镰' : def.cropCircle === 'CLUB' ? '杖' : '旗'}
          </text>
        </g>
      )}

      {def.flight && (
        <g transform={`rotate(${FLIGHT_ANGLE[def.flight]} 50 50)`}>
          <path d="M50,18 L59,30 L50,44 L41,30 Z" fill="#f4ead2" stroke="#26303a" strokeWidth={1.3} strokeLinejoin="round" />
          <path d="M50,18 V44 M41,30 H59" stroke="#b8432b" strokeWidth={1} />
          <path d="M50,44 q3,4 0,8 q-3,4 0,8" fill="none" stroke="#26303a" strokeWidth={1} />
        </g>
      )}

      {def.goldmine && (
        <g>
          <path d="M7,89 Q8,82 12,84 Q16,80 20,84 Q24,82 25,89 Z" fill="#d7dde2" stroke="#5c6670" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      )}

      {def.magic && (
        <g>
          <path d="M86,7 L88,14 L95,14 L89,19 L91,26 L86,21 L81,26 L83,19 L77,14 L84,14 Z" fill="#c9a24a" stroke="#fff4e0" strokeWidth={1} />
        </g>
      )}

      {def.robber && (
        <g>
          <path d="M9,11 Q14,7 19,11 Q22,20 14,21 Q6,20 9,11 Z" fill="#5a4630" stroke="#2b2118" strokeWidth={1} />
          <path d="M10,11 H18" stroke="#c9a24a" strokeWidth={1.4} />
        </g>
      )}
    </g>
  );
});

export function anchorOnBoard(def: TileDef, rotation: Rotation, feature: number): { x: number; y: number } {
  return rotatePoint(tileShape(def).anchors[feature] ?? { x: 50, y: 50 }, rotation);
}
