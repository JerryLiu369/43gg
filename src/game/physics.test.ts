import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewChampionship,
  getPlayerOverallStanding,
  recordChampionshipStageResult,
} from './championship.ts';
import {
  DEFAULT_INPUT_SETTINGS,
  DEFAULT_TUNING,
  FIXED_DT,
  SPORT_INPUT_SETTINGS,
  applyDrivingPreset,
  createInitialCarState,
  evaluateContinuousTireCurve,
  getDrivingPreset,
  getEngineTorqueNm,
  getSurfaceProfile,
  stepCarPhysics,
} from './physics.ts';
import { getAllStages, getStageById } from './stages.ts';

test('all 6 rally stages generate complete 3D spline segments, gantries, brake boards, and pacenotes', () => {
  const stages = getAllStages();
  assert.equal(stages.length, 6);
  for (const st of stages) {
    assert.ok(st.lengthM >= 3600, `Stage ${st.id} should be at least 3.6km`);
    assert.ok(st.segments.length > 600);
    assert.ok(st.props.length > 60);
    assert.ok(st.pacenotes.length >= 10);
    assert.equal(st.sectorSplitsM.length, 3);

    const hasStartArch = st.props.some((p) => p.type === 'start_arch');
    const splitArches = st.props.filter((p) => p.type === 'split_arch');
    const hasBrakeBoard = st.props.some((p) => p.type === 'brake_board');
    assert.ok(hasStartArch, `Stage ${st.id} must spawn a WRC start arch`);
    assert.equal(splitArches.length, 2, `Stage ${st.id} must spawn 2 sector split arches`);
    assert.ok(hasBrakeBoard, `Stage ${st.id} must spawn brake marker boards before hard corners`);
  }
});

test('surface profiles clearly differentiate tarmac, dirty tarmac, gravel, snow, and ice', () => {
  const tarmac = getSurfaceProfile('tarmac', 'clear', 'tarmac_dry', 30);
  const dirtyTarmac = getSurfaceProfile('tarmac_dirty', 'clear', 'tarmac_dry', 30);
  const gravel = getSurfaceProfile('gravel', 'clear', 'gravel', 24);
  const snow = getSurfaceProfile('snow', 'snow', 'snow', 20);
  const ice = getSurfaceProfile('ice', 'snow', 'snow', 20);

  assert.ok(tarmac.peakMu > dirtyTarmac.peakMu, 'Clean tarmac must have higher grip than dirty tarmac');
  assert.ok(tarmac.peakMu > gravel.peakMu, 'Dry tarmac must have higher peak grip than gravel');
  assert.ok(gravel.peakMu > snow.peakMu, 'Gravel must have higher peak grip than snow');
  assert.ok(snow.peakMu > ice.peakMu, 'Snow must have higher peak grip than pure ice');
  assert.ok(gravel.peakMu > 0 && gravel.peakSlipAngleRad > tarmac.peakSlipAngleRad, 'Gravel peaks at a wider slip angle than tarmac');
});

test('continuous tire curve peaks at s=1.0 and provides a progressive recoverable transition zone', () => {
  const peakMu = 1.0;
  const slideRatio = 0.8;
  const plateau = 0.9;

  const muLow = evaluateContinuousTireCurve(0.4, peakMu, slideRatio, plateau);
  const muPeak = evaluateContinuousTireCurve(1.0, peakMu, slideRatio, plateau);
  const muTransition = evaluateContinuousTireCurve(1.35, peakMu, slideRatio, plateau);
  const muDeepSlide = evaluateContinuousTireCurve(3.0, peakMu, slideRatio, plateau);

  assert.ok(muPeak > muLow);
  assert.ok(Math.abs(muPeak - 1.0) < 1e-5);
  assert.ok(muTransition < muPeak && muTransition > 0.85, 'Transition zone must remain controllable');
  assert.ok(muDeepSlide >= 0.79 && muDeepSlide < muTransition, 'Deep slide settles to sliding friction without zeroing out');
});

test('longitudinal weight transfer loads rear wheels under acceleration and front wheels under braking', () => {
  const stage = getStageById('turini_tarmac');
  const state = createInitialCarState(stage);
  const tuning = { ...DEFAULT_TUNING, tireCompound: 'tarmac_dry' as const };

  for (let i = 0; i < 144; i++) {
    stepCarPhysics(
      state,
      {
        steer: 0,
        throttle: 1.0,
        brake: 0,
        handbrake: 0,
        clutch: 0,
        shiftUpJustPressed: false,
        shiftDownJustPressed: false,
        ignitionJustPressed: false,
      },
      stage,
      tuning,
      DEFAULT_INPUT_SETTINGS,
      'clear',
      i * FIXED_DT
    );
  }

  assert.ok(state.forwardSpeedMs > 8, 'Car should accelerate forward');
  const rearLoadAccel = state.wheels[2].normalLoadN + state.wheels[3].normalLoadN;
  const frontLoadAccel = state.wheels[0].normalLoadN + state.wheels[1].normalLoadN;
  assert.ok(rearLoadAccel > frontLoadAccel, 'Acceleration must transfer weight to the rear axle');

  for (let i = 0; i < 48; i++) {
    stepCarPhysics(
      state,
      {
        steer: 0,
        throttle: 0,
        brake: 0.9,
        handbrake: 0,
        clutch: 0,
        shiftUpJustPressed: false,
        shiftDownJustPressed: false,
        ignitionJustPressed: false,
      },
      stage,
      tuning,
      DEFAULT_INPUT_SETTINGS,
      'clear',
      1.2 + i * FIXED_DT
    );
  }

  const frontLoadBrake = state.wheels[0].normalLoadN + state.wheels[1].normalLoadN;
  const rearLoadBrake = state.wheels[2].normalLoadN + state.wheels[3].normalLoadN;
  assert.ok(frontLoadBrake > rearLoadBrake, 'Braking must transfer weight to the front axle');
});

test('Sport sequential auto-gearbox upshifts cleanly under full throttle and toggles with Pro preset', () => {
  assert.equal(getDrivingPreset(SPORT_INPUT_SETTINGS), 'sport');
  assert.equal(getDrivingPreset(DEFAULT_INPUT_SETTINGS), 'pro');
  const switchedPro = applyDrivingPreset(SPORT_INPUT_SETTINGS, 'pro');
  assert.equal(switchedPro.autoGearbox, false);
  assert.equal(switchedPro.autoClutch, false);

  const stage = getStageById('finland_jumps');
  const state = createInitialCarState(stage);
  const tuning = { ...DEFAULT_TUNING, tireCompound: 'gravel' as const };

  // Full throttle for 3.2 seconds should automatically shift out of 1st gear into 2nd or 3rd
  for (let i = 0; i < 384; i++) {
    stepCarPhysics(
      state,
      {
        steer: 0,
        throttle: 1.0,
        brake: 0,
        handbrake: 0,
        clutch: 0,
        shiftUpJustPressed: false,
        shiftDownJustPressed: false,
        ignitionJustPressed: false,
      },
      stage,
      tuning,
      SPORT_INPUT_SETTINGS,
      'clear',
      i * FIXED_DT
    );
  }

  assert.ok(state.gear >= 2, `Sport auto-gearbox should upshift past 1st gear (got gear=${state.gear})`);
  assert.ok(state.forwardSpeedMs > 18, 'Car should reach brisk speed smoothly without hitting 1st gear limiter');
});

test('WRC 6-stage championship tracks cumulative standings, Super-Rally +60s DNF, and Service Park cadence', () => {
  const stages = getAllStages();
  let champ = createNewChampionship(stages, 'AWD');
  assert.equal(champ.standings.length, 8);
  assert.equal(champ.stageOrderIds.length, 6);

  // Beat SS01 par by 15s -> Player should take P1
  champ = recordChampionshipStageResult(champ, stages[0], true, stages[0].targetParTimeSec - 15);
  assert.equal(champ.completedCount, 1);
  assert.equal(champ.serviceParkDue, false);
  assert.equal(getPlayerOverallStanding(champ).rank, 1);

  // Retire on SS02 -> Super-Rally +60s penalty applied, Service Park opens after 2 stages!
  champ = recordChampionshipStageResult(champ, stages[1], false, 40);
  assert.equal(champ.completedCount, 2);
  assert.equal(champ.serviceParkDue, true);
  const standingAfterDnf = getPlayerOverallStanding(champ);
  assert.equal(standingAfterDnf.entry.retiredCount, 1);
  assert.ok(standingAfterDnf.rank > 1, 'Super-Rally +60s penalty should drop player behind clean AI crews');
});

test('engine torque curve exhibits low-RPM weakness and turbo boost amplification', () => {
  const lowRpmNoBoost = getEngineTorqueNm(1200, 0, 0);
  const midRpmFullBoost = getEngineTorqueNm(5200, 1.5, 0);
  const damagedEngine = getEngineTorqueNm(5200, 1.5, 0.8);

  assert.ok(midRpmFullBoost > lowRpmNoBoost * 2.5, 'Turbo boost at mid-high RPM should strongly exceed low-RPM torque');
  assert.ok(damagedEngine < midRpmFullBoost * 0.65, 'Engine damage must noticeably reduce output torque');
});
