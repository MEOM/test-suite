import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';

// What a project receives. npm packs git dependencies too, so this list is
// exactly what a git install puts in node_modules/@meom/test-suite.
test('the package ships the suite and nothing else', () => {
  const [{ files }] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: SUITE_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
  );
  const shipped = files.map(f => f.path);
  for (const required of [
    'bin/test-suite.js',
    'lib/config.js',
    'lib/cli.js',
    'lib/version.js',
    'lib/browsers.js',
    'specs/page-load.spec.js',
    'specs/auth.setup.js',
    'playwright.config.js',
    'launch-check.js',
    'check-config.js',
    'image-audit.js',
    'build-gallery.js',
    'README.md',
    'AGENTS.md',
    'examples/example-site.tests.config.mjs',
    'package.json',
  ]) {
    assert.ok(shipped.includes(required), `${required} is missing from the package`);
  }
  for (const path of shipped) {
    assert.ok(!/\.test\.js$/.test(path), `${path} is a unit test`);
    assert.ok(!/^(testbed|docs|node_modules|report)\//.test(path), `${path} must not ship`);
  }
});

// Built from parts so this test file does not itself contain the name.
const CLIENT_NAME = new RegExp(['ol', 'mar'].join(''), 'i');

test('no shipped file names a client site', () => {
  const [{ files }] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: SUITE_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
  );
  for (const { path: file } of files) {
    assert.doesNotMatch(fs.readFileSync(join(SUITE_DIR, file), 'utf8'), CLIENT_NAME, `${file} names a client site`);
  }
});
