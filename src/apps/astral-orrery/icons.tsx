import React from 'react';
import type { ModuleTypeId } from './types.ts';

export const AstralOrreryEmblemSvg: React.FC<{ className?: string }> = ({
  className = 'w-20 h-20',
}) => (
  <svg
    viewBox="0 0 120 120"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    {/* Outer obsidian & engraved brass chapter ring */}
    <circle
      cx="60"
      cy="60"
      r="54"
      fill="#070C18"
      stroke="#C89B54"
      strokeWidth="2.5"
    />
    <circle
      cx="60"
      cy="60"
      r="48"
      stroke="#8C6428"
      strokeWidth="1"
      strokeDasharray="3 3"
    />
    {/* 3D Gyroscopic Tilted Elliptical Gimbal Rings */}
    <ellipse
      cx="60"
      cy="60"
      rx="41"
      ry="19"
      transform="rotate(-24 60 60)"
      stroke="#38BDF8"
      strokeOpacity="0.65"
      strokeWidth="1.4"
    />
    <ellipse
      cx="60"
      cy="60"
      rx="35"
      ry="16"
      transform="rotate(28 60 60)"
      stroke="#F59E0B"
      strokeOpacity="0.85"
      strokeWidth="1.6"
    />
    <circle
      cx="60"
      cy="60"
      r="22"
      stroke="#C89B54"
      strokeWidth="1.3"
      strokeOpacity="0.8"
    />
    {/* 12-o'clock Golden Meridian Laser Spire */}
    <line x1="60" y1="5" x2="60" y2="60" stroke="#FBBF24" strokeWidth="2.2" />
    <polygon points="60,3 55,12 65,12" fill="#FDE047" />
    {/* Lower Crucible Pedestal glyph */}
    <path
      d="M44 102 L76 102 L70 92 L50 92 Z"
      fill="#1E293B"
      stroke="#C89B54"
      strokeWidth="1.4"
    />
    {/* Aligned Syzygy celestial spheres */}
    <circle cx="60" cy="24" r="4.8" fill="#14B8A6" stroke="#F8FAFC" strokeWidth="1.4" />
    <circle cx="60" cy="38" r="4" fill="#F59E0B" stroke="#F8FAFC" strokeWidth="1.2" />
    <circle cx="88" cy="46" r="3.8" fill="#EF4444" stroke="#F8FAFC" strokeWidth="1.1" />
    {/* Central Singularity Sun-Mainspring */}
    <circle cx="60" cy="60" r="10.5" fill="#F59E0B" stroke="#FEF3C7" strokeWidth="2" />
    <circle cx="60" cy="60" r="4" fill="#FEF9C3" />
  </svg>
);

export const ResourceGlyphSvg: React.FC<{
  kind: 'luminance' | 'flux' | 'aether' | 'stardust' | 'spring';
  className?: string;
}> = ({ kind, className = 'w-4 h-4' }) => {
  if (kind === 'luminance') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z"
          fill="#F59E0B"
          stroke="#78350F"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.6" fill="#FEF9C3" />
      </svg>
    );
  }
  if (kind === 'flux') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 2L19 10.5L12 22L5 10.5L12 2Z"
          fill="#EA580C"
          stroke="#431407"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M12 6L15.8 11L12 18L8.2 11L12 6Z"
          fill="#FDE047"
        />
      </svg>
    );
  }
  if (kind === 'aether') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <polygon
          points="12,2 20,8 17,20 7,20 4,8"
          fill="#06B6D4"
          stroke="#083344"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <polygon points="12,5 16.5,9 14.5,17 9.5,17 7.5,9" fill="#A5F3FC" fillOpacity="0.8" />
      </svg>
    );
  }
  if (kind === 'stardust') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#6366F1" stroke="#1E1B4B" strokeWidth="1.4" />
        <path
          d="M12 5L13.8 10.2L19 12L13.8 13.8L12 19L10.2 13.8L5 12L10.2 10.2L12 5Z"
          fill="#EEF2FF"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 12m-8 0a8 8 0 1 0 16 0a6 6 0 1 0 -12 0a4 4 0 1 0 8 0a2 2 0 1 0 -4 0"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const ModuleGlyphSvg: React.FC<{
  typeId: ModuleTypeId;
  className?: string;
}> = ({ typeId, className = 'w-5 h-5' }) => {
  switch (typeId) {
    case 'prism':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <polygon
            points="12,3 21,19 3,19"
            fill="#F59E0B"
            stroke="#090D16"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <line x1="12" y1="3" x2="12" y2="19" stroke="#FEF3C7" strokeWidth="1.4" />
        </svg>
      );
    case 'mainspring':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="#EA580C" stroke="#090D16" strokeWidth="1.75" />
          <circle cx="12" cy="12" r="3.2" fill="#FFF7ED" stroke="#090D16" strokeWidth="1.4" />
          <line x1="12" y1="2" x2="12" y2="5" stroke="#FDBA74" strokeWidth="2" />
          <line x1="12" y1="19" x2="12" y2="22" stroke="#FDBA74" strokeWidth="2" />
          <line x1="2" y1="12" x2="5" y2="12" stroke="#FDBA74" strokeWidth="2" />
          <line x1="19" y1="12" x2="22" y2="12" stroke="#FDBA74" strokeWidth="2" />
        </svg>
      );
    case 'resonator':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M8 4V11C8 13.2 9.8 15 12 15C14.2 15 16 13.2 16 11V4"
            stroke="#14B8A6"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line x1="12" y1="15" x2="12" y2="21" stroke="#5EEAD4" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="8" cy="4" r="1.8" fill="#99F6E4" stroke="#090D16" strokeWidth="1" />
          <circle cx="16" cy="4" r="1.8" fill="#99F6E4" stroke="#090D16" strokeWidth="1" />
        </svg>
      );
    case 'lens':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <ellipse
            cx="12"
            cy="12"
            rx="8.5"
            ry="5"
            transform="rotate(-30 12 12)"
            fill="#6366F1"
            stroke="#090D16"
            strokeWidth="1.75"
          />
          <circle cx="12" cy="12" r="2.2" fill="#E0E7FF" />
        </svg>
      );
    case 'condenser':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <polygon
            points="12,2 19,9 15,21 9,21 5,9"
            fill="#06B6D4"
            stroke="#090D16"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="2.6" fill="#ECFEFF" />
        </svg>
      );
    case 'chrono':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <polygon
            points="6,3 18,3 14,12 18,21 6,21 10,12"
            fill="#10B981"
            stroke="#090D16"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2" fill="#ECFDF5" />
        </svg>
      );
  }
};
