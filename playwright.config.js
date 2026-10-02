import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { environment, credentials } from './lib/suite.js';
import { authStatePath, runDir } from './lib/environment.js';
import { MATRIX } from './lib/projects.js';

// Each Playwright run (config check, main run, image audit) writes to its own
// folder so one cannot overwrite another's results.
const out = runDir(environment.name, process.env.RUN_LABEL || 'main');
const wpLogin = environment.auth === 'wp-login';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  // Local dev containers get overwhelmed when several browser engines hit them
  // at once. Serial runs are slower but deterministic.
  workers: 1,
  // A local dev host occasionally drops a `load` event under a long run. Such a
  // flake clears on one retry; a real bug fails twice. Retried tests are shown
  // as flaky in the report.
  retries: 1,
  // Content-heavy pages plus lazy-image scrolling can exceed the 30s default.
  timeout: 90_000,
  globalSetup: './lib/global-setup.js',
  outputDir: path.join(out, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(out, 'playwright-report') }],
    ['json', { outputFile: path.join(out, 'results.json') }],
  ],
  use: {
    baseURL: environment.baseURL,
    ignoreHTTPSErrors: true, // local certificates are self-signed
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...(environment.auth === 'basic' ? { httpCredentials: credentials } : {}),
    ...(wpLogin ? { storageState: authStatePath(environment.name) } : {}),
  },
  projects: [
    ...(wpLogin
      ? [
          {
            name: 'setup',
            testMatch: /auth\.setup\.js$/,
            use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
          },
        ]
      : []),
    ...MATRIX.map(p => (wpLogin ? { ...p, dependencies: ['setup'] } : p)),
  ],
});
