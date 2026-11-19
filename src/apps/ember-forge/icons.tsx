import React from 'react';
import { ORB_DEFS, PEG_META } from './content.ts';
import type { OrbTypeId, PegKind } from './types.ts';

export const EmberForgeTitleEmblem: React.FC<{ className?: string }> = ({
  className = 'w-full max-w-[360px] h-auto',
}) => (
  <svg
    viewBox="0 0 360 112"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    {/* Forged bronze crest frame */}
    <path
      d="M22 18H116L134 8H226L244 18H338"
      stroke="#C2956B"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M22 94H128L142 104H218L232 94H338"
      stroke="#C2956B"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* Left & right kiln spark diamond accents */}
    <path d="M22 18L14 56L22 94" stroke="#E85D26" strokeWidth="1.8" />
    <path d="M338 18L346 56L338 94" stroke="#E85D26" strokeWidth="1.8" />

    {/* Ricochet arc & molten orb motif */}
    <path
      d="M44 74L72 34L98 62"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeDasharray="4 3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="72" cy="34" r="5" fill="#FDE047" />
    <circle cx="44" cy="74" r="4" fill="#E85D26" />

    <path
      d="M316 74L288 34L262 62"
      stroke="#2DD4BF"
      strokeWidth="2"
      strokeDasharray="4 3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="288" cy="34" r="5" fill="#2DD4BF" />
    <circle cx="316" cy="74" r="4" fill="#F59E0B" />

    {/* Title typography integrated into plaque */}
    <text
      x="180"
      y="64"
      textAnchor="middle"
      fill="#FAF5EE"
      fontSize="38"
      fontWeight="800"
      letterSpacing="8"
      fontFamily="'Noto Sans SC', 'Plus Jakarta Sans', sans-serif"
    >
      炽穹弹炉
    </text>
    <text
      x="180"
      y="86"
      textAnchor="middle"
      fill="#D6B594"
      fontSize="11.5"
      fontWeight="600"
      letterSpacing="4"
      fontFamily="'Noto Sans SC', system-ui, sans-serif"
    >
      物理弹射 · 鼓风控球 · 熔炉构筑
    </text>
  </svg>
);

export const OrbGlyphSvg: React.FC<{
  orbId: OrbTypeId;
  size?: number;
}> = ({ orbId, size = 24 }) => {
  const def = ORB_DEFS[orbId];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="#1C1512"
        stroke={def.color}
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="6.2" fill={def.color} />
      <circle cx="9.8" cy="9.8" r="2.2" fill={def.coreColor} />
      {orbId === 'twin_spark' && (
        <circle cx="15.2" cy="14.6" r="2.2" fill={def.coreColor} />
      )}
      {orbId === 'meteor_pierce' && (
        <path d="M7 17L17 7" stroke="#FFFBEB" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {orbId === 'thunder_mag' && (
        <path d="M13 7L9.5 12.5H12.5L11 17L14.5 11.5H11.5L13 7Z" fill="#FFFBEB" />
      )}
    </svg>
  );
};

export const PegGlyphSvg: React.FC<{
  kind: PegKind;
  size?: number;
}> = ({ kind, size = 20 }) => {
  const meta = PEG_META[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill={meta.baseColor}
        stroke={meta.litColor}
        strokeWidth="1.8"
      />
      <circle cx="10" cy="10" r="3.2" fill={meta.litColor} />
    </svg>
  );
};
