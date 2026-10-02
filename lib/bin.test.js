import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';

const BIN = path.join(SUITE_DIR, 'bin', 'test-suite.js');

function cli(args, cwd) {
  const env = { ...process.env };
  delete env.SUITE_CONFIG;
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

test('a config command outside the suite folder names the folder and the Claude prompt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-bin-'));
  const res = cli(['config'], dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /No tests\.config\.mjs in /);
  assert.match(res.stderr, /test-suite\/AGENTS\.md/);
  assert.doesNotMatch(res.stderr, /at .*\.js:\d+/, 'no stack trace');
});

test('help prints the usage and exits 0', () => {
  const res = cli(['help'], os.tmpdir());
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage: test-suite <command>/);
});

test('an unknown command prints the usage and exits 1', () => {
  const res = cli(['lanch-check'], os.tmpdir());
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Unknown command "lanch-check"/);
});
