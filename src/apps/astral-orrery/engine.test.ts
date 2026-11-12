import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TWO_PI,
  angularDistanceToZero,
  applyAutomatorPreset,
  applyOfflineProgress,
  areModulesSynergistic,
  calculatePendingStardust,
  catchGoldenComet,
  createInitialMetaState,
  createNewOrreryRun,
  evaluateAutomatorStep,
  findBestRoiRing,
  getBulkRingUpgradeQuote,
  getGlobalLuminanceMultiplier,
  getRingAngularVelocity,
  getRingMeridianYield,
  getRingMilestoneMultiplier,
  getRingUpgradeCost,
  getSyzygyWindowRad,
  getUnlockedAchievementCount,
  getUnlockedAutomatorSlots,
  installSlotModule,
  isSlotUnlocked,
  performAstrolabeAscension,
  purchaseDirective,
  setOverdriveSpeed,
  setRingGearMode,
  skipTutorial,
  stepOrrery,
  triggerManualImpulse,
  triggerSupernovaPulse,
  unlockAscensionNode,
  updateAutomatorRule,
  upgradeCrucibleChamber,
  upgradeOrUnlockRing,
} from './engine.ts';

test('new run initializes with Mercury ring, Crucible, and Programmable Automator defaults', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  assert.equal(run.era, 1);
  assert.equal(run.tutorialStep, 0);
  assert.equal(run.rings.mercury.unlocked, true);
  assert.equal(run.rings.mercury.level, 1);
  assert.equal(run.rings.mercury.gearMode, 'harmonic');
  assert.equal(run.rings.venus.unlocked, false);
  assert.equal(run.slots.length, 12);
  assert.equal(isSlotUnlocked(run, 0), false);
  assert.equal(run.automator.rules.length, 6);
  assert.equal(getUnlockedAutomatorSlots(run, meta), 2);
});

test('manual impulse awards luminance + stellar flux and triggers Perfect Escapement near Meridian', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  run.rings.mercury.angle = 3.14;
  const normal = triggerManualImpulse(run, meta);
  assert.equal(normal.isPerfect, false);
  assert.ok(normal.gainedLuminance >= 2);
  assert.ok(normal.gainedFlux > 0);

  run.rings.mercury.angle = 0.08;
  const beforeTension = run.springTensionSec;
  const perfect = triggerManualImpulse(run, meta);
  assert.equal(perfect.isPerfect, true);
  assert.ok(perfect.gainedLuminance > normal.gainedLuminance * 2);
  assert.ok(perfect.gainedFlux > normal.gainedFlux * 2);
  assert.ok(run.springTensionSec > beforeTension);
  assert.equal(meta.achievements.first_perfect, true);
});

test('crossing 2π Meridian credits luminance & flux, and multi-body Syzygy multiplies payout', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  run.rings.venus.unlocked = true;
  run.rings.venus.level = 2;
  run.rings.terra.unlocked = true;
  run.rings.terra.level = 1;

  run.rings.mercury.angle = TWO_PI - 0.02;
  run.rings.venus.angle = TWO_PI - 0.015;
  run.rings.terra.angle = 0.05;

  const events = stepOrrery(run, meta, 0.04);
  assert.ok(events.meridianStrikes.length >= 1);
  assert.ok(events.syzygy !== null, 'Expected a 3-body Syzygy conjunction');
  assert.equal(events.syzygy!.bodyCount, 3);
  assert.ok(events.syzygy!.multiplier >= 9);
  assert.ok(run.aether >= 1, '3-body Syzygy should award Aether');
  assert.ok(run.crucible.stellarFlux > 15, 'Syzygy should inject Stellar Flux into Crucible');
  assert.equal(run.totalSyzygies, 1);
});

test('per-ring Gear-Ratio tuning (harmonic / syzygy / blitz) dynamically alters yield, speed, and window', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  // Default Mercury gearMode is 'harmonic'
  const harmonicYield = getRingMeridianYield('mercury', run, meta);
  const harmonicOmega = getRingAngularVelocity('mercury', run, meta);
  const baseWin = getSyzygyWindowRad(run, meta, 'mercury');

  // Switch to 'blitz'
  assert.equal(setRingGearMode(run, meta, 'mercury', 'blitz'), true);
  const blitzYield = getRingMeridianYield('mercury', run, meta);
  const blitzOmega = getRingAngularVelocity('mercury', run, meta);
  assert.ok(harmonicYield > blitzYield * 1.35);
  assert.ok(blitzOmega > harmonicOmega * 1.45);

  // Switch to 'syzygy'
  assert.equal(setRingGearMode(run, meta, 'mercury', 'syzygy'), true);
  const syzWin = getSyzygyWindowRad(run, meta, 'mercury');
  assert.ok(syzWin > baseWin * 1.3);
});

test('Alchemical Stellar Crucible chambers and Supernova Collapse Pulse work end-to-end', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);
  run.rings.venus.unlocked = true;
  run.rings.venus.level = 1;
  run.rings.mercury.angle = 2.8;
  run.rings.venus.angle = 4.1;

  const multBefore = getGlobalLuminanceMultiplier(run, meta);
  run.crucible.stellarFlux = 500;

  assert.equal(upgradeCrucibleChamber(run, meta, 'fusion'), true);
  assert.equal(upgradeCrucibleChamber(run, meta, 'dilation'), true);
  assert.equal(upgradeCrucibleChamber(run, meta, 'crystallizer'), true);
  assert.equal(upgradeCrucibleChamber(run, meta, 'crystallizer'), true);

  const multAfterFusion = getGlobalLuminanceMultiplier(run, meta);
  assert.ok(Math.abs(multAfterFusion / multBefore - 1.32) < 0.001);

  // Crystallizer Lv.2+ synthesizes passive Aether over simulation time
  const aetherBefore = run.aether;
  for (let i = 0; i < 450; i++) {
    stepOrrery(run, meta, 0.05);
  }
  assert.ok(run.aether > aetherBefore, 'Crystallizer Lv.2+ should synthesize Aether');

  // Supernova Collapse Pulse pulls planets close to 0° Meridian & grants x2.5 overcharge
  run.rings.mercury.angle = Math.PI * 0.8;
  run.rings.venus.angle = Math.PI * 1.2;
  const distBefore = angularDistanceToZero(run.rings.mercury.angle);
  const pulse = triggerSupernovaPulse(run, meta);
  assert.ok(pulse !== null);
  assert.equal(pulse!.alignedPlanets, 2);
  assert.ok(angularDistanceToZero(run.rings.mercury.angle) < distBefore * 0.45);
  assert.ok(run.crucible.supernovaSecondsLeft >= 7.9);
  assert.equal(triggerSupernovaPulse(run, meta), null, 'Cooldown blocks immediate recast');
});

test('Programmable Clockwork Logic Automator executes priority rules, ROI math, reserve ratio, and auto-ascend', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  // Unlock Era 3 so all 6 programmable tracks are active
  run.era = 3;
  run.directives.auto_architect = true;
  assert.equal(getUnlockedAutomatorSlots(run, meta), 6);

  // Load Handsfree Overclock preset (50% reserve ratio)
  applyAutomatorPreset(run, 'handsfree_overclock');
  assert.equal(run.automator.enabled, true);
  assert.equal(run.automator.reserveRatio, 0.5);

  // With 60 Luminance, Rule #1 (unlock_next_ring) unlocks Venus (cost 40, ignores reserve on unlock)
  run.luminance = 60;
  const r1 = evaluateAutomatorStep(run, meta);
  assert.equal(r1.triggeredRuleId, 'rule_1');
  assert.equal(run.rings.venus.unlocked, true);

  // With 600 Luminance & 50% reserve (budget = 300), Rule #2 installs a synergistic Prism in Slot 0 (cost 160)
  run.luminance = 600;
  const r2 = evaluateAutomatorStep(run, meta);
  assert.equal(r2.triggeredRuleId, 'rule_2');
  assert.equal(run.slots[0]?.typeId, 'prism');

  // Verify ROI calculator picks the higher Δrate/cost ring
  run.rings.mercury.level = 9; // 1 level away from x2.5 milestone!
  run.rings.venus.level = 1;
  const bestRoi = findBestRoiRing(run, meta, 10_000);
  assert.equal(bestRoi, 'mercury');

  // Verify Hysteresis Overdrive rule
  applyAutomatorPreset(run, 'syzygy_detonator');
  // Disable rule 0 (trigger_supernova) so we test tension_above_pct directly
  updateAutomatorRule(run, 0, { enabled: false });
  run.springTensionSec = run.maxSpringTensionSec * 0.85;
  const rOver = evaluateAutomatorStep(run, meta);
  assert.ok(rOver.triggeredRuleId !== null);
  assert.equal(run.overdriveSpeed, 4);

  run.springTensionSec = run.maxSpringTensionSec * 0.1;
  evaluateAutomatorStep(run, meta);
  assert.equal(run.overdriveSpeed, 1);

  // Verify Speedrun Ascender preset auto-ascends and preserves Automator rules
  applyAutomatorPreset(run, 'speedrun_ascender');
  run.totalLuminanceRun = 25_000_000;
  assert.ok(calculatePendingStardust(run) >= 5);
  const rAsc = evaluateAutomatorStep(run, meta);
  assert.ok(rAsc.ascended !== null);
  assert.ok(meta.stardust >= 5);
  assert.equal(meta.ascensionCount, 1);
  assert.equal(run.automator.activePreset, 'speedrun_ascender');
});

test('era unfolding, Zodiac module slotting, milestone bulk-buy, offline progress, and onboarding quests pass', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  // 5-step onboarding quest chain
  triggerManualImpulse(run, meta);
  triggerManualImpulse(run, meta);
  const res3 = triggerManualImpulse(run, meta);
  assert.equal(res3.tutorialCompletedStep, 0);
  assert.equal(run.tutorialStep, 1);

  run.luminance = Math.max(run.luminance, 40);
  assert.equal(upgradeOrUnlockRing(run, meta, 'venus', '1'), true);
  assert.equal(run.tutorialStep, 2);

  assert.equal(setOverdriveSpeed(run, meta, 2), true);
  assert.equal(run.tutorialStep, 3);
  assert.equal(run.era, 2);
  assert.equal(areModulesSynergistic('prism', 'resonator'), true);

  run.luminance = Math.max(run.luminance, 200);
  assert.equal(installSlotModule(run, meta, 0, 'prism'), true);
  assert.equal(run.tutorialStep, 4);

  const nextQuote = getBulkRingUpgradeQuote('mercury', run, meta, 'next');
  assert.equal(nextQuote.levels, 9);
  run.luminance = 5000;
  assert.equal(upgradeOrUnlockRing(run, meta, 'mercury', 'next'), true);
  assert.equal(run.tutorialStep, 5);
  assert.equal(getRingMilestoneMultiplier(10, meta).mult, 2.5);

  // Golden Comet capture awards Luminance, Flux & Frenzy
  run.comet.active = true;
  run.comet.progress = 0.5;
  const caught = catchGoldenComet(run, meta, false);
  assert.ok(caught !== null);
  assert.ok(caught!.gainedFlux > 0);
  assert.equal(run.frenzySecondsLeft, 15);

  // Offline calculation awards Luminance, Flux & Tension
  const offline = applyOfflineProgress(run, meta, 600);
  assert.ok(offline !== null);
  assert.ok(offline!.fluxGained > 0);
  assert.ok(offline!.tensionGainedSec > 0);

  // Prestige & Stardust nodes
  run.totalLuminanceRun = 1_500_000;
  const ascResult = performAstrolabeAscension(run, meta);
  assert.ok(ascResult !== null);
  assert.equal(unlockAscensionNode(meta, 'star_seed'), true);
  const seeded = createNewOrreryRun(meta);
  assert.equal(seeded.rings.venus.unlocked, true);
  assert.ok(getRingUpgradeCost('mercury', seeded, meta) > 0);

  seeded.luminance = 1000;
  assert.equal(purchaseDirective(seeded, meta, 'meridian_chime'), true);
  assert.ok(getUnlockedAchievementCount(meta) >= 1);

  const meta2 = createInitialMetaState();
  const run2 = createNewOrreryRun(meta2);
  skipTutorial(run2, meta2);
  assert.equal(run2.tutorialStep, 5);
});
