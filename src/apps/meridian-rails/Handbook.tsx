import type { ReactNode } from 'react';
import { ROUTE_LENGTH_POINTS, TRAIN_CARD_HEX } from './data.ts';
import { LONGEST_ROUTE_BONUS_POINTS } from './engine.ts';
import { Button, Modal } from './ui.tsx';

/** Small card glyph used by the figures. */
function Card({ x, y, color, star = false }: { x: number; y: number; color: string; star?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="22" height="32" rx="3" fill={color} stroke="#0b1014" strokeWidth="1.2" />
      {star && <path d="M11 9l2 5.2 5 1-4 3.4 1.2 5.2L11 21l-4.2 2.8L8 18.6 4 15.2l5-1z" fill="#fff" />}
    </g>
  );
}

function Slot({ x, y, color, star = false, dashed = false }: { x: number; y: number; color: string; star?: boolean; dashed?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {dashed && <rect x="-3" y="-3" width="40" height="20" rx="5" fill="none" stroke="#e9e2d3" strokeWidth="1.4" strokeDasharray="4 2.5" />}
      <rect width="34" height="14" rx="3" fill={color} stroke="#0b1014" strokeWidth="1" />
      {star && <path d="M17 2.5l1.3 3.4 3.4 1.1-3.4 1.1L17 11.5l-1.3-3.4-3.4-1.1 3.4-1.1z" fill="#fff" />}
    </g>
  );
}

function City({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="7" fill="#fff" stroke="#0b1014" strokeWidth="2" />
      <circle cx={x} cy={y} r="2.8" fill="#0b1014" />
      {label && (
        <text x={x} y={y + 20} fill="#d8d0bf" fontSize="11" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

const C = TRAIN_CARD_HEX;

const FIGURES: Record<string, ReactNode> = {
  turn: (
    <svg viewBox="0 0 200 92" className="w-full">
      <Card x={10} y={14} color={C.RED} />
      <Card x={36} y={14} color={C.BLUE} />
      <Card x={62} y={14} color={C.LOCOMOTIVE} star />
      <rect x={96} y={14} width="22" height="32" rx="3" fill="#3a2f2a" stroke="#0b1014" strokeWidth="1.2" />
      <rect x={100} y={18} width="14" height="24" rx="2" fill="none" stroke="#c9a76a" strokeWidth="1" />
      <text x="107" y="62" fill="#a59c8b" fontSize="10" textAnchor="middle">
        牌堆
      </text>
      <text x="48" y="62" fill="#a59c8b" fontSize="10" textAnchor="middle">
        明牌
      </text>
      <path d="M140 30h40" stroke="#d8d0bf" strokeWidth="1.5" markerEnd="url(#hb-arrow)" />
      <text x="160" y="22" fill="#d8d0bf" fontSize="10" textAnchor="middle">
        拿 2 张
      </text>
      <defs>
        <marker id="hb-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L8 4 0 8z" fill="#d8d0bf" />
        </marker>
      </defs>
    </svg>
  ),
  claim: (
    <svg viewBox="0 0 200 92" className="w-full">
      <City x={16} y={26} />
      <Slot x={30} y={19} color={C.GREEN} />
      <Slot x={68} y={19} color={C.GREEN} />
      <Slot x={106} y={19} color={C.GREEN} />
      <City x={154} y={26} />
      <Card x={40} y={52} color={C.GREEN} />
      <Card x={66} y={52} color={C.GREEN} />
      <Card x={92} y={52} color={C.LOCOMOTIVE} star />
      <text x="166" y="72" fill="#d8d0bf" fontSize="11" textAnchor="middle">
        3 格 = 4 分
      </text>
    </svg>
  ),
  tunnel: (
    <svg viewBox="0 0 200 92" className="w-full">
      <Slot x={14} y={14} color={C.ORANGE} dashed />
      <Slot x={56} y={14} color={C.ORANGE} dashed />
      <text x="104" y="19" fill="#d8d0bf" fontSize="9.5">
        付 2 张橙色，
      </text>
      <text x="104" y="32" fill="#d8d0bf" fontSize="9.5">
        再从牌堆翻 3 张
      </text>
      <Card x={14} y={48} color={C.BLUE} />
      <Card x={40} y={48} color={C.ORANGE} />
      <Card x={66} y={48} color={C.WHITE} />
      <text x="104" y="62" fill="#f2b28c" fontSize="9.5">
        翻出 1 张橙色，
      </text>
      <text x="104" y="75" fill="#f2b28c" fontSize="9.5">
        就要再补 1 张
      </text>
    </svg>
  ),
  ferry: (
    <svg viewBox="0 0 200 92" className="w-full">
      <rect x="0" y="6" width="200" height="40" rx="6" fill="#2b4a57" opacity="0.6" />
      <Slot x={20} y={19} color="#A7A39A" star />
      <Slot x={60} y={19} color="#A7A39A" />
      <Slot x={100} y={19} color="#A7A39A" />
      <Card x={30} y={54} color={C.LOCOMOTIVE} star />
      <Card x={56} y={54} color={C.YELLOW} />
      <Card x={82} y={54} color={C.YELLOW} />
      <text x="164" y="74" fill="#d8d0bf" fontSize="10.5" textAnchor="middle">
        星标格用万能牌
      </text>
    </svg>
  ),
  station: (
    <svg viewBox="0 0 200 92" className="w-full">
      <City x={22} y={46} label="甲" />
      <path d="M30 46h48" stroke={C.RED} strokeWidth="9" strokeLinecap="round" />
      <City x={92} y={46} label="乙" />
      <path d="M100 46h60" stroke="#3B82C4" strokeWidth="9" strokeLinecap="round" opacity="0.85" />
      <City x={174} y={46} label="丙" />
      <path d="M92 20l9 7v10H83V27z" fill={C.RED} stroke="#0b1014" strokeWidth="1.2" />
      <text x="130" y="28" fill="#d8d0bf" fontSize="10" textAnchor="middle">
        借对手这一段
      </text>
    </svg>
  ),
  ticket: (
    <svg viewBox="0 0 200 92" className="w-full">
      <rect x="8" y="10" width="92" height="56" rx="4" fill="#efe5cf" stroke="#9c8158" />
      <text x="54" y="34" fill="#33251c" fontSize="12" fontWeight="700" textAnchor="middle">
        甲 → 丙
      </text>
      <circle cx="54" cy="52" r="9" fill="#B4472E" />
      <text x="54" y="56" fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">
        8
      </text>
      <text x="150" y="34" fill="#8fd6a8" fontSize="11" textAnchor="middle">
        连通 +8
      </text>
      <text x="150" y="56" fill="#f19a8c" fontSize="11" textAnchor="middle">
        没连通 −8
      </text>
    </svg>
  ),
};

interface Section {
  figure: keyof typeof FIGURES;
  title: string;
  body: string;
  points: string[];
}

const SECTIONS: Section[] = [
  {
    figure: 'turn',
    title: '每回合只做一件事',
    body: '轮到你时，从下面四件事里挑一件：摸车厢卡、占一条线路、抽新车票、建一座车站。',
    points: [
      '摸牌一共拿 2 张，明牌和牌堆随意组合。',
      '明牌里的万能牌很抢手：第一张拿它，这回合就到此为止；第二张不能拿明牌里的万能牌。牌堆里摸到的万能牌不算。',
      '明牌里同时躺着 3 张万能牌时，整排换新。',
    ],
  },
  {
    figure: 'claim',
    title: '占线路',
    body: '线路有几格，就打出几张同色牌。彩色线路只认自己的颜色，灰色线路随便哪种颜色都行，万能牌可以顶替任何颜色。',
    points: [
      '占下立刻得分：1/2/3/4/6/8 格分别得 1/2/4/7/15/21 分。',
      '两条平行的双线：2–3 人局只能用其中一条；人再多，同一个人也不能两条都占。',
    ],
  },
  {
    figure: 'tunnel',
    title: '隧道：带虚线描边的线路',
    body: '先照常付牌，再从牌堆翻 3 张。翻出几张和你付的颜色一样的牌（或万能牌），就要再补几张。',
    points: ['补不起或不想补，可以收回刚才的牌，但这一回合就用掉了。', '全用万能牌付的话，只有翻出的万能牌才需要补，而且也只能补万能牌。'],
  },
  {
    figure: 'ferry',
    title: '渡轮：带星标的线路',
    body: '跨海的线路上有星标，每个星标格都必须用 1 张万能牌付，其余格子照常用同一种颜色。',
    points: ['渡轮都是灰线，非星标格的颜色你自己选。'],
  },
  {
    figure: 'station',
    title: '车站',
    body: '每人有 3 座车站，可以建在还没人建站的城市，第 1/2/3 座分别要付 1/2/3 张同色牌。',
    points: ['终局结算车票时，每座车站可以借用一条对手连到这座城的线路。', '一座都没用上的车站，每座 +4 分。'],
  },
  {
    figure: 'ticket',
    title: '车票与终局',
    body: '车票上写着两座城市和分值。只要用你自己的线路（加上车站借的路）把两城连起来，终局就加上这些分；没连起来就扣掉。',
    points: [
      '开局每人拿 1 张长途票和 3 张普通票，至少留 2 张；以后抽票每次抽 3 张、至少留 1 张。',
      '有人剩下的车厢不超过 2 节时，所有人再各走一回合，然后结算。',
      `连续线路最长的玩家拿最长干线奖 +${LONGEST_ROUTE_BONUS_POINTS}，并列都拿。`,
      '平分时依次比：完成的车票多、用掉的车站少、拿到最长干线奖。',
    ],
  },
];

export function Handbook({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="图文手册"
      subtitle={`线路得分：${Object.entries(ROUTE_LENGTH_POINTS)
        .map(([length, points]) => `${length} 格 ${points} 分`)
        .join(' · ')}`}
      size="xl"
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>知道了</Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="rounded-lg bg-black/25 px-3 py-2" aria-hidden="true">
              {FIGURES[section.figure]}
            </div>
            <h3 className="mt-3 mer-display text-base text-(--mer-paper-50)">{section.title}</h3>
            <p className="mt-1 text-xs leading-6 text-(--mer-paper-200)">{section.body}</p>
            <ul className="mt-2 grid gap-1 text-[11px] leading-5 text-(--mer-paper-400)">
              {section.points.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-(--mer-brass-400)/70" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
