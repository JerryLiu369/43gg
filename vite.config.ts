import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.join(ROOT_DIR, 'apps');

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const SKIP_COPY_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.DS_Store',
]);

function isBlockedFileName(name: string): boolean {
  if (name.startsWith('.env')) return true;
  if (name.endsWith('.md')) return true;
  return SKIP_COPY_NAMES.has(name);
}

function copyDirFiltered(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, {recursive: true});
  for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
    if (isBlockedFileName(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function serveStaticAppRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const rawUrl = req.url || '/';
  const parsed = new URL(rawUrl, 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    next();
    return;
  }

  const rel = pathname.replace(/^\/+/, '');
  if (!rel) {
    next();
    return;
  }

  const candidate = path.resolve(APPS_DIR, rel);
  if (candidate !== APPS_DIR && !candidate.startsWith(APPS_DIR + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const parts = rel.split('/');
  if (parts.some((segment) => segment.startsWith('.env') || SKIP_COPY_NAMES.has(segment))) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.statusCode = 302;
      res.setHeader('Location', `/apps/${rel}/${parsed.search}`);
      res.end();
      return;
    }
    const indexPath = path.join(candidate, 'index.html');
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES['.html']);
      res.end(fs.readFileSync(indexPath));
      return;
    }
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    const ext = path.extname(candidate).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(candidate));
    return;
  }

  next();
}

function workspaceStaticAppsPlugin(): Plugin {
  let isBuild = false;
  let outDir = path.join(ROOT_DIR, 'dist');

  return {
    name: 'workspace-static-apps',
    configResolved(config) {
      isBuild = config.command === 'build';
      outDir = path.resolve(ROOT_DIR, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/apps', serveStaticAppRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/apps', (req, res, next) => {
        const rawUrl = req.url || '/';
        const parsed = new URL(rawUrl, 'http://127.0.0.1');
        const rel = parsed.pathname.replace(/^\/+/, '');
        if (rel && !parsed.pathname.endsWith('/')) {
          const builtDir = path.resolve(outDir, 'apps', rel);
          if (
            builtDir.startsWith(path.join(outDir, 'apps') + path.sep) &&
            fs.existsSync(builtDir) &&
            fs.statSync(builtDir).isDirectory()
          ) {
            res.statusCode = 302;
            res.setHeader('Location', `/apps/${rel}/${parsed.search}`);
            res.end();
            return;
          }
        }
        next();
      });
    },
    closeBundle() {
      if (!isBuild || !fs.existsSync(APPS_DIR)) return;
      const destAppsDir = path.join(outDir, 'apps');
      for (const entry of fs.readdirSync(APPS_DIR, {withFileTypes: true})) {
        if (!entry.isDirectory() || SKIP_COPY_NAMES.has(entry.name)) continue;
        const appDir = path.join(APPS_DIR, entry.name);
        if (!fs.existsSync(path.join(appDir, 'index.html'))) continue;
        copyDirFiltered(appDir, path.join(destAppsDir, entry.name));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    // Relative base works identically at root `/` (AI Studio / local dev & preview)
    // and under `/gaistudio/` (GitHub Pages project site).
    base: './',
    plugins: [react(), tailwindcss(), workspaceStaticAppsPlugin()],
    resolve: {
      alias: {
        '@': ROOT_DIR,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
