import { test as setup, expect } from '@playwright/test';
import { credentials, environment } from '../lib/suite.js';
import { authStatePath } from '../lib/environment.js';

// Logs in once through the WordPress login form and saves the session for every
// project (auth: 'wp-login', for sites closed with wp-force-login). /wp-admin/
// on the site root redirects to the login form whether WordPress lives in a
// subdirectory or not.
//
// The form's own redirect_to defaults to the URL that triggered the redirect,
// here /wp-admin/ on the site root. On this site that is not the real
// wp-admin path (WordPress core lives in /wordpress), so following it back
// bounces through the login form again and clears the session that was just
// established. Pointing redirect_to at the site root instead avoids that
// bounce, and works the same way whether or not WordPress lives in a
// subdirectory.
setup('log in through the WordPress login form', async ({ page }) => {
  await page.goto('/wp-admin/');
  await page.locator('#user_login').fill(credentials.username);
  await page.locator('#user_pass').fill(credentials.password);
  await page
    .locator('#loginform input[name="redirect_to"]')
    .evaluate((el, value) => { el.value = value; }, '/');
  await Promise.all([
    page.waitForLoadState('load'),
    page.locator('#wp-submit').click(),
  ]);

  await expect(page.locator('#login_error'), 'WordPress rejected TEST_AUTH_USER / TEST_AUTH_PASSWORD').toHaveCount(0);
  await expect(page.locator('#loginform'), 'the site still shows the login form after logging in').toHaveCount(0);
  await page.context().storageState({ path: authStatePath(environment.name) });
});
