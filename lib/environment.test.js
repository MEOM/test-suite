import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError } from './config.js';
import {
  ANALYTICS_PATTERNS,
  selectEnvironment,
  exceptionsFor,
  readCredentials,
  reportDir,
  runDir,
  authStatePath,
  suiteFolder,
} from './environment.js';

function config(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-env-'))) {
  return {
    name: 'Site',
    dir,
    projectRoot: path.dirname(dir),
    environments: {
      local: { baseURL: 'https://site.local', auth: null },
      production: { baseURL: 'https://site.example.com', auth: 'wp-login' },
    },
    exceptions: {
      notFound: [
        { pattern: /a/, reason: 'everywhere', env: null },
        { pattern: /b/, reason: 'local only', env: ['local'] },
      ],
      consoleErrors: [],
      blockHosts: [{ pattern: /c/, reason: 'production only', env: ['production'] }],
    },
  };
}

test('TEST_ENV defaults to local', () => {
  assert.deepEqual(selectEnvironment(config(), {}), { name: 'local', baseURL: 'https://site.local', auth: null });
});

test('TEST_ENV selects another environment', () => {
  assert.equal(selectEnvironment(config(), { TEST_ENV: 'production' }).auth, 'wp-login');
});

test('unknown TEST_ENV lists the configured names', () => {
  assert.throws(
    () => selectEnvironment(config(), { TEST_ENV: 'stage' }),
    err => err instanceof ConfigError && err.message.includes('configured: local, production')
  );
});

test('exceptionsFor keeps global entries and entries for this environment', () => {
  const local = exceptionsFor(config(), 'local');
  assert.deepEqual(local.notFound.map(e => e.reason), ['everywhere', 'local only']);
  assert.equal(local.blockHosts.length, 0);
  const prod = exceptionsFor(config(), 'production');
  assert.deepEqual(prod.notFound.map(e => e.reason), ['everywhere']);
  assert.equal(prod.blockHosts.length, 1);
});

test('readCredentials returns null without auth', () => {
  const c = config();
  assert.equal(readCredentials(c, selectEnvironment(c, {}), {}), null);
});

test('readCredentials reads .env.tests and lets the shell win', () => {
  const c = config();
  fs.writeFileSync(path.join(c.dir, '.env.tests'), 'TEST_AUTH_USER=file-user\nTEST_AUTH_PASSWORD=file-pass\n');
  const prod = selectEnvironment(c, { TEST_ENV: 'production' });
  assert.deepEqual(readCredentials(c, prod, {}), { username: 'file-user', password: 'file-pass' });
  assert.deepEqual(readCredentials(c, prod, { TEST_AUTH_USER: 'shell-user' }), {
    username: 'shell-user',
    password: 'file-pass',
  });
});

test('readCredentials fails loudly when auth is set but credentials are missing', () => {
  const c = config();
  const prod = selectEnvironment(c, { TEST_ENV: 'production' });
  assert.throws(() => readCredentials(c, prod, {}), err => err instanceof ConfigError && err.message.includes('TEST_AUTH_USER'));
});

test('analytics patterns match collect endpoints only', () => {
  const blocked = url => ANALYTICS_PATTERNS.some(re => re.test(url));
  assert.ok(blocked('https://region1.google-analytics.com/g/collect?v=2&tid=G-X'));
  assert.ok(blocked('https://www.google-analytics.com/collect?v=1'));
  assert.ok(blocked('https://analytics.google.com/g/collect?v=2'));
  assert.ok(!blocked('https://www.googletagmanager.com/gtag/js?id=G-X'));
  assert.ok(!blocked('https://www.google-analytics.com/analytics.js'));
});

test('output paths live in the suite folder, the folder that holds the config', () => {
  const env = { SUITE_CONFIG: '/proj/test-suite/tests.config.mjs' };
  assert.equal(suiteFolder(env), '/proj/test-suite');
  assert.equal(reportDir('local', '/proj/test-suite'), '/proj/test-suite/report/local');
  assert.equal(runDir('local', 'main', '/proj/test-suite'), '/proj/test-suite/report/local/runs/main');
  assert.equal(authStatePath('production', '/proj/test-suite'), '/proj/test-suite/.auth/production.json');
});
