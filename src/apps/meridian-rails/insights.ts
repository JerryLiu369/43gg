import {
  CARD_COLORS,
  TRAIN_CARD_COLORS,
  ownerByRoute,
  validateRouteAvailability,
  type CardColor,
  type CardCounts,
  type ClaimedRouteRef,
  type DestinationTicket,
  type RouteDefinition,
  type TrainCardColor,
} from './engine.ts';
import type { SoundName } from './sound.ts';
import type { StoredLogEntry } from './types.ts';
import { CARD_COLOR_NAME, CITIES, ROUTES, ROUTE_BY_ID } from './data.ts';

export function sortedHand(hand: CardCounts): [TrainCardColor, number][] {
  return TRAIN_CARD_COLORS.map((color) => [color, hand[color] ?? 0] as [TrainCardColor, number]).filter(
    ([, count]) => count > 0,
  );
}

export interface RouteShortfall {
  affordable: boolean;
  missing: number;
  bestColor: CardColor | null;
  trainsShort: boolean;
  message: string;
}

export function routeShortfall(route: RouteDefinition, hand: CardCounts, trainsRemaining: number): RouteShortfall {
  const locomotives = hand.LOCOMOTIVE ?? 0;
  const colors: readonly CardColor[] = route.color === 'GRAY' ? CARD_COLORS : [route.color];
  const colorSlots = route.length - route.requiredLocomotives;
  let best: { missing: number; color: CardColor | null; have: number } = {
    missing: Math.max(0, route.length - locomotives),
    color: null,
    have: 0,
  };
  for (const color of colors) {
    const have = hand[color] ?? 0;
    const used = Math.min(have, colorSlots);
    const missing = Math.max(0, route.length - used - locomotives);
    if (missing < best.missing || (missing === best.missing && have > best.have)) {
      best = { missing, color: have > 0 ? color : best.color, have };
    }
  }
  const trainsShort = trainsRemaining < route.length;
  let message: string;
  if (trainsShort) {
    message = `剩余车厢不足：这条路线需要 ${route.length} 节，你只剩 ${trainsRemaining} 节。`;
  } else if (best.missing === 0) {
    message = '手牌足够，可以占领。';
  } else {
    const colorText =
      route.color === 'GRAY'
        ? best.color
          ? `${CARD_COLOR_NAME[best.color]}牌`
          : '任意一种颜色的牌'
        : `${CARD_COLOR_NAME[route.color]}牌`;
    message = `还差 ${best.missing} 张${colorText}（万能牌可代替任何颜色）。`;
    if (route.requiredLocomotives > locomotives) {
      message += `渡轮至少需要 ${route.requiredLocomotives} 张万能牌。`;
    }
  }
  return {
    affordable: !trainsShort && best.missing === 0,
    missing: trainsShort ? 0 : best.missing,
    bestColor: best.color,
    trainsShort,
    message,
  };
}

export interface TicketPlan {
  connected: boolean;
  reachable: boolean;
  trainsNeeded: number;
  routeIds: string[];
}

const ADJACENCY: ReadonlyMap<string, readonly RouteDefinition[]> = (() => {
  const map = new Map<string, RouteDefinition[]>();
  for (const route of ROUTES) {
    for (const city of [route.city1, route.city2]) {
      const list = map.get(city) ?? [];
      list.push(route);
      map.set(city, list);
    }
  }
  return map;
})();

export function planTicket(
  ticket: Pick<DestinationTicket, 'from' | 'to'>,
  claims: readonly ClaimedRouteRef[],
  playerId: string,
  playerCount: number,
): TicketPlan {
  const owners = ownerByRoute(claims);
  const dist = new Map<string, number>([[ticket.from, 0]]);
  const via = new Map<string, RouteDefinition>();
  const done = new Set<string>();
  while (true) {
    let current: string | null = null;
    let currentDist = Infinity;
    for (const [city, d] of dist) {
      if (!done.has(city) && d < currentDist) {
        current = city;
        currentDist = d;
      }
    }
    if (current === null || current === ticket.to) break;
    done.add(current);
    for (const route of ADJACENCY.get(current) ?? []) {
      const owner = owners.get(route.id);
      let cost: number;
      if (owner === playerId) cost = 0;
      else if (validateRouteAvailability(route, playerId, playerCount, owners)) continue;
      else cost = route.length;
      const next = route.city1 === current ? route.city2 : route.city1;
      const candidate = currentDist + cost;
      if (candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        via.set(next, route);
      }
    }
  }
  const total = dist.get(ticket.to);
  if (total === undefined) return { connected: false, reachable: false, trainsNeeded: 0, routeIds: [] };
  const routeIds: string[] = [];
  let city = ticket.to;
  while (city !== ticket.from) {
    const route = via.get(city);
    if (!route) break;
    if (owners.get(route.id) !== playerId) routeIds.push(route.id);
    city = route.city1 === city ? route.city2 : route.city1;
  }
  return { connected: total === 0, reachable: true, trainsNeeded: total, routeIds: routeIds.reverse() };
}

export interface SoundCue {
  name: SoundName;
  length?: number;
}

export function soundForLog(entry: Pick<StoredLogEntry, 'actionType' | 'detail'>): SoundCue | null {
  const detail = entry.detail ?? {};
  const route = typeof detail.routeId === 'string' ? ROUTE_BY_ID.get(detail.routeId) : undefined;
  switch (entry.actionType) {
    case 'DRAW_TRAIN_CARD':
      return { name: 'cardDraw' };
    case 'CLAIM_ROUTE':
      if (typeof detail.surcharge === 'number' && detail.surcharge > 0) return { name: 'tunnelReveal' };
      return { name: 'claim', length: route?.length };
    case 'CONFIRM_TUNNEL':
      return { name: 'claim', length: route?.length };
    case 'CANCEL_TUNNEL':
      return { name: 'tunnelFail' };
    case 'BUILD_STATION':
      return { name: 'station' };
    case 'DRAW_TICKETS':
      return { name: 'ticketDraw' };
    case 'CHOOSE_TICKETS':
    case 'CHOOSE_INITIAL_TICKETS':
      return { name: 'ticketKeep' };
    case 'TIMEOUT_PASS':
      return { name: 'notify' };
    case 'START_GAME':
      return { name: 'gameStart' };
    default:
      return null;
  }
}

export function boardTargetsForLog(entry: Pick<StoredLogEntry, 'actionType' | 'detail'>): {
  routeId: string | null;
  cityId: string | null;
} {
  const detail = entry.detail ?? {};
  const routeId =
    (entry.actionType === 'CLAIM_ROUTE' || entry.actionType === 'CONFIRM_TUNNEL') &&
    typeof detail.routeId === 'string'
      ? detail.routeId
      : null;
  const cityId = entry.actionType === 'BUILD_STATION' && typeof detail.cityId === 'string' ? detail.cityId : null;
  return { routeId, cityId };
}

export interface MapBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export const CITY_BOUNDS: MapBounds = (() => {
  const xs = CITIES.map((city) => city.boardX);
  const ys = CITIES.map((city) => city.boardY);
  const pad = 30;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY };
})();
