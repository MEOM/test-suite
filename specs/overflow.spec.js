import { test, expect } from '../lib/test.js';
import { pages } from '../lib/suite.js';
import { stabilize } from '../lib/stabilize.js';

// No page may scroll sideways on any project. clientWidth excludes the
// vertical scrollbar, so scrollWidth minus clientWidth measures real page
// overflow only; inner overflow-x:auto regions (carousels, tables) are clipped
// and ignored. On failure the widest offending elements are named.
const TOLERANCE = 1; // px — absorbs cross-browser sub-pixel rounding.

for (const pageDef of pages) {
  test(`no horizontal overflow: ${pageDef.label}`, async ({ page }) => {
    await page.goto(pageDef.path, { waitUntil: 'load' });

    // stabilize() loads fonts and triggers lazy images, so an image that loads
    // wider than its container is included in the measured layout.
    await stabilize(page);

    const { overflow, offenders } = await page.evaluate(tol => {
      const el = document.documentElement;
      const overflow = el.scrollWidth - el.clientWidth;
      let offenders = [];
      if (overflow > tol) {
        const limit = el.clientWidth + tol;
        offenders = Array.from(document.querySelectorAll('*'))
          .map(node => ({ node, right: node.getBoundingClientRect().right }))
          .filter(item => item.right > limit)
          .sort((a, b) => b.right - a.right)
          .slice(0, 5)
          .map(item => {
            const node = item.node;
            const id = node.id ? `#${node.id}` : '';
            const cls = node.classList[0] ? `.${node.classList[0]}` : '';
            return `${node.tagName.toLowerCase()}${id}${cls} → right=${Math.round(item.right)}`;
          });
      }
      return { overflow, offenders };
    }, TOLERANCE);

    const detail = offenders.length
      ? `\nWidest offenders:\n  ${offenders.join('\n  ')}`
      : '';
    expect(
      overflow,
      `${pageDef.path} overflows horizontally by ${Math.round(overflow)}px.${detail}`
    ).toBeLessThanOrEqual(TOLERANCE);
  });
}
