import { test, expect, escapeRegExp } from '../lib/test.js';
import { features, selectors } from '../lib/suite.js';

const nav = features.navigation;

test.describe('Main navigation', () => {
  test.skip(!nav, 'navigation: not on this site');

  test('desktop: clicking a top-level link navigates', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop nav only');
    await page.goto('/');

    // desktopLink names a top-level item without a sub-menu. Items with a
    // sub-menu render as dropdown triggers and do not navigate.
    const link = page.locator(selectors.nav).getByRole('link', { name: nav.desktopLink, exact: true }).first();
    const href = await link.getAttribute('href');
    const expected = new URL(href, page.url()).pathname.replace(/\/$/, '');
    await link.click();
    await page.waitForURL(url => url.pathname.replace(/\/$/, '') === expected);
  });

  test('mobile: the menu toggle opens and closes the menu', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile nav only');
    await page.goto('/');

    const toggle = page.locator(selectors.navToggle).first();
    const menu = page.locator(selectors.nav).first();
    const openClass = new RegExp(`(^|\\s)${escapeRegExp(selectors.navOpenClass)}(\\s|$)`);

    // kala-stack's site-nav.js adds the open class after a short delay;
    // toHaveClass polls, so the delay is absorbed.
    await toggle.click();
    await expect(menu).toHaveClass(openClass);
    await toggle.click();
    await expect(menu).not.toHaveClass(openClass);
  });
});
