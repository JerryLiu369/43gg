import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRUCIBLE_CHAMBERS,
  DIRECTIVES,
  MODULES_BY_ID,
  ORBITAL_RINGS,
} from './content.ts';
import {
  ASCENSION_MIN_LUMINANCE,
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
  findAffordableMilestoneRing,
  findBestRoiRing,
  getBulkRingUpgradeQuote,
  getGlobalLuminanceMultiplier,
  getModuleInstallCost,
  getModuleUpgradeCost,
  getRingAngularVelocity,
  getRingMeridianYield,
  getRingMilestoneMultiplier,
  getRingUpgradeCost,
  getSingleLevelCostAt,
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
   upgradeSlotModule,
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
  assert.ok(normal.gainedLuminance >= 1.5);
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
  assert.ok(run.crucible.stellarFlux > 12, 'Syzygy should inject Stellar Flux into Crucible');
  assert.equal(run.totalSyzygies, 1);
});

test('per-ring Gear-Ratio tuning (harmonic / syzygy / blitz) dynamically alters yield, speed, and window', () => {
  const meta = createInitialMetaState();
  const run = createNewOrreryRun(meta);

  const harmonicYield = getRingMeridianYield('mercury', run, meta);
  const harmonicOmega = getRingAngularVelocity('mercury', run, meta);
  const baseWin = getSyzygyWindowRad(run, meta, 'mercury');

  assert.equal(setRingGearMode(run, meta, 'mercury', 'blitz'), true);
  const blitzYield = getRingMeridianYield('mercury', run, meta);
  const blitzOmega = getRingAngularVelocity('mercury', run, meta);
  assert.ok(harmonicYield > blitzYield * 1.35);
  assert.ok(blitzOmega > harmonicOmega * 1.45);

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
  assert.ok(Math.abs(multAfterFusion / multBefore - 1.18) < 0.001);

  const aetherBefore = run.aether;
  for (let i = 0; i < 600; i++) {
    stepOrrery(run, meta, 0.05);
  }
  assert.ok(run.aether > aetherBefore, 'Crystallizer Lv.2+ should synthesize Aether');

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

  run.era = 3;
  run.directives.auto_architect = true;
  assert.equal(getUnlockedAutomatorSlots(run, meta), 6);

  applyAutomatorPreset(run, 'handsfree_overclock');
  assert.equal(run.automator.enabled, true);
  assert.equal(run.automator.reserveRatio, 0.5);

  // Rule #1 (unlock_next_ring) unlocks Venus (cost 140)
  run.luminance = 180;
  const r1 = evaluateAutomatorStep(run, meta);
  assert.equal(r1.triggeredRuleId, 'rule_1');
  assert.equal(run.rings.venus.unlocked, true);

  // With 1600 Luminance & 50% reserve (budget = 800), Rule #2 installs a synergistic Prism in Slot 0 (cost 650)
  run.luminance = 1600;
  const r2 = evaluateAutomatorStep(run, meta);
  assert.equal(r2.triggeredRuleId, 'rule_2');
  assert.equal(run.slots[0]?.typeId, 'prism');

  // Verify ROI calculator picks the higher Δrate/cost ring near Lv.10 milestone
  run.rings.mercury.level = 9;
  run.rings.venus.level = 1;
  const bestRoi = findBestRoiRing(run, meta, 50_000);
  assert.equal(bestRoi, 'mercury');

  // Verify Hysteresis Overdrive rule
  applyAutomatorPreset(run, 'syzygy_detonator');
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
  run.totalLuminanceRun = 350_000_000;
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

  triggerManualImpulse(run, meta);
  triggerManualImpulse(run, meta);
  const res3 = triggerManualImpulse(run, meta);
  assert.equal(res3.tutorialCompletedStep, 0);
  assert.equal(run.tutorialStep, 1);

  run.luminance = Math.max(run.luminance, 160);
  assert.equal(upgradeOrUnlockRing(run, meta, 'venus', '1'), true);
  assert.equal(run.tutorialStep, 2);

  assert.equal(setOverdriveSpeed(run, meta, 2), true);
  assert.equal(run.tutorialStep, 3);
  assert.equal(areModulesSynergistic('prism', 'resonator'), true);

  run.luminance = Math.max(run.luminance, 900);
  run.totalLuminanceRun = Math.max(run.totalLuminanceRun, 900);
  stepOrrery(run, meta, 0.02);
  assert.equal(run.era, 2);
  assert.equal(installSlotModule(run, meta, 0, 'prism'), true);
  assert.equal(run.tutorialStep, 4);

  const nextQuote = getBulkRingUpgradeQuote('mercury', run, meta, 'next');
  assert.equal(nextQuote.levels, 9);
  run.luminance = 5000;
  assert.equal(upgradeOrUnlockRing(run, meta, 'mercury', 'next'), true);
  assert.equal(run.tutorialStep, 5);
  assert.equal(getRingMilestoneMultiplier(10, meta).mult, 1.8);

  run.comet.active = true;
  run.comet.progress = 0.5;
  const caught = catchGoldenComet(run, meta, false);
  assert.ok(caught !== null);
  assert.ok(caught!.gainedFlux > 0);
  assert.equal(run.frenzySecondsLeft, 15);

  const offline = applyOfflineProgress(run, meta, 600);
  assert.ok(offline !== null);
  assert.ok(offline!.fluxGained > 0);
  assert.ok(offline!.tensionGainedSec > 0);

  // Prestige & immediate Constellation node application on current run
  run.totalLuminanceRun = ASCENSION_MIN_LUMINANCE * 2;
  const ascResult = performAstrolabeAscension(run, meta);
  assert.ok(ascResult !== null);
  const freshAfterAscend = ascResult!.nextRun;
  assert.equal(freshAfterAscend.rings.venus.unlocked, false);
  assert.equal(unlockAscensionNode(meta, 'star_seed', freshAfterAscend), true);
  assert.equal(freshAfterAscend.rings.venus.unlocked, true);
  assert.ok(freshAfterAscend.luminance >= 900);
  assert.ok(getRingUpgradeCost('mercury', freshAfterAscend, meta) > 0);

  freshAfterAscend.luminance = 1000;
  assert.equal(purchaseDirective(freshAfterAscend, meta, 'meridian_chime'), true);
  assert.ok(getUnlockedAchievementCount(meta) >= 1);

  const meta2 = createInitialMetaState();
  const run2 = createNewOrreryRun(meta2);
  skipTutorial(run2, meta2);
  assert.equal(run2.tutorialStep, 5);
});

test('cost growth strictly outpaces milestone yield growth across levels 1..150 and Golden Comet strips temporary buffs', () => {
  const meta = createInitialMetaState();
  meta.ascensionNodes.golden_ratio = true;
  meta.ascensionNodes.perpetual_spring = true;
  const run = createNewOrreryRun(meta);

  for (const ringDef of ORBITAL_RINGS) {
    run.rings[ringDef.id].unlocked = true;
    const checkpoints = [25, 50, 75, 100, 125, 150];
    let prevCostToYieldRatio = 0;
    for (const lv of checkpoints) {
      run.rings[ringDef.id].level = lv;
      const stepCost = getSingleLevelCostAt(ringDef.id, lv, meta);
      const strikeYield = getRingMeridianYield(ringDef.id, run, meta);
      const ratio = stepCost / strikeYield;
      assert.ok(
        ratio > prevCostToYieldRatio * 5,
        `Expected cost/yield ratio for ${ringDef.id} at Lv.${lv} (${ratio}) to grow >5x over previous checkpoint (${prevCostToYieldRatio})`,
      );
      prevCostToYieldRatio = ratio;
    }
  }

  // Verify Golden Comet ignores temporary Overdrive / Frenzy / Supernova / Impulse multipliers
  const baseRun = createNewOrreryRun(meta);
  baseRun.rings.mercury.level = 15;
  baseRun.comet.active = true;
  const unbuffedComet = catchGoldenComet(baseRun, meta, false);

  const buffedRun = createNewOrreryRun(meta);
  buffedRun.rings.mercury.level = 15;
  buffedRun.overdriveSpeed = 8;
  buffedRun.frenzySecondsLeft = 15;
  buffedRun.crucible.supernovaSecondsLeft = 8;
  buffedRun.impulseBoost = 1.8;
  buffedRun.comet.active = true;
  const buffedComet = catchGoldenComet(buffedRun, meta, false);

  assert.equal(buffedComet!.gainedLuminance, unbuffedComet!.gainedLuminance);
});

test('engaged full playthrough reaches Prime Singularity within ~17–24 minutes (never under 12 minutes)', () => {
  let rngState = 424242 >>> 0;
  const origRandom = Math.random;
  Math.random = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  try {
    const meta = createInitialMetaState();
    let run = createNewOrreryRun(meta);
    const blueprint = [
      'prism', 'resonator', 'prism', 'lens', 'prism', 'condenser',
      'mainspring', 'chrono', 'prism', 'resonator', 'condenser', 'lens',
    ] as const;
    const ascendTargets = [3, 12, 26];
    const dt = 0.05;
    let totalSec = 0;
    let nextImpulse = 0.5;
    let nextDecision = 1.0;

    while (totalSec < 1800 && !run.primeIgnited) {
      stepOrrery(run, meta, dt);
      totalSec += dt;

      if (run.era >= 2 && !run.automator.enabled) {
        applyAutomatorPreset(run, 'breakthrough_sniper');
      }

      if (run.comet.active && run.comet.progress > 0.4) {
        if (Math.random() < 0.7) catchGoldenComet(run, meta, false);
        else run.comet.progress = Math.max(run.comet.progress, 0.99);
      }

      if (totalSec >= nextImpulse) {
        if (!run.directives.auto_impulse || Math.random() < 0.35) {
          triggerManualImpulse(run, meta);
        }
        nextImpulse = totalSec + 2.0;
      }

      if (totalSec >= nextDecision) {
        nextDecision = totalSec + 2.8;

        if (purchaseDirective(run, meta, 'prime_ignition')) break;

        const targetDust = ascendTargets[meta.ascensionCount];
        if (targetDust !== undefined && calculatePendingStardust(run) >= targetDust) {
          const res = performAstrolabeAscension(run, meta);
          if (res) {
            run = res.nextRun;
            const order = [
              'star_seed', 'wide_meridian', 'golden_ratio', 'aether_fountain',
              'perpetual_spring', 'harmonic_overtone', 'cosmic_architect', 'zodiac_memory',
            ] as const;
            for (const nid of order) unlockAscensionNode(meta, nid, run);
            continue;
          }
        }

        for (const d of DIRECTIVES) {
          if (d.id === 'prime_ignition') continue;
          if (!run.directives[d.id] && run.era >= d.era && run.luminance >= d.costLuminance && run.aether >= d.costAether) {
            purchaseDirective(run, meta, d.id);
          }
        }

        for (let i = 1; i < ORBITAL_RINGS.length; i++) {
          const prev = ORBITAL_RINGS[i - 1];
          const cur = ORBITAL_RINGS[i];
          if (run.rings[prev.id].unlocked && !run.rings[cur.id].unlocked && run.luminance >= cur.unlockCost) {
            upgradeOrUnlockRing(run, meta, cur.id, '1');
          }
        }

        for (const ch of CRUCIBLE_CHAMBERS) {
          upgradeCrucibleChamber(run, meta, ch.id);
        }

        if (run.era >= 2) {
          for (let idx = 0; idx < 12; idx++) {
            if (!isSlotUnlocked(run, idx) || run.slots[idx] !== null) continue;
            let modId = blueprint[idx];
            if (MODULES_BY_ID[modId].unlockEra > run.era) {
              modId = idx % 2 === 0 ? 'prism' : 'resonator';
            }
            const c = getModuleInstallCost(modId, run);
            if (c.luminance <= run.luminance * 0.55 && run.aether >= c.aether) {
              installSlotModule(run, meta, idx, modId);
            }
          }
          for (let idx = 0; idx < 12; idx++) {
            const m = run.slots[idx];
            if (!m || m.tier >= 5) continue;
            const up = getModuleUpgradeCost(m);
            const reserve = meta.ascensionCount >= 3 && run.era >= 4 ? 360 : 0;
            if (up.luminance <= run.luminance * 0.35 && run.aether - up.aether >= reserve) {
              upgradeSlotModule(run, meta, idx);
            }
          }
        }

        if (run.era >= 2 && run.crucible.supernovaCooldownSec <= 0) {
          triggerSupernovaPulse(run, meta);
        }
        const tensionPct = run.springTensionSec / run.maxSpringTensionSec;
        if (tensionPct >= 0.65) {
          setOverdriveSpeed(run, meta, meta.ascensionNodes.perpetual_spring ? 8 : 4);
        } else if (tensionPct <= 0.15 && run.overdriveSpeed > 1) {
          setOverdriveSpeed(run, meta, 1);
        }

        let saving = false;
        for (let i = 1; i < ORBITAL_RINGS.length; i++) {
          const prev = ORBITAL_RINGS[i - 1];
          const cur = ORBITAL_RINGS[i];
          if (run.rings[prev.id].unlocked && !run.rings[cur.id].unlocked) {
            if (run.luminance >= cur.unlockCost * 0.32 || run.luminancePerSec * 22 >= cur.unlockCost) {
              saving = true;
            }
            break;
          }
        }
        if (meta.ascensionCount >= 3 && run.luminance >= 180_000_000_000) saving = true;

        if (!saving) {
          const msRing = findAffordableMilestoneRing(run, meta, run.luminance * 0.85);
          if (msRing) upgradeOrUnlockRing(run, meta, msRing, 'next');
          else {
            const roiRing = findBestRoiRing(run, meta, run.luminance * 0.75);
            if (roiRing) upgradeOrUnlockRing(run, meta, roiRing, '1');
          }
        }
      }
    }

    assert.equal(run.primeIgnited, true, 'Engaged player should reach Prime Ignition');
    assert.equal(meta.ascensionCount, 3, 'Progression should span 3 meaningful Ascensions');
    assert.ok(
      totalSec >= 15 * 60 && totalSec <= 25 * 60,
      `Expected ~20-minute playthrough (900s..1500s), got ${Math.round(totalSec)}s (${(totalSec / 60).toFixed(2)} min)`,
    );
  } finally {
    Math.random = origRandom;
  }
});
