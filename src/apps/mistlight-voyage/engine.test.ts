import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_DEFS, LEVELS } from './content.ts';
import {
  act,
  changePosition,
  createRun,
  isRotatable,
  reflect,
  signal,
  solve,
  starRating,
  traceLight,
  undo,
} from './engine.ts';
import {
  freshProgress,
  isUnlocked,
  loadProgress,
  parseProgress,
  saveProgress,
} from './storage.ts';
import type { Level } from './types.ts';

test('十二关均未预先通关、坐标不重叠、存在有限最短解且能实际结算', () => {
  assert.equal(LEVELS.length, 12);
  for (const level of LEVELS) {
    const occupied = new Set<string>();
    for (const item of [...level.tiles, ...level.sources, ...level.beacons]) {
      assert.ok(
        item.x >= 0 &&
          item.x < level.size &&
          item.y >= 0 &&
          item.y < level.size,
      );
      const key = `${item.x},${item.y}`;
      assert.ok(!occupied.has(key), `${level.id}: ${key} 重叠`);
      occupied.add(key);
    }
    let run = createRun(level);
    assert.equal(traceLight(level, run).solved, false, level.id);
    const solution = solve(level, run);
    assert.ok(solution && solution.actions.length > 0, level.id);
    for (const action of solution.actions) run = act(level, run, action);
    assert.equal(traceLight(level, run).solved, true, level.id);
    run = signal(level, run);
    assert.equal(run.won, true);
    for (const difficulty of ['relaxed', 'standard', 'expert'] as const)
      assert.equal(starRating(level, run, difficulty), 3);
    assert.equal(act(level, run, solution.actions[0]), run);
  }
});

test('四个方向遵循两种镜面反射，分光保留直射，双色目标要求同时到达', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((d) => reflect(d as 0 | 1 | 2 | 3, 0)),
    [3, 2, 1, 0],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((d) => reflect(d as 0 | 1 | 2 | 3, 1)),
    [1, 0, 3, 2],
  );
  const fork = LEVELS[2];
  const solution = solve(fork, createRun(fork))!;
  assert.equal(traceLight(fork, solution.position).lit.length, 2);
  const dual = LEVELS[8];
  const position = solve(dual, createRun(dual))!.position;
  assert.equal(traceLight(dual, position).received.both, 3);
  assert.equal(
    traceLight({ ...dual, sources: dual.sources.slice(0, 1) }, position).solved,
    false,
  );
  assert.equal(
    traceLight({ ...dual, sources: dual.sources.slice(1) }, position).solved,
    false,
  );
});

test('潮礁和潮镜同轮更新；提示从每一种朝向找到更近的可达解', () => {
  for (const level of [LEVELS[4], LEVELS[5], LEVELS[9]]) {
    const start = createRun(level);
    const solution = solve(level, start)!;
    assert.equal(solution.position.tide, 1);
    assert.equal(
      traceLight(level, { ...solution.position, tide: 0 }).solved,
      false,
    );
    const mirrors = level.tiles.filter(isRotatable);
    for (let mask = 0; mask < 2 ** mirrors.length; mask++) {
      const state = {
        ...start,
        turns: Object.fromEntries(
          mirrors.map((tile, i) => [tile.id, (mask >> i) & 1]),
        ),
      };
      const hint = solve(level, state)!;
      assert.ok(hint);
      if (hint.actions.length) {
        const next = changePosition(level, state, hint.actions[0]);
        assert.equal(
          solve(level, next)!.actions.length,
          hint.actions.length - 1,
        );
      }
    }
  }
});

test('回环不会无限追光；礁石和未对色的航标不会被错误点亮', () => {
  const level: Level = {
    id: 'loop',
    name: '',
    chapter: '',
    description: '',
    size: 5,
    initialTide: 0,
    sources: [{ x: 0, y: 1, direction: 0, color: 1 }],
    beacons: [{ id: 'b', x: 4, y: 4, color: 2 }],
    tiles: [
      { id: 'a', x: 1, y: 1, kind: 'splitter', initial: 1 },
      { id: 'b', x: 1, y: 3, kind: 'mirror', initial: 1 },
      { id: 'c', x: 3, y: 3, kind: 'mirror', initial: 0 },
      { id: 'd', x: 3, y: 1, kind: 'mirror', initial: 1 },
    ],
  };
  const trace = traceLight(level, createRun(level));
  assert.equal(trace.loop, true);
  assert.ok(trace.segments.length < 100);
  assert.equal(trace.solved, false);
});

test('撤回恢复整盘和步数，误发信号不扣步，不合法动作不修改状态', () => {
  const level = LEVELS[4];
  const original = createRun(level);
  const rotated = act(level, original, { type: 'rotate', id: 'a' });
  const tidal = act(level, rotated, { type: 'tide' });
  assert.deepEqual(undo(undo(tidal)), original);
  assert.equal(signal(level, original), original);
  assert.equal(act(level, original, { type: 'rotate', id: 'g' }), original);
  assert.equal(act(LEVELS[0], createRun(LEVELS[0]), { type: 'tide' }).moves, 0);
  assert.deepEqual(original, createRun(level));
});

test('三档难度按真实步数和提示评级，首关仅需一次操作且没有失败惩罚', () => {
  const level = LEVELS[0];
  const completed = signal(
    level,
    act(level, createRun(level), { type: 'rotate', id: 'a' }),
  );
  assert.equal(completed.moves, 1);
  assert.equal(DIFFICULTY_DEFS.standard.hints, 3);
  assert.equal(DIFFICULTY_DEFS.expert.hints, 0);
  assert.equal(starRating(level, { ...completed, moves: 5 }, 'relaxed'), 3);
  assert.equal(starRating(level, { ...completed, moves: 5 }, 'expert'), 2);
  assert.equal(starRating(level, { ...completed, hints: 1 }, 'standard'), 2);
});

test('存档往返保留进度、盘面与撤回；损坏数据、未来版本与禁用存储安全回退', () => {
  const progress = freshProgress();
  progress.records[LEVELS[0].id] = {
    stars: 3,
    moves: 1,
    difficulty: 'standard',
  };
  progress.active = {
    levelId: LEVELS[1].id,
    run: act(LEVELS[1], createRun(LEVELS[1]), { type: 'rotate', id: 'a' }),
  };
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  assert.equal(isUnlocked(LEVELS[1].id, progress), true);
  assert.equal(isUnlocked(LEVELS[2].id, progress), false);
  for (const raw of [
    '{broken',
    'null',
    '[]',
    '{"version":2}',
    '{"version":1,"active":false}',
  ])
    assert.deepEqual(parseProgress(raw), freshProgress());
  const bad = {
    ...progress,
    active: {
      levelId: LEVELS[1].id,
      run: { turns: { a: 50 }, tide: 3, moves: -1 },
    },
  };
  assert.deepEqual(
    parseProgress(JSON.stringify(bad)).active?.run,
    createRun(LEVELS[1]),
  );
  const storage = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.deepEqual(loadProgress(storage), freshProgress());
  assert.equal(saveProgress(progress, storage), false);
});
