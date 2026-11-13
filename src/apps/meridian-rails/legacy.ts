/**
 * Reading saves written before the 2026-11-13 rename (app id `ticket-to-ride-europe`).
 *
 * The board kept its topology, so an in-progress match carries over: city and route ids are
 * rewritten to the new spelling, and each held ticket becomes the new ticket for the same two
 * cities, or the unused ticket of the same kind with the closest points; the ticket piles are mapped
 * the same way and keep their order. Anything that still fails validation is dropped instead of loaded.
 * See docs/compatibility.md「应用 id 改名与别名」.
 */
import { CITY_BY_ID, ROUTE_BY_ID, TICKETS, TICKET_BY_ID } from './data.ts';
import type { DestinationTicket } from './engine.ts';
import type { MerLocalMatch, StoredLogEntry } from './types.ts';

/** Save keys of the retired app id, by purpose. */
export const LEGACY_KEYS = {
  meta: '43gg.ticket_to_ride_europe.meta.v1',
  activeRun: '43gg.ticket_to_ride_europe.active_run.v1',
  tour: '43gg.ticket_to_ride_europe.tour.v1',
  audio: '43gg.ticket_to_ride_europe.audio.v1',
} as const;

/** Cities whose id changed (spelling only; same city, same board position). */
export const LEGACY_CITY_IDS: Readonly<Record<string, string>> = {
  angora: 'ankara',
  athina: 'athens',
  bruxelles: 'brussels',
  bucuresti: 'bucharest',
  constantinople: 'istanbul',
  danzig: 'gdansk',
  kharkov: 'kharkiv',
  kobenhavn: 'copenhagen',
  lisboa: 'lisbon',
  moskva: 'moscow',
  munchen: 'munich',
  petrograd: 'petersburg',
  roma: 'rome',
  smyrna: 'izmir',
  venezia: 'venice',
  warszawa: 'warsaw',
  wien: 'vienna',
  wilno: 'vilnius',
  zagrab: 'zagreb',
};

export function migrateCityId(id: string): string {
  return LEGACY_CITY_IDS[id] ?? id;
}

/** Route ids are `<city>_<city>[_<track>]` with the two city ids in alphabetical order. */
export function migrateRouteId(id: string): string {
  const parts = id.split('_');
  if (parts.length < 2 || parts.length > 3) return id;
  const [a, b] = [migrateCityId(parts[0]), migrateCityId(parts[1])].sort();
  return parts.length === 3 ? `${a}_${b}_${parts[2]}` : `${a}_${b}`;
}

interface LegacyTicket {
  from: string;
  to: string;
  points: number;
}

/** Old ticket ids read `<city>_<city>_<n>pts`. */
export function parseLegacyTicketId(id: string): LegacyTicket | null {
  const m = /^([a-z]+)_([a-z]+)_(\d+)pts$/.exec(id);
  if (!m) return null;
  return { from: migrateCityId(m[1]), to: migrateCityId(m[2]), points: Number(m[3]) };
}

const isLong = (points: number) => points >= 18;

/** Picks a new ticket for an old one: same city pair first, then same kind with the closest points. */
function pickReplacement(old: LegacyTicket, used: Set<string>): DestinationTicket | null {
  const free = TICKETS.filter((t) => !used.has(t.id));
  const samePair = free.find(
    (t) => (t.from === old.from && t.to === old.to) || (t.from === old.to && t.to === old.from),
  );
  if (samePair) return samePair;
  const sameKind = free.filter((t) => t.isLong === isLong(old.points));
  if (sameKind.length === 0) return null;
  return [...sameKind].sort((a, b) => Math.abs(a.points - old.points) - Math.abs(b.points - old.points) || a.id.localeCompare(b.id))[0];
}

function migrateLog(entry: StoredLogEntry): StoredLogEntry {
  if (!entry.detail) return entry;
  const detail = { ...entry.detail };
  if (typeof detail.routeId === 'string') detail.routeId = migrateRouteId(detail.routeId);
  if (typeof detail.cityId === 'string') detail.cityId = migrateCityId(detail.cityId);
  return { ...entry, detail };
}

/** True when every id in the match exists on the current board. */
export function isMatchOnCurrentBoard(match: MerLocalMatch): boolean {
  const s = match.state;
  const ticketsOk = (ids: unknown) => Array.isArray(ids) && ids.every((id) => TICKET_BY_ID.has(id));
  return (
    s.claims.every((c) => ROUTE_BY_ID.has(c.routeId)) &&
    s.stations.every((st) => CITY_BY_ID.has(st.cityId)) &&
    (!s.tunnelChallenge || ROUTE_BY_ID.has(s.tunnelChallenge.routeId)) &&
    ticketsOk(s.regularTicketDeck) &&
    ticketsOk(s.boxedTicketIds) &&
    s.players.every((p) => ticketsOk(p.ticketIds) && ticketsOk(p.pendingTicketIds))
  );
}

/** Converts a match saved by the retired app; returns null when it cannot be carried over. */
export function migrateLegacyMatch(raw: unknown): MerLocalMatch | null {
  try {
    const match = raw as MerLocalMatch;
    if (!match?.state || !Array.isArray(match.state.players) || !Array.isArray(match.log)) return null;
    const s = match.state;
    // Pass 1 keeps every ticket that has an exact twin; pass 2 fills the rest from unused tickets,
    // so a replacement never steals a ticket another pile still holds.
    const piles: string[][] = [
      ...s.players.flatMap((p) => [p.ticketIds ?? [], p.pendingTicketIds ?? []]),
      s.regularTicketDeck ?? [],
      s.boxedTicketIds ?? [],
    ];
    const used = new Set<string>();
    const out: (string | null)[][] = piles.map((pile) =>
      pile.map((id) => {
        const old = TICKET_BY_ID.has(id) ? null : parseLegacyTicketId(id);
        const twin = TICKET_BY_ID.has(id)
          ? TICKET_BY_ID.get(id)!
          : old && TICKETS.find((t) => (t.from === old.from && t.to === old.to) || (t.from === old.to && t.to === old.from));
        if (!twin || used.has(twin.id)) return null;
        used.add(twin.id);
        return twin.id;
      }),
    );
    for (let i = 0; i < piles.length; i++) {
      for (let j = 0; j < piles[i].length; j++) {
        if (out[i][j] !== null) continue;
        const old = parseLegacyTicketId(piles[i][j]);
        const next = old && pickReplacement(old, used);
        if (!next) return null;
        used.add(next.id);
        out[i][j] = next.id;
      }
    }
    const mapped = out as string[][];
    const players = s.players.map((p, i) => ({ ...p, ticketIds: mapped[i * 2], pendingTicketIds: mapped[i * 2 + 1] }));
    const regularTicketDeck = mapped[s.players.length * 2];
    const boxedTicketIds = mapped[s.players.length * 2 + 1];
    const next: MerLocalMatch = {
      ...match,
      state: {
        ...s,
        players,
        claims: s.claims.map((c) => ({ ...c, routeId: migrateRouteId(c.routeId) })),
        stations: s.stations.map((st) => ({ ...st, cityId: migrateCityId(st.cityId) })),
        tunnelChallenge: s.tunnelChallenge
          ? { ...s.tunnelChallenge, routeId: migrateRouteId(s.tunnelChallenge.routeId) }
          : null,
        regularTicketDeck,
        boxedTicketIds,
      },
      log: match.log.map(migrateLog),
    };
    return isMatchOnCurrentBoard(next) ? next : null;
  } catch {
    return null;
  }
}
