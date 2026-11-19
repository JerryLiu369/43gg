import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_LEFT,
  BOARD_RIGHT,
  CAMPAIGN_STAGE_COUNT,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  ORB_LIST,
  RELIC_LIST,
  STAGE_DEFS,
} from './content.ts';
import {
  computeAimPreview,
  computeAutoAimAngle,
  computeExpectedShotDamage,
  createNewForgeRun,
  enterEndlessMode,
  fireOrb,
  selectForgeReward,
  selectOrbIndex,
  stepSimulation,
  triggerBellowsPulse,
} from './engine.ts';
import { createDefaultMeta, parseMetaJson } from './storage.ts';

test('content defines 6 stages, 8 orbs, 12 relics, 6 enemy archetypes and ordered difficulties', () => {
  assert.equal(STAGE_DEFS.length, CAMPAIGN_STAGE_COUNT);
  assert.equal(ORB_LIST.length, 8);
  assert.equal(RELIC_LIST.length, 12);
  assert.equal(Object.keys(ENEMY_DEFS).length, 6);

  // Difficulty ordering: casual easier than standard easier than master
  assert.ok(DIFFICULTY_DEFS.casual.startHp > DIFFICULTY_DEFS.standard.startHp);
  assert.ok(DIFFICULTY_DEFS.standard.startHp > DIFFICULTY_DEFS.master.startHp);
  assert.ok(DIFFICULTY_DEFS.casual.enemyHpScale < DIFFICULTY_DEFS.standard.enemyHpScale);
  assert.ok(DIFFICULTY_DEFS.standard.enemyHpScale < DIFFICULTY_DEFS.master.enemyHpScale);
  assert.ok(DIFFICULTY_DEFS.casual.baseBellowsCharges >= DIFFICULTY_DEFS.standard.baseBellowsCharges);
});

test('all 6 campaign stages spawn non-overlapping pegs inside board bounds and valid enemies', () => {
  for (let s = 0; s < CAMPAIGN_STAGE_COUNT; s++) {
    const run = createNewForgeRun('standard', 100 + s, s);
    assert.ok(run.pegs.length >= 22, `Stage ${s} should have plenty of pegs`);
    assert.ok(run.enemies.length >= 1, `Stage ${s} must spawn enemies`);

    for (const peg of run.pegs) {
      assert.ok(peg.x >= BOARD_LEFT + peg.radius, `Peg ${peg.id} left out of bounds`);
      assert.ok(peg.x <= BOARD_RIGHT - peg.radius, `Peg ${peg.id} right out of bounds`);
    }

    // Verify no severe overlap on base coordinates
    for (let i = 0; i < run.pegs.length; i++) {
      for (let j = i + 1; j < run.pegs.length; j++) {
        const a = run.pegs[i];
        const b = run.pegs[j];
        if (a.orbitRadius || b.orbitRadius) continue;
        const dist = Math.hypot(a.baseX - b.baseX, a.baseY - b.baseY);
        assert.ok(dist >= 28, `Stage ${s} pegs ${a.id} & ${b.id} overlap (${dist.toFixed(1)}px)`);
      }
    }
  }
});

test('opening seconds without input keep player safe and animated board kinematics ticking', () => {
  const run = createNewForgeRun('standard', 42, 0);
  const startHp = run.hp;
  const startCrucibleX = run.crucibleX;

  for (let i = 0; i < 120; i++) {
    stepSimulation(run, 1 / 60);
  }
  assert.equal(run.hp, startHp);
  assert.equal(run.phase, 'aiming');
  assert.notEqual(run.crucibleX, startCrucibleX, 'Crucible should glide smoothly while aiming');
});

test('aim preview locates pegs and firing orb hits pegs, accumulates damage, and damages enemy', () => {
  const run = createNewForgeRun('standard', 2026, 0);
  const autoAngle = computeAutoAimAngle(run);
  const preview = computeAimPreview(run, autoAngle);
  assert.ok(preview.points.length >= 2);
  assert.ok(preview.hitPoint !== null, 'Auto-aim angle must predict a peg hit');

  const initialEnemyHp = run.enemies[0].hp;
  const fired = fireOrb(run, autoAngle);
  assert.equal(fired, true);
  assert.equal(run.phase, 'firing');
  assert.ok(run.balls.length >= 1);

  let totalPegHits = 0;
  let totalEnemyDmg = 0;

  for (let frame = 0; frame < 900; frame++) {
    const ev = stepSimulation(run, 1 / 60);
    totalPegHits += ev.pegHits.length;
    for (const h of ev.enemyHit) totalEnemyDmg += h.damage;
    const phase = run.phase as string;
    if (phase === 'aiming' || phase === 'forge_reward' || phase === 'victory') {
      break;
    }
  }

  assert.ok(totalPegHits >= 1, 'Shot must hit at least one peg');
  assert.ok(totalEnemyDmg > 0, 'Volley must damage enemy');
  assert.ok(run.enemies[0].hp < initialEnemyHp || run.enemies[0].dead);
});

test('active Bellows Pulse lifts falling ball, triggers shockwave, consumes charge and respects cooldown', () => {
  const run = createNewForgeRun('standard', 77, 0);
  const startCharges = run.bellowsCharges;
  fireOrb(run, Math.PI / 2);

  // Let ball travel downward into the peg field
  for (let i = 0; i < 24; i++) {
    stepSimulation(run, 1 / 60);
  }
  assert.equal(run.phase, 'firing');
  const ballBefore = run.balls.find((b) => b.alive);
  assert.ok(ballBefore);

  const pulsed = triggerBellowsPulse(run);
  assert.equal(pulsed, true);
  assert.equal(run.bellowsCharges, startCharges - 1);
  assert.ok(ballBefore.vy < -200, 'Bellows pulse must lift ball strongly upward');
  assert.ok(run.shockwaves.length >= 1);

  // Immediate second trigger blocked by cooldown
  assert.equal(triggerBellowsPulse(run), false);
});

test('twin_spark spawns two orbs and selecting orbs updates deck index cleanly', () => {
  const run = createNewForgeRun('standard', 99, 0);
  selectOrbIndex(run, 1); // twin_spark
  assert.equal(run.deck[run.activeOrbIndex].typeId, 'twin_spark');
  fireOrb(run, Math.PI / 2);
  assert.equal(run.balls.length, 2, 'Twin Spark orb must launch 2 simultaneous balls');
});

test('defeat is genuinely reachable when furnace HP falls to 0 during enemy turns', () => {
  const run = createNewForgeRun('master', 505, 1);
  run.hp = 6;
  run.shield = 0;
  // Make enemies very tanky so player shots do not kill them
  for (const e of run.enemies) {
    e.hp = 9999;
    e.maxHp = 9999;
  }

  // Play up to 3 turns until enemy attacks finish off the furnace
  for (let turn = 0; turn < 3 && (run.phase as string) !== 'defeat'; turn++) {
    if (run.phase === 'aiming') {
      run.shield = 0;
      fireOrb(run, Math.PI / 2);
    }
    for (let frame = 0; frame < 900; frame++) {
      stepSimulation(run, 1 / 60);
      const phase = run.phase as string;
      if (phase === 'defeat' || phase === 'aiming') break;
    }
  }

  assert.equal(run.phase, 'defeat', 'Enemy attack must be able to defeat low-HP player');
  assert.equal(run.hp, 0);
  assert.equal(run.summary?.outcome, 'defeat');
});

test('clearing Stage 1 opens Forge Reward modal with 3 options and advances to Stage 2', () => {
  const run = createNewForgeRun('casual', 888, 0);
  run.enemies[0].hp = 5;

  fireOrb(run, computeAutoAimAngle(run));
  for (let frame = 0; frame < 900; frame++) {
    stepSimulation(run, 1 / 60);
    if (run.phase === 'forge_reward') break;
  }

  assert.equal(run.phase, 'forge_reward');
  assert.equal(run.pendingRewards.length, 3);

  const selected = selectForgeReward(run, 1);
  assert.equal(selected, true);
  assert.equal(run.stageIndex, 1);
  assert.equal(run.phase, 'aiming');
});

test('clearing Final Boss triggers Victory and allows entering Endless Mode', () => {
  const run = createNewForgeRun('standard', 303, CAMPAIGN_STAGE_COUNT - 1);
  assert.equal(run.enemies[0].archetype, 'taotie_boss');
  run.enemies[0].hp = 4;

  fireOrb(run, computeAutoAimAngle(run));
  for (let frame = 0; frame < 900; frame++) {
    stepSimulation(run, 1 / 60);
    if (run.phase === 'victory') break;
  }

  assert.equal(run.phase, 'victory');
  assert.equal(run.summary?.outcome, 'victory');

  const entered = enterEndlessMode(run);
  assert.equal(entered, true);
  assert.equal(run.isEndless, true);
  assert.equal(run.phase, 'forge_reward');
  assert.equal(selectForgeReward(run, 0), true);
  assert.equal(run.stageIndex, CAMPAIGN_STAGE_COUNT);
});

test('computeExpectedShotDamage scales accurately with crit, multiplier, and ember_chain relic', () => {
  const run = createNewForgeRun('standard', 12, 0);
  run.relics.push('ember_chain');
  run.shotTally.hits = 12;
  run.shotTally.baseDamage = 50;
  run.shotTally.multiplier = 2.0;
  run.shotTally.critTriggered = true;
  run.shotTally.bombDamage = 20;

  // (50 * (2.0 + 0.6) * 2.0) + 20 = 260 + 20 = 280
  assert.equal(computeExpectedShotDamage(run), 280);
});

test('storage parseMetaJson safely recovers from corrupted JSON and invalid fields', () => {
  const def = createDefaultMeta();
  assert.deepEqual(parseMetaJson('{broken_json'), def);
  assert.deepEqual(parseMetaJson(null), def);

  const valid = parseMetaJson(
    JSON.stringify({
      preferredDifficulty: 'master',
      tutorialCompleted: true,
      victories: 2,
      bestScore: 5400,
      highestStageReached: 6,
    }),
  );
  assert.equal(valid.preferredDifficulty, 'master');
  assert.equal(valid.tutorialCompleted, true);
  assert.equal(valid.victories, 2);
  assert.equal(valid.bestScore, 5400);
  assert.equal(valid.highestStageReached, 6);
});
