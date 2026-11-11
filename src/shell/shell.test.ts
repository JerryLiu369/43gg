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

test('APP_REGISTRY registers chrono-stage and ds-stage with valid metadata and existing paths', () => {
  assert.ok(APP_REGISTRY.length >= 2);
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

  assert.equal(getAppById('chrono-stage')?.kind, 'react-lazy');
  assert.equal(getAppById('ds-stage')?.kind, 'iframe');
  assert.equal(getAppById('unknown-app'), null);
});

test('router parses query, hash, and path app routes safely', () => {
  assert.equal(parseAppIdFromLocation('', '', '/', VALID_IDS), null);
  assert.equal(parseAppIdFromLocation('?app=chrono-stage', '', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=DS-STAGE', '', '/gaistudio/', VALID_IDS), 'ds-stage');
  assert.equal(parseAppIdFromLocation('', '#/apps/ds-stage', '/gaistudio/', VALID_IDS), 'ds-stage');
  assert.equal(parseAppIdFromLocation('', '#/app/chrono-stage?autostart=1', '/', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('', '#ds-stage', '/', VALID_IDS), 'ds-stage');
  assert.equal(parseAppIdFromLocation('', '', '/app/chrono-stage', VALID_IDS), 'chrono-stage');
  assert.equal(parseAppIdFromLocation('?app=nonexistent', '', '/', VALID_IDS), null);
});

test('router builds portable URLs for root (/) and subpath (/gaistudio/) origins', () => {
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/', 'chrono-stage', VALID_IDS),
    '/?app=chrono-stage',
  );
  assert.equal(
    buildAppUrl('https://jerryliu369.github.io/gaistudio/', 'ds-stage', VALID_IDS),
    '/gaistudio/?app=ds-stage',
  );
  assert.equal(
    buildAppUrl('http://127.0.0.1:3000/app/chrono-stage', 'ds-stage', VALID_IDS),
    '/?app=ds-stage',
  );
  assert.equal(
    buildHomeUrl('https://jerryliu369.github.io/gaistudio/?app=ds-stage&stage=kettle', VALID_IDS),
    '/gaistudio/',
  );
  assert.equal(
    buildHomeUrl('http://127.0.0.1:3000/?app=chrono-stage&autostart=1', VALID_IDS),
    '/',
  );
});

test('buildIframeEntryUrl resolves static sub-apps cleanly on both root and /gaistudio/ subpath', () => {
  assert.equal(
    buildIframeEntryUrl('apps/ds-stage/index.html', 'http://127.0.0.1:3000/?app=ds-stage', VALID_IDS),
    'http://127.0.0.1:3000/apps/ds-stage/index.html',
  );
  assert.equal(
    buildIframeEntryUrl(
      'apps/ds-stage/index.html',
      'https://jerryliu369.github.io/gaistudio/?app=ds-stage&stage=kettle&auto=1',
      VALID_IDS,
    ),
    'https://jerryliu369.github.io/gaistudio/apps/ds-stage/index.html?stage=kettle&auto=1',
  );
  assert.equal(
    buildIframeEntryUrl(
      'apps/ds-stage/index.html',
      'https://jerryliu369.github.io/gaistudio/#/apps/ds-stage?stage=kettle',
      VALID_IDS,
    ),
    'https://jerryliu369.github.io/gaistudio/apps/ds-stage/index.html?stage=kettle',
  );
  assert.equal(
    buildIframeEntryUrl('apps/ds-stage/index.html', 'http://127.0.0.1:3000/app/ds-stage', VALID_IDS),
    'http://127.0.0.1:3000/apps/ds-stage/index.html',
  );
});
