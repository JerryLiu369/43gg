import { RallyAudioEngine } from './audio.ts';
import { InputController } from './input.ts';
import {
  FIXED_DT,
  cloneCarState,
  createInitialCarState,
  interpolateCarState,
  stepCarPhysics,
} from './physics.ts';
import { getStageById } from './stages.ts';
import { loadStageRecords, saveStageRecord } from './storage.ts';
import {
  CameraMode,
  CarPhysicsState,
  GhostSample,
  InputSettings,
  MistakeRecord,
  PacenoteItem,
  StageDefinition,
  StageRecord,
  TimeOfDay,
  TuningSetup,
  WeatherType,
} from './types.ts';
import { RallyWebGLRenderer } from '../render/webglRenderer.ts';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface StageFinishSummary {
  stage: StageDefinition;
  completed: boolean;
  retiredReason?: string;
  totalTimeSec: number;
  penaltyTimeSec: number;
  sectorTimesSec: [number, number, number];
  bestRecord: StageRecord | null;
  isNewBest: boolean;
  mistakes: MistakeRecord[];
}

export interface HudDomRefs {
  speedEl: HTMLElement | null;
  gearEl: HTMLElement | null;
  rpmTextEl: HTMLElement | null;
  rpmBarEl: HTMLElement | null;
  shiftLightEl: HTMLElement | null;
  boostTextEl: HTMLElement | null;
  stageTimeEl: HTMLElement | null;
  deltaTimeEl: HTMLElement | null;
  progressTextEl: HTMLElement | null;
  progressBarEl: HTMLElement | null;
  surfaceBadgeEl: HTMLElement | null;
  dirtyTireWarnEl: HTMLElement | null;
  stallWarnEl: HTMLElement | null;
  throttleBarEl: HTMLElement | null;
  brakeBarEl: HTMLElement | null;
  clutchBarEl: HTMLElement | null;
  steeringIndicatorEl: HTMLElement | null;
  mirrorFrameEl: HTMLElement | null;
}

export function formatRallyTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const whole = Math.floor(rem);
  const ms = Math.floor((rem - whole) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

const SURFACE_LABELS_ZH: Record<string, string> = {
  gravel: '砂石 (Gravel)',
  tarmac: '柏油 (Tarmac)',
  tarmac_dirty: '脏柏油 (Dirty Tarmac)',
  snow: '压实雪道 (Snow)',
  ice: '镜面暗冰 (Black Ice)',
  water_puddle: '涉水积水 (Water)',
  offtrack: '赛道外草坡 (Off-Track)',
};

export class RallySimulationEngine {
  private renderer: RallyWebGLRenderer;
  public input: InputController;
  public audio: RallyAudioEngine;

  private phase: GamePhase = 'title';
  private stage: StageDefinition;
  private weather: WeatherType;
  private timeOfDay: TimeOfDay;
  private tuning: TuningSetup;
  private inputSettings: InputSettings;
  private cameraMode: CameraMode = 'cockpit';

  private prevCarState: CarPhysicsState;
  private currCarState: CarPhysicsState;
  private renderCarState: CarPhysicsState;

  private accumulatorSec = 0;
  private stageTimeSec = 0;
  private penaltyTimeSec = 0;
  private flyoverTimeSec = 0;
  private lastRafTimeMs = 0;
  private rafId = 0;
  private isHeadless: boolean;
  private lastHeadlessRenderMs = 0;

  // Sector timing & Ghost recording
  private sectorTimesSec: [number, number, number] = [0, 0, 0];
  private sector1Recorded = false;
  private sector2Recorded = false;
  private currentGhostSamples: GhostSample[] = [];
  private lastGhostSampleTime = -1;
  private personalBestRecord: StageRecord | null = null;
  private mistakes: MistakeRecord[] = [];

  // Co-driver pacenotes
  private triggeredNoteIds = new Set<string>();
  private activePacenote: PacenoteItem | null = null;
  private nextPacenote: PacenoteItem | null = null;

  // Service park remaining repair minutes (45 min budget)
  private serviceMinutesLeft = 45;

  // Low-frequency callbacks to React UI shell
  public hudRefs: HudDomRefs = {
    speedEl: null,
    gearEl: null,
    rpmTextEl: null,
    rpmBarEl: null,
    shiftLightEl: null,
    boostTextEl: null,
    stageTimeEl: null,
    deltaTimeEl: null,
    progressTextEl: null,
    progressBarEl: null,
    surfaceBadgeEl: null,
    dirtyTireWarnEl: null,
    stallWarnEl: null,
    throttleBarEl: null,
    brakeBarEl: null,
    clutchBarEl: null,
    steeringIndicatorEl: null,
    mirrorFrameEl: null,
  };

  public onPacenoteChange?: (active: PacenoteItem | null, next: PacenoteItem | null) => void;
  public onDamageOrSectorUpdate?: (
    car: CarPhysicsState,
    sectorTimes: [number, number, number],
    serviceMins: number
  ) => void;
  public onStageFinish?: (summary: StageFinishSummary) => void;
  public onRequestPauseToggle?: () => void;
  public onCameraModeChanged?: (mode: CameraMode) => void;

  private lastReactSyncTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    initialStageId: string,
    initialTuning: TuningSetup,
    initialInputSettings: InputSettings
  ) {
    this.isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    this.stage = getStageById(initialStageId);
    this.weather = this.stage.defaultWeather;
    this.timeOfDay = this.stage.defaultTimeOfDay;
    this.tuning = { ...initialTuning };
    this.inputSettings = { ...initialInputSettings };

    this.renderer = new RallyWebGLRenderer(canvas);
    this.renderer.setStage(this.stage);

    this.input = new InputController();
    this.audio = new RallyAudioEngine();

    this.input.onToggleCamera = () => {
      if (this.phase === 'playing') {
        this.cycleCameraMode();
      }
    };
    this.input.onTogglePause = () => {
      this.onRequestPauseToggle?.();
    };

    this.currCarState = createInitialCarState(this.stage);
    this.prevCarState = cloneCarState(this.currCarState);
    this.renderCarState = cloneCarState(this.currCarState);

    this.loadBestForCurrentStage();
  }

  public startLoop(): void {
    this.lastRafTimeMs = performance.now();
    const tick = (nowMs: number) => {
      this.rafId = requestAnimationFrame(tick);

      // In headless CPU WebGL, throttle to ~18fps so software rendering never stalls Playwright
      if (this.isHeadless && nowMs - this.lastHeadlessRenderMs < 52) {
        return;
      }
      this.lastHeadlessRenderMs = nowMs;

      const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastRafTimeMs) / 1000));
      this.lastRafTimeMs = nowMs;
      this.updateAndRender(rawDt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.renderer.dispose();
  }

  public handleResize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    document.body.dataset.state = phase;
    this.audio.setPaused(phase !== 'playing');
    if (phase === 'playing') {
      this.audio.init();
      this.input.clearAll();
    }
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public configureStageAndWeather(
    stageId: string,
    weather: WeatherType,
    timeOfDay: TimeOfDay
  ): void {
    this.stage = getStageById(stageId);
    this.weather = weather;
    this.timeOfDay = timeOfDay;
    this.renderer.setStage(this.stage);
    this.loadBestForCurrentStage();
    this.resetStageRun(false);
  }

  public setTuning(tuning: TuningSetup): void {
    this.tuning = { ...tuning };
  }

  public setInputSettings(settings: InputSettings): void {
    this.inputSettings = { ...settings };
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    if (this.hudRefs.mirrorFrameEl) {
      this.hudRefs.mirrorFrameEl.style.display = mode === 'cockpit' ? 'block' : 'none';
    }
    this.onCameraModeChanged?.(mode);
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['cockpit', 'hood', 'chase'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.setCameraMode(next);
    return next;
  }

  public getCarState(): CarPhysicsState {
    return this.currCarState;
  }

  public getServiceMinutesLeft(): number {
    return this.serviceMinutesLeft;
  }

  /**
   * Repairs a damaged zone in the Service Park, consuming limited service time.
   */
  public repairSubsystem(
    zone: 'steering' | 'engine' | 'gearbox' | 'suspension' | 'tires' | 'lights',
    costMin: number
  ): boolean {
    if (this.serviceMinutesLeft < costMin) return false;
    if (this.currCarState.damage[zone] <= 0.01) return false;

    this.serviceMinutesLeft -= costMin;
    this.currCarState.damage[zone] = 0;
    if (zone === 'tires') {
      this.currCarState.tireDirtiness = 0;
    }
    this.onDamageOrSectorUpdate?.(
      this.currCarState,
      this.sectorTimesSec,
      this.serviceMinutesLeft
    );
    return true;
  }

  /**
   * Recover car back onto road center with a strict +15.0s Marshal Recovery Time Penalty!
   */
  public recoverCarToRoadWithPenalty(): void {
    const seg = this.stage.segments[this.currCarState.currentSegmentIndex] || this.stage.segments[0];
    this.currCarState.x = seg.x;
    this.currCarState.y = seg.y + 0.08;
    this.currCarState.z = seg.z;
    this.currCarState.yaw = Math.atan2(seg.tangentX, seg.tangentZ);
    this.currCarState.pitch = 0;
    this.currCarState.roll = 0;
    this.currCarState.vx = 0;
    this.currCarState.vy = 0;
    this.currCarState.vz = 0;
    this.currCarState.yawRate = 0;
    this.currCarState.forwardSpeedMs = 0;
    this.currCarState.lateralSpeedMs = 0;
    this.currCarState.gear = 1;
    this.currCarState.stalled = false;
    this.currCarState.rpm = 1200;

    this.penaltyTimeSec += 15.0;
    this.mistakes.push({
      id: `recover_${Math.round(this.stageTimeSec * 10)}`,
      timeSec: this.stageTimeSec,
      distanceM: Math.round(this.currCarState.distanceAlongStageM),
      sector:
        this.currCarState.distanceAlongStageM < this.stage.sectorSplitsM[0]
          ? 1
          : this.currCarState.distanceAlongStageM < this.stage.sectorSplitsM[1]
            ? 2
            : 3,
      type: 'off_track',
      label: '赛段救援复位 (+15.0s 罚时)',
      timeLossEstSec: 15.0,
    });
    this.prevCarState = cloneCarState(this.currCarState);
  }

  /**
   * Resets the current stage run from the start line (no free mid-stage rewind).
   */
  public resetStageRun(startPlayingImmediately: boolean): void {
    this.currCarState = createInitialCarState(this.stage);
    this.prevCarState = cloneCarState(this.currCarState);
    this.renderCarState = cloneCarState(this.currCarState);
    this.accumulatorSec = 0;
    this.stageTimeSec = 0;
    this.penaltyTimeSec = 0;
    this.sectorTimesSec = [0, 0, 0];
    this.sector1Recorded = false;
    this.sector2Recorded = false;
    this.currentGhostSamples = [];
    this.lastGhostSampleTime = -1;
    this.mistakes = [];
    this.triggeredNoteIds.clear();
    this.activePacenote = null;
    this.nextPacenote = null;
    this.serviceMinutesLeft = 45;

    this.updatePacenoteLookahead();
    this.onDamageOrSectorUpdate?.(
      this.currCarState,
      this.sectorTimesSec,
      this.serviceMinutesLeft
    );

    if (startPlayingImmediately) {
      this.setPhase('playing');
    }
  }

  private loadBestForCurrentStage(): void {
    const records = loadStageRecords();
    this.personalBestRecord = records[this.stage.id] || null;
  }

  private updateAndRender(dt: number): void {
    if (this.phase === 'playing') {
      const rawControls = this.input.sample(dt);
      this.accumulatorSec += dt;

      // Fixed 120Hz physics step loop (deterministic regardless of display frame rate!)
      let subSteps = 0;
      while (this.accumulatorSec >= FIXED_DT && subSteps < 10) {
        this.prevCarState = cloneCarState(this.currCarState);
        this.stageTimeSec += FIXED_DT;

        stepCarPhysics(
          this.currCarState,
          rawControls,
          this.stage,
          this.tuning,
          this.inputSettings,
          this.weather,
          this.stageTimeSec,
          this.mistakes,
          FIXED_DT
        );

        // Clear one-shot shift/ignition flags after first physics substep consumes them
        rawControls.shiftUpJustPressed = false;
        rawControls.shiftDownJustPressed = false;
        rawControls.ignitionJustPressed = false;

        this.accumulatorSec -= FIXED_DT;
        subSteps++;
      }

      const alpha = this.accumulatorSec / FIXED_DT;
      this.renderCarState = interpolateCarState(this.prevCarState, this.currCarState, alpha);

      // Update audio, particles, pacenotes, sector splits, and ghost telemetry
      this.audio.update(this.renderCarState);
      this.renderer.updateParticles(this.renderCarState, this.weather, dt);
      this.checkSectorSplitsAndFinish();
      this.recordGhostSample();
      this.updatePacenoteLookahead();
      this.updateHudDomDirect(this.renderCarState);

      if (this.stageTimeSec - this.lastReactSyncTime > 0.25) {
        this.lastReactSyncTime = this.stageTimeSec;
        this.onDamageOrSectorUpdate?.(
          this.currCarState,
          this.sectorTimesSec,
          this.serviceMinutesLeft
        );
      }
    } else {
      // Title flyover or Paused / Gameover ambient camera
      this.flyoverTimeSec += dt;
      this.renderer.updateParticles(this.renderCarState, this.weather, dt);
    }

    const ghostPose = this.samplePersonalBestGhostAtTime(this.stageTimeSec);

    this.renderer.render(
      this.renderCarState,
      this.cameraMode,
      this.weather,
      this.timeOfDay,
      this.phase === 'title',
      this.flyoverTimeSec,
      ghostPose,
      dt
    );
  }

  private checkSectorSplitsAndFinish(): void {
    const d = this.currCarState.distanceAlongStageM;
    const totalTime = this.stageTimeSec + this.penaltyTimeSec;

    if (!this.sector1Recorded && d >= this.stage.sectorSplitsM[0]) {
      this.sector1Recorded = true;
      this.sectorTimesSec[0] = totalTime;
    }

    if (!this.sector2Recorded && d >= this.stage.sectorSplitsM[1]) {
      this.sector2Recorded = true;
      this.sectorTimesSec[1] = totalTime - this.sectorTimesSec[0];
    }

    // Check Terminal Damage Retirement
    if (this.currCarState.damage.isTerminal) {
      this.setPhase('gameover');
      this.onStageFinish?.({
        stage: this.stage,
        completed: false,
        retiredReason: this.currCarState.damage.terminalReason,
        totalTimeSec: totalTime,
        penaltyTimeSec: this.penaltyTimeSec,
        sectorTimesSec: [...this.sectorTimesSec] as [number, number, number],
        bestRecord: this.personalBestRecord,
        isNewBest: false,
        mistakes: [...this.mistakes],
      });
      return;
    }

    // Check Flying Finish line crossing
    if (d >= this.stage.lengthM - 15) {
      this.sectorTimesSec[2] = Math.max(
        0.1,
        totalTime - this.sectorTimesSec[0] - this.sectorTimesSec[1]
      );
      const isNewBest =
        !this.personalBestRecord || totalTime < this.personalBestRecord.bestTimeSec;

      const newRecord: StageRecord = {
        stageId: this.stage.id,
        bestTimeSec: totalTime,
        sectorTimesSec: [...this.sectorTimesSec] as [number, number, number],
        ghostSamples: this.currentGhostSamples,
        drivetrain: this.tuning.drivetrain,
        weather: this.weather,
        timestamp: Date.now(),
      };

      if (isNewBest) {
        saveStageRecord(newRecord);
        this.personalBestRecord = newRecord;
      }

      this.setPhase('gameover');
      this.onStageFinish?.({
        stage: this.stage,
        completed: true,
        totalTimeSec: totalTime,
        penaltyTimeSec: this.penaltyTimeSec,
        sectorTimesSec: [...this.sectorTimesSec] as [number, number, number],
        bestRecord: this.personalBestRecord,
        isNewBest,
        mistakes: [...this.mistakes],
      });
    }
  }

  private recordGhostSample(): void {
    if (this.stageTimeSec - this.lastGhostSampleTime >= 0.25) {
      this.lastGhostSampleTime = this.stageTimeSec;
      const c = this.currCarState;
      this.currentGhostSamples.push({
        t: Number(this.stageTimeSec.toFixed(2)),
        d: Math.round(c.distanceAlongStageM),
        x: Number(c.x.toFixed(2)),
        y: Number(c.y.toFixed(2)),
        z: Number(c.z.toFixed(2)),
        yaw: Number(c.yaw.toFixed(3)),
        pitch: Number(c.pitch.toFixed(3)),
        roll: Number(c.roll.toFixed(3)),
      });
    }
  }

  private samplePersonalBestGhostAtTime(t: number): GhostSample | null {
    if (!this.personalBestRecord || this.personalBestRecord.ghostSamples.length < 2) {
      return null;
    }
    const samples = this.personalBestRecord.ghostSamples;
    for (let i = 0; i < samples.length - 1; i++) {
      const s0 = samples[i];
      const s1 = samples[i + 1];
      if (t >= s0.t && t <= s1.t) {
        const alpha = (t - s0.t) / Math.max(0.001, s1.t - s0.t);
        return {
          t,
          d: s0.d + (s1.d - s0.d) * alpha,
          x: s0.x + (s1.x - s0.x) * alpha,
          y: s0.y + (s1.y - s0.y) * alpha,
          z: s0.z + (s1.z - s0.z) * alpha,
          yaw: s0.yaw + (s1.yaw - s0.yaw) * alpha,
          pitch: s0.pitch + (s1.pitch - s0.pitch) * alpha,
          roll: s0.roll + (s1.roll - s0.roll) * alpha,
        };
      }
    }
    return null;
  }

  /**
   * Adaptive speed-compensated co-driver pacenote lookahead.
   * Faster speeds automatically trigger pacenotes earlier so the driver always has braking margin!
   */
  private updatePacenoteLookahead(): void {
    const d = this.currCarState.distanceAlongStageM;
    const speedMs = Math.max(12, Math.abs(this.currCarState.forwardSpeedMs));
    // Lookahead = ~4.8 seconds of travel at current speed, scaled by user lead preference
    const adaptiveLookaheadM =
      Math.max(85, Math.min(260, speedMs * 4.9)) * this.inputSettings.pacenoteLeadScale;

    let foundActive: PacenoteItem | null = null;
    let foundNext: PacenoteItem | null = null;

    for (const note of this.stage.pacenotes) {
      if (note.cornerDistanceM + 35 < d) continue; // Already passed corner
      if (note.cornerDistanceM - d <= adaptiveLookaheadM) {
        if (!foundActive) {
          foundActive = note;
        } else if (!foundNext) {
          foundNext = note;
          break;
        }
      } else if (!foundActive) {
        // Upcoming note even if slightly beyond lookahead window so HUD is never blank on start
        if (note.cornerDistanceM - d <= adaptiveLookaheadM + 90) {
          foundActive = note;
        }
      }
    }

    if (foundActive && !this.triggeredNoteIds.has(foundActive.id)) {
      this.triggeredNoteIds.add(foundActive.id);
      this.audio.speakPacenote(foundActive, this.inputSettings.pacenoteAudioEnabled);
    }

    if (
      foundActive?.id !== this.activePacenote?.id ||
      foundNext?.id !== this.nextPacenote?.id
    ) {
      this.activePacenote = foundActive;
      this.nextPacenote = foundNext;
      this.onPacenoteChange?.(foundActive, foundNext);
    }
  }

  private updateHudDomDirect(car: CarPhysicsState): void {
    const refs = this.hudRefs;
    const speedKmh = Math.round(Math.abs(car.forwardSpeedMs) * 3.6);
    if (refs.speedEl) refs.speedEl.textContent = String(speedKmh);

    if (refs.gearEl) {
      const gText = car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : String(car.gear);
      refs.gearEl.textContent = gText;
      refs.gearEl.style.color = car.rpm > 7150 ? '#ef4444' : '#f59e0b';
    }

    const rpmInt = Math.round(car.rpm);
    if (refs.rpmTextEl) refs.rpmTextEl.textContent = `${rpmInt}`;
    if (refs.rpmBarEl) {
      const pct = Math.min(100, Math.max(0, (car.rpm / 8000) * 100));
      refs.rpmBarEl.style.width = `${pct.toFixed(1)}%`;
      refs.rpmBarEl.style.backgroundColor =
        car.rpm > 7150 ? '#ef4444' : car.rpm > 5800 ? '#f59e0b' : '#10b981';
    }

    if (refs.shiftLightEl) {
      refs.shiftLightEl.style.opacity = car.rpm > 7150 ? '1' : '0.15';
    }

    if (refs.boostTextEl) {
      const sign = car.turboBoostBar >= 0 ? '+' : '';
      refs.boostTextEl.textContent = `${sign}${car.turboBoostBar.toFixed(2)} BAR`;
    }

    const totalSec = this.stageTimeSec + this.penaltyTimeSec;
    if (refs.stageTimeEl) {
      refs.stageTimeEl.textContent = formatRallyTime(totalSec);
    }

    // Live delta vs Personal Best Ghost (or Target Par Time)
    if (refs.deltaTimeEl) {
      const progressFrac = Math.max(0.001, car.distanceAlongStageM / this.stage.lengthM);
      let refTimeAtDist = this.stage.targetParTimeSec * progressFrac;
      const ghost = this.samplePersonalBestGhostAtTime(this.stageTimeSec);
      if (ghost && this.personalBestRecord) {
        const distDiff = car.distanceAlongStageM - ghost.d;
        const estDelta = -distDiff / Math.max(12, Math.abs(car.forwardSpeedMs));
        const sign = estDelta <= 0 ? '' : '+';
        refs.deltaTimeEl.textContent = `${sign}${estDelta.toFixed(2)}s vs PB`;
        refs.deltaTimeEl.style.color = estDelta <= 0 ? '#10b981' : '#ef4444';
      } else {
        const delta = totalSec - refTimeAtDist;
        const sign = delta <= 0 ? '' : '+';
        refs.deltaTimeEl.textContent = `${sign}${delta.toFixed(2)}s vs PAR`;
        refs.deltaTimeEl.style.color = delta <= 0 ? '#10b981' : '#f59e0b';
      }
    }

    const pctDist = Math.min(100, (car.distanceAlongStageM / this.stage.lengthM) * 100);
    if (refs.progressTextEl) {
      refs.progressTextEl.textContent = `${(car.distanceAlongStageM / 1000).toFixed(2)} / ${(this.stage.lengthM / 1000).toFixed(2)} km (${Math.round(pctDist)}%)`;
    }
    if (refs.progressBarEl) {
      refs.progressBarEl.style.width = `${pctDist.toFixed(1)}%`;
    }

    if (refs.surfaceBadgeEl) {
      refs.surfaceBadgeEl.textContent =
        SURFACE_LABELS_ZH[car.currentSurface] || car.currentSurface;
    }

    if (refs.dirtyTireWarnEl) {
      refs.dirtyTireWarnEl.style.display =
        car.tireDirtiness > 0.25 && car.currentSurface === 'tarmac' ? 'block' : 'none';
    }

    if (refs.stallWarnEl) {
      refs.stallWarnEl.style.display = car.stalled ? 'block' : 'none';
    }

    if (refs.throttleBarEl) {
      refs.throttleBarEl.style.height = `${Math.round(car.throttle * 100)}%`;
    }
    if (refs.brakeBarEl) {
      refs.brakeBarEl.style.height = `${Math.round(car.brake * 100)}%`;
    }
    if (refs.clutchBarEl) {
      refs.clutchBarEl.style.height = `${Math.round(car.clutchPedal * 100)}%`;
    }
    if (refs.steeringIndicatorEl) {
      const pct = 50 + (car.steerAngleRad / 0.56) * 48;
      refs.steeringIndicatorEl.style.left = `${Math.max(4, Math.min(96, pct))}%`;
    }
  }
}
