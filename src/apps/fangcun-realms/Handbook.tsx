import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { EXPANSION_INFO, MODULE_GROUPS } from './lib/labels.ts';

const FIELD = '#b3c69a';
const CITY = '#ece6d8';
const WALL = '#4a5866';
const ROAD = '#eadcbd';
const ROAD_EDGE = '#6b5a42';

function Tile({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="40" height="40" rx="2" fill={FIELD} stroke="#4d6243" strokeWidth="1" />
      {children}
    </g>
  );
}

function Pawn({ x, y, color = '#e0533f' }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.7)`}>
      <path d="M-5,-3.5 H5 L7.5,9 H-7.5 Z" fill={color} stroke="#141414" strokeWidth="1.2" />
      <circle cx="0" cy="-5.5" r="3" fill={color} stroke="#141414" strokeWidth="1.1" />
      <path d="M-8.5,-7 L0,-13.5 L8.5,-7 Z" fill={color} stroke="#141414" strokeWidth="1.2" />
    </g>
  );
}

const road = (d: string) => (
  <>
    <path d={d} stroke={ROAD_EDGE} strokeWidth="6" fill="none" />
    <path d={d} stroke={ROAD} strokeWidth="4" fill="none" />
  </>
);

const FIGURES: Record<string, ReactNode> = {
  turn: (
    <svg viewBox="0 0 200 70" className="w-full">
      <Tile x={20} y={15}>{road('M0 20H40')}</Tile>
      <Tile x={60} y={15}>{road('M0 20H20V40')}</Tile>
      <rect x="100" y="15" width="40" height="40" rx="2" fill="none" stroke="#ecc878" strokeWidth="1.6" strokeDasharray="4 3" />
      <text x="120" y="40" fill="#ecc878" fontSize="10" textAnchor="middle">
        放这里
      </text>
      <Pawn x={170} y={36} />
      <text x="170" y="64" fill="#cbd5e1" fontSize="9" textAnchor="middle">
        可选：派人
      </text>
    </svg>
  ),
  city: (
    <svg viewBox="0 0 200 70" className="w-full">
      <Tile x={20} y={15}>
        <path d="M40 0V40Q22 20 40 0Z" fill={CITY} stroke={WALL} strokeWidth="2" />
      </Tile>
      <Tile x={60} y={15}>
        <path d="M0 0V40Q18 20 0 0Z" fill={CITY} stroke={WALL} strokeWidth="2" />
      </Tile>
      <Pawn x={60} y={35} />
      <text x="150" y="32" fill="#e2e8f0" fontSize="10" textAnchor="middle">
        围合：每块 2 分
      </text>
      <text x="150" y="48" fill="#94a3b8" fontSize="9" textAnchor="middle">
        每面旗再 +2
      </text>
    </svg>
  ),
  road: (
    <svg viewBox="0 0 200 70" className="w-full">
      <Tile x={20} y={15}>
        {road('M20 20H40')}
        <rect x="13" y="13" width="14" height="14" fill="#efe6d2" stroke="#5b5146" />
      </Tile>
      <Tile x={60} y={15}>{road('M0 20H40')}</Tile>
      <Tile x={100} y={15}>
        {road('M0 20H20')}
        <circle cx="22" cy="20" r="5" fill="#5d9bb0" stroke="#2f5f73" />
      </Tile>
      <Pawn x={80} y={30} />
      <text x="170" y="38" fill="#e2e8f0" fontSize="10" textAnchor="middle">
        每块 1 分
      </text>
    </svg>
  ),
  temple: (
    <svg viewBox="0 0 200 70" className="w-full">
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={62 + c * 20} y={5 + r * 20} width="19" height="19" rx="1" fill={FIELD} stroke="#4d6243" />
        )),
      )}
      <path d="M86 32Q92 31 93 27H99Q100 31 106 32Z" fill="#3e4a55" />
      <rect x="88" y="32" width="16" height="8" fill="#efe6d2" />
      <text x="160" y="38" fill="#e2e8f0" fontSize="10" textAnchor="middle">
        铺满 9 格得 9 分
      </text>
    </svg>
  ),
  field: (
    <svg viewBox="0 0 200 70" className="w-full">
      <rect x="14" y="10" width="96" height="50" rx="3" fill={FIELD} stroke="#4d6243" />
      <path d="M14 10H60Q37 32 14 10Z" fill={CITY} stroke={WALL} strokeWidth="2" />
      <path d="M74 60H110V36Q86 40 74 60Z" fill={CITY} stroke={WALL} strokeWidth="2" />
      <g transform="translate(58 42) rotate(-90)">
        <Pawn x={0} y={0} />
      </g>
      <text x="156" y="32" fill="#e2e8f0" fontSize="10" textAnchor="middle">
        终局结算
      </text>
      <text x="156" y="48" fill="#94a3b8" fontSize="9" textAnchor="middle">
        每座完成城池 3 分
      </text>
    </svg>
  ),
};

const SECTIONS: { figure: keyof typeof FIGURES; title: string; body: string }[] = [
  {
    figure: 'turn',
    title: '一回合：摸、放、派',
    body: '摸一块地块，接在版图上已有的地块旁边，四条边都要接得上：城墙对城墙、驿道对驿道、田野对田野。放好后，可以在这块地上派一位随从，也可以不派。',
  },
  {
    figure: 'city',
    title: '城池',
    body: '城墙把一片城池完全围起来就算完成，每块地 2 分，每面旗帜再加 2 分。到终局还没围合的，每块和每面旗各只算 1 分。',
  },
  {
    figure: 'road',
    title: '驿道',
    body: '驿道两头都停在村舍、城门、湖边或路口时完成，每块地 1 分；终局没完成的也照样每块 1 分。',
  },
  {
    figure: 'temple',
    title: '寺院',
    body: '寺院自己和周围 8 格全部铺满时得 9 分；终局没铺满的，按已经铺下的格数计分。',
  },
  {
    figure: 'field',
    title: '田野',
    body: '派到田野的随从躺下，一直待到终局：这片田野挨着几座已完成的城池，人多的一方就拿几个 3 分。',
  },
];

export function Handbook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="fc-handbook-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fc-dialog"
    >
      <div className="flex max-h-[min(86dvh,760px)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="fc-handbook-title" className="fc-display text-xl font-bold text-white">
              图文手册
            </h2>
            <p className="mt-1 text-xs text-slate-400">谁的随从多，地形就归谁；人数相同，大家都拿满分。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭手册" title="关闭" className="fc-btn ghost p-1.5">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs leading-6 text-slate-300">
          <div className="grid gap-3 md:grid-cols-2">
            {SECTIONS.map((section) => (
              <section key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="rounded-lg bg-black/25 px-2 py-1" aria-hidden="true">
                  {FIGURES[section.figure]}
                </div>
                <h3 className="mt-2 fc-display text-sm font-bold text-amber-200">{section.title}</h3>
                <p className="mt-1">{section.body}</p>
              </section>
            ))}
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="fc-display text-sm font-bold text-amber-200">抢地盘的诀窍</h3>
              <p className="mt-1">
                已经有人的城池、驿道或田野不能再派人进去。但你可以在旁边另起一片，等两片接在一起，随从多的一方独得全部分数，一样多就都拿满分。
              </p>
              <p className="mt-2">随从一共 7 位，派出去的要等地形完成才回来，别一口气全押在田野上。</p>
            </section>
          </div>

          <section>
            <h3 className="fc-display text-sm font-bold text-amber-200">规则模块</h3>
            <p className="mt-1 text-slate-400">开局前在设置里自由勾选，熟悉基础规则后每次加一两个最好上手。</p>
            <div className="mt-2 space-y-3">
              {MODULE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold text-slate-400">{group.label}</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {group.modules.map((id) => (
                      <div key={id} className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                        <p className="font-semibold text-white">{EXPANSION_INFO[id].name}</p>
                        <p className="text-[11px] leading-5 text-slate-400">{EXPANSION_INFO[id].hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <footer className="flex justify-end border-t border-white/10 px-5 py-3">
          <button type="button" onClick={onClose} className="fc-btn primary px-4 py-1.5">
            知道了
          </button>
        </footer>
      </div>
    </dialog>
  );
}
