#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT_DIR, 'apps');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT_DIR, filePath)}: ${err.message}`);
  }
}

function extractHtmlTitle(htmlPath) {
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function discoverApps() {
  const projects = [];

  const rootPkg = readJsonIfExists(path.join(ROOT_DIR, 'package.json'));
  const rootMeta = readJsonIfExists(path.join(ROOT_DIR, 'metadata.json'));
  const rootTitle = rootMeta?.name || extractHtmlTitle(path.join(ROOT_DIR, 'index.html')) || rootPkg?.name || 'root';
  projects.push({
    slug: 'chrono-stage (root)',
    dir: '.',
    absDir: ROOT_DIR,
    type: rootPkg?.scripts?.build ? 'vite-react-ts' : 'node-app',
    title: rootTitle,
    runCmd: 'npm run dev',
    pagesPath: '/ (legacy gh-pages)',
    isRoot: true,
  });

  if (fs.existsSync(APPS_DIR)) {
    const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absDir = path.join(APPS_DIR, entry.name);
      const pkg = readJsonIfExists(path.join(absDir, 'package.json'));
      const meta = readJsonIfExists(path.join(absDir, 'metadata.json'));
      const hasIndex = fs.existsSync(path.join(absDir, 'index.html'));
      const title = meta?.name || extractHtmlTitle(path.join(absDir, 'index.html')) || pkg?.name || entry.name;
      const type = pkg ? (pkg.scripts?.build ? 'vite/node-pkg' : 'node-pkg') : (hasIndex ? 'static-html' : 'unknown');
      const runCmd = pkg?.scripts?.dev
        ? `npm --prefix apps/${entry.name} run dev`
        : hasIndex
          ? `node scripts/workspace.mjs serve ${entry.name}`
          : '(no runnable entry)';
      const pagesPath = entry.name === 'ds-stage' ? '/ds/ (legacy gh-pages)' : '-';

      projects.push({
        slug: entry.name,
        dir: `apps/${entry.name}`,
        absDir,
        type,
        title,
        runCmd,
        pagesPath,
        isRoot: false,
      });
    }
  }

  return projects;
}

function cmdList() {
  const projects = discoverApps();
  console.log('Projects in JerryLiu369/gaistudio:\n');
  for (const p of projects) {
    console.log(`- ${p.slug}`);
    console.log(`  Path:   ${p.dir}`);
    console.log(`  Title:  ${p.title}`);
    console.log(`  Type:   ${p.type}`);
    console.log(`  Run:    ${p.runCmd}`);
    console.log(`  Pages:  ${p.pagesPath}`);
  }
}

function walkFiles(dir, extFilter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, extFilter));
    } else if (!extFilter || extFilter(full)) {
      out.push(full);
    }
  }
  return out;
}

function checkStaticHtmlAssets(appDir, htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const attrRegex = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;
  const missing = [];
  while ((match = attrRegex.exec(html)) !== null) {
    const ref = match[1].trim();
    if (
      !ref ||
      ref.startsWith('#') ||
      ref.startsWith('http://') ||
      ref.startsWith('https://') ||
      ref.startsWith('data:') ||
      ref.startsWith('mailto:') ||
      ref.startsWith('//')
    ) {
      continue;
    }
    const cleanRef = ref.split('?')[0].split('#')[0];
    const resolved = path.resolve(path.dirname(htmlPath), cleanRef.replace(/^\//, ''));
    if (!fs.existsSync(resolved)) {
      missing.push(ref);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing local asset references in ${path.relative(ROOT_DIR, htmlPath)}: ${missing.join(', ')}`);
  }
}

function checkNoTrackedEnvSecrets() {
  try {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const badEnv = tracked.filter((f) => {
      const base = path.basename(f);
      return base.startsWith('.env') && base !== '.env.example' && !base.endsWith('.example');
    });
    if (badEnv.length > 0) {
      throw new Error(`Tracked non-example env file(s) found: ${badEnv.join(', ')}`);
    }
  } catch (err) {
    if (err.message.includes('Tracked non-example env')) throw err;
  }
}

function runBin(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

function cmdCheck(argv) {
  const skipBuild = argv.includes('--quick');
  console.log('1) Checking tracked .env rules...');
  checkNoTrackedEnvSecrets();
  console.log('   OK: no tracked .env files outside *.example\n');

  const projects = discoverApps();
  console.log(`2) Discovered ${projects.length} project(s): ${projects.map((p) => p.slug).join(', ')}\n`);

  for (const p of projects) {
    if (p.isRoot) {
      for (const reqFile of ['index.html', 'package.json', 'metadata.json', 'vite.config.ts']) {
        if (!fs.existsSync(path.join(p.absDir, reqFile))) {
          throw new Error(`Root project missing required file: ${reqFile}`);
        }
      }
      console.log(`3) Validating root project (${p.title})...`);
      const tscBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsc');
      if (!fs.existsSync(tscBin)) {
        throw new Error('node_modules not installed at root. Run `npm install` first.');
      }
      runBin(tscBin, ['--noEmit'], ROOT_DIR);
      console.log('   OK: tsc --noEmit passed');
      runBin(process.execPath, ['--test', 'src/game/physics.test.ts'], ROOT_DIR);
      console.log('   OK: unit tests passed');
      if (!skipBuild) {
        const viteBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'vite');
        runBin(viteBin, ['build'], ROOT_DIR);
        console.log('   OK: root vite build passed\n');
      }
    } else {
      console.log(`4) Validating subproject ${p.dir}...`);
      const hasPkg = fs.existsSync(path.join(p.absDir, 'package.json'));
      const htmlPath = path.join(p.absDir, 'index.html');
      const hasHtml = fs.existsSync(htmlPath);
      if (!hasPkg && !hasHtml) {
        throw new Error(`Subproject ${p.dir} has neither index.html nor package.json`);
      }
      if (hasHtml && !hasPkg) {
        checkStaticHtmlAssets(p.absDir, htmlPath);
        console.log(`   OK: ${p.dir}/index.html asset references resolved`);
      }
      const jsFiles = walkFiles(p.absDir, (f) => f.endsWith('.js') || f.endsWith('.mjs'));
      for (const jsFile of jsFiles) {
        execFileSync(process.execPath, ['--check', jsFile], { cwd: p.absDir, stdio: 'pipe' });
      }
      if (jsFiles.length > 0) {
        console.log(`   OK: syntax check passed on ${jsFiles.length} JS file(s)`);
      }
      console.log('');
    }
  }

  console.log('All workspace checks passed.');
}

function cmdServe(argv) {
  const positional = [];
  let port = 3001;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      port = parseInt(argv[i + 1], 10);
      i++;
    } else if (!argv[i].startsWith('-')) {
      positional.push(argv[i]);
    }
  }
  const slug = positional[0];
  if (!slug) {
    console.error('Usage: node scripts/workspace.mjs serve <slug> [--port 3001]');
    process.exit(1);
  }
  if (slug === 'root' || slug === '.') {
    const child = spawn('npm', ['run', 'dev'], { cwd: ROOT_DIR, stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const appDir = path.join(APPS_DIR, slug);
  if (!fs.existsSync(appDir)) {
    console.error(`Unknown app slug "${slug}" (expected directory apps/${slug})`);
    process.exit(1);
  }

  const pkg = readJsonIfExists(path.join(appDir, 'package.json'));
  if (pkg?.scripts?.dev) {
    const child = spawn('npm', ['run', 'dev'], { cwd: appDir, stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const resolvedAppDir = fs.realpathSync(appDir);
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
    if (!relPath || relPath.endsWith('/')) relPath += 'index.html';
    const candidate = path.resolve(resolvedAppDir, relPath);
    if (candidate !== resolvedAppDir && !candidate.startsWith(resolvedAppDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    let target = candidate;
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving apps/${slug} at http://127.0.0.1:${port}/`);
  });
}

function cmdStagePages() {
  const viteBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'vite');
  if (!fs.existsSync(viteBin)) {
    throw new Error('node_modules not installed at root. Run `npm install` first.');
  }
  console.log('Building root app (CHRONO STAGE) into dist/...');
  runBin(viteBin, ['build'], ROOT_DIR);

  const distDir = path.join(ROOT_DIR, 'dist');
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

  const dsSrc = path.join(APPS_DIR, 'ds-stage');
  if (fs.existsSync(dsSrc)) {
    const dsDst = path.join(distDir, 'ds');
    fs.rmSync(dsDst, { recursive: true, force: true });
    fs.cpSync(dsSrc, dsDst, { recursive: true });
    console.log('Copied apps/ds-stage -> dist/ds/');
  }

  console.log('Pages staging directory ready at dist/ (compatible with gh-pages / and /ds/).');
}

const [, , command = 'list', ...rest] = process.argv;

try {
  if (command === 'list') {
    cmdList();
  } else if (command === 'check') {
    cmdCheck(rest);
  } else if (command === 'serve') {
    cmdServe(rest);
  } else if (command === 'stage-pages') {
    cmdStagePages();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Available commands: list | check | serve <slug> | stage-pages');
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
