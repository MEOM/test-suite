// Shared helpers for the Node scripts and the CLI (bin/test-suite.js).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { SUITE_DIR, resolveConfigPath } from './config.js';

const require = createRequire(import.meta.url);

// Playwright is resolved from the package, never from the project, so every
// run uses the one @playwright/test instance the specs import.
export const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');
export const PLAYWRIGHT_CONFIG = path.join(SUITE_DIR, 'playwright.config.js');

// Imports lib/suite.js and turns a config error into a readable message and
// exit code 1 instead of a stack trace.
export async function loadSuiteOrExit() {
  try {
    return await import('./suite.js');
  } catch (err) {
    if (err.name === 'ConfigError') {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// Runs node in the current directory (the suite folder) with inherited output
// and returns its exit code. No shell, so grep patterns need no quoting. The
// absolute config path goes to the child, so it finds the same config
// whatever its working directory.
export function runNode(args, env = {}, label = args.join(' ')) {
  console.log(`\n$ ${label}`);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, SUITE_CONFIG: resolveConfigPath(), ...env },
  });
  return result.status ?? 1;
}

export const playwrightTestArgs = args => [PLAYWRIGHT_CLI, 'test', '--config', PLAYWRIGHT_CONFIG, ...args];

export const runPlaywrightTest = (args, env = {}) =>
  runNode(playwrightTestArgs(args), env, `playwright test ${args.join(' ')}`);

export const runPlaywright = args => runNode([PLAYWRIGHT_CLI, ...args], {}, `playwright ${args.join(' ')}`);

export const runScript = (name, args = [], env = {}) =>
  runNode([path.join(SUITE_DIR, name), ...args], env, [name, ...args].join(' '));
