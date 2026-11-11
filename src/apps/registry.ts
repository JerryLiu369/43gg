import type { ComponentType } from 'react';

export type AppRuntimeKind = 'react-lazy' | 'iframe';

export type AppAccent = 'amber' | 'cyan' | 'emerald' | 'rose';

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
  /** Compact feature badges */
  tags: string[];
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
    id: 'chrono-stage',
    title: 'CHRONO STAGE',
    subtitle: '硬核 3D 点对点拉力模拟 · React 懒加载应用',
    description:
      '对标拟真手感的四轮独立悬挂与连续滑移率轮胎物理，含手自序列挡、半联动离合、车内后视镜、语音/屏幕路书与 4 条多气象赛段。',
    techLabel: 'React 19 · TypeScript · WebGL',
    tags: ['120Hz Physics', '4 Stages', 'Service Park', 'Gamepad & Touch'],
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./chrono-stage/ChronoStageApp.tsx'),
    sourceDir: 'src/apps/chrono-stage',
  },
  {
    id: 'ds-stage',
    title: 'STAGE',
    subtitle: '纯静态程序化拉力赛 · Iframe 隔离沙盒',
    description:
      '零构建原生 JS 与 WebGL 1.0 点对点计时赛，曲率语法生成 6 条赛段、240Hz 固定步长物理、13 部位独立损伤维修与幽灵车回放。',
    techLabel: 'Vanilla JS · WebGL 1.0 · Iframe',
    tags: ['240Hz Physics', '6 Stages', 'Procedural Audio', 'Ghost Replay'],
    accent: 'cyan',
    kind: 'iframe',
    entryPath: 'apps/ds-stage/index.html',
    sourceDir: 'apps/ds-stage',
  },
];

export function getAppById(id: string | null | undefined): WorkspaceAppEntry | null {
  if (!id) return null;
  const normalized = id.trim().toLowerCase();
  return APP_REGISTRY.find((entry) => entry.id === normalized) ?? null;
}
