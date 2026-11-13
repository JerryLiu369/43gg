import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, ExpansionId } from './engine/index.ts';
import './fangcun.css';
import { GameScreen } from './GameScreen.tsx';
import { advanceFcGuide, fcGuideSignals, findScoringPlacement, type FcGuideStep } from './guide.ts';
import { Handbook } from './Handbook.tsx';
import { getCatalog } from './lib/catalog.ts';
import { SetupScreen } from './SetupScreen.tsx';
import type { BotLevel, FcLocalMatch, FcMetaSave } from './lib/types.ts';
import {
  applyHumanFcAction,
  createLocalFcMatch,
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
      playerName: initialMeta.preferredName,
      botLevels: Array.from({ length: initialMeta.preferredBotCount }, () => initialMeta.preferredDifficulty),
      expansions: initialMeta.preferredExpansions,
    });
    saveActiveFcRun(created);
    return created;
  });

  const [lastConfig, setLastConfig] = useState<{
    playerName: string;
    botLevels: BotLevel[];
    expansions: ExpansionId[];
  }>(() => ({
    playerName: meta.preferredName,
    botLevels: Array.from({ length: meta.preferredBotCount }, () => meta.preferredDifficulty),
    expansions: meta.preferredExpansions,
  }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
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
  }, [match]);

  // Guided first game (never under ?autostart=1, which automated checks use).
  useEffect(() => {
    if (!match || autostart || !guideWanted.current || match.state.finished) return;
    guideWanted.current = false;
    const me = match.state.players[match.humanSeat];
    guideBase.current = { actions: match.state.actions.length, score: me ? me.score + me.messengerScore : 0 };
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
    const base = guideBase.current;
    const next = advanceFcGuide(guideStep, fcGuideSignals(match.state, match.humanSeat, base.actions, base.score));
    if (next === guideStep) return;
    if (next === 'done') finishGuide(true);
    else setGuideStep(next);
  }, [guideStep, match, finishGuide]);

  const suggestedPlacement = useMemo(
    () => (guideStep && match ? findScoringPlacement(match.state, getCatalog(), match.humanSeat) : null),
    [guideStep, match],
  );

  // Record finished match outcome once
  useEffect(() => {
    if (!match || !match.state.finished || !match.state.final) return;
    const key = `${match.updatedAt}:${match.seq}`;
    if (outcomeRecordedRef.current === key) return;
    outcomeRecordedRef.current = key;
    const won = match.state.final.winners.includes(match.humanSeat);
    const myScore = match.state.final.scores[match.humanSeat] ?? 0;
    sound.play('fanfare');
    setMeta(recordFcMatchOutcome(won, myScore));
  }, [match]);

  const startNewMatch = useCallback(
    (config: {
      playerName: string;
      botLevels: BotLevel[];
      expansions: ExpansionId[];
      defaultDifficulty?: BotLevel;
    }, guided = false) => {
      sound.play('toggle');
      guideWanted.current = guided || !loadFcMeta().tutorialCompleted;
      setGuideStep(null);
      if (config.defaultDifficulty) {
        setMeta(
          updateFcPreferences({
            preferredName: config.playerName,
            preferredBotCount: config.botLevels.length,
            preferredDifficulty: config.defaultDifficulty,
            preferredExpansions: config.expansions,
          }),
        );
      }
      setLastConfig({
        playerName: config.playerName,
        botLevels: config.botLevels,
        expansions: config.expansions,
      });
      setError(null);
      outcomeRecordedRef.current = null;
      const created = createLocalFcMatch({
        playerName: config.playerName,
        botLevels: config.botLevels,
        expansions: config.expansions,
      });
      setMatch(created);
    },
    [],
  );

  const resumeSavedMatch = useCallback(() => {
    if (!savedMatch) return;
    sound.play('toggle');
    setError(null);
    guideWanted.current = !loadFcMeta().tutorialCompleted;
    setGuideStep(null);
    setMatch(savedMatch);
  }, [savedMatch]);

  const handleReturnToSetup = useCallback(() => {
    guideWanted.current = false;
    setGuideStep(null);
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
      />
      <Handbook open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
