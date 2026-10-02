import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SUITE_DIR } from './config.js';
import { PLAYWRIGHT_CLI, playwrightTestArgs } from './cli.js';

test('Playwright runs from the package with the package config', () => {
  assert.ok(fs.existsSync(PLAYWRIGHT_CLI), `${PLAYWRIGHT_CLI} does not exist`);
  const args = playwrightTestArgs(['--grep-invert', '@config|@visual|@audit', '--grep', 'page loads']);
  assert.equal(args[0], PLAYWRIGHT_CLI);
  assert.deepEqual(args.slice(1, 4), ['test', '--config', path.join(SUITE_DIR, 'playwright.config.js')]);
  // Each argument stays one argument: no shell splits the pattern or the space.
  assert.deepEqual(args.slice(4), ['--grep-invert', '@config|@visual|@audit', '--grep', 'page loads']);
});
