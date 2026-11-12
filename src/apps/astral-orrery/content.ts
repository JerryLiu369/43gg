import type {
  AchievementId,
  AscensionNodeId,
  AutomatorActionId,
  AutomatorConditionId,
  AutomatorPresetId,
  AutomatorRule,
  CameraPresetId,
  CrucibleChamberId,
  DirectiveId,
  EraIndex,
  ModuleTypeId,
  OrbitalRingId,
  RingGearMode,
} from './types.ts';

export interface OrbitalRingDef {
  id: OrbitalRingId;
  index: number;
  name: string;
  shortName: string;
  subtitle: string;
  unlockCost: number;
  baseUpgradeCost: number;
  costGrowth: number;
  /** Base Meridian strike payout at Lv.1 */
  baseYield: number;
  /** Base angular speed in radians/sec */
  baseOmega: number;
  /** Normalized radius fraction [0.24 .. 0.76] & 3D world radius */
  radiusFrac: number;
  worldRadius: number;
  /** 3D Gyroscopic inclination angles in radians when gimbal3dMode is active */
  tiltX: number;
  tiltZ: number;
  colorHex: string;
  glowHex: string;
}

export const ORBITAL_RINGS: readonly OrbitalRingDef[] = [
  {
    id: 'mercury',
    index: 0,
    name: '第一轨 · 水星辰摆',
    shortName: '辰摆',
    subtitle: '高频内环擒纵，奠定基础子午节拍与通量泵浦',
    unlockCost: 0,
    baseUpgradeCost: 10,
    costGrowth: 1.15,
    baseYield: 8,
    baseOmega: 1.65,
    radiusFrac: 0.24,
    worldRadius: 1.72,
    tiltX: 0.26,
    tiltZ: -0.18,
    colorHex: '#D97706',
    glowHex: '#FBBF24',
  },
  {
    id: 'venus',
    index: 1,
    name: '第二轨 · 太白弦轮',
    shortName: '太白',
    subtitle: '与辰摆呈 3:2 泛音齿比，解锁双曜立体交汇连珠',
    unlockCost: 40,
    baseUpgradeCost: 60,
    costGrowth: 1.155,
    baseYield: 36,
    baseOmega: 1.1,
    radiusFrac: 0.37,
    worldRadius: 2.52,
    tiltX: -0.31,
    tiltZ: 0.22,
    colorHex: '#EAB308',
    glowHex: '#FEF08A',
  },
  {
    id: 'terra',
    index: 2,
    name: '第三轨 · 璇玑地仪',
    shortName: '璇玑',
    subtitle: '铜绿翡翠平衡陀螺，构筑三曜连珠与以太析出核心',
    unlockCost: 900,
    baseUpgradeCost: 1150,
    costGrowth: 1.165,
    baseYield: 260,
    baseOmega: 0.64,
    radiusFrac: 0.5,
    worldRadius: 3.34,
    tiltX: 0.22,
    tiltZ: 0.34,
    colorHex: '#0D9488',
    glowHex: '#5EEAD4',
  },
  {
    id: 'mars',
    index: 3,
    name: '第四轨 · 荧惑赤轮',
    shortName: '荧惑',
    subtitle: '重型朱砂惯性飞轮，跨线冲击释放巨量星芒通量',
    unlockCost: 24000,
    baseUpgradeCost: 30000,
    costGrowth: 1.17,
    baseYield: 2900,
    baseOmega: 0.43,
    radiusFrac: 0.63,
    worldRadius: 4.18,
    tiltX: -0.27,
    tiltZ: -0.29,
    colorHex: '#DC2626',
    glowHex: '#FCA5A5',
  },
  {
    id: 'jupiter',
    index: 4,
    name: '第五轨 · 岁星天冕',
    shortName: '岁星',
    subtitle: '外环巨型皇家天冕，五曜共面连珠引爆千倍奇点',
    unlockCost: 850000,
    baseUpgradeCost: 1100000,
    costGrowth: 1.175,
    baseYield: 38000,
    baseOmega: 0.28,
    radiusFrac: 0.76,
    worldRadius: 5.02,
    tiltX: 0.19,
    tiltZ: -0.24,
    colorHex: '#2563EB',
    glowHex: '#93C5FD',
  },
] as const;

export const RINGS_BY_ID: Record<OrbitalRingId, OrbitalRingDef> = {
  mercury: ORBITAL_RINGS[0],
  venus: ORBITAL_RINGS[1],
  terra: ORBITAL_RINGS[2],
  mars: ORBITAL_RINGS[3],
  jupiter: ORBITAL_RINGS[4],
};

export const RING_ORDER: readonly OrbitalRingId[] = [
  'mercury',
  'venus',
  'terra',
  'mars',
  'jupiter',
];

export interface RingGearModeDef {
  id: RingGearMode;
  label: string;
  shortLabel: string;
  effectText: string;
}

export const RING_GEAR_MODES: readonly RingGearModeDef[] = [
  {
    id: 'harmonic',
    label: '稳态重锤齿比',
    shortLabel: '重锤',
    effectText: '子午产出 ×1.40 · 星芒通量 ×1.35 · 转速 ×0.92',
  },
  {
    id: 'syzygy',
    label: '磁力锁相齿比',
    shortLabel: '锁相',
    effectText: '向领航轨耦合磁力 ×2.2 · 连珠判定角 +35%',
  },
  {
    id: 'blitz',
    label: '疾速掠宫齿比',
    shortLabel: '掠宫',
    effectText: '公转角速度 ×1.38 · 掠过十二星宫机关效能 ×1.45',
  },
] as const;

export interface CrucibleChamberDef {
  id: CrucibleChamberId;
  name: string;
  shortName: string;
  accentHex: string;
  baseFluxCost: number;
  costGrowth: number;
  summary: string;
  formulaHint: string;
}

export const CRUCIBLE_CHAMBERS: readonly CrucibleChamberDef[] = [
  {
    id: 'fusion',
    name: '曜火聚变釜',
    shortName: '曜火聚变',
    accentHex: '#F59E0B',
    baseFluxCost: 18,
    costGrowth: 1.62,
    summary: '将星芒通量压缩为恒星等离子流，指数放大全星轨子午与棱镜星辉产出。',
    formulaHint: '每阶提供独立 ×1.32 复合星辉乘区',
  },
  {
    id: 'dilation',
    name: '时隙曲率釜',
    shortName: '时隙曲率',
    accentHex: '#10B981',
    baseFluxCost: 24,
    costGrowth: 1.68,
    summary: '扭曲天球仪局部引力场，加速全体公转、发条回充与发条智械轮询主频。',
    formulaHint: '每阶全轨转速 +9% · 发条蓄能回充 +22% · 脉冲冷却缩短',
  },
  {
    id: 'crystallizer',
    name: '谐振结晶釜',
    shortName: '谐振结晶',
    accentHex: '#06B6D4',
    baseFluxCost: 30,
    costGrowth: 1.72,
    summary: '放大朔望连珠阶乘波峰与星芒通量析出率；满 2 阶后持续在炉底自发凝结以太结晶！',
    formulaHint: '每阶连珠倍率 +18% · 通量获取 +25% · Lv.2+ 自动凝练以太',
  },
] as const;

export const CRUCIBLE_BY_ID: Record<CrucibleChamberId, CrucibleChamberDef> = {
  fusion: CRUCIBLE_CHAMBERS[0],
  dilation: CRUCIBLE_CHAMBERS[1],
  crystallizer: CRUCIBLE_CHAMBERS[2],
};

export interface CameraPresetDef {
  id: CameraPresetId;
  label: string;
  hint: string;
}

export const CAMERA_PRESETS: readonly CameraPresetDef[] = [
  { id: 'overview', label: '全景天球', hint: '经典 45° 浑天全景，可自由拖拽缩放' },
  { id: 'meridian', label: '子午擒纵', hint: '近距凝视 12 点黄金子午激光门与连珠交汇' },
  { id: 'crucible', label: '以太星炉', hint: '下探底座三态炼金星炉与能量导管' },
  { id: 'zenith', label: '天穹俯瞰', hint: '正北朝上垂直星盘俯视，便于排布十二星宫' },
] as const;

export const ZODIAC_PALACES = [
  { index: 0, branch: '子', name: '玄枵 · 正北子午' },
  { index: 1, branch: '丑', name: '星纪 · 东北偏北' },
  { index: 2, branch: '寅', name: '析木 · 东北偏东' },
  { index: 3, branch: '卯', name: '大火 · 正东春分' },
  { index: 4, branch: '辰', name: '寿星 · 东南偏东' },
  { index: 5, branch: '巳', name: '鹑尾 · 东南偏南' },
  { index: 6, branch: '午', name: '鹑火 · 正南天顶' },
  { index: 7, branch: '未', name: '鹑首 · 西南偏南' },
  { index: 8, branch: '申', name: '实沈 · 西南偏西' },
  { index: 9, branch: '酉', name: '大梁 · 正西秋分' },
  { index: 10, branch: '戌', name: '降娄 · 西北偏西' },
  { index: 11, branch: '亥', name: '娵訾 · 西北偏北' },
] as const;

export interface ModuleDef {
  id: ModuleTypeId;
  name: string;
  shortName: string;
  unlockEra: EraIndex;
  baseCostLuminance: number;
  baseCostAether: number;
  accentHex: string;
  roleSummary: string;
  synergyHint: string;
}

export const MODULE_DEFS: readonly ModuleDef[] = [
  {
    id: 'prism',
    name: '聚光棱镜',
    shortName: '棱镜',
    unlockEra: 2,
    baseCostLuminance: 160,
    baseCostAether: 0,
    accentHex: '#F59E0B',
    roleSummary: '星体掠过该宫位时，立即折射 40%（每阶 +22%）子午线星辉产出',
    synergyHint: '相邻每有一座棱镜或音叉，折射倍率额外 +35%',
  },
  {
    id: 'mainspring',
    name: '发条增压轮',
    shortName: '增压',
    unlockEra: 2,
    baseCostLuminance: 240,
    baseCostAether: 0,
    accentHex: '#EA580C',
    roleSummary: '全轨道角速度常驻提升 +16% / 阶，加快子午撞击与过宫频率',
    synergyHint: '与时隙蓄能锚相邻时，该增压轮速度加成再 ×1.35',
  },
  {
    id: 'resonator',
    name: '共鸣音叉',
    shortName: '音叉',
    unlockEra: 2,
    baseCostLuminance: 380,
    baseCostAether: 0,
    accentHex: '#0D9488',
    roleSummary: '星体掠过时积蓄谐振充能；下次朔望连珠时每层充能提供 +28% 爆发乘区',
    synergyHint: '提升阶数可同时增加音叉充能上限（+6 上限 / 阶）与单次充能量',
  },
  {
    id: 'lens',
    name: '引力透镜',
    shortName: '透镜',
    unlockEra: 2,
    baseCostLuminance: 850,
    baseCostAether: 0,
    accentHex: '#6366F1',
    roleSummary: '自动牵引相邻星体趋向同相，并将子午连珠判定窗口拓宽 +2.6° / 阶',
    synergyHint: '安装 2 座以上引力透镜后，多星自然连珠概率大幅跃升',
  },
  {
    id: 'condenser',
    name: '以太凝华器',
    shortName: '凝华',
    unlockEra: 3,
    baseCostLuminance: 18000,
    baseCostAether: 0,
    accentHex: '#06B6D4',
    roleSummary: '星体高速掠过时析出稀有【以太结晶】，且连珠以太掉落 +45% / 阶',
    synergyHint: '与聚光棱镜相邻时，析出以太效率翻倍',
  },
  {
    id: 'chrono',
    name: '时隙蓄能锚',
    shortName: '时锚',
    unlockEra: 3,
    baseCostLuminance: 32000,
    baseCostAether: 3,
    accentHex: '#10B981',
    roleSummary: '即便在线游玩，每秒额外回充 +0.40s / 阶发条蓄能，支撑长效超频运转',
    synergyHint: '同时提升发条蓄能池容量上限 +180s / 阶',
  },
] as const;

export const MODULES_BY_ID: Record<ModuleTypeId, ModuleDef> = {
  prism: MODULE_DEFS[0],
  mainspring: MODULE_DEFS[1],
  resonator: MODULE_DEFS[2],
  lens: MODULE_DEFS[3],
  condenser: MODULE_DEFS[4],
  chrono: MODULE_DEFS[5],
};

export interface DirectiveDef {
  id: DirectiveId;
  name: string;
  era: EraIndex;
  costLuminance: number;
  costAether: number;
  description: string;
}

export const DIRECTIVES: readonly DirectiveDef[] = [
  {
    id: 'meridian_chime',
    name: '子午黄铜重锤',
    era: 1,
    costLuminance: 80,
    costAether: 0,
    description: '所有星轨跨越正北子午线时的基础星辉产出直接 ×2.0。',
  },
  {
    id: 'auto_impulse',
    name: '恒动擒纵钟摆',
    era: 1,
    costLuminance: 280,
    costAether: 0,
    description: '每 2.4 秒自动拨动擒纵、自动拦截流火彗星，并激活智械【精准擒纵指令】。',
  },
  {
    id: 'quadrant_unlock_8',
    name: '八方星盘扩建',
    era: 2,
    costLuminance: 2800,
    costAether: 0,
    description: '开启四隅宫位（共 8 个星宫插槽），并令所有已装模块效能 ×1.25。',
  },
  {
    id: 'phase_coupler',
    name: '磁力锁相游丝',
    era: 2,
    costLuminance: 12000,
    costAether: 0,
    description: '为各星环注入相位耦合磁力，星体将自动向同步角度靠拢，频繁触发多曜连珠。',
  },
  {
    id: 'syzygy_cascade',
    name: '朔望阶乘共振',
    era: 3,
    costLuminance: 120000,
    costAether: 6,
    description: '连珠倍率公式额外乘以 1.85^(连珠数-1)，且每次连珠额外凝结以太结晶。',
  },
  {
    id: 'quadrant_unlock_12',
    name: '周天十二宫全开',
    era: 3,
    costLuminance: 950000,
    costAether: 18,
    description: '解锁全部 12 个黄道星宫槽位；当装满 12 宫时全局星辉产出 ×3.0。',
  },
  {
    id: 'auto_architect',
    name: '高频差分智械核',
    era: 3,
    costLuminance: 3600000,
    costAether: 32,
    description: '将【发条智械】扩容至满编 6 条逻辑指令轨、轮询提速 3 倍，并解锁星宫自走镶嵌与自动重铸！',
  },
  {
    id: 'prime_ignition',
    name: '点亮浑天本源奇点',
    era: 4,
    costLuminance: 1_000_000_000_000,
    costAether: 250,
    description: '汇聚一万亿星辉与以太真髓，引燃中央天枢奇点，达成终章【浑天归一】！',
  },
] as const;

export const DIRECTIVES_BY_ID: Record<DirectiveId, DirectiveDef> = {
  meridian_chime: DIRECTIVES[0],
  auto_impulse: DIRECTIVES[1],
  quadrant_unlock_8: DIRECTIVES[2],
  phase_coupler: DIRECTIVES[3],
  syzygy_cascade: DIRECTIVES[4],
  quadrant_unlock_12: DIRECTIVES[5],
  auto_architect: DIRECTIVES[6],
  prime_ignition: DIRECTIVES[7],
};

export interface AutomatorConditionDef {
  id: AutomatorConditionId;
  label: string;
  hasThreshold: boolean;
  thresholdUnit: string;
  thresholdOptions: readonly number[];
}

export const AUTOMATOR_CONDITIONS: readonly AutomatorConditionDef[] = [
  {
    id: 'always',
    label: '常驻无条件（每拍就绪即检）',
    hasThreshold: false,
    thresholdUnit: '',
    thresholdOptions: [0],
  },
  {
    id: 'milestone_affordable',
    label: '当任一星轨可直达【轨频突破】',
    hasThreshold: false,
    thresholdUnit: '',
    thresholdOptions: [0],
  },
  {
    id: 'ring_roi_ready',
    label: '当最优性价比 (ROI) 星轨可购买',
    hasThreshold: false,
    thresholdUnit: '',
    thresholdOptions: [0],
  },
  {
    id: 'planets_near_meridian',
    label: '当进入子午金线扇区星体 ≥',
    hasThreshold: true,
    thresholdUnit: '颗',
    thresholdOptions: [1, 2, 3, 4],
  },
  {
    id: 'tension_above_pct',
    label: '当发条蓄能池余量占比 ≥',
    hasThreshold: true,
    thresholdUnit: '%',
    thresholdOptions: [40, 60, 75, 90],
  },
  {
    id: 'tension_below_pct',
    label: '当发条蓄能池余量占比 ≤',
    hasThreshold: true,
    thresholdUnit: '%',
    thresholdOptions: [10, 20, 35, 50],
  },
  {
    id: 'crucible_affordable',
    label: '当星芒通量足以升阶【以太星炉】',
    hasThreshold: false,
    thresholdUnit: '',
    thresholdOptions: [0],
  },
  {
    id: 'stardust_ready',
    label: '当重铸可获天枢星尘 ≥',
    hasThreshold: true,
    thresholdUnit: '星尘',
    thresholdOptions: [2, 5, 12, 25],
  },
] as const;

export const AUTOMATOR_CONDITIONS_BY_ID: Record<
  AutomatorConditionId,
  AutomatorConditionDef
> = {
  always: AUTOMATOR_CONDITIONS[0],
  milestone_affordable: AUTOMATOR_CONDITIONS[1],
  ring_roi_ready: AUTOMATOR_CONDITIONS[2],
  planets_near_meridian: AUTOMATOR_CONDITIONS[3],
  tension_above_pct: AUTOMATOR_CONDITIONS[4],
  tension_below_pct: AUTOMATOR_CONDITIONS[5],
  crucible_affordable: AUTOMATOR_CONDITIONS[6],
  stardust_ready: AUTOMATOR_CONDITIONS[7],
};

export interface AutomatorActionDef {
  id: AutomatorActionId;
  label: string;
  unlockHint?: string;
}

export const AUTOMATOR_ACTIONS: readonly AutomatorActionDef[] = [
  { id: 'unlock_next_ring', label: '自动唤醒下一条未开星轨' },
  { id: 'buy_milestone_ring', label: '狙击直达【轨频突破】星轨' },
  { id: 'buy_best_roi_ring', label: '按最优 Δ产率/花费 (ROI) 升阶' },
  {
    id: 'fire_perfect_impulse',
    label: '激发【精准擒纵】锁相暴击',
    unlockHint: '需敕令：恒动擒纵钟摆（或第 2 纪）',
  },
  { id: 'trigger_supernova', label: '释放【超新星坍缩脉冲】聚拢众星' },
  { id: 'upgrade_lowest_crucible', label: '均衡升阶【以太星炉】反应釜' },
  { id: 'engage_overdrive_max', label: '拉满最高可用【发条超频】' },
  { id: 'fallback_overdrive_1x', label: '回落发条至【1× 常驻蓄能】' },
  {
    id: 'install_or_upgrade_zodiac',
    label: '按黄金协同图谱镶嵌/升阶星宫',
    unlockHint: '需进入第 2 纪元',
  },
  {
    id: 'auto_ascend',
    label: '自动执行【星盘重铸】转生',
    unlockHint: '需敕令：高频差分智械核 或 已转生 ≥1 次',
  },
] as const;

export const AUTOMATOR_ACTIONS_BY_ID: Record<
  AutomatorActionId,
  AutomatorActionDef
> = {
  unlock_next_ring: AUTOMATOR_ACTIONS[0],
  buy_milestone_ring: AUTOMATOR_ACTIONS[1],
  buy_best_roi_ring: AUTOMATOR_ACTIONS[2],
  fire_perfect_impulse: AUTOMATOR_ACTIONS[3],
  trigger_supernova: AUTOMATOR_ACTIONS[4],
  upgrade_lowest_crucible: AUTOMATOR_ACTIONS[5],
  engage_overdrive_max: AUTOMATOR_ACTIONS[6],
  fallback_overdrive_1x: AUTOMATOR_ACTIONS[7],
  install_or_upgrade_zodiac: AUTOMATOR_ACTIONS[8],
  auto_ascend: AUTOMATOR_ACTIONS[9],
};

export interface AutomatorPresetDef {
  id: AutomatorPresetId;
  name: string;
  tagline: string;
  reserveRatio: number;
  rules: Array<{
    enabled: boolean;
    condition: AutomatorConditionId;
    threshold: number;
    action: AutomatorActionId;
  }>;
}

export const AUTOMATOR_PRESETS: readonly AutomatorPresetDef[] = [
  {
    id: 'breakthrough_sniper',
    name: '轨频狙击 · 精算流',
    tagline: '优先唤醒新轨与 Lv.10/25/50 质变突破，保留 20% 底池并同步淬炼星炉',
    reserveRatio: 0.2,
    rules: [
      { enabled: true, condition: 'always', threshold: 0, action: 'unlock_next_ring' },
      { enabled: true, condition: 'milestone_affordable', threshold: 0, action: 'buy_milestone_ring' },
      { enabled: true, condition: 'crucible_affordable', threshold: 0, action: 'upgrade_lowest_crucible' },
      { enabled: true, condition: 'ring_roi_ready', threshold: 0, action: 'buy_best_roi_ring' },
      { enabled: true, condition: 'planets_near_meridian', threshold: 2, action: 'fire_perfect_impulse' },
      { enabled: false, condition: 'always', threshold: 0, action: 'install_or_upgrade_zodiac' },
    ],
  },
  {
    id: 'syzygy_detonator',
    name: '朔望锁相 · 爆发流',
    tagline: '自动释放超新星坍缩聚星 + 双星子午精准擒纵 + 75%/20% 发条迟滞超频脉冲',
    reserveRatio: 0.2,
    rules: [
      { enabled: true, condition: 'always', threshold: 0, action: 'trigger_supernova' },
      { enabled: true, condition: 'planets_near_meridian', threshold: 2, action: 'fire_perfect_impulse' },
      { enabled: true, condition: 'tension_above_pct', threshold: 75, action: 'engage_overdrive_max' },
      { enabled: true, condition: 'tension_below_pct', threshold: 20, action: 'fallback_overdrive_1x' },
      { enabled: true, condition: 'crucible_affordable', threshold: 0, action: 'upgrade_lowest_crucible' },
      { enabled: true, condition: 'ring_roi_ready', threshold: 0, action: 'buy_best_roi_ring' },
    ],
  },
  {
    id: 'handsfree_overclock',
    name: '全栈自走 · 摸鱼流',
    tagline: '保留 50% 底池自动构筑棱镜+音叉协同星宫、自动淬炼星炉与性价比升阶',
    reserveRatio: 0.5,
    rules: [
      { enabled: true, condition: 'always', threshold: 0, action: 'unlock_next_ring' },
      { enabled: true, condition: 'always', threshold: 0, action: 'install_or_upgrade_zodiac' },
      { enabled: true, condition: 'milestone_affordable', threshold: 0, action: 'buy_milestone_ring' },
      { enabled: true, condition: 'crucible_affordable', threshold: 0, action: 'upgrade_lowest_crucible' },
      { enabled: true, condition: 'tension_above_pct', threshold: 60, action: 'engage_overdrive_max' },
      { enabled: true, condition: 'ring_roi_ready', threshold: 0, action: 'buy_best_roi_ring' },
    ],
  },
  {
    id: 'speedrun_ascender',
    name: '星尘速刷 · 循环流',
    tagline: '零保留全速倾泻资源冲刺产能，攒够 5 枚天枢星尘即自动重铸开启下周目',
    reserveRatio: 0,
    rules: [
      { enabled: true, condition: 'stardust_ready', threshold: 5, action: 'auto_ascend' },
      { enabled: true, condition: 'always', threshold: 0, action: 'trigger_supernova' },
      { enabled: true, condition: 'always', threshold: 0, action: 'unlock_next_ring' },
      { enabled: true, condition: 'milestone_affordable', threshold: 0, action: 'buy_milestone_ring' },
      { enabled: true, condition: 'crucible_affordable', threshold: 0, action: 'upgrade_lowest_crucible' },
      { enabled: true, condition: 'ring_roi_ready', threshold: 0, action: 'buy_best_roi_ring' },
    ],
  },
] as const;

export function buildAutomatorRulesFromPreset(
  presetId: AutomatorPresetId,
): AutomatorRule[] {
  const preset =
    AUTOMATOR_PRESETS.find((p) => p.id === presetId) ?? AUTOMATOR_PRESETS[0];
  return preset.rules.map((r, idx) => ({
    id: `rule_${idx + 1}`,
    enabled: r.enabled,
    condition: r.condition,
    threshold: r.threshold,
    action: r.action,
    triggerCount: 0,
    lastTriggeredAt: -10,
  }));
}

export interface EraMeta {
  era: EraIndex;
  title: string;
  subtitle: string;
  unlockLuminance: number;
  summary: string;
}

export const ERAS: readonly EraMeta[] = [
  {
    era: 1,
    title: '第一纪 · 铜尺初鸣',
    subtitle: '三维陀螺校准与擒纵起振',
    unlockLuminance: 0,
    summary: '唤醒首枚立体黄铜辰摆，调校泛音齿比并积蓄星芒通量点燃底座星炉。',
  },
  {
    era: 2,
    title: '第二纪 · 朔望谐振',
    subtitle: '共面连珠、十二星宫与智械扩容',
    unlockLuminance: 120,
    summary: '开启十二星宫石碑镶嵌、超新星坍缩脉冲与 4 轨发条智械编程阵列。',
  },
  {
    era: 3,
    title: '第三纪 · 以太炼金',
    subtitle: '三态反应炉与全栈差分智械',
    unlockLuminance: 18000,
    summary: '凝练以太结晶，激活结晶釜自发合成与满编 6 轨高频差分智械，迈入指数狂飙。',
  },
  {
    era: 4,
    title: '第四纪 · 浑天奇点',
    subtitle: '万亿星辉，重铸天球',
    unlockLuminance: 25_000_000,
    summary: '冲刺 1.00T 星辉引爆三维本源奇点，或配置自动重铸铭刻永恒星宿星座。',
  },
] as const;

export interface TutorialQuestDef {
  step: number;
  title: string;
  instruction: string;
  whyItMatters: string;
  rewardText: string;
  rewardLuminance: number;
  rewardAether: number;
  rewardFlux: number;
  rewardTensionSec: number;
  targetArea: 'impulse' | 'venus' | 'overdrive' | 'zodiac' | 'mercury10';
}

export const TUTORIAL_QUESTS: readonly TutorialQuestDef[] = [
  {
    step: 0,
    title: '初阶指引 1/5 · 拨动三维擒纵核心',
    instruction: '按下【空格 Space】、点击底部【拨动擒纵】或直接点击 3D 中央太阳核心 3 次',
    whyItMatters: '每次拨动都会注入动能产出星辉与星芒通量；星体驶入 12 点黄金激光门时拨动更能触发 ×3 精准暴击！',
    rewardText: '奖励 +35 星辉 · +10 星芒通量',
    rewardLuminance: 35,
    rewardAether: 0,
    rewardFlux: 10,
    rewardTensionSec: 0,
    targetArea: 'impulse',
  },
  {
    step: 1,
    title: '初阶指引 2/5 · 唤醒双曜陀螺星轨',
    instruction: '在下方【五曜星轨】面板中，点击解锁【第二轨 · 太白弦轮】',
    whyItMatters: '多条立体倾角星轨在子午门自动共面交汇时，会引爆高倍阶乘【朔望连珠】激光冲击波！',
    rewardText: '奖励 +65 星辉 · +15 星芒通量',
    rewardLuminance: 65,
    rewardAether: 0,
    rewardFlux: 15,
    rewardTensionSec: 15,
    targetArea: 'venus',
  },
  {
    step: 2,
    title: '初阶指引 3/5 · 开启时隙发条超频',
    instruction: '在底部控制栏将超频档位切换至【2×】或【4×】',
    whyItMatters: '挂机与离线会自动蓄满发条秒数；也可前往【发条智械】用迟滞条件规则实现全自动脉冲超频！',
    rewardText: '奖励 +95 星辉（直接开启第二纪元）',
    rewardLuminance: 95,
    rewardAether: 0,
    rewardFlux: 15,
    rewardTensionSec: 20,
    targetArea: 'overdrive',
  },
  {
    step: 3,
    title: '初阶指引 4/5 · 激活黄道星宫石碑',
    instruction: '切换到底部【十二星宫】（或直接点击 3D 外圈石碑），镶嵌一枚【聚光棱镜】',
    whyItMatters: '星体掠过石碑会折射星辉或充能音叉，相邻协同石碑之间还会在 3D 星空架起黄金能量光桥！',
    rewardText: '奖励 +180 星辉 · +25 星芒通量',
    rewardLuminance: 180,
    rewardAether: 0,
    rewardFlux: 25,
    rewardTensionSec: 0,
    targetArea: 'zodiac',
  },
  {
    step: 4,
    title: '初阶指引 5/5 · 十级突破与智械启蒙',
    instruction: '在【五曜星轨】将【辰摆】升至 Lv.10（可切「突破」一键买齐，或开启【发条智械】自动狙击）',
    whyItMatters: '星轨逢 Lv.10 / 25 / 50 获质变倍增；配合【以太星炉】三态反应釜与【发条智械】逻辑编程即可解放双手指数狂飙！',
    rewardText: '毕业贺礼 +500 星辉 · +2 以太 · +40 通量',
    rewardLuminance: 500,
    rewardAether: 2,
    rewardFlux: 40,
    rewardTensionSec: 30,
    targetArea: 'mercury10',
  },
] as const;

export interface AchievementDef {
  id: AchievementId;
  name: string;
  conditionText: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first_perfect',
    name: '毫厘不爽',
    conditionText: '在星体靠近正北黄金激光门时触发 1 次【精准擒纵】暴击',
  },
  {
    id: 'first_syzygy_2',
    name: '日月同辉',
    conditionText: '首次触发【双曜连珠】（2 枚星体共面跨过子午线）',
  },
  {
    id: 'first_syzygy_3',
    name: '三星高照',
    conditionText: '触发【三曜连珠】并凝结以太结晶',
  },
  {
    id: 'grand_syzygy_5',
    name: '五星连珠',
    conditionText: '五轨齐开并达成壮丽的【五曜同辉】大满贯连珠',
  },
  {
    id: 'first_module',
    name: '初辟星宫',
    conditionText: '在黄道十二宫石碑镶嵌第 1 枚发条机关',
  },
  {
    id: 'octagon_grid',
    name: '八方璇玑',
    conditionText: '同时在星盘上镶嵌满 8 座以上星宫机关',
  },
  {
    id: 'milestone_25',
    name: '谐振倍增',
    conditionText: '将任意一条星轨提升至 Lv.25 达成二段轨频突破',
  },
  {
    id: 'overdrive_burst',
    name: '时隙折叠',
    conditionText: '开启 4× 或更高倍率的发条超频运转',
  },
  {
    id: 'crucible_ignited',
    name: '星炉炼金师',
    conditionText: '将底座【以太星炉】三态反应釜总阶数提升至 5 阶以上',
  },
  {
    id: 'smart_automator',
    name: '差分机宗师',
    conditionText: '通过【发条智械】条件编程阵列累计自动执行 15 次以上指令',
  },
  {
    id: 'first_ascension',
    name: '星盘重铸',
    conditionText: '完成首次星盘转生并获取天枢星尘',
  },
  {
    id: 'prime_singularity',
    name: '浑天归一',
    conditionText: '点亮万亿星辉中央本源奇点，达成终章',
  },
] as const;

export interface AscensionNodeDef {
  id: AscensionNodeId;
  name: string;
  costStardust: number;
  /** Normalized SVG star-map coordinates [0..100] */
  x: number;
  y: number;
  requires: AscensionNodeId | null;
  description: string;
}

export const ASCENSION_NODES: readonly AscensionNodeDef[] = [
  {
    id: 'star_seed',
    name: '晨星初火',
    costStardust: 1,
    x: 50,
    y: 78,
    requires: null,
    description: '新周目开局即解锁第二轨【太白弦轮】、附赠 250 星辉、40 星芒通量与 60 秒超频蓄能。',
  },
  {
    id: 'golden_ratio',
    name: '黄金齿比',
    costStardust: 2,
    x: 26,
    y: 58,
    requires: 'star_seed',
    description: '所有星轨升级成本增幅大幅降低，且每段轨频突破倍率额外 ×1.5。',
  },
  {
    id: 'wide_meridian',
    name: '宽幅子午',
    costStardust: 2,
    x: 74,
    y: 58,
    requires: 'star_seed',
    description: '子午连珠判定窗口拓宽 +55%，手动与智械【精准擒纵】暴击倍率由 ×3 提升至 ×5。',
  },
  {
    id: 'aether_fountain',
    name: '以太星泉',
    costStardust: 4,
    x: 20,
    y: 34,
    requires: 'golden_ratio',
    description: '所有以太结晶与星芒通量获取 ×3.0，且开局直接开放八方 8 个星宫石碑。',
  },
  {
    id: 'perpetual_spring',
    name: '永动发条匣',
    costStardust: 4,
    x: 80,
    y: 34,
    requires: 'wide_meridian',
    description: '离线与后台发条蓄能效率 ×2.5，并解锁【8× 极速超频】档位！',
  },
  {
    id: 'harmonic_overtone',
    name: '天球泛音阶',
    costStardust: 7,
    x: 50,
    y: 44,
    requires: 'star_seed',
    description: '每次触发朔望连珠，本局全局星辉永久叠加 +2.5% 泛音乘区（无上限）！',
  },
  {
    id: 'zodiac_memory',
    name: '星宫铭刻',
    costStardust: 11,
    x: 35,
    y: 16,
    requires: 'aether_fountain',
    description: '重铸星盘时，保留上一周目所有星宫石碑机关（以 1 阶形态继承至新周目）。',
  },
  {
    id: 'cosmic_architect',
    name: '司天监总成',
    costStardust: 16,
    x: 65,
    y: 16,
    requires: 'perpetual_spring',
    description: '全局星辉与转速额外 ×4.0，开局满编开放 6 轨【高频差分智械】且所有模块效能 ×1.75。',
  },
] as const;

export const ASCENSION_NODES_BY_ID: Record<AscensionNodeId, AscensionNodeDef> = {
  star_seed: ASCENSION_NODES[0],
  golden_ratio: ASCENSION_NODES[1],
  wide_meridian: ASCENSION_NODES[2],
  aether_fountain: ASCENSION_NODES[3],
  perpetual_spring: ASCENSION_NODES[4],
  harmonic_overtone: ASCENSION_NODES[5],
  zodiac_memory: ASCENSION_NODES[6],
  cosmic_architect: ASCENSION_NODES[7],
};

export const LEVEL_MILESTONES: ReadonlyArray<{ level: number; mult: number }> = [
  { level: 10, mult: 2.5 },
  { level: 25, mult: 4.0 },
  { level: 50, mult: 5.0 },
  { level: 75, mult: 6.0 },
  { level: 100, mult: 8.0 },
  { level: 150, mult: 10.0 },
  { level: 200, mult: 15.0 },
];
