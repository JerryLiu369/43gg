import React from 'react';
import { PHASES } from './content.ts';
import type { PhaseIndex } from './types.ts';

/** 太阳在碗形日晷上的角度（0° 为东/右，90° 为南/下，180° 为西/左） */
const SUN_ANGLE = [8, 48, 90, 132, 172];
/** 晷针影子的朝向（与游戏规则一致：西、西、北、东、东），单调递增便于过渡 */
const SHADOW_ROTATION = [180, 180, 270, 360, 360];
const SHADOW_LEN = (delta: number) => (delta > 0 ? 34 : delta === 0 ? 25 : 15);

export function shadowRuleText(phase: PhaseIndex): string {
  const def = PHASES[phase];
  const len =
    def.lengthDelta > 0 ? '比物件长一格' : def.lengthDelta === 0 ? '与物件一样长' : '比物件短一格';
  return `影子朝${def.shadowSide}，${len}`;
}

interface SunDialProps {
  phase: PhaseIndex;
  /** 正在预览下一个时辰 */
  previewing: boolean;
  compact?: boolean;
}

export const SunDial: React.FC<SunDialProps> = ({ phase, previewing, compact = false }) => {
  const cx = 110;
  const cy = 24;
  const r = 80;
  const next = Math.min(4, phase + 1) as PhaseIndex;
  const hasNext = phase < 4;
  const sunAngle = SUN_ANGLE[phase];
  const shadowRot = SHADOW_ROTATION[phase];
  const shadowLen = SHADOW_LEN(PHASES[phase].lengthDelta);
  const nextRot = SHADOW_ROTATION[next];
  const nextLen = SHADOW_LEN(PHASES[next].lengthDelta);

  return (
    <svg
      viewBox="0 0 220 122"
      className={compact ? 'h-[58px] w-auto shrink-0' : 'w-full h-auto'}
      role="img"
      aria-label={`日晷：${PHASES[phase].name}，${shadowRuleText(phase)}`}
    >
      <defs>
        <radialGradient id="ios-dial-face" cx="50%" cy="10%" r="90%">
          <stop offset="0%" stopColor="#F3EBDD" />
          <stop offset="100%" stopColor="#E2D5BE" />
        </radialGradient>
        <radialGradient id="ios-sun" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFE9A8" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
      </defs>
      {/* 碗形晷盘 */}
      <path
        d={`M ${cx - r - 10} ${cy} A ${r + 10} ${r + 10} 0 0 0 ${cx + r + 10} ${cy} Z`}
        fill="url(#ios-dial-face)"
        stroke="#CBB994"
        strokeWidth="1.5"
      />
      <line x1={cx - r - 16} y1={cy} x2={cx + r + 16} y2={cy} stroke="#B9A47C" strokeWidth="1.5" />
      {/* 刻度弧 */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
        fill="none"
        stroke="#D9CBB0"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      {PHASES.map((p) => {
        const a = (SUN_ANGLE[p.index] * Math.PI) / 180;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const lx = cx + Math.cos(a) * (r - 17);
        const ly = cy + Math.sin(a) * (r - 17);
        const past = p.index < phase;
        const current = p.index === phase;
        const upcoming = previewing && hasNext && p.index === next;
        return (
          <g key={p.index}>
            <circle
              cx={x}
              cy={y}
              r={current ? 0 : 4}
              fill={past ? '#8C7A5C' : upcoming ? '#FFFFFF' : '#F6F0E4'}
              stroke={upcoming ? '#1F2A55' : '#A8956F'}
              strokeWidth={upcoming ? 1.8 : 1.2}
              strokeDasharray={upcoming ? '2 1.6' : undefined}
            />
            <text
              x={lx}
              y={ly + 4}
              textAnchor="middle"
              fontSize="12"
              fontWeight={current ? 700 : 500}
              fill={current ? '#C2410C' : past ? '#8C7A5C' : '#5C4F3B'}
              style={{ fontFamily: 'var(--ios-serif)' }}
            >
              {p.name.slice(0, 1)}
            </text>
          </g>
        );
      })}
      {/* 晷针与影子 */}
      {previewing && hasNext && (
        <g
          style={{
            transform: `rotate(${nextRot}deg)`,
            transformOrigin: `${cx}px ${cy + 30}px`,
            transformBox: 'view-box',
          }}
        >
          <line
            x1={cx}
            y1={cy + 30}
            x2={cx + nextLen}
            y2={cy + 30}
            stroke="#1F2A55"
            strokeWidth="2"
            strokeDasharray="3 2.5"
            strokeLinecap="round"
          />
        </g>
      )}
      <g
        style={{
          transform: `rotate(${shadowRot}deg)`,
          transformOrigin: `${cx}px ${cy + 30}px`,
          transformBox: 'view-box',
          transition: 'transform 0.9s cubic-bezier(0.65,0,0.35,1)',
        }}
      >
        <line
          x1={cx}
          y1={cy + 30}
          x2={cx + shadowLen}
          y2={cy + 30}
          stroke="#4C5F8F"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
      <circle cx={cx} cy={cy + 30} r="4.5" fill="#5C4F3B" />
      {/* 太阳 */}
      <g
        style={{
          transform: `rotate(${sunAngle}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transformBox: 'view-box',
          transition: 'transform 0.9s cubic-bezier(0.65,0,0.35,1)',
        }}
      >
        <g transform={`translate(${cx + r} ${cy})`}>
          <circle r="11" fill="#FDE68A" opacity="0.45" />
          <circle r="7.5" fill="url(#ios-sun)" stroke="#D97706" strokeWidth="1" />
        </g>
      </g>
      {/* 日落 */}
      <text
        x={cx - r - 4}
        y={cy - 8}
        textAnchor="middle"
        fontSize="9"
        fill={phase === 4 ? '#C2410C' : '#A8956F'}
      >
        酉·日落
      </text>
      <text x={cx + r + 4} y={cy - 8} textAnchor="middle" fontSize="9" fill="#A8956F">
        东
      </text>
    </svg>
  );
};
