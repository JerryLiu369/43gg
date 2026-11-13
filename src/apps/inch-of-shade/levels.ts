import type { LevelDef } from './types.ts';

/**
 * 二十道关卡。每关的 par（最少步数）由 engine.test.ts 用求解器逐一校验；
 * 带花盆、水缸的关必须推动才能过，带流云的关没有云影就过不去。
 *
 * 地图字符见 LevelDef.map 的注释。第 0 行通常是正房的屋檐（常阴）。
 */
export const LEVELS: ReadonlyArray<LevelDef> = [
  /* ---------------- 第一章 · 檐下 ---------------- */
  {
    id: 'yan-xia',
    chapter: 0,
    name: '檐下',
    note: '猫只肯走在影子里。先走进槐树的影子，再等日头西斜，影子会变长。',
    startPhase: 3,
    map: ['c===...', '..l....', '..T....', '......F'],
    par: 9,
  },
  {
    id: 'wu-ying',
    chapter: 0,
    name: '午影',
    note: '午时影子朝北，还比物件矮一格——石墩在正午没有影子。',
    map: ['.c====', '.~.s..', '.....l', '.....F', '....b.'],
    par: 7,
  },
  {
    id: 'fen-qiang',
    chapter: 0,
    name: '粉墙',
    note: '辰时、申时的影子比物件高出一格；巳时、未时与物件一样长。',
    map: ['====c..', '...w...', '......b', '.ww....', '.s.b...', '....F..'],
    par: 9,
  },
  {
    id: 'shi-deng',
    chapter: 0,
    name: '石灯',
    note: '等日头之前，先站到下个时辰依旧阴凉的地方。预览里的小爪印就是这样的格子。',
    map: ['..====c', '...h...', '.....ww', 's..T~..', '.l..~..', '..F..l.'],
    par: 11,
  },
  {
    id: 'huai-yin',
    chapter: 0,
    name: '槐荫',
    note: '上午影子朝西，下午朝东。正午最难熬，要提前找好落脚处。',
    map: ['=====c=', '.~..T..', '..Tr...', '.T.....', '....T..', 'T......', '...TF..'],
    par: 15,
  },

  /* ---------------- 第二章 · 花盆 ---------------- */
  {
    id: 'mo-li',
    chapter: 1,
    name: '茉莉',
    note: '顶着花盆走一步就能推动它，花盆的影子也跟着挪。',
    map: ['=c....', '..~r..', '....w.', '.w.o..', '.wr..F'],
    par: 8,
  },
  {
    id: 'yue-ji',
    chapter: 1,
    name: '月季',
    note: '花盆只有一格高，正午没有影子。推之前想想它下午会把影子投到哪里。',
    map: ['=c==..', '...r..', 'r.o..l', '.T....', '.....~', '..F..~'],
    par: 12,
  },
  {
    id: 'shuang-pen',
    chapter: 1,
    name: '双盆',
    note: '推错了可以撤回，放心试。',
    map: ['=c====.', '.o.l...', '..o...r', '.......', '....wTF'],
    par: 13,
  },
  {
    id: 'pen-jing',
    chapter: 1,
    name: '盆景',
    note: '花盆推到墙角或水边就拉不回来了。',
    map: ['c====..', '....l..', '.o.o...', '...T..F'],
    par: 19,
  },
  {
    id: 'man-ting-fang',
    chapter: 1,
    name: '满庭芳',
    note: '三只花盆，一条阴凉小路。',
    map: ['.=====c', '..o.s..', '.......', '.w...o.', '.w..o..', '~.h..b.', '~....F.'],
    par: 25,
  },

  /* ---------------- 第三章 · 流云 ---------------- */
  {
    id: 'fu-yun',
    chapter: 2,
    name: '浮云',
    note: '云影不看太阳：每过一个时辰，它就顺着箭头飘一格。',
    map: ['.=c====', '...b...', '.h.....', '......F'],
    clouds: [{ cells: [[0, 0], [1, 0], [1, 1]], origin: [0, 3], drift: [1, 0] }],
    par: 11,
  },
  {
    id: 'yun-jiao',
    chapter: 2,
    name: '云脚',
    note: '跟在云影下面，它会把你送过晒场。',
    map: ['===c===', '...l...', '.l.....', '...rw..', '......F'],
    clouds: [{ cells: [[0, 0], [1, 0], [0, 1], [1, 1]], origin: [0, 4], drift: [1, 0] }],
    par: 13,
  },
  {
    id: 'yun-pen',
    chapter: 2,
    name: '云与盆',
    note: '云往南飘，花盆可以替你搭上第一段路。',
    map: ['======c', '....o..', '..b.r..', '...T...', '.......', '...F...'],
    clouds: [{ cells: [[0, 0], [1, 0], [1, 1]], origin: [4, 2], drift: [0, 1] }],
    par: 12,
  },
  {
    id: 'xing-yun',
    chapter: 2,
    name: '行云',
    note: '云来之前，先把落脚的影子准备好。',
    map: ['c======', 'w....o.', '...ol..', '.......', '.......', '...F...', '..b....'],
    clouds: [{ cells: [[0, 0], [1, 0], [2, 0], [1, 1]], origin: [5, 4], drift: [0, 1] }],
    par: 18,
  },
  {
    id: 'feng-qi',
    chapter: 2,
    name: '风起',
    note: '两片云，一片往南，一片往东。',
    map: ['..===c=', '...o..l', '...o...', '.......', '.......', '.....T.', '.....~F'],
    clouds: [
      { cells: [[0, 0], [1, 0], [1, 1]], origin: [4, -1], drift: [0, 1] },
      { cells: [[0, 0], [1, 0], [2, 0]], origin: [1, -1], drift: [1, 0] },
    ],
    par: 23,
  },

  /* ---------------- 第四章 · 水缸 ---------------- */
  {
    id: 'da-gang',
    chapter: 3,
    name: '大缸',
    note: '水缸有两格高，正午也能投下一格影子。',
    map: ['===c===', '....l..', '..v....', 'l.l....', '.......', '....F..'],
    par: 12,
  },
  {
    id: 'gang-bian',
    chapter: 3,
    name: '缸边',
    note: '花盆和水缸挡在一起时，谁也推不动。',
    map: ['==c==..', '..o..b.', '.v...~.', 'l....~.', '.wwwF~.'],
    par: 16,
  },
  {
    id: 'gang-yun',
    chapter: 3,
    name: '缸影随云',
    note: '一片云从西边飘来。',
    map: ['====c=.', '..v...b', '...b...', '..~....', '.......', '..s.b..', '.....F.'],
    clouds: [{ cells: [[0, 0], [1, 0], [0, 1], [1, 1]], origin: [-2, 4], drift: [1, 0] }],
    par: 17,
  },
  {
    id: 'chi-qi',
    chapter: 3,
    name: '迟起',
    note: '睡过了头，这一天从巳时开始。',
    startPhase: 1,
    map: ['=c==...', '.o...w.', '~...vw.', '.....w.', '.......', '.......', '.l..hF.'],
    par: 18,
  },
  {
    id: 'cun-yin',
    chapter: 3,
    name: '寸阴',
    note: '尺璧非宝，寸阴是竞。',
    map: ['===c==.', '..v...T', '.o.b.~.', '.....o.', '.......', '.......', '.......', '..F....'],
    clouds: [{ cells: [[0, 0], [1, 0], [0, 1], [1, 1]], origin: [-1, 4], drift: [0, -1] }],
    par: 26,
  },
];

export const LEVEL_IDS: ReadonlyArray<string> = LEVELS.map((level) => level.id);

export function levelIndexById(id: string | null | undefined): number {
  if (!id) return -1;
  return LEVELS.findIndex((level) => level.id === id);
}

/**
 * 关卡解锁：前两关始终开放；之后可以先跳过一道未解的关继续往下玩，避免卡死在一关上。
 */
export function isLevelUnlocked(index: number, solvedIds: ReadonlySet<string>): boolean {
  if (index < 2) return true;
  let unsolvedBefore = 0;
  for (let i = 0; i < index; i++) {
    if (!solvedIds.has(LEVELS[i].id)) unsolvedBefore++;
  }
  return unsolvedBefore < 2;
}
