import type {
  DifficultyDef,
  EnemyArchetypeId,
  EnemyIntent,
  ForgeDifficulty,
  OrbDef,
  OrbTypeId,
  PegKind,
  RelicDef,
  RelicId,
  StageDef,
} from './types.ts';

export const WORLD_W = 540;
export const WORLD_H = 680;
export const LAUNCHER_X = WORLD_W / 2;
export const LAUNCHER_Y = 158;
export const BOARD_LEFT = 24;
export const BOARD_RIGHT = WORLD_W - 24;
export const BOARD_TOP = 148;
export const BOARD_BOTTOM = 656;
export const CRUCIBLE_Y = 638;

export const CAMPAIGN_STAGE_COUNT = 6;

export const DIFFICULTY_ORDER: ReadonlyArray<ForgeDifficulty> = [
  'casual',
  'standard',
  'master',
];

export const DIFFICULTY_DEFS: Record<ForgeDifficulty, DifficultyDef> = {
  casual: {
    id: 'casual',
    name: '温火',
    tagline: '炉心 90 血 · 每发 3 次鼓风 · 敌势缓和',
    startHp: 90,
    baseBellowsCharges: 3,
    enemyHpScale: 0.82,
    enemyDmgScale: 0.78,
    scoreMult: 0.9,
  },
  standard: {
    id: 'standard',
    name: '炽炼',
    tagline: '炉心 75 血 · 每发 2 次鼓风 · 标准曲线',
    startHp: 75,
    baseBellowsCharges: 2,
    enemyHpScale: 1.0,
    enemyDmgScale: 1.0,
    scoreMult: 1.0,
  },
  master: {
    id: 'master',
    name: '劫焰',
    tagline: '炉心 60 血 · 强敌高压 · 1.35 倍评分',
    startHp: 60,
    baseBellowsCharges: 2,
    enemyHpScale: 1.24,
    enemyDmgScale: 1.24,
    scoreMult: 1.35,
  },
};

export const PEG_META: Record<
  PegKind,
  {
    name: string;
    short: string;
    description: string;
    baseColor: string;
    litColor: string;
    rimColor: string;
    radius: number;
    basePower: number;
  }
> = {
  bronze: {
    name: '青铜符钉',
    short: '充能',
    description: '撞击后烧红充能，累积本次弹丸的基础锻打伤害。',
    baseColor: '#5C4B3E',
    litColor: '#F59E0B',
    rimColor: '#C2956B',
    radius: 11.5,
    basePower: 4,
  },
  crit: {
    name: '金铃暴击钉',
    short: '暴击×2',
    description: '撞响清脆编钟，令本发最终齐射进入双倍暴击状态。',
    baseColor: '#B45309',
    litColor: '#FDE047',
    rimColor: '#FBBF24',
    radius: 13.5,
    basePower: 7,
  },
  mult: {
    name: '火鼓倍增钉',
    short: '倍率+0.5',
    description: '每撞响一次，本发总倍率提升 +0.5x，连击滚雪球的核心。',
    baseColor: '#9A3412',
    litColor: '#FB923C',
    rimColor: '#F97316',
    radius: 13,
    basePower: 5,
  },
  bomb: {
    name: '赤药爆裂钉',
    short: '爆破',
    description: '瞬间引爆周围 92px 内全部符钉，并追加 18 点范围爆炸火伤。',
    baseColor: '#991B1B',
    litColor: '#FF4D4D',
    rimColor: '#F87171',
    radius: 13.5,
    basePower: 8,
  },
  wind: {
    name: '风纹气旋钉',
    short: '鼓风+1',
    description: '强力向上托举铁球，并立刻恢复 1 次「鼓风磁冲」充能。',
    baseColor: '#0F766E',
    litColor: '#2DD4BF',
    rimColor: '#5EEAD4',
    radius: 13,
    basePower: 4,
  },
  prism: {
    name: '分光棱镜钉',
    short: '分裂',
    description: '触碰即刻分裂出一枚高速子铁球，双倍碰撞疯狂攒连击。',
    baseColor: '#3730A3',
    litColor: '#818CF8',
    rimColor: '#A5B4FC',
    radius: 13,
    basePower: 5,
  },
  shield: {
    name: '铁砧护盾钉',
    short: '护盾+5',
    description: '每次撞击为炉心铸造 5 点护盾，稳妥抵挡敌军重击。',
    baseColor: '#1E40AF',
    litColor: '#60A5FA',
    rimColor: '#93C5FD',
    radius: 12.5,
    basePower: 3,
  },
};

export const ORB_DEFS: Record<OrbTypeId, OrbDef> = {
  iron_core: {
    id: 'iron_core',
    name: '赤铁丸',
    tag: '均衡重击',
    description: '经典锻造弹丸，手感沉稳，触发暴击时额外附加 +10 底伤。',
    baseDamage: 6,
    critBonus: 10,
    gravityScale: 1.0,
    bounciness: 0.84,
    radius: 10.5,
    color: '#E85D26',
    coreColor: '#FDE68A',
    aoe: false,
  },
  twin_spark: {
    id: 'twin_spark',
    name: '子母双星弹',
    tag: '双弹齐发',
    description: '一次发射同时抛出两枚炽铁子母弹，轻松铺满全炉连击。',
    baseDamage: 4,
    critBonus: 6,
    gravityScale: 0.96,
    bounciness: 0.86,
    radius: 9.2,
    color: '#F59E0B',
    coreColor: '#FEF9C3',
    aoe: false,
  },
  thunder_mag: {
    id: 'thunder_mag',
    name: '引雷磁石弹',
    tag: '磁吸群伤',
    description: '飞行时向附近未亮符钉产生磁力牵引，齐射化作落雷打击全体敌军。',
    baseDamage: 5,
    critBonus: 8,
    gravityScale: 0.92,
    bounciness: 0.85,
    radius: 10.2,
    color: '#0EA5E9',
    coreColor: '#E0F2FE',
    aoe: true,
  },
  meteor_pierce: {
    id: 'meteor_pierce',
    name: '陨铁贯通弹',
    tag: '穿透重压',
    description: '前 4 次撞击直接穿透符钉不折返，能直捣深层金铃与爆裂钉。',
    baseDamage: 8,
    critBonus: 12,
    gravityScale: 1.12,
    bounciness: 0.78,
    radius: 11.2,
    color: '#D97706',
    coreColor: '#FEF3C7',
    aoe: false,
  },
  blast_cinder: {
    id: 'blast_cinder',
    name: '炎爆火药弹',
    tag: '连环爆破',
    description: '每撞击 4 枚符钉便在自身引爆炽热气浪，点燃周围符钉并群伤敌阵。',
    baseDamage: 5,
    critBonus: 8,
    gravityScale: 1.02,
    bounciness: 0.82,
    radius: 10.8,
    color: '#DC2626',
    coreColor: '#FECACA',
    aoe: true,
  },
  frost_echo: {
    id: 'frost_echo',
    name: '寒霜浮游弹',
    tag: '缓落减攻',
    description: '低重力轻盈飘荡易于鼓风控球，命中后令目标霜冻、下回合攻击减半。',
    baseDamage: 5,
    critBonus: 8,
    gravityScale: 0.68,
    bounciness: 0.9,
    radius: 10.2,
    color: '#14B8A6',
    coreColor: '#CCFBF1',
    aoe: false,
  },
  bell_chime: {
    id: 'bell_chime',
    name: '金钟共鸣弹',
    tag: '声波共振',
    description: '每次撞击同步震响邻近 1 枚未点亮符钉，连击与倍率攀升极快。',
    baseDamage: 5,
    critBonus: 10,
    gravityScale: 0.95,
    bounciness: 0.88,
    radius: 10.5,
    color: '#EAB308',
    coreColor: '#FEF9C3',
    aoe: false,
  },
  crimson_leech: {
    id: 'crimson_leech',
    name: '淬火虹吸弹',
    tag: '吸血续航',
    description: '将本发齐射伤害的 15% 化作热流回补炉心血量，持久战利器。',
    baseDamage: 6,
    critBonus: 8,
    gravityScale: 0.98,
    bounciness: 0.85,
    radius: 10.2,
    color: '#E11D48',
    coreColor: '#FFE4E6',
    aoe: false,
  },
};

export const ORB_LIST: ReadonlyArray<OrbDef> = Object.values(ORB_DEFS);

export const RELIC_DEFS: Record<RelicId, RelicDef> = {
  bellows_heart: {
    id: 'bellows_heart',
    name: '鼓风之心',
    tag: '操控强化',
    description: '每发铁球初始「鼓风磁冲」充能上限 +1。',
  },
  double_anvil: {
    id: 'double_anvil',
    name: '双砧护壁',
    tag: '稳健防御',
    description: '每回合开始自动为炉心锻造 7 点护盾。',
  },
  ember_chain: {
    id: 'ember_chain',
    name: '炽链共鸣',
    tag: '连击倍率',
    description: '单发连击每达到 10 次，最终伤害倍率额外 +0.6x。',
  },
  crucible_magnet: {
    id: 'crucible_magnet',
    name: '金盂引流',
    tag: '落底爆发',
    description: '炉底承火金盂加宽 35%，铁球落入金盂额外 +50% 齐射伤害。',
  },
  spark_rebound: {
    id: 'spark_rebound',
    name: '炉底回弹',
    tag: '续命连击',
    description: '每发首枚落出炉底的铁球自动强力回弹一次，重返符钉阵。',
  },
  crit_resonance: {
    id: 'crit_resonance',
    name: '金铃齐鸣',
    tag: '暴击联动',
    description: '撞响金铃暴击钉时，额外获得 +5 护盾并恢复 1 次鼓风充能。',
  },
  powder_keg: {
    id: 'powder_keg',
    name: '硫磺火药',
    tag: '爆破专精',
    description: '爆裂钉与炎爆弹的爆炸半径 +35%，且爆炸伤害额外 +14。',
  },
  heavy_quench: {
    id: 'heavy_quench',
    name: '淬火重锻',
    tag: '面板直伤',
    description: '所有弹丸每次撞击符钉的基础底伤额外 +2。',
  },
  prism_bloom: {
    id: 'prism_bloom',
    name: '棱光绽放',
    tag: '分裂风暴',
    description: '每场战斗开局额外将 2 枚青铜钉转化为分光棱镜钉。',
  },
  phoenix_ash: {
    id: 'phoenix_ash',
    name: '涅槃炉灰',
    tag: '绝境兜底',
    description: '每局首次炉心濒危归零时，立刻恢复 35% 血量并震碎敌军护盾。',
  },
  overheat_core: {
    id: 'overheat_core',
    name: '过热炉胆',
    tag: '高连爆发',
    description: '单发连击超过 14 次后，之后每次撞击提供的底伤翻倍。',
  },
  master_smith: {
    id: 'master_smith',
    name: '宗师锤印',
    tag: '气浪灼烧',
    description: '每次主动施放「鼓风磁冲」，直接对当前锁定的敌军造成 14 点灼烧伤。',
  },
};

export const RELIC_LIST: ReadonlyArray<RelicDef> = Object.values(RELIC_DEFS);

export interface EnemyArchetypeDef {
  id: EnemyArchetypeId;
  name: string;
  role: string;
  baseHp: number;
  radius: number;
  color: string;
  accent: string;
  intents: EnemyIntent[];
}

export const ENEMY_DEFS: Record<EnemyArchetypeId, EnemyArchetypeDef> = {
  cinder_mask: {
    id: 'cinder_mask',
    name: '灰面傩偶',
    role: '稳步猛扑',
    baseHp: 56,
    radius: 26,
    color: '#443630',
    accent: '#E85D26',
    intents: [
      { kind: 'attack', value: 8, label: '猛扑 8' },
      { kind: 'defend', value: 8, label: '举甲 8' },
      { kind: 'heavy_attack', value: 12, label: '重锤 12' },
    ],
  },
  frost_weaver: {
    id: 'frost_weaver',
    name: '寒霜傀儡',
    role: '冰封符钉',
    baseHp: 64,
    radius: 25,
    color: '#1E3A4C',
    accent: '#38BDF8',
    intents: [
      { kind: 'freeze', value: 2, label: '冰封 2 钉' },
      { kind: 'attack', value: 9, label: '霜刺 9' },
      { kind: 'freeze', value: 3, label: '寒潮 3 钉' },
    ],
  },
  bronze_guard: {
    id: 'bronze_guard',
    name: '铁壁镇兽',
    role: '重盾慢锤',
    baseHp: 88,
    radius: 29,
    color: '#3A3A38',
    accent: '#D97706',
    intents: [
      { kind: 'defend', value: 14, label: '铁壁 14' },
      { kind: 'heavy_attack', value: 15, label: '震击 15' },
      { kind: 'attack', value: 9, label: '冲撞 9' },
    ],
  },
  ember_archer: {
    id: 'ember_archer',
    name: '曜火弓偶',
    role: '高伤点射',
    baseHp: 52,
    radius: 23,
    color: '#4C1D24',
    accent: '#FB7185',
    intents: [
      { kind: 'attack', value: 11, label: '火箭 11' },
      { kind: 'heavy_attack', value: 16, label: '贯日 16' },
    ],
  },
  mirror_warden: {
    id: 'mirror_warden',
    name: '铜镜祭司',
    role: '续航回护',
    baseHp: 74,
    radius: 26,
    color: '#1F3D36',
    accent: '#2DD4BF',
    intents: [
      { kind: 'heal', value: 14, label: '修补 14' },
      { kind: 'attack', value: 10, label: '灼光 10' },
      { kind: 'defend', value: 12, label: '铜幕 12' },
    ],
  },
  taotie_boss: {
    id: 'taotie_boss',
    name: '玄铁饕餮',
    role: '终幕巨兽 · 二阶段',
    baseHp: 240,
    radius: 38,
    color: '#2B1918',
    accent: '#F59E0B',
    intents: [
      { kind: 'attack', value: 13, label: '噬火 13' },
      { kind: 'freeze', value: 3, label: '黑霜 3 钉' },
      { kind: 'defend', value: 18, label: '玄甲 18' },
      { kind: 'heavy_attack', value: 21, label: '焚穹 21' },
    ],
  },
};

export const STAGE_DEFS: ReadonlyArray<StageDef> = [
  {
    index: 0,
    act: 1,
    name: '炭火初燃',
    subtitle: '第一幕 · 试炼热身炉',
    layoutKind: 'hearth',
    enemies: ['cinder_mask'],
  },
  {
    index: 1,
    act: 1,
    name: '双轮铜坊',
    subtitle: '第一幕 · 旋转铜杠与爆裂钉',
    layoutKind: 'twin_mills',
    enemies: ['cinder_mask', 'ember_archer'],
  },
  {
    index: 2,
    act: 2,
    name: '星环金库',
    subtitle: '第二幕 · 轨道巡游金铃阵',
    layoutKind: 'vault_ring',
    enemies: ['bronze_guard', 'mirror_warden'],
  },
  {
    index: 3,
    act: 2,
    name: '寒霜穹顶',
    subtitle: '第二幕 · 破冰清障与双面夹击',
    layoutKind: 'frost_arch',
    enemies: ['frost_weaver', 'ember_archer'],
  },
  {
    index: 4,
    act: 3,
    name: '百炼风轮',
    subtitle: '第三幕 · 旋风连击大熔炉',
    layoutKind: 'wheel_forge',
    enemies: ['bronze_guard', 'frost_weaver', 'mirror_warden'],
  },
  {
    index: 5,
    act: 3,
    name: '熔金天穹',
    subtitle: '第三幕终章 · 玄铁饕餮',
    layoutKind: 'taotie_kiln',
    enemies: ['taotie_boss'],
    isBoss: true,
  },
];

export const ACT_NAMES: Record<1 | 2 | 3, string> = {
  1: '第一幕 · 初火坊',
  2: '第二幕 · 霜铜殿',
  3: '第三幕 · 熔金穹',
};
