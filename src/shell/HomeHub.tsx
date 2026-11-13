import React, { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { AppCategory, WorkspaceAppEntry } from '../apps/registry.ts';

interface HomeHubProps {
  apps: ReadonlyArray<WorkspaceAppEntry>;
  onLaunchApp: (appId: string) => void;
}

type CategoryFilter = 'all' | AppCategory;

const AppCoverGraphic: React.FC<{ appId: string }> = ({ appId }) => {
  if (appId === 'astral-orrery') {
    return (
      <svg
        viewBox="0 0 240 150"
        className="w-full h-full"
        fill="none"
        aria-hidden="true"
      >
        {/* Minimalist Swiss Astronomical Orrery Dial */}
        <circle
          cx="120"
          cy="76"
          r="50"
          fill="#FAF8F4"
          stroke="#D6D0C4"
          strokeWidth="1.5"
        />
        <circle
          cx="120"
          cy="76"
          r="35"
          stroke="#E4DFD5"
          strokeWidth="1.25"
        />
        <circle
          cx="120"
          cy="76"
          r="20"
          stroke="#1C1917"
          strokeWidth="1.4"
        />
        {/* 12-o'clock Meridian Resonance Axis */}
        <line
          x1="120"
          y1="20"
          x2="120"
          y2="76"
          stroke="#C2410C"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="64"
          y1="76"
          x2="176"
          y2="76"
          stroke="#E7E2D8"
          strokeWidth="1"
        />
        {/* Aligned Syzygy Planets & Central Core */}
        <circle cx="120" cy="41" r="4.5" fill="#0F766E" />
        <circle cx="120" cy="56" r="4" fill="#C2410C" />
        <circle
          cx="155"
          cy="76"
          r="4"
          fill="#FAF8F4"
          stroke="#1C1917"
          strokeWidth="1.75"
        />
        <circle cx="120" cy="76" r="6" fill="#1C1917" />
        <circle cx="120" cy="76" r="2.2" fill="#FAF8F4" />
      </svg>
    );
  }

  if (appId === 'lucky-landlord') {
    return (
      <svg
        viewBox="0 0 240 150"
        className="w-full h-full"
        fill="none"
        aria-hidden="true"
      >
        {/* Subtle 4x5 ledger grid */}
        <rect
          x="55"
          y="25"
          width="130"
          height="100"
          rx="6"
          fill="#FAF8F4"
          stroke="#D6D0C4"
          strokeWidth="1.5"
        />
        <line x1="87.5" y1="25" x2="87.5" y2="125" stroke="#E7E2D8" strokeWidth="1" />
        <line x1="120" y1="25" x2="120" y2="125" stroke="#E7E2D8" strokeWidth="1" />
        <line x1="152.5" y1="25" x2="152.5" y2="125" stroke="#E7E2D8" strokeWidth="1" />
        <line x1="55" y1="58.3" x2="185" y2="58.3" stroke="#E7E2D8" strokeWidth="1" />
        <line x1="55" y1="91.6" x2="185" y2="91.6" stroke="#E7E2D8" strokeWidth="1" />

        {/* Highlighted vermilion gold-shop cell */}
        <rect
          x="91"
          y="62"
          width="25.5"
          height="26"
          rx="3"
          fill="#C2410C"
        />
        <circle cx="103.75" cy="75" r="5.5" fill="#FAF8F4" />

        {/* Minimalist geometric tokens */}
        <circle cx="71.25" cy="41.5" r="6" stroke="#1C1917" strokeWidth="1.75" />
        <rect
          x="130.5"
          y="35.5"
          width="12"
          height="12"
          rx="2.5"
          stroke="#1C1917"
          strokeWidth="1.75"
        />
        <path
          d="M168.75 68L175.5 80H162L168.75 68Z"
          stroke="#1C1917"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="136.25" cy="108.3" r="5.5" fill="#1C1917" />
      </svg>
    );
  }

  if (appId === 'chrono-stage') {
    return (
      <svg
        viewBox="0 0 240 150"
        className="w-full h-full"
        fill="none"
        aria-hidden="true"
      >
        {/* Minimalist Braun-inspired tachometer dial */}
        <circle
          cx="120"
          cy="78"
          r="46"
          fill="#FAF8F4"
          stroke="#D6D0C4"
          strokeWidth="1.5"
        />
        <path
          d="M87.5 110.5A46 46 0 1 1 152.5 110.5"
          stroke="#1C1917"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M144 42A46 46 0 0 1 159 102"
          stroke="#C2410C"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Dial ticks */}
        <line x1="120" y1="36" x2="120" y2="43" stroke="#78716C" strokeWidth="1.5" />
        <line x1="83" y1="62" x2="89" y2="65" stroke="#78716C" strokeWidth="1.5" />
        <line x1="157" y1="62" x2="151" y2="65" stroke="#78716C" strokeWidth="1.5" />
        {/* Crisp needle */}
        <line
          x1="120"
          y1="78"
          x2="146"
          y2="54"
          stroke="#C2410C"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="120" cy="78" r="4" fill="#1C1917" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 240 150"
      className="w-full h-full"
      fill="none"
      aria-hidden="true"
    >
      {/* Topographic stage card */}
      <rect
        x="55"
        y="25"
        width="130"
        height="100"
        rx="6"
        fill="#FAF8F4"
        stroke="#D6D0C4"
        strokeWidth="1.5"
      />
      {/* Subtle contour lines */}
      <path
        d="M65 108C88 104 94 74 118 72C142 70 148 44 175 40"
        stroke="#E4DFD5"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Point-to-point stage spline */}
      <path
        d="M74 104C95 102 98 76 120 75C142 74 145 48 166 46"
        stroke="#1C1917"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Start & finish markers */}
      <circle cx="74" cy="104" r="4" fill="#FAF8F4" stroke="#1C1917" strokeWidth="2" />
      <circle cx="166" cy="46" r="4.5" fill="#0F766E" />
    </svg>
  );
};

export const HomeHub: React.FC<HomeHubProps> = ({ apps, onLaunchApp }) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filteredApps = useMemo(() => {
    if (categoryFilter === 'all') return apps;
    return apps.filter((app) => app.category === categoryFilter);
  }, [apps, categoryFilter]);

  return (
    <div className="min-h-dvh w-full bg-[#FAF8F4] text-[#1C1917] flex flex-col">
      {/* Minimal Header */}
      <header className="w-full border-b border-[#E7E2D8]">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between gap-6">
          <span className="text-base font-bold tracking-tight text-[#1C1917] whitespace-nowrap shrink-0">
            gaistudio
          </span>

          <div
            role="group"
            aria-label="应用分类筛选"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#EFECE5]"
          >
            {(
              [
                ['all', '全部'],
                ['incremental', '增量'],
                ['strategy', '策略'],
                ['racing', '竞速'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={categoryFilter === id}
                onClick={() => setCategoryFilter(id)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:border-[#C2410C] focus-visible:text-[#1C1917] ${
                  categoryFilter === id
                    ? 'bg-white border-[#E4DFD5] text-[#1C1917]'
                    : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Pure Directory Grid */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 sm:px-10 py-10 sm:py-14">
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            apps.length >= 3 ? 'lg:grid-cols-3' : ''
          } gap-6`}
        >
          {filteredApps.map((app) => (
            <article
              key={app.id}
              data-testid={`app-card-${app.id}`}
              className="group bg-white border border-[#E4DFD5] hover:border-[#A8A29E] focus-within:border-[#C2410C] rounded-xl overflow-hidden transition-colors"
            >
              <button
                type="button"
                data-testid={`launch-${app.id}`}
                onClick={() => onLaunchApp(app.id)}
                className="w-full h-full text-left flex flex-col cursor-pointer focus:outline-none"
              >
                <div className="w-full aspect-[16/10] bg-[#F3F0EA] border-b border-[#EFECE5] flex items-center justify-center p-4">
                  <AppCoverGraphic appId={app.id} />
                </div>

                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-[#1C1917] truncate">
                      {app.title}
                    </h2>
                    <p className="text-xs text-[#78716C] mt-1 truncate">
                      {app.subtitle}
                    </p>
                  </div>

                  <ArrowUpRight
                    aria-hidden="true"
                    className="w-4 h-4 text-[#A8A29E] group-hover:text-[#1C1917] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150 shrink-0"
                  />
                </div>
              </button>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
};
