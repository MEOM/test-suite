import { test, expect } from '../lib/test.js';
import { pages, features, selectors } from '../lib/suite.js';

// Checks that the config matches the site before the matrix runs, so a failure
// in the real run means the site is broken, not the config. Runs on
// chrome-desktop only (check-config.js). Messages name the config key to fix.
const LOGIN_FORM = '#loginform';

test.describe('config check @config', () => {
  for (const p of pages) {
    const expected = p.slug === '404' ? 404 : 200;
    test(`pages: ${p.path} returns ${expected}`, async ({ page }) => {
      const res = await page.goto(p.path);
      await expect(
        page.locator(LOGIN_FORM),
        `${p.path} shows the WordPress login form: set auth for this environment or check the credentials`
      ).toHaveCount(0);
      expect(res.status(), `pages: ${p.path} returned ${res.status()}, expected ${expected}`).toBe(expected);
      if (expected === 200) {
        const finalPath = new URL(page.url()).pathname;
        expect(finalPath, `pages: ${p.path} redirects to ${finalPath}; use the final path`).toBe(p.path);
      }
    });
  }

  test('features.navigation: link and menu toggle exist', async ({ page }) => {
    test.skip(!features.navigation, 'navigation: not on this site');
    const name = features.navigation.desktopLink;
    await page.goto('/');
    const link = page.locator(selectors.nav).getByRole('link', { name, exact: true }).first();
    await expect(link, `features.navigation.desktopLink: no link "${name}" inside ${selectors.nav}`).toBeAttached();
    const href = await link.getAttribute('href');
    expect(
      Boolean(href) && !href.startsWith('#'),
      `features.navigation.desktopLink: "${name}" has href "${href}"; pick a top-level link without a sub-menu`
    ).toBe(true);
    await expect(page.locator(selectors.navToggle).first(), `selectors.navToggle: ${selectors.navToggle} not found`).toBeAttached();
  });

  test('features.skipLink: skip link and target exist', async ({ page }) => {
    test.skip(!features.skipLink, 'skipLink: not on this site');
    await page.goto('/');
    await expect(page.locator(`a[href="${selectors.skipLinkTarget}"]`).first(), `features.skipLink: no a[href="${selectors.skipLinkTarget}"]`).toBeAttached();
    await expect(page.locator(selectors.skipLinkTarget), `selectors.skipLinkTarget: ${selectors.skipLinkTarget} not found`).toBeAttached();
  });

  test('features.stickyHeader: Headroom header exists and the front page is tall enough', async ({ page }) => {
    test.skip(!features.stickyHeader, 'stickyHeader: not on this site');
    await page.goto('/');
    const header = page.locator(selectors.header).first();
    await expect(header, `selectors.header: ${selectors.header} not found`).toBeAttached();
    await expect(header, 'features.stickyHeader: the header has no headroom classes').toHaveClass(/headroom/);
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(
      scrollable,
      'features.stickyHeader: the front page must scroll at least 1200px for the header check'
    ).toBeGreaterThanOrEqual(1200);
  });

  test('features.accordion: accordion exists', async ({ page }) => {
    test.skip(!features.accordion, 'accordion: not on this site');
    await page.goto(features.accordion.path);
    await expect(
      page.locator(selectors.accordionHeader).first(),
      `features.accordion: no ${selectors.accordionHeader} on ${features.accordion.path}`
    ).toBeAttached();
  });

  test('features.form: single-page Gravity Form with a submit button exists', async ({ page }) => {
    test.skip(!features.form, 'form: not on this site');
    const { path, gravityFormId } = features.form;
    await page.goto(path);
    const root = page.locator(`#gform_${gravityFormId}`);
    await expect(root, `features.form: #gform_${gravityFormId} not found on ${path}`).toBeAttached();
    expect(await root.locator('.gform_page').count(), 'features.form: multi-page forms are not supported').toBeLessThanOrEqual(1);
    await expect(
      root.locator('input[type="submit"], button[type="submit"]').first(),
      'features.form: the form has no submit button'
    ).toBeAttached();
  });
});
