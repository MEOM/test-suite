# Generic Launch Check Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the olmar-specific Playwright suite in `tests/` into a generic kala-stack launch check that reads every site-specific value from `tests.config.mjs` in the project root, runs against a chosen environment and writes one standard launch report.

**Architecture:** A config loader (`lib/config.js`) validates the project config and applies kala-stack defaults. `lib/environment.js` resolves `TEST_ENV`, credentials and output paths. `lib/suite.js` loads both once with top-level await, and every spec, script and `playwright.config.js` imports from it. Specs import an extended `test` (`lib/test.js`) whose auto fixture blocks hosts, blocks analytics and hides the admin bar. Orchestrators (`check-config.js`, `launch-check.js`, `image-audit.js`, `build-gallery.js`) run Playwright in child processes and `lib/report.js` renders the Markdown launch report from Playwright's JSON output.

**Tech Stack:** Node.js 21.7+ (ESM, `node:test`, `util.parseEnv`), `@playwright/test` 1.60 (installed), `yaml` ^2.5 (new devDependency). Local site: Seravo Docker container, WP-CLI through `docker compose exec`.

**Spec:** `docs/superpowers/specs/2026-09-29-generic-launch-check-design.md`

## Global Constraints

- The suite in `tests/` contains no site-specific values. Site values live only in `tests.config.mjs` (project root) and in `examples/`.
- The project config file is `tests.config.mjs`. It is `.mjs` because the kala-stack root `package.json` has no `"type": "module"`, so a `.js` file with `export default` fails to import (verified 2026-09-29).
- Config path: `SUITE_CONFIG` env var if set, else `../tests.config.mjs` relative to `tests/`. Project root = directory containing the config file.
- Feature keys, exactly: `navigation`, `skipLink`, `stickyHeader`, `accordion`, `form`. Every key must be present; unknown keys are errors.
- Every exception entry is `{ pattern: RegExp, reason: string, env?: string[] }`; a missing or empty `reason` is an error.
- The 404 page is appended automatically as `{ slug: '404', path: '/launch-check-404/', label: '404' }`; a config page with slug `404` is an error.
- Selector defaults: `nav: '.js-site-nav'`, `navToggle: '.js-site-nav-toggle'`, `navOpenClass: 'is-opened'`, `header: '.js-site-header'`, `skipLinkTarget: '#content'`, `accordionHeader: '.accordion__header'`.
- `TEST_ENV` defaults to `local`. Credentials: `TEST_AUTH_USER` / `TEST_AUTH_PASSWORD`, shell env wins over `<project root>/.env.tests`.
- Tags: `@config` (check-config spec), `@visual` (screenshots), `@audit` (image audit). `npm test` excludes all three.
- `workers: 1`, `retries: 1`, `timeout: 90_000`, `navigationTimeout: 60_000` stay as in the olmar suite.
- Output root: `tests/report/<env>/`. Playwright runs write to `tests/report/<env>/runs/<RUN_LABEL>/` (`config`, `main`, `audit`; default `main`). Screenshots in `report/<env>/screenshots/`, image audit in `report/<env>/image-audit/`, report at `report/<env>/launch-report.md`. `tests/report/` and `tests/.auth/` are gitignored by `tests/.gitignore`.
- ESM everywhere, `.js` import extensions, 2-space indentation in new files.
- Docs and comments follow the user's writing rules: no long dashes (use commas or split sentences), no filler phrases.
- Honesty rules: never weaken an assertion to make a check pass; every exception needs a reason.
- WP-CLI on the test bed: `docker compose exec -T --user vagrant wordpress wp ...` from the repo root `/Users/aleksi/work/test-suite`.

## Review Focus

1. **Aborted requests produce console errors.** Blocking a host or analytics makes browsers log "Failed to load resource" for that URL; page-load must ignore those while still failing on real errors. Pinned by `lib/console.test.js` (Task 5).
2. **Gravity Forms payload encodings.** A body may be multipart or URL-encoded, and `+`, `@` and spaces encode differently; the form check must find the typed values in both. Pinned by `lib/form.test.js` (Task 7).
3. **Page paths that redirect** (missing trailing slash, Polylang front page). `check-config` must fail and name the final path instead of silently testing the redirect target. Pinned by the negative check in Task 13 Step 4.
4. **Missing Playwright results** (the run crashed before writing `results.json`). The report must still render and say the functional run did not complete, with verdict FAILED. Pinned by `lib/report.test.js` (Task 11).
5. **ANSI colour codes in failure messages.** Playwright error messages contain escape codes that would garble the Markdown report; the report strips them. Pinned by `lib/report.test.js` (Task 11).

---

### Task 1: Baseline commit, cleanup, spec amendments

Commit the suite exactly as copied from olmar so later diffs are reviewable, then remove what the spec drops.

**Files:**
- Create: `tests/.gitignore`
- Delete: `tests/screenshots/`, `tests/playwright-report/`, `tests/test-results/`, `tests/image-audit/` (generated olmar output, untracked)
- Delete: `tests/specs/visual-regression.spec.js`, `tests/visual-regression.js`
- Modify: `tests/package.json`, `tests/playwright.config.js` (remove `expect` block)
- Modify: `docs/superpowers/specs/2026-09-29-generic-launch-check-design.md`

**Interfaces:**
- Produces: a tracked `tests/` baseline; `tests/.gitignore` rules used by every later task.

- [ ] **Step 1: Remove generated output copied from olmar**

These are olmar run artifacts (310 MB of screenshots, old reports). Confirm they are untracked, then delete:

```bash
cd /Users/aleksi/work/test-suite
git ls-files tests | head -1   # expect no output: tests/ is untracked
rm -rf tests/screenshots tests/playwright-report tests/test-results tests/image-audit
```

- [ ] **Step 2: Add `tests/.gitignore`**

```
node_modules/
report/
.auth/
```

- [ ] **Step 3: Commit the baseline**

```bash
cd /Users/aleksi/work/test-suite
git add tests
git status --short tests | grep -v '^A ' ; echo "exit=$?"   # expect exit=1 (only added files)
git commit -m "Add launch check suite as copied from olmar"
```

- [ ] **Step 4: Remove the paused plugin-update regression**

```bash
cd /Users/aleksi/work/test-suite/tests
git rm specs/visual-regression.spec.js visual-regression.js
```

In `tests/playwright.config.js`, delete this block:

```js
    expect: {
        // Visual-regression diff tolerances (visual-regression.spec.js). Starting
        // values — tune after the first real run. maxDiffPixelRatio absorbs ~1%
        // incidental pixel noise; threshold is per-pixel colour sensitivity.
        toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2 },
    },
```

Replace `tests/package.json` with (scripts are finalized in later tasks; this removes the regression scripts and adds `yaml`):

```json
{
  "name": "kala-launch-check",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "playwright test --grep-invert \"@config|@visual|@audit\"",
    "test:visual": "playwright test --grep @visual && node build-gallery.js",
    "audit:images": "node image-audit.js",
    "test:unit": "node --test lib/*.test.js"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "yaml": "^2.5.0"
  }
}
```

Run: `cd /Users/aleksi/work/test-suite/tests && npm install`
Expected: installs `yaml`; `package-lock.json` updated.

- [ ] **Step 5: Amend the spec to match decisions made while planning**

In `docs/superpowers/specs/2026-09-29-generic-launch-check-design.md` make these replacements:

1. Every `tests.config.js` becomes `tests.config.mjs`. After the first occurrence in section 1 ("**The project**" block), add the sentence: `The file is .mjs because the kala-stack root package.json is not "type": "module", so a .js file with export default cannot be imported.`
2. In section 1's suite tree, add under `lib/`:
   ```
       suite.js             loads config + environment once; imported everywhere
       projects.js          the 6-project matrix
       cli.js               shared helpers for the Node scripts
       console.js           which console errors page-load ignores
       form.js              Gravity Forms fill values and payload matching
       audit-rows.js        reads image audit data files
       global-setup.js      prints the environment at the start of a run
   ```
   and replace the `fixtures/` sentence with: `fixtures/pages.js is deleted; pages come from the config. fixtures/stabilize.js moves to lib/stabilize.js.`
3. In section 3, replace `with process.loadEnvFile` with `with util.parseEnv (the shell environment wins over the file)`.
4. In section 4's Output block, replace the tree with:
   ```
   tests/report/<env>/
     launch-report.md
     runs/config/           check-config run: results.json, playwright-report/, test-results/
     runs/main/             functional + screenshots run
     runs/audit/            image audit run
     screenshots/           gallery index.html + PNGs
     image-audit/           data/*.json + report.md
   ```
   and add: `Each Playwright run writes to its own runs/<label>/ folder so the image audit run cannot overwrite the functional results.`
5. In section 7, replace `a form without its submit button` with `Gravity Forms deactivated, so check-config fails on the form target`.
6. In section 1's "Rules" list, add: `tests/.gitignore ignores report/ and .auth/ so the suite carries its own ignore rules wherever it is installed.`

- [ ] **Step 6: Verify and commit**

Run: `cd /Users/aleksi/work/test-suite && grep -c "tests.config.js" docs/superpowers/specs/2026-09-29-generic-launch-check-design.md`
Expected: `0`

```bash
cd /Users/aleksi/work/test-suite
git add tests docs/superpowers/specs/2026-09-29-generic-launch-check-design.md
git commit -m "Remove plugin-update regression from the template; amend spec"
```

---

### Task 2: Test bed content

Make `test-suite.local` a site with every feature the suite checks. The seed script is committed so the test bed can be rebuilt.

**Files:**
- Create: `testbed/seed.sh`, `testbed/gf-form.php`, `testbed/content/home.html`, `testbed/content/about.html`, `testbed/content/contact.html`, `testbed/README.md`

**Interfaces:**
- Produces (used by Tasks 5 to 13): pages `/`, `/about/`, `/news/`, `/first-news-post/`, `/book/`, `/book/sample-book/`, `/contact/`; main menu with top-level link "About"; Gravity Form id printed by the script (1 on a fresh install); accordion on `/contact/`; Subscriber `launchcheck` with credentials in `/Users/aleksi/work/test-suite/.env.tests`.

- [ ] **Step 1: Confirm the container and WordPress are up**

```bash
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp core is-installed && echo installed
```
Expected: `installed`. If the container is not running, ask the developer to start it (`docker compose up -d`) and stop.

- [ ] **Step 2: Write `testbed/gf-form.php`**

```php
<?php
// Creates the test bed contact form and prints its id. Run with wp eval-file.
$form_id = GFAPI::add_form(
	[
		'title'  => 'Launch check contact',
		'button' => [ 'type' => 'text', 'text' => 'Send' ],
		'fields' => [
			[ 'type' => 'text', 'id' => 1, 'label' => 'Name', 'isRequired' => true ],
			[ 'type' => 'email', 'id' => 2, 'label' => 'Email', 'isRequired' => true ],
			[ 'type' => 'phone', 'id' => 3, 'label' => 'Phone', 'phoneFormat' => 'international' ],
			[ 'type' => 'textarea', 'id' => 4, 'label' => 'Message' ],
			[
				'type'       => 'checkbox',
				'id'         => 5,
				'label'      => 'Consent',
				'isRequired' => true,
				'choices'    => [ [ 'text' => 'I agree to the privacy policy', 'value' => 'agree' ] ],
				'inputs'     => [ [ 'id' => '5.1', 'label' => 'I agree to the privacy policy' ] ],
			],
		],
	]
);
if ( is_wp_error( $form_id ) ) {
	WP_CLI::error( $form_id->get_error_message() );
}
echo $form_id;
```

- [ ] **Step 3: Write the page content files**

`testbed/content/home.html` (tall enough for the sticky header check: over 2100px on a 900px desktop viewport):

```html
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Launch check test bed</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>This site exists to verify the launch check suite. Every section below adds height so the sticky header can be tested.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"600px"} -->
<div style="height:600px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Second section</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Placeholder text for the second section.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"600px"} -->
<div style="height:600px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Third section</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Placeholder text for the third section.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"600px"} -->
<div style="height:600px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Fourth section</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Placeholder text for the fourth section.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"600px"} -->
<div style="height:600px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
```

`testbed/content/about.html` (`__IMAGE_ID__` and `__IMAGE_URL__` are replaced by the seed script; the image is shown at 300px, so the image audit has something to report):

```html
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">About</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>A basic page with a large image shown small.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":__IMAGE_ID__,"width":"300px","sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large is-resized"><img src="__IMAGE_URL__" alt="Test bed image" class="wp-image-__IMAGE_ID__" style="width:300px"/></figure>
<!-- /wp:image -->
```

`testbed/content/contact.html` (`__FORM_ID__` is replaced by the seed script; meomblocks containers carry no wrapper div in serialized markup):

```html
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Contact</h1>
<!-- /wp:heading -->

<!-- wp:meomblocks/accordion -->
<!-- wp:meomblocks/accordion-item {"title":"How fast do you reply?"} -->
<!-- wp:paragraph -->
<p>Within one working day.</p>
<!-- /wp:paragraph -->
<!-- /wp:meomblocks/accordion-item -->

<!-- wp:meomblocks/accordion-item {"title":"Where are you located?"} -->
<!-- wp:paragraph -->
<p>Helsinki.</p>
<!-- /wp:paragraph -->
<!-- /wp:meomblocks/accordion-item -->
<!-- /wp:meomblocks/accordion -->

<!-- wp:gravityforms/form {"formId":"__FORM_ID__","title":false,"description":false,"ajax":false} /-->
```

- [ ] **Step 4: Write `testbed/seed.sh`**

```bash
#!/usr/bin/env bash
# Seeds the launch check test bed (test-suite.local). Run from the repo root on
# a fresh WordPress install. Refuses to run twice.
set -euo pipefail

cd "$(dirname "$0")/.."
wp() { docker compose exec -T --user vagrant wordpress wp "$@" 2>/dev/null; }
content() { cat "testbed/content/$1"; }

if [ -n "$(wp post list --post_type=page --name=contact --field=ID)" ]; then
  echo "Test bed already seeded (a page named 'contact' exists). Aborting." >&2
  exit 1
fi

# WordPress lives in /wordpress; the site itself is served from the root.
wp option update home https://test-suite.local
wp rewrite structure '/%postname%/' --hard

image_id=$(wp media import /data/wordpress/htdocs/wp-content/themes/test-suite/screenshot.png --title="Test bed image" --porcelain)
image_url=$(wp eval "echo wp_get_attachment_image_url($image_id, 'large');")
form_id=$(wp eval-file /data/wordpress/testbed/gf-form.php)

home_id=$(wp post create --post_type=page --post_status=publish --post_title=Home --post_name=home --post_content="$(content home.html)" --porcelain)
about_id=$(wp post create --post_type=page --post_status=publish --post_title=About --post_name=about \
  --post_content="$(content about.html | sed "s|__IMAGE_ID__|$image_id|g; s|__IMAGE_URL__|$image_url|g")" --porcelain)
contact_id=$(wp post create --post_type=page --post_status=publish --post_title=Contact --post_name=contact \
  --post_content="$(content contact.html | sed "s|__FORM_ID__|$form_id|g")" --porcelain)
news_id=$(wp post create --post_type=page --post_status=publish --post_title=News --post_name=news --porcelain)

wp post create --post_type=post --post_status=publish --post_title="First news post" --post_name=first-news-post \
  --post_content='<!-- wp:paragraph --><p>The first news post.</p><!-- /wp:paragraph -->' --porcelain
wp post create --post_type=post --post_status=publish --post_title="Second news post" --post_name=second-news-post \
  --post_content='<!-- wp:paragraph --><p>The second news post.</p><!-- /wp:paragraph -->' --porcelain
wp post create --post_type=book --post_status=publish --post_title="Sample book" --post_name=sample-book \
  --post_content='<!-- wp:paragraph --><p>A sample book.</p><!-- /wp:paragraph -->' --porcelain

wp option update show_on_front page
wp option update page_on_front "$home_id"
wp option update page_for_posts "$news_id"

menu_id=$(wp menu create "Main" --porcelain)
wp menu item add-post "$menu_id" "$about_id" --title=About
wp menu item add-post "$menu_id" "$news_id" --title=News
wp menu item add-custom "$menu_id" Books https://test-suite.local/book/
wp menu item add-post "$menu_id" "$contact_id" --title=Contact
wp menu location assign "$menu_id" main_menu

password=$(openssl rand -hex 12)
wp user create launchcheck launchcheck@example.com --role=subscriber --user_pass="$password" --porcelain
printf 'TEST_AUTH_USER=launchcheck\nTEST_AUTH_PASSWORD=%s\n' "$password" > .env.tests

wp rewrite flush --hard
echo "Seeded. Gravity Form id: $form_id. Credentials written to .env.tests."
```

`testbed/README.md`:

```markdown
# Test bed

`test-suite.local` is the site the launch check suite is verified against. It
has one page per template type and every feature the suite checks: a main menu,
the skip link, the Headroom header, a meomblocks accordion and a Gravity Form.

Rebuild it on a fresh WordPress install, from the repo root:

    bash testbed/seed.sh

The script also creates the Subscriber `launchcheck` and writes its credentials
to `.env.tests` (gitignored) for the login check.
```

- [ ] **Step 5: Run the seed script and verify the site**

```bash
cd /Users/aleksi/work/test-suite
chmod +x testbed/seed.sh
bash testbed/seed.sh
for p in / /about/ /news/ /first-news-post/ /book/ /book/sample-book/ /contact/ /launch-check-404/; do
  printf '%s %s\n' "$(curl -sk -o /dev/null -w '%{http_code}' https://test-suite.local$p)" "$p"
done
curl -sk https://test-suite.local/contact/ | grep -c 'gform_\|accordion__header'
curl -sk https://test-suite.local/ | grep -o 'js-site-nav-toggle' | head -1
```
Expected: `200` for every page, `404` for `/launch-check-404/`; the grep count is at least 2; `js-site-nav-toggle` is printed. If `/book/` is 404, flush rewrites again (`wp rewrite flush --hard`). If the accordion markup is missing, read `htdocs/wp-content/plugins/meomblocks/src/blocks/accordion/save.js` and fix `contact.html` to match what the editor serializes.

- [ ] **Step 6: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add testbed
git commit -m "Add reproducible launch check test bed seed"
```

---

### Task 3: Config loader

**Files:**
- Create: `tests/lib/config.js`
- Test: `tests/lib/config.test.js`

**Interfaces:**
- Produces:
  - `SUITE_DIR: string` (absolute path of `tests/`)
  - `FEATURE_KEYS: string[]`, `DEFAULT_SELECTORS: object`, `NOT_FOUND_PAGE: { slug, path, label }`
  - `class ConfigError extends Error { problems: string[] }`
  - `resolveConfigPath(env = process.env): string`
  - `localBaseURLFromYaml(projectRoot: string): string | null`
  - `normalizeConfig(raw, { projectRoot }): NormalizedConfig` throws `ConfigError`
  - `loadConfig(env = process.env): Promise<NormalizedConfig & { file: string }>`
  - `NormalizedConfig = { name, projectRoot, environments: { [name]: { baseURL, auth: 'basic'|'wp-login'|null } }, pages: [{slug,path,label}] (404 last), features: { navigation, skipLink, stickyHeader, accordion, form }, exceptions: { notFound, consoleErrors, blockHosts: [{ pattern, reason, env: string[]|null }] }, selectors, blockAnalytics: boolean }`

- [ ] **Step 1: Write the failing tests**

`tests/lib/config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeConfig,
  loadConfig,
  resolveConfigPath,
  ConfigError,
  DEFAULT_SELECTORS,
  NOT_FOUND_PAGE,
  SUITE_DIR,
} from './config.js';

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-config-'));

function valid() {
  return {
    name: 'Test site',
    environments: { local: { baseURL: 'https://site.local/' } },
    pages: [{ slug: 'front', path: '/', label: 'Front page' }],
    features: {
      navigation: { desktopLink: 'About' },
      skipLink: true,
      stickyHeader: false,
      accordion: false,
      form: { path: '/contact/', gravityFormId: 1 },
    },
  };
}

function problemsOf(raw, root = projectRoot) {
  try {
    normalizeConfig(raw, { projectRoot: root });
  } catch (err) {
    assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err}`);
    return err.problems;
  }
  assert.fail('expected normalizeConfig to throw');
}

test('valid config gets defaults and the 404 page', () => {
  const c = normalizeConfig(valid(), { projectRoot });
  assert.equal(c.environments.local.baseURL, 'https://site.local');
  assert.equal(c.environments.local.auth, null);
  assert.deepEqual(c.pages.at(-1), NOT_FOUND_PAGE);
  assert.equal(c.pages.length, 2);
  assert.deepEqual(c.selectors, DEFAULT_SELECTORS);
  assert.equal(c.blockAnalytics, true);
  assert.deepEqual(c.exceptions, { notFound: [], consoleErrors: [], blockHosts: [] });
  assert.equal(c.projectRoot, projectRoot);
});

test('missing feature key is an error', () => {
  const raw = valid();
  delete raw.features.form;
  assert.ok(problemsOf(raw).some(p => p.includes('features.form is missing')));
});

test('unknown feature key is an error', () => {
  const raw = valid();
  raw.features.carousel = true;
  assert.ok(problemsOf(raw).some(p => p.includes('features.carousel is not a known feature')));
});

test('invalid feature values are errors', () => {
  const raw = valid();
  raw.features.navigation = true;
  raw.features.form = { path: '/contact/' };
  raw.features.skipLink = 'yes';
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.startsWith('features.navigation')));
  assert.ok(problems.some(p => p.startsWith('features.form')));
  assert.ok(problems.some(p => p.startsWith('features.skipLink')));
});

test('exception without reason is an error', () => {
  const raw = valid();
  raw.exceptions = { notFound: [{ pattern: /x\.mov$/ }] };
  assert.ok(problemsOf(raw).some(p => p.includes('exceptions.notFound[0].reason is required')));
});

test('exception pattern must be a RegExp and env must be configured', () => {
  const raw = valid();
  raw.exceptions = { blockHosts: [{ pattern: 'cookiebot.com', reason: 'r', env: ['staging'] }] };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('exceptions.blockHosts[0].pattern must be a RegExp')));
  assert.ok(problems.some(p => p.includes('exceptions.blockHosts[0].env')));
});

test('unknown exception kind is an error', () => {
  const raw = valid();
  raw.exceptions = { redirects: [] };
  assert.ok(problemsOf(raw).some(p => p.includes('exceptions.redirects is not known')));
});

test('slug 404 is reserved and duplicate slugs are errors', () => {
  const raw = valid();
  raw.pages.push({ slug: '404', path: '/x/', label: 'x' }, { slug: 'front', path: '/y/', label: 'y' });
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('slug "404" is reserved')));
  assert.ok(problems.some(p => p.includes('duplicate slug "front"')));
});

test('page path must start with a slash', () => {
  const raw = valid();
  raw.pages[0].path = 'about/';
  assert.ok(problemsOf(raw).some(p => p.includes('pages[0].path must start with "/"')));
});

test('local baseURL defaults from config.yml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-yaml-'));
  fs.writeFileSync(
    path.join(root, 'config.yml'),
    'name: demo\ndevelopment:\n  domains:\n    - demo.local\n'
  );
  const raw = valid();
  raw.environments = { local: {} };
  const c = normalizeConfig(raw, { projectRoot: root });
  assert.equal(c.environments.local.baseURL, 'https://demo.local');
});

test('missing local baseURL without config.yml is an error', () => {
  const raw = valid();
  raw.environments = { local: {} };
  assert.ok(problemsOf(raw).some(p => p.includes('config.yml has no development.domains[0]')));
});

test('environments.local is required and auth must be known', () => {
  const raw = valid();
  raw.environments = { staging: { baseURL: 'https://s.example.com', auth: 'oauth' } };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('environments.local is required')));
  assert.ok(problems.some(p => p.includes('environments.staging.auth must be one of')));
});

test('selectors: unknown key and non-id skip link target are errors', () => {
  const raw = valid();
  raw.selectors = { footer: '.x', skipLinkTarget: '.content' };
  const problems = problemsOf(raw);
  assert.ok(problems.some(p => p.includes('selectors.footer is not known')));
  assert.ok(problems.some(p => p.includes('selectors.skipLinkTarget must be an id selector')));
});

test('selector overrides merge with defaults', () => {
  const raw = valid();
  raw.selectors = { header: '.site-header' };
  const c = normalizeConfig(raw, { projectRoot });
  assert.equal(c.selectors.header, '.site-header');
  assert.equal(c.selectors.nav, DEFAULT_SELECTORS.nav);
});

test('unknown top-level key is an error', () => {
  const raw = valid();
  raw.pagez = [];
  assert.ok(problemsOf(raw).some(p => p.includes('pagez is not a known config key')));
});

test('all problems are reported at once', () => {
  const raw = valid();
  delete raw.name;
  delete raw.features.skipLink;
  assert.ok(problemsOf(raw).length >= 2);
});

test('resolveConfigPath honours SUITE_CONFIG and defaults to the parent directory', () => {
  assert.equal(resolveConfigPath({ SUITE_CONFIG: '/x/y.mjs' }), '/x/y.mjs');
  assert.equal(resolveConfigPath({}), path.resolve(SUITE_DIR, '..', 'tests.config.mjs'));
});

test('loadConfig imports the file and reports a missing file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-load-'));
  const file = path.join(root, 'tests.config.mjs');
  fs.writeFileSync(file, `export default ${JSON.stringify(valid())};\n`);
  const c = await loadConfig({ SUITE_CONFIG: file });
  assert.equal(c.name, 'Test site');
  assert.equal(c.file, file);
  await assert.rejects(loadConfig({ SUITE_CONFIG: path.join(root, 'nope.mjs') }), ConfigError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/config.test.js`
Expected: FAIL, `Cannot find module .../lib/config.js`.

- [ ] **Step 3: Implement `tests/lib/config.js`**

```js
// Loads, defaults and validates the project's tests.config.mjs. Every spec and
// script reads site-specific values from here, never from its own constants.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const SUITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FEATURE_KEYS = ['navigation', 'skipLink', 'stickyHeader', 'accordion', 'form'];

// kala-stack markup. Override per site under `selectors` only when it differs.
export const DEFAULT_SELECTORS = {
  nav: '.js-site-nav',
  navToggle: '.js-site-nav-toggle',
  navOpenClass: 'is-opened',
  header: '.js-site-header',
  skipLinkTarget: '#content',
  accordionHeader: '.accordion__header',
};

export const NOT_FOUND_PAGE = { slug: '404', path: '/launch-check-404/', label: '404' };

const TOP_LEVEL_KEYS = ['name', 'environments', 'pages', 'features', 'exceptions', 'selectors', 'blockAnalytics'];
const AUTH_TYPES = ['basic', 'wp-login'];
const EXCEPTION_KINDS = ['notFound', 'consoleErrors', 'blockHosts'];

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid launch check config:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim() !== '';
const isPath = v => typeof v === 'string' && v.startsWith('/');

const FEATURE_RULES = {
  navigation: v =>
    v === false || (isObject(v) && isNonEmptyString(v.desktopLink))
      ? null
      : 'must be false or { desktopLink: "<text of a top-level link without a sub-menu>" }',
  skipLink: v => (typeof v === 'boolean' ? null : 'must be true or false'),
  stickyHeader: v => (typeof v === 'boolean' ? null : 'must be true or false'),
  accordion: v =>
    v === false || (isObject(v) && isPath(v.path)) ? null : 'must be false or { path: "/page-with-accordion/" }',
  form: v =>
    v === false || (isObject(v) && isPath(v.path) && Number.isInteger(v.gravityFormId) && v.gravityFormId > 0)
      ? null
      : 'must be false or { path: "/page-with-form/", gravityFormId: <number> }',
};

export function resolveConfigPath(env = process.env) {
  return env.SUITE_CONFIG
    ? path.resolve(env.SUITE_CONFIG)
    : path.resolve(SUITE_DIR, '..', 'tests.config.mjs');
}

export function localBaseURLFromYaml(projectRoot) {
  const file = path.join(projectRoot, 'config.yml');
  if (!fs.existsSync(file)) return null;
  const domain = parseYaml(fs.readFileSync(file, 'utf8'))?.development?.domains?.[0];
  return domain ? `https://${domain}` : null;
}

function normalizeEnvironments(raw, projectRoot, problems) {
  const environments = {};
  if (!isObject(raw)) {
    problems.push('environments must be an object with at least a "local" entry');
    return environments;
  }
  if (!('local' in raw)) problems.push('environments.local is required');
  for (const [name, def] of Object.entries(raw)) {
    if (!isObject(def)) {
      problems.push(`environments.${name} must be an object`);
      continue;
    }
    let baseURL = def.baseURL;
    if (baseURL === undefined && name === 'local') baseURL = localBaseURLFromYaml(projectRoot);
    if (typeof baseURL !== 'string' || !/^https?:\/\//.test(baseURL)) {
      problems.push(
        name === 'local' && def.baseURL === undefined
          ? 'environments.local.baseURL is missing and config.yml has no development.domains[0]'
          : `environments.${name}.baseURL must be an http(s) URL`
      );
    }
    if (def.auth !== undefined && !AUTH_TYPES.includes(def.auth)) {
      problems.push(`environments.${name}.auth must be one of: ${AUTH_TYPES.join(', ')}`);
    }
    environments[name] = {
      baseURL: typeof baseURL === 'string' ? baseURL.replace(/\/+$/, '') : null,
      auth: def.auth ?? null,
    };
  }
  return environments;
}

function normalizePages(raw, problems) {
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push('pages must be a non-empty array of { slug, path, label }');
    return [];
  }
  const pages = [];
  const seen = new Set();
  raw.forEach((p, i) => {
    const where = `pages[${i}]`;
    if (!isObject(p)) {
      problems.push(`${where} must be an object`);
      return;
    }
    for (const key of ['slug', 'path', 'label']) {
      if (!isNonEmptyString(p[key])) problems.push(`${where}.${key} must be a non-empty string`);
    }
    if (typeof p.path === 'string' && !p.path.startsWith('/')) problems.push(`${where}.path must start with "/"`);
    if (p.slug === NOT_FOUND_PAGE.slug) {
      problems.push(`${where}: slug "404" is reserved; the 404 page is added automatically`);
    }
    if (seen.has(p.slug)) problems.push(`${where}: duplicate slug "${p.slug}"`);
    seen.add(p.slug);
    pages.push({ slug: p.slug, path: p.path, label: p.label });
  });
  pages.push({ ...NOT_FOUND_PAGE });
  return pages;
}

function normalizeFeatures(raw, problems) {
  const features = {};
  if (!isObject(raw)) {
    problems.push(`features must be an object with keys: ${FEATURE_KEYS.join(', ')}`);
    return features;
  }
  for (const key of Object.keys(raw)) {
    if (!FEATURE_KEYS.includes(key)) {
      problems.push(`features.${key} is not a known feature (known: ${FEATURE_KEYS.join(', ')})`);
    }
  }
  for (const key of FEATURE_KEYS) {
    if (!(key in raw)) {
      problems.push(`features.${key} is missing; set it, or set it to false if the site does not have it`);
      continue;
    }
    const problem = FEATURE_RULES[key](raw[key]);
    if (problem) problems.push(`features.${key} ${problem}`);
    features[key] = raw[key];
  }
  return features;
}

function normalizeExceptions(raw, environments, problems) {
  const exceptions = { notFound: [], consoleErrors: [], blockHosts: [] };
  if (raw === undefined) return exceptions;
  if (!isObject(raw)) {
    problems.push('exceptions must be an object');
    return exceptions;
  }
  for (const key of Object.keys(raw)) {
    if (!EXCEPTION_KINDS.includes(key)) {
      problems.push(`exceptions.${key} is not known (known: ${EXCEPTION_KINDS.join(', ')})`);
    }
  }
  for (const kind of EXCEPTION_KINDS) {
    const list = raw[kind] ?? [];
    if (!Array.isArray(list)) {
      problems.push(`exceptions.${kind} must be an array`);
      continue;
    }
    list.forEach((e, i) => {
      const where = `exceptions.${kind}[${i}]`;
      if (!isObject(e)) {
        problems.push(`${where} must be { pattern, reason, env? }`);
        return;
      }
      if (!(e.pattern instanceof RegExp)) problems.push(`${where}.pattern must be a RegExp`);
      if (!isNonEmptyString(e.reason)) {
        problems.push(`${where}.reason is required: say why this exception is justified`);
      }
      if (e.env !== undefined && (!Array.isArray(e.env) || e.env.some(n => !(n in environments)))) {
        problems.push(`${where}.env must list configured environment names`);
      }
      exceptions[kind].push({ pattern: e.pattern, reason: e.reason, env: e.env ?? null });
    });
  }
  return exceptions;
}

function normalizeSelectors(raw, problems) {
  const selectors = { ...DEFAULT_SELECTORS };
  if (raw === undefined) return selectors;
  if (!isObject(raw)) {
    problems.push('selectors must be an object');
    return selectors;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULT_SELECTORS)) {
      problems.push(`selectors.${key} is not known (known: ${Object.keys(DEFAULT_SELECTORS).join(', ')})`);
    } else if (!isNonEmptyString(value)) {
      problems.push(`selectors.${key} must be a non-empty string`);
    } else if (key === 'skipLinkTarget' && !/^#[\w-]+$/.test(value)) {
      problems.push('selectors.skipLinkTarget must be an id selector such as "#content"');
    } else {
      selectors[key] = value;
    }
  }
  return selectors;
}

export function normalizeConfig(raw, { projectRoot }) {
  if (!isObject(raw)) throw new ConfigError(['tests.config.mjs must export a default object']);
  const problems = [];

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      problems.push(`${key} is not a known config key (known: ${TOP_LEVEL_KEYS.join(', ')})`);
    }
  }
  if (!isNonEmptyString(raw.name)) problems.push('name must be a non-empty string');
  if (raw.blockAnalytics !== undefined && typeof raw.blockAnalytics !== 'boolean') {
    problems.push('blockAnalytics must be true or false');
  }

  const environments = normalizeEnvironments(raw.environments, projectRoot, problems);
  const config = {
    name: raw.name,
    projectRoot,
    environments,
    pages: normalizePages(raw.pages, problems),
    features: normalizeFeatures(raw.features, problems),
    exceptions: normalizeExceptions(raw.exceptions, environments, problems),
    selectors: normalizeSelectors(raw.selectors, problems),
    blockAnalytics: raw.blockAnalytics ?? true,
  };

  if (problems.length) throw new ConfigError(problems);
  return config;
}

export async function loadConfig(env = process.env) {
  const file = resolveConfigPath(env);
  if (!fs.existsSync(file)) {
    throw new ConfigError([`no config file at ${file} (set SUITE_CONFIG to use another path)`]);
  }
  const mod = await import(pathToFileURL(file).href);
  return { ...normalizeConfig(mod.default, { projectRoot: path.dirname(file) }), file };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/config.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/lib/config.js tests/lib/config.test.js
git commit -m "Add launch check config loader with validation"
```

---

### Task 4: Environment selection and the suite module

**Files:**
- Create: `tests/lib/environment.js`, `tests/lib/suite.js`
- Test: `tests/lib/environment.test.js`

**Interfaces:**
- Consumes: `ConfigError`, `SUITE_DIR`, `NormalizedConfig` from Task 3.
- Produces:
  - `ANALYTICS_PATTERNS: RegExp[]`
  - `selectEnvironment(config, env = process.env): { name, baseURL, auth }`
  - `exceptionsFor(config, environmentName): { notFound, consoleErrors, blockHosts }` (entries filtered by `env`)
  - `readCredentials(config, environment, env = process.env): { username, password } | null`
  - `reportDir(envName): string`, `runDir(envName, label): string`, `authStatePath(envName): string`
  - `lib/suite.js` exports: `config`, `environment`, `exceptions`, `credentials`, `pages`, `features`, `selectors`, `blockedPatterns: RegExp[]`

- [ ] **Step 1: Write the failing tests**

`tests/lib/environment.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, SUITE_DIR } from './config.js';
import {
  ANALYTICS_PATTERNS,
  selectEnvironment,
  exceptionsFor,
  readCredentials,
  reportDir,
  runDir,
  authStatePath,
} from './environment.js';

function config(projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-env-'))) {
  return {
    name: 'Site',
    projectRoot,
    environments: {
      local: { baseURL: 'https://site.local', auth: null },
      production: { baseURL: 'https://site.example.com', auth: 'wp-login' },
    },
    exceptions: {
      notFound: [
        { pattern: /a/, reason: 'everywhere', env: null },
        { pattern: /b/, reason: 'local only', env: ['local'] },
      ],
      consoleErrors: [],
      blockHosts: [{ pattern: /c/, reason: 'production only', env: ['production'] }],
    },
  };
}

test('TEST_ENV defaults to local', () => {
  assert.deepEqual(selectEnvironment(config(), {}), { name: 'local', baseURL: 'https://site.local', auth: null });
});

test('TEST_ENV selects another environment', () => {
  assert.equal(selectEnvironment(config(), { TEST_ENV: 'production' }).auth, 'wp-login');
});

test('unknown TEST_ENV lists the configured names', () => {
  assert.throws(
    () => selectEnvironment(config(), { TEST_ENV: 'stage' }),
    err => err instanceof ConfigError && err.message.includes('configured: local, production')
  );
});

test('exceptionsFor keeps global entries and entries for this environment', () => {
  const local = exceptionsFor(config(), 'local');
  assert.deepEqual(local.notFound.map(e => e.reason), ['everywhere', 'local only']);
  assert.equal(local.blockHosts.length, 0);
  const prod = exceptionsFor(config(), 'production');
  assert.deepEqual(prod.notFound.map(e => e.reason), ['everywhere']);
  assert.equal(prod.blockHosts.length, 1);
});

test('readCredentials returns null without auth', () => {
  const c = config();
  assert.equal(readCredentials(c, selectEnvironment(c, {}), {}), null);
});

test('readCredentials reads .env.tests and lets the shell win', () => {
  const c = config();
  fs.writeFileSync(path.join(c.projectRoot, '.env.tests'), 'TEST_AUTH_USER=file-user\nTEST_AUTH_PASSWORD=file-pass\n');
  const prod = selectEnvironment(c, { TEST_ENV: 'production' });
  assert.deepEqual(readCredentials(c, prod, {}), { username: 'file-user', password: 'file-pass' });
  assert.deepEqual(readCredentials(c, prod, { TEST_AUTH_USER: 'shell-user' }), {
    username: 'shell-user',
    password: 'file-pass',
  });
});

test('readCredentials fails loudly when auth is set but credentials are missing', () => {
  const c = config();
  const prod = selectEnvironment(c, { TEST_ENV: 'production' });
  assert.throws(() => readCredentials(c, prod, {}), err => err instanceof ConfigError && err.message.includes('TEST_AUTH_USER'));
});

test('analytics patterns match collect endpoints only', () => {
  const blocked = url => ANALYTICS_PATTERNS.some(re => re.test(url));
  assert.ok(blocked('https://region1.google-analytics.com/g/collect?v=2&tid=G-X'));
  assert.ok(blocked('https://www.google-analytics.com/collect?v=1'));
  assert.ok(blocked('https://analytics.google.com/g/collect?v=2'));
  assert.ok(!blocked('https://www.googletagmanager.com/gtag/js?id=G-X'));
  assert.ok(!blocked('https://www.google-analytics.com/analytics.js'));
});

test('output paths live under the suite directory', () => {
  assert.equal(reportDir('local'), path.join(SUITE_DIR, 'report', 'local'));
  assert.equal(runDir('local', 'main'), path.join(SUITE_DIR, 'report', 'local', 'runs', 'main'));
  assert.equal(authStatePath('production'), path.join(SUITE_DIR, '.auth', 'production.json'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/environment.test.js`
Expected: FAIL, `Cannot find module .../lib/environment.js`.

- [ ] **Step 3: Implement `tests/lib/environment.js`**

```js
// Resolves which environment a run targets (TEST_ENV), the exceptions that
// apply there, login credentials and where the run writes its output.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ConfigError, SUITE_DIR } from './config.js';

// Analytics collection endpoints. Blocking them keeps test runs out of the
// site's visitor numbers; the analytics scripts themselves still load, so any
// error they throw is still caught.
export const ANALYTICS_PATTERNS = [
  /google-analytics\.com\/(g\/|j\/)?collect/,
  /analytics\.google\.com\/g\/collect/,
];

export function selectEnvironment(config, env = process.env) {
  const name = env.TEST_ENV || 'local';
  const def = config.environments[name];
  if (!def) {
    throw new ConfigError([
      `TEST_ENV="${name}" is not configured (configured: ${Object.keys(config.environments).join(', ')})`,
    ]);
  }
  return { name, baseURL: def.baseURL, auth: def.auth };
}

export function exceptionsFor(config, environmentName) {
  const applies = e => !e.env || e.env.includes(environmentName);
  return Object.fromEntries(
    Object.entries(config.exceptions).map(([kind, list]) => [kind, list.filter(applies)])
  );
}

export function readCredentials(config, environment, env = process.env) {
  if (!environment.auth) return null;
  const file = path.join(config.projectRoot, '.env.tests');
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  const username = env.TEST_AUTH_USER || fromFile.TEST_AUTH_USER;
  const password = env.TEST_AUTH_PASSWORD || fromFile.TEST_AUTH_PASSWORD;
  if (!username || !password) {
    throw new ConfigError([
      `environment "${environment.name}" uses auth "${environment.auth}" but TEST_AUTH_USER and ` +
        `TEST_AUTH_PASSWORD are not set in ${file} or the shell`,
    ]);
  }
  return { username, password };
}

export const reportDir = envName => path.join(SUITE_DIR, 'report', envName);
export const runDir = (envName, label) => path.join(reportDir(envName), 'runs', label);
export const authStatePath = envName => path.join(SUITE_DIR, '.auth', `${envName}.json`);
```

- [ ] **Step 4: Implement `tests/lib/suite.js`**

```js
// The loaded, validated config for this run. playwright.config.js, every spec
// and every script import from here. Throws ConfigError on an invalid config.
import { loadConfig } from './config.js';
import { ANALYTICS_PATTERNS, exceptionsFor, readCredentials, selectEnvironment } from './environment.js';

export const config = await loadConfig();
export const environment = selectEnvironment(config);
export const exceptions = exceptionsFor(config, environment.name);
export const credentials = readCredentials(config, environment);
export const { pages, features, selectors } = config;

// Requests aborted in every test: the project's blockHosts plus analytics.
export const blockedPatterns = [
  ...exceptions.blockHosts.map(e => e.pattern),
  ...(config.blockAnalytics ? ANALYTICS_PATTERNS : []),
];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run test:unit`
Expected: all tests in `config.test.js` and `environment.test.js` PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/lib/environment.js tests/lib/environment.test.js tests/lib/suite.js
git commit -m "Add environment selection, credentials and suite module"
```

---

### Task 5: Playwright config, shared fixture and the always-on checks

Rewire `playwright.config.js` to the loaded config and convert page-load, overflow and screenshots. The gallery follows. A temporary test bed config makes the run possible; Task 13 replaces it with one written by following AGENTS.md.

**Files:**
- Create: `tests/lib/projects.js`, `tests/lib/test.js`, `tests/lib/global-setup.js`, `tests/lib/console.js`, `tests/lib/console.test.js`, `tests/lib/stabilize.js` (moved), `tests.config.mjs` (repo root, temporary)
- Modify: `tests/playwright.config.js` (full rewrite), `tests/specs/page-load.spec.js`, `tests/specs/overflow.spec.js`, `tests/specs/screenshots.spec.js`, `tests/build-gallery.js`, `tests/package.json`
- Delete: `tests/fixtures/` (both files), `tests/specs/forms.spec.js` (rewritten in Task 7; it imports the deleted `fixtures/pages.js`)

**Interfaces:**
- Consumes: everything `lib/suite.js` exports (Task 4).
- Produces:
  - `lib/projects.js`: `MATRIX: { name, use }[]`, `PROJECT_NAMES: string[]`, `CHROMIUM_PROJECTS: string[]`
  - `lib/test.js`: `test` (Playwright test with the auto fixture `siteGuards`), `expect`, `escapeRegExp(s): string`
  - `lib/console.js`: `isIgnorableConsoleError({ text, url }, { blockedPatterns, allowedPatterns }): boolean`
  - `lib/stabilize.js`: `stabilize(page): Promise<void>` (unchanged behaviour)
  - Env var `RUN_LABEL` selects `report/<env>/runs/<label>/` (default `main`)

- [ ] **Step 1: Write the failing console-filter test**

`tests/lib/console.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIgnorableConsoleError } from './console.js';

const opts = { blockedPatterns: [/cookiebot\.com/], allowedPatterns: [/ResizeObserver loop/] };

test('404 resource lines are ignored (page-load tracks 404s by URL)', () => {
  assert.ok(isIgnorableConsoleError({ text: 'Failed to load resource: the server responded with a status of 404 (Not Found)', url: 'https://s/x.png' }, opts));
});

test('failed loads of blocked requests are ignored', () => {
  assert.ok(isIgnorableConsoleError({ text: 'Failed to load resource: net::ERR_FAILED', url: 'https://consent.cookiebot.com/uc.js' }, opts));
});

test('failed loads of other requests are real errors', () => {
  assert.ok(!isIgnorableConsoleError({ text: 'Failed to load resource: net::ERR_FAILED', url: 'https://s/app.js' }, opts));
});

test('script errors are real unless an exception allows them', () => {
  assert.ok(!isIgnorableConsoleError({ text: 'Uncaught TypeError: x is undefined', url: 'https://s/app.js' }, opts));
  assert.ok(isIgnorableConsoleError({ text: 'ResizeObserver loop limit exceeded', url: '' }, opts));
});
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/console.test.js`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `tests/lib/console.js`**

```js
// Decides which console errors page-load ignores. Two browser lines are noise:
// "Failed to load resource" for a 404 (page-load tracks 404s precisely by URL)
// and for a request aborted on purpose (blockHosts, analytics). Anything else is
// a real error unless a consoleErrors exception with a reason allows it.
export function isIgnorableConsoleError({ text, url }, { blockedPatterns, allowedPatterns }) {
  if (/^Failed to load resource/i.test(text)) {
    if (/\b404\b/.test(text)) return true;
    if (url && blockedPatterns.some(re => re.test(url))) return true;
  }
  return allowedPatterns.some(re => re.test(text));
}
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/console.test.js`
Expected: PASS.

- [ ] **Step 3: Move stabilize and create the matrix, fixture and global setup**

```bash
cd /Users/aleksi/work/test-suite/tests
git mv fixtures/stabilize.js lib/stabilize.js
git rm fixtures/pages.js specs/forms.spec.js
```

In `tests/lib/stabilize.js`, replace the header comment (first four lines) with:

```js
// Shared page stabilization before screenshots and layout measurements:
// waits for fonts, freezes animations and transitions, then scrolls the full
// page and back so lazy images load.
```

`tests/lib/projects.js`:

```js
import { devices } from '@playwright/test';

// The browser x viewport matrix. playwright.config.js, the gallery and the
// image audit all read project names from here.
export const MATRIX = [
  { name: 'chrome-phone', use: { ...devices['Pixel 5'] } },
  { name: 'chrome-tablet', use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' } },
  { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  { name: 'safari-phone', use: { ...devices['iPhone 13'] } },
  { name: 'safari-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
];

export const PROJECT_NAMES = MATRIX.map(p => p.name);

// srcset selection depends on viewport and DPR, not the engine, so the image
// audit runs on the Chromium projects only.
export const CHROMIUM_PROJECTS = PROJECT_NAMES.filter(name => name.startsWith('chrome-'));
```

`tests/lib/test.js`:

```js
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
```

`tests/lib/global-setup.js`:

```js
import { config, environment } from './suite.js';

// Prints once per run which site and environment are being tested.
export default function globalSetup() {
  const login = environment.auth ? `, login: ${environment.auth}` : '';
  console.log(`\n${config.name}: environment "${environment.name}" at ${environment.baseURL}${login}\n`);
}
```

- [ ] **Step 4: Rewrite `tests/playwright.config.js`**

```js
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { environment, credentials } from './lib/suite.js';
import { authStatePath, runDir } from './lib/environment.js';
import { MATRIX } from './lib/projects.js';

// Each Playwright run (config check, main run, image audit) writes to its own
// folder so one cannot overwrite another's results.
const out = runDir(environment.name, process.env.RUN_LABEL || 'main');
const wpLogin = environment.auth === 'wp-login';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  // Local dev containers get overwhelmed when several browser engines hit them
  // at once. Serial runs are slower but deterministic.
  workers: 1,
  // A local dev host occasionally drops a `load` event under a long run. Such a
  // flake clears on one retry; a real bug fails twice. Retried tests are shown
  // as flaky in the report.
  retries: 1,
  // Content-heavy pages plus lazy-image scrolling can exceed the 30s default.
  timeout: 90_000,
  globalSetup: './lib/global-setup.js',
  outputDir: path.join(out, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(out, 'playwright-report') }],
    ['json', { outputFile: path.join(out, 'results.json') }],
  ],
  use: {
    baseURL: environment.baseURL,
    ignoreHTTPSErrors: true, // local certificates are self-signed
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...(environment.auth === 'basic' ? { httpCredentials: credentials } : {}),
    ...(wpLogin ? { storageState: authStatePath(environment.name) } : {}),
  },
  projects: [
    ...(wpLogin
      ? [
          {
            name: 'setup',
            testMatch: /auth\.setup\.js$/,
            use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
          },
        ]
      : []),
    ...MATRIX.map(p => (wpLogin ? { ...p, dependencies: ['setup'] } : p)),
  ],
});
```

- [ ] **Step 5: Convert the always-on specs**

`tests/specs/page-load.spec.js`:

```js
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
```

In `tests/specs/overflow.spec.js`, replace the three import lines with:

```js
import { test, expect } from '../lib/test.js';
import { pages } from '../lib/suite.js';
import { stabilize } from '../lib/stabilize.js';
```

and replace the header comment block (the five `//` lines above `const TOLERANCE`) with:

```js
// No page may scroll sideways on any project. clientWidth excludes the
// vertical scrollbar, so scrollWidth minus clientWidth measures real page
// overflow only; inner overflow-x:auto regions (carousels, tables) are clipped
// and ignored. On failure the widest offending elements are named.
```

`tests/specs/screenshots.spec.js`:

```js
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
```

- [ ] **Step 6: Convert `tests/build-gallery.js`**

Replace the lines from the first `import` through the `if (!fs.existsSync(SCREENSHOTS_DIR)) { ... }` block with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { loadSuiteOrExit } from './lib/cli.js';
import { reportDir } from './lib/environment.js';
import { PROJECT_NAMES as PROJECTS } from './lib/projects.js';

const { config, environment } = await loadSuiteOrExit();
const SCREENSHOTS_DIR = path.join(reportDir(environment.name), 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  console.error(`No screenshots at ${SCREENSHOTS_DIR}. Run "npm run test:visual" first.`);
  process.exit(1);
}
```

Then replace both occurrences of `Olmar — pre-launch visual gallery` with `${config.name}: visual review (${environment.name})`, and replace the `<p class="meta">` line with:

```js
<p class="meta">${environment.baseURL}. Generated ${new Date().toISOString()}. Click an image for full size.</p>
```

Create `tests/lib/cli.js` (used by every Node script from here on):

```js
// Shared helpers for the Node scripts (check-config, launch-check, image audit,
// gallery).
import { spawnSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';

// Imports lib/suite.js and turns a config error into a readable message and
// exit code 1 instead of a stack trace.
export async function loadSuiteOrExit() {
  try {
    return await import('./suite.js');
  } catch (err) {
    if (err.name === 'ConfigError') {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// Runs a shell command in the suite directory with inherited output and returns
// its exit code.
export function run(cmd, env = {}) {
  console.log(`\n$ ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: SUITE_DIR, env: { ...process.env, ...env } });
  return result.status ?? 1;
}
```

- [ ] **Step 7: Add the report script and write the temporary test bed config**

In `tests/package.json` scripts, add:

```json
    "report": "playwright show-report report/${TEST_ENV:-local}/runs/main/playwright-report"
```

Create `/Users/aleksi/work/test-suite/tests.config.mjs` (temporary; Task 13 replaces it). Use the Gravity Form id that `seed.sh` printed:

```js
export default {
  name: 'Launch check test bed',
  environments: { local: {} },
  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'about', path: '/about/', label: 'Basic page' },
    { slug: 'news', path: '/news/', label: 'Posts archive' },
    { slug: 'post', path: '/first-news-post/', label: 'Single post' },
    { slug: 'books', path: '/book/', label: 'Book archive' },
    { slug: 'book', path: '/book/sample-book/', label: 'Single book' },
    { slug: 'contact', path: '/contact/', label: 'Contact' },
  ],
  features: {
    navigation: { desktopLink: 'About' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact/' },
    form: { path: '/contact/', gravityFormId: 1 },
  },
};
```

- [ ] **Step 8: Run the unit tests and the converted specs**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run test:unit`
Expected: PASS.

Run: `cd /Users/aleksi/work/test-suite/tests && npx playwright test specs/page-load.spec.js specs/overflow.spec.js --project=chrome-desktop`
Expected: the global setup prints `Launch check test bed: environment "local" at https://test-suite.local`; 16 tests PASS (8 pages x 2 specs). A failure here is a real test bed problem: read the message, fix the test bed content or report it; do not weaken the check.

Run: `cd /Users/aleksi/work/test-suite/tests && npx playwright test --grep @visual --project=chrome-desktop && node build-gallery.js`
Expected: 8 screenshots under `report/local/screenshots/<slug>/chrome-desktop.png`; `Wrote .../report/local/screenshots/index.html`.

Run: `cd /Users/aleksi/work/test-suite/tests && ls report/local/runs/main`
Expected: `playwright-report  results.json  test-results`.

- [ ] **Step 9: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests tests.config.mjs
git commit -m "Read pages and environment from the project config; convert always-on checks"
```

---

### Task 6: Feature specs (navigation, skip link, sticky header, accordion)

**Files:**
- Modify: `tests/specs/navigation.spec.js`, `tests/specs/anchors.spec.js`, `tests/specs/interactive.spec.js`

**Interfaces:**
- Consumes: `test`, `expect`, `escapeRegExp` (`lib/test.js`); `features`, `selectors` (`lib/suite.js`).

- [ ] **Step 1: Rewrite `tests/specs/navigation.spec.js`**

```js
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
```

- [ ] **Step 2: Rewrite `tests/specs/anchors.spec.js`**

```js
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
```

- [ ] **Step 3: Rewrite `tests/specs/interactive.spec.js`**

```js
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
```

- [ ] **Step 4: Run the feature specs across the matrix**

Run: `cd /Users/aleksi/work/test-suite/tests && npx playwright test specs/navigation.spec.js specs/anchors.spec.js specs/interactive.spec.js`
Expected: every test passes or is skipped for the device (desktop nav on mobile projects and vice versa). chrome-tablet runs the mobile nav test (the iPad descriptor is `isMobile: true`).

- [ ] **Step 5: Prove a disabled feature is skipped with its reason**

Temporarily set `accordion: false` in `/Users/aleksi/work/test-suite/tests.config.mjs`.

Run: `cd /Users/aleksi/work/test-suite/tests && npx playwright test specs/interactive.spec.js --project=chrome-desktop --reporter=line`
Expected: `1 skipped`. Restore `accordion: { path: '/contact/' }`.

- [ ] **Step 6: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/specs/navigation.spec.js tests/specs/anchors.spec.js tests/specs/interactive.spec.js
git commit -m "Drive navigation, skip link, sticky header and accordion checks from config"
```

---

### Task 7: Generic Gravity Forms check

**Files:**
- Create: `tests/lib/form.js`, `tests/lib/form.test.js`, `tests/specs/forms.spec.js`

**Interfaces:**
- Consumes: `features.form` (`{ path, gravityFormId }`).
- Produces: `FILL_VALUES`, `valueForField(tag, type): string | null`, `payloadHasValue(body, value): boolean`, `hasGformSubmit(body, formId): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/form.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILL_VALUES, valueForField, payloadHasValue, hasGformSubmit } from './form.js';

const multipart = [
  '------WebKitFormBoundaryX',
  'Content-Disposition: form-data; name="input_2"',
  '',
  'test@example.com',
  '------WebKitFormBoundaryX',
  'Content-Disposition: form-data; name="gform_submit"',
  '',
  '1',
  '------WebKitFormBoundaryX--',
].join('\r\n');

const urlencoded = 'input_2=test%40example.com&input_3=%2B358000000000&input_4=automated+check&gform_submit=1';

test('values are chosen by field type', () => {
  assert.equal(valueForField('textarea', ''), FILL_VALUES.textarea);
  assert.equal(valueForField('input', 'email'), 'test@example.com');
  assert.equal(valueForField('input', ''), FILL_VALUES.text);
  assert.equal(valueForField('input', 'date'), null);
});

test('payloadHasValue finds values in multipart and url-encoded bodies', () => {
  assert.ok(payloadHasValue(multipart, 'test@example.com'));
  assert.ok(payloadHasValue(urlencoded, 'test@example.com'));
  assert.ok(payloadHasValue(urlencoded, '+358000000000'));
  assert.ok(payloadHasValue(urlencoded, 'automated check'));
  assert.ok(!payloadHasValue(urlencoded, 'Playwright'));
});

test('hasGformSubmit matches the form id exactly', () => {
  assert.ok(hasGformSubmit(multipart, 1));
  assert.ok(hasGformSubmit(urlencoded, 1));
  assert.ok(!hasGformSubmit(multipart, 12));
  assert.ok(!hasGformSubmit('gform_submit=12', 1));
});
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/form.test.js`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `tests/lib/form.js`**

```js
// Fill values and payload matching for the Gravity Forms check.
export const FILL_VALUES = {
  text: 'Playwright',
  search: 'Playwright',
  email: 'test@example.com',
  tel: '+358000000000',
  url: 'https://example.com',
  number: '1',
  textarea: 'automated check',
};

// Returns the value to type into a field, or null for field types the check
// leaves alone (date pickers, files, colours and the like).
export function valueForField(tag, type) {
  if (tag === 'textarea') return FILL_VALUES.textarea;
  return FILL_VALUES[type || 'text'] ?? null;
}

// Gravity Forms posts multipart/form-data, but a browser or plugin may send
// url-encoded data, where "@", "+" and spaces are encoded.
export function payloadHasValue(body, value) {
  const encoded = encodeURIComponent(value);
  return [value, encoded, encoded.replace(/%20/g, '+')].some(v => body.includes(v));
}

export function hasGformSubmit(body, formId) {
  return new RegExp(`name="gform_submit"\\r?\\n\\r?\\n${formId}\\r?\\n|(^|&)gform_submit=${formId}(&|$)`).test(body);
}
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/form.test.js`
Expected: PASS.

- [ ] **Step 3: Write `tests/specs/forms.spec.js`**

```js
import { test, expect } from '../lib/test.js';
import { features } from '../lib/suite.js';
import { valueForField, payloadHasValue, hasGformSubmit } from '../lib/form.js';

const form = features.form;
const SKIP_TYPES = ['submit', 'button', 'hidden', 'file', 'image', 'reset'];

// Fills every visible field of the configured Gravity Form by type, submits it
// and checks the payload. Every non-GET request from the page is answered in
// the browser with an empty 200, so nothing reaches any server in any
// environment. The success message is not checked: the stubbed response has
// none.
test('form submits the expected payload (intercepted, never delivered)', async ({ page }) => {
  test.skip(!form, 'form: not on this site');

  const bodies = [];
  await page.route('**/*', async route => {
    const method = route.request().method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await route.fallback();
      return;
    }
    bodies.push(route.request().postData() || '');
    await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
  });

  await page.goto(form.path);
  const root = page.locator(`#gform_${form.gravityFormId}`);
  await expect(root, `#gform_${form.gravityFormId} not found on ${form.path}`).toBeVisible();

  const typed = [];
  const checkedGroups = new Set();
  const fields = root.locator('input:visible, textarea:visible, select:visible');
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const { tag, type, name } = await field.evaluate(el => ({
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
    }));

    if (tag === 'select') {
      const option = await field.evaluate(el => [...el.options].find(o => o.value)?.value ?? null);
      if (option !== null) await field.selectOption(option);
      continue;
    }
    if (SKIP_TYPES.includes(type)) continue;
    if (type === 'checkbox' || type === 'radio') {
      // One option per field: Gravity Forms names checkbox inputs input_5.1,
      // input_5.2 and so on, radios share one name.
      const group = `${type}:${name.replace(/\.\d+$/, '')}`;
      if (!checkedGroups.has(group)) {
        await field.check();
        checkedGroups.add(group);
      }
      continue;
    }
    const value = valueForField(tag, type);
    if (value === null) continue;
    await field.fill(value);
    typed.push(value);
  }

  await root.locator('input[type="submit"], button[type="submit"]').first().click();

  await expect
    .poll(() => bodies.find(b => hasGformSubmit(b, form.gravityFormId)), {
      timeout: 10_000,
      message: 'the form never posted a Gravity Forms submission',
    })
    .toBeTruthy();

  const body = bodies.find(b => hasGformSubmit(b, form.gravityFormId));
  for (const value of typed) {
    expect(payloadHasValue(body, value), `typed value "${value}" missing from the submitted payload`).toBe(true);
  }
});
```

- [ ] **Step 4: Run the form check across the matrix**

Run: `cd /Users/aleksi/work/test-suite/tests && npx playwright test specs/forms.spec.js`
Expected: 6 PASS. If a browser fails, read the message; a real form problem is reported, not worked around.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/lib/form.js tests/lib/form.test.js tests/specs/forms.spec.js
git commit -m "Add generic Gravity Forms check filled by field type"
```

---

### Task 8: check-config

**Files:**
- Create: `tests/specs/config.spec.js`, `tests/check-config.js`
- Modify: `tests/package.json`

**Interfaces:**
- Consumes: `pages`, `features`, `selectors`, `environment` (`lib/suite.js`); `loadSuiteOrExit`, `run` (`lib/cli.js`).
- Produces: `npm run check-config`, exit code 0 when the config matches the site.

- [ ] **Step 1: Write `tests/specs/config.spec.js`**

```js
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
```

- [ ] **Step 2: Write `tests/check-config.js`**

```js
// Validates tests.config.mjs and checks that every configured target exists on
// the site, in one browser. Run it after configuring and before every launch
// check.
import { loadSuiteOrExit, run } from './lib/cli.js';

const { config, environment } = await loadSuiteOrExit();
console.log(`Config check: ${config.name}, environment "${environment.name}" (${environment.baseURL})`);

const status = run('npx playwright test --grep @config --project=chrome-desktop --retries=0', { RUN_LABEL: 'config' });
if (status !== 0) {
  console.error('\nConfig check FAILED: the site does not match tests.config.mjs.');
  console.error('Each failure above names the config key to fix.');
  process.exit(status);
}
console.log('\nConfig check passed.');
```

- [ ] **Step 3: Add the npm script**

In `tests/package.json` scripts, add:

```json
    "check-config": "node check-config.js",
```

- [ ] **Step 4: Run it green, then prove it catches config errors**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run check-config`
Expected: 13 tests PASS (8 pages + 5 features); `Config check passed.`

Temporarily change `desktopLink: 'About'` to `desktopLink: 'Abuot'` in `/Users/aleksi/work/test-suite/tests.config.mjs`.

Run: `cd /Users/aleksi/work/test-suite/tests && npm run check-config; echo "exit=$?"`
Expected: fails with `features.navigation.desktopLink: no link "Abuot"`; `exit=1`. Restore `'About'`.

Temporarily remove `features.form` from the config.

Run: `cd /Users/aleksi/work/test-suite/tests && npm run check-config; echo "exit=$?"`
Expected: prints `Invalid launch check config:` with `features.form is missing`, no stack trace; `exit=1`. Restore it.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/specs/config.spec.js tests/check-config.js tests/package.json
git commit -m "Add check-config: verify the config against the site before the matrix"
```

---

### Task 9: Login (wp-login and basic)

**Files:**
- Create: `tests/specs/auth.setup.js`

**Interfaces:**
- Consumes: `credentials`, `environment` (`lib/suite.js`); `authStatePath` (`lib/environment.js`); the `setup` project defined in `playwright.config.js` (Task 5).

- [ ] **Step 1: Write `tests/specs/auth.setup.js`**

```js
import { test as setup, expect } from '@playwright/test';
import { credentials, environment } from '../lib/suite.js';
import { authStatePath } from '../lib/environment.js';

// Logs in once through the WordPress login form and saves the session for every
// project (auth: 'wp-login', for sites closed with wp-force-login). /wp-admin/
// on the site root redirects to the login form whether WordPress lives in a
// subdirectory or not, and after login lands on a logged-in page.
setup('log in through the WordPress login form', async ({ page }) => {
  await page.goto('/wp-admin/');
  await page.locator('#user_login').fill(credentials.username);
  await page.locator('#user_pass').fill(credentials.password);
  await page.locator('#wp-submit').click();

  // Wait until the page is either the login form with an error or no longer
  // the login page.
  await expect(page.locator('#login_error, body:not(.login)').first()).toBeAttached();
  await expect(page.locator('#login_error'), 'WordPress rejected TEST_AUTH_USER / TEST_AUTH_PASSWORD').toHaveCount(0);

  await page.goto('/');
  await expect(page.locator('#loginform'), 'the site still shows the login form after logging in').toHaveCount(0);
  await page.context().storageState({ path: authStatePath(environment.name) });
});
```

- [ ] **Step 2: Add a login environment to the test bed config and close the site**

In `/Users/aleksi/work/test-suite/tests.config.mjs`, change `environments` to:

```js
  environments: {
    local: {},
    'local-login': { baseURL: 'https://test-suite.local', auth: 'wp-login' },
  },
```

Activate force-login:

```bash
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp plugin activate wp-force-login
curl -sk -o /dev/null -w "%{http_code} %{redirect_url}\n" https://test-suite.local/about/
```
Expected: `302` with a redirect to the login page.

- [ ] **Step 3: Verify the closed site fails without login and passes with it**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run check-config; echo "exit=$?"`
Expected: fails with `shows the WordPress login form: set auth for this environment`; `exit=1`.

Run: `cd /Users/aleksi/work/test-suite/tests && TEST_ENV=local-login npm run check-config`
Expected: the `setup` project runs first and passes; all config checks pass. `tests/.auth/local-login.json` exists.

Run: `cd /Users/aleksi/work/test-suite/tests && TEST_ENV=local-login npx playwright test --grep @visual --project=chrome-desktop && TEST_ENV=local-login node build-gallery.js`
Expected: PASS. Open `report/local-login/screenshots/about/chrome-desktop.png` with the Read tool: no WordPress toolbar at the top.

Run: `cd /Users/aleksi/work/test-suite/tests && TEST_AUTH_PASSWORD=wrong TEST_ENV=local-login npm run check-config; echo "exit=$?"`
Expected: the setup fails with `WordPress rejected TEST_AUTH_USER / TEST_AUTH_PASSWORD`; `exit=1`.

- [ ] **Step 4: Verify basic auth reaches Playwright**

Basic auth is not available on the test bed. Confirm the config wiring with a listing, which loads the config without opening a browser:

Temporarily add `'basic-check': { baseURL: 'https://test-suite.local', auth: 'basic' }` to `environments`.

Run: `cd /Users/aleksi/work/test-suite/tests && TEST_ENV=basic-check node --input-type=module -e "const m = await import('./playwright.config.js'); console.log(JSON.stringify(m.default.use.httpCredentials))"`
Expected: `{"username":"launchcheck","password":"<the password from .env.tests>"}`. Remove `basic-check` again.

- [ ] **Step 5: Reopen the site and commit**

```bash
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp plugin deactivate wp-force-login
git add tests/specs/auth.setup.js tests.config.mjs
git commit -m "Add wp-login and basic auth support"
```

---

### Task 10: Image audit on the new paths

**Files:**
- Create: `tests/lib/audit-rows.js`
- Modify: `tests/specs/image-audit.spec.js`, `tests/image-audit.js`

**Interfaces:**
- Consumes: `CHROMIUM_PROJECTS` (`lib/projects.js`); `reportDir` (`lib/environment.js`); `loadSuiteOrExit`, `run` (`lib/cli.js`).
- Produces: `readAuditRows(dataDir): Row[] | null` (sorted by `wastedBytes` descending, `null` when the directory does not exist). `Row = { page, viewport, block, file, displayedPx, neededPx, downloadedPx, downloadedBytes, ratio, wastedBytes, egregious }`.

- [ ] **Step 1: Create `tests/lib/audit-rows.js`**

```js
import fs from 'node:fs';
import path from 'node:path';

// Reads the image audit's per-page JSON files. Returns null when the audit has
// not run (no data directory), rows sorted by estimated waste otherwise.
export function readAuditRows(dataDir) {
  if (!fs.existsSync(dataDir)) return null;
  const rows = [];
  for (const file of fs.readdirSync(dataDir)) {
    if (file.endsWith('.json')) rows.push(...JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')));
  }
  return rows.sort((a, b) => b.wastedBytes - a.wastedBytes);
}
```

- [ ] **Step 2: Update `tests/specs/image-audit.spec.js`**

Replace the import block and the `DATA_DIR` line with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../lib/test.js';
import { pages, environment } from '../lib/suite.js';
import { stabilize } from '../lib/stabilize.js';
import { reportDir } from '../lib/environment.js';
import { CHROMIUM_PROJECTS } from '../lib/projects.js';
```

```js
const DATA_DIR = path.join(reportDir(environment.name), 'image-audit', 'data');
```

Replace the `test.skip(...)` call with:

```js
    test.skip(!CHROMIUM_PROJECTS.includes(testInfo.project.name), 'image audit runs on Chromium viewports only');
```

Replace the comment block that starts `// Capture the real transferred size` (through `// same-origin host the basename still matches).`) with:

```js
    // Capture each image's transferred size from its response body, keyed by
    // file name. content-length is often absent and resource timing reports 0,
    // so the body length is the reliable figure. File names, not URLs, because
    // a local host may redirect uploads to production, which changes the
    // response URL but not the file name.
```

In the `row` object, add a final property, and change the egregious test to use it:

```js
        egregious: ratio >= FAIL_RATIO && wastedBytes >= FAIL_WASTED_BYTES,
      };
      oversized.push(row);
      if (row.egregious) egregious.push(row);
```

In the header comment, replace `image-audit/data/<project>__<slug>.json` with `report/<env>/image-audit/data/<project>__<slug>.json` and `image-audit/report.md` with `report/<env>/image-audit/report.md`.

- [ ] **Step 3: Update `tests/image-audit.js`**

Replace everything from the first `import` through the `rows.sort(...)` line with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { loadSuiteOrExit, run } from './lib/cli.js';
import { reportDir } from './lib/environment.js';
import { CHROMIUM_PROJECTS } from './lib/projects.js';
import { readAuditRows } from './lib/audit-rows.js';

const { environment } = await loadSuiteOrExit();
const AUDIT_DIR = path.join(reportDir(environment.name), 'image-audit');
const DATA_DIR = path.join(AUDIT_DIR, 'data');
const REPORT = path.join(AUDIT_DIR, 'report.md');

const passthrough = process.argv.slice(2).join(' ');
const projectFlags = passthrough.includes('--project') ? '' : CHROMIUM_PROJECTS.map(p => `--project=${p}`).join(' ');

// 1. Clean prior data so a stale run cannot pollute the report.
fs.rmSync(DATA_DIR, { recursive: true, force: true });

// 2. Run the audit spec; an egregious finding exits non-zero but the report is
//    still written.
const exitCode = run(`npx playwright test --grep @audit ${projectFlags} ${passthrough}`.trim(), { RUN_LABEL: 'audit' });

// 3. Aggregate JSON into the ranked report.
const rows = readAuditRows(DATA_DIR) ?? [];
```

In the header comment of `image-audit.js`, replace `1. clean image-audit/data/` with `1. clean report/<env>/image-audit/data/` and `image-audit/report.md` with `report/<env>/image-audit/report.md`. Leave the rest of the file (suggestions, Markdown rendering, `process.exit(exitCode)`) unchanged.

- [ ] **Step 4: Run the audit**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run audit:images; echo "exit=$?"`
Expected: runs on 3 Chromium projects; prints `Wrote .../report/local/image-audit/report.md`; the About page image appears in the report (shown at 300px, downloaded larger) on at least chrome-desktop. Exit 0 unless an image is egregious (the test bed PNG is small, so expect 0).

Run: `cd /Users/aleksi/work/test-suite/tests && ls report/local/runs`
Expected: `audit` next to `config` and `main`.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/lib/audit-rows.js tests/specs/image-audit.spec.js tests/image-audit.js
git commit -m "Move image audit output under report/<env>"
```

---

### Task 11: Launch report and launch-check

**Files:**
- Create: `tests/lib/report.js`, `tests/lib/report.test.js`, `tests/launch-check.js`
- Modify: `tests/package.json`

**Interfaces:**
- Consumes: `FEATURE_KEYS` (`lib/config.js`); `PROJECT_NAMES` (`lib/projects.js`); `readAuditRows` (Task 10); `reportDir`, `runDir` (Task 4); `loadSuiteOrExit`, `run` (Task 5).
- Produces:
  - `collectTests(json): Test[]`, `Test = { check, title, project, outcome: 'expected'|'unexpected'|'flaky'|'skipped', error: string|null, trace: string|null }`
  - `stripAnsi(s): string`
  - `VISUAL_REVIEW: string[]`
  - `renderLaunchReport({ config, environment, exceptions, generatedAt: Date, suiteVersion, runBy, tests: Test[]|null, auditRows: Row[]|null }): string`
  - `npm run launch-check`

- [ ] **Step 1: Write the failing tests**

`tests/lib/report.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTests, renderLaunchReport, stripAnsi, VISUAL_REVIEW } from './report.js';

const json = {
  suites: [
    {
      title: 'page-load.spec.js',
      file: 'page-load.spec.js',
      specs: [
        {
          title: 'page loads: Front page (/)',
          file: 'page-load.spec.js',
          tests: [
            { projectName: 'chrome-desktop', status: 'expected', results: [{ status: 'passed' }] },
            {
              projectName: 'safari-phone',
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  error: { message: '\u001b[31mconsole errors:\u001b[39m\nUncaught TypeError' },
                  attachments: [{ name: 'trace', path: '/r/trace.zip' }],
                },
              ],
            },
          ],
        },
      ],
      suites: [],
    },
    {
      title: 'anchors.spec.js',
      file: 'anchors.spec.js',
      specs: [],
      suites: [
        {
          title: 'Sticky header',
          file: 'anchors.spec.js',
          specs: [
            {
              title: 'header hides on scroll down and returns on scroll up',
              file: 'anchors.spec.js',
              tests: [{ projectName: 'chrome-desktop', status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }],
            },
          ],
          suites: [],
        },
      ],
    },
  ],
};

const base = {
  config: {
    name: 'Test site',
    features: { navigation: false, skipLink: true, stickyHeader: true, accordion: false, form: { path: '/c/', gravityFormId: 1 } },
  },
  environment: { name: 'local', baseURL: 'https://site.local', auth: null },
  exceptions: { notFound: [{ pattern: /x\.mov$/, reason: 'Video not synced.', env: ['local'] }], consoleErrors: [], blockHosts: [] },
  generatedAt: new Date('2026-09-29T10:00:00Z'),
  suiteVersion: '0.1.0 (abc1234)',
  runBy: 'Tester',
  auditRows: [],
};

test('collectTests flattens nested suites and keeps the last result', () => {
  const tests = collectTests(json);
  assert.equal(tests.length, 3);
  const failed = tests.find(t => t.outcome === 'unexpected');
  assert.equal(failed.check, 'page-load');
  assert.equal(failed.project, 'safari-phone');
  assert.equal(failed.trace, '/r/trace.zip');
  assert.equal(tests.find(t => t.outcome === 'flaky').check, 'anchors');
});

test('stripAnsi removes colour codes', () => {
  assert.equal(stripAnsi('\u001b[31mred\u001b[39m'), 'red');
});

test('report sections appear in the fixed order', () => {
  const md = renderLaunchReport({ ...base, tests: collectTests(json) });
  const order = ['# Launch report: Test site', '## Result', '## Failures', '## Features', '## Exceptions in effect', '## Image audit', '## Visual review'];
  const positions = order.map(h => md.indexOf(h));
  assert.ok(positions.every(p => p >= 0), `missing heading in:\n${md}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test('report shows verdict, failure without ANSI codes, flaky, features and exceptions', () => {
  const md = renderLaunchReport({ ...base, tests: collectTests(json) });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /console errors:\nUncaught TypeError/);
  assert.ok(!md.includes('\u001b['));
  assert.match(md, /Trace: `\/r\/trace\.zip`/);
  assert.match(md, /1 flaky/);
  assert.match(md, /\| navigation \| not on this site \|/);
  assert.match(md, /\| form \| tested \|/);
  assert.match(md, /Video not synced\./);
  assert.match(md, /local \(https:\/\/site\.local\)/);
  for (const item of VISUAL_REVIEW) assert.ok(md.includes(`- [ ] ${item}`));
});

test('all passing gives PASSED', () => {
  const passing = { suites: [{ title: 'a', file: 'overflow.spec.js', specs: [{ title: 't', file: 'overflow.spec.js', tests: [{ projectName: 'chrome-desktop', status: 'expected', results: [{ status: 'passed' }] }] }], suites: [] }] };
  const md = renderLaunchReport({ ...base, tests: collectTests(passing) });
  assert.match(md, /\*\*Automated checks: PASSED\*\*/);
  assert.match(md, /No failures\./);
});

test('missing results render and fail the verdict', () => {
  const md = renderLaunchReport({ ...base, tests: null });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /did not complete/);
});

test('egregious image findings fail the verdict; a missing audit is stated', () => {
  const row = { block: 'wp-block-image', file: 'a.jpg', page: '/', viewport: 'chrome-desktop', ratio: 4, wastedBytes: 300 * 1024, egregious: true };
  const passing = { suites: [] };
  const md = renderLaunchReport({ ...base, tests: collectTests(passing), auditRows: [row] });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /1 egregious/);
  assert.match(renderLaunchReport({ ...base, tests: [], auditRows: null }), /Image audit did not run\./);
});
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/report.test.js`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `tests/lib/report.js`**

```js
// Renders the launch report (report/<env>/launch-report.md) from the
// Playwright JSON results and the image audit rows. Section order is fixed;
// later additions (launch-day checklist, audits) go after "Visual review".
import path from 'node:path';
import { FEATURE_KEYS } from './config.js';
import { PROJECT_NAMES } from './projects.js';

export const VISUAL_REVIEW = [
  'Header, logo and navigation render correctly on every page and device',
  'Footer is complete on every page',
  'No overlapping or cut-off text',
  'Images are present, not stretched and not cropped wrongly',
  'Form fields, labels and button are laid out correctly in every browser',
  "Fonts are the site's fonts, not a fallback",
  'Spacing and alignment are consistent between browsers',
];

export const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

const checkName = file => path.basename(file || 'unknown').replace(/\.(spec|setup)\.js$/, '');

export function collectTests(json) {
  const out = [];
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const message = last?.error?.message ?? last?.errors?.[0]?.message ?? null;
        out.push({
          check: checkName(spec.file ?? file),
          title: spec.title,
          project: t.projectName,
          outcome: t.status,
          error: message ? stripAnsi(message) : null,
          trace: last?.attachments?.find(a => a.name === 'trace')?.path ?? null,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, child.file ?? file);
  };
  for (const suite of json.suites ?? []) walk(suite, suite.file);
  return out;
}

const kb = n => `${Math.round(n / 1024)} KB`;

function cell(tests) {
  if (!tests.length) return '';
  const failed = tests.filter(t => t.outcome === 'unexpected').length;
  const flaky = tests.filter(t => t.outcome === 'flaky').length;
  if (failed) return `**${failed} failed**`;
  if (tests.every(t => t.outcome === 'skipped')) return 'skipped';
  return flaky ? `ok (${flaky} flaky)` : 'ok';
}

function resultSection(tests, egregiousCount, auditRan) {
  if (!tests) {
    return [
      '**Automated checks: FAILED**',
      '',
      'No test results found: the functional run did not complete. See the terminal output.',
    ].join('\n');
  }
  const count = outcome => tests.filter(t => t.outcome === outcome).length;
  const failed = count('unexpected');
  const passed = !failed && egregiousCount === 0 && auditRan;
  const lines = [
    `**Automated checks: ${passed ? 'PASSED' : 'FAILED'}** ` +
      `(${count('expected')} passed, ${failed} failed, ${count('flaky')} flaky, ${count('skipped')} skipped)`,
  ];
  const projects = [...new Set(tests.map(t => t.project))].sort(
    (a, b) => ['setup', ...PROJECT_NAMES].indexOf(a) - ['setup', ...PROJECT_NAMES].indexOf(b)
  );
  const checks = [...new Set(tests.map(t => t.check))];
  if (checks.length) {
    lines.push('', `| Check | ${projects.join(' | ')} |`, `|---|${projects.map(() => '---').join('|')}|`);
    for (const check of checks) {
      const cells = projects.map(p => cell(tests.filter(t => t.check === check && t.project === p)));
      lines.push(`| ${check} | ${cells.join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function failuresSection(tests) {
  const failures = (tests ?? []).filter(t => t.outcome === 'unexpected');
  if (!failures.length) return 'No failures.';
  return failures
    .map(t => {
      const message = (t.error ?? 'No error message recorded.').split('\n').slice(0, 15).join('\n');
      const trace = t.trace ? `\nTrace: \`${t.trace}\`` : '';
      return `### ${t.check}: ${t.title} (${t.project})\n\n\`\`\`\n${message}\n\`\`\`${trace}`;
    })
    .join('\n\n');
}

function featuresSection(features) {
  const rows = FEATURE_KEYS.map(k => `| ${k} | ${features[k] ? 'tested' : 'not on this site'} |`);
  return ['| Feature | Status |', '|---|---|', ...rows].join('\n');
}

function exceptionsSection(exceptions) {
  const rows = Object.entries(exceptions).flatMap(([kind, list]) =>
    list.map(e => `| ${kind} | \`${e.pattern.source}\` | ${e.reason} |`)
  );
  if (!rows.length) return 'None.';
  return ['| Kind | Pattern | Reason |', '|---|---|---|', ...rows].join('\n');
}

function auditSection(rows) {
  if (rows === null) return 'Image audit did not run.';
  if (!rows.length) return 'No oversized images. Full report: `image-audit/report.md`.';
  const egregious = rows.filter(r => r.egregious).length;
  const total = rows.reduce((s, r) => s + r.wastedBytes, 0);
  const top = rows
    .slice(0, 10)
    .map(r => `| ${r.block} | ${r.file} | ${r.page} | ${r.viewport} | ${r.ratio}x | ${r.wastedBytes ? kb(r.wastedBytes) : '?'} |`);
  return [
    `${rows.length} oversized image occurrence(s), est. ${kb(total)} wasted, ${egregious} egregious. ` +
      'Full report: `image-audit/report.md`.',
    '',
    '| Owning block | Image | Page | Viewport | Ratio | Est. wasted |',
    '|---|---|---|---|--:|--:|',
    ...top,
  ].join('\n');
}

export function renderLaunchReport({ config, environment, exceptions, generatedAt, suiteVersion, runBy, tests, auditRows }) {
  const egregiousCount = (auditRows ?? []).filter(r => r.egregious).length;
  const when = `${generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  return [
    `# Launch report: ${config.name}`,
    '',
    '| | |',
    '|---|---|',
    `| Environment | ${environment.name} (${environment.baseURL}) |`,
    `| Generated | ${when} |`,
    `| Suite version | ${suiteVersion} |`,
    `| Run by | ${runBy} |`,
    '',
    '## Result',
    '',
    resultSection(tests, egregiousCount, auditRows !== null),
    '',
    '## Failures',
    '',
    failuresSection(tests),
    '',
    '## Features',
    '',
    featuresSection(config.features),
    '',
    '## Exceptions in effect',
    '',
    exceptionsSection(exceptions),
    '',
    '## Image audit',
    '',
    auditSection(auditRows),
    '',
    '## Visual review',
    '',
    'Open `screenshots/index.html` and check every page on every device:',
    '',
    ...VISUAL_REVIEW.map(item => `- [ ] ${item}`),
    '',
  ].join('\n');
}
```

Run: `cd /Users/aleksi/work/test-suite/tests && node --test lib/report.test.js`
Expected: PASS.

- [ ] **Step 3: Write `tests/launch-check.js`**

```js
// The standard launch check. One command:
//   1. check-config (stops here when the config does not match the site)
//   2. functional checks and screenshots across the 6 projects
//   3. gallery
//   4. image audit
//   5. launch report: report/<env>/launch-report.md
// Steps 2 to 5 run to the end even when checks fail, so the report is complete.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadSuiteOrExit, run } from './lib/cli.js';
import { reportDir, runDir } from './lib/environment.js';
import { collectTests, renderLaunchReport } from './lib/report.js';
import { readAuditRows } from './lib/audit-rows.js';
import { SUITE_DIR } from './lib/config.js';

const { config, environment, exceptions } = await loadSuiteOrExit();
const out = reportDir(environment.name);
fs.rmSync(out, { recursive: true, force: true });

console.log(`Launch check: ${config.name}, environment "${environment.name}" (${environment.baseURL})`);

if (run('node check-config.js') !== 0) {
  console.error('\nLaunch check stopped: fix tests.config.mjs (or the site) and run it again.');
  process.exit(1);
}

const mainStatus = run('npx playwright test --grep-invert "@config|@audit"', { RUN_LABEL: 'main' });
run('node build-gallery.js');
const auditStatus = run('node image-audit.js');

function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: SUITE_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const version = JSON.parse(fs.readFileSync(path.join(SUITE_DIR, 'package.json'), 'utf8')).version;
const sha = tryExec('git rev-parse --short HEAD');
const resultsFile = path.join(runDir(environment.name, 'main'), 'results.json');

const report = renderLaunchReport({
  config,
  environment,
  exceptions,
  generatedAt: new Date(),
  suiteVersion: sha ? `${version} (${sha})` : version,
  runBy: tryExec('git config user.name') || os.userInfo().username,
  tests: fs.existsSync(resultsFile) ? collectTests(JSON.parse(fs.readFileSync(resultsFile, 'utf8'))) : null,
  auditRows: readAuditRows(path.join(out, 'image-audit', 'data')),
});

const reportFile = path.join(out, 'launch-report.md');
fs.writeFileSync(reportFile, report);
console.log(`\nWrote ${reportFile}`);
process.exit(mainStatus !== 0 || auditStatus !== 0 ? 1 : 0);
```

- [ ] **Step 4: Add the npm script**

In `tests/package.json` scripts, add:

```json
    "launch-check": "node launch-check.js",
```

- [ ] **Step 5: Run the full launch check on the test bed**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run launch-check; echo "exit=$?"`
Expected: config check passes; the main run covers 6 projects; gallery written; audit runs; `Wrote .../report/local/launch-report.md`; `exit=0`.

Run: `cd /Users/aleksi/work/test-suite/tests && cat report/local/launch-report.md`
Expected: all 7 sections in order; `**Automated checks: PASSED**`; the checks x projects table has `ok` or `skipped` cells only; features all `tested`; exceptions `None.`.

- [ ] **Step 6: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/lib/report.js tests/lib/report.test.js tests/launch-check.js tests/package.json
git commit -m "Add launch-check orchestrator and the launch report"
```

---

### Task 12: Documentation (README.md, AGENTS.md, olmar example)

**Files:**
- Create: `tests/AGENTS.md`, `examples/olmar.tests.config.mjs`
- Modify: `tests/README.md` (full rewrite)
- Delete: `tests/PLAN.md` (its background moves into AGENTS.md)

**Interfaces:**
- Consumes: the config keys (Task 3), commands (Tasks 5 to 11), report sections (Task 11).

- [ ] **Step 1: Write `examples/olmar.tests.config.mjs`**

This is the olmar suite's configuration expressed in the new format. It is both the README's real-world example and the parity config for Task 13.

```js
// Olmar (olmar.local) in the launch check format. Used as the README example
// and for the parity check against the original olmar suite.
export default {
  name: 'Olmar',

  environments: {
    local: { baseURL: 'https://olmar.local' },
  },

  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'services', path: '/services-overview/', label: 'Services overview' },
    { slug: 'service', path: '/services-overview/warehousing/', label: 'Single service' },
    { slug: 'solutions', path: '/custom-solutions/', label: 'Solutions overview' },
    { slug: 'references', path: '/references/', label: 'References listing' },
    {
      slug: 'reference',
      path: '/references/morbi-ac-throughput-et-cargo-bibendum-manifest-operations/',
      label: 'Single reference',
    },
    { slug: 'news', path: '/news/', label: 'News listing' },
    { slug: 'article', path: '/aenean-eu-pilotage-quis-turpis-consequat-vehicula-2/', label: 'Single article' },
    { slug: 'about', path: '/about-us/', label: 'About us' },
    { slug: 'contact', path: '/contact-us/', label: 'Contact us' },
  ],

  features: {
    navigation: { desktopLink: 'References' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact-us/' },
    form: { path: '/contact-us/', gravityFormId: 1 },
  },

  exceptions: {
    notFound: [
      {
        pattern: /OLMAR-H265-1080HD-V\.mov$/i,
        env: ['local'],
        reason: 'Hero video (133 MB) is not synced to the local environment; production serves it with 206.',
      },
    ],
    blockHosts: [
      {
        pattern: /cookiebot\.com/,
        reason: 'Cookiebot loads its consent banner asynchronously, so it appears in some captures and not others.',
      },
    ],
  },
};
```

- [ ] **Step 2: Write `tests/README.md`**

Replace the whole file with:

````markdown
# Launch check

The standard final check before a kala-stack site launches. It runs the same
automated checks on every project, in six browser and device combinations,
against the environment you choose: your local site, staging or production.
The result is one launch report.

## Why it exists

To make the final check before launch easier, faster and coherent. Every
project gets the same checks and a report in the same form, so anyone on the
team can read the result.

It catches the problems that most often surface after launch:

- layout that breaks on a phone, a tablet or in one browser
- broken pages, missing images and JavaScript errors
- menus, accordions and forms that do not work on some device
- images that are much heavier than they need to be

## What it checks

| Check | What it verifies | Catches |
|---|---|---|
| Page load | Every configured page returns 200 (the 404 page returns 404), with no console errors, no missing resources and no broken images. | Broken pages, missing files, JS errors |
| Overflow | No page scrolls sideways. On failure the widest offending elements are named. | Layout breaking on small screens |
| Navigation | Desktop: a top-level link navigates. Mobile: the menu toggle opens and closes the menu. | Menu broken on a device |
| Skip link | The skip link moves to the main content. | Accessibility regression |
| Sticky header | The header hides on scroll down and returns on scroll up. | Header script broken |
| Accordion | An accordion item opens when clicked. | Block script broken |
| Form | The Gravity Form can be filled and submitted. The submission is stopped in the browser and never reaches a server. | Form broken on a device |
| Screenshots | A full-page screenshot of every page on every device, collected into a gallery. | Visual problems a person has to judge |
| Image audit | Images served much larger than they are displayed, with a suggested image size. | Heavy pages |

Every check runs on these six combinations (the image audit on the three
Chromium ones):

|          | Phone         | Tablet         | Desktop    |
|----------|---------------|----------------|------------|
| Chromium | Pixel 5       | iPad (gen 7)   | 1440 x 900 |
| Firefox  |               |                | 1440 x 900 |
| WebKit   | iPhone 13     |                | 1440 x 900 |

## Getting started

### 1. Install

```bash
cd tests
npm install
npx playwright install   # Chromium, Firefox and WebKit, about 400 MB
```

### 2. Configure the project

The suite reads everything site-specific from `tests.config.mjs` in the
project root. Claude writes it. Ask:

> Configure the launch check for this project. Follow tests/AGENTS.md.

Claude reads the site, writes the config and runs `npm run check-config` to
confirm the config matches the site. Review the config before committing it:

- Are the pages the ones that matter? There should be one per template type.
- Is every feature decided correctly (tested, or `false` when the site does not
  have it)?
- Does every exception have a reason you agree with?

### 3. Run the launch check

```bash
cd tests
npm run launch-check
```

The report is written to `tests/report/local/launch-report.md`.

## Choosing the environment

Environments are defined in `tests.config.mjs`. `local` is the default:

```bash
npm run launch-check                         # local
TEST_ENV=staging npm run launch-check        # staging
TEST_ENV=production npm run launch-check     # production
```

The environment and its URL are printed at the start of the run and written
into the report.

### Sites behind a login

Before launch most sites are closed with `wp-force-login` or basic auth. Set
`auth` for the environment in the config (`'wp-login'` or `'basic'`) and put
the credentials in `.env.tests` in the project root. The file is gitignored.

```
TEST_AUTH_USER=launchcheck
TEST_AUTH_PASSWORD=...
```

Use a Subscriber account. With `wp-login` the WordPress toolbar is hidden in
every check, so screenshots and layout checks match an anonymous visitor.

## Commands

Run from `tests/`. All of them respect `TEST_ENV`.

| Command | What it does |
|---|---|
| `npm run launch-check` | The standard launch check: config check, all checks on all devices, gallery, image audit, report. |
| `npm run check-config` | Confirms the config matches the site, in one browser. Takes about a minute. |
| `npm test` | Functional checks only, for iterating on a fix. |
| `npm run test:visual` | Screenshots and gallery only. |
| `npm run audit:images` | Image audit only. |
| `npm run report` | Opens the Playwright HTML report of the last main run. |
| `npm run test:unit` | The suite's own unit tests. |

Narrow a run while fixing something:

```bash
npx playwright test --project=chrome-phone --grep "overflow"
npx playwright test --debug --grep "accordion"
```

## Reading the report

`tests/report/<env>/launch-report.md` has the same sections on every project:

1. **Header:** site, environment, time, suite version, who ran it.
2. **Result:** the verdict and a table of checks by device.
3. **Failures:** each failure with its message and the path to its Playwright
   trace (`npx playwright show-trace <path>`).
4. **Features:** each feature as tested or not on this site.
5. **Exceptions in effect:** every allowed 404, console error and blocked host,
   with its reason.
6. **Image audit:** the largest wastes; the full list is in
   `image-audit/report.md`.
7. **Visual review:** the gallery link and a checklist. Open
   `screenshots/index.html`, go through every page on every device and tick the
   items.

You can also ask Claude to "check the launch report". It summarizes the
result from the same file.

### When something fails

1. Run `npm run check-config`. If it fails, the config no longer matches the
   site, usually because content changed (a menu item was renamed, a form was
   replaced). Fix the config.
2. If it passes, the failure is a problem in the site. Fix the site.
3. A test marked flaky failed once and passed on retry. If the first failure
   was not a timeout, treat it as real.

### Honesty rules

1. A failure is a failure. Never weaken a check to make it pass.
2. Every exception needs a reason in the config. The report lists them all.
3. The visual review is done by a person. There is no pass button.

## Config at a glance

```js
// tests.config.mjs (project root)
export default {
  name: 'Olmar',
  environments: {
    local: {},                                   // URL from config.yml
    staging: { baseURL: 'https://olmar-staging.example.com', auth: 'basic' },
  },
  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'contact', path: '/contact-us/', label: 'Contact us' },
  ],
  features: {
    navigation: { desktopLink: 'References' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact-us/' },
    form: { path: '/contact-us/', gravityFormId: 1 },
  },
  exceptions: {
    notFound: [
      { pattern: /OLMAR-H265-1080HD-V\.mov$/i, env: ['local'],
        reason: 'Hero video is not synced to local; production serves it.' },
    ],
  },
};
```

| Key | Meaning |
|---|---|
| `name` | Site name in the report and gallery. |
| `environments` | Where the suite can run. `local` is required; its URL defaults to `config.yml`. `auth` is `'wp-login'` or `'basic'`. |
| `pages` | The pages every check visits. The 404 page is added automatically. |
| `features` | Every feature must be listed: its target, `true`, or `false` when the site does not have it. |
| `exceptions` | `notFound`, `consoleErrors`, `blockHosts`. Each entry has a `pattern`, a `reason` and optionally `env`. |
| `selectors` | Only when the site's markup differs from kala-stack. |
| `blockAnalytics` | Blocks analytics collection during runs. Default `true`. |

A complete real example: `examples/olmar.tests.config.mjs`. How each value is
found: `tests/AGENTS.md`.

## What it does not check

- **Real iOS Safari.** WebKit is the same engine, not the same browser.
- **Email delivery.** The form check stops the submission in the browser.
- **Launch-day items:** search engine visibility, redirects from old URLs,
  analytics, cookie consent. A launch-day checklist will be added to the report
  later.
````

- [ ] **Step 3: Write `tests/AGENTS.md`**

````markdown
# Launch check: instructions for agents

You configure the launch check for this project and report its results. The
developer runs the checks; you make sure they test the right things.

## Your task and its limits

- Write `tests.config.mjs` in the project root (the directory above `tests/`).
- Never edit anything in `tests/`. The suite is a shared template; a change
  here would make this project's checks differ from every other project's.
- When the config cannot express what the site needs (a feature the suite has
  no key for, markup the selectors cannot describe), stop and tell the
  developer that the template needs a new config key. Do not work around it.
- Ask the developer for anything you cannot read from the project or the site.
  Never guess URLs or credentials.

## Background and decisions

These are settled. Do not reopen them while configuring.

**Scope.** Pre-launch functional checks (page load, overflow, navigation, skip
link, sticky header, accordion, form), screenshots for a human visual review,
and an image-size audit. Out of scope: cookie consent, third-party widgets,
real devices, cross-browser pixel diffs, real form submissions.

**Matrix.** Six Playwright projects: Chromium phone (Pixel 5), tablet (iPad gen
7) and desktop (1440 x 900), Firefox desktop, WebKit phone (iPhone 13) and
desktop. WebKit is Safari's engine, not iOS Safari itself; that is enough for a
pre-launch pass.

**Tooling.** `@playwright/test`, because it drives Chromium, Firefox and WebKit.
BackstopJS (Chromium only) and Cypress (no stable WebKit) were rejected.

**No cross-browser pixel diff.** Browsers legitimately render fonts, form
widgets and scrollbars differently, so a pixel diff between them always fails.
A person reviews the gallery instead.

**Honesty rules.**
1. A failure is triaged as a failure. Never weaken a check or add an exception
   to make a run pass.
2. Every exception carries a `reason` the developer can agree with.
3. The visual review is done by a person.

## Configuration, key by key

Work against the local site unless the developer says otherwise. Useful tools:
`curl -sk` against the site and its REST API, `npx playwright codegen <url>`
(from `tests/`) to inspect elements, and the browser automation tools you have.
Local WP-CLI: `docker compose exec -T --user vagrant wordpress wp ...` from the
project root.

### `name`

The site's name as the team calls it. Read `config.yml` (`name:`) or the site
title (`wp option get blogname`).

### `environments`

- `local: {}` is enough when `config.yml` has `development.domains`; the URL
  becomes `https://<first domain>`. Otherwise set `baseURL`.
- Add `staging` and `production` only with URLs the developer gives you. Ask
  whether the site is closed before launch: `wp-force-login` means
  `auth: 'wp-login'`, a browser password prompt means `auth: 'basic'`.
- With `auth`, the developer puts `TEST_AUTH_USER` and `TEST_AUTH_PASSWORD` in
  `.env.tests` in the project root. The account should be a Subscriber. Never
  write credentials into `tests.config.mjs`.

### `pages`

Pick pages by this fixed rule so every project is covered the same way:

1. the front page (`/`)
2. one basic page
3. each archive: the posts page and every public post type with an archive
4. one single of each public post type (posts and every custom post type)
5. the contact page
6. any page a feature uses (accordion, form) not already listed

Find them:

```bash
curl -sk '<baseURL>/wp-json/wp/v2/pages?per_page=100&_fields=slug,link'
curl -sk '<baseURL>/wp-json/wp/v2/types' | python3 -c "import sys,json;[print(k, v.get('rest_base')) for k,v in json.load(sys.stdin).items()]"
curl -sk '<baseURL>/wp-json/wp/v2/<rest_base>?per_page=1&_fields=link'
```

Use each page's final path with its trailing slash. `check-config` fails on a
path that redirects and names the final path. Slugs are short, unique and
lowercase; do not use `404` (the suite adds the 404 page itself). Labels
describe the template ("Single book"), not the content.

### `features`

Every key must be present. Set `false` when the site does not have the feature;
the report then says "not on this site".

- **`navigation`**: `{ desktopLink: '<text>' }`. Open the front page on desktop
  and pick a top-level menu item without a sub-menu. Its visible text is
  `desktopLink` (exact match). Items with a sub-menu are dropdown triggers and
  do not navigate. `false` only if the site has no main menu.
- **`skipLink`**: `true` when the page has `<a href="#content">` (kala-stack's
  header.php does).
  ```bash
  curl -sk <baseURL>/ | grep -o 'href="#[^"]*"' | head -3
  ```
- **`stickyHeader`**: `true` when the header uses Headroom (the element with
  `js-site-header` gets `headroom` classes in the browser). The front page must
  scroll at least 1200px; `check-config` tells you if it does not.
- **`accordion`**: `{ path: '<page>' }` for a page with a meomblocks accordion
  (`.accordion__header` buttons).
  ```bash
  wp post list --post_type=page --s='wp:meomblocks/accordion' --fields=ID,post_name
  ```
- **`form`**: `{ path: '<page>', gravityFormId: <id> }`. Find the page with the
  main contact form and read its id from the `id="gform_<id>"` element.
  Multi-page forms are not supported; pick a single-page form or set `false`
  and tell the developer.

### `exceptions`

Leave empty at first. Add an entry only after a run, for a failure you have
triaged as not a site problem, and only with the developer's agreement. Scope
local data gaps to local with `env: ['local']`, so they do not hide problems on
staging or production.

- `notFound`: a resource that legitimately 404s (for example a large media file
  not synced to local).
- `consoleErrors`: a console error from code the project cannot change.
- `blockHosts`: a third-party host that makes runs nondeterministic (for
  example a consent banner that loads asynchronously).

Each entry: `{ pattern: /regex/, reason: 'why this is justified', env?: [...] }`.

### `selectors` and `blockAnalytics`

Leave both out unless the site differs from kala-stack. The defaults are
`.js-site-nav`, `.js-site-nav-toggle`, `is-opened`, `.js-site-header`,
`#content` and `.accordion__header`. Override only the selector that differs.
`blockAnalytics` stays `true` unless the developer asks otherwise.

A complete example: `examples/olmar.tests.config.mjs` in the suite repository.

## Verification

1. From `tests/`: `npm run check-config`. It must pass. Every failure names the
   config key to fix.
2. Run `npm run launch-check` (or ask the developer to).
3. Sort every failure in the report into one of two kinds:
   - **config error:** the check targets the wrong thing. Fix the config and
     rerun `check-config`.
   - **site error:** the site is broken. Report it to the developer. Do not
     change the config to hide it.

## Reporting to the developer

Summarize from `tests/report/<env>/launch-report.md`:

- the verdict and the environment it was run against
- every failure, grouped by check, with the affected devices and the message
- flaky tests, and whether their first failure was a timeout
- features not tested, and exceptions in effect with their reasons
- the image audit totals and the largest items
- a reminder that the visual review checklist is theirs to do

Do not omit, soften or reinterpret a failure. If you are unsure whether a
failure is a site problem, say so and show the message.
````

- [ ] **Step 4: Delete PLAN.md and verify the docs**

```bash
cd /Users/aleksi/work/test-suite
git rm tests/PLAN.md
grep -n "—" tests/README.md tests/AGENTS.md examples/olmar.tests.config.mjs; echo "dash-exit=$?"
grep -c '^```' tests/README.md tests/AGENTS.md
grep -rn "PLAN.md\|olmar" tests --include=*.js --include=*.md -l | grep -v node_modules
```
Expected: `dash-exit=1` (no long dashes); both fence counts even; the last grep lists only `tests/README.md` (the Olmar example in "Config at a glance").

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/work/test-suite
git add tests/README.md tests/AGENTS.md examples/olmar.tests.config.mjs
git commit -m "Rewrite README for developers; add AGENTS.md and the olmar example config"
```

---

### Task 13: Verification of the template

Prove the success criteria: Claude can configure a site from AGENTS.md alone, the checks catch real faults, and making the suite generic lost nothing against olmar.

**Files:**
- Modify: `tests.config.mjs` (replaced by the AGENTS.md dry-run result)

- [ ] **Step 1: AGENTS.md dry run on the test bed**

Move the hand-written config aside:

```bash
cd /Users/aleksi/work/test-suite
mv tests.config.mjs tests/report/handwritten.tests.config.mjs
```

Dispatch a fresh general-purpose subagent with exactly this prompt:

> You are in /Users/aleksi/work/test-suite, a kala-stack WordPress project whose local site is https://test-suite.local (Docker container is running). Configure the launch check for this project. Follow tests/AGENTS.md and nothing else. The site is open locally (no login) and there are no staging or production environments yet. When done, report the config you wrote and the output of `npm run check-config`.

Expected: the subagent writes `/Users/aleksi/work/test-suite/tests.config.mjs` and `check-config` passes. Compare with `tests/report/handwritten.tests.config.mjs`: the same template types in `pages` (front, basic page, posts archive, single post, book archive, single book, contact) and the same feature decisions. Every difference is either a flaw in AGENTS.md (fix AGENTS.md, delete the config, dispatch a new subagent) or an equally valid choice (note it). Keep the local-login environment out; Task 9 covered it.

- [ ] **Step 2: Full launch check with the agent-written config**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run launch-check; echo "exit=$?"`
Expected: `exit=0`; `report/local/launch-report.md` says `**Automated checks: PASSED**`.

- [ ] **Step 3: Negative checks: each fault must show up**

For each fault: apply it, run the command, confirm the expected failure in `report/local/launch-report.md` (or in the terminal for check-config), then revert and confirm green again with `npm test -- --project=chrome-desktop`. Run WP-CLI from `/Users/aleksi/work/test-suite` through this shell function: `wp() { docker compose exec -T --user vagrant wordpress wp "$@" 2>/dev/null; }`.

Save the About page content first: `about_id=$(wp post list --post_type=page --name=about --field=ID); wp post get "$about_id" --field=content > tests/report/about.backup.html`

| Fault | Apply | Run | Expected in report |
|---|---|---|---|
| Overflow | Append `<!-- wp:html --><div style="width:2000px;height:10px;background:red"></div><!-- /wp:html -->` to About | `npm run launch-check` | `overflow` fails on every project for `/about/`, offender `div` named |
| Broken image | Append `<!-- wp:html --><img src="/wp-content/uploads/launch-check-missing.jpg" alt=""><!-- /wp:html -->` to About | `npm run launch-check` | `page-load` fails for `/about/` with the missing URL under unexpected 404 resources |
| JS error | Append `<!-- wp:html --><script>throw new Error('launch-check negative test')</script><!-- /wp:html -->` to About | `npm run launch-check` | `page-load` fails for `/about/` with `launch-check negative test` in console errors |
| Form missing | `wp plugin deactivate gravityforms` | `npm run launch-check` | stops at check-config with `features.form: #gform_1 not found`; exit 1 |

Apply the About faults one at a time with:

```bash
wp post update "$about_id" --post_content="$(cat tests/report/about.backup.html)
<fault markup>"
```

Revert with `wp post update "$about_id" --post_content="$(cat tests/report/about.backup.html)"` and `wp plugin activate gravityforms`.

- [ ] **Step 4: A redirecting page path is caught by check-config**

Temporarily change the About entry in `tests.config.mjs` to `path: '/about'` (no trailing slash).

Run: `cd /Users/aleksi/work/test-suite/tests && npm run check-config; echo "exit=$?"`
Expected: `pages: /about redirects to /about/; use the final path`; `exit=1`. Restore `'/about/'`.

- [ ] **Step 5: Commit the agent-written config**

```bash
cd /Users/aleksi/work/test-suite
rm tests/report/handwritten.tests.config.mjs tests/report/about.backup.html
git add tests.config.mjs tests/AGENTS.md
git commit -m "Add test bed config written by following AGENTS.md"
```

- [ ] **Step 6: Olmar parity**

Only one site container can serve ports 80/443 at a time. Ask the developer to stop this project's container (`docker compose stop` in `/Users/aleksi/work/test-suite`) and start olmar's, then confirm:

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://olmar.local/references/
```
Expected: `200`. If not, stop and ask the developer.

Run the original olmar suite's functional checks:

```bash
cd /Users/aleksi/work/olmar/tests
PLAYWRIGHT_JSON_OUTPUT_NAME=/Users/aleksi/work/test-suite/tests/report/parity/old.json \
  npx playwright test --grep-invert "@visual|@regression|@audit" --reporter=json > /dev/null; echo "old-exit=$?"
```

Run the new suite against olmar:

```bash
cd /Users/aleksi/work/test-suite/tests
SUITE_CONFIG=../examples/olmar.tests.config.mjs npm test; echo "new-exit=$?"
cp report/local/runs/main/results.json report/parity/new.json
```

Write `tests/report/parity/compare.mjs` (gitignored, one-off):

```js
import fs from 'node:fs';
import { collectTests } from '../../lib/report.js';

const summarize = file => {
  const counts = {};
  for (const t of collectTests(JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8')))) {
    const key = `${t.check} | ${t.project}`;
    counts[key] ??= { failed: 0, passed: 0 };
    if (t.outcome === 'unexpected') counts[key].failed++;
    else if (t.outcome !== 'skipped') counts[key].passed++;
  }
  return counts;
};

const before = summarize('./old.json');
const after = summarize('./new.json');
for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
  const b = before[key] ?? { failed: '-', passed: '-' };
  const a = after[key] ?? { failed: '-', passed: '-' };
  const mark = b.failed === a.failed ? '' : '   <-- differs';
  console.log(`${key.padEnd(34)} old ${b.passed}/${b.failed} failed   new ${a.passed}/${a.failed} failed${mark}`);
}
```

Run: `cd /Users/aleksi/work/test-suite/tests && node report/parity/compare.mjs`
Expected: failure counts match per check and project. Passed counts may differ where the new suite has more tests: `anchors` and `navigation` are unchanged in count, `page-load` and `overflow` include the 404 page in both, `forms` is one test in both. For every `differs` line, read both failure messages and classify: a behaviour change in the new suite is a bug to fix before merging; a difference explained by the new design (Cookiebot blocked in every test, analytics blocked) is written into the final summary for the developer.

Ask the developer to switch the containers back (stop olmar, `docker compose start` in `/Users/aleksi/work/test-suite`).

- [ ] **Step 7: Final unit run and summary**

Run: `cd /Users/aleksi/work/test-suite/tests && npm run test:unit`
Expected: PASS.

Report to the developer: the dry-run comparison (Step 1), the negative-check table with results (Step 3), the parity table and any explained differences (Step 6).

---

## Self-Review

**1. Spec coverage**

- Structure, config outside the suite, `SUITE_CONFIG`, project root: Tasks 3, 4, 5.
- Config keys, validation, feature decisions, reasons as data, env-scoped exceptions, selector defaults, 404 auto page: Task 3.
- Form check (intercept all non-GET, fill by type, payload check, multi-page error): Tasks 7, 8.
- `TEST_ENV`, printed environment, basic and wp-login auth, `.env.tests`, admin bar hidden, analytics blocked: Tasks 4, 5, 9.
- Commands `check-config`, `launch-check`, `test`, `test:visual`, `audit:images`, `test:unit`: Tasks 1, 5, 8, 10, 11.
- Output under `report/<env>/`, gitignored with `.auth/`: Tasks 1, 5, 10, 11.
- Launch report, seven sections in order, flaky marking, fixed visual checklist, exit codes: Task 11.
- README and AGENTS.md: Task 12.
- Removal of the plugin-update regression: Task 1.
- Verification: unit tests (Tasks 3, 4, 5, 7, 11), test bed (Tasks 2, 13), negative checks and login (Tasks 9, 13), olmar parity (Task 13).

**2. Placeholder scan:** every code and doc step has full content. `<fault markup>` in Task 13 Step 3 refers to the markup in the table row directly above it.

**3. Type consistency:** `NormalizedConfig` fields (Task 3) are read with the same names in Tasks 4, 5, 6, 7, 8, 11. `runDir`/`reportDir`/`authStatePath` (Task 4) are used with `(envName[, label])` everywhere. Audit row keys including `egregious` (Task 10) match `auditSection` (Task 11). `collectTests` output (`check`, `project`, `outcome`) is used identically in Task 11 and the parity script in Task 13. `RUN_LABEL` values `config`, `main`, `audit` are set in Tasks 8, 11, 10 and read in Task 5.

**4. Review Focus:** all five items have tests: console filtering (Task 5 Step 1), payload encodings (Task 7 Step 1), redirecting path (Task 13 Step 4), missing results (Task 11 Step 1), ANSI stripping (Task 11 Step 1).
