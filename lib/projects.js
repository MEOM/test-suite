import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { devices } from '@playwright/test';

// Playwright's bundled Firefox resolves its app data to
// ~/Library/Application Support/Firefox, which macOS 27 protects when a real
// Firefox is installed, and the launch hangs. A home folder of the suite's own
// avoids it; Playwright still passes its own profile. Remove when Playwright
// ships the fix: https://github.com/microsoft/playwright/issues/42768
export function firefoxLaunchOptions(platform = process.platform, env = process.env, tmp = os.tmpdir()) {
  if (platform !== 'darwin') return {};
  const home = path.join(tmp, 'test-suite-firefox-home');
  fs.mkdirSync(home, { recursive: true });
  return { env: { ...env, CFFIXED_USER_HOME: home } };
}

// The browser x viewport matrix. playwright.config.js, the gallery and the
// image audit all read project names from here.
export const MATRIX = [
  { name: 'chrome-phone', use: { ...devices['Pixel 5'] } },
  { name: 'chrome-tablet', use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' } },
  { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  {
    name: 'firefox-desktop',
    use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 }, launchOptions: firefoxLaunchOptions() },
  },
  { name: 'safari-phone', use: { ...devices['iPhone 13'] } },
  { name: 'safari-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
];

export const PROJECT_NAMES = MATRIX.map(p => p.name);

// srcset selection depends on viewport and DPR, not the engine, so the image
// audit runs on the Chromium projects only.
export const CHROMIUM_PROJECTS = PROJECT_NAMES.filter(name => name.startsWith('chrome-'));
