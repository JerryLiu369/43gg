import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, LayoutGrid, List, Play, Search, X } from 'lucide-react';
import {
  APP_CATEGORY_LABELS,
  APP_CATEGORY_ORDER,
  filterWorkspaceApps,
  type AppCategory,
  type WorkspaceAppEntry,
} from '../apps/registry.ts';
import {
  localDayKey,
  orderCatalog,
  readOrCreateShuffleSeed,
  readSortMode,
  writeSortMode,
  type CatalogSortMode,
} from './catalogOrder.ts';
import { readHubSnapshot } from './hubProgress.ts';
import { CONTRIBUTING_URL, REPO_URL } from './site.ts';

interface HomeHubProps {
  apps: ReadonlyArray<WorkspaceAppEntry>;
  onLaunchApp: (appId: string) => void;
}

type CategoryFilter = 'all' | AppCategory;
type CatalogViewMode = 'grid' | 'list';

const VIEW_MODE_STORAGE_KEY = '43gg.hub.view_mode.v1';

function loadInitialViewMode(): CatalogViewMode {
  if (typeof window === 'undefined') return 'grid';
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'list'
      ? 'list'
      : 'grid';
  } catch {
    return 'grid';
  }
}

const SORT_MODE_OPTIONS: ReadonlyArray<{ id: CatalogSortMode; label: string; hint: string }> = [
  { id: 'shuffle', label: '随机', hint: '每天为你重新随机排列一次' },
  { id: 'newest', label: '最新', hint: '按上架时间从新到旧排列' },
];

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PlateRegistrationMarks: React.FC = () => (
  <g stroke="#CFC7B8" strokeWidth="1" strokeLinecap="round">
    <path d="M18 22V16H24" />
    <path d="M302 22V16H296" />
    <path d="M18 158V164H24" />
    <path d="M302 158V164H296" />
  </g>
);

/**
 * Deterministic Swiss geometric fallback cover so any future game added to APP_REGISTRY
 * immediately receives a clean, unique technical diagram plate without manual layout edits.
 */
const ProceduralCoverGraphic: React.FC<{ app: WorkspaceAppEntry }> = ({ app }) => {
  const seed = hashSlug(app.id);
  const accentColor =
    app.accent === 'emerald' || app.accent === 'cyan' ? '#0F766E' : '#C2410C';
  const secondaryColor = accentColor === '#C2410C' ? '#0F766E' : '#C2410C';
  const offsetA = 78 + (seed % 34);
  const offsetB = 208 + ((seed >>> 4) % 34);
  const ringR = 36 + ((seed >>> 8) % 16);
  const angleDeg = (seed >>> 12) % 360;
  const rad = (angleDeg * Math.PI) / 180;
  const nx = 160 + Math.cos(rad) * ringR;
  const ny = 90 + Math.sin(rad) * ringR;

  return (
    <svg
      viewBox="0 0 320 180"
      className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
      fill="none"
      aria-hidden="true"
    >
      <PlateRegistrationMarks />
      <rect
        x="62"
        y="24"
        width="196"
        height="132"
        rx="6"
        fill="#FAF8F4"
        stroke="#CFC7B8"
        strokeWidth="1.5"
      />
      <g stroke="#EAE5DC" strokeWidth="1">
        <line x1={offsetA} y1="24" x2={offsetA} y2="156" />
        <line x1={offsetB} y1="24" x2={offsetB} y2="156" />
        <line x1="62" y1="90" x2="258" y2="90" />
      </g>
      <circle cx="160" cy="90" r={ringR} stroke="#1C1917" strokeWidth="1.6" />
      <circle
        cx="160"
        cy="90"
        r={Math.max(16, ringR - 14)}
        stroke={accentColor}
        strokeWidth="1.5"
        strokeDasharray="5 3.5"
      />
      <line
        x1="160"
        y1="90"
        x2={nx.toFixed(1)}
        y2={ny.toFixed(1)}
        stroke={accentColor}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx={nx.toFixed(1)} cy={ny.toFixed(1)} r="4.5" fill={secondaryColor} />
      <circle cx="160" cy="90" r="5" fill="#1C1917" />
    </svg>
  );
};

const AppCoverGraphic: React.FC<{ app: WorkspaceAppEntry }> = ({ app }) => {
  if (app.id === 'mistlight-voyage') {
    return (
      <svg viewBox="0 0 320 180" className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out" fill="none" aria-hidden="true">
        <PlateRegistrationMarks />
        <g stroke="#D8D3C7" strokeWidth="1">
          <path d="M45 142Q83 130 116 143T192 140T274 137M51 150Q81 140 119 152T196 149T268 147" />
          <ellipse cx="90" cy="114" rx="27" ry="12" /><ellipse cx="161" cy="114" rx="25" ry="12" /><ellipse cx="161" cy="56" rx="26" ry="12" /><ellipse cx="241" cy="56" rx="24" ry="12" />
        </g>
        <path d="M90 106H161V51H241" stroke="#0F766E" strokeWidth="2.5" />
        <path d="m147 120 28-28M147 65l28-28" stroke="#1C1917" strokeWidth="4" strokeLinecap="round" />
        <path d="M79 114 83 76h14l4 38M80 77l10-11 10 11ZM82 87h16" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.5" />
        <path d="M230 58 234 20h14l4 38M231 21l10-11 10 11ZM233 31h16" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.5" />
        <circle cx="90" cy="84" r="3" fill="#C2410C" /><circle cx="241" cy="28" r="3" fill="#0F766E" />
        <path d="M202 113h29l-6 7h-18ZM217 87v25l-14-1Z" stroke="#C2410C" strokeWidth="1.5" fill="#FAF8F4" />
        <circle cx="61" cy="42" r="14" stroke="#CFC7B8" /><path d="M61 23v38M42 42h38" stroke="#CFC7B8" /><path d="m61 31 4 11-4 11-4-11Z" fill="#0F766E" />
      </svg>
    );
  }
  const { id: appId } = app;

  if (appId === 'xuanji-breach') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <polygon
          points="160,22 268,81 160,140 52,81"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <polygon
          points="52,81 160,140 268,81 268,91 160,150 52,91"
          fill="#E8E3D9"
          stroke="#CFC7B8"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <g stroke="#EAE5DC" strokeWidth="1">
          <line x1="88" y1="61.3" x2="196" y2="120.3" />
          <line x1="124" y1="41.6" x2="232" y2="100.6" />
          <line x1="232" y1="61.3" x2="124" y2="120.3" />
          <line x1="196" y1="41.6" x2="88" y2="100.6" />
        </g>
        <polyline
          points="52,81 160,140 268,81"
          stroke="#1C1917"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <ellipse
          cx="160"
          cy="81"
          rx="52"
          ry="28.5"
          fill="#FAF8F4"
          stroke="#1C1917"
          strokeWidth="1.75"
        />
        <ellipse
          cx="160"
          cy="81"
          rx="35.5"
          ry="19.5"
          stroke="#C2410C"
          strokeWidth="1.6"
          strokeDasharray="6 3.5"
        />
        <g stroke="#78716C" strokeWidth="1.2" strokeLinecap="round">
          <line x1="160" y1="50" x2="160" y2="55.5" />
          <line x1="160" y1="106.5" x2="160" y2="112" />
          <line x1="104" y1="81" x2="111.5" y2="81" />
          <line x1="208.5" y1="81" x2="216" y2="81" />
        </g>
        <path
          d="M118 90L160 67L202 90"
          stroke="#C2410C"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="193,91 202,90 199,82"
          stroke="#C2410C"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="160" cy="81" r="5.2" fill="#0F766E" />
        <circle cx="118" cy="90" r="4.3" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.8" />
        <circle cx="202" cy="90" r="4.3" fill="#C2410C" />
      </svg>
    );
  }

  if (appId === 'ink-blade') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect
          x="64"
          y="24"
          width="192"
          height="132"
          rx="6"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <g stroke="#EAE5DC" strokeWidth="1">
          <line x1="128" y1="24" x2="128" y2="156" />
          <line x1="192" y1="24" x2="192" y2="156" />
          <line x1="64" y1="90" x2="256" y2="90" />
        </g>
        <circle
          cx="160"
          cy="90"
          r="47"
          stroke="#DFD9CE"
          strokeWidth="1.1"
          strokeDasharray="3 4"
        />
        <path
          d="M194 62A42 42 0 1 0 199 112"
          stroke="#1C1917"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="152" cy="94" r="8.5" stroke="#C2410C" strokeWidth="1.3" opacity="0.55" />
        <line
          x1="94"
          y1="135"
          x2="224"
          y2="44"
          stroke="#C2410C"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <line
          x1="110"
          y1="139"
          x2="230"
          y2="54"
          stroke="#1C1917"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="8 6"
        />
        <rect x="218" y="122" width="19" height="19" rx="3" fill="#C2410C" />
        <rect x="222.5" y="126.5" width="10" height="10" rx="1" stroke="#FAF8F4" strokeWidth="1.5" />
      </svg>
    );
  }

  if (appId === 'astral-orrery') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <circle
          cx="160"
          cy="90"
          r="62"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <circle cx="160" cy="90" r="47" stroke="#E4DFD5" strokeWidth="1.2" />
        <circle cx="160" cy="90" r="32" stroke="#D6D0C4" strokeWidth="1.2" />
        <circle cx="160" cy="90" r="17" stroke="#1C1917" strokeWidth="1.5" />
        <line x1="92" y1="90" x2="228" y2="90" stroke="#EAE5DC" strokeWidth="1" />
        <line x1="160" y1="90" x2="160" y2="158" stroke="#EAE5DC" strokeWidth="1" />
        <line
          x1="160"
          y1="22"
          x2="160"
          y2="90"
          stroke="#C2410C"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="160" cy="43" r="4.8" fill="#0F766E" />
        <circle cx="160" cy="58" r="4.3" fill="#C2410C" />
        <circle
          cx="207"
          cy="90"
          r="4.3"
          fill="#FAF8F4"
          stroke="#1C1917"
          strokeWidth="1.75"
        />
        <circle
          cx="128"
          cy="90"
          r="3.6"
          fill="#FAF8F4"
          stroke="#78716C"
          strokeWidth="1.5"
        />
        <circle cx="160" cy="90" r="6.2" fill="#1C1917" />
        <circle cx="160" cy="90" r="2.3" fill="#FAF8F4" />
      </svg>
    );
  }

  if (appId === 'lucky-landlord') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect
          x="70"
          y="26"
          width="180"
          height="128"
          rx="6"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <g stroke="#E6E1D6" strokeWidth="1">
          <line x1="106" y1="26" x2="106" y2="154" />
          <line x1="142" y1="26" x2="142" y2="154" />
          <line x1="178" y1="26" x2="178" y2="154" />
          <line x1="214" y1="26" x2="214" y2="154" />
          <line x1="70" y1="58" x2="250" y2="58" />
          <line x1="70" y1="90" x2="250" y2="90" />
          <line x1="70" y1="122" x2="250" y2="122" />
        </g>
        <g stroke="#C2410C" strokeWidth="1.4" strokeDasharray="3 2.5">
          <line x1="160" y1="74" x2="124" y2="74" />
          <line x1="160" y1="74" x2="196" y2="74" />
          <line x1="160" y1="74" x2="160" y2="106" />
        </g>
        <rect x="146" y="61.5" width="28" height="25" rx="3.5" fill="#C2410C" />
        <circle cx="160" cy="74" r="5.8" fill="#FAF8F4" />
        <circle cx="124" cy="74" r="6.2" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.8" />
        <rect
          x="189.8"
          y="67.8"
          width="12.4"
          height="12.4"
          rx="2.5"
          fill="#FAF8F4"
          stroke="#1C1917"
          strokeWidth="1.8"
        />
        <circle cx="160" cy="106" r="5.8" fill="#0F766E" />
        <path
          d="M232 36.5L238.4 47.5H225.6L232 36.5Z"
          stroke="#1C1917"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="88" cy="138" r="5.2" fill="#1C1917" />
      </svg>
    );
  }

  if (appId === 'moon-mirror') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect x="48" y="22" width="224" height="136" rx="8" fill="#FAF8F4" stroke="#CFC7B8" strokeWidth="1.5" />
        <circle cx="160" cy="72" r="31" fill="#F1E8CC" stroke="#1C1917" strokeWidth="1.4" />
        <path d="M143 59C151 53 164 53 171 58M145 84C155 89 168 87 175 80" stroke="#C9BD99" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M67 127H139L183 83H246" stroke="#0F766E" strokeWidth="7" strokeOpacity="0.08" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M67 127H139L183 83H246" stroke="#0F766E" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(161 105) rotate(-45)">
          <circle r="23" fill="#FAF8F4" stroke="#78716C" strokeWidth="1.2" />
          <line x1="-17" y1="0" x2="17" y2="0" stroke="#1C1917" strokeWidth="5" strokeLinecap="round" />
          <line x1="-17" y1="-1" x2="17" y2="-1" stroke="#D8E5DF" strokeWidth="2" strokeLinecap="round" />
          <circle r="3" fill="#C2410C" />
        </g>
        <g transform="translate(247 83)" stroke="#C2410C" strokeWidth="1.3">
          <ellipse cx="0" cy="-10" rx="5" ry="10" />
          <ellipse cx="0" cy="-10" rx="5" ry="10" transform="rotate(60)" />
          <ellipse cx="0" cy="-10" rx="5" ry="10" transform="rotate(120)" />
          <circle r="4" fill="#C2410C" stroke="none" />
        </g>
        <circle cx="67" cy="127" r="5" fill="#C2410C" />
        <path d="M72 143Q117 135 158 143T249 141" stroke="#CFC7B8" strokeWidth="1.1" />
      </svg>
    );
  }

  if (appId === 'chrono-stage') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect
          x="44"
          y="34"
          width="114"
          height="112"
          rx="6"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <path
          d="M60 128C83 124 79 93 102 90C125 87 116 56 141 52"
          stroke="#E6E1D6"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M60 128C83 124 79 93 102 90C125 87 116 56 141 52"
          stroke="#1C1917"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <circle cx="60" cy="128" r="3.8" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.8" />
        <circle cx="102" cy="90" r="3.4" fill="#C2410C" />
        <circle cx="141" cy="52" r="4.3" fill="#0F766E" />

        <circle
          cx="226"
          cy="90"
          r="51"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <path
          d="M190 126A51 51 0 1 1 262 126"
          stroke="#1C1917"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M252 46A51 51 0 0 1 270 116"
          stroke="#C2410C"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <g stroke="#78716C" strokeWidth="1.4" strokeLinecap="round">
          <line x1="226" y1="44" x2="226" y2="51" />
          <line x1="186" y1="69" x2="193" y2="73" />
          <line x1="266" y1="69" x2="259" y2="73" />
          <line x1="184" y1="102" x2="191" y2="100" />
        </g>
        <line
          x1="226"
          y1="90"
          x2="255"
          y2="64"
          stroke="#C2410C"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="226" cy="90" r="4.5" fill="#1C1917" />
      </svg>
    );
  }

  if (appId === 'ticket-to-ride-europe') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect
          x="54"
          y="24"
          width="212"
          height="132"
          rx="6"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <g stroke="#EAE5DC" strokeWidth="1">
          <line x1="107" y1="24" x2="107" y2="156" />
          <line x1="160" y1="24" x2="160" y2="156" />
          <line x1="213" y1="24" x2="213" y2="156" />
          <line x1="54" y1="68" x2="266" y2="68" />
          <line x1="54" y1="112" x2="266" y2="112" />
        </g>
        <path
          d="M84 124L126 76L176 88L232 48"
          stroke="#C2410C"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M92 52L126 76L148 128L226 116"
          stroke="#0F766E"
          strokeWidth="2.1"
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M176 88L226 116"
          stroke="#1C1917"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="84" cy="124" r="5" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.8" />
        <circle cx="126" cy="76" r="5.5" fill="#C2410C" />
        <circle cx="176" cy="88" r="5" fill="#0F766E" />
        <circle cx="232" cy="48" r="5.5" fill="#FAF8F4" stroke="#C2410C" strokeWidth="2" />
        <circle cx="92" cy="52" r="4" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.6" />
        <circle cx="148" cy="128" r="4.2" fill="#1C1917" />
        <circle cx="226" cy="116" r="4.5" fill="#FAF8F4" stroke="#0F766E" strokeWidth="1.8" />
      </svg>
    );
  }

  if (appId === 'carcassonne-bigbox') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <g transform="translate(88 26)">
          <rect x="0" y="0" width="46" height="42" rx="3" fill="#FAF8F4" stroke="#CFC7B8" strokeWidth="1.5" />
          <rect x="49" y="0" width="46" height="42" rx="3" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.6" />
          <rect x="49" y="45" width="46" height="42" rx="3" fill="#FAF8F4" stroke="#CFC7B8" strokeWidth="1.5" />
          <rect x="98" y="45" width="46" height="42" rx="3" fill="#FAF8F4" stroke="#CFC7B8" strokeWidth="1.5" />
          <rect x="49" y="90" width="46" height="42" rx="3" fill="#FAF8F4" stroke="#CFC7B8" strokeWidth="1.5" />
          <path d="M49 21H95" stroke="#0F766E" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M72 21V132" stroke="#C2410C" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M72 66H144" stroke="#C2410C" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M10 0C16 14 30 14 36 0" fill="#F2EFE9" stroke="#1C1917" strokeWidth="1.5" />
          <path d="M98 54C112 60 112 72 98 78" fill="#F2EFE9" stroke="#1C1917" strokeWidth="1.5" />
          <circle cx="72" cy="66" r="6" fill="#FAF8F4" stroke="#1C1917" strokeWidth="1.8" />
          <path
            d="M23 18C25.2 18 26 20 25.4 21.5L29 23.2C30 23.7 29.8 25.6 28.5 25.6H26.2L28 32H24.6L23 28.6L21.4 32H18L19.8 25.6H17.5C16.2 25.6 16 23.7 17 23.2L20.6 21.5C20 20 20.8 18 23 18Z"
            fill="#C2410C"
          />
        </g>
      </svg>
    );
  }

  if (appId === 'inch-of-shade') {
    return (
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200 ease-out"
        fill="none"
        aria-hidden="true"
      >
        <PlateRegistrationMarks />
        <rect
          x="64"
          y="30"
          width="192"
          height="120"
          rx="6"
          fill="#FAF8F4"
          stroke="#CFC7B8"
          strokeWidth="1.5"
        />
        <g stroke="#EAE5DC" strokeWidth="1">
          <line x1="96" y1="30" x2="96" y2="150" />
          <line x1="128" y1="30" x2="128" y2="150" />
          <line x1="160" y1="30" x2="160" y2="150" />
          <line x1="192" y1="30" x2="192" y2="150" />
          <line x1="224" y1="30" x2="224" y2="150" />
          <line x1="64" y1="60" x2="256" y2="60" />
          <line x1="64" y1="90" x2="256" y2="90" />
          <line x1="64" y1="120" x2="256" y2="120" />
        </g>
        {/* 屋檐 */}
        <rect x="64" y="30" width="192" height="30" fill="#EAE5DC" />
        <line x1="64" y1="60" x2="256" y2="60" stroke="#1C1917" strokeWidth="1.5" />
        {/* 午后的影子：向东延伸 */}
        <rect x="176" y="90" width="64" height="30" fill="#1C1917" opacity="0.12" />
        {/* 影子转动的轨迹：西 → 北 → 东 */}
        <path
          d="M132 105A44 44 0 0 1 220 105"
          stroke="#0F766E"
          strokeWidth="1.4"
          strokeDasharray="4 3.5"
        />
        <polyline
          points="213,99 220,105 225,97"
          stroke="#0F766E"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 晷针 */}
        <rect x="167" y="96" width="18" height="18" rx="2" fill="#1C1917" />
        {/* 太阳 */}
        <circle cx="114" cy="135" r="7" fill="#C2410C" />
        {/* 猫在影子里 */}
        <circle cx="208" cy="105" r="5.2" fill="#C2410C" />
        <circle cx="208" cy="105" r="9.5" stroke="#C2410C" strokeWidth="1.2" opacity="0.5" />
        {/* 鱼干架 */}
        <path
          d="M232 128L240 140H224L232 128Z"
          stroke="#1C1917"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return <ProceduralCoverGraphic app={app} />;
};

export const HomeHub: React.FC<HomeHubProps> = ({ apps, onLaunchApp }) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<CatalogViewMode>(() =>
    loadInitialViewMode(),
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const validIds = useMemo(() => apps.map((app) => app.id), [apps]);
  const [hubSnapshot, setHubSnapshot] = useState(() => readHubSnapshot(validIds));

  useEffect(() => {
    const refreshSnapshot = () => {
      setHubSnapshot(readHubSnapshot(validIds));
    };
    refreshSnapshot();
    window.addEventListener('focus', refreshSnapshot);
    window.addEventListener('storage', refreshSnapshot);
    return () => {
      window.removeEventListener('focus', refreshSnapshot);
      window.removeEventListener('storage', refreshSnapshot);
    };
  }, [validIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * Dynamically derive populated categories from APP_REGISTRY so adding future games
   * under existing or new categories automatically updates tabs with zero code edits.
   */
  const dynamicCategories = useMemo(() => {
    const counts = new Map<AppCategory, number>();
    for (const app of apps) {
      counts.set(app.category, (counts.get(app.category) ?? 0) + 1);
    }
    const items: Array<{ id: CategoryFilter; label: string; count: number }> = [
      { id: 'all', label: '全部', count: apps.length },
    ];
    for (const cat of APP_CATEGORY_ORDER) {
      const count = counts.get(cat) ?? 0;
      if (count > 0) {
        items.push({
          id: cat,
          label: APP_CATEGORY_LABELS[cat],
          count,
        });
      }
    }
    return items;
  }, [apps]);

  // Display order is owned by the hub, not by APP_REGISTRY order: a per-visitor shuffle that
  // re-rolls daily (stable within the day), or newest first. Seed and day are fixed per mount.
  const [sortMode, setSortMode] = useState<CatalogSortMode>(() => readSortMode(getBrowserStorage()));
  const [shuffleSeed] = useState(() => readOrCreateShuffleSeed(getBrowserStorage()));
  const [dayKey] = useState(() => localDayKey());
  const orderedApps = useMemo(
    () => orderCatalog(apps, sortMode, shuffleSeed, dayKey),
    [apps, sortMode, shuffleSeed, dayKey],
  );

  const handleSelectSortMode = (mode: CatalogSortMode) => {
    setSortMode(mode);
    writeSortMode(mode, getBrowserStorage());
  };

  const filteredApps = useMemo(
    () => filterWorkspaceApps(orderedApps, categoryFilter, searchQuery),
    [orderedApps, categoryFilter, searchQuery],
  );

  const lastPlayedApp = useMemo(() => {
    if (!hubSnapshot.lastPlayedAppId) return null;
    return apps.find((app) => app.id === hubSnapshot.lastPlayedAppId) ?? null;
  }, [apps, hubSnapshot.lastPlayedAppId]);

  const savedAppsCount = useMemo(
    () => Object.keys(hubSnapshot.progressByAppId).length,
    [hubSnapshot.progressByAppId],
  );

  const handleSelectViewMode = (mode: CatalogViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const handlePrimaryAction = () => {
    if (lastPlayedApp) {
      onLaunchApp(lastPlayedApp.id);
      return;
    }
    const pool = filteredApps.length > 0 ? filteredApps : apps;
    if (pool.length === 0) return;
    const randomPick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
    onLaunchApp(randomPick.id);
  };

  const handleResetFilters = () => {
    setCategoryFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="min-h-dvh w-full bg-[#FAF8F4] text-[#1C1917] flex flex-col">
      {/* 3-Zone Swiss Arcade Top Bar */}
      <header className="w-full border-b border-[#E4DFD5] bg-[#FAF8F4]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-15 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              handleResetFilters();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="inline-flex items-baseline gap-1 text-lg font-bold tracking-tight text-[#1C1917] hover:text-[#C2410C] focus:outline-none focus-visible:text-[#C2410C] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="font-display text-[22px] leading-none tracking-tight">43</span>
            <span className="font-display text-[20px] leading-none text-[#C2410C]">gg</span>
            <span className="ml-1 text-sm font-bold text-[#1C1917]">小游戏</span>
          </button>

          <nav
            aria-label="桌面游戏分类导航"
            className="hidden md:flex items-center gap-1 p-1 rounded-lg bg-[#EFECE5] max-w-full overflow-x-auto"
          >
            {dynamicCategories.map((item) => {
              const active = categoryFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(item.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:border-[#C2410C] focus-visible:text-[#1C1917] ${
                    active
                      ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                      : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="ml-1 text-[11px] tabular-nums text-[#78716C]">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              data-testid="hub-primary-action"
              onClick={handlePrimaryAction}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#1C1917] hover:bg-[#C2410C] border border-transparent focus:outline-none focus-visible:bg-[#C2410C] text-xs font-semibold text-[#FAF8F4] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>{lastPlayedApp ? `继续 · ${lastPlayedApp.title}` : '随机开一局'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Scalable Portal Directory */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
        <section className="mb-6 pb-5 border-b border-[#E4DFD5]">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className="text-xl sm:text-[26px] font-bold tracking-tight text-[#1C1917] leading-snug [text-wrap:balance]">
                免安装点开即玩的独立小游戏大厅
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#57534E]">
                桌面和手机都能玩，进度自动保存在本地浏览器。也欢迎
                <a
                  href={CONTRIBUTING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 font-medium text-[#1C1917] underline decoration-[#D6D0C4] underline-offset-[3px] hover:text-[#C2410C] hover:decoration-[#C2410C] focus:outline-none focus-visible:text-[#C2410C] focus-visible:decoration-[#C2410C] transition-colors"
                >
                  投稿你的游戏
                </a>
                。
              </p>
            </div>

            {/* Search & Grid/List View Controls for N-Game Scalability */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <Search
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  data-testid="hub-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索游戏或玩法"
                  aria-label="搜索游戏名称或玩法"
                  aria-keyshortcuts="/"
                  className="w-full h-9 pl-8 pr-8 rounded-lg bg-white border border-[#E4DFD5] hover:border-[#CFC7B8] focus:outline-none focus:border-[#C2410C] text-xs text-[#1C1917] placeholder:text-[#A8A29E] transition-colors"
                />
                {searchQuery.length === 0 && (
                  <kbd
                    aria-hidden="true"
                    className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 h-5 min-w-5 px-1 items-center justify-center rounded border border-[#E4DFD5] bg-[#FAF8F4] font-mono text-[11px] leading-none text-[#78716C] pointer-events-none"
                  >
                    /
                  </kbd>
                )}
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    aria-label="清空搜索词"
                    title="清空搜索词"
                    className="w-6 h-6 flex items-center justify-center rounded text-[#78716C] hover:text-[#1C1917] focus:outline-none focus-visible:text-[#C2410C] absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="排列顺序"
                className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#EFECE5] shrink-0"
              >
                {SORT_MODE_OPTIONS.map((option) => {
                  const active = sortMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      data-testid={`sort-mode-${option.id}`}
                      title={option.hint}
                      aria-pressed={active}
                      onClick={() => handleSelectSortMode(option.id)}
                      className={`h-7 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C] ${
                        active
                          ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                          : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label="目录排列视图"
                className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#EFECE5] shrink-0"
              >
                <button
                  type="button"
                  data-testid="view-mode-grid"
                  aria-label="卡片网格视图"
                  title="卡片网格视图"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => handleSelectViewMode('grid')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C] ${
                    viewMode === 'grid'
                      ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                      : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid="view-mode-list"
                  aria-label="紧凑列表视图"
                  title="紧凑列表视图"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => handleSelectViewMode('list')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C] ${
                    viewMode === 'list'
                      ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                      : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile & Narrow-Viewport Category Filter Strip */}
          <div
            role="group"
            aria-label="移动游戏分类筛选"
            className="md:hidden mt-4 flex items-center gap-1 p-1 rounded-lg bg-[#EFECE5] overflow-x-auto"
          >
            {dynamicCategories.map((item) => {
              const active = categoryFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(item.id)}
                  className={`flex-1 min-w-fit px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:border-[#C2410C] focus-visible:text-[#1C1917] ${
                    active
                      ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                      : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="ml-1 text-[11px] tabular-nums text-[#78716C]">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Empty Search / Filter Result State */}
        {filteredApps.length === 0 ? (
          <section
            aria-label="空筛选提示"
            className="py-16 px-6 bg-white border border-[#E4DFD5] rounded-xl text-center"
          >
            <p className="text-sm font-semibold text-[#1C1917]">
              没有找到匹配当前筛选条件的小游戏
            </p>
            <p className="mt-1 text-xs text-[#78716C]">
              可以尝试更换关键词，或切回全部分类查看所有已收录作品。
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center px-3.5 py-1.5 rounded-md bg-[#F2EFE9] hover:bg-[#E7E2D8] border border-[#D6D0C4] focus:outline-none focus-visible:border-[#C2410C] text-xs font-semibold text-[#1C1917] transition-colors cursor-pointer"
            >
              显示全部游戏 ({apps.length})
            </button>
          </section>
        ) : viewMode === 'grid' ? (
          /* Uniform Modular Auto-Scaling Grid: Scales seamlessly from 1 to 50+ games */
          <section aria-label="游戏作品网格">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredApps.map((app) => {
                const progressText = hubSnapshot.progressByAppId[app.id] ?? null;
                const isLastPlayed = lastPlayedApp?.id === app.id;

                return (
                  <article
                    key={app.id}
                    data-testid={`app-card-${app.id}`}
                    className="flex"
                  >
                    <button
                      type="button"
                      data-testid={`launch-${app.id}`}
                      onClick={() => onLaunchApp(app.id)}
                      className="group w-full text-left flex flex-col bg-white border border-[#E4DFD5] hover:border-[#A8A29E] focus:outline-none focus-visible:border-[#C2410C] rounded-xl overflow-hidden transition-colors duration-150 cursor-pointer"
                    >
                      <div className="w-full aspect-[16/9] bg-[#F3F0EA] border-b border-[#EFECE5] flex items-center justify-center p-3.5 overflow-hidden">
                        <AppCoverGraphic app={app} />
                      </div>

                      <div className="w-full p-4 flex-1 flex flex-col justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-[#78716C] min-w-0">
                            <span className="font-medium text-[#57534E] shrink-0">
                              {app.techLabel}
                            </span>
                            <span aria-hidden="true" className="shrink-0">
                              ·
                            </span>
                            <span className="truncate">{app.subtitle}</span>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-3">
                            <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-[#1C1917] group-hover:text-[#C2410C] transition-colors truncate">
                              {app.title}
                            </h2>

                            <ArrowUpRight
                              aria-hidden="true"
                              className="w-4 h-4 text-[#A8A29E] group-hover:text-[#C2410C] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150 shrink-0"
                            />
                          </div>

                          <p className="mt-1.5 text-xs leading-relaxed text-[#57534E] line-clamp-2">
                            {app.description}
                          </p>

                          <p className="mt-2 text-[11px] text-[#78716C] truncate">
                            作者 <span className="text-[#57534E]">{app.author}</span>
                            <span aria-hidden="true"> · </span>
                            模型 <span className="text-[#57534E]">{app.model}</span>
                          </p>
                        </div>

                        <div className="pt-2.5 border-t border-[#F2EFE9] flex items-center justify-between gap-3 text-xs">
                          {progressText ? (
                            <span className="font-medium text-[#C2410C] tabular-nums truncate">
                              {progressText}
                            </span>
                          ) : (
                            <span className="text-[#78716C] truncate">
                              {app.highlights.join(' · ')}
                            </span>
                          )}

                          <span className="font-medium text-[#57534E] group-hover:text-[#1C1917] transition-colors shrink-0">
                            {isLastPlayed
                              ? '上次游玩'
                              : progressText
                                ? '继续挑战'
                                : '开始游戏'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* High-Density Swiss Index List View: Ideal as catalog grows to dozens of games */
          <section
            aria-label="游戏作品列表"
            className="bg-white border border-[#E4DFD5] rounded-xl divide-y divide-[#EFECE5] overflow-hidden"
          >
            {filteredApps.map((app) => {
              const progressText = hubSnapshot.progressByAppId[app.id] ?? null;
              const isLastPlayed = lastPlayedApp?.id === app.id;

              return (
                <article key={app.id} data-testid={`app-card-${app.id}`}>
                  <button
                    type="button"
                    data-testid={`launch-${app.id}`}
                    onClick={() => onLaunchApp(app.id)}
                    className="group w-full px-4 sm:px-5 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[#FAF8F4] focus:outline-none focus-visible:bg-[#FAF8F4] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-20 aspect-[16/10] rounded-lg bg-[#F3F0EA] border border-[#E4DFD5] p-1.5 shrink-0 overflow-hidden hidden sm:flex items-center justify-center">
                        <AppCoverGraphic app={app} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h2 className="text-sm sm:text-base font-bold text-[#1C1917] group-hover:text-[#C2410C] transition-colors truncate">
                            {app.title}
                          </h2>
                          <span className="text-xs text-[#78716C] shrink-0">
                            · {app.techLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#57534E] truncate">
                          {app.description}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#78716C] truncate">
                          作者 {app.author} · 模型 {app.model}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {progressText && (
                        <span className="hidden md:inline text-xs font-medium text-[#C2410C] tabular-nums">
                          {progressText}
                        </span>
                      )}
                      <span className="text-xs font-medium text-[#57534E] group-hover:text-[#1C1917] whitespace-nowrap">
                        {isLastPlayed ? '继续上次' : '开始'}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="w-4 h-4 text-[#A8A29E] group-hover:text-[#C2410C] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
                      />
                    </div>
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <footer className="w-full border-t border-[#E4DFD5]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#78716C] tabular-nums">
          <span>
            当前收录 {apps.length} 款作品
            {savedAppsCount > 0 ? ` · 本机已存 ${savedAppsCount} 款进度` : ''}
          </span>
          <nav aria-label="项目链接" className="flex items-center gap-4">
            <a
              href={CONTRIBUTING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1C1917] focus:outline-none focus-visible:text-[#C2410C] transition-colors"
            >
              投稿指南
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1C1917] focus:outline-none focus-visible:text-[#C2410C] transition-colors"
            >
              GitHub 源码
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
};
