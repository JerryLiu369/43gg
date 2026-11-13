import type {
  DifficultyDef,
  DifficultyTier,
  EnemyArchetypeId,
  EnemyDef,
  MechClassId,
  MechDef,
  RelicDef,
  RelicId,
  SectorDef,
} from './types.ts';

export const BOARD_SIZE = 7;
export const LUOPAN_CENTER = { r: 3, c: 3 } as const;
export const BATTLE_MAX_TURNS = 4;

export const DIFFICULTY_ORDER: DifficultyTier[] = [
  'casual',
  'standard',
  'master',
];

export const DIFFICULTY_DEFS: Record<DifficultyTier, DifficultyDef> = {
  casual: {
    id: 'casual',
    label: '演武 · 轻松',
    shortTag: '高容错 · 畅享推演',
    desc: '灵脉电力 7 格，每战可旋转罗盘 3 次、回溯 2 次，全体神机生命 +1 且开局自带护盾，同屏荒兽精简。',
    gridPower: 7,
    luopanCharges: 3,
    resets: 2,
    mechBonusHp: 1,
    startShielded: true,
    maxConcurrentEnemiesBase: 3,
    scoreMult: 0.9,
  },
  standard: {
    id: 'standard',
    label: '破阵 · 标准',
    shortTag: '推荐 · 节奏适中',
    desc: '灵脉电力 6 格，每战可旋转罗盘 2 次、回溯 1 次；首战区循序渐进热身，通关战区自动修复 1 格灵脉。',
    gridPower: 6,
    luopanCharges: 2,
    resets: 1,
    mechBonusHp: 0,
    startShielded: false,
    maxConcurrentEnemiesBase: 4,
    scoreMult: 1.0,
  },
  master: {
    id: 'master',
    label: '天劫 · 宗师',
    shortTag: '高压 · 极限算力',
    desc: '灵脉电力 5 格，荒兽攻势密集且首领耐久强化，战功得分 ×1.25，适合精通奇门移星的老练统帅。',
    gridPower: 5,
    luopanCharges: 2,
    resets: 1,
    mechBonusHp: 0,
    startShielded: false,
    maxConcurrentEnemiesBase: 5,
    scoreMult: 1.25,
  },
};

export const MECH_DEFS: Record<MechClassId, MechDef> = {
  titan: {
    id: 'titan',
    name: '镇岳 · 破军甲',
    title: '重装玄铁前锋',
    roleLabel: '近战重锤 · 强力位移',
    maxHp: 5,
    moveRange: 3,
    flying: false,
    armor: 1,
    accentHex: '#10B981',
    primaryWeapon: {
      id: 'seismic_hammer',
      name: '撼山重锤',
      slot: 'primary',
      pattern: 'melee_cleave_push',
      rangeMin: 1,
      rangeMax: 1,
      baseDamage: 2,
      shortDesc: '近战 2 伤 + 顺向击退 1 格',
      detailDesc:
        '猛击相邻目标造成 2 点伤害，并将其沿攻击方向强行击退 1 格（撞山、撞敌皆触发 +1 碰撞伤害，推入深渊直接秒杀）。',
      cooldownTurns: 0,
    },
    secondaryWeapon: {
      id: 'polarity_grapple',
      name: '玄铁磁钩',
      slot: 'secondary',
      pattern: 'grapple_pull',
      rangeMin: 2,
      rangeMax: 4,
      baseDamage: 1,
      shortDesc: '直线拉拽敌方至身前 + 1 伤',
      detailDesc:
        '沿直线发射 2–4 格磁力飞爪，对首个单位造成 1 点伤害并将其拉拽至镇岳正前方；若目标为山体或城垣，则将自身牵引过去。',
      cooldownTurns: 1,
    },
  },
  arbalest: {
    id: 'arbalest',
    name: '惊鸿 · 雷音弩',
    title: '曲射雷火机关车',
    roleLabel: '抛射控场 · 水脉连电',
    maxHp: 4,
    moveRange: 3,
    flying: false,
    armor: 0,
    accentHex: '#F59E0B',
    primaryWeapon: {
      id: 'meteor_mortar',
      name: '流星飞火炮',
      slot: 'primary',
      pattern: 'mortar_cross_push',
      rangeMin: 2,
      rangeMax: 5,
      baseDamage: 2,
      shortDesc: '越障抛射 2 伤 + 四周十字震退',
      detailDesc:
        '越过地形与单位抛射火药弹（射程 2–5 格），对落点造成 2 点伤害，并将落点上下左右 4 个相邻格的单位全部向外震退 1 格。',
      cooldownTurns: 0,
    },
    secondaryWeapon: {
      id: 'arc_thunder_bolt',
      name: '紫电奔雷矢',
      slot: 'secondary',
      pattern: 'arc_lightning',
      rangeMin: 1,
      rangeMax: 4,
      baseDamage: 2,
      shortDesc: '雷电链传导水脉与相连目标',
      detailDesc:
        '向 1–4 格内目标射出高压雷矢造成 2 点伤害，电流会自动沿着所有相连的单位与「沧澜水脉」无限传导并附加感电破甲。',
      cooldownTurns: 1,
    },
  },
  geomancer: {
    id: 'geomancer',
    name: '天工 · 司南仪',
    title: '浮空浑象奇门仪',
    roleLabel: '浮空换位 · 金汤护城',
    maxHp: 4,
    moveRange: 4,
    flying: true,
    armor: 0,
    accentHex: '#06B6D4',
    primaryWeapon: {
      id: 'qiankun_swap',
      name: '乾坤移星',
      slot: 'primary',
      pattern: 'swap_teleport',
      rangeMin: 1,
      rangeMax: 4,
      baseDamage: 1,
      shortDesc: '与 4 格内任意单位互换位置',
      detailDesc:
        '无视地形与 1–4 格内任意敌友互换坐标（若将非飞行敌军换入深渊则立即坠亡；若换至敌方弹道上可实现借刀杀人），对敌方额外造成 1 点震荡伤害。',
      cooldownTurns: 0,
    },
    secondaryWeapon: {
      id: 'aegis_pulse',
      name: '金汤震荡障',
      slot: 'secondary',
      pattern: 'aegis_pulse',
      rangeMin: 0,
      rangeMax: 3,
      baseDamage: 1,
      shortDesc: '赋予圣盾修复 + 震退四周敌军',
      detailDesc:
        '为 0–3 格内目标友军或灵脉城垣套上「玉璋圣盾」（抵消下一次伤害并恢复 1 点耐久），同时将目标四周相邻的敌军向外震退 1 格。',
      cooldownTurns: 1,
    },
  },
};

export const MECH_ORDER: MechClassId[] = ['titan', 'arbalest', 'geomancer'];

export const ENEMY_DEFS: Record<EnemyArchetypeId, EnemyDef> = {
  juggernaut: {
    id: 'juggernaut',
    name: '蛮牛 · 蚀铁冲车',
    subtitle: '直线冲锋破城兽',
    maxHp: 3,
    moveRange: 3,
    damage: 2,
    flying: false,
    frontShielded: false,
    attackDesc: '沿直线高速冲锋至首个障碍，造成 2 点伤害并击退目标。',
    aiPolicyDesc: '优先搜寻与灵脉城垣或神机同一直线的冲锋走廊。',
    accentHex: '#EF4444',
  },
  scorpion: {
    id: 'scorpion',
    name: '赤蝎 · 熔火投石',
    subtitle: '远程曲射攻城兽',
    maxHp: 2,
    moveRange: 2,
    damage: 2,
    flying: false,
    frontShielded: false,
    attackDesc: '越过障碍远程抛射熔火弹，对目标格造成 2 点伤害。',
    aiPolicyDesc: '保持后排距离，优先锁定耐久较高的灵脉城垣。',
    accentHex: '#F97316',
  },
  bastion: {
    id: 'bastion',
    name: '玄甲 · 重盾巨兵',
    subtitle: '正面免伤横扫卫',
    maxHp: 4,
    moveRange: 2,
    damage: 2,
    flying: false,
    frontShielded: true,
    attackDesc: '挥舞巨刃横扫正前方 3 格宽扇面，造成 2 点重击伤害。',
    aiPolicyDesc: '正面装甲减免 1 点直击伤害；通过位移撞击、雷电或旋转其朝向可破除护甲。',
    accentHex: '#A855F7',
  },
  stormwing: {
    id: 'stormwing',
    name: '雷蝠 · 穿云机关',
    subtitle: '浮空贯穿射线翼',
    maxHp: 3,
    moveRange: 4,
    damage: 1,
    flying: true,
    frontShielded: false,
    attackDesc: '无视地形浮空游走，发射贯穿整条直线 3 格的高能赤电光束。',
    aiPolicyDesc: '可飞越深渊与水脉；若被旋转或推拽，其贯穿光束会一并误伤路径上的友方荒兽。',
    accentHex: '#EC4899',
  },
  taotie_boss: {
    id: 'taotie_boss',
    name: '饕餮 · 镇渊母机',
    subtitle: '王庭终章巨型首领',
    maxHp: 7,
    moveRange: 2,
    damage: 3,
    flying: false,
    frontShielded: true,
    isBoss: true,
    attackDesc: '镇渊十字重击：对正前方及左右三格核心区造成 3 点毁灭伤害并向外震飞。',
    aiPolicyDesc: '高耐久首领级机关，拥有正面重盾；善用借刀杀人与碰撞连击削减其护甲。',
    accentHex: '#DC2626',
  },
};

export const RELIC_DEFS: Record<RelicId, RelicDef> = {
  thunder_conductor: {
    id: 'thunder_conductor',
    name: '雷泽共鸣盘',
    category: '元素增幅',
    desc: '「紫电奔雷矢」与水脉导电伤害 +1，且我方神机停留在水脉上不会短路，反而获得玉璋护盾。',
  },
  seismic_shock: {
    id: 'seismic_shock',
    name: '崩山千钧锤',
    category: '位移强攻',
    desc: '所有碰撞伤害（撞山、撞城、敌军相撞）由 1 点提升至 2 点。',
  },
  jade_aegis: {
    id: 'jade_aegis',
    name: '九鼎金汤印',
    category: '灵脉守御',
    desc: '每场战斗开始时，全体三尊神机自动获得 1 层「玉璋圣盾」，灵脉上限 +1。',
  },
  double_luopan: {
    id: 'double_luopan',
    name: '双旋奇门枢',
    category: '璇玑控盘',
    desc: '每场战斗可用的「璇玑转盘」次数上限 +2，且每次旋转罗盘会为罗盘上的友军恢复 1 点耐久。',
  },
  fissure_spikes: {
    id: 'fissure_spikes',
    name: '镇脉伏龙钉',
    category: '封脉反制',
    desc: '我方神机或被推过去的敌军堵住「地脉涌穴」时，神机不再受反噬伤害，反而直接震碎地底荒兽并获 +2 星铁。',
  },
  overclock_thrusters: {
    id: 'overclock_thrusters',
    name: '神行风火轮',
    category: '机动引擎',
    desc: '全体神机移动力 +1，且镇岳与惊鸿在回合首次受击后自动获得护盾。',
  },
  vampiric_bronze: {
    id: 'vampiric_bronze',
    name: '噬铁回春炉',
    category: '续航锻造',
    desc: '每当通过「坠渊、落水或敌军互相误伤」消灭敌军时，立即恢复 1 格灵脉电力并治疗全队 1 点耐久。',
  },
  artillery_echo: {
    id: 'artillery_echo',
    name: '连环火龙铳',
    category: '火力超载',
    desc: '全体副武器（玄铁磁钩、紫电奔雷矢、金汤震荡障）冷却时间归零，可每回合连续施放。',
  },
};

export const RELIC_LIST: RelicDef[] = Object.values(RELIC_DEFS);

export const SECTORS: SectorDef[] = [
  {
    id: 'canglan_waterway',
    index: 0,
    name: '第一战区 · 沧澜水寨',
    subtitle: '九曲水脉与雷泽导电防线',
    terrainTheme: 'waterway',
    description:
      '沧澜江穿城而过，善用击退将非飞行荒兽推入深水使其熄火，或以「紫电奔雷矢」引爆整条水脉。',
    enemyWaveBudget: 3,
  },
  {
    id: 'ronglu_foundry',
    index: 1,
    name: '第二战区 · 熔炉铁城',
    subtitle: '断崖深渊与地火铸造台',
    terrainTheme: 'foundry',
    description:
      '两侧皆为万丈断崖与熔岩火池，旋转中央「青铜璇玑环」或施展乾坤换位，将重甲巨兵直接送入深渊。',
    enemyWaveBudget: 4,
  },
  {
    id: 'tianshu_citadel',
    index: 2,
    name: '终章战区 · 天枢王庭',
    subtitle: '决战镇渊母机 · 饕餮降临',
    terrainTheme: 'imperial',
    description:
      '镇渊母机「饕餮」率领精锐蚀铁军团围攻王庭灵脉，借力打力、扭转乾坤，坚守最后 4 回合完成封印！',
    enemyWaveBudget: 4,
    bossArchetype: 'taotie_boss',
  },
];

export const TERRAIN_META: Record<
  string,
  {
    name: string;
    desc: string;
    badgeColor: string;
  }
> = {
  plain: {
    name: '青石方砖',
    desc: '稳固平地，所有单位可正常通行与驻守。',
    badgeColor: '#A8A29E',
  },
  water: {
    name: '沧澜水脉',
    desc: '非飞行敌军落水即刻「短路熄火」取消本回合攻击；受到雷击时全水域导电！',
    badgeColor: '#0EA5E9',
  },
  chasm: {
    name: '千丈深渊',
    desc: '非飞行单位被推入或换入深渊将立即坠毁秒杀！浮空单位可自由飞越。',
    badgeColor: '#EF4444',
  },
  mountain: {
    name: '玄武岩山',
    desc: '不可通行的高耸山岩，遮挡直线冲锋，被推撞至山体将承受额外碰撞伤害。',
    badgeColor: '#78716C',
  },
  magma: {
    name: '熔岩地火',
    desc: '灼热火池，踏入或被推入的单位立即引燃，每回合初受到 1 点灼烧伤害。',
    badgeColor: '#F97316',
  },
  citadel: {
    name: '九州灵脉塔',
    desc: '我方核心守护建筑！一旦被荒兽攻击将扣除「灵脉电力」，电力归零则防线失守。',
    badgeColor: '#F59E0B',
  },
};
