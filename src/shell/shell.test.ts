import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ID_ALIASES,
  APP_REGISTRY,
  getAppById,
  resolveAppId,
  type AppCategory,
} from '../apps/registry.ts';
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
  // A renamed app keeps its old id working through APP_ID_ALIASES. See docs/compatibility.md.
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
    'mistlight-voyage',
    'meridian-rails',
    'fangcun-realms',
  ];
  for (const id of PUBLISHED_IDS) {
    const resolved = resolveAppId(id);
    assert.ok(resolved && VALID_IDS.includes(resolved), `Published app id must stay reachable: ${id}`);
    if (!VALID_IDS.includes(id)) {
      assert.ok(APP_ID_ALIASES[id], `Published id ${id} left the registry without an alias`);
    }
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
  assert.equal(getAppById('meridian-rails')?.kind, 'react-lazy');
  assert.equal(getAppById('fangcun-realms')?.kind, 'react-lazy');
  assert.equal(getAppById('inch-of-shade')?.kind, 'react-lazy');
  assert.equal(getAppById('ds-stage'), null);
  assert.equal(getAppById('unknown-app'), null);
});

test('retired app ids alias to live entries without shadowing or chaining', () => {
  for (const [oldId, newId] of Object.entries(APP_ID_ALIASES)) {
    assert.match(oldId, /^[a-z0-9-]+$/);
    assert.ok(!VALID_IDS.includes(oldId), `Alias ${oldId} must not shadow a live id`);
    assert.ok(VALID_IDS.includes(newId), `Alias ${oldId} must point at a live id, got ${newId}`);
    assert.equal(APP_ID_ALIASES[newId], undefined, `Alias target ${newId} must not itself be an alias`);
  }
  assert.equal(resolveAppId('ticket-to-ride-europe'), 'meridian-rails');
  assert.equal(resolveAppId(' Ticket-To-Ride-Europe '), 'meridian-rails');
  assert.equal(getAppById('carcassonne-bigbox')?.id, 'fangcun-realms');
  assert.equal(resolveAppId('meridian-rails'), 'meridian-rails');
  assert.equal(resolveAppId('nonexistent'), null);

  // Old links of every supported shape land on the renamed app.
  const parse = (search: string, hash: string, pathname: string) =>
    parseAppIdFromLocation(search, hash, pathname, VALID_IDS, APP_ID_ALIASES);
  assert.equal(parse('?app=ticket-to-ride-europe', '', '/43gg/'), 'meridian-rails');
  assert.equal(parse('?app=carcassonne-bigbox&autostart=1', '', '/'), 'fangcun-realms');
  assert.equal(parse('', '#/apps/carcassonne-bigbox', '/'), 'fangcun-realms');
  assert.equal(parse('', '#ticket-to-ride-europe', '/'), 'meridian-rails');
  assert.equal(parse('', '', '/app/ticket-to-ride-europe'), 'meridian-rails');
  // Without the alias table an old id is unknown: that is how the shell detects it should rewrite the URL.
  assert.equal(parseAppIdFromLocation('?app=ticket-to-ride-europe', '', '/', VALID_IDS), null);
  assert.equal(
    buildAppUrl('https://jerryliu369.github.io/43gg/?app=ticket-to-ride-europe&autostart=1', 'meridian-rails', [
      ...VALID_IDS,
      ...Object.keys(APP_ID_ALIASES),
    ]),
    '/43gg/?app=meridian-rails&autostart=1',
  );
  assert.equal(
    buildHomeUrl('http://127.0.0.1:3000/app/carcassonne-bigbox', [...VALID_IDS, ...Object.keys(APP_ID_ALIASES)]),
    '/',
  );
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
  // Not yet migrated: the hub still reads saves written under the retired ids.
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
  store.set('43gg.mistlight_voyage.progress.v1', JSON.stringify({ version: 1, records: {
    'first-light': { stars: 3, moves: 1, difficulty: 'standard' },
    'around-the-cape': { stars: 2, moves: 7, difficulty: 'standard' },
  } }));

  const snap = readHubSnapshot(VALID_IDS, mockStorage);
  assert.equal(snap.lastPlayedAppId, 'xuanji-breach');
  assert.match(snap.progressByAppId['inch-of-shade'], /已叼到 2 \/ 20 条鱼干 · 「妙」印 1/);
  assert.match(snap.progressByAppId['moon-mirror'], /已唤醒 2 \/ 9 座夜庭/);
  assert.match(snap.progressByAppId['xuanji-breach'], /已破阵通关 1 次/);
  assert.match(snap.progressByAppId['ink-blade'], /解锁至第 3 幕/);
  assert.equal(snap.progressByAppId['astral-orrery'], undefined);
  assert.match(snap.progressByAppId['lucky-landlord'], /第 4 周期收租进行中/);
  assert.match(snap.progressByAppId['chrono-stage'], /已刷新 2 \/ 6 站/);
  assert.match(snap.progressByAppId['meridian-rails'], /已胜出 1 局/);
  assert.match(snap.progressByAppId['fangcun-realms'], /第 7 回合拼地块中/);
  assert.equal(snap.progressByAppId['ticket-to-ride-europe'], undefined);

  // Once migrated, the new key wins over a stale legacy copy.
  store.set('43gg.meridian_rails.meta.v1', JSON.stringify({ gamesPlayed: 5, victories: 3, bestScore: 150 }));
  assert.match(readHubSnapshot(VALID_IDS, mockStorage).progressByAppId['meridian-rails'], /已胜出 3 局 · 最高 150 分/);

  // A last-played record left under an old id follows the alias.
  recordLastPlayedApp('carcassonne-bigbox', mockStorage);
  assert.equal(readHubSnapshot(VALID_IDS, mockStorage).lastPlayedAppId, 'fangcun-realms');
  assert.equal(snap.progressByAppId['mistlight-voyage'], '已通航 2 片海域 · 收集 5 枚星');

  // Unknown app ID in last_played is safely ignored
  recordLastPlayedApp('nonexistent-game', mockStorage);
  assert.equal(readHubSnapshot(VALID_IDS, mockStorage).lastPlayedAppId, null);
});

test('filterWorkspaceApps scales across arbitrary N future games, categories, and search queries', async () => {
  const { filterWorkspaceApps, APP_CATEGORY_LABELS } = await import('../apps/registry.ts');
  // Deliberately bland placeholders: fixtures here are read by coding agents, so they must not
  // look like a game pitch (an earlier mirror-puzzle fixture was copied by several new games).
  const fixture = (id: string, category: AppCategory, token: string) => ({
    id,
    title: `占位条目 ${token}`,
    subtitle: '测试夹具',
    description: `仅用于目录筛选测试的占位数据（${token}），不代表任何游戏设想。`,
    author: 'tester',
    model: 'test-model',
    highlights: ['测试'],
    techLabel: '测试',
    tags: ['测试夹具'],
    category,
    accent: 'cyan' as const,
    kind: 'react-lazy' as const,
    sourceDir: `src/apps/${id}`,
    addedAt: '2099-01-01',
  });
  const extendedCatalog = [
    ...APP_REGISTRY,
    fixture('fixture-alpha', 'puzzle', 'zzq-alpha'),
    fixture('fixture-beta', 'roguelike', 'zzq-beta'),
  ];
  const countIn = (category: 'all' | AppCategory, query: string) =>
    filterWorkspaceApps(APP_REGISTRY, category, query).length;

  assert.equal(APP_CATEGORY_LABELS.puzzle, '解谜');
  assert.equal(APP_CATEGORY_LABELS.roguelike, '肉鸽');
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '').length, APP_REGISTRY.length + 2);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'puzzle', '').length, countIn('puzzle', '') + 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', 'zzq-alpha').length, 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'roguelike', 'zzq').length, 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '肉鸽').length, countIn('all', '肉鸽') + 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'strategy', '罗盘').length, countIn('strategy', '罗盘'));
  assert.ok(countIn('strategy', '罗盘') >= 1);
  assert.equal(filterWorkspaceApps(extendedCatalog, 'all', '不存在的游戏词条').length, 0);
});
