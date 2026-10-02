import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MATRIX, firefoxLaunchOptions } from './projects.js';

test('off macOS, Firefox launches with Playwright defaults', () => {
  assert.deepEqual(firefoxLaunchOptions('linux', { PATH: '/bin' }), {});
  assert.deepEqual(firefoxLaunchOptions('win32', { PATH: 'C:\\' }), {});
});

test('on macOS, Firefox gets a home folder of the suite\'s own and keeps the rest of the environment', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-ffhome-'));
  const { env } = firefoxLaunchOptions('darwin', { PATH: '/bin', HOME: '/Users/x' }, tmp);
  const home = path.join(tmp, 'test-suite-firefox-home');
  assert.equal(env.CFFIXED_USER_HOME, home);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/Users/x');
  assert.ok(fs.statSync(home).isDirectory());
});

test('the firefox-desktop project carries the launch options for this platform', () => {
  const project = MATRIX.find(p => p.name === 'firefox-desktop');
  const expected = firefoxLaunchOptions();
  assert.deepEqual(Object.keys(project.use.launchOptions ?? {}), Object.keys(expected));
  if (process.platform === 'darwin') {
    assert.equal(project.use.launchOptions.env.CFFIXED_USER_HOME, expected.env.CFFIXED_USER_HOME);
  }
});
