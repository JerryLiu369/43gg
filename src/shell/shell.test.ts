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

test('APP_REGISTRY registers astral-orrery, lucky-landlord, and chrono-stage with valid metadata and existing paths', () => {
  assert.equal(APP_REGISTRY.length, 3);
  const seenIds = new Set<string>();

  for (const app of APP_REGISTRY) {
    assert.match(app.id, /^[a-z0-9-]+$/);
    assert.ok(!seenIds.has(app.id), `Duplicate app id: ${app.id}`);
    seenIds.add(app.id);

    assert.ok(app.title.trim().length > 0);
    assert.ok(app.description.trim().length > 0);
    assert.ok(app.techLabel.trim().length > 0);
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

  assert.equal(getAppById('astral-orrery')?.kind, 'react-lazy');
  assert.equal(getAppById('lucky-landlord')?.kind, 'react-lazy');
  assert.equal(getAppById('chrono-stage')?.kind, 'react-lazy');
  assert.equal(getAppById('ds-stage'), null);
  assert.equal(getAppById('unknown-app'), null);
});

test('router parses query, hash, and path app routes safely', () => {
  assert.equal(parseAppIdFromLocation('', '', '/', VALID_IDS), null);
  assert.equal(parseAppIdFromLocation('?app=chrono-stage', '', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=LUCKY-LANDLORD', '', '/gaistudio/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '#/apps/lucky-landlord', '/gaistudio/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '#/app/chrono-stage?autostart=1', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('', '#lucky-landlord', '/', VALID_IDS), 'lucky-landlord');
  assert.equal(parseAppIdFromLocation('', '', '/app/chrono-stage', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=ds-stage', '', '/', VALID_IDS), null);
  assert.equal(parseAppIdFromLocation('?app=nonexistent', '', '/', VALID_IDS), null);
});

test('router builds portable URLs for root (/) and subpath (/gaistudio/) origins', () => {
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/', 'chrono-stage', VALID_IDS),
    '/?app=chrono-stage',
  );
  assert.equal(
    buildAppUrl('https://jerryliu369.github.io/gaistudio/', 'lucky-landlord', VALID_IDS),
    '/gaistudio/?app=lucky-landlord',
  );
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/app/chrono-stage', 'lucky-landlord', VALID_IDS),
    '/?app=lucky-landlord',
  );
  assert.equal(
    buildHomeUrl('https://jerryliu369.github.io/gaistudio/?app=chrono-stage&autostart=1', VALID_IDS),
    '/gaistudio/',
  );
  assert.equal(
    buildHomeUrl('http://127.0.0.1:3000/?app=chrono-stage&autostart=1', VALID_IDS),
    '/',
  );
});

test('buildIframeEntryUrl resolves static sub-apps cleanly on both root and /gaistudio/ subpath', () => {
  const mockIds = [...VALID_IDS, 'demo-static'];
  assert.equal(
    buildIframeEntryUrl('apps/demo-static/index.html', 'http://127.0.0.1:3000/?app=demo-static', mockIds),
    'http://127.0.0.1:3000/apps/demo-static/index.html',
  );
  assert.equal(
    buildIframeEntryUrl(
      'apps/demo-static/index.html',
      'https://jerryliu369.github.io/gaistudio/?app=demo-static&stage=1',
      mockIds,
    ),
    'https://jerryliu369.github.io/gaistudio/apps/demo-static/index.html?stage=1',
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
  assert.match(readme, /天枢浑仪/);
  assert.match(readme, /吉星包租公/);
  assert.match(readme, /CHRONO STAGE/);
  assert.match(readme, /skills\/kasidia-frontend-law\/SKILL\.md/);
  assert.match(readme, /AGENTS\.md/);
  assert.doesNotMatch(readme, /README_zh\.md/);

  const agentsDoc = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agentsDoc, /用户偏好档案/);
  assert.match(agentsDoc, /Agent 能力加强规范/);
  assert.match(agentsDoc, /自有工程方法论/);
  assert.match(agentsDoc, /演进沉淀日志/);
});

