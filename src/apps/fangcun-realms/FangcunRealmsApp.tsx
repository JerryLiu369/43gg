import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, ExpansionId } from './engine/index.ts';
import './fangcun.css';
import { GameScreen } from './GameScreen.tsx';
import { advanceFcGuide, fcGuideSignals, findScoringPlacement, type FcGuideStep } from './guide.ts';
import { Handbook } from './Handbook.tsx';
import { getCatalog } from './lib/catalog.ts';
import { SetupScreen, type SetupStartConfig } from './SetupScreen.tsx';
import type { BotLevel, FcLocalMatch, FcMetaSave, SeatConfig } from './lib/types.ts';
import {
  applyHumanFcAction,
  createLocalFcMatch,
  getHumanSeats,
  hasPendingFcBot,
  projectFcMatch,
  stepFcBot,
} from './session.ts';
import { sound } from './sound.ts';
import {
  loadActiveFcRun,
  loadFcMeta,
  recordFcMatchOutcome,
  saveActiveFcRun,
  updateFcPreferences,
} from './storage.ts';

function isAutostartMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  } catch {
    return false;
  }
}

function defaultSeatsFromMeta(meta: FcMetaSave): SeatConfig[] {
  if (meta.preferredSeats && meta.preferredSeats.length >= 2) {
    return meta.preferredSeats.map((s) => ({ ...s }));
  }
  const botCount = Math.max(1, Math.min(5, meta.preferredBotCount || 1));
  return [
    { isBot: false, name: meta.preferredName || '山人' },
    ...Array.from({ length: botCount }, (): SeatConfig => ({ isBot: true, botLevel: meta.preferredDifficulty })),
  ];
}

export default function FangcunRealmsApp() {
  const autostart = useMemo(() => isAutostartMode(), []);
  const [meta, setMeta] = useState<FcMetaSave>(() => loadFcMeta());
  const [savedMatch, setSavedMatch] = useState<FcLocalMatch | null>(() => loadActiveFcRun());
  const [match, setMatch] = useState<FcLocalMatch | null>(() => {
    if (!autostart) return null;
    const existing = loadActiveFcRun();
    if (existing) return existing;
    const initialMeta = loadFcMeta();
    const created = createLocalFcMatch({
      seats: defaultSeatsFromMeta(initialMeta),
      expansions: initialMeta.preferredExpansions,
    });
    saveActiveFcRun(created);
    return created;
  });

  const [lastConfig, setLastConfig] = useState<{
    seats: SeatConfig[];
    expansions: ExpansionId[];
    defaultDifficulty: BotLevel;
  }>(() => ({
    seats: defaultSeatsFromMeta(meta),
    expansions: meta.preferredExpansions,
    defaultDifficulty: meta.preferredDifficulty,
  }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [spectatePaused, setSpectatePaused] = useState(false);
  /** Guided first game: current step, or null when the guide is off. */
  const [guideStep, setGuideStep] = useState<FcGuideStep | null>(null);
  const guideBase = useRef<{ actions: number; score: number } | null>(null);
  const guideWanted = useRef(false);
  const [guideRequest, setGuideRequest] = useState(0);

  const outcomeRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      sound.dispose();
    };
  }, []);

  // Persist active run
  useEffect(() => {
    if (!match) return;
    saveActiveFcRun(match);
    if (match.state.finished) {
      setSavedMatch(null);
    } else {
      setSavedMatch(match);
    }
  }, [match]);

  // Step bot turns cleanly
  useEffect(() => {
    if (!match || !hasPendingFcBot(match)) return;
    const isAllBots = getHumanSeats(match).length === 0;
    if (isAllBots && spectatePaused) return;
    const timer = window.setTimeout(() => {
      setMatch((current) => {
        if (!current || !hasPendingFcBot(current)) return current;
        const stepped = stepFcBot(current);
        if (stepped) {
          const lastAction = stepped.state.actions[stepped.state.actions.length - 1];
          if (lastAction?.type === 'PLACE_TILE') sound.play('snap');
          else if (lastAction?.type === 'PLACE_FIGURE') sound.play('thud');
        }
        return stepped ?? current;
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [match, spectatePaused]);

  // Guided first game (never under ?autostart=1 or in all-bot spectate mode).
  useEffect(() => {
    if (!match || autostart || !guideWanted.current || match.state.finished) return;
    const humanSeatIndices = getHumanSeats(match).map((s) => s.seatIndex);
    guideWanted.current = false;
    if (humanSeatIndices.length === 0) return;
    let initialScore = 0;
    for (const idx of humanSeatIndices) {
      const p = match.state.players[idx];
      if (p) initialScore += p.score + p.messengerScore;
    }
    guideBase.current = { actions: match.state.actions.length, score: initialScore };
    setGuideStep('tile');
  }, [match, autostart, guideRequest]);

  const finishGuide = useCallback((completed: boolean) => {
    setGuideStep(null);
    guideBase.current = null;
    setMeta(updateFcPreferences({ tutorialCompleted: true }));
    if (completed) sound.play('fanfare');
  }, []);

  useEffect(() => {
    if (!guideStep || !match || !guideBase.current) return;
    const humanSeatIndices = getHumanSeats(match).map((s) => s.seatIndex);
    if (humanSeatIndices.length === 0) return;
    const base = guideBase.current;
    const next = advanceFcGuide(guideStep, fcGuideSignals(match.state, humanSeatIndices, base.actions, base.score));
    if (next === guideStep) return;
    if (next === 'done') finishGuide(true);
    else setGuideStep(next);
  }, [guideStep, match, finishGuide]);

  const suggestedPlacement = useMemo(() => {
    if (!guideStep || !match || !match.state.pending) return null;
    const pendingSeat = match.seats[match.state.pending.player];
    if (!pendingSeat || pendingSeat.isBot) return null;
    return findScoringPlacement(match.state, getCatalog(), pendingSeat.seatIndex);
  }, [guideStep, match]);

  // Record finished match outcome once (skip all-bot spectate matches)
  useEffect(() => {
    if (!match || !match.state.finished || !match.state.final) return;
    const key = `${match.updatedAt}:${match.seq}`;
    if (outcomeRecordedRef.current === key) return;
    outcomeRecordedRef.current = key;
    sound.play('fanfare');

    const humans = getHumanSeats(match);
    if (humans.length === 0) return;

    const hasBots = match.seats.some((s) => s.isBot);
    const humanIndices = humans.map((s) => s.seatIndex);
    const bestHumanScore = Math.max(...humanIndices.map((idx) => match.state.final!.scores[idx] ?? 0));
    const won =
      humans.length === 1
        ? match.state.final.winners.includes(humanIndices[0])
        : hasBots && humanIndices.some((idx) => match.state.final!.winners.includes(idx));
    setMeta(recordFcMatchOutcome(won, bestHumanScore));
  }, [match]);

  const startNewMatch = useCallback((config: SetupStartConfig, guided = false) => {
    sound.play('toggle');
    const hasHumans = config.seats.some((s) => !s.isBot);
    guideWanted.current = hasHumans && (guided || !loadFcMeta().tutorialCompleted);
    setGuideStep(null);
    setSpectatePaused(false);

    const firstHumanName = config.seats.find((s) => !s.isBot)?.name?.trim();
    const botCount = config.seats.filter((s) => s.isBot).length;
    setMeta(
      updateFcPreferences({
        ...(firstHumanName ? { preferredName: firstHumanName } : {}),
        preferredBotCount: botCount,
        preferredDifficulty: config.defaultDifficulty,
        preferredSeats: config.seats,
        preferredExpansions: config.expansions,
      }),
    );

    setLastConfig({
      seats: config.seats,
      expansions: config.expansions,
      defaultDifficulty: config.defaultDifficulty,
    });
    setError(null);
    outcomeRecordedRef.current = null;
    const created = createLocalFcMatch({
      seats: config.seats,
      expansions: config.expansions,
    });
    setMatch(created);
  }, []);

  const resumeSavedMatch = useCallback(() => {
    if (!savedMatch) return;
    sound.play('toggle');
    setError(null);
    setSpectatePaused(false);
    const hasHumans = getHumanSeats(savedMatch).length > 0;
    guideWanted.current = hasHumans && !loadFcMeta().tutorialCompleted;
    setGuideStep(null);
    setMatch(savedMatch);
  }, [savedMatch]);

  const handleReturnToSetup = useCallback(() => {
    guideWanted.current = false;
    setGuideStep(null);
    setSpectatePaused(false);
    setMatch(null);
    setError(null);
    setSavedMatch(loadActiveFcRun());
  }, []);

  const handleHumanAction = useCallback(
    (action: Action) => {
      if (!match || busy) return;
      setBusy(true);
      setError(null);
      const res = applyHumanFcAction(match, action);
      setBusy(false);
      if (!res.ok) {
        sound.play('error');
        setError(res.error);
        return;
      }
      if (action.type === 'PLACE_TILE') sound.play('snap');
      else if (action.type === 'PLACE_FIGURE') sound.play('thud');
      else sound.play('click');
      setMatch(res.match);
    },
    [match, busy],
  );

  const projected = useMemo(() => (match ? projectFcMatch(match) : null), [match]);

  if (!match || !projected) {
    return (
      <div className="fc-app relative flex h-full w-full flex-col overflow-hidden">
        <SetupScreen
          meta={meta}
          savedMatch={savedMatch}
          onStartNew={startNewMatch}
          onResume={resumeSavedMatch}
          onOpenRules={() => setRulesOpen(true)}
          onStartGuided={(config) => startNewMatch(config, true)}
        />
        <Handbook open={rulesOpen} onClose={() => setRulesOpen(false)} />
      </div>
    );
  }

  return (
    <div className="fc-app relative flex h-full w-full flex-col overflow-hidden">
      <GameScreen
        view={projected.view}
        seats={match.seats}
        humanSeat={match.humanSeat}
        legal={projected.legal}
        log={match.state.log}
        seq={match.seq}
        error={error}
        busy={busy}
        onAction={handleHumanAction}
        onOpenTour={() => {
          guideWanted.current = true;
          setGuideStep(null);
          setGuideRequest((n) => n + 1);
        }}
        onOpenRules={() => setRulesOpen(true)}
        onRematch={() => startNewMatch(lastConfig)}
        onNewSetup={handleReturnToSetup}
        guideStep={guideStep}
        suggestedPlacement={suggestedPlacement}
        onSkipGuide={() => finishGuide(false)}
        spectatePaused={spectatePaused}
        onToggleSpectatePause={() => setSpectatePaused((p) => !p)}
      />
      <Handbook open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
