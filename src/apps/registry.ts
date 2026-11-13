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
  /**
   * Author-written selling points shown on the card footer (joined with " · "), e.g.
   * `['四步实战指引', '三档难度', '触屏可玩']`. Keep it to 2–3 short items so it fits one line.
   */
  highlights: string[];
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
    id: 'inch-of-shade',
    title: '寸阴',
    subtitle: '日晷光影 · 橘猫只走阴凉的解谜',
    description: '推动时辰让影子转向，推花盆、借云影，带橘猫踩着阴凉在日落前叼到鱼干。',
    author: 'JerryLiu369',
    model: 'Claude Opus 5.5',
    highlights: ['二十关解谜', '四步实战指引', '三档难度'],
    techLabel: '光影解谜',
    tags: ['烧脑解谜', '推箱子'],
    category: 'puzzle',
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./inch-of-shade/InchOfShadeApp.tsx'),
    sourceDir: 'src/apps/inch-of-shade',
  },
  {
    id: 'moon-mirror',
    title: '月镜庭',
    subtitle: '月光折射机关 · 九庭光学解谜',
    description: '推移银镜、折转光路，用分光、跃迁与三色合束唤醒沉睡的花铃。',
    author: 'JerryLiu369',
    model: 'Kimi K3.1 Pro',
    highlights: ['九庭手工谜题', '真实最优解提示', '三档难度与触屏预演'],
    techLabel: '光学解谜',
    tags: ['光路解谜', '关卡'],
    category: 'puzzle',
    accent: 'cyan',
    kind: 'react-lazy',
    loader: () => import('./moon-mirror/MoonMirrorApp.tsx'),
    sourceDir: 'src/apps/moon-mirror',
  },
  {
    id: 'mistlight-voyage',
    title: '雾海折光',
    subtitle: '旋转镜塔，为群岛点亮归航的路',
    description: '在微缩海岛间反射、分流与汇聚双色光束，借潮汐改变航路，解开十二片海域。',
    author: 'JerryLiu369',
    model: 'GPT 6 Astra',
    highlights: ['十二道光路谜题', '潮汐与双色合光', '整盘因果预演'],
    techLabel: '光路解谜',
    tags: ['光路解谜', '海岛', '镜塔', '潮汐'],
    category: 'puzzle',
    accent: 'cyan',
    kind: 'react-lazy',
    loader: () => import('./mistlight-voyage/MistlightVoyageApp.tsx'),
    sourceDir: 'src/apps/mistlight-voyage',
  },
  {
    id: 'xuanji-breach',
    title: '璇玑破阵',
    subtitle: '青铜罗盘移星 · 全明牌立体沙盘战棋',
    description: '三尊青铜神机协同、中央璇玑内环 90° 扭转敌方弹道、水脉导电与地形连锁绝杀。',
    author: 'JerryLiu369',
    model: 'Gemini 4 Carbon',
    highlights: ['四步实战指引', '三档难度', '键鼠 / 触屏双端'],
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
    highlights: ['三步实战教学', '三档难度', '虚拟摇杆触屏操作'],
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
    highlights: ['五步实战带教', '三维星盘手册', '桌面 / 触屏双端'],
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
    highlights: ['四步实战带教', '多档难度', '全图鉴'],
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
    highlights: ['四步领航带教', '路书图解', '三档难度'],
    techLabel: '3D 竞速',
    tags: ['拟真竞速'],
    category: 'racing',
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./chrono-stage/ChronoStageApp.tsx'),
    sourceDir: 'src/apps/chrono-stage',
  },
  {
    id: 'ticket-to-ride-europe',
    title: '车票之旅：欧洲',
    subtitle: '欧洲铁路路线竞速 · 离线单机版',
    description: '收集车厢卡修筑横跨欧陆的铁路网，开凿隧道、乘渡轮、建车站并连通目的地车票，与 1–4 位电脑对手同台博弈。',
    author: 'JerryLiu369',
    model: 'Claude Opus 5.5',
    highlights: ['交互式新手导引', '三档电脑难度', '支持 1–4 对手'],
    techLabel: '版图策略',
    tags: ['铁路规划', '路线竞速', '单机对战'],
    category: 'strategy',
    accent: 'amber',
    kind: 'react-lazy',
    loader: () => import('./ticket-to-ride-europe/TicketToRideApp.tsx'),
    sourceDir: 'src/apps/ticket-to-ride-europe',
  },
  {
    id: 'carcassonne-bigbox',
    title: '卡卡颂：大盒版',
    subtitle: '中世纪版图拼接 · 11 扩展离线版',
    description: '抽牌拼放城池、道路、修道院与草地，派遣骑士、强盗、修士和农夫争夺多数控制权，支持 11 个扩展自由组合。',
    author: 'JerryLiu369',
    model: 'Claude Opus 5.5',
    highlights: ['11 扩展自由配', '三档深度推演 AI', '支持 1–5 对手'],
    techLabel: '版图拼接',
    tags: ['经典桌游', '区域控制', '单机对战'],
    category: 'strategy',
    accent: 'emerald',
    kind: 'react-lazy',
    loader: () => import('./carcassonne-bigbox/CarcassonneApp.tsx'),
    sourceDir: 'src/apps/carcassonne-bigbox',
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
      ...app.highlights,
      categoryLabel,
      ...app.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}
