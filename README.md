# Launch check

The standard final check before a kala-stack site launches. It runs the same
automated checks on every project, in six browser and device combinations,
against the environment you choose: your local site, staging or production.
The result is one launch report.

The suite is the npm package `@meom/test-suite` from
https://github.com/MEOM/test-suite. A project installs it in its own
`test-suite/` folder, which holds everything you work with: the config, this
README, the instructions for Claude and the results.

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

### Add the suite to a project

Once per project, from the project root:

```bash
npx --yes git+https://github.com/MEOM/test-suite.git#v0.1.0 init
```

This creates `test-suite/` and installs the suite there:

```
test-suite/
  package.json        the suite version and the npm scripts
  package-lock.json   the exact suite commit, the same for everyone
  tests.config.mjs    the project's config (Claude writes it, next step)
  README.md           this file
  AGENTS.md           instructions for Claude
  .gitignore          node_modules/, report/, .auth/, .env.tests
  report/             results, gitignored
```

The folder has its own `package.json` on purpose. The root `npm ci` in
Bitbucket Pipelines never installs the suite or its browsers. Do not add
`test-suite` to the root `workspaces`.

README.md and AGENTS.md are copied from the package on every `npm install`.
Edit them in the package repo, not here.

### Configure the project

The suite reads everything site-specific from `test-suite/tests.config.mjs`.
Claude writes it. Ask:

> Configure the test suite for this project. Follow test-suite/AGENTS.md.

Claude reads the site, writes the config and runs `npm run check-config` to
confirm the config matches the site. Review the config before committing it:

- Are the pages the ones that matter? There should be one per template type.
- Is every feature decided correctly (tested, or `false` when the site does not
  have it)?
- Does every exception have a reason you agree with?

Commit the whole `test-suite/` folder; `.gitignore` keeps the results and
credentials out.

### On a new machine

```bash
cd test-suite
npm install
npm run install-browsers   # Chromium, Firefox and WebKit, about 400 MB, once per suite version
```

### Run the launch check

```bash
cd test-suite
npm run launch-check
```

The report is written to `test-suite/report/local/launch-report.md`.

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
the credentials in `test-suite/.env.tests`. The file is gitignored.

```
TEST_AUTH_USER=launchcheck
TEST_AUTH_PASSWORD=...
```

Use a Subscriber account. With `wp-login` the WordPress toolbar is hidden in
every check, so screenshots and layout checks match an anonymous visitor.

## Commands

Run from `test-suite/`. All of them respect `TEST_ENV`.

| Command | What it does |
|---|---|
| `npm run launch-check` | The standard launch check: config check, all checks on all devices, gallery, image audit, report. |
| `npm run check-config` | Confirms the config matches the site, in one browser. Takes about a minute. |
| `npm test` | Functional checks only, for iterating on a fix. |
| `npm run test:visual` | Screenshots and gallery only. |
| `npm run audit:images` | Image audit only. |
| `npm run report` | Opens the Playwright HTML report of the last main run. |
| `npm run install-browsers` | Installs the browsers for the suite's Playwright version. |
| `npx test-suite trace <path>` | Opens a trace from the launch report. |
| `npx test-suite codegen <url>` | Opens Playwright's element inspector against the site. |

Narrow a run while fixing something. Arguments after `--` go to Playwright:

```bash
npm test -- --project=chrome-phone --grep "overflow"
npm test -- --debug --grep "accordion"
```

Do not run `npx playwright` here. Playwright belongs to the suite package, so
`npx playwright` would fetch some other version without the suite's config.

### Updating the suite

```bash
cd test-suite
npm install git+https://github.com/MEOM/test-suite.git#v0.2.0
npm run install-browsers
```

Commit `package.json`, `package-lock.json` and the refreshed README.md and
AGENTS.md together. The report header names the suite version and commit.

## Reading the report

`test-suite/report/<env>/launch-report.md` has the same sections on every project:

1. **Header:** site, environment, time, suite version, who ran it.
2. **Result:** the verdict and a table of checks by device. INCOMPLETE means a browser could not start on this machine; the report lists it with the options.
3. **Failures:** each failure with its message and the path to its Playwright
   trace (`npx test-suite trace <path>`).
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
4. INCOMPLETE: a browser could not start, so its device column did not run.
   The report names the reason. Run `npm run launch-check` in your own
   terminal app (Terminal or iTerm). If the reason says the browser
   executable does not exist, run `npm run install-browsers` first. If the
   browser fails in your terminal too, see "Browsers that cannot start".

**WebKit cannot reach the local site.** If every `safari-*` test fails with
"A server with the specified hostname could not be found" while Chromium and
Firefox pass, macOS is blocking Playwright's WebKit from the local network.
Allow it in System Settings → Privacy & Security → Local Network, or run the
Safari projects against staging or production, which need no permission.

**Browsers that cannot start.** Before the main run the launch check starts
each browser once. A browser that does not start is skipped and the report
says INCOMPLETE with the reason. On macOS 27, Playwright's bundled Firefox
hangs at launch when a real Firefox is installed, because it shares the
real Firefox's protected app data folder. The suite works around this by
giving Firefox a home folder of its own (`CFFIXED_USER_HOME`); the log line
`sandbox_extension_issue_file_to_process ... Operation not permitted` is
harmless. The workaround goes away when Playwright ships its fix
([microsoft/playwright#42768](https://github.com/microsoft/playwright/issues/42768)).

### Honesty rules

1. A failure is a failure. Never weaken a check to make it pass.
2. Every exception needs a reason in the config. The report lists them all.
3. The visual review is done by a person. There is no pass button.

## Config at a glance

```js
// test-suite/tests.config.mjs
export default {
  name: 'Example site',
  environments: {
    local: {},                                   // URL from config.yml in the project root
    staging: { baseURL: 'https://staging.example.com', auth: 'basic' },
  },
  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
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
      { pattern: /hero-video\.mp4$/, env: ['local'],
        reason: 'The hero video is not synced to local; staging and production serve it.' },
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

A complete example: `node_modules/@meom/test-suite/examples/example-site.tests.config.mjs`.
How each value is found: `AGENTS.md`.

## What it does not check

- **Real iOS Safari.** WebKit is the same engine, not the same browser.
- **Email delivery.** The form check stops the submission in the browser.
- **Launch-day items:** search engine visibility, redirects from old URLs,
  analytics, cookie consent. A launch-day checklist will be added to the report
  later.
