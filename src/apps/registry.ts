import type { ComponentType } from 'react';

export type AppRuntimeKind = 'react-lazy' | 'iframe';

export type AppAccent = 'amber' | 'cyan' | 'emerald' | 'rose';

export type AppCategory =
  | 'strategy'
  | 'action'
  | 'incremental'
  | 'racing'
  | 'puzzle'
  | 'roguelike'
  | 'simulation'
  | 'arcade';

export const APP_CATEGORY_ORDER: ReadonlyArray<AppCategory> = [
  'strategy',
  'action',
  'incremental',
  'racing',
  'puzzle',
  'roguelike',
  'simulation',
  'arcade',
];

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  strategy: '策略',
  action: '动作',
  incremental: '增量',
  racing: '竞速',
  puzzle: '解谜',
  roguelike: '肉鸽',
  simulation: '模拟',
  arcade: '街机',
};

export interface WorkspaceAppEntry {
  /** Stable slug used in URL routing (`?app=<id>`) and directory naming */
  id: string;
  /** Primary display title shown on the Home Hub card and top nav bar */
  title: string;
  /** Concise secondary label */
  subtitle: string;
  /** Short description for the Home Hub card */
  description: string;
  /** Creator credited on the Home Hub card (GitHub handle or display name) */
  author: string;
  /** AI model(s) used to build the game, credited on the Home Hub card, e.g. `Gemini 4 Carbon` */
  model: string;
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
 * Single registration list for all mini-games hosted inside the 43gg portal shell.
 *
 * Adding a new game:
 * - React game: place component under `src/apps/<slug>/`, then add one entry with `kind: 'react-lazy'` and `loader`.
 * - Static HTML/JS game: place folder under `apps/<slug>/` with `index.html`, then add one entry with `kind: 'iframe'` and `entryPath`.
 * The 43gg HomeHub automatically derives category tabs, search indexing, grid/list layout, and a procedural cover fallback.
 */
export const APP_REGISTRY: WorkspaceAppEntry[] = [
  {
    id: 'xuanji-breach',
    title: '璇玑破阵',
    subtitle: '青铜罗盘移星 · 全明牌立体沙盘战棋',
    description: '三尊青铜神机协同、中央璇玑内环 90° 扭转敌方弹道、水脉导电与地形连锁绝杀。',
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
    techLabel: '沙盘战棋',
    tags: ['战棋策略'],
    category: 'strategy',
    accent: 'emerald',
    kind: 'react-lazy',
    loader: () => import('./xuanji-breach/XuanjiBreachApp.tsx'),
    sourceDir: 'src/apps/xuanji-breach',
  },
  {
    id: 'ink-blade',
    title: '墨刃：一闪',
    subtitle: '水墨瞬身弹反剑戟动作坊',
    description: '心眼慢镜刀路推演、击杀即刻一闪刷新、刹那弹反破甲与十二刀铭秘传。',
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
    techLabel: '瞬身动作',
    tags: ['剑戟动作'],
    category: 'action',
    accent: 'rose',
    kind: 'react-lazy',
    loader: () => import('./ink-blade/InkBladeApp.tsx'),
    sourceDir: 'src/apps/ink-blade',
  },
  {
    id: 'astral-orrery',
    title: '天枢浑仪',
    subtitle: '发条星轨共鸣增量工坊',
    description: '五曜子午交汇、十二星宫棱镜构筑、朔望连珠阶乘爆发与星盘转生。',
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
    techLabel: '物理增量',
    tags: ['放置构筑'],
    category: 'incremental',
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./astral-orrery/AstralOrreryApp.tsx'),
    sourceDir: 'src/apps/astral-orrery',
  },
  {
    id: 'lucky-landlord',
    title: '吉星包租公',
    subtitle: '桌面收租构筑游戏',
    description: '四乘五账本控盘、格子装修与三连升星构筑。',
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
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
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
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

export function filterWorkspaceApps(
  apps: ReadonlyArray<WorkspaceAppEntry>,
  category: 'all' | AppCategory,
  query: string,
): ReadonlyArray<WorkspaceAppEntry> {
  const byCategory =
    category === 'all' ? apps : apps.filter((app) => app.category === category);
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return byCategory;

  return byCategory.filter((app) => {
    const categoryLabel = APP_CATEGORY_LABELS[app.category] ?? '';
    const haystack = [
      app.id,
      app.title,
      app.subtitle,
      app.description,
      app.techLabel,
      app.author,
      app.model,
      categoryLabel,
      ...app.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}
