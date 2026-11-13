import React from 'react';

/** 标题页插画：晷盘上，橘猫蜷在晷针的影子里，旁边挂着鱼干 */
export const CourtyardEmblem: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 320 240" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="ios-em-sun" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#FFF1C1" />
        <stop offset="100%" stopColor="#F59E0B" />
      </radialGradient>
      <linearGradient id="ios-em-plate" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EFE4CF" />
        <stop offset="100%" stopColor="#D9C8A6" />
      </linearGradient>
      <linearGradient id="ios-em-shade" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stopColor="#4C5F8F" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#4C5F8F" stopOpacity="0.32" />
      </linearGradient>
    </defs>
    {/* 太阳与光线 */}
    <g opacity="0.9">
      <circle cx="262" cy="52" r="34" fill="#FDE68A" opacity="0.35" />
      <circle cx="262" cy="52" r="20" fill="url(#ios-em-sun)" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={262 + Math.cos(a) * 27}
            y1={52 + Math.sin(a) * 27}
            x2={262 + Math.cos(a) * 34}
            y2={52 + Math.sin(a) * 34}
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        );
      })}
    </g>
    {/* 晷盘 */}
    <ellipse cx="150" cy="176" rx="128" ry="42" fill="#B9A47C" />
    <ellipse cx="150" cy="166" rx="128" ry="42" fill="url(#ios-em-plate)" stroke="#B9A47C" strokeWidth="2" />
    <ellipse cx="150" cy="166" rx="104" ry="32" fill="none" stroke="#C9B48E" strokeWidth="1.2" strokeDasharray="3 5" />
    {['辰', '巳', '午', '未', '申'].map((ch, i) => {
      const a = Math.PI * (0.08 + i * 0.21);
      return (
        <text
          key={ch}
          x={150 + Math.cos(a) * 112}
          y={170 + Math.sin(a) * 32}
          textAnchor="middle"
          fontSize="13"
          fill="#8C7A5C"
          style={{ fontFamily: 'var(--ios-serif)' }}
        >
          {ch}
        </text>
      );
    })}
    {/* 影子 */}
    <path d="M150 162 L 44 150 L 46 170 L 150 170 Z" fill="url(#ios-em-shade)" />
    {/* 晷针 */}
    <path d="M146 166 L 150 92 L 156 166 Z" fill="#6B5B45" />
    <circle cx="151" cy="166" r="6" fill="#5C4F3B" />
    {/* 猫：蜷在影子里 */}
    <g transform="translate(86 146)">
      <ellipse cx="0" cy="18" rx="30" ry="6" fill="#2B2118" opacity="0.15" />
      <path
        d="M24 10 C 40 6, 40 -14, 26 -14"
        stroke="#6B3F1F"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M24 10 C 40 6, 40 -14, 26 -14" stroke="#EE9A45" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <ellipse cx="2" cy="6" rx="27" ry="14" fill="#EE9A45" stroke="#6B3F1F" strokeWidth="1.5" />
      <path d="M-6 -4 q 4 6 0 14 M4 -6 q 4 7 0 15 M14 -5 q 4 6 0 13" stroke="#C8712A" strokeWidth="2.2" fill="none" />
      <path d="M-30 -2 L -27 -22 L -16 -12 Z" fill="#EE9A45" stroke="#6B3F1F" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M-8 -3 L -10 -22 L -20 -12 Z" fill="#EE9A45" stroke="#6B3F1F" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M-27.5 -6 L -26 -17 L -19.5 -11 Z" fill="#F4B3A6" />
      <ellipse cx="-18" cy="0" rx="16" ry="13" fill="#EE9A45" stroke="#6B3F1F" strokeWidth="1.5" />
      <path d="M-24 2 q 3 2 6 0 M-15 2 q 3 2 6 0" stroke="#2B2118" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M-18 6 l -2 2 h 4 z" fill="#E98A8A" />
      <path d="M-22 -10 l 1 5 M-18 -11 l 0 5 M-14 -10 l -1 5" stroke="#C8712A" strokeWidth="1.6" />
      <ellipse cx="-27" cy="5" rx="3" ry="1.8" fill="#F0786E" opacity="0.4" />
      <ellipse cx="-9" cy="5" rx="3" ry="1.8" fill="#F0786E" opacity="0.4" />
      <path d="M-6 16 q 6 3 12 0" stroke="#FFF4E6" strokeWidth="5" strokeLinecap="round" fill="none" />
    </g>
    {/* 鱼干架 */}
    <g transform="translate(222 120)">
      <path d="M-22 52 L -14 0 M22 52 L 14 0 M-26 2 H 26" stroke="#B48E48" strokeWidth="4" strokeLinecap="round" />
      {[-11, 0, 11].map((x, i) => (
        <g key={x} transform={`translate(${x} 2) rotate(${(i - 1) * 6})`}>
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8C7A5F" strokeWidth="1" />
          <ellipse cx="0" cy="17" rx="4.2" ry="11" fill="#C9B48E" stroke="#8C7A5F" strokeWidth="1" />
          <path d="M0 27 l -4 6 h 8 z" fill="#A88F66" />
          <circle cx="0" cy="10" r="1" fill="#2B2118" />
        </g>
      ))}
    </g>
  </svg>
);

/** 「妙」字朱印 */
export const SealStamp: React.FC<{ className?: string; title?: string }> = ({ className, title }) => (
  <svg viewBox="0 0 32 32" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    <rect x="2" y="2" width="28" height="28" rx="4" fill="#C2410C" transform="rotate(-6 16 16)" />
    <rect x="5" y="5" width="22" height="22" rx="2.5" fill="none" stroke="#FCE9DC" strokeWidth="1.4" transform="rotate(-6 16 16)" />
    <text
      x="16"
      y="21.5"
      textAnchor="middle"
      fontSize="15"
      fontWeight="700"
      fill="#FFF7F0"
      transform="rotate(-6 16 16)"
      style={{ fontFamily: 'var(--ios-serif)' }}
    >
      妙
    </text>
  </svg>
);

export const PawIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
    <ellipse cx="12" cy="15.5" rx="5.2" ry="4.3" />
    <ellipse cx="5.6" cy="10" rx="2" ry="2.5" />
    <ellipse cx="9.5" cy="6" rx="2" ry="2.6" />
    <ellipse cx="14.5" cy="6" rx="2" ry="2.6" />
    <ellipse cx="18.4" cy="10" rx="2" ry="2.5" />
  </svg>
);

/** 「等日头」按钮里的小太阳 */
export const SunGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
    <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" />
  </svg>
);
