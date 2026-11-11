import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { APP_REGISTRY, WorkspaceAppEntry, getAppById } from './apps/registry.ts';
import { AppErrorBoundary } from './shell/AppErrorBoundary.tsx';
import { HomeHub } from './shell/HomeHub.tsx';
import { IframeAppHost } from './shell/IframeAppHost.tsx';
import {
  buildAppUrl,
  buildHomeUrl,
  buildIframeEntryUrl,
  parseAppIdFromLocation,
} from './shell/router.ts';

const VALID_APP_IDS = APP_REGISTRY.map((app) => app.id);

function readActiveAppIdFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  return parseAppIdFromLocation(
    window.location.search,
    window.location.hash,
    window.location.pathname,
    VALID_APP_IDS,
  );
}

const lazyComponentCache = new Map<
  string,
  React.LazyExoticComponent<React.ComponentType>
>();

function getLazyAppComponent(
  entry: WorkspaceAppEntry,
): React.LazyExoticComponent<React.ComponentType> | null {
  if (!entry.loader) return null;
  let cached = lazyComponentCache.get(entry.id);
  if (!cached) {
    cached = React.lazy(entry.loader);
    lazyComponentCache.set(entry.id, cached);
  }
  return cached;
}

const AppLoadingView: React.FC<{ title: string }> = ({ title }) => (
  <div className="w-full h-full flex items-center justify-center bg-[#090b0e]">
    <div className="text-center space-y-2">
      <div className="text-xs font-mono-num uppercase tracking-widest text-[#f59e0b]">
        LOADING MODULE
      </div>
      <div className="font-display text-2xl font-bold text-slate-100">{title}</div>
    </div>
  </div>
);

export default function App() {
  const [activeAppId, setActiveAppId] = useState<string | null>(() =>
    readActiveAppIdFromWindow(),
  );
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveAppId(readActiveAppIdFromWindow());
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  const activeApp = useMemo(() => getAppById(activeAppId), [activeAppId]);

  useEffect(() => {
    document.title = activeApp
      ? `${activeApp.title} // gaistudio`
      : 'gaistudio // Unified WebApp Workspace';
  }, [activeApp]);

  const handleLaunchApp = useCallback((appId: string) => {
    const targetUrl = buildAppUrl(window.location.href, appId, VALID_APP_IDS);
    window.history.pushState({ appId }, '', targetUrl);
    setActiveAppId(appId);
    setReloadToken(0);
  }, []);

  const handleBackToHub = useCallback(() => {
    const homeUrl = buildHomeUrl(window.location.href, VALID_APP_IDS);
    window.history.pushState({ appId: null }, '', homeUrl);
    setActiveAppId(null);
    setReloadToken(0);
  }, []);

  if (!activeApp) {
    return <HomeHub apps={APP_REGISTRY} onLaunchApp={handleLaunchApp} />;
  }

  const LazyComponent =
    activeApp.kind === 'react-lazy' ? getLazyAppComponent(activeApp) : null;

  const iframeUrl =
    activeApp.kind === 'iframe' && activeApp.entryPath
      ? buildIframeEntryUrl(activeApp.entryPath, window.location.href, VALID_APP_IDS)
      : null;

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-[#090b0e]">
      {/* Slim Unified Shell Navigation Bar */}
      <header className="h-11 shrink-0 px-3 sm:px-4 bg-[#0b0e13] border-b border-slate-800/90 flex items-center justify-between gap-2 z-50">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            data-testid="back-to-hub"
            onClick={handleBackToHub}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#141923] hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>首页</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-lg font-bold tracking-wide text-white truncate">
              {activeApp.title}
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-[#121721] border border-slate-800 text-[10px] font-mono-num text-slate-400 shrink-0">
              {activeApp.techLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="reload-active-app"
            onClick={() => setReloadToken((n) => n + 1)}
            title="重新加载当前应用"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#141923] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono-num text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span className="hidden sm:inline">重载</span>
          </button>
        </div>
      </header>

      {/* Isolated App Viewport */}
      <div className="flex-1 relative min-h-0 w-full overflow-hidden">
        <AppErrorBoundary
          key={`${activeApp.id}::${reloadToken}`}
          appTitle={activeApp.title}
          onBackToHub={handleBackToHub}
        >
          {activeApp.kind === 'react-lazy' && LazyComponent && (
            <Suspense fallback={<AppLoadingView title={activeApp.title} />}>
              <LazyComponent key={`${activeApp.id}::${reloadToken}`} />
            </Suspense>
          )}
          {activeApp.kind === 'iframe' && iframeUrl && (
            <IframeAppHost
              title={activeApp.title}
              src={iframeUrl}
              reloadToken={reloadToken}
            />
          )}
        </AppErrorBoundary>
      </div>
    </div>
  );
}
