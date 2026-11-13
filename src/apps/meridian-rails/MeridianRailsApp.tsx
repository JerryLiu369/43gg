import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import './meridian.css';
import {
  computeValidActions,
  ownerByRoute,
  routePaymentOptions,
  stationPaymentOptions,
  validateRouteAvailability,
  type BotLevel,
  type CardCounts,
  type DestinationTicket,
  type RouteDefinition,
} from './engine.ts';
import {
  CITY_BY_ID,
  DEFS,
  PLAYER_COLOR_HEX,
  ROUTE_BY_ID,
  ROUTES,
  cityName,
  routeTitle,
  routeTypeLabel,
  ticketTitle,
} from './data.ts';
import { boardTargetsForLog, planTicket, routeShortfall, soundForLog } from './insights.ts';
import {
  applyHumanAction,
  createLocalMatch,
  hasPendingBotTurn,
  projectLocalMatch,
  stepLocalBot,
} from './session.ts';
import { sound } from './sound.ts';
import {
  loadActiveMerRun,
  loadMerMeta,
  recordMerMatchOutcome,
  saveActiveMerRun,
  updateMerPreferences,
} from './storage.ts';
import type { StoredLogEntry, MerLocalMatch, MerMetaSave } from './types.ts';
import { cn } from './utils.ts';
import { Board } from './Board.tsx';
import { BoardViewport } from './BoardViewport.tsx';
import { ClaimRouteDialog, FinalScoreDialog, StationDialog, TicketDialog, TunnelDialog } from './Dialogs.tsx';
import { GuideBar } from './GuideBar.tsx';
import { Handbook } from './Handbook.tsx';
import { advanceGuide, type MerGuideStep } from './guide.ts';
import { GameTopBar } from './GameTopBar.tsx';
import { HandTray, LogPanel, TicketsPanel } from './InfoPanels.tsx';
import { SetupScreen } from './SetupScreen.tsx';
import { ActionGuide, Market, type GuideContext } from './TurnPanel.tsx';

const EMPTY_SET: ReadonlySet<string> = new Set();

type MobileTab = 'market' | 'hand' | 'tickets' | 'log';

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface Splash {
  key: number;
  title: string;
  sub?: string;
  tone: 'brass' | 'red';
}

function isAutostartMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  } catch {
    return false;
  }
}

export default function MeridianRailsApp() {
  const autostart = useMemo(() => isAutostartMode(), []);
  const [meta, setMeta] = useState<MerMetaSave>(() => loadMerMeta());
  const [savedMatch, setSavedMatch] = useState<MerLocalMatch | null>(() => loadActiveMerRun());
  const [match, setMatch] = useState<MerLocalMatch | null>(() => {
    if (!autostart) return null;
    const existing = loadActiveMerRun();
    if (existing) return existing;
    const initialMeta = loadMerMeta();
    const created = createLocalMatch({
      playerName: initialMeta.preferredName,
      botLevels: Array.from({ length: initialMeta.preferredBotCount }, () => initialMeta.preferredDifficulty),
    });
    saveActiveMerRun(created);
    return created;
  });

  const [lastConfig, setLastConfig] = useState<{ playerName: string; botLevels: BotLevel[] }>(() => ({
    playerName: meta.preferredName,
    botLevels: Array.from({ length: meta.preferredBotCount }, () => meta.preferredDifficulty),
  }));

  const [acting, setActing] = useState(false);
  const [inspect, setInspect] = useState<{ route: RouteDefinition; reason: string | null } | null>(null);
  const [selectedStationCity, setSelectedStationCity] = useState<string | null>(null);
  const [stationMode, setStationMode] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [tunnelOpen, setTunnelOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  /** Guided first game: current step, or null when the guide is off. */
  const [guideStep, setGuideStep] = useState<MerGuideStep | 'done' | null>(null);
  const guideBase = useRef<{ logId: number; claims: number } | null>(null);
  const guideWanted = useRef(false);
  const [guideRequest, setGuideRequest] = useState(0);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [hoverTicket, setHoverTicket] = useState<DestinationTicket | null>(null);
  const [pinnedTicket, setPinnedTicket] = useState<DestinationTicket | null>(null);
  const [recent, setRecent] = useState<{ routes: ReadonlySet<string>; cities: ReadonlySet<string> }>({
    routes: EMPTY_SET,
    cities: EMPTY_SET,
  });
  const [ticker, setTicker] = useState<StoredLogEntry | null>(null);
  const [splash, setSplash] = useState<Splash | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileTab>('market');
  const [fitSignal, setFitSignal] = useState(0);

  const autoSeen = useRef(new Set<string>());
  const outcomeRecordedRef = useRef<string | null>(null);
  const seenLogId = useRef<number | null>(null);
  const prevTurnKey = useRef<string | null>(null);
  const prevStatus = useRef<string | null>(null);
  const prevLastRound = useRef<number | null | undefined>(undefined);
  const prevTickets = useRef<{ held: Set<string>; connected: Set<string> } | null>(null);

  const toastSeq = useRef(1);
  const toastTimers = useRef(new Set<number>());
  const extraTimers = useRef(new Set<number>());
  const flashTimer = useRef<number | null>(null);
  const tickerTimer = useRef<number | null>(null);

  const scheduleTimeout = useCallback((fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      extraTimers.current.delete(id);
      fn();
    }, ms);
    extraTimers.current.add(id);
    return id;
  }, []);

  const toast = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = toastSeq.current++;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      toastTimers.current.delete(timer);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3400);
    toastTimers.current.add(timer);
  }, []);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      sound.dispose();
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      if (tickerTimer.current !== null) window.clearTimeout(tickerTimer.current);
      for (const t of toastTimers.current) window.clearTimeout(t);
      toastTimers.current.clear();
      for (const t of extraTimers.current) window.clearTimeout(t);
      extraTimers.current.clear();
    };
  }, []);

  const projected = useMemo(() => (match ? projectLocalMatch(match) : null), [match]);
  const pub = projected?.public ?? null;
  const self = projected?.self ?? null;
  const me = useMemo(
    () => (self && pub ? pub.players.find((player) => player.id === self.playerId) ?? null : null),
    [self, pub],
  );
  const active = pub?.players.find((player) => player.id === pub.activePlayerId) ?? null;
  const isMyTurn = Boolean(self && pub && pub.status === 'IN_PROGRESS' && pub.activePlayerId === self.playerId);
  const valid = useMemo(() => new Set(self?.validActions ?? []), [self?.validActions]);

  // Ambient train clacks while match is active
  const status = pub?.status;
  useEffect(() => {
    if (status !== 'IN_PROGRESS' && status !== 'SETUP_TICKETS') return;
    return sound.requestAmbient();
  }, [status]);

  // Persist active match
  useEffect(() => {
    if (!match) return;
    saveActiveMerRun(match);
    if (match.state.status === 'GAME_OVER') {
      setSavedMatch(null);
    } else {
      setSavedMatch(match);
    }
  }, [match]);

  // Step AI opponent turns (and skip human turns if 0 legal actions exist)
  useEffect(() => {
    if (!match) return;
    const s = match.state;
    const actor = s.status === 'IN_PROGRESS' ? s.players[s.activeSeat] : null;
    const humanStuck = Boolean(
      actor && !actor.isBot && computeValidActions(s, DEFS, actor.id).length === 0,
    );
    const shouldStep = hasPendingBotTurn(match) || humanStuck;
    if (!shouldStep) return;

    const timer = window.setTimeout(() => {
      setMatch((current) => {
        if (!current) return current;
        return stepLocalBot(current) ?? current;
      });
    }, 520);
    return () => window.clearTimeout(timer);
  }, [match]);

  // Log-driven audio, highlights, and opponent ticker
  useEffect(() => {
    if (!match) return;
    const log = match.log;
    const latest = log.reduce((max, entry) => Math.max(max, entry.id), 0);
    if (seenLogId.current === null) {
      seenLogId.current = latest;
      return;
    }
    const since = seenLogId.current;
    const fresh = log.filter((entry) => entry.id > since);
    seenLogId.current = Math.max(since, latest);
    if (fresh.length === 0) return;

    const cues: NonNullable<ReturnType<typeof soundForLog>>[] = [];
    for (const entry of fresh) {
      const cue = soundForLog(entry);
      if (cue && !cues.some((item) => item.name === cue.name)) cues.push(cue);
    }
    cues.slice(-3).forEach((cue, index) => {
      scheduleTimeout(() => sound.play(cue.name, { length: cue.length }), index * 220);
    });

    const routes = new Set<string>();
    const cities = new Set<string>();
    for (const entry of fresh) {
      const target = boardTargetsForLog(entry);
      if (target.routeId) routes.add(target.routeId);
      if (target.cityId) cities.add(target.cityId);
    }
    if (routes.size > 0 || cities.size > 0) {
      setRecent({ routes, cities });
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = null;
        setRecent({ routes: EMPTY_SET, cities: EMPTY_SET });
      }, 3400);
    }

    const other = [...fresh].reverse().find((entry) => entry.playerId && entry.playerId !== match.humanPlayerId);
    if (other) {
      setTicker(other);
      if (tickerTimer.current !== null) window.clearTimeout(tickerTimer.current);
      tickerTimer.current = window.setTimeout(() => {
        tickerTimer.current = null;
        setTicker(null);
      }, 4500);
    }
  }, [match, scheduleTimeout]);

  // Splash banners
  const showSplash = useCallback((next: Omit<Splash, 'key'>) => {
    setSplash({ ...next, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => setSplash(null), 2000);
    return () => window.clearTimeout(timer);
  }, [splash]);

  // Turn, last round, game-over recording
  useEffect(() => {
    if (!pub || !self) return;
    const firstLoad = prevStatus.current === null;

    if (prevStatus.current !== pub.status) {
      const before = prevStatus.current;
      prevStatus.current = pub.status;
      if (!firstLoad && pub.status === 'IN_PROGRESS' && before === 'SETUP_TICKETS') sound.play('gameStart');
      if (pub.status === 'GAME_OVER') {
        const won = pub.winnerPlayerIds.includes(self.playerId);
        if (!firstLoad) sound.play(won ? 'victory' : 'defeat');
        const finishKey = `${match?.updatedAt ?? ''}:${pub.version}`;
        if (outcomeRecordedRef.current !== finishKey) {
          outcomeRecordedRef.current = finishKey;
          const myFinal = pub.players.find((p) => p.id === self.playerId)?.finalScore?.total ?? 0;
          setMeta(recordMerMatchOutcome(won, myFinal));
        }
      }
    }

    if (prevLastRound.current !== undefined && prevLastRound.current === null && pub.lastRoundTurnsRemaining !== null) {
      sound.play('lastRound');
      showSplash({ title: '最后一轮！', sub: '有人的车厢只剩 2 节以内，每人还能再行动一次', tone: 'red' });
    }
    prevLastRound.current = pub.lastRoundTurnsRemaining;

    const turnKey = pub.status === 'IN_PROGRESS' ? `${pub.turnNumber}:${pub.activePlayerId}` : pub.status;
    if (prevTurnKey.current !== turnKey) {
      prevTurnKey.current = turnKey;
      if (pub.status === 'IN_PROGRESS' && pub.activePlayerId === self.playerId) {
        if (!firstLoad) scheduleTimeout(() => sound.play('yourTurn'), 300);
        showSplash({
          title: '轮到你了',
          sub: pub.lastRoundTurnsRemaining !== null ? '这是你最后一次行动' : '选择一个行动',
          tone: 'brass',
        });
      }
    }
  }, [pub, self, match?.updatedAt, showSplash, scheduleTimeout]);

  // Ticket completion celebration
  const ticketPlans = useMemo(() => {
    const map = new Map<string, ReturnType<typeof planTicket>>();
    if (!self || !pub) return map;
    for (const ticket of self.tickets) {
      map.set(ticket.id, planTicket(ticket, pub.claims, self.playerId, pub.players.length));
    }
    return map;
  }, [self, pub]);

  useEffect(() => {
    if (!self) return;
    const held = new Set(self.tickets.map((ticket) => ticket.id));
    const connected = new Set([...ticketPlans].filter(([, plan]) => plan.connected).map(([id]) => id));
    const before = prevTickets.current;
    prevTickets.current = { held, connected };
    if (!before) return;
    const finished = self.tickets.filter(
      (ticket) => connected.has(ticket.id) && before.held.has(ticket.id) && !before.connected.has(ticket.id),
    );
    if (finished.length === 0) return;
    scheduleTimeout(() => sound.play('ticketComplete'), 500);
    for (const ticket of finished) {
      toast(`车票完成：${ticketTitle(ticket)}，结算时 +${ticket.points} 分`, 'success');
    }
  }, [ticketPlans, self, toast, scheduleTimeout]);

  // Forced decision dialogs
  useEffect(() => {
    if (!pub || !self) return;
    if (pub.status === 'SETUP_TICKETS' && !me?.setupConfirmed && self.pendingTicketOffer.length > 0) {
      const key = `setup:${match?.updatedAt}:${self.pendingTicketOffer.map((ticket) => ticket.id).join(',')}`;
      if (!autoSeen.current.has(key)) {
        autoSeen.current.add(key);
        setTicketsOpen(true);
      }
    }
    if (
      pub.status === 'IN_PROGRESS' &&
      pub.turnPhase === 'SELECTING_TICKETS' &&
      pub.activePlayerId === self.playerId &&
      self.pendingTicketOffer.length > 0
    ) {
      const key = `select:${pub.version}:${self.pendingTicketOffer.map((ticket) => ticket.id).join(',')}`;
      if (!autoSeen.current.has(key)) {
        autoSeen.current.add(key);
        setTicketsOpen(true);
      }
    }
    if (
      pub.status === 'IN_PROGRESS' &&
      pub.turnPhase === 'AWAITING_TUNNEL_PAYMENT' &&
      pub.tunnelChallenge &&
      pub.tunnelChallenge.actorPlayerId === self.playerId
    ) {
      const key = `tunnel:${pub.tunnelChallenge.routeId}:${pub.tunnelChallenge.surcharge}:${pub.version}`;
      if (!autoSeen.current.has(key)) {
        autoSeen.current.add(key);
        setTunnelOpen(true);
      }
    }
    if (pub.status === 'GAME_OVER') {
      const key = `over:${pub.version}`;
      if (!autoSeen.current.has(key)) {
        autoSeen.current.add(key);
        scheduleTimeout(() => setScoresOpen(true), 700);
      }
    }
  }, [pub, self, me?.setupConfirmed, match?.updatedAt, scheduleTimeout]);

  useEffect(() => {
    if (!pub || pub.status === 'GAME_OVER') {
      setStationMode(false);
      setInspect(null);
      setSelectedStationCity(null);
    }
    if (!isMyTurn) setStationMode(false);
  }, [pub, isMyTurn]);

  // Guided first game (never under ?autostart=1, which automated checks use).
  const humanClaims = pub && self ? pub.claims.filter((claim) => claim.ownerPlayerId === self.playerId).length : 0;
  useEffect(() => {
    if (!match || !pub || autostart || !guideWanted.current || pub.status !== 'IN_PROGRESS') return;
    guideWanted.current = false;
    guideBase.current = {
      logId: match.log.reduce((max, entry) => Math.max(max, entry.id), 0),
      claims: humanClaims,
    };
    setPinnedTicket(null);
    setGuideStep('ticket');
  }, [match, pub, autostart, humanClaims, guideRequest]);

  const finishGuide = useCallback((completed: boolean) => {
    setGuideStep(null);
    guideBase.current = null;
    setMeta(updateMerPreferences({ tutorialCompleted: true }));
    if (completed) {
      sound.play('ticketComplete');
      toast('引导完成。接着照这个节奏修线，把手里的车票都连起来。', 'success');
    }
  }, [toast]);

  useEffect(() => {
    if (!guideStep || guideStep === 'done' || !match || !self || !guideBase.current) return;
    const base = guideBase.current;
    const draws = match.log.filter(
      (entry) => entry.id > base.logId && entry.playerId === self.playerId && entry.actionType === 'DRAW_TRAIN_CARD',
    ).length;
    const next = advanceGuide(guideStep, {
      ticketPinned: pinnedTicket !== null,
      draws,
      claims: humanClaims - base.claims,
    });
    if (next === guideStep) return;
    if (next === 'done') finishGuide(true);
    else setGuideStep(next);
  }, [guideStep, match, self, pinnedTicket, humanClaims, finishGuide]);

  // Reset tracking refs on new match
  const resetTransientUi = useCallback(() => {
    autoSeen.current.clear();
    seenLogId.current = null;
    prevTurnKey.current = null;
    prevStatus.current = null;
    prevLastRound.current = undefined;
    prevTickets.current = null;
    outcomeRecordedRef.current = null;
    setInspect(null);
    setSelectedStationCity(null);
    setStationMode(false);
    setTicketsOpen(false);
    setTunnelOpen(false);
    setScoresOpen(false);
    setTicker(null);
    setSplash(null);
    setFitSignal((n) => n + 1);
  }, []);

  const startNewMatch = useCallback(
    (config: { playerName: string; botLevels: BotLevel[]; defaultDifficulty?: BotLevel }, guided = false) => {
      sound.unlock();
      guideWanted.current = guided || !loadMerMeta().tutorialCompleted;
      setGuideStep(null);
      sound.play('gameStart');
      if (config.defaultDifficulty) {
        setMeta(
          updateMerPreferences({
            preferredName: config.playerName,
            preferredBotCount: config.botLevels.length,
            preferredDifficulty: config.defaultDifficulty,
          }),
        );
      }
      setLastConfig({ playerName: config.playerName, botLevels: config.botLevels });
      resetTransientUi();
      const created = createLocalMatch({ playerName: config.playerName, botLevels: config.botLevels });
      setMatch(created);
    },
    [resetTransientUi],
  );

  const resumeSavedMatch = useCallback(() => {
    if (!savedMatch) return;
    sound.unlock();
    sound.play('select');
    resetTransientUi();
    guideWanted.current = !loadMerMeta().tutorialCompleted;
    setGuideStep(null);
    setMatch(savedMatch);
  }, [savedMatch, resetTransientUi]);

  const handleReturnToSetup = useCallback(() => {
    setGuideStep(null);
    guideWanted.current = false;
    setMatch(null);
    resetTransientUi();
    setSavedMatch(loadActiveMerRun());
  }, [resetTransientUi]);

  // Human actions
  const perform = useCallback(
    (actionType: Parameters<typeof applyHumanAction>[1], actionPayload: unknown): MerLocalMatch | null => {
      if (!match || acting) return null;
      sound.unlock();
      setActing(true);
      const res = applyHumanAction(match, actionType, actionPayload);
      setActing(false);
      if (!res.ok) {
        sound.play('error');
        toast(res.error, 'error');
        return null;
      }
      setMatch(res.match);
      return res.match;
    },
    [match, acting, toast],
  );

  const drawCard = useCallback(
    (source: 'FACE_UP' | 'DECK', slotIndex?: number) => {
      perform('DRAW_TRAIN_CARD', slotIndex === undefined ? { source } : { source, slotIndex });
    },
    [perform],
  );

  const drawTickets = useCallback(() => {
    perform('DRAW_TICKETS', {});
  }, [perform]);

  const claimRoute = (payment: CardCounts) => {
    if (!inspect) return;
    const route = inspect.route;
    const next = perform('CLAIM_ROUTE', { routeId: route.id, payment });
    if (!next) return;
    setInspect(null);
    if (next.state.turnPhase !== 'AWAITING_TUNNEL_PAYMENT') {
      toast(`占领了 ${routeTitle(route)}，+${route.points} 分`, 'success');
    }
  };

  const buildStation = (payment: CardCounts) => {
    if (!selectedStationCity) return;
    const cityId = selectedStationCity;
    const next = perform('BUILD_STATION', { cityId, payment });
    if (next) {
      setSelectedStationCity(null);
      setStationMode(false);
      toast(`在${cityName(cityId)}建好了车站`, 'success');
    }
  };

  const confirmTickets = (keptTicketIds: string[]) => {
    if (!pub) return;
    const actionType = pub.status === 'SETUP_TICKETS' ? 'CHOOSE_INITIAL_TICKETS' : 'CHOOSE_TICKETS';
    if (perform(actionType, { keptTicketIds })) setTicketsOpen(false);
  };

  const confirmTunnel = (extraPayment: CardCounts) => {
    if (perform('CONFIRM_TUNNEL', { extraPayment })) setTunnelOpen(false);
  };

  const cancelTunnel = () => {
    if (perform('CANCEL_TUNNEL', {})) setTunnelOpen(false);
  };

  // Board sets
  const routeSets = useMemo(() => {
    const dimmed = new Set<string>();
    const selectable = new Set<string>();
    const cities = new Set<string>();
    if (!pub || !self || !me || pub.status !== 'IN_PROGRESS') return { dimmed, selectable, cities };
    const owners = ownerByRoute(pub.claims);
    const myStandby = isMyTurn && pub.turnPhase === 'STANDBY';
    for (const route of ROUTES) {
      if (owners.has(route.id)) continue;
      if (validateRouteAvailability(route, self.playerId, pub.players.length, owners)) {
        dimmed.add(route.id);
        continue;
      }
      if (myStandby && routePaymentOptions(route, self.trainCards, me.trainCarsRemaining).length > 0) {
        selectable.add(route.id);
      }
    }
    if (myStandby && valid.has('BUILD_STATION') && stationPaymentOptions(me.stationsRemaining, self.trainCards).length > 0) {
      const occupied = new Set(pub.stations.map((station) => station.cityId));
      for (const city of CITY_BY_ID.keys()) if (!occupied.has(city)) cities.add(city);
    }
    return { dimmed, selectable, cities };
  }, [pub, self, me, isMyTurn, valid]);

  const focusTicket = hoverTicket ?? pinnedTicket;
  const focusPlan = focusTicket ? ticketPlans.get(focusTicket.id) ?? null : null;
  const pathRouteIds = useMemo(() => new Set(focusPlan?.routeIds ?? []), [focusPlan]);
  const endpointCityIds = useMemo(
    () => (focusTicket ? new Set([focusTicket.from, focusTicket.to]) : EMPTY_SET),
    [focusTicket],
  );
  const onFocusTicket = useCallback((ticket: DestinationTicket | null, pinned?: boolean) => {
    if (pinned) setPinnedTicket(ticket);
    else setHoverTicket(ticket);
  }, []);

  const hoveredRoute = hoveredRouteId ? ROUTE_BY_ID.get(hoveredRouteId) ?? null : null;
  const hoveredOwner = useMemo(() => {
    if (!hoveredRoute || !pub) return null;
    const claim = pub.claims.find((item) => item.routeId === hoveredRoute.id);
    return claim ? pub.players.find((player) => player.id === claim.ownerPlayerId) ?? null : null;
  }, [hoveredRoute, pub]);

  const onRouteClick = useCallback(
    (routeId: string) => {
      const route = ROUTE_BY_ID.get(routeId);
      if (!route || !pub || !self) return;
      sound.unlock();
      if (stationMode) {
        toast('正在建车站：请点击发光的城市，或点“取消建站”。', 'info');
        return;
      }
      const owners = ownerByRoute(pub.claims);
      const ownerId = owners.get(routeId);
      if (ownerId) {
        const owner = pub.players.find((player) => player.id === ownerId);
        toast(
          `${routeTitle(route)} 已经是${ownerId === self.playerId ? '你' : ` ${owner?.displayName ?? '其他玩家'} `}的路线了。`,
          'info',
        );
        return;
      }
      let reason: string | null = null;
      const blocked = validateRouteAvailability(route, self.playerId, pub.players.length, owners);
      if (blocked === 'DOUBLE_ROUTE_CLOSED') reason = '2–3 人对局里，双线只能用其中一条，另一条已经被占了。';
      else if (blocked === 'DOUBLE_ROUTE_SAME_PLAYER') reason = '双线的另一条已经是你的了，同一个人不能两条都占。';
      else if (pub.status !== 'IN_PROGRESS') reason = '对局开始后才能占领路线。';
      else if (!isMyTurn) reason = `现在是 ${active?.displayName ?? '对手'} 的回合，轮到你时才能占领。`;
      else if (pub.turnPhase === 'DRAWING_SECOND_CARD') reason = '你这回合已经摸了 1 张牌，只能再摸 1 张，不能占领路线。';
      else if (pub.turnPhase !== 'STANDBY') reason = '先完成当前的行动。';
      sound.play('select');
      setInspect({ route, reason });
    },
    [pub, self, stationMode, isMyTurn, active, toast],
  );

  const onCityClick = useCallback(
    (cityId: string) => {
      if (!pub) return;
      sound.unlock();
      const city = CITY_BY_ID.get(cityId);
      const station = pub.stations.find((item) => item.cityId === cityId);
      const stationOwner = station ? pub.players.find((player) => player.id === station.ownerPlayerId) : null;
      if (stationMode && isMyTurn) {
        if (stationOwner) {
          sound.play('error');
          toast(`${cityName(cityId)}已经有 ${stationOwner.displayName} 的车站了，每座城市只能有一座。`, 'error');
          return;
        }
        if (!routeSets.cities.has(cityId)) {
          sound.play('error');
          toast('手牌不够建车站。', 'error');
          return;
        }
        sound.play('select');
        setSelectedStationCity(cityId);
        return;
      }
      const adjacent = ROUTES.filter((route) => route.city1 === cityId || route.city2 === cityId).length;
      toast(
        `${city?.nameZh ?? cityId}（${city?.name ?? cityId}）：连着 ${adjacent} 条路线${stationOwner ? `，有 ${stationOwner.displayName} 的车站` : ''}`,
        'info',
      );
    },
    [pub, stationMode, isMyTurn, routeSets.cities, toast],
  );

  const toggleStation = useCallback(() => {
    sound.unlock();
    if (stationMode) {
      setStationMode(false);
      return;
    }
    if (!isMyTurn || !valid.has('BUILD_STATION') || routeSets.cities.size === 0) {
      sound.play('error');
      toast('现在建不了车站：需要足够的同色牌，而且还有没建的车站。', 'error');
      return;
    }
    sound.play('select');
    setStationMode(true);
  }, [stationMode, isMyTurn, valid, routeSets.cities.size, toast]);

  const runGuideDemo = () => {
    if (!pub || !self || !me || !guideStep || guideStep === 'done') return;
    sound.unlock();
    if (guideStep === 'ticket') {
      const best = [...self.tickets].sort(
        (a, b) => (ticketPlans.get(a.id)?.trainsNeeded ?? 99) - (ticketPlans.get(b.id)?.trainsNeeded ?? 99),
      )[0];
      if (best) {
        setMobileTab('tickets');
        setPinnedTicket(best);
      }
      return;
    }
    if (guideStep === 'draw') {
      if (isMyTurn && valid.has('DRAW_TRAIN_CARD')) {
        setMobileTab('market');
        drawCard('DECK');
      } else {
        toast('等轮到你再摸牌：先看看对手在修哪条线。', 'info');
      }
      return;
    }
    // claim: prefer an affordable route on the pinned ticket's path, then any affordable one,
    // else open the next route on that path so the dialog shows which cards are still missing.
    const pathIds = pinnedTicket ? ticketPlans.get(pinnedTicket.id)?.routeIds ?? [] : [];
    const owners = ownerByRoute(pub.claims);
    const affordable = [...routeSets.selectable];
    const pick =
      pathIds.find((id) => routeSets.selectable.has(id)) ??
      affordable.sort((a, b) => (ROUTE_BY_ID.get(b)?.points ?? 0) - (ROUTE_BY_ID.get(a)?.points ?? 0))[0] ??
      pathIds.find((id) => !owners.has(id));
    if (pick) onRouteClick(pick);
    else toast('手牌还不够占线，先继续摸牌。', 'info');
  };

  if (!match || !pub || !self) {
    return (
      <div className="mer-app relative flex h-full w-full flex-col overflow-hidden">
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

  const minKeep = pub.status === 'SETUP_TICKETS' ? 2 : 1;
  const ctx: GuideContext = {
    pub,
    self,
    me,
    isMyTurn,
    acting,
    stationMode,
    affordableCount: routeSets.selectable.size,
  };
  const pendingTickets = self.pendingTicketOffer.length;
  const hoverShortfall =
    hoveredRoute && isMyTurn && pub.turnPhase === 'STANDBY' && !hoveredOwner && me && !routeSets.dimmed.has(hoveredRoute.id)
      ? routeShortfall(hoveredRoute, self.trainCards, me.trainCarsRemaining)
      : null;
  const tickerPlayer = ticker?.playerId ? pub.players.find((player) => player.id === ticker.playerId) : null;

  const tabs: { key: MobileTab; label: string; badge?: number }[] = [
    { key: 'market', label: '摸牌' },
    { key: 'hand', label: '手牌' },
    { key: 'tickets', label: '车票', badge: pendingTickets || undefined },
    { key: 'log', label: '记录' },
  ];

  return (
    <div className="mer-app relative flex h-full w-full flex-col overflow-hidden">
      <GameTopBar
        pub={pub}
        selfPlayerId={self.playerId}
        onNewSetup={handleReturnToSetup}
        onHelp={() => {
          sound.unlock();
          guideWanted.current = true;
          setGuideStep(null);
          setGuideRequest((n) => n + 1);
        }}
        onRules={() => setRulesOpen(true)}
      />

      {guideStep && guideStep !== 'done' && pub.status === 'IN_PROGRESS' && (
        <GuideBar step={guideStep} onDemo={runGuideDemo} onSkip={() => finishGuide(false)} />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-col lg:flex-1">
          <section
            data-coach="board"
            className="relative h-[42dvh] shrink-0 p-1.5 sm:p-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:p-3 lg:pb-2"
          >
            <BoardViewport className="h-full" fitSignal={fitSignal}>
              <Board
                pub={pub}
                interactive={isMyTurn}
                selectableRouteIds={routeSets.selectable}
                dimmedRouteIds={routeSets.dimmed}
                selectableCityIds={routeSets.cities}
                selectedRouteId={inspect?.route.id ?? null}
                stationMode={stationMode}
                pathRouteIds={pathRouteIds}
                endpointCityIds={endpointCityIds}
                recentRouteIds={recent.routes}
                recentCityIds={recent.cities}
                showAffordable={isMyTurn && pub.turnPhase === 'STANDBY' && !stationMode && !focusTicket}
                onRouteClick={onRouteClick}
                onCityClick={onCityClick}
                onRouteHover={setHoveredRouteId}
              />
            </BoardViewport>

            {ticker && (
              <div
                key={ticker.id}
                className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(74%,420px)] items-center gap-2 rounded-full border border-white/10 bg-(--mer-ink-950)/90 py-1.5 pl-1.5 pr-3.5 text-xs text-(--mer-paper-100) shadow-xl backdrop-blur animate-rise lg:left-5 lg:top-5"
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                  style={{ background: tickerPlayer ? PLAYER_COLOR_HEX[tickerPlayer.color] : '#666' }}
                >
                  {tickerPlayer?.isBot ? <Bot className="size-3.5" /> : tickerPlayer?.displayName.slice(0, 1)}
                </span>
                <span className="truncate">{ticker.summary}</span>
              </div>
            )}

            {splash && (
              <div key={splash.key} className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
                <div
                  className={cn(
                    'rounded-2xl border px-7 py-4 text-center shadow-2xl backdrop-blur-md animate-turn-sweep',
                    splash.tone === 'red' ? 'border-red-400/40 bg-red-950/85' : 'border-(--mer-brass-300)/50 bg-(--mer-ink-950)/85',
                  )}
                >
                  <p className={cn('mer-display text-2xl sm:text-4xl', splash.tone === 'red' ? 'text-red-100' : 'text-(--mer-brass-200)')}>
                    {splash.title}
                  </p>
                  {splash.sub && <p className="mt-1 text-xs sm:text-sm text-(--mer-paper-300)">{splash.sub}</p>}
                </div>
              </div>
            )}

            {stationMode && (
              <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-950/95 py-1 pl-4 pr-1 text-xs font-semibold text-emerald-50 shadow-xl animate-banner-in">
                点击发光的城市建车站
                <button
                  type="button"
                  onClick={() => setStationMode(false)}
                  className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20 cursor-pointer"
                >
                  <X className="size-3" /> 取消
                </button>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden max-w-[300px] rounded-xl border border-white/10 bg-(--mer-ink-950)/90 px-3 py-2 text-[11px] text-(--mer-paper-300) shadow-xl backdrop-blur sm:block lg:bottom-4 lg:left-5">
              {hoveredRoute ? (
                <div>
                  <p className="font-bold text-(--mer-paper-50)">{routeTitle(hoveredRoute)}</p>
                  <p className="mt-0.5 text-(--mer-paper-400)">
                    {hoveredRoute.length} 节车厢 · {hoveredRoute.points} 分 · {routeTypeLabel(hoveredRoute)}
                  </p>
                  {hoveredOwner && (
                    <p className="mt-1 flex items-center gap-1.5 text-(--mer-paper-200)">
                      <span className="size-2 rounded-full" style={{ background: PLAYER_COLOR_HEX[hoveredOwner.color] }} />
                      {hoveredOwner.id === self.playerId ? '你的路线' : `${hoveredOwner.displayName} 的路线`}
                    </p>
                  )}
                  {hoverShortfall && (
                    <p className={cn('mt-1', hoverShortfall.affordable ? 'text-emerald-300' : 'text-amber-200')}>
                      {hoverShortfall.affordable ? '点击即可占领' : hoverShortfall.message}
                    </p>
                  )}
                </div>
              ) : focusTicket && focusPlan ? (
                <div>
                  <p className="font-bold text-sky-200">{ticketTitle(focusTicket)}</p>
                  <p className="mt-0.5 text-(--mer-paper-400)">
                    {focusPlan.connected
                      ? '已经连通了'
                      : focusPlan.reachable
                        ? `蓝色高亮是最省车厢的路线，还要 ${focusPlan.trainsNeeded} 节车厢`
                        : '所有路线都被堵住了，可以考虑建车站'}
                  </p>
                </div>
              ) : (
                <p>拖动地图平移，滚轮缩放；点击路线查看详情</p>
              )}
            </div>
          </section>

          <div className="hidden shrink-0 px-3 pb-3 lg:block">
            <HandTray self={self} me={me} />
          </div>
        </div>

        <aside className="flex min-h-0 flex-1 flex-col border-white/[0.06] bg-(--mer-ink-950)/35 lg:flex-none lg:w-[400px] lg:shrink-0 lg:border-l">
          <div className="shrink-0 p-2 pb-0 lg:p-3 lg:pb-0">
            <ActionGuide
              ctx={ctx}
              onOpenTickets={() => setTicketsOpen(true)}
              onOpenTunnel={() => setTunnelOpen(true)}
              onShowScores={() => setScoresOpen(true)}
              onRematch={() => startNewMatch(lastConfig)}
            />
          </div>

          <div className="mt-2 flex shrink-0 gap-1 border-y border-white/[0.06] bg-(--mer-ink-950)/50 px-2 py-1 lg:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMobileTab(tab.key)}
                className={cn(
                  'relative flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition cursor-pointer',
                  mobileTab === tab.key ? 'bg-(--mer-brass-400)/15 text-(--mer-brass-200)' : 'text-(--mer-paper-400) hover:bg-white/[0.04]',
                )}
              >
                {tab.label}
                {tab.badge ? (
                  <span className="absolute right-1.5 top-1 grid size-4 place-items-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5 lg:p-3">
            <div className={cn(mobileTab !== 'market' && 'hidden lg:block')}>
              <Market ctx={ctx} onDrawCard={drawCard} onDrawTickets={drawTickets} onToggleStation={toggleStation} />
            </div>
            <div className={cn('lg:hidden', mobileTab !== 'hand' && 'hidden')}>
              <HandTray self={self} me={me} />
            </div>
            <div className={cn(mobileTab !== 'tickets' && 'hidden lg:block')}>
              <TicketsPanel
                self={self}
                pub={pub}
                focusedTicketId={pinnedTicket?.id ?? null}
                onFocusTicket={onFocusTicket}
                onOpenTickets={() => setTicketsOpen(true)}
              />
            </div>
            <div className={cn(mobileTab !== 'log' && 'hidden lg:block')}>
              <LogPanel log={match.log} pub={pub} />
            </div>
          </div>
        </aside>
      </div>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-3 top-[112px] z-[95] flex flex-col items-center gap-2 lg:inset-x-auto lg:top-auto lg:bottom-4 lg:right-4 lg:max-w-xs lg:items-stretch">
          {toasts.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-2xl backdrop-blur animate-rise',
                item.tone === 'success' && 'border-emerald-400/40 bg-emerald-950/90 text-emerald-100',
                item.tone === 'error' && 'border-red-400/40 bg-red-950/90 text-red-100',
                item.tone === 'info' && 'border-white/15 bg-(--mer-ink-950)/95 text-(--mer-paper-100)',
              )}
            >
              {item.message}
            </div>
          ))}
        </div>
      )}

      <ClaimRouteDialog
        route={inspect?.route ?? null}
        blockedReason={inspect?.reason ?? null}
        self={self}
        me={me}
        acting={acting}
        onClose={() => setInspect(null)}
        onConfirm={claimRoute}
      />
      <StationDialog
        cityId={selectedStationCity}
        self={self}
        me={me}
        pub={pub}
        acting={acting}
        onClose={() => setSelectedStationCity(null)}
        onConfirm={buildStation}
      />
      <TicketDialog
        open={ticketsOpen}
        offer={self.pendingTicketOffer}
        current={self.tickets}
        minKeep={minKeep}
        initial={pub.status === 'SETUP_TICKETS'}
        acting={acting}
        noteFor={(ticket) => {
          const plan = planTicket(ticket, pub.claims, self.playerId, pub.players.length);
          if (plan.connected) return '你已经连通了这两座城市';
          if (!plan.reachable) return '路已被对手堵住，只能靠车站';
          return `最少需要约 ${plan.trainsNeeded} 节车厢`;
        }}
        onClose={() => setTicketsOpen(false)}
        onConfirm={confirmTickets}
      />
      <TunnelDialog
        challenge={pub.tunnelChallenge}
        self={self}
        acting={acting}
        open={tunnelOpen}
        onClose={() => setTunnelOpen(false)}
        onConfirm={confirmTunnel}
        onCancel={cancelTunnel}
      />
      <FinalScoreDialog
        open={scoresOpen}
        onClose={() => setScoresOpen(false)}
        pub={pub}
        selfPlayerId={self.playerId}
        onRematch={() => startNewMatch(lastConfig)}
        onNewSetup={handleReturnToSetup}
      />
      <Handbook open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
