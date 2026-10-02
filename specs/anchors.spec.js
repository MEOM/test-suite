import { test, expect } from '../lib/test.js';
import { features, selectors } from '../lib/suite.js';

test.describe('Skip link', () => {
  test.skip(!features.skipLink, 'skipLink: not on this site');

  test('skip link moves to the main content', async ({ page, browserName, isMobile }) => {
    await page.goto('/');
    const target = selectors.skipLinkTarget;

    // Chromium and Firefox desktop: Tab focuses the skip link first, the real
    // keyboard flow. WebKit does not tab to links by default and mobile
    // projects cannot click the visually hidden link, so those fire a
    // synthetic click. The check is the anchor's scroll and hash contract.
    if (!isMobile && browserName !== 'webkit') {
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toHaveAttribute('href', target);
      await page.keyboard.press('Enter');
    } else {
      await page.locator(`a[href="${target}"]`).first().dispatchEvent('click');
    }

    await expect(page).toHaveURL(new RegExp(`${target}$`));
    await expect
      .poll(() =>
        page.locator(target).evaluate(el => {
          const r = el.getBoundingClientRect();
          return r.top >= -5 && r.top < window.innerHeight / 2;
        })
      )
      .toBe(true);
  });
});

test.describe('Sticky header', () => {
  test.skip(!features.stickyHeader, 'stickyHeader: not on this site');

  test('header hides on scroll down and returns on scroll up', async ({ page }) => {
    await page.goto('/');

    // Headroom.js (kala-stack site-header.js) drives the header classes.
    const header = page.locator(selectors.header).first();
    await expect(header).toHaveClass(/headroom--top/);

    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await expect(header).toHaveClass(/headroom--unpinned/);
    await expect(header).not.toHaveClass(/headroom--top/);

    await page.evaluate(() => window.scrollBy({ top: -200, behavior: 'instant' }));
    await expect(header).toHaveClass(/headroom--pinned/);
  });
});
