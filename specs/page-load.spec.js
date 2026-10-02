import { test, expect } from '../lib/test.js';
import { pages, exceptions, blockedPatterns } from '../lib/suite.js';
import { isIgnorableConsoleError } from '../lib/console.js';

// Every page: expected HTTP status, no console errors, no unexpected 404
// resources, no broken images. Allowed 404s and console errors come from the
// config's exceptions, each with a reason shown in the launch report.
const allowedNotFound = exceptions.notFound.map(e => e.pattern);
const allowedConsole = exceptions.consoleErrors.map(e => e.pattern);

for (const pageDef of pages) {
  test(`page loads: ${pageDef.label} (${pageDef.path})`, async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const entry = { text: msg.text(), url: msg.location().url };
      if (isIgnorableConsoleError(entry, { blockedPatterns, allowedPatterns: allowedConsole })) return;
      consoleErrors.push(entry.text);
    });

    // Uncaught exceptions do not reach the console listener; Playwright
    // reports them as page errors. They count as console errors, and the same
    // consoleErrors exceptions can allow them.
    page.on('pageerror', err => {
      const text = `Uncaught ${err.name}: ${err.message}`;
      if (allowedConsole.some(re => re.test(text))) return;
      consoleErrors.push(text);
    });

    const notFound = [];
    page.on('response', res => {
      if (res.status() !== 404) return;
      const url = res.url();
      // The 404 page returns 404 for its own document on purpose.
      if (pageDef.slug === '404' && new URL(url).pathname === pageDef.path) return;
      if (allowedNotFound.some(re => re.test(url))) return;
      notFound.push(url);
    });

    const response = await page.goto(pageDef.path);
    const expectedStatus = pageDef.slug === '404' ? 404 : 200;
    expect(response.status(), `${pageDef.path} returned ${response.status()}`).toBe(expectedStatus);

    // Scroll the full page and back so loading="lazy" images get a fair chance
    // before being judged. WebKit reports an untriggered lazy <img> as
    // complete with naturalWidth 0, which would look broken.
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let y = 0;
        const step = () => {
          window.scrollTo(0, y);
          y += 400;
          if (y < document.body.scrollHeight) {
            requestAnimationFrame(step);
          } else {
            window.scrollTo(0, 0);
            setTimeout(resolve, 500);
          }
        };
        step();
      });
    });

    expect(notFound, `unexpected 404 resources:\n${notFound.join('\n')}`).toHaveLength(0);
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);

    // Broken means the browser tried a source and failed: resolved currentSrc,
    // complete, zero natural width. Never-triggered lazy images have no
    // currentSrc and are not counted.
    const brokenImages = await page.$$eval('img', imgs =>
      imgs.filter(img => img.currentSrc && img.complete && img.naturalWidth === 0).map(img => img.currentSrc)
    );
    expect(brokenImages, `broken images:\n${brokenImages.join('\n')}`).toHaveLength(0);
  });
}
