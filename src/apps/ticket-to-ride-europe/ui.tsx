import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, Music2, TrainFront, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import type { DestinationTicket, TrainCardColor } from './engine.ts';
import { CARD_COLOR_NAME, CITIES, CITY_BY_ID, TRAIN_CARD_HEX, cityName } from './data.ts';
import { CITY_BOUNDS } from './insights.ts';
import { sound } from './sound.ts';
import { cn } from './utils.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'paper';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-brass-300 to-brass-500 text-stone-950 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_8px_20px_rgba(191,138,52,0.22)] hover:from-brass-200 hover:to-brass-400 active:translate-y-px',
  secondary:
    'border border-paper-300/20 bg-white/[0.045] text-paper-100 hover:border-brass-400/40 hover:bg-white/[0.08]',
  ghost: 'text-paper-300 hover:bg-white/[0.07] hover:text-paper-50',
  danger:
    'border border-red-400/25 bg-red-500/10 text-red-200 hover:border-red-400/45 hover:bg-red-500/20',
  paper: 'bg-paper-100 text-stone-900 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] hover:bg-paper-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-xl px-6 text-[15px]',
  icon: 'size-9 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-semibold tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300/70 disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brass' | 'green' | 'red' | 'blue' | 'paper';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
        tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-paper-300',
        tone === 'brass' && 'border-brass-400/30 bg-brass-400/10 text-brass-200',
        tone === 'green' && 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        tone === 'red' && 'border-red-400/25 bg-red-400/10 text-red-200',
        tone === 'blue' && 'border-sky-400/25 bg-sky-400/10 text-sky-200',
        tone === 'paper' && 'border-stone-800/25 bg-stone-900/10 text-stone-800',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closable = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closable) onClose();
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, onClose, closable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto p-3 sm:p-4 modal-backdrop animate-fade"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closable) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'ttr-panel relative my-auto w-full overflow-hidden rounded-2xl animate-rise',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-md',
          size === 'lg' && 'max-w-2xl',
          size === 'xl' && 'max-w-4xl',
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass-300/60 to-transparent" />
        <header className="flex items-start gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="ttr-display text-xl text-paper-50">
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-xs leading-relaxed text-paper-300/80">{subtitle}</div>}
          </div>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-lg p-1.5 text-paper-400 transition hover:bg-white/[0.06] hover:text-paper-100 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </header>
        <div className="max-h-[min(68dvh,680px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-white/[0.07] px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

const textColor: Record<TrainCardColor, string> = {
  PURPLE: '#fff',
  WHITE: '#201c18',
  BLUE: '#fff',
  YELLOW: '#3e2723',
  ORANGE: '#fff',
  BLACK: '#fff',
  RED: '#fff',
  GREEN: '#14260a',
  LOCOMOTIVE: '#2b1c05',
};

const cardSizes = {
  xs: 'h-9 w-6 rounded-[3px]',
  sm: 'h-12 w-8 rounded',
  md: 'h-16 w-11 rounded-md',
  lg: 'h-24 w-16 rounded-lg',
} as const;

export function TrainCard({
  color,
  size = 'md',
  fullWidth = false,
  count,
  selected,
  disabled,
  onClick,
  className,
  label,
}: {
  color: TrainCardColor;
  size?: keyof typeof cardSizes;
  fullWidth?: boolean;
  count?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  const content = (
    <>
      <span
        className="pointer-events-none absolute inset-x-[7%] top-[8%] bottom-[8%] rounded-[2px] opacity-70"
        style={{ border: `1px solid ${color === 'WHITE' ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.35)'}` }}
      />
      <TrainFront
        className={cn('relative z-[1]', size === 'xs' ? 'size-3' : size === 'sm' ? 'size-4' : 'size-5 sm:size-6')}
        strokeWidth={2.4}
      />
      {size !== 'xs' && (
        <span
          className="relative z-[1] mt-0.5 max-w-full truncate px-0.5 text-center font-bold leading-none tracking-tight"
          style={{ fontSize: size === 'lg' ? 10 : size === 'md' ? 8 : 6, color: textColor[color] }}
        >
          {color === 'LOCOMOTIVE' ? '火车头' : CARD_COLOR_NAME[color]}
        </span>
      )}
      {typeof count === 'number' && count > 0 && <span className="card-count">{count}</span>}
    </>
  );

  const style = {
    background: TRAIN_CARD_HEX[color],
    color: textColor[color],
    opacity: disabled ? 0.38 : 1,
    ...(fullWidth ? { width: '100%' } : {}),
  } as const;

  if (!onClick) {
    return (
      <div
        className={cn('card-face shrink-0', cardSizes[size], selected && 'outline outline-2 outline-brass-300', className)}
        style={style}
        title={label ?? CARD_COLOR_NAME[color]}
        aria-label={label ?? CARD_COLOR_NAME[color]}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? CARD_COLOR_NAME[color]}
      title={label ?? CARD_COLOR_NAME[color]}
      className={cn(
        'card-face shrink-0 cursor-pointer transition-transform duration-150 hover:-translate-y-1 hover:shadow-xl focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300 disabled:pointer-events-none',
        cardSizes[size],
        selected && '-translate-y-1 outline outline-2 outline-brass-300',
        className,
      )}
      style={style}
    >
      {content}
    </button>
  );
}

export function MiniMap({
  from,
  to,
  className,
  tone = 'paper',
}: {
  from: string;
  to: string;
  className?: string;
  tone?: 'paper' | 'dark';
}) {
  const a = CITY_BY_ID.get(from);
  const b = CITY_BY_ID.get(to);
  const { minX, minY, width, height } = CITY_BOUNDS;
  const dot = tone === 'paper' ? 'rgba(68, 50, 38, 0.32)' : 'rgba(233, 220, 196, 0.28)';
  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className={cn('block', className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {CITIES.map((city) => (
        <circle key={city.id} cx={city.boardX} cy={city.boardY} r={9} fill={dot} />
      ))}
      {a && b && (
        <>
          <line
            x1={a.boardX}
            y1={a.boardY}
            x2={b.boardX}
            y2={b.boardY}
            stroke="#b5483d"
            strokeWidth={10}
            strokeDasharray="22 16"
            strokeLinecap="round"
          />
          {[a, b].map((city) => (
            <circle key={city.id} cx={city.boardX} cy={city.boardY} r={22} fill="#b5483d" stroke="#fff" strokeWidth={7} />
          ))}
        </>
      )}
    </svg>
  );
}

export const LONG_TICKET_HINT =
  '长途车票：开局每人只会拿到 1 张，分值高（20–21 分），但横跨大半个欧洲。完成可得高分，没完成会倒扣同样的分数；开局没保留的长途车票直接移出游戏。';

export function TicketCard({
  ticket,
  selected,
  completed,
  compact,
  note,
  onClick,
  onHover,
  className,
}: {
  ticket: DestinationTicket;
  selected?: boolean;
  completed?: boolean;
  compact?: boolean;
  note?: string;
  onClick?: () => void;
  onHover?: (hovering: boolean) => void;
  className?: string;
}) {
  const shared = {
    onMouseEnter: onHover ? () => onHover(true) : undefined,
    onMouseLeave: onHover ? () => onHover(false) : undefined,
    onFocus: onHover ? () => onHover(true) : undefined,
    onBlur: onHover ? () => onHover(false) : undefined,
    title: ticket.isLong ? LONG_TICKET_HINT : undefined,
    'aria-label': `${ticket.isLong ? '长途车票，' : ''}${cityName(ticket.from)} 到 ${cityName(ticket.to)}，${ticket.points} 分${completed ? '，已完成' : ''}${note ? `，${note}` : ''}`,
    className: cn(
      'ticket-card relative flex w-full overflow-hidden rounded-lg text-left transition',
      ticket.isLong && 'is-long',
      compact ? 'gap-2.5 p-2.5' : 'gap-3 p-3.5',
      onClick && 'cursor-pointer hover:-translate-y-0.5',
      selected && 'ring-2 ring-brass-400 ring-offset-2 ring-offset-ink-900',
      onClick && !selected && 'opacity-85 hover:opacity-100',
      className,
    ),
  };
  const content = (
    <>
      <MiniMap
        from={ticket.from}
        to={ticket.to}
        className={cn('shrink-0 rounded bg-[#e9dcc0]/60', compact ? 'h-11 w-16' : 'h-[72px] w-[104px]')}
      />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {ticket.isLong && (
              <span className="mb-1 inline-flex rounded-sm bg-[#2f5f80] px-1.5 py-px text-[9px] font-black tracking-[0.12em] text-white">
                长途车票
              </span>
            )}
            <p className={cn('ttr-display leading-tight text-stone-900', compact ? 'text-[13px]' : 'text-base')}>
              {cityName(ticket.from)}
              <ArrowRight className="mx-1 inline size-3 -translate-y-px text-stone-500" />
              {cityName(ticket.to)}
            </p>
            {!compact && (
              <p className="mt-0.5 truncate text-[10px] font-medium text-stone-500">
                {cityName(ticket.from, false)} – {cityName(ticket.to, false)}
              </p>
            )}
          </div>
          <span
            className={cn(
              'grid shrink-0 place-items-center rounded-full border ttr-display font-bold',
              compact ? 'size-8 text-sm' : 'size-10 text-lg',
              completed
                ? 'border-emerald-700/40 bg-emerald-600 text-white'
                : 'border-stone-700/30 bg-stone-900/10 text-stone-900',
            )}
            aria-label={`${ticket.points} 分`}
          >
            {completed ? <Check className="size-4" /> : ticket.points}
          </span>
        </div>
        {note && <p className="mt-1.5 text-[10px] font-semibold leading-4 text-stone-600">{note}</p>}
      </div>
      {selected && (
        <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-brass-500 text-white shadow">
          <Check className="size-3" />
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={Boolean(selected)} {...shared}>
        {content}
      </button>
    );
  }
  return <div {...shared}>{content}</div>;
}

export function SoundControl({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings, sound.getServerSettings);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const Icon = settings.muted || settings.volume === 0 ? VolumeX : settings.volume < 0.45 ? Volume1 : Volume2;
  const percent = Math.round(settings.volume * 100);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'grid size-8 sm:size-9 place-items-center rounded-lg border transition cursor-pointer',
          settings.muted
            ? 'border-red-400/25 bg-red-400/10 text-red-200'
            : 'border-white/10 bg-white/[0.04] text-paper-200 hover:border-brass-400/40 hover:text-brass-200',
        )}
        aria-label={settings.muted ? '声音已关闭，点击调整' : '声音设置'}
        aria-expanded={open}
        title="声音"
      >
        <Icon className="size-4" />
      </button>
      {open && (
        <div
          className={cn(
            'ttr-panel absolute top-11 z-[70] w-64 rounded-xl p-4 animate-rise',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          role="dialog"
          aria-label="声音设置"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-paper-50">声音</p>
            <Switch
              checked={!settings.muted}
              onChange={(on) => {
                sound.update({ muted: !on });
                if (on) {
                  sound.unlock();
                  sound.play('select');
                }
              }}
              label={settings.muted ? '已静音' : '已开启'}
            />
          </div>
          <div className={cn('mt-4 space-y-4', settings.muted && 'pointer-events-none opacity-40')}>
            <label className="block">
              <span className="flex items-center justify-between text-xs text-paper-300">
                音量 <span className="tabular-nums text-paper-400">{percent}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                onChange={(event) => sound.update({ volume: Number(event.target.value) / 100 })}
                onPointerUp={() => sound.play('cardDraw')}
                onKeyUp={() => sound.play('cardDraw')}
                className="volume mt-2 w-full"
                style={{ ['--fill' as string]: `${percent}%` }}
                aria-label="音量"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-paper-300">
                <Music2 className="size-3.5 text-paper-400" /> 列车环境音
              </span>
              <Switch checked={settings.ambient} onChange={(on) => sound.update({ ambient: on })} label="" />
            </div>
            <p className="text-[11px] leading-5 text-paper-500">纯 Web Audio 合成音效，全程离线播放。</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[11px] text-paper-400 cursor-pointer"
    >
      {label}
      <span
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full border transition',
          checked ? 'border-brass-400/50 bg-brass-400/70' : 'border-white/15 bg-white/10',
        )}
      >
        <span
          className={cn(
            'absolute size-3.5 rounded-full bg-paper-50 shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
          )}
        />
      </span>
    </button>
  );
}
