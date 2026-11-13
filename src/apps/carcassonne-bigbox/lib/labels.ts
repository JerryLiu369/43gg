import {
  coordKey,
  featureDirections,
  type Action,
  type ExpansionId,
  type FeatureKind,
  type FigureKind,
  type GameEvent,
  type Pending,
  type TileCatalog,
} from '../engine/index.ts';
import type { ClientView, PlayerColor } from './types.ts';

export const EXPANSION_INFO: Record<Exclude<ExpansionId, 'BASE'>, { name: string; hint: string }> = {
  RIVER: { name: '河流', hint: '以河流源头开局，先放 12 张河流板块' },
  ABBOT: { name: '修道院长', hint: '可放在修道院/花园，并可提前召回计分' },
  INNS_AND_CATHEDRALS: { name: '客栈与大教堂', hint: '客栈、大教堂与大米宝' },
  TRADERS_AND_BUILDERS: { name: '商人与建造者', hint: '货物、建造者、猪' },
  FLYING_MACHINES: { name: '#1 飞行器', hint: '掷骰飞向远处的地形' },
  MESSENGERS: { name: '#2 传令官', hint: '停在深色格时抽取讯息' },
  FERRIES: { name: '#3 渡轮', hint: '湖面渡轮连接道路' },
  GOLDMINES: { name: '#4 金矿', hint: '完成地形时分配金块' },
  MAGE_AND_WITCH: { name: '#5 法师与女巫', hint: '法师加分、女巫减半' },
  ROBBERS: { name: '#6 强盗', hint: '在计分轨上抢夺分数' },
  CROP_CIRCLES: { name: '#7 麦田怪圈', hint: '所有人增派或撤回米宝' },
};

export const COLOR_HEX: Record<PlayerColor, string> = {
  RED: '#d63b2f',
  BLUE: '#2f6fd6',
  GREEN: '#2f9e44',
  YELLOW: '#f2c230',
  BLACK: '#2b2b2b',
  PINK: '#e46fb4',
};

export const COLOR_NAMES: Record<PlayerColor, string> = {
  RED: '红',
  BLUE: '蓝',
  GREEN: '绿',
  YELLOW: '黄',
  BLACK: '黑',
  PINK: '粉',
};

export const FIGURE_NAMES: Record<FigureKind, string> = {
  MEEPLE: '米宝',
  LARGE: '大米宝',
  ABBOT: '修道院长',
  BUILDER: '建造者',
  PIG: '猪',
};

export const FEATURE_NAMES: Record<FeatureKind, string> = {
  CITY: '城市',
  ROAD: '道路',
  FIELD: '草地',
  MONASTERY: '修道院',
  GARDEN: '花园',
  RIVER: '河流',
};

export const GOOD_NAMES = { WINE: '酒', WHEAT: '麦', CLOTH: '布' } as const;

export const MESSAGE_TEXT: Record<number, string> = {
  1: '为你最小的道路计分（米宝留在原处）',
  2: '为你最小的城市计分（米宝留在原处）',
  3: '为你最小的修道院计分（米宝留在原处）',
  4: '再抽一张板块并放置（完整的额外回合）',
  5: '你有骑士的城市中每个盾徽得 2 分',
  6: '你在城市中的每个骑士得 2 分',
  7: '你在草地中的每个农夫得 2 分',
  8: '选择一个你的米宝：若占多数则按终局为其地形计分，然后收回',
};

const DIR_NAMES = ['北', '东', '南', '西'];

export interface LabelContext {
  view: ClientView;
  names: string[];
  cat: TileCatalog;
}

export function featureKindAt(ctx: LabelContext, x: number, y: number, feature: number): FeatureKind | null {
  const p = ctx.view.board.tiles[coordKey(x, y)];
  return p ? (ctx.cat.tiles[p.tileId]?.features[feature]?.kind ?? null) : null;
}

function featureLabel(ctx: LabelContext, x: number, y: number, feature: number): string {
  const kind = featureKindAt(ctx, x, y, feature);
  return kind ? FEATURE_NAMES[kind] : `地形 ${feature}`;
}

function figureLabel(ctx: LabelContext, id: number | undefined): string {
  const f = ctx.view.figures.find((g) => g.id === id);
  if (!f) return `棋子 #${id}`;
  return `${featureLabel(ctx, f.x, f.y, f.feature)} (${f.x}, ${f.y}) 的${FIGURE_NAMES[f.kind]}`;
}

function pierLabel(ctx: LabelContext, x: number, y: number, feature: number): string {
  const p = ctx.view.board.tiles[coordKey(x, y)];
  if (!p) return String(feature);
  return featureDirections(ctx.cat, p, feature)
    .map((d) => DIR_NAMES[d])
    .join('');
}

export function describeAction(a: Action, ctx: LabelContext): string {
  switch (a.type) {
    case 'PLACE_ROBBER':
      return `强盗放到计分格 ${a.space}（${ctx.names
        .filter((_, i) => {
          const p = ctx.view.players[i];
          return i !== a.player && (p.score % 50 === a.space || p.messengerScore % 50 === a.space);
        })
        .join('、')}）`;
    case 'KEEP_ROBBER':
      return '强盗留在原处';
    case 'PLACE_TILE':
      return `放置板块 (${a.x}, ${a.y}) 旋转 ${a.rotation}°`;
    case 'PLACE_MAGIC':
      return `${a.figure === 'MAGE' ? '法师' : '女巫'} → ${featureLabel(ctx, a.x, a.y, a.feature)} (${a.x}, ${a.y})`;
    case 'REMOVE_MAGIC':
      return `移除${a.figure === 'MAGE' ? '法师' : '女巫'}（没有可去的地形）`;
    case 'PLACE_GOLD':
      return `第二块金块放在 (${a.x}, ${a.y})`;
    case 'PLACE_FIGURE':
      return `${FIGURE_NAMES[a.kind]} → ${featureLabel(ctx, ctx.view.turn.part.x, ctx.view.turn.part.y, a.feature)}`;
    case 'FLY':
      return `让${FIGURE_NAMES[a.kind]}乘飞行器起飞`;
    case 'LAND': {
      const p = ctx.view.pending;
      return p?.type === 'LAND' ? `降落在${featureLabel(ctx, p.x, p.y, a.feature)}` : '降落';
    }
    case 'RECALL_ABBOT':
      return '召回修道院长并立即计分';
    case 'SKIP_FIGURE':
      return '不放置棋子';
    case 'PLACE_FERRY':
    case 'MOVE_FERRY': {
      const p = ctx.view.pending;
      if (!p || (p.type !== 'PLACE_FERRY' && p.type !== 'MOVE_FERRY')) return '渡轮';
      const fr = ctx.view.board.ferries.find((f) => f.x === p.x && f.y === p.y);
      const same = fr && ((fr.a === a.a && fr.b === a.b) || (fr.a === a.b && fr.b === a.a));
      const label = `${pierLabel(ctx, p.x, p.y, a.a)} ↔ ${pierLabel(ctx, p.x, p.y, a.b)}`;
      return a.type === 'MOVE_FERRY' && same ? `渡轮保持 ${label}` : `渡轮连接码头 ${label}`;
    }
    case 'CHOOSE_SCORE_FIGURE':
      return a.figure === 'SCORE' ? '移动计分米宝' : '移动传令官';
    case 'PICK_GOLD':
      return `拿取 (${a.x}, ${a.y}) 上的金块`;
    case 'CHOOSE_VICTIM':
      return `抢劫 ${ctx.names[a.victim] ?? a.victim}`;
    case 'RESOLVE_MESSAGE':
      if (!a.perform) return '不执行讯息，改为得 2 分';
      return a.figureId !== undefined ? `执行讯息：${figureLabel(ctx, a.figureId)}` : '执行讯息';
    case 'CHOOSE_CROP_MODE':
      return a.mode === 'ADD' ? 'A：每位玩家可增派一个米宝' : 'B：每位玩家须撤回一个米宝';
    case 'CROP_ADD':
      return `在${figureLabel(ctx, a.nextTo)}旁增派${FIGURE_NAMES[a.kind]}`;
    case 'CROP_SKIP':
      return '不增派';
    case 'CROP_REMOVE':
      return `撤回${figureLabel(ctx, a.figureId)}`;
  }
}

export function describePending(p: Pending, ctx: LabelContext): string {
  const who = ctx.names[p.player] ?? `玩家 ${p.player + 1}`;
  switch (p.type) {
    case 'PLACE_ROBBER':
      return `${who} 放置强盗`;
    case 'PLACE_TILE':
      return `${who} 放置板块`;
    case 'MAGIC':
      return p.reason === 'SYMBOL' ? `${who} 移动法师或女巫` : `${who} 必须分开法师与女巫`;
    case 'PLACE_GOLD':
      return `${who} 放置第二块金块`;
    case 'FIGURE':
      return `${who} 放置棋子`;
    case 'LAND':
      return `${who} 选择降落地形`;
    case 'PLACE_FERRY':
      return `${who} 放置渡轮`;
    case 'MOVE_FERRY':
      return `${who} 可以移动渡轮`;
    case 'SCORE_FIGURE':
      return `${who} 获得 ${p.points} 分：选择移动哪个计分棋子`;
    case 'PICK_GOLD':
      return `${who} 拿取金块`;
    case 'CHOOSE_VICTIM':
      return `${who} 选择抢劫对象`;
    case 'MESSAGE':
      return `${who} 抽到讯息 ${p.message}：${MESSAGE_TEXT[p.message]}`;
    case 'CROP_MODE':
      return `${who} 选择麦田怪圈模式`;
    case 'CROP_ACTION':
      return p.mode === 'ADD' ? `${who} 可以增派米宝` : `${who} 必须撤回一个米宝`;
  }
}

export function describeEvent(e: GameEvent, ctx: Omit<LabelContext, 'view'>): string | null {
  const who = (i: unknown) => (typeof i === 'number' ? (ctx.names[i] ?? `玩家 ${i + 1}`) : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(who).join('、') : '');
  const feature = (k: unknown) => FEATURE_NAMES[k as FeatureKind] ?? String(k);
  switch (e.type) {
    case 'GAME_STARTED':
      return '游戏开始';
    case 'TILE_DRAWN':
      return null;
    case 'TILE_DISCARDED':
      return `${who(e.player)} 抽到无法放置的板块，弃置后重抽`;
    case 'TILE_PLACED':
      return `${who(e.player)} 在 (${e.x}, ${e.y}) 放置板块`;
    case 'FIGURE_PLACED':
      return `${who(e.player)} 放置${FIGURE_NAMES[e.kind as FigureKind] ?? e.kind}`;
    case 'FIGURE_RETURNED':
      return null;
    case 'FEATURE_COMPLETED':
      return `${feature(e.kind)}完成（${e.tiles} 块，${e.points} 分）${Array.isArray(e.owners) && e.owners.length ? `：${list(e.owners)}` : ''}`;
    case 'POINTS':
      return `${who(e.player)} +${e.points} 分${e.figure === 'MESSENGER' ? '（传令官）' : ''}`;
    case 'ROBBER_PLACED':
      return `${who(e.player)} 把强盗放到计分格 ${e.space}`;
    case 'ROBBER_STOLE':
      return `${who(e.player)} 的强盗从 ${who(e.victim)} 处抢得 ${e.points} 分`;
    case 'ROBBER_MOVED_ALONG':
      return null;
    case 'MAGIC_PLACED':
    case 'MAGIC_MOVED':
      return `${who(e.player)} 移动了${e.figure === 'WITCH' ? '女巫' : '法师'}`;
    case 'MAGIC_REMOVED':
      return `${e.figure === 'WITCH' ? '女巫' : '法师'}离开棋盘`;
    case 'MAGIC_NO_TARGET':
      return '法师/女巫没有可去的地形';
    case 'GOLD_PLACED':
      return `${who(e.player)} 放置金块`;
    case 'GOLD_TAKEN':
      return `${who(e.player)} 拿到一块金块`;
    case 'GOLD_DISCARDED':
      return `弃置 ${e.ingots} 块未分配的金块`;
    case 'FLIGHT':
      return `${who(e.player)} 的飞行器飞了 ${e.distance} 格${e.canLand ? '' : '，无处降落'}`;
    case 'ABBOT_RECALLED':
      return `${who(e.player)} 召回修道院长（${e.points} 分）`;
    case 'FERRY_PLACED':
      return `${who(e.player)} 放置渡轮`;
    case 'FERRY_MOVED':
      return `${who(e.player)} 移动渡轮`;
    case 'FERRY_KEPT':
      return null;
    case 'GOODS_TAKEN':
      return `${who(e.player)} 获得货物：${GOOD_NAMES[e.good as keyof typeof GOOD_NAMES] ?? e.good}`;
    case 'MESSAGE_DRAWN':
      return `${who(e.player)} 抽到讯息 ${e.message}`;
    case 'MESSAGE_RESOLVED':
      return `${who(e.player)} ${e.performed ? '执行了讯息' : '放弃讯息，得 2 分'}`;
    case 'CROP_CIRCLE':
      return `麦田怪圈：${e.mode === 'ADD' ? '增派' : '撤回'}`;
    case 'BUILDER_EXTRA_TILE':
      return `${who(e.player)} 的建造者带来额外板块`;
    case 'GAME_END_REACHED':
      return '板块用尽，开始终局计分';
    case 'FINAL_FEATURE':
      return Array.isArray(e.owners) && e.owners.length ? `终局：${feature(e.kind)} ${e.points} 分 → ${list(e.owners)}` : null;
    case 'GAME_OVER':
      return `游戏结束，胜者：${list(e.winners)}`;
    default:
      return e.type;
  }
}
