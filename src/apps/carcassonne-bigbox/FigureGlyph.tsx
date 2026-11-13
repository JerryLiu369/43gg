import type { FigureKind } from './engine/index.ts';

const STROKE = '#141414';

export function FigureGlyph({
  kind,
  color,
  x,
  y,
  lying = false,
  scale = 1,
}: {
  kind: FigureKind | 'MAGE' | 'WITCH';
  color: string;
  x: number;
  y: number;
  lying?: boolean;
  scale?: number;
}) {
  const t = `translate(${x} ${y}) scale(${scale})${lying ? ' rotate(-90)' : ''}`;

  switch (kind) {
    case 'PIG': {
      return (
        <g transform={t} className="figure-pig select-none">
          <ellipse cx={1.5} cy={2.5} rx={9.5} ry={6.5} fill="rgba(0,0,0,0.36)" />
          <ellipse cx={0} cy={0} rx={9} ry={6} fill={color} stroke={STROKE} strokeWidth={1.2} />
          <circle cx={8} cy={-1} r={3} fill={color} stroke={STROKE} strokeWidth={1} />
          <path d="M-9,-2 q-3,-2 -2,-4" stroke={STROKE} fill="none" strokeWidth={1.2} />
          <ellipse cx={-0.5} cy={-1} rx={7} ry={3.5} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
        </g>
      );
    }

    case 'BUILDER': {
      return (
        <g transform={t} className="figure-builder select-none">
          <g transform="translate(1.5, 2.5)">
            <circle cx={0} cy={-9} r={4} fill="rgba(0,0,0,0.35)" />
            <path d="M-4,-5 L4,-5 L5,10 L-5,10 Z" fill="rgba(0,0,0,0.35)" />
          </g>
          <circle cx={0} cy={-9} r={3.5} fill={color} stroke={STROKE} strokeWidth={1.2} />
          <path d="M-4,-5 L4,-5 L5,10 L-5,10 Z" fill={color} stroke={STROKE} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M-6,-9 L6,-9" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" />
          <path d="M-3,-4 L3,-4 L4,8 L-3,8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.7} />
        </g>
      );
    }

    case 'MAGE': {
      return (
        <g transform={t} className="figure-mage select-none">
          <path d="M1.5,-10 L8.5,10.5 L-5.5,10.5 Z" fill="rgba(0,0,0,0.35)" />
          <path d="M0,-12 L7,8 L-7,8 Z" fill="#6d28d9" stroke="#fff" strokeWidth={1.3} strokeLinejoin="round" />
          <circle cx={0} cy={-2} r={2.5} fill="#fde047" stroke="#713f12" strokeWidth={0.8} />
          <path d="M-4,6 L4,6" stroke="rgba(255,255,255,0.6)" strokeWidth={0.8} />
        </g>
      );
    }

    case 'WITCH': {
      return (
        <g transform={t} className="figure-witch select-none">
          <g transform="translate(1.5, 2.5)">
            <path d="M0,-12 L6,6 L-6,6 Z" fill="rgba(0,0,0,0.35)" />
            <rect x={-9} y={5} width={18} height={3} fill="rgba(0,0,0,0.35)" />
          </g>
          <path d="M0,-12 L6,6 L-6,6 Z" fill="#1e1b4b" stroke="#c084fc" strokeWidth={1.2} />
          <rect x={-9} y={5} width={18} height={3} rx={1} fill="#1e1b4b" stroke="#c084fc" strokeWidth={1.2} />
          <circle cx={0} cy={-1} r={1.5} fill="#a855f7" />
        </g>
      );
    }

    default: {
      const s = kind === 'LARGE' ? 1.35 : 1;
      const meeplePath =
        'M0,-11 C3.2,-11 4.2,-8 3.4,-6 L8.5,-3.5 C10,-2.8 9.8,0 8,0 L4.5,0 L7.5,9 L2.2,9 L0,4.5 L-2.2,9 L-7.5,9 L-4.5,0 L-8,0 C-9.8,0 -10,-2.8 -8.5,-3.5 L-3.4,-6 C-4.2,-8 -3.2,-11 0,-11 Z';

      return (
        <g transform={`${t} scale(${s})`} className="figure-meeple select-none">
          <path
            d={meeplePath}
            transform="translate(1.6, 2.6)"
            fill="rgba(0,0,0,0.4)"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path
            d={meeplePath}
            fill={color}
            stroke={STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M-2,-10 C0.5,-10.8 1.5,-10.5 2.5,-8.5 L6.5,-4 C8,-3.2 7.5,-1 6.5,-0.8 L3.5,-0.8 L5.5,7 L3,7 L0,2.8"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={0.9}
            strokeLinecap="round"
          />
          {kind === 'ABBOT' && (
            <g>
              <path d="M-3.5,-8 L0,-16 L3.5,-8 Z" fill={color} stroke={STROKE} strokeWidth={1.2} />
              <circle cx={0} cy={-12} r={1.2} fill="#fbbf24" />
            </g>
          )}
        </g>
      );
    }
  }
}
