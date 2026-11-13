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

export type ModuleId = Exclude<ExpansionId, 'BASE'>;

export const EXPANSION_INFO: Record<ModuleId, { name: string; hint: string }> = {
  STREAM: { name: '溪流开局', hint: '先用 12 块河道地块铺出一条溪流，再正常摸牌' },
  HERMIT: { name: '隐士与园林', hint: '每人多一位隐士，只进寺院或园林，可提前召回结分' },
  PAVILIONS: { name: '茶亭与钟楼', hint: '茶亭让驿道加分、钟楼让城池加分；多一位算 2 人的领队' },
  MARKETS: { name: '集市与工匠', hint: '完成城池分酒、粮、丝；工匠能多放一块，耕牛让田野加分' },
  KITES: { name: '纸鸢', hint: '放纸鸢地块时，随从可以顺风飞出 1–3 格落到别处' },
  COURIERS: { name: '驿使密函', hint: '第二枚计分棋子驿使停在整五格时拆一封密函' },
  CROSSINGS: { name: '渡口', hint: '湖上的渡船把驿道接起来，之后还能挪动' },
  SILVER: { name: '银窖', hint: '银窖放出银锭，完成地形时归多数方，终局换分' },
  OMENS: { name: '福星与煞星', hint: '福星让地形每块多 1 分，煞星让得分减半' },
  BROKERS: { name: '掮客', hint: '把掮客押在别人的计分格上，对方得分你分一半' },
  BANNERS: { name: '号令旗', hint: '号令旗地块让所有人为同类随从增援或撤回' },
};

/** How the setup screen groups the modules: by what they change. */
export const MODULE_GROUPS: ReadonlyArray<{ label: string; modules: readonly ModuleId[] }> = [
  { label: '地形', modules: ['STREAM', 'CROSSINGS', 'SILVER', 'KITES'] },
  { label: '人物', modules: ['HERMIT', 'PAVILIONS', 'MARKETS'] },
  { label: '计分', modules: ['COURIERS', 'BROKERS', 'OMENS', 'BANNERS'] },
];

export const MAGIC_NAMES = { MAGE: '福星', WITCH: '煞星' } as const;

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
  MEEPLE: '随从',
  LARGE: '领队',
  ABBOT: '隐士',
  BUILDER: '工匠',
  PIG: '耕牛',
};

export const FEATURE_NAMES: Record<FeatureKind, string> = {
  CITY: '城池',
  ROAD: '驿道',
  FIELD: '田野',
  MONASTERY: '寺院',
  GARDEN: '园林',
  RIVER: '河道',
};

export const GOOD_NAMES = { WINE: '酒', WHEAT: '粮', CLOTH: '丝' } as const;

/** The eight sealed letters of 驿使密函 (numbered 1–8 in the engine). */
export const MESSAGE_TEXT: Record<number, string> = {
  1: '挑一条有你随从的驿道，按终局方式先结一次分（随从不收回）',
  2: '挑一座有你随从的城池，按终局方式先结一次分（随从不收回）',
  3: '挑一座有你随从的寺院，按终局方式先结一次分（随从不收回）',
  4: '立刻再摸一块地块，完整多走一回合',
  5: '你有随从的城池里，每面旗帜得 2 分',
  6: '你在城池里的每位随从得 2 分',
  7: '你在田野里的每位随从得 2 分',
  8: '挑一位你的随从：若它所在地形你占多数，按终局方式结分后收回',
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
      return `掮客押到计分格 ${a.space}（${ctx.names
        .filter((_, i) => {
          const p = ctx.view.players[i];
          return i !== a.player && (p.score % 50 === a.space || p.messengerScore % 50 === a.space);
        })
        .join('、')}）`;
    case 'KEEP_ROBBER':
      return '掮客留在原处';
    case 'PLACE_TILE':
      return `放置地块 (${a.x}, ${a.y}) 旋转 ${a.rotation}°`;
    case 'PLACE_MAGIC':
      return `${MAGIC_NAMES[a.figure]} → ${featureLabel(ctx, a.x, a.y, a.feature)} (${a.x}, ${a.y})`;
    case 'REMOVE_MAGIC':
      return `移走${MAGIC_NAMES[a.figure]}（没有可去的地形）`;
    case 'PLACE_GOLD':
      return `第二枚银锭放在 (${a.x}, ${a.y})`;
    case 'PLACE_FIGURE':
    {
      const { x, y } = ctx.view.turn.part;
      const where = pierLabel(ctx, x, y, a.feature);
      const side = /^[北东南西]+$/.test(where) ? `（${where}侧）` : '';
      return `${FIGURE_NAMES[a.kind]} → ${featureLabel(ctx, x, y, a.feature)}${side}`;
    }
    case 'FLY':
      return `让${FIGURE_NAMES[a.kind]}乘纸鸢飞出`;
    case 'LAND': {
      const p = ctx.view.pending;
      return p?.type === 'LAND' ? `降落在${featureLabel(ctx, p.x, p.y, a.feature)}` : '降落';
    }
    case 'RECALL_ABBOT':
      return '召回隐士并立即结分';
    case 'SKIP_FIGURE':
      return '这回合不派人';
    case 'PLACE_FERRY':
    case 'MOVE_FERRY': {
      const p = ctx.view.pending;
      if (!p || (p.type !== 'PLACE_FERRY' && p.type !== 'MOVE_FERRY')) return '渡船';
      const fr = ctx.view.board.ferries.find((f) => f.x === p.x && f.y === p.y);
      const same = fr && ((fr.a === a.a && fr.b === a.b) || (fr.a === a.b && fr.b === a.a));
      const label = `${pierLabel(ctx, p.x, p.y, a.a)} ↔ ${pierLabel(ctx, p.x, p.y, a.b)}`;
      return a.type === 'MOVE_FERRY' && same ? `渡船留在 ${label}` : `渡船连接码头 ${label}`;
    }
    case 'CHOOSE_SCORE_FIGURE':
      return a.figure === 'SCORE' ? '移动计分棋子' : '移动驿使';
    case 'PICK_GOLD':
      return `拿走 (${a.x}, ${a.y}) 上的银锭`;
    case 'CHOOSE_VICTIM':
      return `从 ${ctx.names[a.victim] ?? a.victim} 那里分成`;
    case 'RESOLVE_MESSAGE':
      if (!a.perform) return '不拆密函，改拿 2 分';
      return a.figureId !== undefined ? `拆密函：${figureLabel(ctx, a.figureId)}` : '拆密函';
    case 'CHOOSE_CROP_MODE':
      return a.mode === 'ADD' ? '增援：每人可再派一位同类随从' : '撤回：每人必须收回一位同类随从';
    case 'CROP_ADD':
      return `在${figureLabel(ctx, a.nextTo)}旁增援一位${FIGURE_NAMES[a.kind]}`;
    case 'CROP_SKIP':
      return '不增援';
    case 'CROP_REMOVE':
      return `收回${figureLabel(ctx, a.figureId)}`;
  }
}

export function describePending(p: Pending, ctx: LabelContext): string {
  const who = ctx.names[p.player] ?? `玩家 ${p.player + 1}`;
  switch (p.type) {
    case 'PLACE_ROBBER':
      return `${who} 押掮客`;
    case 'PLACE_TILE':
      return `${who} 放地块`;
    case 'MAGIC':
      return p.reason === 'SYMBOL' ? `${who} 移动福星或煞星` : `${who} 必须把福星和煞星分开`;
    case 'PLACE_GOLD':
      return `${who} 放第二枚银锭`;
    case 'FIGURE':
      return `${who} 派随从`;
    case 'LAND':
      return `${who} 选择降落地形`;
    case 'PLACE_FERRY':
      return `${who} 放渡船`;
    case 'MOVE_FERRY':
      return `${who} 可以挪动渡船`;
    case 'SCORE_FIGURE':
      return `${who} 得 ${p.points} 分：选择移动哪枚计分棋子`;
    case 'PICK_GOLD':
      return `${who} 拿银锭`;
    case 'CHOOSE_VICTIM':
      return `${who} 选择分成对象`;
    case 'MESSAGE':
      return `${who} 拆开第 ${p.message} 封密函：${MESSAGE_TEXT[p.message]}`;
    case 'CROP_MODE':
      return `${who} 选择号令：增援还是撤回`;
    case 'CROP_ACTION':
      return p.mode === 'ADD' ? `${who} 可以增援一位随从` : `${who} 必须收回一位随从`;
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
      return `${who(e.player)} 摸到放不下的地块，弃掉重摸`;
    case 'TILE_PLACED':
      return `${who(e.player)} 在 (${e.x}, ${e.y}) 放下地块`;
    case 'FIGURE_PLACED':
      return `${who(e.player)} 派出${FIGURE_NAMES[e.kind as FigureKind] ?? e.kind}`;
    case 'FIGURE_RETURNED':
      return null;
    case 'FEATURE_COMPLETED':
      return `${feature(e.kind)}完成（${e.tiles} 块，${e.points} 分）${Array.isArray(e.owners) && e.owners.length ? `：${list(e.owners)}` : ''}`;
    case 'POINTS':
      return `${who(e.player)} +${e.points} 分${e.figure === 'MESSENGER' ? '（驿使）' : ''}`;
    case 'ROBBER_PLACED':
      return `${who(e.player)} 把掮客押到计分格 ${e.space}`;
    case 'ROBBER_STOLE':
      return `${who(e.player)} 的掮客从 ${who(e.victim)} 那里分得 ${e.points} 分`;
    case 'ROBBER_MOVED_ALONG':
      return null;
    case 'MAGIC_PLACED':
    case 'MAGIC_MOVED':
      return `${who(e.player)} 移动了${e.figure === 'WITCH' ? '煞星' : '福星'}`;
    case 'MAGIC_REMOVED':
      return `${e.figure === 'WITCH' ? '煞星' : '福星'}离开版图`;
    case 'MAGIC_NO_TARGET':
      return '福星/煞星没有可去的地形';
    case 'GOLD_PLACED':
      return `${who(e.player)} 放下银锭`;
    case 'GOLD_TAKEN':
      return `${who(e.player)} 拿到一枚银锭`;
    case 'GOLD_DISCARDED':
      return `${e.ingots} 枚无主银锭被收走`;
    case 'FLIGHT':
      return `${who(e.player)} 的纸鸢飞了 ${e.distance} 格${e.canLand ? '' : '，没有落脚处'}`;
    case 'ABBOT_RECALLED':
      return `${who(e.player)} 召回隐士（${e.points} 分）`;
    case 'FERRY_PLACED':
      return `${who(e.player)} 放下渡船`;
    case 'FERRY_MOVED':
      return `${who(e.player)} 挪动渡船`;
    case 'FERRY_KEPT':
      return null;
    case 'GOODS_TAKEN':
      return `${who(e.player)} 拿到货物：${GOOD_NAMES[e.good as keyof typeof GOOD_NAMES] ?? e.good}`;
    case 'MESSAGE_DRAWN':
      return `${who(e.player)} 拆开第 ${e.message} 封密函`;
    case 'MESSAGE_RESOLVED':
      return `${who(e.player)} ${e.performed ? '照密函行事' : '放弃密函，拿 2 分'}`;
    case 'CROP_CIRCLE':
      return `号令旗：${e.mode === 'ADD' ? '增援' : '撤回'}`;
    case 'BUILDER_EXTRA_TILE':
      return `${who(e.player)} 的工匠多放一块地块`;
    case 'GAME_END_REACHED':
      return '地块摸完，开始终局结算';
    case 'FINAL_FEATURE':
      return Array.isArray(e.owners) && e.owners.length ? `终局：${feature(e.kind)} ${e.points} 分 → ${list(e.owners)}` : null;
    case 'GAME_OVER':
      return `游戏结束，胜者：${list(e.winners)}`;
    default:
      return e.type;
  }
}
