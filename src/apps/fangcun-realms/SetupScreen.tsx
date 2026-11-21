import { useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  GraduationCap,
  Minus,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';
import { COLOR_HEX, COLOR_NAMES, EXPANSION_INFO, MODULE_GROUPS } from './lib/labels.ts';
import {
  BOT_LEVELS,
  BOT_LEVEL_LABELS,
  PLAYER_COLORS,
  type BotLevel,
  type FcLocalMatch,
  type FcMetaSave,
  type SeatConfig,
} from './lib/types.ts';
import {
  MAX_FC_PLAYERS,
  adjustBotCount,
  adjustHumanCount,
  defaultHumanName,
  formatSeatSummary,
  summarizeSeatCounts,
  toggleSeatType,
} from './session.ts';
import { SoundControl } from './SoundControl.tsx';

const EXPANSION_IDS = ALL_EXPANSIONS.filter((e): e is Exclude<ExpansionId, 'BASE'> => e !== 'BASE');

const DIFFICULTY_HINTS: Record<BotLevel, string> = {
  EASY: '电脑想得浅、常留空档，适合第一次熟悉规则',
  NORMAL: '电脑会抢城池、封驿道，也懂得及时把随从收回来',
  HARD: '电脑会往前多算几步，擅长挤进你的地盘和卡位封堵',
};

export interface SetupStartConfig {
  seats: SeatConfig[];
  expansions: ExpansionId[];
  defaultDifficulty: BotLevel;
}

function initialSeatsFromMeta(meta: FcMetaSave, firstGame: boolean): SeatConfig[] {
  if (meta.preferredSeats && meta.preferredSeats.length >= 2 && meta.preferredSeats.length <= MAX_FC_PLAYERS) {
    return meta.preferredSeats.map((s) => ({ ...s }));
  }
  if (firstGame) {
    return [
      { isBot: false, name: meta.preferredName || '山人' },
      { isBot: true, botLevel: meta.preferredDifficulty },
    ];
  }
  const bots = Math.min(5, Math.max(1, meta.preferredBotCount || 1));
  return [
    { isBot: false, name: meta.preferredName || '山人' },
    ...Array.from({ length: bots }, (): SeatConfig => ({ isBot: true, botLevel: meta.preferredDifficulty })),
  ];
}

function hasMixedBotLevels(seats: readonly SeatConfig[]): boolean {
  const levels = new Set(seats.filter((s) => s.isBot).map((s) => s.botLevel ?? 'NORMAL'));
  return levels.size > 1;
}

export function SetupScreen({
  meta,
  savedMatch,
  onStartNew,
  onResume,
  onOpenRules,
  onStartGuided,
}: {
  meta: FcMetaSave;
  savedMatch: FcLocalMatch | null;
  onStartNew: (config: SetupStartConfig) => void;
  onResume: () => void;
  onOpenRules: () => void;
  /** Starts a match with the step-by-step guide switched on. */
  onStartGuided: (config: SetupStartConfig) => void;
}) {
  const firstGame = !meta.tutorialCompleted && meta.gamesPlayed === 0 && !meta.preferredSeats;
  const [seats, setSeats] = useState<SeatConfig[]>(() => initialSeatsFromMeta(meta, firstGame));
  const [difficulty, setDifficulty] = useState<BotLevel>(meta.preferredDifficulty);
  const [customBots, setCustomBots] = useState<boolean>(() => hasMixedBotLevels(initialSeatsFromMeta(meta, firstGame)));
  const [expansions, setExpansions] = useState<ExpansionId[]>(() =>
    firstGame ? ['STREAM'] : meta.preferredExpansions,
  );

  const counts = useMemo(() => summarizeSeatCounts(seats), [seats]);

  const handleGlobalDifficulty = (level: BotLevel) => {
    setDifficulty(level);
    if (!customBots) {
      setSeats((prev) => prev.map((s) => (s.isBot ? { ...s, botLevel: level } : s)));
    }
  };

  const handleToggleCustomBots = () => {
    setCustomBots((prev) => {
      const next = !prev;
      if (!next) {
        setSeats((list) => list.map((s) => (s.isBot ? { ...s, botLevel: difficulty } : s)));
      }
      return next;
    });
  };

  const handleHumanDelta = (delta: 1 | -1) => {
    setSeats((prev) => adjustHumanCount(prev, delta, difficulty));
  };

  const handleBotDelta = (delta: 1 | -1) => {
    setSeats((prev) => adjustBotCount(prev, delta, difficulty));
  };

  const handleToggleSeat = (index: number) => {
    setSeats((prev) => toggleSeatType(prev, index, difficulty));
  };

  const handleSeatName = (index: number, value: string) => {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, name: value } : s)));
  };

  const handleSeatBotLevel = (index: number, level: BotLevel) => {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, botLevel: level } : s)));
  };

  const toggleExpansion = (id: ExpansionId) => {
    setExpansions((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const buildStartConfig = (): SetupStartConfig => ({
    seats: seats.map((s) =>
      s.isBot
        ? { isBot: true, botLevel: customBots ? (s.botLevel ?? difficulty) : difficulty }
        : { isBot: false, name: s.name?.trim() || '' },
    ),
    expansions,
    defaultDifficulty: difficulty,
  });

  const startButtonLabel =
    counts.humans === 0
      ? `开始电脑观战（${counts.bots} 电脑）`
      : counts.bots === 0
        ? `开始 ${counts.humans} 人同屏对局`
        : counts.humans === 1
          ? `开始对局（1 真人 + ${counts.bots} 电脑）`
          : `开始同屏对局（${counts.humans} 真人 + ${counts.bots} 电脑）`;

  let humanOrder = 0;
  let botOrder = 0;

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="fc-display text-3xl font-bold text-white sm:text-4xl">方寸山河</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              一块块方地拼出城池、驿道、寺院与田野，派随从抢占地盘。支持同屏 2 至 6 位玩家，自由搭配真人与电脑同台对局。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="fc-btn secondary"
              disabled={counts.humans === 0}
              title={counts.humans === 0 ? '至少需要 1 位真人玩家才能开启操作引导' : undefined}
              onClick={() => onStartGuided(buildStartConfig())}
            >
              <GraduationCap className="size-4" /> 带引导开一局
            </button>
            <button type="button" className="fc-btn secondary" onClick={onOpenRules}>
              <BookOpen className="size-4" /> 图文手册
            </button>
            <SoundControl />
          </div>
        </div>

        {savedMatch && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-400/15 to-transparent p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">检测到未完成的对局</p>
              <p className="mt-0.5 text-xs text-slate-300">
                第 {savedMatch.state.turn.number} 回合 · {formatSeatSummary(savedMatch.seats)} · 牌堆剩余{' '}
                {savedMatch.state.drawPile.length + savedMatch.state.riverPile.length} 张
              </p>
            </div>
            <button type="button" className="fc-btn primary" onClick={onResume}>
              <RotateCcw className="size-4" /> 继续上一局
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="fc-panel space-y-5 p-5 sm:p-6">
            <h2 className="fc-display text-lg font-bold text-white">对局配置</h2>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Users className="size-3.5 text-amber-300" /> 参战人数（2–6 位）
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  共 {counts.total} 位 · {formatSeatSummary(seats)}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="size-3.5 shrink-0 text-amber-300" />
                    <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">真人玩家</span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 sm:justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => handleHumanDelta(-1)}
                      disabled={counts.humans <= 0}
                      aria-label="减少真人玩家"
                      className="fc-btn p-1.5"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span
                      data-testid="human-count"
                      className="w-6 text-center text-sm font-bold text-white tabular-nums"
                    >
                      {counts.humans}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleHumanDelta(1)}
                      disabled={counts.humans >= MAX_FC_PLAYERS}
                      aria-label="增加真人玩家"
                      className="fc-btn p-1.5"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Bot className="size-3.5 shrink-0 text-amber-300" />
                    <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">电脑玩家</span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 sm:justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => handleBotDelta(-1)}
                      disabled={counts.bots <= 0}
                      aria-label="减少电脑玩家"
                      className="fc-btn p-1.5"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span
                      data-testid="bot-count"
                      className="w-6 text-center text-sm font-bold text-white tabular-nums"
                    >
                      {counts.bots}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBotDelta(1)}
                      disabled={counts.bots >= MAX_FC_PLAYERS}
                      aria-label="增加电脑玩家"
                      className="fc-btn p-1.5"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2" aria-label="席位列表">
                {seats.map((seat, idx) => {
                  const color = PLAYER_COLORS[idx];
                  const isBot = seat.isBot;
                  const hIdx = isBot ? -1 : humanOrder++;
                  const bIdx = isBot ? botOrder++ : -1;
                  const level = customBots ? (seat.botLevel ?? difficulty) : difficulty;
                  const placeholder = isBot ? '' : defaultHumanName(hIdx, counts.humans);

                  return (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <span
                        className="fc-swatch"
                        style={{ background: COLOR_HEX[color] }}
                        title={`${COLOR_NAMES[color]}方`}
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleSeat(idx)}
                        aria-label={`第 ${idx + 1} 席当前为${isBot ? '电脑' : '真人'}，点击切换`}
                        title="点击切换真人或电脑"
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition cursor-pointer focus-visible:border-amber-300 focus-visible:outline-none ${
                          isBot
                            ? 'border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30'
                            : 'border-amber-300/60 bg-amber-400/15 text-amber-100 hover:border-amber-300'
                        }`}
                      >
                        {isBot ? <Bot className="size-3" /> : <User className="size-3" />}
                        <span>{isBot ? '电脑' : '真人'}</span>
                      </button>

                      {!isBot ? (
                        <input
                          type="text"
                          maxLength={16}
                          value={seat.name ?? ''}
                          onChange={(e) => handleSeatName(idx, e.target.value)}
                          placeholder={placeholder}
                          aria-label={`第 ${idx + 1} 席玩家名字`}
                          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      ) : (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-200">
                            电脑 {bIdx + 1}
                            {!customBots && (
                              <span className="ml-1.5 text-[11px] text-slate-400">
                                （{BOT_LEVEL_LABELS[level]}）
                              </span>
                            )}
                          </span>
                          {customBots && (
                            <div className="flex gap-1">
                              {BOT_LEVELS.map((lv) => (
                                <button
                                  key={lv}
                                  type="button"
                                  onClick={() => handleSeatBotLevel(idx, lv)}
                                  aria-pressed={level === lv}
                                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer focus-visible:border-amber-300 focus-visible:outline-none ${
                                    level === lv
                                      ? 'border-amber-300/70 bg-amber-400/20 text-amber-100'
                                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {BOT_LEVEL_LABELS[lv]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {firstGame && counts.humans === 1 && counts.bots === 1 && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  第一局默认 1 真人 + 1 电脑、只开溪流开局；随时可增减人数改成多人同屏或人机混战。
                </p>
              )}
            </div>

            {counts.bots > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Bot className="size-3.5 text-amber-300" /> 电脑难度
                  </span>
                  {counts.bots >= 2 && (
                    <button
                      type="button"
                      onClick={handleToggleCustomBots}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      <SlidersHorizontal className="size-3" />
                      {customBots ? '改为统一难度' : '分别设置每个电脑'}
                    </button>
                  )}
                </div>

                {!customBots ? (
                  <>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {BOT_LEVELS.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleGlobalDifficulty(level)}
                          aria-pressed={difficulty === level}
                          className={`rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer focus-visible:border-amber-300 focus-visible:outline-none ${
                            difficulty === level
                              ? 'border-amber-300/70 bg-amber-400/20 text-amber-100'
                              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {BOT_LEVEL_LABELS[level]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">{DIFFICULTY_HINTS[difficulty]}</p>
                  </>
                ) : (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    可在上方席位列表中为每位电脑单独选择「轻松 / 标准 / 宗师」。
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  规则模块（已选 {expansions.length} / {EXPANSION_IDS.length}）
                </span>
                <div className="flex gap-1.5 text-[11px]">
                  <button type="button" onClick={() => setExpansions([])} className="fc-btn px-2 py-0.5 text-[11px]">
                    只玩基础
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpansions(['STREAM', 'HERMIT'])}
                    className="fc-btn px-2 py-0.5 text-[11px]"
                  >
                    入门搭配
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpansions([...EXPANSION_IDS])}
                    className="fc-btn px-2 py-0.5 text-[11px]"
                  >
                    全部开启
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-2.5">
                {MODULE_GROUPS.map((group) => (
                  <fieldset key={group.label}>
                    <legend className="text-[11px] font-semibold text-slate-400">{group.label}</legend>
                    <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {group.modules.map((id) => {
                        const active = expansions.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleExpansion(id)}
                            aria-pressed={active}
                            title={EXPANSION_INFO[id].hint}
                            className={`rounded-xl border px-2.5 py-2 text-left transition cursor-pointer focus-visible:border-amber-300 focus-visible:outline-none ${
                              active
                                ? 'border-amber-300/70 bg-amber-400/15 text-amber-100'
                                : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/25 hover:text-slate-200'
                            }`}
                          >
                            <span className="block truncate text-xs font-semibold">{EXPANSION_INFO[id].name}</span>
                            <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 opacity-80">
                              {EXPANSION_INFO[id].hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="fc-btn primary w-full py-3 text-sm font-bold"
              onClick={() => onStartNew(buildStartConfig())}
            >
              <Play className="size-4" /> {startButtonLabel}
            </button>
          </section>

          <aside className="space-y-4">
            <section className="fc-panel p-5">
              <h2 className="flex items-center gap-2 fc-display text-base font-bold text-white">
                <Trophy className="size-4 text-amber-300" /> 你的战绩
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">已完赛</p>
                  <p className="mt-1 fc-display text-xl text-white tabular-nums">{meta.gamesPlayed}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">胜场</p>
                  <p className="mt-1 fc-display text-xl text-emerald-300 tabular-nums">{meta.victories}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">最高分</p>
                  <p className="mt-1 fc-display text-xl text-amber-200 tabular-nums">{meta.bestScore}</p>
                </div>
              </div>
            </section>

            <section className="fc-panel p-5">
              <h2 className="fc-display text-base font-bold text-white">怎么操作</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                <li>拖动版图平移，滚轮或双指缩放。</li>
                <li>点虚线方格预览摆法，再点同一格或用旋转键换朝向，四边接上后确认放置。</li>
                <li>手机上点圆点只是预选，再点一次或按确认才派出随从。</li>
                <li>同屏多人时所有信息公开，轮到谁行动会用对应阵营色点高亮提示，轮流操作即可。</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
