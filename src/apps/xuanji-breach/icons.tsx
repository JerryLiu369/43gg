import React from 'react';
import type { MechClassId } from './types.ts';

export const XuanjiBreachEmblemSvg: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg
    viewBox="0 0 96 96"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    {/* Outer Octagonal Bronze Bagua Frame */}
    <polygon
      points="30,6 66,6 90,30 90,66 66,90 30,90 6,66 6,30"
      fill="#1A1613"
      stroke="#D97706"
      strokeWidth="2.5"
    />
    <polygon
      points="33,12 63,12 84,33 84,63 63,84 33,84 12,63 12,33"
      fill="none"
      stroke="#5C4D3C"
      strokeWidth="1.2"
    />
    {/* Rotating Luopan Astrolabe Ring */}
    <circle
      cx="48"
      cy="48"
      r="26"
      fill="#12100E"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeDasharray="6 4"
    />
    {/* Isometric Diamond Grid Cross */}
    <polygon
      points="48,26 70,48 48,70 26,48"
      fill="#112A26"
      stroke="#10B981"
      strokeWidth="2"
    />
    {/* Sinan Magnetic Spoon / Pointer */}
    <path
      d="M48 22L54 48L48 60L42 48L48 22Z"
      fill="#F59E0B"
      stroke="#FEF3C7"
      strokeWidth="1.2"
    />
    <circle cx="48" cy="48" r="5" fill="#10B981" stroke="#ECFDF5" strokeWidth="1.5" />
  </svg>
);

export const MechClassIconSvg: React.FC<{
  mechId: MechClassId;
  className?: string;
}> = ({ mechId, className = 'w-6 h-6' }) => {
  if (mechId === 'titan') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <polygon
          points="12,2 21,7 21,17 12,22 3,17 3,7"
          fill="#064E3B"
          stroke="#10B981"
          strokeWidth="1.8"
        />
        <rect x="8" y="7" width="8" height="5" rx="1" fill="#A7F3D0" />
        <path d="M12 12V19M9 16H15" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (mechId === 'arbalest') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#451A03" stroke="#F59E0B" strokeWidth="1.8" />
        <path
          d="M5 14C8 9 16 9 19 14"
          stroke="#FDE68A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 5V18M9 8L12 5L15 8"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#083344" stroke="#06B6D4" strokeWidth="1.8" />
      <polygon
        points="12,5 19,12 12,19 5,12"
        fill="none"
        stroke="#67E8F9"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" fill="#22D3EE" />
    </svg>
  );
};

export const GridPowerPipSvg: React.FC<{
  state: 'full' | 'threatened' | 'empty';
}> = ({ state }) => {
  if (state === 'empty') {
    return (
      <svg viewBox="0 0 18 22" className="w-4 h-5" aria-hidden="true">
        <polygon
          points="9,2 16,6 16,16 9,20 2,16 2,6"
          fill="#1C1917"
          stroke="#44403C"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (state === 'threatened') {
    return (
      <svg viewBox="0 0 18 22" className="w-4 h-5" aria-hidden="true">
        <polygon
          points="9,2 16,6 16,16 9,20 2,16 2,6"
          fill="#991B1B"
          stroke="#FCA5A5"
          strokeWidth="1.6"
        />
        <line x1="9" y1="6" x2="9" y2="12" stroke="#FEF2F2" strokeWidth="1.8" />
        <circle cx="9" cy="15" r="1.2" fill="#FEF2F2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 22" className="w-4 h-5" aria-hidden="true">
      <polygon
        points="9,2 16,6 16,16 9,20 2,16 2,6"
        fill="#D97706"
        stroke="#FDE68A"
        strokeWidth="1.5"
      />
      <polygon points="9,5 13,8 9,16 5,8" fill="#FEF3C7" />
    </svg>
  );
};
