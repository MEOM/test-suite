import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';
import { initProject, syncDocs, defaultSource, InitError, GITIGNORE } from './project.js';

const BIN = path.join(SUITE_DIR, 'bin', 'test-suite.js');

function cli(args, cwd) {
  const env = { ...process.env };
  delete env.SUITE_CONFIG;
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

const SOURCE = 'git+https://github.com/MEOM/test-suite.git#v9.9.9';

function projectRoot({ configYml = true, workspaces } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-proj-'));
  if (configYml) fs.writeFileSync(path.join(root, 'config.yml'), 'name: demo\n');
  if (workspaces) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces }));
  return root;
}

test('defaultSource points at the version tag on GitHub', () => {
  assert.equal(defaultSource('0.1.0'), 'git+https://github.com/MEOM/test-suite.git#v0.1.0');
});

test('initProject writes the folder package.json and .gitignore', () => {
  const root = projectRoot({ workspaces: ['htdocs/wp-content/themes/demo'] });
  const { dir, warnings } = initProject({ projectRoot: root, source: SOURCE });
  assert.equal(dir, path.join(root, 'test-suite'));
  assert.deepEqual(warnings, []);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.devDependencies['@meom/test-suite'], SOURCE);
  assert.equal(pkg.scripts.postinstall, 'test-suite sync-docs');
  assert.equal(pkg.scripts['launch-check'], 'test-suite run');
  assert.equal(pkg.scripts['check-config'], 'test-suite config');
  assert.equal(pkg.scripts.test, 'test-suite test');
  assert.equal(pkg.scripts['install-browsers'], 'test-suite install-browsers');
  assert.match(pkg.name, /^[a-z0-9-]+-test-suite$/);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), GITIGNORE);
  for (const entry of ['node_modules/', 'report/', '.auth/', '.env.tests']) {
    assert.ok(GITIGNORE.split('\n').includes(entry), `.gitignore lacks ${entry}`);
  }
});

test('initProject refuses an existing test-suite folder and changes nothing', () => {
  const root = projectRoot();
  const dir = path.join(root, 'test-suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'tests.config.mjs'), 'keep me');
  assert.throws(() => initProject({ projectRoot: root, source: SOURCE }), InitError);
  assert.deepEqual(fs.readdirSync(dir), ['tests.config.mjs']);
  assert.equal(fs.readFileSync(path.join(dir, 'tests.config.mjs'), 'utf8'), 'keep me');
});

test('initProject warns outside a project root and when the root workspaces list the folder', () => {
  const { warnings: noYml } = initProject({ projectRoot: projectRoot({ configYml: false }), source: SOURCE });
  assert.ok(noYml.some(w => w.includes('no config.yml')));
  for (const ws of [['test-suite'], ['./test-suite/'], { packages: ['test-suite'] }]) {
    const { warnings } = initProject({ projectRoot: projectRoot({ workspaces: ws }), source: SOURCE });
    assert.ok(warnings.some(w => w.includes('workspaces')), `no warning for ${JSON.stringify(ws)}`);
  }
});

test('syncDocs copies README.md and AGENTS.md with a header naming the version', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-docs-'));
  const written = syncDocs({ folder, version: '9.9.9' });
  assert.deepEqual(written.map(f => path.basename(f)), ['README.md', 'AGENTS.md']);
  for (const name of ['README.md', 'AGENTS.md']) {
    const copy = fs.readFileSync(path.join(folder, name), 'utf8');
    assert.match(copy, /^<!-- Copied from @meom\/test-suite 9\.9\.9 /);
    assert.ok(copy.endsWith(fs.readFileSync(path.join(SUITE_DIR, name), 'utf8')), `${name} body differs`);
  }
});

test('syncDocs refuses to run in the package itself', () => {
  assert.throws(() => syncDocs({ folder: SUITE_DIR, version: '9.9.9' }), /package itself/);
});

test('the CLI init --no-install creates the folder without installing', () => {
  const root = projectRoot();
  const res = cli(['init', '--no-install', '--source', SOURCE], root);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(root, 'test-suite', 'package.json')));
  assert.ok(!fs.existsSync(path.join(root, 'test-suite', 'node_modules')));
  const again = cli(['init', '--no-install'], root);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
});

test('the CLI sync-docs copies the docs into the current folder', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-docs-'));
  const res = cli(['sync-docs'], folder);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(folder, 'README.md')));
  assert.ok(fs.existsSync(path.join(folder, 'AGENTS.md')));
});
