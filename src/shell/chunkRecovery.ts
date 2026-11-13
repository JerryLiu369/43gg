/**
 * Recovers from stale code-split chunks after a redeploy.
 *
 * Every deploy replaces the hashed files under `assets/`. A visitor whose browser still holds the
 * previous `index.html` / entry bundle (GitHub Pages serves HTML with `max-age=600`, and open tabs
 * never refresh on their own) will request chunk names that no longer exist, and the dynamic
 * import fails with "Failed to fetch dynamically imported module".
 *
 * On such a failure we reload the page once, which re-fetches the current `index.html` and the
 * matching chunk names. A sessionStorage flag prevents reload loops when the failure is real
 * (offline, server down): the second failure is rethrown to the error boundary.
 */

export const CHUNK_RELOAD_FLAG_KEY = '43gg.shell.chunk_reload.v1';

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite CSS preload
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export interface ChunkRecoveryEnv {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  reload: () => void;
}

export function withChunkRecovery<T>(
  loader: () => Promise<T>,
  env: ChunkRecoveryEnv,
): () => Promise<T> {
  return async () => {
    try {
      const mod = await loader();
      try {
        env.storage?.removeItem(CHUNK_RELOAD_FLAG_KEY);
      } catch {
        // Storage unavailable; nothing to clear.
      }
      return mod;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      let alreadyReloaded = true;
      try {
        alreadyReloaded = env.storage?.getItem(CHUNK_RELOAD_FLAG_KEY) === '1';
        if (!alreadyReloaded) env.storage?.setItem(CHUNK_RELOAD_FLAG_KEY, '1');
      } catch {
        // Without storage we cannot guard against loops, so do not auto-reload.
        alreadyReloaded = true;
      }
      if (alreadyReloaded || !env.storage) throw error;

      env.reload();
      // Keep Suspense showing the loading view while the page reloads.
      return new Promise<T>(() => {});
    }
  };
}
