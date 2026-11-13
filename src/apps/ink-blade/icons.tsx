import React from 'react';
import type { BoonDef } from './types.ts';

export const InkBladeTitleEmblemSvg: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 72 72"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    {/* Vermilion Cinnabar Seal Frame */}
    <rect
      x="6"
      y="6"
      width="60"
      height="60"
      rx="6"
      fill="#FAF8F4"
      stroke="#C2410C"
      strokeWidth="3"
    />
    <rect
      x="11"
      y="11"
      width="50"
      height="50"
      rx="3"
      stroke="#E4DFD5"
      strokeWidth="1.2"
    />
    {/* Ink Brush Circle (Enso) */}
    <path
      d="M50 24A20 20 0 1 0 53 46"
      stroke="#1C1917"
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* Diagonal Katana Issen Flash */}
    <path
      d="M16 56L57 15"
      stroke="#C2410C"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <path
      d="M49 14L58 14L58 23"
      stroke="#D97706"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Tsuba Guard */}
    <line
      x1="23"
      y1="41"
      x2="31"
      y2="49"
      stroke="#1C1917"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export const VitalitySealPipSvg: React.FC<{
  state: 'full' | 'cracked' | 'empty';
}> = ({ state }) => {
  if (state === 'full') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 2.5L20.5 12L12 21.5L3.5 12L12 2.5Z"
          fill="#C2410C"
          stroke="#1C1917"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 6L16.5 11.2L12 13.5L7.5 11.2L12 6Z"
          fill="#FDBA74"
          fillOpacity="0.65"
        />
      </svg>
    );
  }
  if (state === 'cracked') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 2.5L20.5 12L12 21.5L3.5 12L12 2.5Z"
          fill="#F59E0B"
          stroke="#1C1917"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 7L13 12L10 15L15 19"
          stroke="#1C1917"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2.5L20.5 12L12 21.5L3.5 12L12 2.5Z"
        fill="#E7E2D8"
        fillOpacity="0.55"
        stroke="#78716C"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const BoonSealSvg: React.FC<{
  category: BoonDef['category'];
  accentHex: string;
  className?: string;
}> = ({ category, accentHex, className = 'w-7 h-7' }) => {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="5"
        fill="#FAF8F4"
        stroke={accentHex}
        strokeWidth="2"
      />
      {category === 'slash' && (
        <path
          d="M8 24L24 8M18 8H24V14M10 18L14 22"
          stroke="#1C1917"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {category === 'deflect' && (
        <>
          <circle
            cx="16"
            cy="16"
            r="8"
            stroke={accentHex}
            strokeWidth="2.2"
          />
          <path
            d="M12 16L16 11L20 16L16 21L12 16Z"
            fill="#1C1917"
          />
        </>
      )}
      {category === 'focus' && (
        <>
          <path
            d="M6.5 16C9 11 12.5 9 16 9C19.5 9 23 11 25.5 16C23 21 19.5 23 16 23C12.5 23 9 21 6.5 16Z"
            stroke="#1C1917"
            strokeWidth="2"
          />
          <circle cx="16" cy="16" r="3.2" fill={accentHex} />
        </>
      )}
      {category === 'vitality' && (
        <path
          d="M16 7L23.5 16L16 25L8.5 16L16 7Z"
          fill={accentHex}
          stroke="#1C1917"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
};
