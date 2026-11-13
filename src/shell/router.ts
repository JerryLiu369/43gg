/**
 * Reads the active app id from a location. `aliases` maps retired ids to current ids
 * (see APP_ID_ALIASES); a match on an alias returns the current id.
 */
export function parseAppIdFromLocation(
  search: string,
  hash: string,
  pathname: string,
  validIds: ReadonlyArray<string>,
  aliases: Readonly<Record<string, string>> = {},
): string | null {
  const live = new Set(validIds.map((id) => id.toLowerCase()));
  const resolve = (raw: string): string | null => {
    const id = raw.toLowerCase();
    if (live.has(id)) return id;
    const target = aliases[id];
    return target && live.has(target) ? target : null;
  };
  const validSet = { has: (raw: string) => resolve(raw) !== null };

  // 1. Canonical query parameter: ?app=<id>
  try {
    const params = new URLSearchParams(search);
    const queryApp = params.get('app')?.trim().toLowerCase();
    if (queryApp && validSet.has(queryApp)) {
      return resolve(queryApp);
    }
  } catch {
    // Ignore malformed search query
  }

  // 2. Hash route fallback: #/apps/<id>, #/app/<id>, or #<id>
  if (hash) {
    const cleanedHash = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
    const hashParts = cleanedHash.split('/').filter(Boolean);
    if (hashParts.length === 1 && validSet.has(hashParts[0])) {
      return resolve(hashParts[0]);
    }
    if (
      hashParts.length === 2 &&
      (hashParts[0] === 'app' || hashParts[0] === 'apps') &&
      validSet.has(hashParts[1])
    ) {
      return resolve(hashParts[1]);
    }
  }

  // 3. Pathname fallback (useful in dev server SPA fallback, e.g. /app/<id>)
  const pathParts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    const last = pathParts[pathParts.length - 1].toLowerCase();
    const prev = pathParts[pathParts.length - 2].toLowerCase();
    if ((prev === 'app' || prev === 'apps') && validSet.has(last)) {
      return resolve(last);
    }
  }

  return null;
}

function resolveBasePathname(pathname: string, validIds: ReadonlyArray<string>): string {
  const validSet = new Set(validIds.map((id) => id.toLowerCase()));
  const trimmed = pathname.replace(/\/+$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    const prev = parts[parts.length - 2].toLowerCase();
    if ((prev === 'app' || prev === 'apps') && validSet.has(last)) {
      const prefix = parts.slice(0, -2).join('/');
      return prefix ? `/${prefix}/` : '/';
    }
  }
  if (pathname.endsWith('/index.html')) {
    return pathname.slice(0, -'index.html'.length);
  }
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

export function buildAppUrl(
  currentHref: string,
  appId: string,
  validIds: ReadonlyArray<string> = [],
): string {
  const url = new URL(currentHref);
  url.pathname = resolveBasePathname(url.pathname, validIds);
  url.searchParams.set('app', appId);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export function buildHomeUrl(
  currentHref: string,
  validIds: ReadonlyArray<string> = [],
): string {
  const url = new URL(currentHref);
  url.pathname = resolveBasePathname(url.pathname, validIds);
  url.searchParams.delete('app');
  url.searchParams.delete('autostart');
  url.searchParams.delete('stage');
  url.searchParams.delete('cam');
  url.searchParams.delete('auto');
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export function buildIframeEntryUrl(
  entryPath: string,
  currentHref: string,
  validIds: ReadonlyArray<string> = [],
): string {
  const currentUrl = new URL(currentHref);
  const basePath = resolveBasePathname(currentUrl.pathname, validIds);
  const normalizedEntry = entryPath.replace(/^\/+/, '');
  const target = new URL(normalizedEntry, `${currentUrl.origin}${basePath}`);

  currentUrl.searchParams.forEach((value, key) => {
    if (key !== 'app') {
      target.searchParams.set(key, value);
    }
  });

  // Also forward query params encoded in hash route (e.g. #/apps/ds-stage?stage=kettle)
  const hashQueryIdx = currentUrl.hash.indexOf('?');
  if (hashQueryIdx >= 0) {
    const hashParams = new URLSearchParams(currentUrl.hash.slice(hashQueryIdx + 1));
    hashParams.forEach((value, key) => {
      if (key !== 'app') {
        target.searchParams.set(key, value);
      }
    });
  }

  return target.toString();
}
