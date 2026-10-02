import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATRIX } from './projects.js';
import { engineOf, probeEngines, splitProjects, PROBE_TIMEOUT } from './browsers.js';

test('every matrix project maps to its browser engine', () => {
  assert.deepEqual(Object.fromEntries(MATRIX.map(p => [p.name, engineOf(p)])), {
    'chrome-phone': 'chromium',
    'chrome-tablet': 'chromium',
    'chrome-desktop': 'chromium',
    'firefox-desktop': 'firefox',
    'safari-phone': 'webkit',
    'safari-desktop': 'webkit',
  });
});

test('probeEngines starts each engine once and reports the launch error of one that cannot start', async () => {
  const calls = [];
  let closed = 0;
  const launch = async (engine, opts) => {
    calls.push([engine, opts.timeout]);
    if (engine === 'firefox') {
      throw new Error(
        'browserType.launch: Timeout 15000ms exceeded.\nCall log:\n' +
          '  - [pid=1][err] sandbox_extension_issue_file_to_process failed for plugin-container.app: 1 (Operation not permitted)'
      );
    }
    return { close: async () => { closed++; } };
  };
  const probe = await probeEngines(MATRIX, launch);
  assert.deepEqual(calls, [['chromium', PROBE_TIMEOUT], ['firefox', PROBE_TIMEOUT], ['webkit', PROBE_TIMEOUT]]);
  assert.equal(closed, 2);
  assert.equal(probe.chromium, null);
  assert.equal(probe.webkit, null);
  assert.equal(
    probe.firefox,
    'browserType.launch: Timeout 15000ms exceeded. sandbox_extension_issue_file_to_process failed for plugin-container.app: 1 (Operation not permitted)'
  );
});

test('splitProjects leaves out the projects of an engine that cannot start', () => {
  const { run, skipped } = splitProjects({ chromium: null, firefox: 'cannot start', webkit: null });
  assert.deepEqual(run, ['chrome-phone', 'chrome-tablet', 'chrome-desktop', 'safari-phone', 'safari-desktop']);
  assert.deepEqual(skipped, [{ project: 'firefox-desktop', engine: 'firefox', reason: 'cannot start' }]);
});

test('probeEngines names the failing [err] line, not a benign banner before it', async () => {
  const launch = async () => {
    throw new Error(
      'browserType.launch: Timeout 15000ms exceeded.\nCall log:\n' +
        '  - [pid=1][err] *** You are running in headless mode.\n' +
        '  - [pid=1][err] sandbox_extension_issue_file_to_process failed for plugin-container.app: 1 (Operation not permitted)'
    );
  };
  const { firefox } = await probeEngines(MATRIX, launch);
  assert.match(firefox, /Operation not permitted/);
  assert.doesNotMatch(firefox, /headless mode/);
});

test('an error with no [err] line gives just its first line', async () => {
  const launch = async () => { throw new Error('spawn failed\nCall log:\n  - something else'); };
  assert.equal((await probeEngines(MATRIX, launch)).chromium, 'spawn failed');
});

test('splitProjects skips every project when no engine can start', () => {
  const { run, skipped } = splitProjects({ chromium: 'x', firefox: 'x', webkit: 'x' });
  assert.deepEqual(run, []);
  assert.equal(skipped.length, 6);
});

test('probeEngines starts each engine with its project launch options', async () => {
  const seen = [];
  const launch = async (engine, opts) => {
    seen.push([engine, opts]);
    return { close: async () => {} };
  };
  const matrix = [
    { name: 'c', use: { defaultBrowserType: 'chromium' } },
    { name: 'f', use: { defaultBrowserType: 'firefox', launchOptions: { env: { CFFIXED_USER_HOME: '/tmp/x' } } } },
  ];
  await probeEngines(matrix, launch);
  assert.deepEqual(seen, [
    ['chromium', { timeout: PROBE_TIMEOUT }],
    ['firefox', { env: { CFFIXED_USER_HOME: '/tmp/x' }, timeout: PROBE_TIMEOUT }],
  ]);
});
