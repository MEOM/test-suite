// The Playwright `test` every spec imports. Its auto fixture runs before each
// test, ahead of the first navigation:
//   1. aborts the project's blockHosts and analytics collection requests
//   2. hides the WordPress toolbar when the run is logged in (wp-login), so
//      screenshots and layout measurements match an anonymous visitor
import { test as base, expect } from '@playwright/test';
import { environment, blockedPatterns } from './suite.js';

const ADMIN_BAR_CSS = '#wpadminbar { display: none !important; } html { margin-top: 0 !important; }';

export const test = base.extend({
  siteGuards: [
    async ({ page }, use) => {
      for (const pattern of blockedPatterns) {
        await page.route(pattern, route => route.abort());
      }
      if (environment.auth === 'wp-login') {
        await page.addInitScript(css => {
          const add = () => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
          };
          if (document.head) add();
          else document.addEventListener('DOMContentLoaded', add);
        }, ADMIN_BAR_CSS);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };

export const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
