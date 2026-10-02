import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suiteVersion } from './version.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function suiteDirIn(parent) {
  const dir = path.join(parent, 'suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@meom/test-suite', version: '9.9.9' }));
  return dir;
}

function lockfile(folder, resolved) {
  fs.writeFileSync(
    path.join(folder, 'package-lock.json'),
    JSON.stringify({ packages: { 'node_modules/@meom/test-suite': { resolved } } })
  );
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe' })
    .toString()
    .trim();

test('a git install shows the commit from the project lockfile', () => {
  const folder = tmp('lc-ver-');
  lockfile(folder, `git+https://github.com/MEOM/test-suite.git#${SHA}`);
  assert.equal(suiteVersion({ suiteDir: suiteDirIn(tmp('lc-pkg-')), folder }), '9.9.9 (0123456)');
});

test('no lockfile and no checkout shows the version only', () => {
  assert.equal(suiteVersion({ suiteDir: suiteDirIn(tmp('lc-pkg-')), folder: tmp('lc-ver-') }), '9.9.9');
});

test('a linked package repo shows its own checkout commit', () => {
  const folder = tmp('lc-ver-');
  lockfile(folder, '../suite');
  const suiteDir = suiteDirIn(tmp('lc-pkg-'));
  git(suiteDir, 'init', '-q');
  git(suiteDir, 'commit', '-q', '--allow-empty', '-m', 'x');
  const head = git(suiteDir, 'rev-parse', 'HEAD');
  assert.equal(suiteVersion({ suiteDir, folder }), `9.9.9 (${head.slice(0, 7)})`);
});

test('a package inside the project git repo never shows the project commit', () => {
  const project = tmp('lc-proj-');
  git(project, 'init', '-q');
  git(project, 'commit', '-q', '--allow-empty', '-m', 'x');
  const suiteDir = suiteDirIn(project);
  assert.equal(suiteVersion({ suiteDir, folder: project }), '9.9.9');
});
