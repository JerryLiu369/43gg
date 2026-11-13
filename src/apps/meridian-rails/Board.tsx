import { useEffect, useRef } from 'react';
import boardMapSvg from './assets/board-map.svg?raw';
import type { PublicGameState } from './engine.ts';
import {
  CITY_BY_ID,
  PLAYER_COLOR_HEX,
  ROUTE_BY_ID,
  ROUTE_COLOR_NAME,
  cityName,
  routeTitle,
  routeTypeLabel,
} from './data.ts';

export interface BoardProps {
  pub: PublicGameState;
  interactive: boolean;
  selectableRouteIds: ReadonlySet<string>;
  dimmedRouteIds: ReadonlySet<string>;
  selectableCityIds: ReadonlySet<string>;
  selectedRouteId: string | null;
  stationMode: boolean;
  pathRouteIds?: ReadonlySet<string>;
  endpointCityIds?: ReadonlySet<string>;
  recentRouteIds?: ReadonlySet<string>;
  recentCityIds?: ReadonlySet<string>;
  showAffordable?: boolean;
  onRouteClick: (routeId: string) => void;
  onCityClick: (cityId: string) => void;
  onRouteHover?: (routeId: string | null) => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export function Board({
  pub,
  interactive,
  selectableRouteIds,
  dimmedRouteIds,
  selectableCityIds,
  selectedRouteId,
  stationMode,
  pathRouteIds = EMPTY,
  endpointCityIds = EMPTY,
  recentRouteIds = EMPTY,
  recentCityIds = EMPTY,
  showAffordable = false,
  onRouteClick,
  onCityClick,
  onRouteHover,
}: BoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  const handlers = useRef({ onRouteClick, onCityClick, onRouteHover });
  useEffect(() => {
    handlers.current = { onRouteClick, onCityClick, onRouteHover };
  }, [onRouteClick, onCityClick, onRouteHover]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = boardMapSvg;
    const root = host.querySelector<SVGSVGElement>('svg');
    if (!root) return;

    const activate = (target: Element) => {
      const route = target.closest<SVGGElement>('g.board-route');
      if (route?.dataset.routeId) {
        handlers.current.onRouteClick(route.dataset.routeId);
        return;
      }
      const city = target.closest<SVGGElement>('g.city-node');
      if (city?.dataset.cityId) handlers.current.onCityClick(city.dataset.cityId);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      activate(target);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as Element | null;
      if (!target || !target.closest('.board-route, .city-node')) return;
      event.preventDefault();
      activate(target);
    };
    const onOver = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const route = target?.closest<SVGGElement>('g.board-route');
      if (route?.dataset.routeId) handlers.current.onRouteHover?.(route.dataset.routeId);
      const city = target?.closest<SVGGElement>('g.city-node');
      if (city?.dataset.cityId) handlers.current.onRouteHover?.(null);
    };
    const onLeave = () => handlers.current.onRouteHover?.(null);

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseleave', onLeave);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useEffect(() => {
    const root = hostRef.current?.querySelector<SVGSVGElement>('svg');
    if (!root) return;
    const playerById = new Map(pub.players.map((player) => [player.id, player]));
    const routeOwner = new Map<string, string>();
    for (const claim of pub.claims) {
      const player = playerById.get(claim.ownerPlayerId);
      if (player) routeOwner.set(claim.routeId, PLAYER_COLOR_HEX[player.color]);
    }
    const stationOwner = new Map<string, string>();
    for (const station of pub.stations) {
      const player = playerById.get(station.ownerPlayerId);
      if (player) stationOwner.set(station.cityId, PLAYER_COLOR_HEX[player.color]);
    }

    for (const group of root.querySelectorAll<SVGGElement>('g.board-route')) {
      const id = group.dataset.routeId;
      if (!id) continue;
      const route = ROUTE_BY_ID.get(id);
      const ownerColor = routeOwner.get(id);
      const claimed = ownerColor !== undefined;
      group.classList.toggle('is-claimed', claimed);
      group.style.color = ownerColor ?? '';
      group.classList.toggle('is-dimmed', !claimed && dimmedRouteIds.has(id));
      group.classList.toggle('is-selected', id === selectedRouteId);
      group.classList.toggle('is-affordable', !claimed && selectableRouteIds.has(id));
      group.classList.toggle('is-path', pathRouteIds.has(id));
      group.classList.toggle('is-recent', recentRouteIds.has(id));
      group.setAttribute('tabindex', interactive && !claimed ? '0' : '-1');
      group.setAttribute('role', 'button');
      if (route) {
        group.setAttribute(
          'aria-label',
          `${routeTitle(route)}，${ROUTE_COLOR_NAME[route.color]}，${route.length} 格，${route.points} 分，${routeTypeLabel(route)}${claimed ? '，已被占领' : ''}`,
        );
      }
    }

    for (const group of root.querySelectorAll<SVGGElement>('g.city-node')) {
      const id = group.dataset.cityId;
      if (!id) continue;
      const color = stationOwner.get(id);
      const city = CITY_BY_ID.get(id);
      group.classList.toggle('has-station', color !== undefined);
      group.style.color = color ?? '';
      group.classList.toggle('is-station-target', interactive && stationMode && selectableCityIds.has(id));
      group.classList.toggle('is-endpoint', endpointCityIds.has(id));
      group.classList.toggle('is-recent', recentCityIds.has(id));
      group.setAttribute('tabindex', interactive ? '0' : '-1');
      group.setAttribute('role', 'button');
      group.setAttribute(
        'aria-label',
        `${city?.nameZh ?? id}${city?.name ? ` (${city.name})` : ''}${color ? '，已有车站' : stationMode && selectableCityIds.has(id) ? '，可以建造车站' : ''}`,
      );
    }

  }, [
    pub,
    interactive,
    selectableRouteIds,
    dimmedRouteIds,
    selectableCityIds,
    selectedRouteId,
    stationMode,
    pathRouteIds,
    endpointCityIds,
    recentRouteIds,
    recentCityIds,
  ]);

  useEffect(() => {
    const stage = hostRef.current?.closest('.board-stage');
    stage?.classList.toggle('show-affordable', showAffordable);
    return () => stage?.classList.remove('show-affordable');
  }, [showAffordable]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="board-host h-full w-full" aria-label="欧陆线路版图" />
    </div>
  );
}
