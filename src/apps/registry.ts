import type { ComponentType } from 'react';

export type AppRuntimeKind = 'react-lazy' | 'iframe';

export type AppAccent = 'amber' | 'cyan' | 'emerald' | 'rose';

export type AppCategory = 'strategy' | 'racing';

export interface WorkspaceAppEntry {
  /** Stable slug used in URL routing (`?app=<id>`) and directory naming */
  id: string;
  /** Primary display title shown on the Home Hub card and top nav bar */
  title: string;
  /** Concise secondary label */
  subtitle: string;
  /** Short description for the Home Hub card */
  description: string;
  /** Stack badge shown on the card */
  techLabel: string;
  /** Compact feature descriptors */
  tags: string[];
  /** Functional domain category for directory filtering */
  category: AppCategory;
  /** Visual accent token */
  accent: AppAccent;
  /** Runtime isolation strategy */
  kind: AppRuntimeKind;
  /** Lazy dynamic importer for React sub-apps (`kind: 'react-lazy'`) */
  loader?: () => Promise<{ default: ComponentType }>;
  /** Relative HTML entry path for isolated static/sandboxed apps (`kind: 'iframe'`) */
  entryPath?: string;
  /** Repository directory where the app lives */
  sourceDir: string;
}

/**
 * Single registration list for all mini-apps hosted inside the unified gaistudio shell.
 *
 * Adding a new app:
 * - React app: place component under `src/apps/<slug>/`, then add one entry with `kind: 'react-lazy'` and `loader`.
 * - Static HTML/JS app: place folder under `apps/<slug>/` with `index.html`, then add one entry with `kind: 'iframe'` and `entryPath`.
 */
export const APP_REGISTRY: WorkspaceAppEntry[] = [
  {
    id: 'lucky-landlord',
    title: '吉星包租公',
    subtitle: '桌面收租构筑游戏',
    description: '四乘五账本控盘、格子装修与三连升星构筑。',
    techLabel: '策略构筑',
    tags: ['桌面策略'],
    category: 'strategy',
    accent: 'rose',
    kind: 'react-lazy',
    loader: () => import('./lucky-landlord/LuckyLandlordApp.tsx'),
    sourceDir: 'src/apps/lucky-landlord',
  },
  {
    id: 'chrono-stage',
    title: 'CHRONO STAGE',
    subtitle: '3D 拟真世界拉力锦标赛',
    description: '六站世界赛段、WRC 锦标赛模式、四轮悬挂物理与手自一体序列排挡。',
    techLabel: '3D 竞速',
    tags: ['拟真竞速'],
    category: 'racing',
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./chrono-stage/ChronoStageApp.tsx'),
    sourceDir: 'src/apps/chrono-stage',
  },
];

export function getAppById(id: string | null | undefined): WorkspaceAppEntry | null {
  if (!id) return null;
  const normalized = id.trim().toLowerCase();
  return APP_REGISTRY.find((entry) => entry.id === normalized) ?? null;
}
