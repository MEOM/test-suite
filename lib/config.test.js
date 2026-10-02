import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeConfig,
  loadConfig,
  resolveConfigPath,
  ConfigError,
  DEFAULT_SELECTORS,
  NOT_FOUND_PAGE,
} from './config.js';

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-config-'));

function valid() {
  return {
    name: 'Test site',
    environments: { local: { baseURL: 'https://site.local/' } },
    pages: [{ slug: 'front', path: '/', label: 'Front page' }],
    features: {
      navigation: { desktopLink: 'About' },
      skipLink: true,
      stickyHeader: false,
      accordion: false,
      form: { path: '/contact/', gravityFormId: 1 },
    },
  };
}

function problemsOf(raw, root = projectRoot) {
  try {
    normalizeConfig(raw, { projectRoot: root });
  } catch (err) {
    assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err}`);
    return err.problems;
  }
  assert.fail('expected normalizeConfig to throw');
}

test('valid config gets defaults and the 404 page', () => {
  const c = normalizeConfig(valid(), { projectRoot });
  assert.equal(c.environments.local.baseURL, 'https://site.local');
  assert.equal(c.environments.local.auth, null);
  assert.deepEqual(c.pages.at(-1), NOT_FOUND_PAGE);
  assert.equal(c.pages.length, 2);
  assert.deepEqual(c.selectors, DEFAULT_SELECTORS);
  assert.equal(c.blockAnalytics, true);
  assert.deepEqual(c.exceptions, { notFound: [], consoleErrors: [], blockHosts: [] });
  assert.equal(c.projectRoot, projectRoot);
});

test('missing feature key is an error', () => {
  const raw = valid();
  delete raw.features.form;
  assert.ok(problemsOf(raw).some(p => p.includes('features.form is missing')));
});

test('unknown feature key is an error', () => {
  const raw = valid();
  raw.features.carousel = true;
  assert.ok(problemsOf(raw).some(p => p.includes('features.carousel is not a known feature')));
});

test('invalid feature values are errors', () => {
  const raw = valid();
  raw.features.navigation = true;
  raw.features.form = { path: '/contact/' };
  raw.features.skipLink = 'yes';
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.startsWith('features.navigation')));
  assert.ok(problems.some(p => p.startsWith('features.form')));
  assert.ok(problems.some(p => p.startsWith('features.skipLink')));
});

test('exception without reason is an error', () => {
  const raw = valid();
  raw.exceptions = { notFound: [{ pattern: /x\.mov$/ }] };
  assert.ok(problemsOf(raw).some(p => p.includes('exceptions.notFound[0].reason is required')));
});

test('exception pattern must be a RegExp and env must be configured', () => {
  const raw = valid();
  raw.exceptions = { blockHosts: [{ pattern: 'cookiebot.com', reason: 'r', env: ['staging'] }] };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('exceptions.blockHosts[0].pattern must be a RegExp')));
  assert.ok(problems.some(p => p.includes('exceptions.blockHosts[0].env')));
});

test('unknown exception kind is an error', () => {
  const raw = valid();
  raw.exceptions = { redirects: [] };
  assert.ok(problemsOf(raw).some(p => p.includes('exceptions.redirects is not known')));
});

test('slug 404 is reserved and duplicate slugs are errors', () => {
  const raw = valid();
  raw.pages.push({ slug: '404', path: '/x/', label: 'x' }, { slug: 'front', path: '/y/', label: 'y' });
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('slug "404" is reserved')));
  assert.ok(problems.some(p => p.includes('duplicate slug "front"')));
});

test('page path must start with a slash', () => {
  const raw = valid();
  raw.pages[0].path = 'about/';
  assert.ok(problemsOf(raw).some(p => p.includes('pages[0].path must start with "/"')));
});

test('local baseURL defaults from config.yml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-yaml-'));
  fs.writeFileSync(
    path.join(root, 'config.yml'),
    'name: demo\ndevelopment:\n  domains:\n    - demo.local\n'
  );
  const raw = valid();
  raw.environments = { local: {} };
  const c = normalizeConfig(raw, { projectRoot: root });
  assert.equal(c.environments.local.baseURL, 'https://demo.local');
});

test('missing local baseURL without config.yml is an error', () => {
  const raw = valid();
  raw.environments = { local: {} };
  assert.ok(problemsOf(raw).some(p => p.includes('config.yml has no development.domains[0]')));
});

test('environments.local is required and auth must be known', () => {
  const raw = valid();
  raw.environments = { staging: { baseURL: 'https://s.example.com', auth: 'oauth' } };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('environments.local is required')));
  assert.ok(problems.some(p => p.includes('environments.staging.auth must be one of')));
});

test('selectors: unknown key and non-id skip link target are errors', () => {
  const raw = valid();
  raw.selectors = { footer: '.x', skipLinkTarget: '.content' };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('selectors.footer is not known')));
  assert.ok(problems.some(p => p.includes('selectors.skipLinkTarget must be an id selector')));
});

test('selector overrides merge with defaults', () => {
  const raw = valid();
  raw.selectors = { header: '.site-header' };
  const c = normalizeConfig(raw, { projectRoot });
  assert.equal(c.selectors.header, '.site-header');
  assert.equal(c.selectors.nav, DEFAULT_SELECTORS.nav);
});

test('unknown top-level key is an error', () => {
  const raw = valid();
  raw.pagez = [];
  assert.ok(problemsOf(raw).some(p => p.includes('pagez is not a known config key')));
});

test('all problems are reported at once', () => {
  const raw = valid();
  delete raw.name;
  delete raw.features.skipLink;
  assert.ok(problemsOf(raw).length >= 2);
});

test('resolveConfigPath honours SUITE_CONFIG and defaults to the current directory', () => {
  assert.equal(resolveConfigPath({ SUITE_CONFIG: '/x/y.mjs' }), '/x/y.mjs');
  assert.equal(resolveConfigPath({}, '/proj/test-suite'), '/proj/test-suite/tests.config.mjs');
});

test('loadConfig: the suite folder holds the config and config.yml is read from its parent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-folder-'));
  const dir = path.join(root, 'test-suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'config.yml'), 'development:\n  domains:\n    - parent.local\n');
  const raw = valid();
  raw.environments = { local: {} };
  const file = path.join(dir, 'tests.config.mjs');
  fs.writeFileSync(file, `export default ${JSON.stringify(raw)};\n`);
  const c = await loadConfig({ SUITE_CONFIG: file });
  assert.equal(c.dir, dir);
  assert.equal(c.projectRoot, root);
  assert.equal(c.environments.local.baseURL, 'https://parent.local');
});

test('a missing config names the test-suite folder and the Claude prompt', async () => {
  await assert.rejects(
    loadConfig({ SUITE_CONFIG: path.join(os.tmpdir(), 'lc-none', 'tests.config.mjs') }),
    err => err instanceof ConfigError && err.message.includes('test-suite/') && err.message.includes('AGENTS.md')
  );
});

test('loadConfig imports the file and reports a missing file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-load-'));
  const file = path.join(root, 'tests.config.mjs');
  fs.writeFileSync(file, `export default ${JSON.stringify(valid())};\n`);
  const c = await loadConfig({ SUITE_CONFIG: file });
  assert.equal(c.name, 'Test site');
  assert.equal(c.file, file);
  await assert.rejects(loadConfig({ SUITE_CONFIG: path.join(root, 'nope.mjs') }), ConfigError);
});
