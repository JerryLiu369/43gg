import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_REGISTRY, getAppById } from '../apps/registry.ts';
import {
  buildAppUrl,
  buildHomeUrl,
  buildIframeEntryUrl,
  parseAppIdFromLocation,
} from './router.ts';

const SHELL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SHELL_DIR, '..', '..');
const VALID_IDS = APP_REGISTRY.map((app) => app.id);

test('APP_REGISTRY keeps every published app id and each entry has valid metadata and existing paths', () => {
  // Published ids are part of the public URL (?app=<id>) and save-key contract; they may be added to, never removed.
  // See docs/compatibility.md.
  const PUBLISHED_IDS = [
    'xuanji-breach',
    'ink-blade',
    'astral-orrery',
    'lucky-landlord',
    'chrono-stage',
    'ticket-to-ride-europe',
    'carcassonne-bigbox',
    'inch-of-shade',
    'moon-mirror',
  ];
  for (const id of PUBLISHED_IDS) {
    assert.ok(VALID_IDS.includes(id), `Published app id must stay registered: ${id}`);
  }
  const seenIds = new Set<string>();

  for (const app of APP_REGISTRY) {
    assert.match(app.id, /^[a-z0-9-]+$/);
    assert.ok(!seenIds.has(app.id), `Duplicate app id: ${app.id}`);
    seenIds.add(app.id);

    assert.ok(app.title.trim().length > 0);
    assert.ok(app.description.trim().length > 0);
    assert.ok(app.techLabel.trim().length > 0);
    assert.ok(app.author.trim().length > 0, `${app.id} must credit an author`);
    assert.ok(app.model.trim().length > 0, `${app.id} must credit the model used`);
    assert.ok(
      app.highlights.length > 0 && app.highlights.every((item) => item.trim().length > 0),
      `${app.id} must list at least one highlight`,
    );
    assert.ok(app.tags.length > 0);

    const absSourceDir = path.join(REPO_ROOT, app.sourceDir);
    assert.ok(
      fs.existsSync(absSourceDir) && fs.statSync(absSourceDir).isDirectory(),
      `Missing sourceDir for ${app.id}: ${app.sourceDir}`,
    );

    if (app.kind === 'react-lazy') {
      assert.equal(typeof app.loader, 'function', `${app.id} must provide a lazy loader`);
    } else if (app.kind === 'iframe') {
      assert.ok(app.entryPath, `${app.id} must provide entryPath`);
      const absEntry = path.join(REPO_ROOT, app.entryPath);
      assert.ok(
        fs.existsSync(absEntry) && fs.statSync(absEntry).isFile(),
        `Missing entryPath for ${app.id}: ${app.entryPath}`,
      );
    }
  }

  assert.equal(getAppById('moon-mirror')?.kind, 'react-lazy');
  assert.equal(getAppById('moon-mirror')?.model, 'Kimi K3.1 Pro');
  assert.equal(getAppById('xuanji-breach')?.kind, 'react-lazy');
  assert.equal(getAppById('ink-blade')?.kind, 'react-lazy');
  assert.equal(getAppById('astral-orrery')?.kind, 'react-lazy');
  assert.equal(getAppById('lucky-landlord')?.kind, 'react-lazy');
  assert.equal(getAppById('chrono-stage')?.kind, 'react-lazy');
  assert.equal(getAppById('ticket-to-ride-europe')?.kind, 'react-lazy');
  assert.equal(getAppById('carcassonne-bigbox')?.kind, 'react-lazy');
  assert.equal(getAppById('inch-of-shade')?.kind, 'react-lazy');
  assert.equal(getAppById('ds-stage'), null);
  assert.equal(getAppById('unknown-app'), null);
});

test('router parses query, hash, and path app routes safely', () => {
  assert.equal(parseAppIdFromLocation('', '', '/', VALID_IDS), null);
  assert.equal(parseAppIdFromLocation('?app=chrono-stage', '', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=LUCKY-LANDLORD', '', '/43gg/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '#/apps/lucky-landlord', '/43gg/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '#/app/chrono-stage?autostart=1', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('', '#lucky-landlord', '/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '', '/app/chrono-stage', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=ds-stage', '', '/', VALID_IDS), null);
  assert.equal(parseAppIdFromLocation('?app=nonexistent', '', '/', VALID_IDS), null);
});

test('router builds portable URLs for root (/) and subpath (/43gg/) origins', () => {
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/', 'chrono-stage', VALID_IDS),
    '/?app=chrono-stage',
  );
  assert.equal(
    buildAppUrl('https://jerryliu369.github.io/43gg/', 'lucky-landlord', VALID_IDS),
    '/43gg/?app=lucky-landlord',
  );
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/app/chrono-stage', 'lucky-landlord', VALID_IDS),
    '/?app=lucky-landlord',
  );
  assert.equal(
    buildHomeUrl('https://jerryliu369.github.io/43gg/?app=chrono-stage&autostart=1', VALID_IDS),
    '/43gg/',
  );
  assert.equal(
    buildHomeUrl('http://127.0.0.1:3000/?app=chrono-stage&autostart=1', VALID_IDS),
    '/',
  );
});

test('buildIframeEntryUrl resolves static sub-apps cleanly on both root and /43gg/ subpath', () => {
  const mockIds = [...VALID_IDS, 'demo-static'];
  assert.equal(
    buildIframeEntryUrl('apps/demo-static/index.html', 'http://127.0.0.1:3000/?app=demo-static', mockIds),
    'http://127.0.0.1:3000/apps/demo-static/index.html',
  );
  assert.equal(
    buildIframeEntryUrl(
      'apps/demo-static/index.html',
      'https://jerryliu369.github.io/43gg/?app=demo-static&stage=1',
      mockIds,
    ),
    'https://jerryliu369.github.io/43gg/apps/demo-static/index.html?stage=1',
  );
});

test('workspace enforces vendored KFL skill, AGENTS.md memory bank, kfl-spec.md, and Chinese-only docs', () => {
  const requiredFiles = [
    'README.md',
    'AGENTS.md',
    'kfl-spec.md',
    'docs/chrono-stage.md',
    'skills/kasidia-frontend-law/SKILL.md',
    'skills/kasidia-frontend-law/references/rules.md',
    'skills/kasidia-frontend-law/references/spec-template.md',
    'skills/kasidia-frontend-law/references/design-review.md',
  ];

  for (const rel of requiredFiles) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs) && fs.statSync(abs).isFile(), `Expected required file: ${rel}`);
  }

  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'README_zh.md')),
    false,
    'README_zh.md must not exist; README.md is directly written in Chinese',
  );
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'docs/chrono-stage_zh.md')),
    false,
    'docs/chrono-stage_zh.md should be unified as docs/chrono-stage.md',
  );

  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /月镜庭/);
  assert.match(readme, /Kimi K3\.1 Pro/);
  assert.match(readme, /墨刃：一闪/);
  assert.match(readme, /天枢浑仪/);
  assert.match(readme, /吉星包租公/);
  assert.match(readme, /CHRONO STAGE/);
  assert.match(readme, /经纬铁道/);
  assert.match(readme, /方寸山河/);
  assert.match(readme, /寸阴/);
  assert.match(readme, /skills\/kasidia-frontend-law\/SKILL\.md/);
  assert.match(readme, /AGENTS\.md/);
  assert.doesNotMatch(readme, /README_zh\.md/);

  const agentsDoc = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agentsDoc, /用户偏好档案/);
  assert.match(agentsDoc, /实战新手指引/);
  assert.match(agentsDoc, /适中难度曲线/);
  assert.match(agentsDoc, /多端可玩/);
  assert.match(agentsDoc, /Agent 能力加强规范/);
  assert.match(agentsDoc, /自有工程方法论/);
  assert.match(agentsDoc, /演进沉淀日志/);
});

test('hubProgress reads real local milestones safely and ignores unplayed or malformed entries', async () => {
  const { readHubSnapshot, recordLastPlayedApp, HUB_LAST_PLAYED_KEY } = await import(
    './hubProgress.ts'
  );
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, val);
    },
  };

  // Fresh visitor: zero fabricated progress
  const emptySnap = readHubSnapshot(VALID_IDS, mockStorage);
  assert.equal(emptySnap.lastPlayedAppId, null);
  assert.deepEqual(emptySnap.progressByAppId, {});

  // Record last played and populate real game saves + one malformed entry
  recordLastPlayedApp('xuanji-breach', mockStorage);
  assert.ok(store.has(HUB_LAST_PLAYED_KEY));

  store.set(
    '43gg.xuanji_breach.meta.v1',
    JSON.stringify({ runsPlayed: 3, victories: 1, bestScore: 2480, highestSectorReached: 4 }),
  );
  store.set(
    '43gg.ink_blade.meta.v1',
    JSON.stringify({ highestUnlockedStage: 2, bestScore: 1850, totalKills: 36, totalVictories: 0 }),
  );
  store.set(
    '43gg.moon_mirror.progress.v1',
    JSON.stringify({ records: {
      'first-light': { bestMoves: 2, stars: 3, completed: { standard: true } },
      'twin-dew': { bestMoves: 2, stars: 3, completed: { master: true } },
      'far-near': { bestMoves: 2, stars: 3 },
      unknown: { bestMoves: 1, stars: 3, completed: { master: true } },
    } }),
  );
  store.set('43gg.astral_orrery.meta.v1', '{corrupted_json');
  store.set(
    '43gg.lucky_landlord.active_run.v1',
    JSON.stringify({ phase: 'spinning', cycle: 4, coins: 128 }),
  );
  store.set(
    '43gg.chrono_stage.records.v1',
    JSON.stringify({ ss1: { bestTimeSec: 104.2 }, ss2: { bestTimeSec: 112.8 } }),
  );
  store.set(
    '43gg.ticket_to_ride_europe.meta.v1',
    JSON.stringify({ gamesPlayed: 2, victories: 1, bestScore: 132 }),
  );
  store.set(
    '43gg.carcassonne_bigbox.active_run.v1',
    JSON.stringify({ state: { finished: false, turn: { number: 7 } } }),
  );

  store.set(
    '43gg.inch_of_shade.meta.v1',
    JSON.stringify({
      records: {
        'yan-xia': { solved: true, bestSteps: 9, seal: true },
        'wu-ying': { solved: true, bestSteps: 8, seal: false },
        'fen-qiang': { solved: false },
        broken: 'x',
      },
    }),
  );

  const snap = readHubSnapshot(VALID_IDS, mockStorage);
  assert.equal(snap.lastPlayedAppId, 'xuanji-breach');
  assert.match(snap.progressByAppId['inch-of-shade'], /已叼到 2 \/ 20 条鱼干 · 「妙」印 1/);
  assert.match(snap.progressByAppId['moon-mirror'], /已唤醒 2 \/ 9 座夜庭/);
  assert.match(snap.progressByAppId['xuanji-breach'], /已破阵通关 1 次/);
  assert.match(snap.progressByAppId['ink-blade'], /解锁至第 3 幕/);
  assert.equal(snap.progressByAppId['astral-orrery'], undefined);
  assert.match(snap.progressByAppId['lucky-landlord'], /第 4 周期收租进行中/);
  assert.match(snap.progressByAppId['chrono-stage'], /已刷新 2 \/ 6 站/);
  assert.match(snap.progressByAppId['ticket-to-ride-europe'], /已胜出 1 局/);
  assert.match(snap.progressByAppId['carcassonne-bigbox'], /第 7 回合拼图中/);

  // Unknown app ID in last_played is safely ignored
  recordLastPlayedApp('nonexistent-game', mockStorage);
  assert.equal(readHubSnapshot(VALID_IDS, mockStorage).lastPlayedAppId, null);
});

test('filterWorkspaceApps scales across arbitrary N future games, categories, and search queries', async () => {
  const { filterWorkspaceApps, APP_CATEGORY_LABELS } = await import('../apps/registry.ts');
  const extendedCatalog = [
    ...APP_REGISTRY,
    {
      id: 'mirror-maze',
      title: '镜渊折光',
      subtitle: '光学折射机关解谜',
      description: '旋转棱镜引导双色光束点亮古碑。',
      author: 'tester',
      model: 'test-model',
      highlights: ['测试'],
      techLabel: '光学解谜',
      tags: ['烧脑解谜', '关卡'],
      category: 'puzzle' as const,
      accent: 'cyan' as const,
      kind: 'react-lazy' as const,
      sourceDir: 'src/apps/mirror-maze',
    },
    {
      id: 'dice-dungeon',
      title: '骰子地牢坊',
      subtitle: '回合骰面构筑肉鸽',
      description: '锻造六面点数触发连锁奇物。',
      author: 'tester',
      model: 'test-model',
      highlights: ['测试'],
      techLabel: '骰子肉鸽',
      tags: ['地牢探索'],
      category: 'roguelike' as const,
      accent: 'amber' as const,
      kind: 'react-lazy' as const,
      sourceDir: 'src/apps/dice-dungeon',
    },
  ];

  assert.equal(APP_CATEGORY_LABELS.puzzle, '解谜');
  assert.equal(APP_CATEGORY_LABELS.roguelike, '肉鸽');
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '').length, APP_REGISTRY.length + 2);
  assert.equal(
    filterWorkspaceApps(extendedCatalog, 'puzzle', '').length,
    APP_REGISTRY.filter((app) => app.category === 'puzzle').length + 1,
  );
  assert.equal(
    filterWorkspaceApps(extendedCatalog, 'all', '折射').length,
    filterWorkspaceApps(APP_REGISTRY, 'all', '折射').length + 1,
  );
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '肉鸽').length, 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'strategy', '罗盘').length, 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '不存在的游戏词条').length, 0);
});



