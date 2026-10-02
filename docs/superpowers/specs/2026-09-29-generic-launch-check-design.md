# Generic Launch Check Suite: Design

**Date:** 2026-09-29, distribution added 2026-10-02
**Status:** Implemented up to section 7; section 8 (distribution) awaiting implementation
**Location:** the npm package `@meom/test-suite` in https://github.com/MEOM/test-suite
(public), installed in each project's `test-suite/` folder

## Summary

The Playwright suite built in the olmar project becomes a generic base template
for every kala-stack project. The suite itself holds no site-specific values. A
project describes itself in one config file, which Claude writes by following
`test-suite/AGENTS.md`. The developer then runs one command against the
environment of their choice (local, staging or production) and gets a standard
launch report. The suite is distributed as an npm package installed from the
GitHub repo into a `test-suite/` folder in the project root, which holds
everything the developer works with: config, docs and results (section 8).

## Goal

A standard final check before a kala-stack site launches. It exists to make the
final check easier, faster and coherent: every developer runs the same checks
and gets a report in the same form.

**Success criteria**

- Configuring a new project takes one Claude session and needs no spec edits.
- Two developers on the same project get the same checks and the same report.
- A failure shows whether the config or the site is at fault.
- The report can take new sections (launch-day checklist, audits) without
  changing its existing structure.

## Scope

**In:**
- Pre-launch functional checks: page load, navigation, skip link, sticky
  header, horizontal overflow, accordion, form (intercepted).
- Full-page screenshots and a gallery for human review.
- Image-size audit.
- Environment selection with optional login.
- Config loader with validation, `check-config`, `launch-check`, launch report.
- `README.md` for developers, `AGENTS.md` for Claude.
- Distribution as an npm package from GitHub, with an `init` command (section 8).

**Later (the design leaves room, nothing is built now):**
- Launch-day checklist (SEO settings, redirects, analytics, email delivery),
  partly automated against staging/production, partly manual.
- Audits: performance, accessibility, SEO basics.
- Language switcher and dialog feature keys. The language switcher comes first,
  because many MEOM sites are multilingual.
- Plugin-update visual regression, redesigned for staging/production.
- Publishing to the npm registry. Git installs from GitHub are enough until
  then.

**Removed from the template:** the plugin-update regression
(`specs/visual-regression.spec.js`, `visual-regression.js`, its npm scripts,
the `toHaveScreenshot` config block and the snapshot gitignore rule). The
current tool assumes a local `composer update`, while updates happen on
staging/production. Its design stays in the olmar repo
(`docs/superpowers/specs/2026-06-24-visual-regression-plugin-update-design.md`).

## 1. Structure

**The suite** (the package, identical in every project; repo layout in
section 8):

```
@meom/test-suite/
  bin/test-suite.js      the CLI every project script calls
  specs/                 checks; read targets only from the loaded config
  lib/
    config.js            find, load, default and validate tests.config.mjs
    environment.js       resolve TEST_ENV to baseURL + auth
    suite.js             loads config + environment once; imported everywhere
    projects.js          the 6-project matrix
    cli.js               shared helpers for the Node scripts; runs Playwright
    project.js           init and sync-docs
    version.js           suite version and commit for the report header
    browsers.js          which browser engines can start; skipped projects
    console.js           which console errors page-load ignores
    form.js              Gravity Forms fill values and payload matching
    audit-rows.js        reads image audit data files
    global-setup.js      prints the environment at the start of a run
    test.js              extended Playwright `test` with auto fixtures
    stabilize.js         fonts, animations, lazy images (moved from fixtures/)
    report.js            launch report generator
  playwright.config.js   6-project matrix; baseURL/auth from lib/environment.js
  check-config.js        runs the @config spec on chrome-desktop
  launch-check.js        the standard orchestrator
  image-audit.js         image audit orchestrator (paths updated)
  build-gallery.js       gallery (title from config, projects from the matrix)
  README.md              for the developer
  AGENTS.md              for Claude (replaces PLAN.md)
  examples/              example-site.tests.config.mjs
```

**The project** (the only parts that vary), all inside `<project>/test-suite/`:

```
test-suite/
  package.json           the suite dependency and npm scripts (written by init)
  package-lock.json      pins the suite commit for the whole team
  tests.config.mjs       pages, features, exceptions, environments
  README.md, AGENTS.md   copied from the package on every npm install
  .gitignore             node_modules/, report/, .auth/, .env.tests
  .env.tests             login credentials, gitignored
  report/<env>/          everything a run produces, gitignored
```

The config file is .mjs so it imports as ESM whatever the surrounding
package.json says.

Rules:

- Specs contain no site-specific values. When a site needs something the config
  cannot express, the fix is a new config key in the template, never a spec
  edit in one project.
- Where kala-stack is consistent, defaults come from the stack. The config only
  records what varies between sites.
- The loader finds the config at `SUITE_CONFIG` if set, otherwise at
  `tests.config.mjs` in the current directory. The CLI resolves the path once
  and passes it to every child process as an absolute `SUITE_CONFIG`.
- The **suite folder** is the directory that contains the config file
  (`<project>/test-suite/`). `.env.tests`, `.auth/` and `report/` live there.
  The **project root** is its parent; `config.yml` is read from there.
- The suite never writes into its own package directory.
- fixtures/pages.js is deleted; pages come from the config. fixtures/stabilize.js moves to lib/stabilize.js.

## 2. Config

### Example

```js
export default {
  name: 'Example site',

  environments: {
    local: {}, // The URL comes from config.yml in the project root.
    staging: { baseURL: 'https://staging.example.com', auth: 'basic' },
    production: { baseURL: 'https://www.example.com', auth: 'wp-login' },
  },

  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'about', path: '/about/', label: 'Basic page' },
    { slug: 'news', path: '/news/', label: 'Posts archive' },
    { slug: 'post', path: '/example-post/', label: 'Single post' },
    { slug: 'references', path: '/references/', label: 'References archive' },
    { slug: 'reference', path: '/references/example-reference/', label: 'Single reference' },
    { slug: 'contact', path: '/contact/', label: 'Contact page' },
  ],

  features: {
    navigation: { desktopLink: 'About' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact/' },
    form: { path: '/contact/', gravityFormId: 1 },
  },

  exceptions: {
    notFound: [
      {
        pattern: /hero-video\.mp4$/,
        env: ['local'],
        reason: 'The hero video is not synced to local; staging and production serve it.',
      },
    ],
    consoleErrors: [],
    blockHosts: [
      {
        pattern: /consent\.example-cmp\.com/,
        reason: 'The consent banner loads asynchronously and makes screenshots nondeterministic.',
      },
    ],
  },
};
```

### Keys

| Key | Required | Meaning |
|---|---|---|
| `name` | yes | Site name for the report and gallery title. |
| `environments` | yes | Map of environment name to `{ baseURL, auth? }`. `local` is required. |
| `environments.local.baseURL` | no | Defaults to `https://` + `development.domains[0]` from `config.yml` in the project root. |
| `auth` | no | `'basic'` or `'wp-login'`. Omitted means no login. |
| `pages` | yes | At least one `{ slug, path, label }`. Slugs are unique. A 404 page is appended automatically (`slug: '404'`, `path: '/launch-check-404/'`); a config page with slug `404` is an error. |
| `features` | yes | Every known feature key must be present, as an object or `true` (tested) or `false` (not on this site). A missing or unknown key is an error. |
| `exceptions.notFound` | no | Resource URLs allowed to 404. |
| `exceptions.consoleErrors` | no | Console error texts allowed. |
| `exceptions.blockHosts` | no | Request URLs aborted in every test. |
| `selectors` | no | Overrides for the defaults below. Unknown keys are an error. |
| `blockAnalytics` | no | Abort analytics collection requests. Default `true`. |

Every exception entry is `{ pattern: RegExp, reason: string, env?: string[] }`.
An entry without a non-empty `reason` is an error. With `env`, the entry
applies only in those environments. The reasons are printed in the report.

### Features

| Feature | Value | Check |
|---|---|---|
| `navigation` | `{ desktopLink }` or `false` | Desktop: clicking the top-level link whose accessible name matches `desktopLink` (a link without a sub-menu) navigates to its `href`. Mobile: the toggle opens and closes the menu. |
| `skipLink` | `true` / `false` | The skip link moves focus and scroll to the content target. |
| `stickyHeader` | `true` / `false` | The Headroom header unpins on scroll down and re-pins on scroll up. |
| `accordion` | `{ path }` or `false` | The first accordion header toggles `aria-expanded` on the given page. |
| `form` | `{ path, gravityFormId }` or `false` | The Gravity Form is filled and submitted; the POST is intercepted and checked. |

Always-on checks that are not features: page load, horizontal overflow,
screenshots, image audit.

### Selector defaults (kala-stack)

| Key | Default |
|---|---|
| `nav` | `.js-site-nav` |
| `navToggle` | `.js-site-nav-toggle` |
| `navOpenClass` | `is-opened` |
| `header` | `.js-site-header` |
| `skipLinkTarget` | `#content` |
| `accordionHeader` | `.accordion__header` |

### Form check

- All non-GET requests from the page are fulfilled in the browser with an empty
  200 response and captured. Nothing reaches any server, in any environment.
- Every visible field inside `#gform_<id>` is filled by type: email
  `test@example.com`, tel `+358000000000`, textarea `automated check`, other
  text inputs `Playwright`. Selects get their first non-empty option; each
  checkbox and radio group gets its first option checked.
- The captured body must contain `gform_submit` with the form id and every
  filled text value.
- Multi-page Gravity Forms are out of scope. `check-config` reports an error if
  the form contains a page break.

## 3. Environments and login

- `TEST_ENV` selects the environment; default `local`. An unknown name is an
  error that lists the configured names.
- The environment name and baseURL are printed at the start of each run and
  written into the report.
- `auth: 'basic'` passes `TEST_AUTH_USER` / `TEST_AUTH_PASSWORD` as Playwright
  `httpCredentials`.
- `auth: 'wp-login'`: a Playwright setup project logs in once through
  `/wp-login.php` in Chromium, saves the storage state to
  `test-suite/.auth/<env>.json` and every project depends on it. This covers sites
  closed with `wp-force-login`.
- Credentials are read from `test-suite/.env.tests` with
  `util.parseEnv` (the shell environment wins over the file). A configured `auth` with missing credentials is an
  error before any browser starts.
- The test user should be a Subscriber. With `wp-login`, the fixture hides
  `#wpadminbar` and removes the `html` top margin it adds, so screenshots and
  overflow measurements match an anonymous visitor.
- `blockAnalytics` aborts only collection requests (GA4 and Universal
  Analytics `collect` endpoints). Scripts still load, so their errors are still
  caught.

### Extended `test` (lib/test.js)

All specs import `test` and `expect` from `lib/test.js`. An automatic fixture
applies, before navigation, in every test:

1. abort `exceptions.blockHosts` for the current environment,
2. abort analytics collection when `blockAnalytics` is on,
3. hide the admin bar when `auth` is `wp-login`.

## 4. Running

Run from `<project>/test-suite/`. Each npm script calls a `test-suite` CLI
subcommand (section 8).

| Command | CLI | What it does |
|---|---|---|
| `npm run check-config` | `test-suite config` | Validates the config, then in chrome-desktop: every page returns 200 (404 for the 404 page), login succeeds when `auth` is set (the page is not the login form), and every enabled feature's target exists. Prints one line per check. |
| `npm run launch-check` | `test-suite run` | check-config (stops on failure), functional checks and screenshots across the 6 projects, gallery, image audit, launch report. Runs to the end when individual checks fail. |
| `npm test` | `test-suite test` | Functional checks only. Extra arguments go to Playwright: `npm test -- --project=chrome-phone --grep overflow`. |
| `npm run test:visual` | `test-suite visual` | Screenshots and gallery. |
| `npm run audit:images` | `test-suite audit` | Image audit on the 3 Chromium projects. |
| `npm run report` | `test-suite report` | Opens the Playwright HTML report of the last main run. |
| `npm run install-browsers` | `test-suite install-browsers` | Installs the browsers for the suite's Playwright version. |
| | `npx test-suite trace <path>` | Opens a trace from the launch report. |

Developers never call `npx playwright` directly: Playwright is a dependency of
the package, not of the project, so `npx playwright` would fetch an unrelated
version. In the package repo, `npm run test:unit` runs the unit tests
(`node --test`).

All commands respect `TEST_ENV`. Tags: `@config` (check-config spec),
`@visual`, `@audit`. `npm test` excludes all three.

`workers: 1` and `retries: 1` stay. A test that passes on retry is reported as
flaky.

### Output

Everything a run produces goes to `test-suite/report/<env>/`, gitignored:

```
test-suite/report/<env>/
  launch-report.md
  runs/config/           check-config run: results.json, playwright-report/, test-results/
  runs/main/             functional + screenshots run
  runs/audit/            image audit run
  screenshots/           gallery index.html + PNGs
  image-audit/           data/*.json + report.md
```

Each Playwright run writes to its own runs/<label>/ folder so the image audit run cannot overwrite the functional results.

`test-suite/.auth/` is gitignored as well.

### Browsers that cannot start

After check-config, `launch-check` starts each browser engine in the matrix
(Chromium, Firefox, WebKit) once, with a 15 s launch timeout, and closes it.
A project whose engine does not start is left out of the main run, which gets
`--project` flags for the others. Without this, every test of that project
waits out Playwright's launch timeout and a run takes tens of minutes before
it reports anything. Seen 2026-10-02 on macOS 27: Playwright's bundled Firefox hangs at launch
because it shares the real Firefox's app data folder, which macOS 27 protects
(microsoft/playwright#42768). The suite starts Firefox on macOS with
`CFFIXED_USER_HOME` set to a folder of its own (`<tmpdir>/test-suite-firefox-home`),
in both the probe and the firefox-desktop project, until Playwright ships the
fix.

The skipped projects and the reason (the launch error's first line and its
`[err]` line) go into the report (section 5), and `launch-check` exits
non-zero. check-config itself runs on Chromium, so a machine where Chromium
cannot start fails at check-config as before.

## 5. Launch report

`test-suite/report/<env>/launch-report.md`, sections in fixed order:

1. **Header:** site name, environment and baseURL, date and time, suite version
   (the package's `package.json` version and the installed commit, section 8),
   who ran it (`git config user.name`).
2. **Result:** the verdict, passed / failed / flaky counts and a table of
   checks × projects. The verdict is FAILED when a check failed or the image
   audit failed, INCOMPLETE when nothing failed but a project was not run
   because its browser could not start, PASSED otherwise. With skipped
   projects, a "Not run on this machine" list follows the table (project,
   engine, reason) with this fixed text: "The result covers only the browsers that ran. To complete it, run `npm run launch-check` in your own terminal app (Terminal or iTerm). If the reason says the browser executable does not exist, run `npm run install-browsers` first. If the browser fails in your terminal too, see "Browsers that cannot start" in README.md."
3. **Failures:** grouped by check, with the failure message and the trace path.
4. **Features:** each feature as "tested" or "not on this site".
5. **Exceptions in effect:** pattern and reason for each entry that applies to
   this environment.
6. **Image audit:** totals and the 10 largest estimated wastes, with a link to
   the full image report.
7. **Visual review:** a link to the gallery and this fixed checklist:
   - [ ] Header, logo and navigation render correctly on every page and device
   - [ ] Footer is complete on every page
   - [ ] No overlapping or cut-off text
   - [ ] Images are present, not stretched and not cropped wrongly
   - [ ] Form fields, labels and button are laid out correctly in every browser
   - [ ] Fonts are the site's fonts, not a fallback
   - [ ] Spacing and alignment are consistent between browsers

`launch-check` exits non-zero when any functional check fails, the image
audit has an egregious finding or a project was not run. The visual review
never affects the exit code.
New sections are appended after section 7.

## 6. Documentation

### README.md (developer)

1. What it is: the standard final check before launch, run locally or against
   staging/production.
2. Why it exists: to make the final check easier, faster and coherent; the
   problem types it catches (layout on devices, broken pages and resources,
   forms and interactions, image weight).
3. What it checks: table of check, what it verifies, problem it catches.
4. Getting started: adding the suite to a project (`init`), installing on a
   new machine (`npm install`, `npm run install-browsers`), configuration
   through Claude with a ready prompt ("Configure the test suite for this
   project. Follow test-suite/AGENTS.md."), what to review in the result.
5. Running: commands, `TEST_ENV`, `.env.tests`, updating the suite version.
6. Reading the report: each section, how to triage a failure (config or site),
   honesty rules.
7. Config at a glance: the example and the key table; discovery details live
   in AGENTS.md.
8. What it does not check: real iOS Safari, email delivery, launch-day items.

### AGENTS.md (Claude)

1. Task and limits: write `test-suite/tests.config.mjs`; never edit anything
   in `node_modules/@meom/test-suite` or the copied docs; when the config
   cannot express a need, stop and tell the developer that the template needs a
   new key.
2. Background and decisions: part 1 of the current `PLAN.md` (scope, matrix,
   tooling, why no cross-browser pixel diff, honesty rules), corrected for the
   suite living outside the project.
3. Configuration key by key, each with where the value comes from and what to
   set when the site lacks it:
   - `environments`: local from `config.yml`; ask the developer for staging
     and production URLs and the login type, never guess.
   - `pages`: from the REST API, with a fixed selection rule: one page per
     template type (front page, a basic page, each archive, one single of each
     public post type, the contact page) plus the pages features use.
   - `features`: discovery steps per feature (curl, `playwright codegen`, DOM
     inspection).
   - `exceptions`: only after the first run, from a triaged failure, always
     with a reason.
4. Verification: `check-config` passes; after the first `launch-check`, sort
   failures into config errors and site errors.
5. Reporting to the developer: summarize from `launch-report.md` without
   omitting or softening failures. An INCOMPLETE run is reported as
   incomplete, never as passed, with the skipped browsers and the fix:
   the developer runs the launch check in their own terminal app, or installs
   the browsers when the executable is missing. On 2026-10-02 the cause was
   the macOS 27 Firefox bug in section 4, which also failed in the developer's
   terminal, not the agent's sandbox. The agent never disables a sandbox on
   its own and does not retry a browser that cannot start.

## 7. Verification of the template

1. **Unit tests** (`node --test`): missing feature key, unknown feature key,
   exception without reason, slug `404` in pages, unknown `TEST_ENV`, missing
   credentials, environment-scoped exception filtering, `config.yml` baseURL
   default, report section order.
2. **Test bed** (`test-suite.local`, a local kala-stack site):
   - Seed the empty WordPress with a committed script (`testbed/seed.sh <site-dir>`), so
     the test bed can be rebuilt identically: one page per template type, a
     nav menu with a top-level link, a Gravity Forms form, an accordion.
   - The test bed exists only to verify the template. Real projects are
     checked against their existing content; the suite never creates or
     changes content on them.
   - Claude writes `tests.config.mjs` by following AGENTS.md only;
     `launch-check` is green.
   - Negative check: add temporary faults one at a time (an overflowing
     element, a broken image, a JS error, Gravity Forms deactivated, so check-config fails on the form target)
     and confirm each shows up in the report; then remove them.
   - Login: activate `wp-force-login`, set `auth: 'wp-login'` for a test
     environment pointing at the local URL, confirm the run passes and the admin
     bar is hidden in screenshots.
3. **Packaging** (section 8): the test bed's `test-suite/` folder is created
   with `init`. During development it links the package repo (`file:`).
   Before a release it installs the `npm pack` tarball, which proves the
   `files` list is complete, and after the release the GitHub tag; each must
   give a green `launch-check`, and the report header names the version.
4. **Olmar parity:** add the suite to olmar with `init`, configure it with
   AGENTS.md and run against `olmar.local`. Pass/fail per check and project
   must match the old olmar suite.

`auth: 'basic'` is covered by unit tests only (config to `httpCredentials`); it
is exercised for real on the first project that uses it.

## 8. Distribution

### The package repo

https://github.com/MEOM/test-suite is public and holds only the package, with
history starting fresh. npm cannot install a subfolder of a git repo, so
`package.json` is at the repo root:

```
MEOM/test-suite
  package.json           @meom/test-suite: bin, files, dependencies, engines
  package-lock.json      for developing the package; ignored by installs
  bin/test-suite.js      the CLI
  lib/ specs/            the suite
  playwright.config.js, launch-check.js, check-config.js, image-audit.js,
  build-gallery.js
  README.md AGENTS.md
  examples/              example-site.tests.config.mjs
  testbed/               seed.sh, PHP helpers, content, tests.config.mjs   (not shipped)
  docs/                  design and plans                                  (not shipped)
```

`files` in `package.json` decides what a project receives: `bin/`, `lib/`
(without `*.test.js`), `specs/`, `examples/`, the five root scripts, README and
AGENTS. npm packs git dependencies too, so `files` applies to git installs.
`@playwright/test` (pinned to an exact version) and `yaml` are
`dependencies`, so they install into the project. The package has no
`devDependencies` and no `prepare` script, so a git install needs no build
step. `engines.node` is `>=20.12` (`util.parseEnv`).

The kala-stack WordPress instance used as the test bed is not in the repo. It
is a local kala-stack site seeded with `testbed/seed.sh <site-dir>`.

### Versions

A release is a commit with the new `package.json` version and a tag
`v<version>` on it. Projects depend on a tag:

```json
"@meom/test-suite": "git+https://github.com/MEOM/test-suite.git#v0.1.0"
```

`package-lock.json` records the resolved commit, so everyone on the project
runs the same code. Updating is `npm install git+https://github.com/MEOM/test-suite.git#v0.2.0`
in `test-suite/`, committed together with the docs it refreshes.

The report header shows `<version> (<short commit>)`. The commit comes from
the project's `package-lock.json` entry for the package when its `resolved`
URL ends in `#<sha>`, otherwise from `git rev-parse` when the package
directory is itself a git checkout (the linked package repo), otherwise it is
left out.

### The project folder and CI

The suite gets its own `package.json` in `<project>/test-suite/`. The root
`package.json` does not mention it, and `test-suite` must not be added to the
root `workspaces`. Bitbucket Pipelines runs `npm ci` in the project root, so
it never installs the suite or Playwright, and nothing in the pipeline
changes. Seravo deploys the repo, but `test-suite/` is outside `htdocs`, so it
is never served.

`test-suite/package.json`, as written by `init`:

```json
{
  "name": "<project>-test-suite",
  "private": true,
  "scripts": {
    "postinstall": "test-suite sync-docs",
    "launch-check": "test-suite run",
    "check-config": "test-suite config",
    "test": "test-suite test",
    "test:visual": "test-suite visual",
    "audit:images": "test-suite audit",
    "report": "test-suite report",
    "install-browsers": "test-suite install-browsers"
  },
  "devDependencies": {
    "@meom/test-suite": "git+https://github.com/MEOM/test-suite.git#v0.1.0"
  }
}
```

### CLI

`bin/test-suite.js` dispatches subcommands. Every subcommand that needs the
config resolves its path first, fails with a message naming the
`test-suite/` folder when there is none, and runs its child processes with
that folder as the working directory and the absolute `SUITE_CONFIG` in the
environment. Playwright runs as `node <@playwright/test/cli.js> test --config
<package>/playwright.config.js ...`, resolved from the package, without a
shell, so there is exactly one Playwright instance and grep patterns need no
quoting.

| Subcommand | Runs |
|---|---|
| `run` | `launch-check.js` |
| `config` | `check-config.js` |
| `test [args]` | Playwright, `--grep-invert "@config\|@visual\|@audit"` plus args |
| `visual [args]` | Playwright `--grep @visual` plus args, then `build-gallery.js` |
| `audit [args]` | `image-audit.js` with args |
| `report` | `playwright show-report report/<env>/runs/main/playwright-report` |
| `trace <path>` | `playwright show-trace <path>` |
| `install-browsers` | `playwright install` |
| `codegen [url]` | `playwright codegen`, used by AGENTS.md to inspect elements |
| `init [--source <spec>] [--no-install]` | creates `test-suite/` (below) |
| `sync-docs` | copies README.md and AGENTS.md into the current folder |

### init

Run from the project root, once per project:

```bash
npx --yes git+https://github.com/MEOM/test-suite.git#v0.1.0 init
```

It refuses when `test-suite/` already exists and changes nothing. Otherwise
it writes `test-suite/package.json` (the dependency defaults to the running
version's tag; `--source` overrides it, which the test bed uses for `file:`
and tarball installs) and `test-suite/.gitignore`, then runs `npm install`
there unless `--no-install` is given. It warns, without failing, when the
current folder has no `config.yml` (probably not the project root) or the
root `package.json` lists `test-suite` in `workspaces`. It does not write
`tests.config.mjs`; Claude writes that from AGENTS.md, and `check-config`
says so when the file is missing.

### sync-docs

`postinstall` runs `test-suite sync-docs` in `test-suite/` after every
`npm install`. It copies the package's README.md and AGENTS.md there, each
starting with an HTML comment that names the version and says edits belong
in the package repo. The copies are committed, so a version bump shows its
doc changes in the same commit. Local edits to them are overwritten on the
next install by design.

## Risks

- **Content-dependent checks:** a feature check targets live content (a menu
  item, a form). When editors change that content, the check fails.
  `check-config` makes this visible as a config problem before the matrix runs.
- **Third-party scripts on staging/production** (consent banners, chat) can add
  console errors and appear in screenshots. They are handled per project
  through `blockHosts` or `consoleErrors`, each with a reason.
- **Form filling by type** may not suit every Gravity Form (conditional logic,
  custom validation). The form check fails loudly in that case, and the fix is
  a new config option, not a spec edit.
- **GitHub as the only source:** installs depend on github.com and on the tag
  existing. A deleted or moved tag breaks fresh installs; tags are never moved
  after release.
- **Shared browser cache:** projects on different suite versions need
  different Playwright browser builds. `install-browsers` installs the build
  for the project's version next to the others in the shared cache.
