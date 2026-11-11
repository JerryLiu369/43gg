import React, { useEffect, useRef, useState } from 'react';
import { PacenoteSignSvg } from '../../components/PacenoteSignSvg.tsx';
import { SetupAndGarageModal } from '../../components/SetupAndGarageModal.tsx';
import { StageFinishModal } from '../../components/StageFinishModal.tsx';
import {
  createNewChampionship,
  getPlayerOverallStanding,
  recordChampionshipStageResult,
} from '../../game/championship.ts';
import {
  applyDrivingPreset,
  createInitialDamageState,
  getDrivingPreset,
} from '../../game/physics.ts';
import {
  RallySimulationEngine,
  formatRallyTime,
} from '../../game/rallyEngine.ts';
import type {
  GamePhase,
  StageFinishSummary,
} from '../../game/rallyEngine.ts';
import { getAllStages } from '../../game/stages.ts';
import {
  loadInputSettings,
  loadSavedTuningPresets,
  loadStageRecords,
  saveCustomTuningPreset,
  saveInputSettings,
} from '../../game/storage.ts';
import type {
  CameraMode,
  ChampionshipProgress,
  DamageState,
  InputSettings,
  LaunchControlState,
  PacenoteItem,
  RallyEventMode,
  SplitNotification,
  StageRecord,
  TimeOfDay,
  TuningSetup,
  WeatherType,
} from '../../game/types.ts';

const WEATHER_OPTIONS: Array<{ id: WeatherType; label: string }> = [
  { id: 'clear', label: '晴朗' },
  { id: 'rain', label: '降雨' },
  { id: 'fog', label: '浓雾' },
  { id: 'snow', label: '风雪' },
];

const TIME_OPTIONS: Array<{ id: TimeOfDay; label: string }> = [
  { id: 'day', label: '正午' },
  { id: 'dusk', label: '黄昏' },
  { id: 'night', label: '暗夜' },
];

const CAMERA_LABELS_ZH: Record<CameraMode, string> = {
  cockpit: '座舱',
  hood: '引擎盖',
  chase: '近追尾',
  chase_far: '远追尾',
};

function zoneColorHex(damageFrac: number): string {
  const hp = Math.round((1 - damageFrac) * 100);
  if (hp > 75) return '#10b981';
  if (hp > 40) return '#f59e0b';
  return '#ef4444';
}

export default function ChronoStageApp() {
  const stages = getAllStages();
  const containerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RallySimulationEngine | null>(null);

  // High-frequency HUD DOM refs (mutated directly by RallySimulationEngine at 60Hz)
  const speedElRef = useRef<HTMLSpanElement | null>(null);
  const gearElRef = useRef<HTMLDivElement | null>(null);
  const rpmTextElRef = useRef<HTMLSpanElement | null>(null);
  const rpmBarElRef = useRef<HTMLDivElement | null>(null);
  const rpmLedContainerElRef = useRef<HTMLDivElement | null>(null);
  const shiftLightElRef = useRef<HTMLSpanElement | null>(null);
  const boostTextElRef = useRef<HTMLSpanElement | null>(null);
  const stageTimeElRef = useRef<HTMLDivElement | null>(null);
  const deltaTimeElRef = useRef<HTMLDivElement | null>(null);
  const progressTextElRef = useRef<HTMLSpanElement | null>(null);
  const progressBarElRef = useRef<HTMLDivElement | null>(null);
  const surfaceBadgeElRef = useRef<HTMLSpanElement | null>(null);
  const dirtyTireWarnElRef = useRef<HTMLDivElement | null>(null);
  const stallWarnElRef = useRef<HTMLDivElement | null>(null);
  const throttleBarElRef = useRef<HTMLDivElement | null>(null);
  const brakeBarElRef = useRef<HTMLDivElement | null>(null);
  const clutchBarElRef = useRef<HTMLDivElement | null>(null);
  const steeringIndicatorElRef = useRef<HTMLDivElement | null>(null);
  const mirrorFrameElRef = useRef<HTMLDivElement | null>(null);

  // Low-frequency React UI shell state
  const [phase, setPhase] = useState<GamePhase>('title');
  const [eventMode, setEventMode] = useState<RallyEventMode>('single');
  const [championship, setChampionship] = useState<ChampionshipProgress | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string>(stages[0].id);
  const [weather, setWeather] = useState<WeatherType>(stages[0].defaultWeather);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(stages[0].defaultTimeOfDay);
  const [cameraMode, setCameraMode] = useState<CameraMode>('cockpit');
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const [presets, setPresets] = useState<TuningSetup[]>(() => loadSavedTuningPresets());
  const [tuning, setTuning] = useState<TuningSetup>(() => loadSavedTuningPresets()[0]);
  const [inputSettings, setInputSettings] = useState<InputSettings>(() => loadInputSettings());
  const [stageRecords, setStageRecords] = useState<Record<string, StageRecord>>(() =>
    loadStageRecords()
  );

  const [activePacenote, setActivePacenote] = useState<PacenoteItem | null>(null);
  const [nextPacenote, setNextPacenote] = useState<PacenoteItem | null>(null);
  const [damage, setDamage] = useState<DamageState>(() => createInitialDamageState());
  const [, setSectorTimes] = useState<[number, number, number]>([0, 0, 0]);
  const [serviceMinutesLeft, setServiceMinutesLeft] = useState<number>(45);

  const [launchState, setLaunchState] = useState<LaunchControlState>({
    active: false,
    countdownSec: 0,
    boostReady: false,
    bannerText: '',
    bannerTone: 'amber',
  });
  const [splitToast, setSplitToast] = useState<SplitNotification | null>(null);

  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [setupModalDefaultService, setSetupModalDefaultService] = useState<boolean>(false);
  const [finishSummary, setFinishSummary] = useState<StageFinishSummary | null>(null);

  // Mutable refs so single-mount engine callbacks always read fresh React state
  const eventModeRef = useRef<RallyEventMode>(eventMode);
  eventModeRef.current = eventMode;
  const championshipRef = useRef<ChampionshipProgress | null>(championship);
  championshipRef.current = championship;
  const inputSettingsRef = useRef<InputSettings>(inputSettings);
  inputSettingsRef.current = inputSettings;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const splitTimerRef = useRef<number | null>(null);

  const activeStage = stages.find((s) => s.id === selectedStageId) || stages[0];
  const activeStageBest: StageRecord | null = stageRecords[activeStage.id] || null;
  const drivingPreset = getDrivingPreset(inputSettings);
  const champStanding = championship ? getPlayerOverallStanding(championship) : null;

  // Mount WebGLRenderer & RallySimulationEngine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RallySimulationEngine(
      canvas,
      selectedStageId,
      tuning,
      inputSettings
    );
    engineRef.current = engine;

    engine.hudRefs = {
      speedEl: speedElRef.current,
      gearEl: gearElRef.current,
      rpmTextEl: rpmTextElRef.current,
      rpmBarEl: rpmBarElRef.current,
      rpmLedContainerEl: rpmLedContainerElRef.current,
      shiftLightEl: shiftLightElRef.current,
      boostTextEl: boostTextElRef.current,
      stageTimeEl: stageTimeElRef.current,
      deltaTimeEl: deltaTimeElRef.current,
      progressTextEl: progressTextElRef.current,
      progressBarEl: progressBarElRef.current,
      surfaceBadgeEl: surfaceBadgeElRef.current,
      dirtyTireWarnEl: dirtyTireWarnElRef.current,
      stallWarnEl: stallWarnElRef.current,
      throttleBarEl: throttleBarElRef.current,
      brakeBarEl: brakeBarElRef.current,
      clutchBarEl: clutchBarElRef.current,
      steeringIndicatorEl: steeringIndicatorElRef.current,
      mirrorFrameEl: mirrorFrameElRef.current,
    };

    engine.onPacenoteChange = (act, nxt) => {
      setActivePacenote(act);
      setNextPacenote(nxt);
    };

    engine.onDamageOrSectorUpdate = (carState, secs, srvMins) => {
      setDamage({ ...carState.damage });
      setSectorTimes([secs[0], secs[1], secs[2]]);
      setServiceMinutesLeft(srvMins);
    };

    engine.onLaunchControlUpdate = (lc) => {
      setLaunchState(lc);
    };

    engine.onSplitNotification = (split) => {
      setSplitToast(split);
      if (splitTimerRef.current !== null) {
        window.clearTimeout(splitTimerRef.current);
      }
      splitTimerRef.current = window.setTimeout(() => {
        setSplitToast(null);
      }, 3200);
    };

    engine.onStageFinish = (summary) => {
      if (eventModeRef.current === 'championship' && championshipRef.current) {
        const nextChamp = recordChampionshipStageResult(
          championshipRef.current,
          summary.stage,
          summary.completed,
          summary.totalTimeSec
        );
        championshipRef.current = nextChamp;
        setChampionship(nextChamp);
        if (nextChamp.serviceParkDue) {
          engine.setServiceMinutesLeft(45);
          setServiceMinutesLeft(45);
        }
      }
      setFinishSummary(summary);
      setPhase('gameover');
      setStageRecords(loadStageRecords());
    };

    engine.onCameraModeChanged = (mode) => {
      setCameraMode(mode);
    };

    engine.onRequestTransmissionToggle = () => {
      const cur = inputSettingsRef.current;
      const next = applyDrivingPreset(
        cur,
        getDrivingPreset(cur) === 'sport' ? 'pro' : 'sport'
      );
      inputSettingsRef.current = next;
      setInputSettings(next);
      saveInputSettings(next);
      engine.setInputSettings(next);
    };

    engine.onRequestMuteToggle = () => {
      const next = !isMutedRef.current;
      isMutedRef.current = next;
      setIsMuted(next);
      engine.audio.setMuted(next);
    };

    engine.onRequestPauseToggle = () => {
      const curPhase = engine.getPhase();
      if (curPhase === 'playing') {
        engine.setPhase('paused');
        setPhase('paused');
      } else if (curPhase === 'paused') {
        setShowSetupModal(false);
        engine.setPhase('playing');
        setPhase('playing');
      }
    };

    const handleResize = () => {
      const container = containerRef.current;
      const width = container?.clientWidth || window.innerWidth;
      const height = container?.clientHeight || window.innerHeight;
      engine.handleResize(width, height);
      if (mirrorFrameElRef.current) {
        mirrorFrameElRef.current.style.width = `${Math.floor(Math.min(width * 0.28, 340))}px`;
        mirrorFrameElRef.current.style.height = `${Math.floor(Math.min(height * 0.095, 76))}px`;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && containerRef.current
        ? new ResizeObserver(() => handleResize())
        : null;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Check ?autostart=1 query param (immediate playing state, skipping countdown for automated testing)
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.resetStageRun(true, { withCountdown: false });
      setPhase('playing');
    } else {
      engine.setPhase('title');
      setPhase('title');
    }

    engine.startLoop();

    return () => {
      if (splitTimerRef.current !== null) {
        window.clearTimeout(splitTimerRef.current);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Bind Enter / Space on Title Screen to launch stage immediately
  useEffect(() => {
    if (phase !== 'title' || showSetupModal) return;
    const onTitleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartStage();
      }
    };
    window.addEventListener('keydown', onTitleKey);
    return () => window.removeEventListener('keydown', onTitleKey);
  }, [phase, showSetupModal, eventMode, selectedStageId, weather, timeOfDay, tuning, inputSettings]);

  const handleSelectStage = (stageId: string) => {
    const st = stages.find((s) => s.id === stageId) || stages[0];
    setSelectedStageId(st.id);
    setWeather(st.defaultWeather);
    setTimeOfDay(st.defaultTimeOfDay);
    const updatedTuning: TuningSetup = {
      ...tuning,
      tireCompound: st.recommendedTire,
    };
    setTuning(updatedTuning);
    if (engineRef.current) {
      engineRef.current.setTuning(updatedTuning);
      engineRef.current.configureStageAndWeather(
        st.id,
        st.defaultWeather,
        st.defaultTimeOfDay
      );
    }
  };

  const handleWeatherChange = (w: WeatherType) => {
    setWeather(w);
    engineRef.current?.configureStageAndWeather(selectedStageId, w, timeOfDay);
  };

  const handleTimeOfDayChange = (t: TimeOfDay) => {
    setTimeOfDay(t);
    engineRef.current?.configureStageAndWeather(selectedStageId, weather, t);
  };

  const handleStartStage = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFinishSummary(null);
    setSplitToast(null);
    setShowSetupModal(false);

    if (eventMode === 'championship') {
      const freshChamp = createNewChampionship(stages, tuning.drivetrain);
      championshipRef.current = freshChamp;
      setChampionship(freshChamp);
      const firstSt = stages[0];
      setSelectedStageId(firstSt.id);
      setWeather(firstSt.defaultWeather);
      setTimeOfDay(firstSt.defaultTimeOfDay);
      const champTuning: TuningSetup = {
        ...tuning,
        tireCompound: firstSt.recommendedTire,
      };
      setTuning(champTuning);
      if (engineRef.current) {
        engineRef.current.setTuning(champTuning);
        engineRef.current.setInputSettings(inputSettings);
        engineRef.current.configureStageAndWeather(
          firstSt.id,
          firstSt.defaultWeather,
          firstSt.defaultTimeOfDay
        );
        engineRef.current.resetStageRun(true, {
          withCountdown: true,
          serviceMinutesLeft: 45,
        });
      }
      setPhase('playing');
      return;
    }

    if (engineRef.current) {
      engineRef.current.configureStageAndWeather(selectedStageId, weather, timeOfDay);
      engineRef.current.setTuning(tuning);
      engineRef.current.setInputSettings(inputSettings);
      engineRef.current.resetStageRun(true, { withCountdown: true });
    }
    setPhase('playing');
  };

  const handleResumeStage = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setShowSetupModal(false);
    engineRef.current?.setPhase('playing');
    setPhase('playing');
  };

  const handleRestartCurrentStage = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setFinishSummary(null);
    setSplitToast(null);
    setShowSetupModal(false);
    engineRef.current?.resetStageRun(true, { withCountdown: true });
    setPhase('playing');
  };

  const handleNextStage = () => {
    setFinishSummary(null);
    setSplitToast(null);
    setShowSetupModal(false);

    if (eventMode === 'championship' && championship) {
      if (championship.isFinished) {
        // Restart a brand new 6-stage championship
        const freshChamp = createNewChampionship(stages, tuning.drivetrain);
        championshipRef.current = freshChamp;
        setChampionship(freshChamp);
        const firstSt = stages[0];
        setSelectedStageId(firstSt.id);
        setWeather(firstSt.defaultWeather);
        setTimeOfDay(firstSt.defaultTimeOfDay);
        const updatedTuning: TuningSetup = {
          ...tuning,
          tireCompound: firstSt.recommendedTire,
        };
        setTuning(updatedTuning);
        if (engineRef.current) {
          engineRef.current.setTuning(updatedTuning);
          engineRef.current.configureStageAndWeather(
            firstSt.id,
            firstSt.defaultWeather,
            firstSt.defaultTimeOfDay
          );
          engineRef.current.resetStageRun(true, {
            withCountdown: true,
            serviceMinutesLeft: 45,
          });
        }
        setPhase('playing');
        return;
      }

      const nextStageId = championship.stageOrderIds[championship.currentStageIdx];
      const nextSt = stages.find((s) => s.id === nextStageId) || stages[0];
      const carriedDamage = engineRef.current
        ? { ...engineRef.current.getCarState().damage }
        : { ...damage };
      const carriedSrvMins = engineRef.current
        ? engineRef.current.getServiceMinutesLeft()
        : serviceMinutesLeft;

      setSelectedStageId(nextSt.id);
      setWeather(nextSt.defaultWeather);
      setTimeOfDay(nextSt.defaultTimeOfDay);
      const updatedTuning: TuningSetup = {
        ...tuning,
        tireCompound: nextSt.recommendedTire,
      };
      setTuning(updatedTuning);

      if (engineRef.current) {
        engineRef.current.setTuning(updatedTuning);
        engineRef.current.configureStageAndWeather(
          nextSt.id,
          nextSt.defaultWeather,
          nextSt.defaultTimeOfDay,
          {
            preserveDamage: carriedDamage,
            serviceMinutesLeft: carriedSrvMins,
          }
        );
        engineRef.current.resetStageRun(true, {
          withCountdown: true,
          preserveDamage: carriedDamage,
          serviceMinutesLeft: carriedSrvMins,
        });
      }
      setPhase('playing');
      return;
    }

    const idx = stages.findIndex((s) => s.id === selectedStageId);
    const nextSt = stages[(idx + 1) % stages.length];
    setSelectedStageId(nextSt.id);
    setWeather(nextSt.defaultWeather);
    setTimeOfDay(nextSt.defaultTimeOfDay);
    const updatedTuning: TuningSetup = {
      ...tuning,
      tireCompound: nextSt.recommendedTire,
    };
    setTuning(updatedTuning);

    if (engineRef.current) {
      engineRef.current.setTuning(updatedTuning);
      engineRef.current.configureStageAndWeather(
        nextSt.id,
        nextSt.defaultWeather,
        nextSt.defaultTimeOfDay
      );
      engineRef.current.resetStageRun(true, { withCountdown: true });
    }
    setPhase('playing');
  };

  const handleUpdateTuning = (next: TuningSetup) => {
    setTuning(next);
    engineRef.current?.setTuning(next);
  };

  const handleSavePreset = (preset: TuningSetup) => {
    const nextList = saveCustomTuningPreset(preset);
    setPresets(nextList);
  };

  const handleUpdateInputSettings = (next: InputSettings) => {
    inputSettingsRef.current = next;
    setInputSettings(next);
    saveInputSettings(next);
    engineRef.current?.setInputSettings(next);
  };

  const handleQuickPresetSwitch = (preset: 'sport' | 'pro') => {
    const next = applyDrivingPreset(inputSettings, preset);
    handleUpdateInputSettings(next);
  };

  const handleToggleTransmissionHud = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    handleQuickPresetSwitch(drivingPreset === 'sport' ? 'pro' : 'sport');
  };

  const handleToggleCamera = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = engineRef.current?.cycleCameraMode();
    if (next) setCameraMode(next);
  };

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = !isMuted;
    isMutedRef.current = next;
    setIsMuted(next);
    engineRef.current?.audio.setMuted(next);
  };

  const handleTogglePauseButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (!engineRef.current) return;
    if (phase === 'playing') {
      engineRef.current.setPhase('paused');
      setPhase('paused');
    } else if (phase === 'paused') {
      engineRef.current.setPhase('playing');
      setPhase('playing');
    }
  };

  const countdownInt = Math.ceil(launchState.countdownSec);

  return (
    <main
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#090b0e] text-[#f1f5f9] select-none"
    >
      {/* 1. Isolated Full-Viewport WebGL 3D Canvas Container */}
      <div className="absolute inset-0 z-0">
        <canvas
          ref={canvasRef}
          data-testid="rally-webgl-canvas"
          className="w-full h-full block"
        />
      </div>

      {/* 2. TITLE SCREEN OVERLAY (3D Stage Flyover with Negative Space & SVG Emblem) */}
      {phase === 'title' && (
        <div className="absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-5 lg:p-7 overflow-y-auto pointer-events-auto lg:pointer-events-none">
          <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-start justify-between gap-4 lg:gap-6">
            {/* Left Column: Custom SVG Title Lockup, Mode Switches & Primary Actions */}
            <div className="w-full max-w-lg space-y-4 bg-[#090b0e]/90 border border-slate-800/90 p-5 rounded-lg pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-3.5">
                <svg
                  width="50"
                  height="50"
                  viewBox="0 0 64 64"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <polygon
                    points="32,4 60,18 60,46 32,60 4,46 4,18"
                    fill="#11161f"
                    stroke="#f59e0b"
                    strokeWidth="3"
                  />
                  <path d="M 15 44 L 27 20 L 37 20 L 25 44 Z" fill="#f59e0b" />
                  <path d="M 33 44 L 43 24 L 50 24 L 40 44 Z" fill="#e2e8f0" />
                </svg>
                <div>
                  <div className="text-[11px] font-mono-num tracking-widest text-[#f59e0b] font-semibold">
                    FIA WORLD STAGE RALLY · 120HZ DYNAMICS
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-none mt-0.5">
                    CHRONO STAGE
                  </h1>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                六站全球点对点硬核拉力模拟。四轮动态载荷转移、连续滑移率救车包络线、发车涡轮弹射起步、领航员自适应路书与车损继承锦标赛。
              </p>

              {/* Event Mode & Transmission Preset Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                <div className="bg-[#0e131b] border border-slate-800 rounded p-2 space-y-1.5">
                  <div className="text-[10px] font-mono-num text-slate-400">
                    赛事模式 (EVENT MODE)
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setEventMode('single')}
                      className={`py-1.5 px-2 text-xs font-bold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        eventMode === 'single'
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-[#141b25] text-slate-300 hover:text-white'
                      }`}
                    >
                      单站计时挑战
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventMode('championship')}
                      className={`py-1.5 px-2 text-xs font-bold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        eventMode === 'championship'
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-[#141b25] text-slate-300 hover:text-white'
                      }`}
                    >
                      WRC 6站锦标赛
                    </button>
                  </div>
                </div>

                <div className="bg-[#0e131b] border border-slate-800 rounded p-2 space-y-1.5">
                  <div className="text-[10px] font-mono-num text-slate-400">
                    换挡模式 (TRANSMISSION · G键)
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => handleQuickPresetSwitch('sport')}
                      className={`py-1.5 px-2 text-xs font-bold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        drivingPreset === 'sport'
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-[#141b25] text-slate-300 hover:text-white'
                      }`}
                    >
                      运动序列自动
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickPresetSwitch('pro')}
                      className={`py-1.5 px-2 text-xs font-bold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        drivingPreset === 'pro'
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-[#141b25] text-slate-300 hover:text-white'
                      }`}
                    >
                      硬核手排离合
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary CTA & Secondary Garage Button */}
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                <button
                  type="button"
                  data-start="true"
                  onClick={handleStartStage}
                  className="px-5 py-2.5 text-sm font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {eventMode === 'championship'
                    ? '开启 WRC 6站锦标赛 (SS01 发车)'
                    : '发车进入赛段 (START STAGE)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupModalDefaultService(false);
                    setShowSetupModal(true);
                  }}
                  className="px-4 py-2.5 text-xs font-semibold bg-[#141a23] hover:bg-slate-800 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  底盘调校与外设 ({tuning.drivetrain})
                </button>
              </div>

              {/* Active Setup & Record Quick Summary */}
              <div className="pt-2.5 border-t border-slate-800/90 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400 font-mono-num">
                <span>驱动: {tuning.drivetrain}</span>
                <span>·</span>
                <span>轮胎: {tuning.tireCompound.toUpperCase()}</span>
                <span>·</span>
                <span>
                  换挡: {drivingPreset === 'sport' ? 'SPORT自动序列' : 'PRO手排+离合'}
                </span>
                <span>·</span>
                <span className="text-[#f59e0b]">
                  {activeStageBest
                    ? `PB ${formatRallyTime(activeStageBest.bestTimeSec)}`
                    : `标杆 ${formatRallyTime(activeStage.targetParTimeSec)}`}
                </span>
              </div>
            </div>

            {/* Right Column: Compact 6-Stage Grid & Weather Selector */}
            <div className="w-full lg:w-[500px] bg-[#090b0e]/90 border border-slate-800/90 p-4 sm:p-5 rounded-lg pointer-events-auto shadow-2xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                  全球 6 大特殊赛段 (SPECIAL STAGES)
                </h2>
                <span className="font-mono-num text-xs text-[#f59e0b]">
                  {(activeStage.lengthM / 1000).toFixed(2)} KM · 落差 {activeStage.elevationGainM}m
                </span>
              </div>

              {eventMode === 'championship' && (
                <div className="px-3 py-1.5 rounded bg-[#f59e0b]/12 border border-[#f59e0b]/40 text-[11px] text-[#fbbf24]">
                  锦标赛规则：依次征战 SS01–SS06 共 6 站，与 7 支厂队 AI 车组争夺总成绩榜首；车损跨站继承，每 2 站开放 45 分钟中心维修区。
                </div>
              )}

              {/* 6 Stage Cards in Compact 2-Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stages.map((st) => {
                  const isSel = st.id === selectedStageId;
                  const pb = stageRecords[st.id];
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStage(st.id)}
                      className={`text-left p-2.5 rounded border transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-[#171e29] border-[#f59e0b]'
                          : 'bg-[#0e1218] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-100 truncate">
                          {st.code} · {st.nameZh}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono-num text-slate-400 mt-1">
                        <span className="truncate">
                          {st.country.split('·')[0].trim()} · {(st.lengthM / 1000).toFixed(2)}km
                        </span>
                        <span
                          className={`whitespace-nowrap shrink-0 ${
                            pb ? 'text-emerald-400' : 'text-amber-400/90'
                          }`}
                        >
                          {pb
                            ? `PB ${formatRallyTime(pb.bestTimeSec)}`
                            : `Par ${formatRallyTime(st.targetParTimeSec)}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-[#0c1016] px-3 py-2 rounded border border-slate-800/80">
                <span className="text-[#f59e0b] font-semibold mr-1.5">
                  [{activeStage.surfaceMixLabel}]
                </span>
                {activeStage.descriptionZh}
              </p>

              {/* Weather & Time of Day Controls (Active in Single-Stage Mode) */}
              <div className="grid grid-cols-2 gap-3 pt-0.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    气象条件 (抓地与能见度)
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {WEATHER_OPTIONS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleWeatherChange(w.id)}
                        className={`py-1.5 px-1.5 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap cursor-pointer ${
                          weather === w.id
                            ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                            : 'bg-[#0d1117] text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    发车时段 (天空光影与射灯)
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {TIME_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTimeOfDayChange(t.id)}
                        className={`py-1.5 px-1.5 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap cursor-pointer ${
                          timeOfDay === t.id
                            ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                            : 'bg-[#0d1117] text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Flat Borderless Control Hint Line at Bottom Safe Margin */}
          <div className="w-full text-center text-xs text-slate-300 font-mono-num tracking-wide py-1.5 bg-[#090b0e]/80 rounded">
            W/S 或 ↑/↓ 油门与刹车 · A/D 或 ←/→ 转向 · Space 手刹甩尾 · Q/E 升降挡 · G 切换自动/手排 · C 切换四视角 · P 暂停抢修
          </div>
        </div>
      )}

      {/* 3. ACTIVE GAMEPLAY HUD (Minimalist Motorsport Telemetry, >=85% Clear Center Playfield) */}
      <div
        className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-150 ${
          phase === 'playing' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top-Center: Functional 3D Rear-View Mirror Bezel + Co-Driver Pacenote Strip + Sector Split Toast */}
        <div
          style={{ top: '2.2%' }}
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        >
          {/* Bezel frame aligning with WebGL scissor rear-view mirror pass */}
          <div
            ref={mirrorFrameElRef}
            style={{
              width: 'min(28vw, 340px)',
              height: '72px',
              display: cameraMode === 'cockpit' ? 'block' : 'none',
            }}
            className="hidden sm:block border-2 border-slate-700/90 rounded bg-transparent shadow-lg relative"
          >
            <span className="absolute bottom-1 right-2 text-[9px] font-mono-num text-slate-300/80 tracking-wider">
              REAR VIEW
            </span>
          </div>

          {/* Co-Driver Pacenote Callout Strip */}
          {inputSettings.pacenoteVisualEnabled && activePacenote && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[#090b0e]/90 border border-slate-800 rounded-lg shadow-xl">
              <PacenoteSignSvg note={activePacenote} size={50} />
              <div className="min-w-[165px]">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold text-white tracking-wide">
                    {activePacenote.calloutTextZh}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300 font-mono-num">
                  {activePacenote.modifier && (
                    <span className="text-[#f59e0b] font-semibold">
                      [{activePacenote.modifier}]
                    </span>
                  )}
                  {activePacenote.distanceLinkM && (
                    <span>接 {activePacenote.distanceLinkM}m</span>
                  )}
                </div>
              </div>

              {nextPacenote && (
                <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 opacity-85">
                  <PacenoteSignSvg note={nextPacenote} size={34} />
                  <div className="text-[11px] text-slate-400 max-w-[100px] truncate">
                    下一弯: {nextPacenote.calloutTextZh}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transient Sector Split Delta Banner */}
          {splitToast && (
            <div
              className={`px-4 py-1.5 rounded border font-mono-num text-xs font-bold shadow-lg flex items-center gap-3 ${
                splitToast.deltaSec <= 0
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                  : 'bg-amber-950/90 border-amber-500 text-amber-300'
              }`}
            >
              <span>SECTOR 0{splitToast.sector} SPLIT</span>
              <span className="text-white">{formatRallyTime(splitToast.splitTimeSec)}</span>
              <span>
                {splitToast.deltaSec <= 0 ? '' : '+'}
                {splitToast.deltaSec.toFixed(2)}s vs {splitToast.referenceLabel}
              </span>
            </div>
          )}
        </div>

        {/* Center Start-Line WRC 3-2-1-GO! Launch Control & Anti-Lag Spool Overlay */}
        {launchState.active && (
          <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 pointer-events-none">
            {launchState.countdownSec > 0 ? (
              <div className="bg-[#090b0e]/92 border border-slate-700 rounded-lg px-6 py-4 shadow-2xl flex flex-col items-center gap-2.5">
                <div className="text-[11px] font-mono-num tracking-widest text-slate-400">
                  FIA STAGE START CONTROL
                </div>
                <div className="flex items-center gap-3">
                  {[3, 2, 1].map((n) => {
                    const lit = countdownInt <= n;
                    return (
                      <div
                        key={n}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-mono-num text-sm font-bold ${
                          lit
                            ? 'bg-rose-600 border-rose-300 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-500'
                        }`}
                      >
                        {n}
                      </div>
                    );
                  })}
                </div>
                <div
                  className={`text-xs font-semibold px-3 py-1 rounded border ${
                    launchState.boostReady
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-amber-300'
                  }`}
                >
                  {launchState.boostReady
                    ? 'ANTI-LAG READY · 涡轮正压就绪！保持油门准备弹射'
                    : '按住油门 (W / ↑) 憋出偏时点火涡轮正压触发完美弹射'}
                </div>
              </div>
            ) : (
              launchState.bannerText && (
                <div
                  className={`px-6 py-2.5 rounded-lg border-2 font-display text-2xl font-bold tracking-wide shadow-2xl ${
                    launchState.bannerTone === 'emerald'
                      ? 'bg-emerald-950/92 border-emerald-400 text-emerald-300'
                      : 'bg-[#090b0e]/92 border-[#f59e0b] text-[#f59e0b]'
                  }`}
                >
                  {launchState.bannerText}
                </div>
              )
            )}
          </div>
        )}

        {/* Top-Left Cluster: Stage Timer, Delta vs PB Ghost & Stage Progress */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-[#090b0e]/88 border border-slate-800 rounded-lg p-3 w-56 sm:w-64 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-num">
            <span>
              {activeStage.code} · {tuning.drivetrain}
              {eventMode === 'championship' && champStanding ? ` · P${champStanding.rank}` : ''}
            </span>
            <span ref={surfaceBadgeElRef} className="text-[#f59e0b] font-semibold">
              砂石 (Gravel)
            </span>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 tracking-wider">STAGE TIME</div>
            <div
              ref={stageTimeElRef}
              className="font-mono-num text-2xl sm:text-3xl font-bold text-white leading-tight stroke-text"
            >
              00:00.000
            </div>
            <div
              ref={deltaTimeElRef}
              className="font-mono-num text-xs font-semibold text-emerald-400 mt-0.5"
            >
              +0.00s vs PAR
            </div>
          </div>

          {/* Stage Distance Progress Bar with Sector Split Ticks */}
          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            <div className="flex justify-between text-[11px] font-mono-num text-slate-300">
              <span>PROGRESS</span>
              <span ref={progressTextElRef}>
                0.00 / {(activeStage.lengthM / 1000).toFixed(2)} km (0%)
              </span>
            </div>
            <div className="relative w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                ref={progressBarElRef}
                className="h-full bg-[#f59e0b]"
                style={{ width: '0%' }}
              />
              <div className="absolute top-0 bottom-0 left-1/3 w-px bg-slate-500/80" />
              <div className="absolute top-0 bottom-0 left-2/3 w-px bg-slate-500/80" />
            </div>
          </div>

          {/* Dirty Tarmac / Engine Stall Live Warnings */}
          <div
            ref={dirtyTireWarnElRef}
            style={{ display: 'none' }}
            className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-700/60 px-2 py-1 rounded"
          >
            轮胎附着砂石脏污 · 柏油抓地下降
          </div>
          <div
            ref={stallWarnElRef}
            style={{ display: 'none' }}
            className="text-[11px] font-bold text-rose-400 bg-rose-950/80 border border-rose-700 px-2 py-1 rounded"
          >
            引擎熄火！踩离合(Shift)+油门(W)或按 I 点火
          </div>
        </div>

        {/* Top-Right Cluster: Quick Controls + Bespoke SVG 6-Zone WRC Car Damage Diagram */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label="切换自动或手动换挡 (Gearbox G)"
              onClick={handleToggleTransmissionHud}
              className="px-2.5 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono-num text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span className="text-[#f59e0b] font-bold">
                {drivingPreset === 'sport' ? 'AUTO' : 'MAN'}
              </span>
              <span className="text-[10px] text-slate-400">[G]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="切换视角 (Camera C)"
              onClick={handleToggleCamera}
              className="px-2.5 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono-num text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>视角:{CAMERA_LABELS_ZH[cameraMode]}</span>
              <span className="text-[10px] text-slate-400">[C]</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="赛段救援复位 (+15秒罚时)"
              onClick={(e) => {
                e.currentTarget.blur();
                engineRef.current?.recoverCarToRoadWithPenalty();
              }}
              className="px-2.5 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono-num text-amber-400 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>救援</span>
              <span className="text-[10px]">+15s</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={isMuted ? '取消静音 (Unmute M)' : '静音 (Mute M)'}
              onClick={handleToggleMute}
              className="w-9 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {!isMuted ? (
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                ) : (
                  <line x1="23" y1="9" x2="17" y2="15" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="暂停与维修设定 (Pause P)"
              onClick={handleTogglePauseButton}
              className="w-9 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          </div>

          {/* 6-Zone WRC Car Silhouette + Partitioned Damage Telemetry */}
          <div className="bg-[#090b0e]/88 border border-slate-800 rounded-lg p-2.5 w-60 shadow-lg flex items-center gap-2.5">
            {/* Top-Down WRC Car Subsystem SVG Silhouette */}
            <svg
              width="52"
              height="92"
              viewBox="0 0 64 114"
              className="shrink-0"
              aria-label="赛车六分区机械损伤示意图"
            >
              {/* Chassis outline */}
              <rect
                x="13"
                y="8"
                width="38"
                height="98"
                rx="9"
                fill="#111722"
                stroke="#334155"
                strokeWidth="2"
              />
              {/* Front rally light pod */}
              <rect
                x="19"
                y="3"
                width="26"
                height="5"
                rx="2"
                fill={zoneColorHex(damage.lights)}
              />
              {/* Suspension wishbone arms */}
              <line
                x1="12"
                y1="26"
                x2="52"
                y2="26"
                stroke={zoneColorHex(damage.suspension)}
                strokeWidth="3"
              />
              <line
                x1="12"
                y1="86"
                x2="52"
                y2="86"
                stroke={zoneColorHex(damage.suspension)}
                strokeWidth="3"
              />
              {/* Front steering rack */}
              <rect
                x="19"
                y="32"
                width="26"
                height="6"
                rx="2"
                fill={zoneColorHex(damage.steering)}
              />
              {/* Turbo engine block */}
              <rect
                x="20"
                y="13"
                width="24"
                height="16"
                rx="3"
                fill={zoneColorHex(damage.engine)}
              />
              {/* Center sequential gearbox & diff tunnel */}
              <rect
                x="25"
                y="43"
                width="14"
                height="34"
                rx="3"
                fill={zoneColorHex(damage.gearbox)}
              />
              {/* Rear wing */}
              <rect x="15" y="99" width="34" height="5" rx="1.5" fill="#475569" />
              {/* 4 Wide Rally Tires */}
              <rect x="4" y="16" width="8" height="20" rx="2" fill={zoneColorHex(damage.tires)} />
              <rect x="52" y="16" width="8" height="20" rx="2" fill={zoneColorHex(damage.tires)} />
              <rect x="4" y="76" width="8" height="20" rx="2" fill={zoneColorHex(damage.tires)} />
              <rect x="52" y="76" width="8" height="20" rx="2" fill={zoneColorHex(damage.tires)} />
            </svg>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
                <span>DAMAGE</span>
                <span>SRV {serviceMinutesLeft}M</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono-num">
                {(
                  [
                    { k: 'steering', label: '转向' },
                    { k: 'suspension', label: '悬挂' },
                    { k: 'engine', label: '引擎' },
                    { k: 'gearbox', label: '变速' },
                    { k: 'tires', label: '轮胎' },
                    { k: 'lights', label: '车灯' },
                  ] as const
                ).map((z) => {
                  const dmg = damage[z.k];
                  const hp = Math.max(0, Math.round((1 - dmg) * 100));
                  const colorClass =
                    hp > 75
                      ? 'text-emerald-400 border-emerald-900/60'
                      : hp > 40
                        ? 'text-amber-400 border-amber-800/80'
                        : 'text-rose-400 border-rose-800';
                  return (
                    <div
                      key={z.k}
                      className={`px-1.5 py-0.5 bg-[#11161f] border rounded flex items-center justify-between ${colorClass}`}
                    >
                      <span>{z.label}</span>
                      <span>{hp}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom-Right Cluster: 12-LED Shift Cluster, Tachometer, Gear, Speed, Boost & Pedals */}
        <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 bg-[#090b0e]/90 border border-slate-800 rounded-lg p-3.5 w-68 sm:w-76 shadow-2xl space-y-2">
          {/* 12-Segment WRC LED Shift Light Cluster */}
          <div ref={rpmLedContainerElRef} className="grid grid-cols-12 gap-1 h-2">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-sm bg-slate-800 opacity-45"
              />
            ))}
          </div>

          {/* Shift Light & RPM Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-num">
              <span className="text-slate-400">
                RPM{' '}
                <span ref={rpmTextElRef} className="text-slate-200 font-semibold">
                  1050
                </span>
              </span>
              <span
                ref={shiftLightElRef}
                style={{ opacity: 0.15 }}
                className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded"
              >
                SHIFT UP
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded overflow-hidden border border-slate-800">
              <div
                ref={rpmBarElRef}
                className="h-full bg-emerald-500 transition-none"
                style={{ width: '14%' }}
              />
            </div>
          </div>

          {/* Primary Readout: Gear + Speed + Pedal Bars */}
          <div className="flex items-center justify-between gap-3 pt-0.5">
            {/* Gear Indicator */}
            <div className="w-14 h-16 bg-[#121721] border border-slate-700 rounded flex flex-col items-center justify-center shrink-0">
              <span className="text-[9px] font-mono-num text-slate-400 leading-none">
                {drivingPreset === 'sport' ? 'AUTO' : 'GEAR'}
              </span>
              <div
                ref={gearElRef}
                className="font-display text-4xl font-bold text-[#f59e0b] leading-none mt-0.5"
              >
                1
              </div>
            </div>

            {/* Speed & Turbo Boost */}
            <div className="flex-1 text-right">
              <div className="flex items-baseline justify-end gap-1.5">
                <span
                  ref={speedElRef}
                  className="font-mono-num text-4xl sm:text-5xl font-bold text-white leading-none stroke-text"
                >
                  0
                </span>
                <span className="text-xs font-mono-num text-slate-400 font-semibold">KM/H</span>
              </div>
              <div className="text-[11px] font-mono-num text-slate-400 mt-1">
                TURBO <span ref={boostTextElRef} className="text-cyan-400">+0.00 BAR</span>
              </div>
            </div>

            {/* Live Linear Pedal Telemetry Bars (CLU / BRK / THR) */}
            <div className="flex items-end gap-1.5 h-14 pl-2 border-l border-slate-800">
              <div className="flex flex-col items-center gap-0.5 h-full">
                <div className="w-2.5 flex-1 bg-slate-900 rounded overflow-hidden flex items-end">
                  <div ref={clutchBarElRef} className="w-full bg-cyan-400" style={{ height: '0%' }} />
                </div>
                <span className="text-[9px] font-mono-num text-slate-400">C</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 h-full">
                <div className="w-2.5 flex-1 bg-slate-900 rounded overflow-hidden flex items-end">
                  <div ref={brakeBarElRef} className="w-full bg-rose-500" style={{ height: '0%' }} />
                </div>
                <span className="text-[9px] font-mono-num text-slate-400">B</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 h-full">
                <div className="w-2.5 flex-1 bg-slate-900 rounded overflow-hidden flex items-end">
                  <div
                    ref={throttleBarElRef}
                    className="w-full bg-emerald-400"
                    style={{ height: '0%' }}
                  />
                </div>
                <span className="text-[9px] font-mono-num text-slate-400">T</span>
              </div>
            </div>
          </div>

          {/* Live Steering Angle Mini-Gauge */}
          <div className="relative w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600" />
            <div
              ref={steeringIndicatorElRef}
              className="absolute top-0 bottom-0 w-2 bg-[#f59e0b] rounded-full -translate-x-1/2"
              style={{ left: '50%' }}
            />
          </div>
        </div>

        {/* Mobile / Touch Virtual Controls Layout (Visible on mobile/tablet screens <= 900px) */}
        <div className="absolute bottom-3 left-3 right-3 z-20 flex lg:hidden items-end justify-between pointer-events-none">
          <div className="bg-[#090b0e]/85 border border-slate-700 rounded-lg p-2.5 flex flex-col gap-2 pointer-events-auto w-44">
            <div className="text-[10px] font-mono-num text-slate-400 text-center">
              STEERING (TOUCH SLIDER)
            </div>
            <input
              type="range"
              aria-label="触控线性方向盘"
              min="-1"
              max="1"
              step="0.02"
              defaultValue="0"
              onChange={(e) => {
                if (engineRef.current) {
                  engineRef.current.input.touchSteer = parseFloat(e.target.value);
                }
              }}
              onTouchEnd={(e) => {
                e.currentTarget.value = '0';
                if (engineRef.current) engineRef.current.input.touchSteer = 0;
              }}
              onMouseUp={(e) => {
                e.currentTarget.value = '0';
                if (engineRef.current) engineRef.current.input.touchSteer = 0;
              }}
              className="w-full h-8 accent-[#f59e0b]"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => engineRef.current?.input.triggerTouchAction('shiftDown')}
                className="py-2 bg-slate-800 active:bg-[#f59e0b] active:text-black text-xs font-bold rounded text-slate-200"
              >
                降挡 (Q)
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.input.triggerTouchAction('shiftUp')}
                className="py-2 bg-slate-800 active:bg-[#f59e0b] active:text-black text-xs font-bold rounded text-slate-200"
              >
                升挡 (E)
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2 pointer-events-auto">
            <button
              type="button"
              onTouchStart={() => {
                if (engineRef.current) engineRef.current.input.touchHandbrake = 1;
              }}
              onTouchEnd={() => {
                if (engineRef.current) engineRef.current.input.touchHandbrake = 0;
              }}
              onMouseDown={() => {
                if (engineRef.current) engineRef.current.input.touchHandbrake = 1;
              }}
              onMouseUp={() => {
                if (engineRef.current) engineRef.current.input.touchHandbrake = 0;
              }}
              className="w-12 h-16 bg-amber-950/90 border border-amber-600 rounded text-xs font-bold text-amber-300"
            >
              手刹
            </button>
            <button
              type="button"
              onTouchStart={() => {
                if (engineRef.current) engineRef.current.input.touchBrake = 1;
              }}
              onTouchEnd={() => {
                if (engineRef.current) engineRef.current.input.touchBrake = 0;
              }}
              onMouseDown={() => {
                if (engineRef.current) engineRef.current.input.touchBrake = 1;
              }}
              onMouseUp={() => {
                if (engineRef.current) engineRef.current.input.touchBrake = 0;
              }}
              className="w-14 h-20 bg-rose-950/90 border border-rose-600 rounded text-xs font-bold text-rose-200"
            >
              刹车
            </button>
            <button
              type="button"
              onTouchStart={() => {
                if (engineRef.current) engineRef.current.input.touchThrottle = 1;
              }}
              onTouchEnd={() => {
                if (engineRef.current) engineRef.current.input.touchThrottle = 0;
              }}
              onMouseDown={() => {
                if (engineRef.current) engineRef.current.input.touchThrottle = 1;
              }}
              onMouseUp={() => {
                if (engineRef.current) engineRef.current.input.touchThrottle = 0;
              }}
              className="w-14 h-24 bg-emerald-950/90 border border-emerald-600 rounded text-xs font-bold text-emerald-200"
            >
              油门
            </button>
          </div>
        </div>
      </div>

      {/* 4. PAUSED MODAL */}
      {phase === 'paused' && !showSetupModal && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#090b0e]/88 p-4 pointer-events-auto"
          role="dialog"
          aria-label="比赛已暂停"
        >
          <div className="w-full max-w-md bg-[#0f1319] border border-slate-800 rounded-lg p-6 shadow-2xl space-y-5">
            <div>
              <div className="text-xs font-mono-num text-[#f59e0b]">
                {activeStage.code} · {activeStage.nameZh}
              </div>
              <h2 className="font-display text-3xl font-bold text-white tracking-wide mt-0.5">
                赛段暂停 (STAGE PAUSED)
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#131820] border border-slate-800 rounded p-3 text-xs font-mono-num">
              <div>
                <div className="text-slate-400">维修剩余工时</div>
                <div className="text-base font-bold text-[#f59e0b]">{serviceMinutesLeft} MIN</div>
              </div>
              <div>
                <div className="text-slate-400">驱动与换挡</div>
                <div className="text-base font-bold text-slate-200">
                  {tuning.drivetrain} · {drivingPreset === 'sport' ? 'AUTO' : 'MANUAL'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleResumeStage}
                className="w-full py-2.5 px-4 text-xs font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors cursor-pointer"
              >
                继续驾驶赛段 (Resume · Esc)
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupModalDefaultService(true);
                  setShowSetupModal(true);
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-[#161c26] hover:bg-slate-800 text-slate-100 border border-slate-700 rounded transition-colors cursor-pointer"
              >
                进入维修车间抢修与调校 (Service &amp; Setup)
              </button>

              <button
                type="button"
                onClick={handleRestartCurrentStage}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-[#161c26] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors cursor-pointer"
              >
                从起点重新发车 (Restart Stage)
              </button>

              <button
                type="button"
                onClick={() => {
                  engineRef.current?.setPhase('title');
                  setPhase('title');
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
              >
                退回赛事主界面 (Return to Title)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SETUP, GARAGE & SERVICE PARK MODAL */}
      {showSetupModal && (
        <SetupAndGarageModal
          tuning={tuning}
          presets={presets}
          inputSettings={inputSettings}
          damage={damage}
          serviceMinutesLeft={serviceMinutesLeft}
          showServiceTab={
            setupModalDefaultService || phase === 'paused' || phase === 'gameover'
          }
          onUpdateTuning={handleUpdateTuning}
          onSavePreset={handleSavePreset}
          onUpdateInputSettings={handleUpdateInputSettings}
          onRepairZone={(zone, costMin) => {
            engineRef.current?.repairSubsystem(zone, costMin);
          }}
          onClose={() => setShowSetupModal(false)}
        />
      )}

      {/* 6. STAGE COMPLETE / RETIRED TELEMETRY MODAL */}
      {phase === 'gameover' && finishSummary && !showSetupModal && (
        <StageFinishModal
          summary={finishSummary}
          eventMode={eventMode}
          championship={championship}
          serviceMinutesLeft={serviceMinutesLeft}
          onRetryStage={handleRestartCurrentStage}
          onNextStage={handleNextStage}
          onOpenSetup={() => {
            setSetupModalDefaultService(true);
            setShowSetupModal(true);
          }}
          onBackToTitle={() => {
            setFinishSummary(null);
            engineRef.current?.setPhase('title');
            setPhase('title');
          }}
        />
      )}
    </main>
  );
}
