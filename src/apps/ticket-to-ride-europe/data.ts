import rawCities from './data/cities.json' with { type: 'json' };
import rawRoutes from './data/routes.json' with { type: 'json' };
import rawTickets from './data/tickets.json' with { type: 'json' };
import palette from './assets/palette.json' with { type: 'json' };
import {
  buildDefinitions,
  toCityDefinition,
  toDestinationTicket,
  toRouteDefinition,
  type CityDefinition,
  type DestinationTicket,
  type GameDefinitions,
  type PlayerColor,
  type RawCityRecord,
  type RawRouteRecord,
  type RawTicketRecord,
  type RouteColor,
  type RouteDefinition,
  type TrainCardColor,
} from './engine.ts';

const cityRecords = rawCities as RawCityRecord[];
const routeRecords = rawRoutes as RawRouteRecord[];
const ticketDoc = rawTickets as {
  long_routes: RawTicketRecord[];
  regular_routes: RawTicketRecord[];
};

export const CITIES: readonly CityDefinition[] = cityRecords.map(toCityDefinition);
export const ROUTES: readonly RouteDefinition[] = routeRecords.map(toRouteDefinition);
export const TICKETS: readonly DestinationTicket[] = [
  ...ticketDoc.long_routes,
  ...ticketDoc.regular_routes,
].map(toDestinationTicket);

export const CITY_BY_ID: ReadonlyMap<string, CityDefinition> = new Map(CITIES.map((c) => [c.id, c]));
export const ROUTE_BY_ID: ReadonlyMap<string, RouteDefinition> = new Map(ROUTES.map((r) => [r.id, r]));
export const TICKET_BY_ID: ReadonlyMap<string, DestinationTicket> = new Map(TICKETS.map((t) => [t.id, t]));

export const DEFS: GameDefinitions = buildDefinitions(cityRecords, routeRecords, [
  ...ticketDoc.long_routes,
  ...ticketDoc.regular_routes,
]);

export const PLAYER_COLOR_HEX: Readonly<Record<PlayerColor, string>> = {
  RED: palette.playerColors.red.fill,
  BLUE: palette.playerColors.blue.fill,
  GREEN: palette.playerColors.green.fill,
  YELLOW: palette.playerColors.yellow.fill,
  BLACK: palette.playerColors.black.fill,
};

export const PLAYER_COLOR_SOFT: Readonly<Record<PlayerColor, string>> = {
  RED: '#ffb4a8',
  BLUE: '#9ecbff',
  GREEN: '#a7e9a0',
  YELLOW: '#ffe680',
  BLACK: '#aab7bd',
};

export const PLAYER_COLOR_NAME: Readonly<Record<PlayerColor, string>> = {
  RED: '红',
  BLUE: '蓝',
  GREEN: '绿',
  YELLOW: '黄',
  BLACK: '黑',
};

export const ROUTE_COLOR_HEX: Readonly<Record<RouteColor, string>> = {
  PURPLE: palette.cardColors.purple.hex,
  WHITE: palette.cardColors.white.hex,
  BLUE: palette.cardColors.blue.hex,
  YELLOW: palette.cardColors.yellow.hex,
  ORANGE: palette.cardColors.orange.hex,
  BLACK: palette.cardColors.black.hex,
  RED: palette.cardColors.red.hex,
  GREEN: palette.cardColors.green.hex,
  GRAY: palette.cardColors.gray.hex,
};

export const TRAIN_CARD_HEX: Readonly<Record<TrainCardColor, string>> = {
  PURPLE: palette.cardColors.purple.hex,
  WHITE: palette.cardColors.white.hex,
  BLUE: palette.cardColors.blue.hex,
  YELLOW: palette.cardColors.yellow.hex,
  ORANGE: palette.cardColors.orange.hex,
  BLACK: palette.cardColors.black.hex,
  RED: palette.cardColors.red.hex,
  GREEN: palette.cardColors.green.hex,
  LOCOMOTIVE: palette.cardColors.locomotive.hex,
};

export const CARD_COLOR_NAME: Readonly<Record<TrainCardColor, string>> = {
  PURPLE: '紫色',
  WHITE: '白色',
  BLUE: '蓝色',
  YELLOW: '黄色',
  ORANGE: '橙色',
  BLACK: '黑色',
  RED: '红色',
  GREEN: '绿色',
  LOCOMOTIVE: '火车头',
};

export const ROUTE_COLOR_NAME: Readonly<Record<RouteColor, string>> = {
  ...CARD_COLOR_NAME,
  GRAY: '灰色',
} as Readonly<Record<RouteColor, string>>;

export function cityName(id: string, zh = true): string {
  const c = CITY_BY_ID.get(id);
  return c ? (zh ? c.nameZh : c.name) : id;
}

export function ticketTitle(ticket: DestinationTicket, zh = true): string {
  return `${cityName(ticket.from, zh)} → ${cityName(ticket.to, zh)}`;
}

export function routeTitle(route: RouteDefinition, zh = true): string {
  return `${cityName(route.city1, zh)} → ${cityName(route.city2, zh)}`;
}

export function routeTypeLabel(route: RouteDefinition): string {
  if (route.type === 'FERRY') return `渡轮 · ${route.requiredLocomotives} 火车头`;
  if (route.type === 'TUNNEL') return '隧道';
  return '普通路线';
}

export const ROUTE_LENGTH_POINTS: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  6: 15,
  8: 21,
};

export function seatColorName(color: PlayerColor): string {
  return `${PLAYER_COLOR_NAME[color]}色`;
}
