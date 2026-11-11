import React, { useEffect, useRef, useState } from 'react';
import { PacenoteSignSvg } from '../../components/PacenoteSignSvg.tsx';
import { SetupAndGarageModal } from '../../components/SetupAndGarageModal.tsx';
import { StageFinishModal } from '../../components/StageFinishModal.tsx';
import { createInitialDamageState } from '../../game/physics.ts';
import {
  GamePhase,
  RallySimulationEngine,
  StageFinishSummary,
  formatRallyTime,
} from '../../game/rallyEngine.ts';
import { getAllStages } from '../../game/stages.ts';
import {
  loadInputSettings,
  loadSavedTuningPresets,
  loadStageRecords,
  saveCustomTuningPreset,
  saveInputSettings,
} from '../../game/storage.ts';
import {
  CameraMode,
  DamageState,
  InputSettings,
  PacenoteItem,
  StageRecord,
  TimeOfDay,
  TuningSetup,
  WeatherType,
} from '../../game/types.ts';

const WEATHER_OPTIONS: Array<{ id: WeatherType; label: string }> = [
  { id: 'clear', label: '晴朗 (Clear)' },
  { id: 'rain', label: '降雨 (Rain)' },
  { id: 'fog', label: '浓雾 (Fog)' },
  { id: 'snow', label: '风雪 (Snow)' },
];

const TIME_OPTIONS: Array<{ id: TimeOfDay; label: string }> = [
  { id: 'day', label: '正午 (Day)' },
  { id: 'dusk', label: '黄昏 (Dusk)' },
  { id: 'night', label: '暗夜 (Night)' },
];

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
  const shiftLightElRef = useRef<HTMLDivElement | null>(null);
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
  const [sectorTimes, setSectorTimes] = useState<[number, number, number]>([0, 0, 0]);
  const [serviceMinutesLeft, setServiceMinutesLeft] = useState<number>(45);

  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [setupModalDefaultService, setSetupModalDefaultService] = useState<boolean>(false);
  const [finishSummary, setFinishSummary] = useState<StageFinishSummary | null>(null);

  const activeStage = stages.find((s) => s.id === selectedStageId) || stages[0];
  const activeStageBest: StageRecord | null = stageRecords[activeStage.id] || null;

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

    engine.onStageFinish = (summary) => {
      setFinishSummary(summary);
      setPhase('gameover');
      setStageRecords(loadStageRecords());
    };

    engine.onCameraModeChanged = (mode) => {
      setCameraMode(mode);
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

    // Check ?autostart=1 query param
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.resetStageRun(true);
      setPhase('playing');
    } else {
      engine.setPhase('title');
      setPhase('title');
    }

    engine.startLoop();

    return () => {
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
  }, [phase, showSetupModal, selectedStageId, weather, timeOfDay, tuning]);

  const handleSelectStage = (stageId: string) => {
    const st = stages.find((s) => s.id === stageId) || stages[0];
    setSelectedStageId(st.id);
    setWeather(st.defaultWeather);
    setTimeOfDay(st.defaultTimeOfDay);
    // Automatically match recommended tire compound when switching stage
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
    setShowSetupModal(false);
    if (engineRef.current) {
      engineRef.current.configureStageAndWeather(selectedStageId, weather, timeOfDay);
      engineRef.current.setTuning(tuning);
      engineRef.current.setInputSettings(inputSettings);
      engineRef.current.resetStageRun(true);
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
    setShowSetupModal(false);
    engineRef.current?.resetStageRun(true);
    setPhase('playing');
  };

  const handleNextStage = () => {
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
    setFinishSummary(null);
    setShowSetupModal(false);

    if (engineRef.current) {
      engineRef.current.setTuning(updatedTuning);
      engineRef.current.configureStageAndWeather(
        nextSt.id,
        nextSt.defaultWeather,
        nextSt.defaultTimeOfDay
      );
      engineRef.current.resetStageRun(true);
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
    setInputSettings(next);
    saveInputSettings(next);
    engineRef.current?.setInputSettings(next);
  };

  const handleToggleCamera = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = engineRef.current?.cycleCameraMode();
    if (next) setCameraMode(next);
  };

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = !isMuted;
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

  return (
    <main ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#090b0e] select-none">
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
        <div className="absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-6 lg:p-10 overflow-y-auto pointer-events-auto lg:pointer-events-none">
          {/* Top-Left Bespoke Motorsport SVG Emblem & Asymmetric Stage Selector */}
          <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-start justify-between gap-4 lg:gap-8 pt-1">
            {/* Left Column: Custom SVG Title Lockup & Primary Actions */}
            <div className="max-w-lg space-y-5 bg-[#090b0e]/88 border border-slate-800/90 p-6 rounded-lg pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-3.5">
                <svg
                  width="54"
                  height="54"
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
                  <path
                    d="M 16 44 L 28 20 L 38 20 L 26 44 Z"
                    fill="#f59e0b"
                  />
                  <path
                    d="M 34 44 L 44 24 L 50 24 L 40 44 Z"
                    fill="#e2e8f0"
                  />
                </svg>
                <div>
                  <div className="text-xs font-mono-num tracking-widest text-[#f59e0b] font-semibold">
                    FIA STAGE RALLY SIMULATION · 120HZ DYNAMICS
                  </div>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-none mt-0.5">
                    CHRONO STAGE
                  </h1>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                纯对表点对点硬核拉力模拟。真实四轮载荷转移、连续滑移率轮胎峰值与救车过渡区、手动序列档与离合半联动、涡轮迟滞、自适应领航员路书。唯一要打败的是时间。
              </p>

              {/* Primary CTA & Secondary Garage Button (<= 3 actions total) */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  data-start="true"
                  onClick={handleStartStage}
                  className="px-6 py-3 text-sm font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  发车进入赛段 (START STAGE)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupModalDefaultService(false);
                    setShowSetupModal(true);
                  }}
                  className="px-4 py-3 text-xs font-semibold bg-[#141a23] hover:bg-slate-800 text-slate-100 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  车辆调校与外设设定 ({tuning.drivetrain})
                </button>
              </div>

              {/* Active Setup & Record Quick Summary */}
              <div className="pt-3 border-t border-slate-800/90 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono-num">
                <span>驱动: {tuning.drivetrain}</span>
                <span>·</span>
                <span>轮胎: {tuning.tireCompound.toUpperCase()}</span>
                <span>·</span>
                <span>默认视角: 座舱拟真 (Cockpit)</span>
                <span>·</span>
                <span className="text-[#f59e0b]">
                  PB:{' '}
                  {activeStageBest
                    ? formatRallyTime(activeStageBest.bestTimeSec)
                    : '尚无纪录 (Par ' + formatRallyTime(activeStage.targetParTimeSec) + ')'}
                </span>
              </div>
            </div>

            {/* Right Column: Stage & Weather Selector */}
            <div className="w-full lg:w-[460px] bg-[#090b0e]/88 border border-slate-800/90 p-5 rounded-lg pointer-events-auto shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                  选择赛段与气象条件 (STAGE &amp; WEATHER)
                </h2>
                <span className="font-mono-num text-xs text-[#f59e0b]">
                  {(activeStage.lengthM / 1000).toFixed(2)} KM · 落差 {activeStage.elevationGainM}m
                </span>
              </div>

              {/* 4 Stage Cards */}
              <div className="space-y-2">
                {stages.map((st) => {
                  const isSel = st.id === selectedStageId;
                  const pb = stageRecords[st.id];
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStage(st.id)}
                      className={`w-full text-left p-3 rounded border transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-[#171e29] border-[#f59e0b]'
                          : 'bg-[#0e1218] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-100">
                          {st.code} · {st.nameZh}
                        </span>
                        <span className="font-mono-num text-xs text-slate-400">
                          {(st.lengthM / 1000).toFixed(1)} km ·{' '}
                          {pb ? `PB ${formatRallyTime(pb.bestTimeSec)}` : `标杆 ${formatRallyTime(st.targetParTimeSec)}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {st.surfaceMixLabel}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-[#0c1016] p-3 rounded border border-slate-800/80">
                {activeStage.descriptionZh}
              </p>

              {/* Weather & Time of Day Controls */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    气象条件 (影响抓地与能见度)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WEATHER_OPTIONS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleWeatherChange(w.id)}
                        className={`py-1.5 px-2 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 ${
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
                    发车时段 (影响光影与车灯照明)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TIME_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTimeOfDayChange(t.id)}
                        className={`py-1.5 px-2 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 ${
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
          <div className="w-full text-center text-xs text-slate-300 font-mono-num tracking-wide py-1.5 bg-[#090b0e]/75 rounded">
            W/S 或 ↑/↓ 油门与刹车 · A/D 或 ←/→ 渐进转向 · Q/E 升降挡 · Space 手刹甩尾 · Shift 离合半联动 · C 切换视角 · Esc 暂停与抢修
          </div>
        </div>
      )}

      {/* 3. ACTIVE GAMEPLAY HUD (Minimalist Motorsport Telemetry, >=85% Clear Center Playfield) */}
      <div
        className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-150 ${
          phase === 'playing' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top-Center: Functional 3D Rear-View Mirror Bezel (Cockpit Mode) + Co-Driver Pacenote Strip */}
        <div
          style={{ top: '2.5%' }}
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
              <PacenoteSignSvg note={activePacenote} size={52} />
              <div className="min-w-[170px]">
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
                <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 opacity-80">
                  <PacenoteSignSvg note={nextPacenote} size={36} />
                  <div className="text-[11px] text-slate-400 max-w-[100px] truncate">
                    下一弯: {nextPacenote.calloutTextZh}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top-Left Cluster: Stage Timer, Delta vs PB Ghost & Stage Progress */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-[#090b0e]/88 border border-slate-800 rounded-lg p-3 w-56 sm:w-64 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-num">
            <span>
              {activeStage.code} · {tuning.drivetrain}
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

          {/* Stage Distance Progress Bar */}
          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            <div className="flex justify-between text-[11px] font-mono-num text-slate-300">
              <span>PROGRESS</span>
              <span ref={progressTextElRef}>0.00 / 3.80 km (0%)</span>
            </div>
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                ref={progressBarElRef}
                className="h-full bg-[#f59e0b]"
                style={{ width: '0%' }}
              />
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

        {/* Top-Right Cluster: Utility Buttons + 6-Zone Partitioned Damage Diagram */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label="切换视角 (Camera C)"
              onClick={handleToggleCamera}
              className="px-2.5 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded text-xs font-mono-num text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>视角: {cameraMode.toUpperCase()}</span>
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
              <span>救援复位</span>
              <span className="text-[10px]">+15s</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label={isMuted ? '取消静音 (Unmute M)' : '静音 (Mute M)'}
              onClick={handleToggleMute}
              className="w-9 h-9 bg-[#090b0e]/90 hover:bg-slate-800 border border-slate-700 rounded flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          </div>

          {/* 6-Zone Partitioned Damage Status Cluster */}
          <div className="bg-[#090b0e]/88 border border-slate-800 rounded-lg p-2.5 w-48 space-y-1.5 shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
              <span>MECHANICAL INTEGRITY</span>
              <span>6-ZONE</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono-num">
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
                    className={`px-2 py-0.5 bg-[#11161f] border rounded flex items-center justify-between ${colorClass}`}
                  >
                    <span>{z.label}</span>
                    <span>{hp}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom-Right Cluster: Motorsport Digital Tachometer, Gear, Speed, Boost & Pedal Telemetry */}
        <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 bg-[#090b0e]/90 border border-slate-800 rounded-lg p-3.5 w-68 sm:w-76 shadow-2xl space-y-2.5">
          {/* Shift Light & RPM Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono-num">
              <span className="text-slate-400">
                RPM <span ref={rpmTextElRef} className="text-slate-200 font-semibold">1050</span>
              </span>
              <span
                ref={shiftLightElRef}
                style={{ opacity: 0.15 }}
                className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded"
              >
                SHIFT UP
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded overflow-hidden border border-slate-800">
              <div
                ref={rpmBarElRef}
                className="h-full bg-emerald-500 transition-none"
                style={{ width: '14%' }}
              />
            </div>
          </div>

          {/* Primary Readout: Gear + Speed + Pedal Bars */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {/* Gear Indicator */}
            <div className="w-14 h-16 bg-[#121721] border border-slate-700 rounded flex flex-col items-center justify-center shrink-0">
              <span className="text-[9px] font-mono-num text-slate-400 leading-none">GEAR</span>
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
                  <div ref={throttleBarElRef} className="w-full bg-emerald-400" style={{ height: '0%' }} />
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
          {/* Left Thumb: Virtual Analog Steering Pad */}
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

          {/* Right Thumb: Throttle, Brake & Handbrake Touch Pedals */}
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

      {/* 4. PAUSED MODAL (Single Focused Card with Service Park & Setup Access) */}
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
                <div className="text-slate-400">当前驱动与轮胎</div>
                <div className="text-base font-bold text-slate-200">
                  {tuning.drivetrain} · {tuning.tireCompound.toUpperCase()}
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
          showServiceTab={setupModalDefaultService || phase === 'paused'}
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
