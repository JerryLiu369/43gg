import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, ExpansionId } from './engine/index.ts';
import './carc.css';
import { CoachTour } from './CoachTour.tsx';
import { GameScreen } from './GameScreen.tsx';
import { RulesModal } from './RulesModal.tsx';
import { SetupScreen } from './SetupScreen.tsx';
import type { BotLevel, CarcLocalMatch, CarcMetaSave } from './lib/types.ts';
import {
  applyHumanCarcAction,
  createLocalCarcMatch,
  hasPendingCarcBot,
  projectCarcMatch,
  stepCarcBot,
} from './session.ts';
import { sound } from './sound.ts';
import {
  isCarcTourDone,
  loadActiveCarcRun,
  loadCarcMeta,
  recordCarcMatchOutcome,
  saveActiveCarcRun,
  updateCarcPreferences,
} from './storage.ts';

function isAutostartMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  } catch {
    return false;
  }
}

export default function CarcassonneApp() {
  const autostart = useMemo(() => isAutostartMode(), []);
  const [meta, setMeta] = useState<CarcMetaSave>(() => loadCarcMeta());
  const [savedMatch, setSavedMatch] = useState<CarcLocalMatch | null>(() => loadActiveCarcRun());
  const [match, setMatch] = useState<CarcLocalMatch | null>(() => {
    if (!autostart) return null;
    const existing = loadActiveCarcRun();
    if (existing) return existing;
    const initialMeta = loadCarcMeta();
    const created = createLocalCarcMatch({
      playerName: initialMeta.preferredName,
      botLevels: Array.from({ length: initialMeta.preferredBotCount }, () => initialMeta.preferredDifficulty),
      expansions: initialMeta.preferredExpansions,
    });
    saveActiveCarcRun(created);
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
  const [tourOpen, setTourOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const outcomeRecordedRef = useRef<string | null>(null);
  const tourTriggeredRef = useRef(false);

  useEffect(() => {
    return () => {
      sound.dispose();
    };
  }, []);

  // Persist active run
  useEffect(() => {
    if (!match) return;
    saveActiveCarcRun(match);
    if (match.state.finished) {
      setSavedMatch(null);
    } else {
      setSavedMatch(match);
    }
  }, [match]);

  // Step bot turns cleanly
  useEffect(() => {
    if (!match || !hasPendingCarcBot(match)) return;
    const timer = window.setTimeout(() => {
      setMatch((current) => {
        if (!current || !hasPendingCarcBot(current)) return current;
        const stepped = stepCarcBot(current);
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

  // First-time coach tour when entering gameplay (skipped when ?autostart=1)
  useEffect(() => {
    if (autostart || !match || tourTriggeredRef.current) return;
    tourTriggeredRef.current = true;
    if (!isCarcTourDone()) {
      const timer = window.setTimeout(() => setTourOpen(true), 450);
      return () => window.clearTimeout(timer);
    }
  }, [autostart, match]);

  // Record finished match outcome once
  useEffect(() => {
    if (!match || !match.state.finished || !match.state.final) return;
    const key = `${match.updatedAt}:${match.seq}`;
    if (outcomeRecordedRef.current === key) return;
    outcomeRecordedRef.current = key;
    const won = match.state.final.winners.includes(match.humanSeat);
    const myScore = match.state.final.scores[match.humanSeat] ?? 0;
    sound.play('fanfare');
    setMeta(recordCarcMatchOutcome(won, myScore));
  }, [match]);

  const startNewMatch = useCallback(
    (config: {
      playerName: string;
      botLevels: BotLevel[];
      expansions: ExpansionId[];
      defaultDifficulty?: BotLevel;
    }) => {
      sound.play('toggle');
      if (config.defaultDifficulty) {
        setMeta(
          updateCarcPreferences({
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
      const created = createLocalCarcMatch({
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
    setMatch(savedMatch);
  }, [savedMatch]);

  const handleReturnToSetup = useCallback(() => {
    setMatch(null);
    setError(null);
    setSavedMatch(loadActiveCarcRun());
  }, []);

  const handleHumanAction = useCallback(
    (action: Action) => {
      if (!match || busy) return;
      setBusy(true);
      setError(null);
      const res = applyHumanCarcAction(match, action);
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

  const projected = useMemo(() => (match ? projectCarcMatch(match) : null), [match]);

  if (!match || !projected) {
    return (
      <div className="carc-app relative flex h-full w-full flex-col overflow-hidden">
        <SetupScreen
          meta={meta}
          savedMatch={savedMatch}
          onStartNew={startNewMatch}
          onResume={resumeSavedMatch}
          onOpenRules={() => setRulesOpen(true)}
        />
        <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      </div>
    );
  }

  return (
    <div className="carc-app relative flex h-full w-full flex-col overflow-hidden">
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
        onOpenTour={() => setTourOpen(true)}
        onOpenRules={() => setRulesOpen(true)}
        onRematch={() => startNewMatch(lastConfig)}
        onNewSetup={handleReturnToSetup}
      />
      <CoachTour open={tourOpen} onClose={() => setTourOpen(false)} />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
