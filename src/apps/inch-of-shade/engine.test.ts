import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  PHASES,
  shadowLength,
  stepBudget,
} from './content.ts';
import {
  applyAction,
  applyMove,
  applyWait,
  computeShade,
  computeWalkMap,
  createInitialState,
  nextHintSegment,
  parseLevel,
  safeWaitCells,
  solve,
  walkPath,
} from './engine.ts';
import { LEVELS, isLevelUnlocked } from './levels.ts';
import { createDefaultMeta, loadMeta, recordSolve, saveMeta, META_STORAGE_KEY } from './storage.ts';
import type { LevelDef, PuzzleState } from './types.ts';

function tiny(map: string[], extra: Partial<LevelDef> = {}): LevelDef {
  return { id: 'tiny', chapter: 0, name: '测试', note: '', map, par: 0, ...extra };
}

function idx(level: { width: number }, x: number, y: number): number {
  return y * level.width + x;
}

test('影长：早晚比高度长一格、巳未相等、正午短一格且朝北', () => {
  assert.deepEqual(
    PHASES.map((p) => shadowLength(p.index, 1)),
    [2, 1, 0, 1, 2],
  );
  assert.deepEqual(
    PHASES.map((p) => shadowLength(p.index, 3)),
    [4, 3, 2, 3, 4],
  );
  assert.deepEqual(PHASES[0].shadowDir, [-1, 0]);
  assert.deepEqual(PHASES[2].shadowDir, [0, -1]);
  assert.deepEqual(PHASES[4].shadowDir, [1, 0]);
});

test('parseLevel 拒绝缺猫、缺终点、宽度不齐与未知字符', () => {
  assert.throws(() => parseLevel(tiny(['...', '..F'])), /缺少猫/);
  assert.throws(() => parseLevel(tiny(['C..', '...'])), /缺少鱼干架/);
  assert.throws(() => parseLevel(tiny(['C..', '.F'])), /宽度不一致/);
  assert.throws(() => parseLevel(tiny(['C.?', '..F'])), /未知字符/);
  const level = parseLevel(tiny(['c=.', 'o.F']));
  assert.equal(level.tiles[0], 'eave');
  assert.deepEqual(level.movableKinds, ['pot']);
  assert.equal(level.catStart, 0);
});

test('阴影由屋檐、固定摆件、花盆与云影合成，并在棋盘边缘截断', () => {
  const level = parseLevel(
    tiny(['=.....', '......', '...l..', 'C...oF'], {
      clouds: [{ cells: [[0, 0]], origin: [5, 0], drift: [-1, 0] }],
    }),
  );
  const morning = computeShade(level, 0, level.initialMovables);
  // 石灯高 2：辰时向西 3 格
  assert.equal(morning[idx(level, 2, 2)], 1);
  assert.equal(morning[idx(level, 0, 2)], 1);
  assert.equal(morning[idx(level, 4, 2)], 0);
  // 花盆高 1：辰时向西 2 格
  assert.equal(morning[idx(level, 3, 3)], 1);
  assert.equal(morning[idx(level, 2, 3)], 1);
  assert.equal(morning[idx(level, 1, 3)], 0);
  // 屋檐常阴；云影在 (5,0)
  assert.equal(morning[idx(level, 0, 0)], 1);
  assert.equal(morning[idx(level, 5, 0)], 1);

  const noon = computeShade(level, 2, level.initialMovables);
  assert.equal(noon[idx(level, 3, 1)], 1, '石灯正午向北 1 格');
  assert.equal(noon[idx(level, 3, 3)], 0, '花盆正午没有影子');
  assert.equal(noon[idx(level, 5, 0)], 0, '云影飘走了');
  assert.equal(noon[idx(level, 3, 0)], 1, '两个时辰后云影向西飘了两格');
  assert.equal(level.cloudShade[2][idx(level, 3, 0)], 1);
});

test('移动：撞墙、落水、出界被拦下；只走阴凉，凉爪可以踩一次阳光', () => {
  const level = parseLevel(tiny(['c=..', '~s..', '...F']));
  const start = createInitialState(level, 0);
  assert.deepEqual(applyMove(level, start, 'up'), { ok: false, reason: 'edge', at: null });
  assert.equal((applyMove(level, start, 'down') as { reason: string }).reason, 'water');
  const onEave = applyMove(level, start, 'right');
  assert.ok(onEave.ok);
  const s1 = (onEave as { state: PuzzleState }).state;
  assert.equal((applyMove(level, s1, 'down') as { reason: string }).reason, 'fixture');
  // (2,0) 在辰时是晒着的
  const hot = applyMove(level, s1, 'right');
  assert.equal(hot.ok, false);
  assert.equal((hot as { reason: string }).reason, 'hot');

  const withPaw = createInitialState(level, 1);
  const a = applyMove(level, withPaw, 'right');
  assert.ok(a.ok);
  const b = applyMove(level, (a as { state: PuzzleState }).state, 'right');
  assert.ok(b.ok && b.usedPaw);
  const bs = (b as { state: PuzzleState }).state;
  assert.equal(bs.paws, 0);
  assert.equal(bs.pawsUsed, 1);
  assert.equal(bs.steps, 2);
});

test('终点无论晒不晒都能踏上，并判定胜利', () => {
  const level = parseLevel(tiny(['cF']));
  const res = applyMove(level, createInitialState(level, 0), 'right');
  assert.ok(res.ok);
  assert.equal((res as { state: PuzzleState }).state.won, true);
  assert.equal(applyMove(level, (res as { state: PuzzleState }).state, 'left').ok, false);
});

test('推动：花盆随猫前进并带走影子；挡在摆件、另一个可推物、终点或边缘前时推不动', () => {
  const level = parseLevel(tiny(['=c=...', '.o.l..', '.o....', '.....F']));
  let state = createInitialState(level, 0);
  // 往下推第一只花盆会撞上第二只
  const blocked = applyMove(level, state, 'down');
  assert.equal(blocked.ok, false);
  assert.equal((blocked as { reason: string }).reason, 'push-blocked');

  state = (applyMove(level, state, 'right') as { state: PuzzleState }).state;
  // (2,1) 被石灯影子覆盖；从这里向左推花盆
  state = (applyMove(level, state, 'down') as { state: PuzzleState }).state;
  assert.equal(state.cat, idx(level, 2, 1));
  const pushed = applyMove(level, state, 'left');
  assert.ok(pushed.ok);
  assert.equal(pushed.pushed, 0);
  const after = (pushed as { state: PuzzleState }).state;
  assert.equal(after.movables[0], idx(level, 0, 1));
  assert.equal(after.movables[1], idx(level, 1, 2), '另一只花盆不动');

  const edgeLevel = parseLevel(tiny(['co', '.F']));
  const edge = applyMove(edgeLevel, createInitialState(edgeLevel, 0), 'right');
  assert.equal((edge as { reason: string }).reason, 'push-blocked');

  const goalLevel = parseLevel(tiny(['coF']));
  assert.equal((applyMove(goalLevel, createInitialState(goalLevel, 0), 'right') as { reason: string }).reason, 'push-blocked');
});

test('等日头：下一个时辰会晒到时拒绝；申时之后日落；凉爪可以硬扛一次', () => {
  const level = parseLevel(tiny(['c....', '..b..', '....F']));
  const start = createInitialState(level, 0);
  // 屋檐常阴，可以一直等到申时
  let s = start;
  for (let p = 0; p < 4; p++) {
    const r = applyWait(level, s);
    assert.ok(r.ok, `第 ${p} 次等待应当成功`);
    s = (r as { state: PuzzleState }).state;
  }
  assert.equal(s.phase, 4);
  assert.equal(s.waits, 4);
  assert.equal((applyWait(level, s) as { reason: string }).reason, 'sunset');

  // 站在竹丛西边的影子里，正午影子转向北，会被晒到
  const level2 = parseLevel(tiny(['.....', 'C.b..', '....F'], { startPhase: 1 }));
  const st2 = createInitialState(level2, 0);
  const moved = applyMove(level2, st2, 'right');
  assert.ok(moved.ok);
  const w = applyWait(level2, (moved as { state: PuzzleState }).state);
  assert.equal(w.ok, false);
  assert.equal((w as { reason: string }).reason, 'hot');
  const st3 = createInitialState(level2, 1);
  const moved3 = (applyMove(level2, st3, 'right') as { state: PuzzleState }).state;
  const w3 = applyWait(level2, moved3);
  assert.ok(w3.ok && w3.usedPaw);
});

test('safeWaitCells 只标出现在与下一时辰都阴凉的格子', () => {
  const level = parseLevel(tiny(['c....', '...T.', '....F']));
  const state = createInitialState(level, 0);
  const safe = safeWaitCells(level, state);
  assert.ok(safe);
  assert.equal(safe![idx(level, 0, 0)], 1, '屋檐');
  assert.equal(safe![idx(level, 2, 1)], 1, '辰时 4 格、巳时 3 格都覆盖');
  assert.equal(safe![idx(level, 0, 1)], 1);
  const late = { ...state, phase: 4 as const };
  assert.equal(safeWaitCells(level, late), null);
});

test('寻路只穿过阴凉格并能还原方向序列', () => {
  const level = parseLevel(tiny(['c===.', '.....', '....F']));
  const state = createInitialState(level, 0);
  const walk = computeWalkMap(level, state);
  assert.equal(walk.dist[idx(level, 3, 0)], 3);
  assert.equal(walk.dist[idx(level, 4, 0)], -1);
  assert.deepEqual(walkPath(level, walk, state.cat, idx(level, 3, 0)), ['right', 'right', 'right']);
  assert.equal(walkPath(level, walk, state.cat, idx(level, 0, 2)), null);
});

test('nextHintSegment 把动作序列切成一段行走或一次等日头', () => {
  assert.deepEqual(nextHintSegment([]), []);
  assert.deepEqual(nextHintSegment([{ type: 'wait' }, { type: 'move', dir: 'up' }]), [{ type: 'wait' }]);
  assert.deepEqual(
    nextHintSegment([
      { type: 'move', dir: 'up' },
      { type: 'move', dir: 'left' },
      { type: 'wait' },
      { type: 'move', dir: 'down' },
    ]),
    [
      { type: 'move', dir: 'up' },
      { type: 'move', dir: 'left' },
    ],
  );
});

test('二十关全部可解，par 与求解器给出的最少步数一致，按解法回放能叼到鱼干', () => {
  assert.equal(LEVELS.length, 20);
  const ids = new Set<string>();
  for (const def of LEVELS) {
    assert.match(def.id, /^[a-z-]+$/);
    assert.ok(!ids.has(def.id), `重复的关卡 id：${def.id}`);
    ids.add(def.id);
    assert.ok(def.note.trim().length > 0, `${def.id} 缺少提示语`);
    const level = parseLevel(def);
    assert.ok(level.width <= 8 && level.height <= 8, `${def.id} 棋盘过大，手机竖屏放不下`);
    const start = createInitialState(level, 0);
    const result = solve(level, start);
    assert.ok(result.solvable, `${def.id} 无解`);
    assert.equal(result.steps, def.par, `${def.id} 的 par 应为 ${result.steps}`);
    assert.ok(
      result.actions.some((a) => a.type === 'wait'),
      `${def.id} 应当至少需要等一次日头`,
    );
    let state = start;
    for (const action of result.actions) {
      const res = applyAction(level, state, action);
      assert.ok(res.ok, `${def.id} 回放失败`);
      state = (res as { state: PuzzleState }).state;
    }
    assert.equal(state.won, true);
    assert.equal(state.steps, def.par);
    assert.equal(state.pawsUsed, 0);
  }
});

test('带花盆或水缸的关必须推动；带流云的关离不开云影', () => {
  for (const def of LEVELS) {
    const level = parseLevel(def);
    const start = createInitialState(level, 0);
    if (level.movableKinds.length > 0) {
      assert.equal(
        solve(level, start, { frozenMovables: true }).solvable,
        false,
        `${def.id} 不推也能过`,
      );
    }
    if (def.clouds && def.clouds.length > 0) {
      const noCloud = parseLevel({ ...def, clouds: [] });
      assert.equal(solve(noCloud, createInitialState(noCloud, 0)).solvable, false, `${def.id} 没有云也能过`);
    }
  }
});

test('章节循序渐进：每章五关、机制按章引入、首章是低压热身', () => {
  assert.equal(CHAPTERS.length, 4);
  for (const chapter of CHAPTERS) {
    assert.equal(LEVELS.filter((l) => l.chapter === chapter.index).length, 5);
  }
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].chapter >= LEVELS[i - 1].chapter, '关卡按章节排序');
  }
  for (const def of LEVELS) {
    const level = parseLevel(def);
    if (def.chapter === 0) {
      assert.equal(level.movableKinds.length, 0);
      assert.equal(def.clouds, undefined);
      assert.ok(def.par <= 15, `${def.id} 作为热身关步数过多`);
    }
    if (def.chapter < 2) assert.equal(def.clouds, undefined, `${def.id} 提前出现了流云`);
    if (def.chapter < 3) assert.ok(!level.movableKinds.includes('vat'), `${def.id} 提前出现了水缸`);
    if (def.chapter < 1) assert.ok(!level.movableKinds.includes('pot'));
  }
  // 第一关只需一次等日头
  const first = solve(parseLevel(LEVELS[0]), createInitialState(parseLevel(LEVELS[0]), 0));
  assert.equal(first.actions.filter((a) => a.type === 'wait').length, 1);
  // 每章最后一关比第一关难
  for (const chapter of CHAPTERS) {
    const inChapter = LEVELS.filter((l) => l.chapter === chapter.index);
    assert.ok(inChapter[inChapter.length - 1].par > inChapter[0].par);
  }
});

test('三档难度：凉爪与提示逐档减少，只有宗师限步且上限留有余量', () => {
  assert.deepEqual(DIFFICULTY_ORDER, ['casual', 'standard', 'master']);
  const [casual, standard, master] = DIFFICULTY_ORDER.map((d) => DIFFICULTY_DEFS[d]);
  assert.ok(casual.paws > standard.paws && standard.paws >= master.paws);
  assert.equal(casual.hints, -1);
  assert.ok(standard.hints > master.hints);
  assert.equal(stepBudget('casual', 20), null);
  assert.equal(stepBudget('standard', 20), null);
  for (const def of LEVELS) {
    const budget = stepBudget('master', def.par) as number;
    assert.ok(budget >= def.par + 2, `${def.id} 宗师步数上限太紧`);
    assert.ok(budget <= def.par + Math.ceil(def.par * 0.2) + 2);
  }
});

test('轻松档的凉爪只会让关卡更容易', () => {
  for (const def of LEVELS) {
    const level = parseLevel(def);
    const eased = solve(level, createInitialState(level, DIFFICULTY_DEFS.casual.paws));
    assert.ok(eased.solvable);
    assert.ok(eased.steps <= def.par, `${def.id} 有凉爪反而更难`);
  }
});

test('解锁规则：前两关开放，最多先跳过一关', () => {
  const none = new Set<string>();
  assert.equal(isLevelUnlocked(0, none), true);
  assert.equal(isLevelUnlocked(1, none), true);
  assert.equal(isLevelUnlocked(2, none), false);
  const first = new Set([LEVELS[0].id]);
  assert.equal(isLevelUnlocked(2, first), true);
  assert.equal(isLevelUnlocked(3, first), false);
  const skipped = new Set([LEVELS[0].id, LEVELS[2].id]);
  assert.equal(isLevelUnlocked(3, skipped), true);
  assert.equal(isLevelUnlocked(4, skipped), false);
});

test('存档：读写往返、损坏数据回退、未知关卡被丢弃、「妙」印只在不用凉爪且达标时获得', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const ids = LEVELS.map((l) => l.id);
  assert.deepEqual(loadMeta(ids, storage), createDefaultMeta());

  store.set(META_STORAGE_KEY, '{broken');
  assert.deepEqual(loadMeta(ids, storage), createDefaultMeta());

  store.set(
    META_STORAGE_KEY,
    JSON.stringify({
      records: {
        'yan-xia': { solved: true, bestSteps: 11, seal: false },
        'no-such-level': { solved: true, bestSteps: 3, seal: true },
        'wu-ying': { solved: false, bestSteps: 4, seal: true },
      },
      lastLevelId: 'gone',
      preferredDifficulty: 'insane',
      tutorialCompleted: 1,
    }),
  );
  const meta = loadMeta(ids, storage);
  assert.deepEqual(Object.keys(meta.records).sort(), ['wu-ying', 'yan-xia']);
  assert.deepEqual(meta.records['wu-ying'], { solved: false, bestSteps: null, seal: false });
  assert.equal(meta.lastLevelId, null);
  assert.equal(meta.preferredDifficulty, 'standard');
  assert.equal(meta.tutorialCompleted, true);

  const withPaw = recordSolve(meta, 'yan-xia', 9, 9, 1);
  assert.equal(withPaw.meta.records['yan-xia'].seal, false);
  assert.equal(withPaw.meta.records['yan-xia'].bestSteps, 9);
  assert.equal(withPaw.improved, true);
  const clean = recordSolve(withPaw.meta, 'yan-xia', 9, 9, 0);
  assert.equal(clean.sealEarned, true);
  assert.equal(clean.improved, false);
  const worse = recordSolve(clean.meta, 'yan-xia', 15, 9, 0);
  assert.equal(worse.meta.records['yan-xia'].bestSteps, 9);
  assert.equal(worse.meta.records['yan-xia'].seal, true);

  saveMeta(worse.meta, storage);
  assert.deepEqual(loadMeta(ids, storage).records['yan-xia'], { solved: true, bestSteps: 9, seal: true });
});
