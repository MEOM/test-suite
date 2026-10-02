import { test, expect } from '../lib/test.js';
import { features, selectors } from '../lib/suite.js';

// meomblocks accordion, hydrated by @meom/accordion: every header button gets
// aria-expanded="false" on init and a click toggles it to "true".
test('accordion opens when its header is clicked', async ({ page }) => {
  test.skip(!features.accordion, 'accordion: not on this site');
  await page.goto(features.accordion.path);

  const header = page.locator(selectors.accordionHeader).first();
  await header.scrollIntoViewIfNeeded();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
});
