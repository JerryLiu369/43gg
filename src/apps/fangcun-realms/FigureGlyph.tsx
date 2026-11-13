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
          <path d="M0,-12 L7,8 L-7,8 Z" fill="#c9a24a" stroke="#fff4e0" strokeWidth={1.3} strokeLinejoin="round" />
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
          <path d="M0,-12 L6,6 L-6,6 Z" fill="#1e1b4b" stroke="#d97757" strokeWidth={1.2} />
          <rect x={-9} y={5} width={18} height={3} rx={1} fill="#1e1b4b" stroke="#d97757" strokeWidth={1.2} />
          <circle cx={0} cy={-1} r={1.5} fill="#d97757" />
        </g>
      );
    }

    default: {
      // A hatted pawn (bamboo hat, head, robe) for followers; the leader is drawn larger.
      const s = kind === 'LARGE' ? 1.35 : 1;
      const body = 'M-8,-7 L0,-13 L8,-7 Z M-3,-6 A3,3 0 1,0 3,-6 Z M-5,-3.5 H5 L7.5,9 H-7.5 Z';
      return (
        <g transform={`${t} scale(${s})`} className="figure-follower select-none">
          <path d={body} transform="translate(1.6, 2.6)" fill="rgba(0,0,0,0.38)" />
          <path d="M-5,-3.5 H5 L7.5,9 H-7.5 Z" fill={color} stroke={STROKE} strokeWidth={1.2} strokeLinejoin="round" />
          <circle cx={0} cy={-5.5} r={3} fill={color} stroke={STROKE} strokeWidth={1.1} />
          <path d="M-8.5,-7 L0,-13.5 L8.5,-7 Z" fill={color} stroke={STROKE} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M-3,-2 L-4.5,7" stroke="rgba(255,255,255,0.45)" strokeWidth={0.9} strokeLinecap="round" />
          {kind === 'ABBOT' && <path d="M9,-12 L11,9" stroke={STROKE} strokeWidth={1.6} strokeLinecap="round" />}
        </g>
      );
    }
  }
}
