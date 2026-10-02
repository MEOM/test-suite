import path from 'node:path';
import { test } from '../lib/test.js';
import { pages, environment } from '../lib/suite.js';
import { stabilize } from '../lib/stabilize.js';
import { reportDir } from '../lib/environment.js';

// Full-page screenshot per page and project for the human visual review.
// build-gallery.js assembles them into screenshots/index.html.
const SCREENSHOT_DIR = path.join(reportDir(environment.name), 'screenshots');

for (const pageDef of pages) {
  test(`screenshot ${pageDef.label} @visual`, async ({ page }, testInfo) => {
    await page.goto(pageDef.path, { waitUntil: 'load' });
    await stabilize(page);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, pageDef.slug, `${testInfo.project.name}.png`),
      fullPage: true,
    });
  });
}
