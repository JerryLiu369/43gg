import test from 'node:test';
import assert from 'node:assert/strict';
import { BOON_DEFS, ENEMY_ARCHETYPES, STAGES } from './content.ts';
import {
  computeSlashPreview,
  createEmptyEvents,
  createNewRun,
  executeParryStance,
  executeSlashDash,
  selectBoonAndAdvance,
  stepSimulation,
} from './engine.ts';
import type { PlayerInputFrame } from './types.ts';

function idleInput(aimX = 700, aimY = 370): PlayerInputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimWorldX: aimX,
    aimWorldY: aimY,
    mindsEyeHeld: false,
    slashJustPressed: false,
    slashJustReleased: false,
    parryJustPressed: false,
  };
}

test('content defines 5 stages, 6 enemy archetypes (5 policies + Boss), and 12 boons', () => {
  assert.equal(STAGES.length, 5);
  assert.equal(Object.keys(ENEMY_ARCHETYPES).length, 6);
  assert.equal(BOON_DEFS.length, 12);

  for (let i = 0; i < STAGES.length; i++) {
    const run = createNewRun(i, false, 100 + i);
    assert.ok(run.enemies.length > 0, `Stage ${i} wave 1 must spawn enemies`);
    for (const enemy of run.enemies) {
      const d = Math.hypot(enemy.x - run.player.x, enemy.y - run.player.y);
      assert.ok(
        d >= 240,
        `Stage ${i} enemy spawned too close (${d.toFixed(1)}px) to player`,
      );
    }
  }
});

test('run survives opening seconds without input and smoothly collides with obstacles', () => {
  const run = createNewRun(0, false, 42);
  const initialHp = run.player.hp;

  // Simulate 2.2 seconds of complete player inactivity on spawn
  for (let frame = 0; frame < 132; frame++) {
    stepSimulation(run, 1 / 60, idleInput());
  }
  assert.equal(run.player.hp, initialHp, 'Player must survive opening seconds safely');
  assert.equal(run.phase, 'fighting');

  // Walk right for 1 second and ensure player stays inside arena bounds
  for (let frame = 0; frame < 60; frame++) {
    stepSimulation(run, 1 / 60, {
      ...idleInput(),
      moveX: 1,
      moveY: 0,
    });
  }
  assert.ok(run.player.x > 640, 'Player should move east when holding moveX=1');
  assert.ok(run.player.x < run.arenaWidth - 34);
});

test('Issen Chain Reset: lethal slash resets slashCooldown to 0 immediately, while non-lethal puts it on cooldown', () => {
  const run = createNewRun(0, false, 777);
  run.obstacles = [];
  run.jars = [];
  run.player.x = 400;
  run.player.y = 370;

  // Place a 1-HP Ronin directly in front of player
  run.enemies = [
    {
      uid: 901,
      archetype: 'ronin',
      x: 520,
      y: 370,
      vx: 0,
      vy: 0,
      facing: Math.PI,
      hp: 1,
      maxHp: 2,
      radius: 18,
      frontalShield: false,
      shieldBroken: false,
      aiPhase: 'pursuing',
      phaseTimer: 0,
      attackCooldown: 2,
      lockedAngle: Math.PI,
      lockedTargetX: 400,
      lockedTargetY: 370,
      orbitSign: 1,
      hasAttackToken: false,
      hitFlashTimer: 0,
      gaitDist: 0,
      bossPhase: 1,
      koProgress: 0,
    },
    {
      uid: 902,
      archetype: 'ronin',
      x: 980,
      y: 370,
      vx: 0,
      vy: 0,
      facing: Math.PI,
      hp: 4,
      maxHp: 4,
      radius: 18,
      frontalShield: false,
      shieldBroken: false,
      aiPhase: 'pursuing',
      phaseTimer: 0,
      attackCooldown: 2,
      lockedAngle: Math.PI,
      lockedTargetX: 400,
      lockedTargetY: 370,
      orbitSign: 1,
      hasAttackToken: false,
      hitFlashTimer: 0,
      gaitDist: 0,
      bossPhase: 1,
      koProgress: 0,
    },
  ];

  const preview = computeSlashPreview(run, 620, 370);
  assert.deepEqual(preview.targetEnemyUids, [901]);

  const evKill = createEmptyEvents();
  const ok = executeSlashDash(run, 620, 370, evKill);
  assert.equal(ok, true);
  assert.equal(evKill.enemiesKilled, 1);
  assert.equal(evKill.chainResetTriggered, true);
  assert.equal(
    run.player.slashCooldown,
    0,
    'Killing an enemy must reset slashCooldown to 0 immediately',
  );
  assert.equal(run.combo, 1);

  // Now slash into empty air -> cooldown must engage
  const evMiss = createEmptyEvents();
  executeSlashDash(run, 620, 200, evMiss);
  assert.equal(evMiss.chainResetTriggered, false);
  assert.ok(run.player.slashCooldown > 0.5, 'Whiffed slash must start cooldown');
});

test('Ironclad frontal shield blocks front slash, while backstab cracks shield and deals bonus damage', () => {
  const run = createNewRun(2, false, 888);
  run.obstacles = [];
  run.jars = [];
  run.player.x = 400;
  run.player.y = 370;

  // Ironclad at (500, 370) facing WEST (Math.PI) directly toward player at (400, 370)
  run.enemies = [
    {
      uid: 501,
      archetype: 'ironclad',
      x: 500,
      y: 370,
      vx: 0,
      vy: 0,
      facing: Math.PI,
      hp: 4,
      maxHp: 4,
      radius: 23,
      frontalShield: true,
      shieldBroken: false,
      aiPhase: 'pursuing',
      phaseTimer: 0,
      attackCooldown: 3,
      lockedAngle: Math.PI,
      lockedTargetX: 400,
      lockedTargetY: 370,
      orbitSign: 1,
      hasAttackToken: false,
      hitFlashTimer: 0,
      gaitDist: 0,
      bossPhase: 1,
      koProgress: 0,
    },
  ];

  const evFront = createEmptyEvents();
  executeSlashDash(run, 600, 370, evFront);
  assert.equal(run.enemies[0].hp, 4, 'Frontal shield must block front slash damage');
  assert.equal(run.enemies[0].shieldBroken, false);

  // Reset cooldown and position player BEHIND Ironclad at (610, 370) while Ironclad still faces WEST (Math.PI)
  run.player.slashCooldown = 0;
  run.player.x = 610;
  run.player.y = 370;
  const evBack = createEmptyEvents();
  executeSlashDash(run, 420, 370, evBack);
  assert.equal(run.enemies[0].shieldBroken, true, 'Backstab must shatter frontal shield');
  assert.ok(run.enemies[0].hp < 4, 'Backstab must damage Ironclad');
  assert.equal(run.player.slashCooldown, 0, 'Shield break triggers Issen reset');
});

test('Perfect Deflect reflects enemy bolt back at shooter, resets slash cooldown, and pierces shield', () => {
  const run = createNewRun(1, false, 999);
  run.obstacles = [];
  run.jars = [];
  run.player.x = 400;
  run.player.y = 370;
  run.player.slashCooldown = 0.6;

  run.enemies = [
    {
      uid: 701,
      archetype: 'ironclad',
      x: 680,
      y: 370,
      vx: 0,
      vy: 0,
      facing: Math.PI,
      hp: 3,
      maxHp: 4,
      radius: 23,
      frontalShield: true,
      shieldBroken: false,
      aiPhase: 'pursuing',
      phaseTimer: 0,
      attackCooldown: 5,
      lockedAngle: Math.PI,
      lockedTargetX: 400,
      lockedTargetY: 370,
      orbitSign: 1,
      hasAttackToken: false,
      hitFlashTimer: 0,
      gaitDist: 0,
      bossPhase: 1,
      koProgress: 0,
    },
  ];

  // Hostile bolt just 32px in front of player flying west
  run.projectiles = [
    {
      uid: 801,
      kind: 'bolt',
      owner: 'enemy',
      x: 432,
      y: 370,
      vx: -560,
      vy: 0,
      radius: 7,
      damage: 1,
      life: 2.0,
      maxLife: 2.0,
      deflected: false,
      pierceLeft: 0,
    },
  ];

  const evParry = createEmptyEvents();
  executeParryStance(run, idleInput(680, 370), evParry);
  assert.equal(evParry.perfectDeflectCount, 1);
  assert.equal(run.projectiles[0].owner, 'player');
  assert.equal(run.projectiles[0].deflected, true);
  assert.ok(run.projectiles[0].vx > 900, 'Deflected bolt accelerates toward enemy');
  assert.equal(run.player.slashCooldown, 0, 'Deflect resets slash cooldown');

  // Advance frames so reflected bolt strikes Ironclad and breaks shield + kills
  run.hitstopTimer = 0;
  for (let f = 0; f < 25; f++) {
    stepSimulation(run, 1 / 60, idleInput(680, 370));
  }
  assert.equal(run.enemies[0].hp, 0, 'Reflected 3-damage bolt should slay 3-HP Ironclad');
});

test('Minds Eye slows simulation time while draining Focus, and player defeat/boon/victory transitions work cleanly', () => {
  const run = createNewRun(0, false, 1234);
  const startFocus = run.player.focus;

  const evSlow = stepSimulation(run, 0.04, {
    ...idleInput(),
    mindsEyeHeld: true,
  });
  assert.equal(evSlow.runDefeat, false);
  assert.equal(run.player.mindsEyeActive, true);
  assert.ok(run.player.focus < startFocus);
  // Elapsed sim time should be scaled by ~0.24x
  assert.ok(run.elapsedSec < 0.015);

  // Test Stage 1 final wave clear -> boon_select -> Stage 2 transition
  run.waveIndex = STAGES[0].waves.length - 1;
  run.enemies = [];
  stepSimulation(run, 1 / 60, idleInput());
  assert.equal(run.phase, 'boon_select');
  assert.equal(run.pendingBoonChoices.length, 3);

  const chosen = run.pendingBoonChoices[0];
  selectBoonAndAdvance(run, chosen);
  assert.equal(run.stageIndex, 1);
  assert.equal(run.phase, 'fighting');
  assert.ok(run.boons.includes(chosen));

  // Verify reachable defeat (no hidden HP floor)
  run.player.hp = 1;
  run.player.invulnTimer = 0;
  run.player.parryActiveTimer = 0;
  run.projectiles = [
    {
      uid: 999,
      kind: 'bolt',
      owner: 'enemy',
      x: run.player.x + 2,
      y: run.player.y,
      vx: -300,
      vy: 0,
      radius: 8,
      damage: 1,
      life: 1,
      maxLife: 1,
      deflected: false,
      pierceLeft: 0,
    },
  ];
  const evDefeat = stepSimulation(run, 1 / 60, idleInput());
  assert.equal(run.player.hp, 0);
  assert.equal(run.phase, 'defeat');
  assert.equal(evDefeat.runDefeat, true);
  assert.equal(run.summarySnapshot?.outcome, 'defeat');
});

test('Three difficulty tiers scale player HP, Focus, and casual wave-clear healing cleanly', () => {
  const casual = createNewRun(0, false, 303, 'casual');
  const standard = createNewRun(0, false, 303, 'standard');
  const master = createNewRun(0, false, 303, 'master');

  assert.equal(casual.player.maxHp, 6);
  assert.equal(standard.player.maxHp, 5);
  assert.equal(master.player.maxHp, 4);

  assert.ok(casual.player.maxFocus > standard.player.maxFocus);

  // Casual heals +1 HP upon clearing a non-final wave
  casual.player.hp = 4;
  casual.enemies = [];
  const evClear = stepSimulation(casual, 1 / 60, idleInput());
  assert.equal(evClear.waveCleared, true);
  assert.equal(casual.player.hp, 5, 'Casual difficulty restores 1 HP on wave clear');
});

