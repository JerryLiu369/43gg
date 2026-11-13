import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleState,
  executeTacticalActionInPlace,
  findBestTacticalAction,
  getReachableTiles,
  getThreatenedCitadels,
  getUnitAt,
  getUnitById,
  resetCurrentTurn,
  resolveEndTurn,
  rotateLuopanCoord,
  simulateActionPreview,
  undoUnitMove,
} from './engine.ts';

test('rotateLuopanCoord rotates 3x3 ring bijectively around (3,3) for CW and CCW', () => {
  // North of center (2,3) -> CW is East (3,4) -> CW is South (4,3) -> CW is West (3,2) -> back to (2,3)
  const n = { r: 2, c: 3 };
  const e = rotateLuopanCoord(n, true);
  assert.deepEqual(e, { r: 3, c: 4 });
  const s = rotateLuopanCoord(e, true);
  assert.deepEqual(s, { r: 4, c: 3 });
  const w = rotateLuopanCoord(s, true);
  assert.deepEqual(w, { r: 3, c: 2 });
  const backN = rotateLuopanCoord(w, true);
  assert.deepEqual(backN, n);

  // CCW reverses CW
  assert.deepEqual(rotateLuopanCoord(e, false), n);
  // Outside ring stays unchanged
  assert.deepEqual(rotateLuopanCoord({ r: 0, c: 1 }, true), { r: 0, c: 1 });
});

test('Luopan ring rotation shifts enemy position, rotates its attack direction, and saves threatened Citadel', () => {
  const state = createBattleState(0);
  // In Sector 0 Turn 1, enemy_1_juggernaut starts at (2,3) on the Luopan ring aiming South (dir=2)
  const jugg = getUnitById(state, 'enemy_1_juggernaut');
  assert.ok(jugg);
  assert.equal(jugg.r, 2);
  assert.equal(jugg.c, 3);
  assert.equal(jugg.intent?.dir, 2);

  const preview = simulateActionPreview(state, {
    kind: 'luopan_rotate',
    clockwise: true,
  });
  assert.equal(preview.valid, true);

  const ok = executeTacticalActionInPlace(state, {
    kind: 'luopan_rotate',
    clockwise: true,
  });
  assert.equal(ok, true);
  assert.equal(jugg.r, 3);
  assert.equal(jugg.c, 4);
  // Dir 2 (South) rotated CW becomes Dir 3 (West)
  assert.equal(jugg.intent?.dir, 3);
});

test('Seismic Hammer push triggers unit-to-unit collision damage and chasm instakill', () => {
  const state = createBattleState(0);
  const titan = getUnitById(state, 'mech_titan')!;
  const jugg = getUnitById(state, 'enemy_1_juggernaut')!;
  const scorp = getUnitById(state, 'enemy_2_scorpion')!;

  // Place Titan at (3,3), Juggernaut at (2,3), and Scorpion directly behind Juggernaut at (1,3)
  titan.r = 3;
  titan.c = 3;
  jugg.r = 2;
  jugg.c = 3;
  jugg.hp = 5;
  scorp.r = 1;
  scorp.c = 3;
  scorp.hp = 2;

  const ok = executeTacticalActionInPlace(state, {
    kind: 'weapon',
    unitUid: titan.uid,
    slot: 'primary',
    target: { r: 2, c: 3 },
  });
  assert.equal(ok, true);
  // Juggernaut takes 2 hammer dmg + 1 collision dmg = 3 dmg (5 -> 2 HP)
  assert.equal(jugg.hp, 2);
  // Scorpion takes 1 collision dmg (2 -> 1 HP)
  assert.equal(scorp.hp, 1);

  // Now test pushing East into a chasm tile at (0,5)
  titan.hasActed = false;
  titan.r = 0;
  titan.c = 3;
  scorp.r = 0;
  scorp.c = 4;
  scorp.hp = 5;
  state.board[0][5].terrain = 'chasm';

  executeTacticalActionInPlace(state, {
    kind: 'weapon',
    unitUid: titan.uid,
    slot: 'primary',
    target: { r: 0, c: 4 },
  });
  assert.equal(scorp.hp, 0, 'Enemy pushed into chasm must be instakilled');
  assert.ok(state.chainKills >= 1);
});

test('Water drowning cancels non-flying enemy intent, and Arc Lightning conducts through connected water tiles', () => {
  const state = createBattleState(0);
  const arbalest = getUnitById(state, 'mech_arbalest')!;
  const jugg = getUnitById(state, 'enemy_1_juggernaut')!;
  const scorp = getUnitById(state, 'enemy_2_scorpion')!;

  // Set (2,2) and (2,3) as connected water tiles
  state.board[2][2].terrain = 'water';
  state.board[2][3].terrain = 'water';
  jugg.r = 2;
  jugg.c = 2;
  jugg.hp = 4;
  scorp.r = 2;
  scorp.c = 3;
  scorp.hp = 3;
  arbalest.r = 4;
  arbalest.c = 2;

  const lightningPath: Array<{ r: number; c: number }> = [];
  const ok = executeTacticalActionInPlace(
    state,
    {
      kind: 'weapon',
      unitUid: arbalest.uid,
      slot: 'secondary',
      target: { r: 2, c: 2 },
    },
    [],
    lightningPath,
  );
  assert.equal(ok, true);
  assert.ok(lightningPath.length >= 2, 'Lightning must chain across connected water tiles');
  assert.equal(jugg.hp, 2);
  assert.equal(scorp.hp, 1);
  assert.equal(jugg.intent, null, 'Shocked enemy in water loses attack intent');
});

test('Undo move and Temporal Reset restore player state accurately', () => {
  const state = createBattleState(0);
  const geomancer = getUnitById(state, 'mech_geomancer')!;
  const startR = geomancer.r;
  const startC = geomancer.c;

  const reachable = getReachableTiles(state, geomancer.uid);
  assert.ok(reachable.length > 0);
  const dest = reachable[0];

  assert.equal(
    executeTacticalActionInPlace(state, {
      kind: 'move',
      unitUid: geomancer.uid,
      to: dest,
    }),
    true,
  );
  assert.equal(geomancer.r, dest.r);
  assert.equal(geomancer.c, dest.c);

  assert.equal(undoUnitMove(state, geomancer.uid), true);
  assert.equal(geomancer.r, startR);
  assert.equal(geomancer.c, startC);
  assert.equal(geomancer.hasMoved, false);

  // Rotate Luopan then use Temporal Reset to restore full turn start
  executeTacticalActionInPlace(state, {
    kind: 'luopan_rotate',
    clockwise: true,
  });
  assert.equal(state.luopanCharges, 1);

  const restored = resetCurrentTurn(state);
  assert.ok(restored);
  assert.equal(restored.luopanCharges, 2);
  assert.equal(restored.resetsRemaining, 0);
});

test('Friendly-fire redirection ("借刀杀人") damages enemy during resolveEndTurn and 4 turns complete victory', () => {
  const state = createBattleState(0);
  const jugg = getUnitById(state, 'enemy_1_juggernaut')!;
  const bastion = getUnitById(state, 'enemy_3_bastion')!;

  // Aim Juggernaut East (dir=1) at Bastion standing at (2,4)
  jugg.r = 2;
  jugg.c = 2;
  jugg.intent = {
    pattern: 'charge_line',
    dir: 1,
    targetCoord: { r: 2, c: 4 },
    affectedTiles: [
      { r: 2, c: 3 },
      { r: 2, c: 4 },
    ],
    pushDir: 1,
    damage: 2,
  };
  bastion.r = 2;
  bastion.c = 4;
  bastion.hp = 3;
  bastion.intent = null;

  // Also clear Scorpion intent so Citadels stay safe
  const scorp = getUnitById(state, 'enemy_2_scorpion')!;
  scorp.intent = null;

  resolveEndTurn(state);
  assert.ok(state.friendlyFireCount >= 1, 'Friendly fire should be recorded');
  assert.equal(state.turn, 2);

  // Advisor should always return a valid tactical recommendation on player_turn
  const best = findBestTacticalAction(state);
  assert.ok(best && best.valid);

  // Advance remaining turns to verify 4-turn sector defense victory
  for (let t = state.turn; t <= state.maxTurns; t++) {
    for (const u of state.units) {
      if (u.team === 'enemy') u.intent = null;
    }
    resolveEndTurn(state);
  }
  assert.equal(state.phase, 'victory');
});

test('Threatened citadels detection identifies enemy telegraphs on citadel tiles', () => {
  const state = createBattleState(0);
  const threatened = getThreatenedCitadels(state);
  assert.ok(threatened.length >= 1, 'Initial turn must have at least one threatened citadel');
  for (const coord of threatened) {
    const tile = state.board[coord.r][coord.c];
    assert.equal(tile.terrain, 'citadel');
  }
});

test('Three difficulty tiers scale grid power, Luopan charges, resets, shields, and enemy count appropriately', () => {
  const casual = createBattleState(0, [], undefined, undefined, 2, 0, false, 0, 101, 'casual');
  const standard = createBattleState(0, [], undefined, undefined, 2, 0, false, 0, 101, 'standard');
  const master = createBattleState(0, [], undefined, undefined, 2, 0, false, 0, 101, 'master');

  assert.equal(casual.maxGridPower, 7);
  assert.equal(standard.maxGridPower, 6);
  assert.equal(master.maxGridPower, 5);

  assert.equal(casual.luopanCharges, 3);
  assert.equal(standard.luopanCharges, 2);
  assert.equal(master.luopanCharges, 2);

  assert.equal(casual.resetsRemaining, 2);
  assert.equal(standard.resetsRemaining, 1);

  const casualTitan = getUnitById(casual, 'mech_titan')!;
  assert.equal(casualTitan.shielded, true, 'Casual Mechs start with initial protective shield');
  assert.ok(
    casual.units.filter((u) => u.team === 'enemy').length <
      standard.units.filter((u) => u.team === 'enemy').length,
    'Casual Sector 0 starts with fewer enemies for gentle onboarding',
  );
});

