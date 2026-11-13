import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_DEFS, LEVELS } from './content.ts';
import {
  applyPuzzleAction,
  createPuzzleState,
  findSolution,
  getLegalActions,
  getMoveLimit,
  getStars,
  replaySolution,
  simulateLight,
} from './engine.ts';
import { LIGHT_CYAN, LIGHT_GOLD, LIGHT_ROSE } from './types.ts';

test('all nine handcrafted gardens have a valid optimal solution on every difficulty', () => {
  assert.equal(LEVELS.length, 9);
  LEVELS.forEach((level, index) => {
    assert.equal(level.index, index);
    const initial = createPuzzleState(level);
    assert.equal(initial.status, 'playing', `${level.id} must not start solved`);
    assert.ok(initial.pieces.length > 0);

    for (const difficulty of Object.keys(DIFFICULTY_DEFS) as Array<keyof typeof DIFFICULTY_DEFS>) {
      const solved = replaySolution(level, difficulty);
      assert.equal(solved.status, 'won', `${level.id} canonical solution fails on ${difficulty}`);
      assert.equal(solved.moves, level.par);
      assert.ok(simulateLight(level, solved.pieces).flowers.every((flower) => flower.lit));
    }

    const optimal = findSolution(level);
    assert.ok(optimal, `${level.id} should be solvable from its initial state`);
    assert.equal(optimal.length, level.par, `${level.id} par must be the true optimum`);
  });
});

test('mirror geometry, splitters, portals and color union are deterministic', () => {
  const split = LEVELS.find((level) => level.id === 'twin-dew')!;
  const splitSolved = replaySolution(split);
  const splitLight = simulateLight(split, splitSolved.pieces);
  assert.equal(splitLight.flowers.length, 2);
  assert.ok(splitLight.flowers.every((flower) => flower.lit));
  assert.ok(splitLight.paths.length >= 2);

  const portal = LEVELS.find((level) => level.id === 'far-near')!;
  const portalLight = simulateLight(portal, replaySolution(portal).pieces);
  assert.equal(new Set(portalLight.paths.map((path) => path.id)).size, portalLight.paths.length);
  assert.ok(replaySolution(portal).status === 'won');

  const chorus = LEVELS.find((level) => level.id === 'color-chorus')!;
  const chorusLight = simulateLight(chorus, replaySolution(chorus).pieces);
  const mixed = chorusLight.flowers.find((flower) => flower.id === 'chorus')!;
  assert.equal(mixed.received & LIGHT_GOLD, LIGHT_GOLD);
  assert.equal(mixed.received & LIGHT_CYAN, LIGHT_CYAN);
  assert.equal(mixed.lit, true);

  const white = LEVELS.find((level) => level.id === 'three-colors')!;
  const whiteLight = simulateLight(white, replaySolution(white).pieces).flowers[0];
  assert.equal(whiteLight.received & LIGHT_ROSE, LIGHT_ROSE);
  assert.equal(whiteLight.received, LIGHT_GOLD | LIGHT_CYAN | LIGHT_ROSE);
});

test('movement only enters adjacent empty floor and rotations cannot target splitters', () => {
  const level = LEVELS[0];
  const state = createPuzzleState(level);
  const legal = getLegalActions(level, state);
  assert.ok(legal.some((action) => action.kind === 'move' && action.pieceId === 'b' && action.to?.c === 3));
  assert.ok(!legal.some((action) => action.pieceId === 'a' && action.kind === 'move'));

  const blocked = applyPuzzleAction(
    level,
    state,
    { kind: 'move', pieceId: 'b', to: { r: 4, c: 4 } },
    'standard',
  );
  assert.equal(blocked, state, 'illegal actions preserve object identity');

  const split = LEVELS[1];
  assert.ok(!getLegalActions(split, createPuzzleState(split)).some((action) => action.pieceId === 'prism'));
});

test('move limits, last-step wins, loss and stars follow the difficulty contract', () => {
  const level = LEVELS[0];
  assert.equal(getMoveLimit(level, 'casual'), 10);
  assert.equal(getMoveLimit(level, 'standard'), 5);
  assert.equal(getMoveLimit(level, 'master'), 2);

  const solved = replaySolution(level, 'master');
  assert.equal(solved.status, 'won');
  assert.equal(solved.moves, getMoveLimit(level, 'master'));
  assert.equal(getStars(level, 2), 3);
  assert.equal(getStars(level, 4), 2);
  assert.equal(getStars(level, 8), 1);

  let state = createPuzzleState(level);
  state = applyPuzzleAction(level, state, { kind: 'rotate', pieceId: 'b' }, 'master');
  state = applyPuzzleAction(level, state, { kind: 'rotate', pieceId: 'b' }, 'master');
  assert.equal(state.status, 'lost');
  assert.deepEqual(getLegalActions(level, state), []);
});

test('solver finds a recovery route after the player makes a detour', () => {
  const level = LEVELS[0];
  let state = createPuzzleState(level);
  state = applyPuzzleAction(level, state, { kind: 'rotate', pieceId: 'b' }, 'casual');
  const recovery = findSolution(level, state);
  assert.ok(recovery);
  assert.equal(recovery.length, 3);
  assert.ok(recovery.some((action) => action.kind === 'rotate' && action.pieceId === 'b'));
  for (const action of recovery) state = applyPuzzleAction(level, state, action, 'casual');
  assert.equal(state.status, 'won');
});
