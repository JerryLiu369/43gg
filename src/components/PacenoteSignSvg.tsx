import React from 'react';
import { PacenoteItem } from '../game/types.ts';

export const PacenoteSignSvg: React.FC<{ note: PacenoteItem; size?: number }> = ({
  note,
  size = 56,
}) => {
  // FIA / DiRT Rally style color coding by corner severity:
  // Severity 1 (Hairpin): Crimson #dc2626
  // Severity 2: Deep Orange #ea580c
  // Severity 3: Amber #d97706
  // Severity 4: Yellow-Green #65a30d
  // Severity 5-6: Emerald #059669
  // Hazard / Jump / Bridge: Cyan/Amber #0284c7
  const getBgColor = () => {
    switch (note.severity) {
      case 1:
        return '#dc2626';
      case 2:
        return '#ea580c';
      case 3:
        return '#d97706';
      case 4:
        return '#65a30d';
      case 5:
      case 6:
        return '#059669';
      default:
        return note.type === 'finish' ? '#f59e0b' : '#0284c7';
    }
  };

  const isLeft = note.direction === 'left';
  const isRight = note.direction === 'right';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Outer dark silhouette frame */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="8"
        fill={getBgColor()}
        stroke="#090b0e"
        strokeWidth="3"
      />
      {/* Top inner highlight */}
      <rect
        x="5"
        y="5"
        width="54"
        height="54"
        rx="5"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.5"
      />

      {/* Hairpin Left / Right */}
      {(note.type === 'hairpin_left' || note.type === 'hairpin_right') && (
        <g transform={isRight ? 'scale(-1,1) translate(-64,0)' : undefined}>
          <path
            d="M 44 50 L 44 24 C 44 13, 20 13, 20 24 L 20 40"
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <polygon points="12,36 28,36 20,49" fill="#ffffff" />
        </g>
      )}

      {/* Square Left / Right */}
      {(note.type === 'square_left' || note.type === 'square_right') && (
        <g transform={isRight ? 'scale(-1,1) translate(-64,0)' : undefined}>
          <path
            d="M 42 50 L 42 24 L 20 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon points="24,15 24,33 11,24" fill="#ffffff" />
        </g>
      )}

      {/* Standard 1-6 Left / Right Corners */}
      {note.severity >= 1 &&
        note.type !== 'hairpin_left' &&
        note.type !== 'hairpin_right' &&
        note.type !== 'square_left' &&
        note.type !== 'square_right' &&
        (isLeft || isRight) && (
          <g transform={isRight ? 'scale(-1,1) translate(-64,0)' : undefined}>
            <path
              d="M 40 50 Q 40 26 20 20"
              fill="none"
              stroke="#ffffff"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <polygon points="24,11 26,28 11,18" fill="#ffffff" />
            <text
              x={isRight ? '-20' : '46'}
              y="50"
              transform={isRight ? 'scale(-1,1)' : undefined}
              fill="#ffffff"
              fontSize="24"
              fontWeight="800"
              fontFamily="Barlow Condensed, sans-serif"
              textAnchor="middle"
            >
              {note.severity}
            </text>
          </g>
        )}

      {/* Jump / Crest */}
      {(note.type === 'jump' || note.type === 'crest') && (
        <g>
          <path
            d="M 12 44 Q 32 22 52 44"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 32 34 L 32 14"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <polygon points="23,18 41,18 32,7" fill="#ffffff" />
        </g>
      )}

      {/* Narrow Bridge */}
      {note.type === 'narrow_bridge' && (
        <g>
          <path
            d="M 14 14 L 24 26 L 24 38 L 14 50 M 50 14 L 40 26 L 40 38 L 50 50"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="32" y1="16" x2="32" y2="48" stroke="#ffffff" strokeWidth="3" strokeDasharray="4 4" />
        </g>
      )}

      {/* Water Splash */}
      {note.type === 'water_splash' && (
        <g>
          <path
            d="M 12 42 Q 22 34 32 42 T 52 42"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 20 28 Q 16 18 12 22 M 44 28 Q 48 18 52 22 M 32 25 L 32 14"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Surface Change (Ice / Dirty Tarmac) */}
      {note.type === 'surface_change' && (
        <g>
          <polygon
            points="32,10 54,48 10,48"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          <text
            x="32"
            y="43"
            fill="#ffffff"
            fontSize="24"
            fontWeight="800"
            textAnchor="middle"
          >
            !
          </text>
        </g>
      )}

      {/* Finish Flag */}
      {note.type === 'finish' && (
        <g>
          <rect x="16" y="14" width="32" height="24" fill="#090b0e" />
          <rect x="16" y="14" width="8" height="8" fill="#ffffff" />
          <rect x="32" y="14" width="8" height="8" fill="#ffffff" />
          <rect x="24" y="22" width="8" height="8" fill="#ffffff" />
          <rect x="40" y="22" width="8" height="8" fill="#ffffff" />
          <rect x="16" y="30" width="8" height="8" fill="#ffffff" />
          <rect x="32" y="30" width="8" height="8" fill="#ffffff" />
          <line x1="16" y1="14" x2="16" y2="52" stroke="#ffffff" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
};
