// Validates tests.config.mjs and checks that every configured target exists on
// the site, in one browser. Run it after configuring and before every launch
// check.
import { loadSuiteOrExit, runPlaywrightTest } from './lib/cli.js';

const { config, environment } = await loadSuiteOrExit();
console.log(`Config check: ${config.name}, environment "${environment.name}" (${environment.baseURL})`);

const status = runPlaywrightTest(['--grep', '@config', '--project=chrome-desktop', '--retries=0'], { RUN_LABEL: 'config' });
if (status !== 0) {
  console.error('\nConfig check FAILED: the site does not match tests.config.mjs.');
  console.error('Each failure above names the config key to fix.');
  process.exit(status);
}
console.log('\nConfig check passed.');
