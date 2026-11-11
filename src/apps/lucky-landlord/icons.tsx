import React from 'react';
import { ROOMS_BY_ID, STREAMS_BY_ID, SYMBOLS_BY_ID } from './content.ts';
import type { RoomTypeId } from './types.ts';

export const LuckyLedgerEmblemSvg: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg
    viewBox="0 0 88 88"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Outer vermilion seal frame */}
    <rect
      x="6"
      y="6"
      width="76"
      height="76"
      rx="10"
      fill="#FFFBF5"
      stroke="#C2410C"
      strokeWidth="3.5"
    />
    <rect
      x="12"
      y="12"
      width="64"
      height="64"
      rx="6"
      fill="#FEF3C7"
      fillOpacity="0.45"
      stroke="#1C1917"
      strokeWidth="1.5"
    />
    {/* Architectural apartment roof + abacus ledger motif */}
    <path
      d="M22 36L44 20L66 36"
      stroke="#1C1917"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="26"
      y="36"
      width="36"
      height="30"
      rx="3"
      fill="#FFFFFF"
      stroke="#1C1917"
      strokeWidth="2.4"
    />
    {/* Grid windows / 4x5 ledger slots */}
    <line x1="38" y1="36" x2="38" y2="66" stroke="#1C1917" strokeWidth="1.6" />
    <line x1="50" y1="36" x2="50" y2="66" stroke="#1C1917" strokeWidth="1.6" />
    <line x1="26" y1="46" x2="62" y2="46" stroke="#1C1917" strokeWidth="1.6" />
    <line x1="26" y1="56" x2="62" y2="56" stroke="#1C1917" strokeWidth="1.6" />
    {/* Golden coin seal highlight in center cell */}
    <circle cx="44" cy="51" r="4" fill="#C2410C" />
    <circle cx="32" cy="41" r="2.2" fill="#B45309" />
    <circle cx="56" cy="61" r="2.2" fill="#15803D" />
  </svg>
);

export const RoomBadgeSvg: React.FC<{ room: RoomTypeId; className?: string }> = ({
  room,
  className = 'w-3.5 h-3.5',
}) => {
  const def = ROOMS_BY_ID[room];
  if (room === 'plain') return null;
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {room === 'gold_shop' && (
        <>
          <path
            d="M3 8L5 4H15L17 8V16H3V8Z"
            fill={def.bgHex}
            stroke={def.accentHex}
            strokeWidth="1.8"
          />
          <path d="M3 8H17" stroke={def.accentHex} strokeWidth="1.6" />
          <circle cx="10" cy="12" r="2" fill={def.accentHex} />
        </>
      )}
      {room === 'sun_greenhouse' && (
        <>
          <path
            d="M10 3C6 6 5 11 10 17C15 11 14 6 10 3Z"
            fill="#DCFCE7"
            stroke={def.accentHex}
            strokeWidth="1.8"
          />
          <path d="M10 6V16" stroke={def.accentHex} strokeWidth="1.4" />
        </>
      )}
      {room === 'craft_workshop' && (
        <>
          <circle
            cx="10"
            cy="10"
            r="6"
            fill="#DBEAFE"
            stroke={def.accentHex}
            strokeWidth="1.8"
          />
          <circle cx="10" cy="10" r="2" fill={def.accentHex} />
        </>
      )}
      {room === 'express_hub' && (
        <>
          <rect
            x="3"
            y="4"
            width="14"
            height="12"
            rx="2"
            fill="#CCFBF1"
            stroke={def.accentHex}
            strokeWidth="1.8"
          />
          <path d="M3 9H17M10 4V9" stroke={def.accentHex} strokeWidth="1.5" />
        </>
      )}
      {room === 'quiet_suite' && (
        <>
          <path
            d="M10 3L16 6V11C16 14.5 13.4 16.8 10 17.8C6.6 16.8 4 14.5 4 11V6L10 3Z"
            fill="#FFE4E6"
            stroke={def.accentHex}
            strokeWidth="1.8"
          />
        </>
      )}
    </svg>
  );
};

export const SymbolArtSvg: React.FC<{
  defId: string;
  stars?: 1 | 2;
  className?: string;
}> = ({ defId, stars = 1, className = 'w-8 h-8' }) => {
  const def = SYMBOLS_BY_ID[defId];
  const streamMeta = def ? STREAMS_BY_ID[def.stream] : STREAMS_BY_ID.folk;
  const accent = streamMeta.colorHex;
  const tint = streamMeta.tintHex;
  const stroke = '#1C1917';

  const renderGlyph = () => {
    switch (defId) {
      // Drinks & Night Market
      case 'milk_tea':
      case 'lemon_tea':
      case 'supreme_tea_barrel':
        return (
          <>
            <path d="M20 5L18 11" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
            <path
              d={defId === 'supreme_tea_barrel' ? 'M9 11H27L25 30H11L9 11Z' : 'M11 11H25L23 29H13L11 11Z'}
              fill={tint}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M9.5 11H26.5" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="15.5" cy="25" r="1.7" fill={stroke} />
            <circle cx="20" cy="25.5" r="1.7" fill={stroke} />
            {defId === 'lemon_tea' && (
              <circle cx="18" cy="18" r="3.5" fill="#FDE047" stroke={stroke} strokeWidth="1.5" />
            )}
          </>
        );

      case 'boba_pearl':
        return (
          <>
            <circle cx="13" cy="21" r="4.5" fill="#451A03" stroke={stroke} strokeWidth="1.8" />
            <circle cx="22.5" cy="22" r="4.5" fill="#451A03" stroke={stroke} strokeWidth="1.8" />
            <circle cx="18" cy="13.5" r="4.5" fill="#78350F" stroke={stroke} strokeWidth="1.8" />
            <circle cx="16.8" cy="12.2" r="1.2" fill="#FEF3C7" />
          </>
        );

      case 'delivery_rider':
        return (
          <>
            <rect x="8" y="12" width="9" height="8" rx="1.5" fill="#FDE047" stroke={stroke} strokeWidth="1.8" />
            <path d="M17 15H23L26 22H11L13 18" fill={tint} stroke={stroke} strokeWidth="1.9" strokeLinejoin="round" />
            <circle cx="12" cy="25" r="3.5" fill="#FFFFFF" stroke={stroke} strokeWidth="2" />
            <circle cx="24" cy="25" r="3.5" fill="#FFFFFF" stroke={stroke} strokeWidth="2" />
          </>
        );

      case 'bbq_stall':
        return (
          <>
            <rect x="8" y="18" width="20" height="8" rx="2" fill={tint} stroke={stroke} strokeWidth="2" />
            <path d="M11 26L9 31M25 26L27 31" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
            <path d="M13 15C13 12 15 11 14 8M18 15C18 12 20 11 19 8M23 15C23 12 25 11 24 8" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" />
          </>
        );

      // Cats & Pets
      case 'orange_cat':
      case 'calico_cat':
      case 'fortune_gold_cat':
        return (
          <>
            <path
              d="M10 15L11 8L16 12H20L25 8L26 15C27.5 17 28 20 27 23.5C25.8 27 22.5 29 18 29C13.5 29 10.2 27 9 23.5C8 20 8.5 17 10 15Z"
              fill={defId === 'fortune_gold_cat' ? '#FDE047' : tint}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="14.5" cy="19" r="1.6" fill={stroke} />
            <circle cx="21.5" cy="19" r="1.6" fill={stroke} />
            <path d="M16 22.5Q18 24.5 20 22.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
            {defId === 'fortune_gold_cat' && (
              <circle cx="18" cy="26" r="2.3" fill="#C2410C" />
            )}
          </>
        );

      case 'tuna_can':
        return (
          <>
            <ellipse cx="18" cy="14" rx="9" ry="4" fill="#FFFFFF" stroke={stroke} strokeWidth="2" />
            <path d="M9 14V23C9 25.2 13 27 18 27C23 27 27 25.2 27 23V14" fill={tint} stroke={stroke} strokeWidth="2" />
            <circle cx="21" cy="13.5" r="2" stroke={accent} strokeWidth="1.6" />
          </>
        );

      case 'cat_tree':
        return (
          <>
            <rect x="9" y="26" width="18" height="3.5" rx="1" fill={tint} stroke={stroke} strokeWidth="1.8" />
            <rect x="16" y="12" width="4" height="14" fill="#FED7AA" stroke={stroke} strokeWidth="1.8" />
            <rect x="10" y="9" width="16" height="4" rx="2" fill={tint} stroke={stroke} strokeWidth="1.8" />
            <circle cx="23" cy="17" r="2" fill={accent} />
          </>
        );

      case 'koi_tank':
        return (
          <>
            <circle cx="18" cy="18" r="10" fill="#E0F2FE" stroke={stroke} strokeWidth="2" />
            <path d="M13 19C15 15 20 15 23 18C20 21 15 22 13 19Z" fill="#EA580C" stroke={stroke} strokeWidth="1.5" />
          </>
        );

      // Garden & Plants
      case 'sunflower':
      case 'succulent':
      case 'catnip_pot':
      case 'kumquat_tree':
      case 'money_tree':
        return (
          <>
            <path d="M12 22H24L22 30H14L12 22Z" fill="#FED7AA" stroke={stroke} strokeWidth="1.9" strokeLinejoin="round" />
            <path d="M18 22V13" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" />
            <circle
              cx="18"
              cy="12"
              r="5.5"
              fill={defId === 'sunflower' || defId === 'money_tree' ? '#FDE047' : '#86EFAC'}
              stroke={stroke}
              strokeWidth="1.9"
            />
            {(defId === 'kumquat_tree' || defId === 'money_tree') && (
              <>
                <circle cx="14.5" cy="11" r="1.8" fill="#EA580C" />
                <circle cx="21.5" cy="13" r="1.8" fill="#EA580C" />
              </>
            )}
          </>
        );

      case 'sun_rain':
        return (
          <>
            <circle cx="14" cy="13" r="4.5" fill="#FDE047" stroke={stroke} strokeWidth="1.8" />
            <path
              d="M15 21H25C26.8 21 28 19.7 28 18C28 16.4 26.8 15.2 25.2 15C24.6 12.8 22.6 11.5 20.3 11.5C17.8 11.5 15.8 13.3 15.4 15.7C13.8 16 12.8 17.3 12.8 18.8C12.8 20.1 13.8 21 15 21Z"
              fill="#FFFFFF"
              stroke={stroke}
              strokeWidth="1.8"
            />
            <path d="M16 24L15 28M20 24L19 28M24 24L23 28" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" />
          </>
        );

      case 'honey_bee':
        return (
          <>
            <ellipse cx="18" cy="19" rx="7" ry="5" fill="#FDE047" stroke={stroke} strokeWidth="2" />
            <path d="M16 14.5V23.5M20 14.5V23.5" stroke={stroke} strokeWidth="2" />
            <ellipse cx="15" cy="12" rx="3" ry="2.2" fill="#FFFFFF" stroke={stroke} strokeWidth="1.5" />
            <ellipse cx="21" cy="12" rx="3" ry="2.2" fill="#FFFFFF" stroke={stroke} strokeWidth="1.5" />
          </>
        );

      // Ore, Gems & Tools
      case 'raw_ore':
      case 'ice_jade':
      case 'amethyst_vault':
        return (
          <>
            <polygon
              points="18,7 28,14 25,28 11,28 8,14"
              fill={defId === 'ice_jade' ? '#6EE7B7' : defId === 'raw_ore' ? '#E7E5E4' : '#E9D5FF'}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M18 7L18 28M8 14L28 14" stroke={stroke} strokeWidth="1.3" strokeOpacity="0.55" />
          </>
        );

      case 'oyster':
      case 'sea_pearl':
        return (
          <>
            <path
              d="M8 21C8 13 13 9 18 9C23 9 28 13 28 21L24 27H12L8 21Z"
              fill={tint}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="18" cy="20" r="4.2" fill="#FFFFFF" stroke={accent} strokeWidth="1.8" />
          </>
        );

      case 'steel_pickaxe':
      case 'iron_hammer':
      case 'utility_knife':
      case 'watering_can':
      case 'master_key':
        return (
          <>
            <path d="M11 26L24 13" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />
            {defId === 'master_key' ? (
              <circle cx="24" cy="12" r="4.5" fill="#FDE047" stroke={stroke} strokeWidth="2" />
            ) : (
              <path
                d="M17 9C21 8 25 11 27 15L22 18L15 11L17 9Z"
                fill={tint}
                stroke={stroke}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}
          </>
        );

      // Express & Boxes
      case 'parcel_box':
      case 'blind_box':
      case 'smart_locker':
      case 'flea_stall':
        return (
          <>
            <rect
              x="8"
              y="9"
              width="20"
              height="19"
              rx="2.5"
              fill={defId === 'blind_box' ? '#FEF08A' : tint}
              stroke={stroke}
              strokeWidth="2"
            />
            <path d="M8 15H28M18 9V15" stroke={stroke} strokeWidth="1.8" />
            {defId === 'blind_box' && (
              <text
                x="18"
                y="25"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={stroke}
              >
                ?
              </text>
            )}
          </>
        );

      // Curio: Coins, Dice, Piggy, Safe
      case 'lucky_coin':
        return (
          <>
            <circle cx="18" cy="18" r="10" fill="#FDE047" stroke={stroke} strokeWidth="2" />
            <rect x="14.5" y="14.5" width="7" height="7" rx="1" fill="#FAF8F4" stroke={stroke} strokeWidth="1.8" />
          </>
        );

      case 'lucky_dice':
        return (
          <>
            <rect x="8" y="8" width="20" height="20" rx="4" fill="#FFFFFF" stroke={stroke} strokeWidth="2" />
            <circle cx="13" cy="13" r="1.8" fill={stroke} />
            <circle cx="23" cy="13" r="1.8" fill={stroke} />
            <circle cx="18" cy="18" r="2" fill="#C2410C" />
            <circle cx="13" cy="23" r="1.8" fill={stroke} />
            <circle cx="23" cy="23" r="1.8" fill={stroke} />
          </>
        );

      case 'piggy_bank':
      case 'vault_safe':
        return (
          <>
            <rect
              x="8"
              y="11"
              width="20"
              height="16"
              rx={defId === 'piggy_bank' ? 8 : 2.5}
              fill={defId === 'piggy_bank' ? '#FECDD3' : '#E2E8F0'}
              stroke={stroke}
              strokeWidth="2"
            />
            <line x1="15" y1="14" x2="21" y2="14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
            <circle cx="18" cy="20" r="2.6" fill={accent} />
          </>
        );

      // Mahjong, Estate Deeds & Signs
      case 'red_dragon_tile':
      case 'lease_contract':
      case 'red_deed':
      case 'demolition_notice':
      case 'for_rent_sign':
      case 'school_plaque':
      case 'chess_parlor':
        return (
          <>
            <rect
              x="9"
              y="7"
              width="18"
              height="22"
              rx="2.5"
              fill={defId === 'red_deed' ? '#FECDD3' : '#FFFFFF'}
              stroke={stroke}
              strokeWidth="2"
            />
            <line x1="13" y1="13" x2="23" y2="13" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
            <line x1="13" y1="18" x2="23" y2="18" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="21" cy="23.5" r="2.5" fill="#C2410C" />
          </>
        );

      // Folk & Human Characters (worker, guard, miner, thief, landlady, etc.)
      default:
        return (
          <>
            <circle
              cx="18"
              cy="13"
              r="5"
              fill={defId === 'thief' ? '#CBD5E1' : tint}
              stroke={stroke}
              strokeWidth="2"
            />
            <path
              d="M9.5 28C10.5 22.5 13.8 20 18 20C22.2 20 25.5 22.5 26.5 28"
              fill={defId === 'security_guard' ? '#BFDBFE' : tint}
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {defId === 'miner' && (
              <path d="M12 11H24L22 7H14L12 11Z" fill="#FDE047" stroke={stroke} strokeWidth="1.6" />
            )}
            {defId === 'thief' && (
              <rect x="13" y="11.5" width="10" height="3" rx="1" fill={stroke} />
            )}
          </>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {stars === 2 && (
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="7"
          fill="#FEF3C7"
          fillOpacity="0.65"
          stroke="#D97706"
          strokeWidth="1.8"
        />
      )}
      {renderGlyph()}
    </svg>
  );
};
