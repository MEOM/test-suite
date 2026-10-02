# Test Suite Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the launch check suite as the npm package `@meom/test-suite` from the public repo https://github.com/MEOM/test-suite (fresh history), installed in each project's `test-suite/` folder, where the config, the docs and the results live.

**Architecture:** The current `tests/` folder becomes the package root of a new local clone of MEOM/test-suite. The suite stops writing next to its own code: the folder that holds `tests.config.mjs` (the suite folder) gets `report/`, `.auth/` and `.env.tests`, and its parent is the project root that holds `config.yml`. A CLI (`bin/test-suite.js`) replaces the npm scripts and runs Playwright from the package without a shell. `init` creates a project's `test-suite/` folder, and `sync-docs` (run by `postinstall`) copies README.md and AGENTS.md into it.

**Tech Stack:** Node.js >= 20.12 (ESM, `node:test`, `util.parseEnv`), `@playwright/test` 1.60.0, `yaml` ^2.5.0, npm 10 git dependencies. Test bed: the kala-stack site in `/Users/aleksi/work/test-suite` (Seravo Docker container, WP-CLI through `docker compose exec`).

**Spec:** `docs/superpowers/specs/2026-09-29-generic-launch-check-design.md`, section 8 (distribution) plus the path changes in sections 1 to 7. From Task 1 on, read the spec and this plan from the package repo copy.

## Global Constraints

- Two local repos. **PKG** = `/Users/aleksi/work/test-suite-package`, a clone of https://github.com/MEOM/test-suite that holds only the package. **SITE** = `/Users/aleksi/work/test-suite`, the kala-stack test bed site (its own git repo, branch `feature/generic-launch-check`, no remote). Package work is committed in PKG, test bed work in SITE.
- PKG history starts fresh with Task 1. Default branch `main`. Nothing is pushed or tagged before Task 9, and Task 9 pushes only after the developer confirms.
- Package name `@meom/test-suite`, CLI name `test-suite`, first version `0.1.0`, tag `v0.1.0`. Project dependency spec: `git+https://github.com/MEOM/test-suite.git#v<version>`.
- The suite folder is the directory containing `tests.config.mjs`. `report/<env>/`, `.auth/<env>.json` and `.env.tests` live there. The project root is its parent; `config.yml` is read from the project root. The suite never writes into its own package directory.
- Config path: `SUITE_CONFIG` if set, else `tests.config.mjs` in the current directory.
- Playwright always runs as `node <resolved @playwright/test/cli.js> test --config <SUITE_DIR>/playwright.config.js ...`, spawned without a shell, with `SUITE_CONFIG` set to the absolute config path. Nothing runs `npx playwright`.
- The project's `test-suite/package.json` is separate from the project root's. `test-suite` must never be added to the root `workspaces`; Bitbucket Pipelines runs `npm ci` only in the root.
- `@playwright/test` (exact `1.60.0`) and `yaml` are `dependencies` of the package. The package has no `devDependencies` and no `prepare` script.
- Unchanged from the existing suite: feature keys, selector defaults, exception shape, the 404 page, tags `@config` / `@visual` / `@audit`, `workers: 1`, `retries: 1`, timeouts, report section order.
- ESM, `.js` import extensions, 2-space indentation, comment density like the surrounding code.
- Docs and comments follow the user's writing rules: no long dashes (use commas or split sentences), no filler phrases, no decorative "not X but Y".
- Honesty rules: never weaken an assertion to make a check pass; every exception needs a reason.
- WP-CLI on the test bed: `docker compose exec -T --user vagrant wordpress wp ...` from SITE.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A command run outside the suite folder** (from the project root, or before the config exists). The developer expects one message naming the `test-suite/` folder and the Claude prompt, not a stack trace. Pinned by `lib/bin.test.js` (Task 5).
2. **`init` run on a project that already has `test-suite/`.** Expected: refuse and change nothing. Pinned by `lib/project.test.js` (Task 6).
3. **The package installed inside a project that is itself a git repo.** `git rev-parse` from the package directory would return the project's commit; the report must not print it as the suite version. Pinned by `lib/version.test.js` (Task 4).
4. **A file missing from the published package** (the `files` list forgets a script). The dev loop works from the repo, so only an install would show it. Pinned by `lib/package.test.js` (Task 5) and the tarball install (Task 8).
5. **`sync-docs` run in the package repo itself** (someone runs `npm run postinstall` habits there). It would prepend the copy header to the package's own README. Expected: refuse. Pinned by `lib/project.test.js` (Task 6).

---

### Task 1: Import the suite into the package repo with fresh history

**Files:**
- Create (PKG, by copy): everything in SITE `tests/` except `node_modules/`, `report/`, `.auth/`, `.gitignore`; SITE `docs/`, `testbed/`, `examples/`
- Create: `PKG/.gitignore`, `PKG/testbed/tests.config.mjs`

**Interfaces:**
- Produces: the PKG repo with the suite at its root (`lib/`, `specs/`, `playwright.config.js`, the four root scripts, `package.json`, README.md, AGENTS.md), `testbed/`, `docs/`, `examples/`. Later tasks use `PKG/testbed/` as the dev-loop suite folder.

- [ ] **Step 1: Clone the empty repo**

```bash
git clone https://github.com/MEOM/test-suite.git /Users/aleksi/work/test-suite-package
cd /Users/aleksi/work/test-suite-package
git symbolic-ref HEAD refs/heads/main
git status
```

Expected: "No commits yet" on branch `main`. If the clone is not empty, stop and ask the developer.

- [ ] **Step 2: Copy the files**

```bash
cd /Users/aleksi/work/test-suite-package
SITE=/Users/aleksi/work/test-suite
rsync -a --exclude node_modules --exclude report --exclude .auth --exclude .gitignore "$SITE/tests/" ./
rsync -a "$SITE/docs/" docs/
rsync -a "$SITE/testbed/" testbed/
rsync -a "$SITE/examples/" examples/
ls
```

Expected: `AGENTS.md README.md build-gallery.js check-config.js docs examples image-audit.js launch-check.js lib package-lock.json package.json playwright.config.js specs testbed`.

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
report/
.auth/
.env.tests
*.tgz
```

- [ ] **Step 4: Write `testbed/tests.config.mjs`**

The test bed config moves into the package repo. `testbed/` is the dev-loop suite folder, and its parent (PKG) has no `config.yml`, so the local URL is explicit.

```js
// The test bed (test-suite.local) config, written by following AGENTS.md.
// testbed/ is the suite folder for the dev loop (see testbed/README.md), so
// the local URL is set here instead of read from config.yml.
export default {
  name: 'Test Suite',

  environments: {
    local: { baseURL: 'https://test-suite.local' },
    // The local site behind wp-force-login. Activate the plugin before using
    // it; credentials come from testbed/.env.tests.
    login: { baseURL: 'https://test-suite.local', auth: 'wp-login' },
  },

  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'about', path: '/about/', label: 'About' },
    { slug: 'news', path: '/news/', label: 'News archive' },
    { slug: 'article', path: '/second-news-post/', label: 'Single post' },
    { slug: 'contact', path: '/contact/', label: 'Contact' },
  ],

  features: {
    navigation: { desktopLink: 'About' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact/' },
    form: { path: '/contact/', gravityFormId: 1 },
  },

  exceptions: {},
};
```

- [ ] **Step 5: Install and run the unit tests**

```bash
cd /Users/aleksi/work/test-suite-package
npm install
npm run test:unit 2>&1 | grep -E "^# (tests|pass|fail)"
```

Expected: `# tests 44`, `# pass 44`, `# fail 0`.

- [ ] **Step 6: First commit**

```bash
git add -A
git status --short | grep -E "node_modules|report/|\.auth" && echo "STOP: ignored files staged"
git commit -m "Import the launch check suite from the kala-stack test bed

History starts here. The suite was developed in tests/ of a kala-stack
test bed; its design and plans are in docs/superpowers.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The suite folder holds config, credentials and output

**Files:**
- Modify: `lib/config.js` (`resolveConfigPath`, `loadConfig`)
- Modify: `lib/environment.js` (`readCredentials`, output path helpers, new `suiteFolder`)
- Test: `lib/config.test.js`, `lib/environment.test.js`

**Interfaces:**
- Consumes: `normalizeConfig(raw, { projectRoot })` (unchanged signature).
- Produces:
  - `resolveConfigPath(env = process.env, cwd = process.cwd()): string`
  - `loadConfig(env)` returns the normalized config plus `dir` (suite folder) and `file`; `config.projectRoot` is the parent of `dir`.
  - `suiteFolder(env = process.env): string`, the directory of `resolveConfigPath(env)`.
  - `reportDir(envName, dir = suiteFolder())`, `runDir(envName, label, dir = suiteFolder())`, `authStatePath(envName, dir = suiteFolder())`. Existing call sites (`playwright.config.js`, specs, scripts) keep their one- and two-argument calls.
  - `readCredentials(config, environment, env)` reads `<config.dir>/.env.tests`.

- [ ] **Step 1: Write the failing config tests**

In `lib/config.test.js`, remove `SUITE_DIR` from the import list and replace the `resolveConfigPath` test with:

```js
test('resolveConfigPath honours SUITE_CONFIG and defaults to the current directory', () => {
  assert.equal(resolveConfigPath({ SUITE_CONFIG: '/x/y.mjs' }), '/x/y.mjs');
  assert.equal(resolveConfigPath({}, '/proj/test-suite'), '/proj/test-suite/tests.config.mjs');
});
```

Append:

```js
test('loadConfig: the suite folder holds the config and config.yml is read from its parent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-folder-'));
  const dir = path.join(root, 'test-suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'config.yml'), 'development:\n  domains:\n    - parent.local\n');
  const raw = valid();
  raw.environments = { local: {} };
  const file = path.join(dir, 'tests.config.mjs');
  fs.writeFileSync(file, `export default ${JSON.stringify(raw)};\n`);
  const c = await loadConfig({ SUITE_CONFIG: file });
  assert.equal(c.dir, dir);
  assert.equal(c.projectRoot, root);
  assert.equal(c.environments.local.baseURL, 'https://parent.local');
});

test('a missing config names the test-suite folder and the Claude prompt', async () => {
  await assert.rejects(
    loadConfig({ SUITE_CONFIG: path.join(os.tmpdir(), 'lc-none', 'tests.config.mjs') }),
    err => err instanceof ConfigError && err.message.includes('test-suite/') && err.message.includes('AGENTS.md')
  );
});
```

- [ ] **Step 2: Write the failing environment tests**

In `lib/environment.test.js`, change the import from `./config.js` to `import { ConfigError } from './config.js';`, add `suiteFolder` to the `./environment.js` import list, and replace the `config()` helper:

```js
function config(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-env-'))) {
  return {
    name: 'Site',
    dir,
    projectRoot: path.dirname(dir),
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
```

In the test `readCredentials reads .env.tests and lets the shell win`, change `path.join(c.projectRoot, '.env.tests')` to `path.join(c.dir, '.env.tests')`. Replace the test `output paths live under the suite directory` with:

```js
test('output paths live in the suite folder, the folder that holds the config', () => {
  const env = { SUITE_CONFIG: '/proj/test-suite/tests.config.mjs' };
  assert.equal(suiteFolder(env), '/proj/test-suite');
  assert.equal(reportDir('local', '/proj/test-suite'), '/proj/test-suite/report/local');
  assert.equal(runDir('local', 'main', '/proj/test-suite'), '/proj/test-suite/report/local/runs/main');
  assert.equal(authStatePath('production', '/proj/test-suite'), '/proj/test-suite/.auth/production.json');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: FAIL on the resolveConfigPath, loadConfig folder, missing config, readCredentials and output path tests (`suiteFolder` is not exported).

- [ ] **Step 4: Implement in `lib/config.js`**

Replace `resolveConfigPath` and `loadConfig`:

```js
export function resolveConfigPath(env = process.env, cwd = process.cwd()) {
  return env.SUITE_CONFIG ? path.resolve(env.SUITE_CONFIG) : path.resolve(cwd, 'tests.config.mjs');
}
```

```js
// The suite folder (dir) holds the config; the project root, where config.yml
// lives, is its parent.
export async function loadConfig(env = process.env) {
  const file = resolveConfigPath(env);
  if (!fs.existsSync(file)) {
    throw new ConfigError([
      `no config file at ${file}. Run from the project's test-suite/ folder. If the config does not exist yet, ` +
        'ask Claude: "Configure the test suite for this project. Follow test-suite/AGENTS.md."',
    ]);
  }
  const mod = await import(pathToFileURL(file).href);
  const dir = path.dirname(file);
  return { ...normalizeConfig(mod.default, { projectRoot: path.dirname(dir) }), dir, file };
}
```

- [ ] **Step 5: Implement in `lib/environment.js`**

Change the import to `import { ConfigError, resolveConfigPath } from './config.js';`. In `readCredentials`, change the file line to:

```js
  const file = path.join(config.dir, '.env.tests');
```

Replace the three path helpers at the end of the file with:

```js
// The suite folder is the directory that holds tests.config.mjs. Every run
// writes there, never into the package directory.
export const suiteFolder = (env = process.env) => path.dirname(resolveConfigPath(env));
export const reportDir = (envName, dir = suiteFolder()) => path.join(dir, 'report', envName);
export const runDir = (envName, label, dir = suiteFolder()) => path.join(reportDir(envName, dir), 'runs', label);
export const authStatePath = (envName, dir = suiteFolder()) => path.join(dir, '.auth', `${envName}.json`);
```

Update the header comment's last line to: `// apply there, login credentials and where the run writes its output (the suite folder).`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"`
Expected: `# tests 46`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add lib/config.js lib/environment.js lib/config.test.js lib/environment.test.js
git commit -m "Keep config, credentials and output in the suite folder

The folder holding tests.config.mjs gets report/, .auth/ and .env.tests;
config.yml is read from its parent, the project root.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Run Playwright from the package without a shell

**Files:**
- Modify: `lib/cli.js`
- Modify: `check-config.js`, `launch-check.js`, `image-audit.js`
- Test: `lib/cli.test.js` (create)

**Interfaces:**
- Consumes: `resolveConfigPath()` (Task 2), `SUITE_DIR` from `lib/config.js`.
- Produces (all in `lib/cli.js`):
  - `PLAYWRIGHT_CLI: string`, the absolute path of `@playwright/test/cli.js` resolved from the package.
  - `PLAYWRIGHT_CONFIG: string`, `<SUITE_DIR>/playwright.config.js`.
  - `playwrightTestArgs(args: string[]): string[]`, `[PLAYWRIGHT_CLI, 'test', '--config', PLAYWRIGHT_CONFIG, ...args]`.
  - `runNode(args: string[], env = {}, label = args.join(' ')): number`, spawns `process.execPath` in the current directory with `SUITE_CONFIG` set to `resolveConfigPath()`, inherited output, returns the exit code.
  - `runPlaywrightTest(args, env = {}): number`, `runPlaywright(args): number`, `runScript(name, args = [], env = {}): number` (runs `<SUITE_DIR>/<name>`).
  - `loadSuiteOrExit()` unchanged. `run()` is removed.

- [ ] **Step 1: Write the failing test**

Create `lib/cli.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SUITE_DIR } from './config.js';
import { PLAYWRIGHT_CLI, playwrightTestArgs } from './cli.js';

test('Playwright runs from the package with the package config', () => {
  assert.ok(fs.existsSync(PLAYWRIGHT_CLI), `${PLAYWRIGHT_CLI} does not exist`);
  const args = playwrightTestArgs(['--grep-invert', '@config|@visual|@audit', '--grep', 'page loads']);
  assert.equal(args[0], PLAYWRIGHT_CLI);
  assert.deepEqual(args.slice(1, 4), ['test', '--config', path.join(SUITE_DIR, 'playwright.config.js')]);
  // Each argument stays one argument: no shell splits the pattern or the space.
  assert.deepEqual(args.slice(4), ['--grep-invert', '@config|@visual|@audit', '--grep', 'page loads']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test lib/cli.test.js`
Expected: FAIL, `PLAYWRIGHT_CLI` / `playwrightTestArgs` not exported.

- [ ] **Step 3: Rewrite `lib/cli.js`**

```js
// Shared helpers for the Node scripts and the CLI (bin/test-suite.js).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { SUITE_DIR, resolveConfigPath } from './config.js';

const require = createRequire(import.meta.url);

// Playwright is resolved from the package, never from the project, so every
// run uses the one @playwright/test instance the specs import.
export const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');
export const PLAYWRIGHT_CONFIG = path.join(SUITE_DIR, 'playwright.config.js');

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

// Runs node in the current directory (the suite folder) with inherited output
// and returns its exit code. No shell, so grep patterns need no quoting. The
// absolute config path goes to the child, so it finds the same config
// whatever its working directory.
export function runNode(args, env = {}, label = args.join(' ')) {
  console.log(`\n$ ${label}`);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, SUITE_CONFIG: resolveConfigPath(), ...env },
  });
  return result.status ?? 1;
}

export const playwrightTestArgs = args => [PLAYWRIGHT_CLI, 'test', '--config', PLAYWRIGHT_CONFIG, ...args];

export const runPlaywrightTest = (args, env = {}) =>
  runNode(playwrightTestArgs(args), env, `playwright test ${args.join(' ')}`);

export const runPlaywright = args => runNode([PLAYWRIGHT_CLI, ...args], {}, `playwright ${args.join(' ')}`);

export const runScript = (name, args = [], env = {}) =>
  runNode([path.join(SUITE_DIR, name), ...args], env, [name, ...args].join(' '));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/cli.test.js`
Expected: PASS.

- [ ] **Step 5: Switch the scripts to the new runners**

`check-config.js`: change the import to `import { loadSuiteOrExit, runPlaywrightTest } from './lib/cli.js';` and the run line to:

```js
const status = runPlaywrightTest(['--grep', '@config', '--project=chrome-desktop', '--retries=0'], { RUN_LABEL: 'config' });
```

`launch-check.js`: change the import to `import { loadSuiteOrExit, runPlaywrightTest, runScript } from './lib/cli.js';` and the four runs to:

```js
if (runScript('check-config.js') !== 0) {
```

```js
const mainStatus = runPlaywrightTest(['--grep-invert', '@config|@audit'], { RUN_LABEL: 'main' });
runScript('build-gallery.js');
const auditStatus = runScript('image-audit.js');
```

In `tryExec`, change `cwd: SUITE_DIR` to `cwd: process.cwd()` (Task 4 replaces the version lines; `git config user.name` must run in the project).

`image-audit.js`: change the import to `import { loadSuiteOrExit, runPlaywrightTest } from './lib/cli.js';`, change the header comment example to `//   npm run audit:images -- --project=chrome-desktop`, and replace the passthrough, project flag and run lines with:

```js
const passthrough = process.argv.slice(2);
const projectFlags = passthrough.some(a => a.startsWith('--project'))
  ? []
  : CHROMIUM_PROJECTS.map(p => `--project=${p}`);
```

```js
const exitCode = runPlaywrightTest(['--grep', '@audit', ...projectFlags, ...passthrough], { RUN_LABEL: 'audit' });
```

Then confirm nothing calls the removed `run`: `grep -n "run(" *.js lib/*.js | grep -v "runNode\|runScript\|runPlaywright\|\.run("` prints nothing.

- [ ] **Step 6: Verify against the test bed from the dev-loop folder**

The test bed site must be up (`curl -sk -o /dev/null -w "%{http_code}\n" https://test-suite.local/` prints `200`).

```bash
cd /Users/aleksi/work/test-suite-package/testbed
node ../check-config.js
ls report/local/runs/config/results.json
```

Expected: `Config check passed.`, 11 passed (6 page tests including the 404 page, 5 feature tests). Output exists under `testbed/report/local/`, nothing under PKG `report/`: `ls ../report` fails.

- [ ] **Step 7: Run the unit tests and commit**

Run: `npm run test:unit 2>&1 | grep -E "^# (tests|fail)"` from PKG. Expected: `# tests 47`, `# fail 0`.

```bash
cd /Users/aleksi/work/test-suite-package
git add lib/cli.js lib/cli.test.js check-config.js launch-check.js image-audit.js
git commit -m "Run Playwright from the package without a shell

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Suite version and commit in the report header

**Files:**
- Create: `lib/version.js`
- Modify: `launch-check.js`
- Test: `lib/version.test.js` (create)

**Interfaces:**
- Consumes: `suiteFolder()` (Task 2), `SUITE_DIR`.
- Produces: `suiteVersion({ suiteDir: string, folder: string }): string`, `"<version> (<7-char commit>)"` or `"<version>"`. `PACKAGE_NAME = '@meom/test-suite'`.

- [ ] **Step 1: Write the failing tests**

Create `lib/version.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suiteVersion } from './version.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function suiteDirIn(parent) {
  const dir = path.join(parent, 'suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@meom/test-suite', version: '9.9.9' }));
  return dir;
}

function lockfile(folder, resolved) {
  fs.writeFileSync(
    path.join(folder, 'package-lock.json'),
    JSON.stringify({ packages: { 'node_modules/@meom/test-suite': { resolved } } })
  );
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe' })
    .toString()
    .trim();

test('a git install shows the commit from the project lockfile', () => {
  const folder = tmp('lc-ver-');
  lockfile(folder, `git+https://github.com/MEOM/test-suite.git#${SHA}`);
  assert.equal(suiteVersion({ suiteDir: suiteDirIn(tmp('lc-pkg-')), folder }), '9.9.9 (0123456)');
});

test('no lockfile and no checkout shows the version only', () => {
  assert.equal(suiteVersion({ suiteDir: suiteDirIn(tmp('lc-pkg-')), folder: tmp('lc-ver-') }), '9.9.9');
});

test('a linked package repo shows its own checkout commit', () => {
  const folder = tmp('lc-ver-');
  lockfile(folder, '../suite');
  const suiteDir = suiteDirIn(tmp('lc-pkg-'));
  git(suiteDir, 'init', '-q');
  git(suiteDir, 'commit', '-q', '--allow-empty', '-m', 'x');
  const head = git(suiteDir, 'rev-parse', 'HEAD');
  assert.equal(suiteVersion({ suiteDir, folder }), `9.9.9 (${head.slice(0, 7)})`);
});

test('a package inside the project git repo never shows the project commit', () => {
  const project = tmp('lc-proj-');
  git(project, 'init', '-q');
  git(project, 'commit', '-q', '--allow-empty', '-m', 'x');
  const suiteDir = suiteDirIn(project);
  assert.equal(suiteVersion({ suiteDir, folder: project }), '9.9.9');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test lib/version.test.js`
Expected: FAIL, cannot find module `./version.js`.

- [ ] **Step 3: Implement `lib/version.js`**

```js
// The suite version for the launch report header: the package version plus
// the commit actually installed, when it can be known.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PACKAGE_NAME = '@meom/test-suite';

// A git install records the commit in the project's lockfile:
// "resolved": "git+https://github.com/MEOM/test-suite.git#<sha>".
function lockfileCommit(folder) {
  const file = path.join(folder, 'package-lock.json');
  if (!fs.existsSync(file)) return null;
  try {
    const resolved = JSON.parse(fs.readFileSync(file, 'utf8')).packages?.[`node_modules/${PACKAGE_NAME}`]?.resolved;
    return resolved?.match(/#([0-9a-f]{7,40})$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

// A linked package repo (file: install) is its own git checkout. A package
// inside a project's node_modules is not, and git would answer with the
// project's commit, so the checkout must start at the package directory.
function checkoutCommit(suiteDir) {
  try {
    const opts = { cwd: suiteDir, stdio: ['ignore', 'pipe', 'ignore'] };
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], opts).toString().trim();
    if (fs.realpathSync(top) !== fs.realpathSync(suiteDir)) return null;
    return execFileSync('git', ['rev-parse', 'HEAD'], opts).toString().trim();
  } catch {
    return null;
  }
}

export function suiteVersion({ suiteDir, folder }) {
  const { version } = JSON.parse(fs.readFileSync(path.join(suiteDir, 'package.json'), 'utf8'));
  const commit = lockfileCommit(folder) ?? checkoutCommit(suiteDir);
  return commit ? `${version} (${commit.slice(0, 7)})` : version;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test lib/version.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in `launch-check.js`**

Add the imports `import { suiteVersion } from './lib/version.js';` and add `suiteFolder` to the `./lib/environment.js` import. Delete the `version` and `sha` lines, change `tryExec` to run in `suiteFolder()`, and pass the new version:

```js
function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: suiteFolder(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
```

```js
  suiteVersion: suiteVersion({ suiteDir: SUITE_DIR, folder: suiteFolder() }),
```

Remove imports that are now unused (`path` is still used for `resultsFile`; check `fs`, `os`, `path` each with grep before removing).

- [ ] **Step 6: Run the unit tests and commit**

Run: `npm run test:unit 2>&1 | grep -E "^# (tests|fail)"`. Expected: `# tests 51`, `# fail 0`.

```bash
git add lib/version.js lib/version.test.js launch-check.js
git commit -m "Report the installed suite commit, never the project's

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The test-suite CLI and the package manifest

**Files:**
- Create: `bin/test-suite.js`
- Modify: `package.json`, `package-lock.json` (regenerated)
- Test: `lib/bin.test.js`, `lib/package.test.js` (create)

**Interfaces:**
- Consumes: `resolveConfigPath()`, `reportDir()`, `runPlaywright`, `runPlaywrightTest`, `runScript`.
- Produces: the `test-suite` bin with subcommands `run`, `config`, `test`, `visual`, `audit`, `report`, `trace`, `install-browsers`, `codegen`, `help`. Task 6 adds `init` and `sync-docs` to the same `commands` object.

- [ ] **Step 1: Write the failing tests**

Create `lib/bin.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';

const BIN = path.join(SUITE_DIR, 'bin', 'test-suite.js');

function cli(args, cwd) {
  const env = { ...process.env };
  delete env.SUITE_CONFIG;
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

test('a config command outside the suite folder names the folder and the Claude prompt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-bin-'));
  const res = cli(['config'], dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /No tests\.config\.mjs in /);
  assert.match(res.stderr, /test-suite\/AGENTS\.md/);
  assert.doesNotMatch(res.stderr, /at .*\.js:\d+/, 'no stack trace');
});

test('help prints the usage and exits 0', () => {
  const res = cli(['help'], os.tmpdir());
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage: test-suite <command>/);
});

test('an unknown command prints the usage and exits 1', () => {
  const res = cli(['lanch-check'], os.tmpdir());
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Unknown command "lanch-check"/);
});
```

Create `lib/package.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';

// What a project receives. npm packs git dependencies too, so this list is
// exactly what a git install puts in node_modules/@meom/test-suite.
test('the package ships the suite and nothing else', () => {
  const [{ files }] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: SUITE_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
  );
  const shipped = files.map(f => f.path);
  for (const required of [
    'bin/test-suite.js',
    'lib/config.js',
    'lib/cli.js',
    'lib/version.js',
    'specs/page-load.spec.js',
    'specs/auth.setup.js',
    'playwright.config.js',
    'launch-check.js',
    'check-config.js',
    'image-audit.js',
    'build-gallery.js',
    'README.md',
    'AGENTS.md',
    'examples/olmar.tests.config.mjs',
    'package.json',
  ]) {
    assert.ok(shipped.includes(required), `${required} is missing from the package`);
  }
  for (const path of shipped) {
    assert.ok(!/\.test\.js$/.test(path), `${path} is a unit test`);
    assert.ok(!/^(testbed|docs|node_modules|report)\//.test(path), `${path} must not ship`);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test lib/bin.test.js lib/package.test.js`
Expected: FAIL. `bin/test-suite.js` does not exist; the pack list contains `lib/config.test.js` and `testbed/`.

- [ ] **Step 3: Write `bin/test-suite.js`**

```js
#!/usr/bin/env node
// The test-suite CLI. Every npm script in a project's test-suite/ folder calls
// one of these subcommands.
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfigPath } from '../lib/config.js';
import { reportDir } from '../lib/environment.js';
import { runPlaywright, runPlaywrightTest, runScript } from '../lib/cli.js';

const USAGE = `Usage: test-suite <command> [args]

  run                the launch check: config check, all checks, gallery, image audit, report
  config             check that tests.config.mjs matches the site
  test [args]        functional checks; extra args go to Playwright
  visual [args]      screenshots and gallery
  audit [args]       image audit
  report             open the Playwright report of the last main run
  trace <path>       open a trace named in the launch report
  install-browsers   install the browsers for the suite's Playwright version
  codegen [url]      open Playwright's element inspector
  help               this text
`;

const [command, ...args] = process.argv.slice(2);

// Commands that read the config run in the folder that holds it, and pass its
// absolute path to every child process.
function enterSuiteFolder() {
  const file = resolveConfigPath();
  if (!fs.existsSync(file)) {
    console.error(
      `No tests.config.mjs in ${path.dirname(file)}.\n` +
        "Run this from the project's test-suite/ folder. If the config does not exist yet, ask Claude:\n" +
        '  Configure the test suite for this project. Follow test-suite/AGENTS.md.'
    );
    process.exit(1);
  }
  process.chdir(path.dirname(file));
  process.env.SUITE_CONFIG = file;
}

const NEEDS_CONFIG = new Set(['run', 'config', 'test', 'visual', 'audit', 'report']);

const commands = {
  run: () => runScript('launch-check.js'),
  config: () => runScript('check-config.js'),
  test: () => runPlaywrightTest(['--grep-invert', '@config|@visual|@audit', ...args]),
  visual: () => {
    const status = runPlaywrightTest(['--grep', '@visual', ...args]);
    return status === 0 ? runScript('build-gallery.js') : status;
  },
  audit: () => runScript('image-audit.js', args),
  report: () =>
    runPlaywright(['show-report', path.join(reportDir(process.env.TEST_ENV || 'local'), 'runs', 'main', 'playwright-report')]),
  trace: () => runPlaywright(['show-trace', ...args]),
  'install-browsers': () => runPlaywright(['install', ...args]),
  codegen: () => runPlaywright(['codegen', ...args]),
};

if (command === 'help' || command === '--help') {
  console.log(USAGE);
  process.exit(0);
}
if (!Object.hasOwn(commands, command)) {
  console.error(command ? `Unknown command "${command}".\n` : 'No command given.\n');
  console.error(USAGE);
  process.exit(1);
}
if (NEEDS_CONFIG.has(command)) enterSuiteFolder();
process.exit(await commands[command]());
```

Make it executable: `chmod +x bin/test-suite.js`.

- [ ] **Step 4: Rewrite `package.json`**

```json
{
  "name": "@meom/test-suite",
  "version": "0.1.0",
  "description": "The standard launch check for kala-stack WordPress sites",
  "license": "GPL-2.0-or-later",
  "author": "MEOM Oy",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/MEOM/test-suite.git"
  },
  "type": "module",
  "bin": {
    "test-suite": "bin/test-suite.js"
  },
  "files": [
    "bin/",
    "lib/",
    "!lib/*.test.js",
    "specs/",
    "examples/",
    "playwright.config.js",
    "launch-check.js",
    "check-config.js",
    "image-audit.js",
    "build-gallery.js",
    "README.md",
    "AGENTS.md"
  ],
  "engines": {
    "node": ">=20.12"
  },
  "scripts": {
    "test:unit": "node --test lib/*.test.js"
  },
  "dependencies": {
    "@playwright/test": "1.60.0",
    "yaml": "^2.5.0"
  }
}
```

Regenerate the lockfile: `npm install`. Expected: no version changes to `@playwright/test` (1.60.0) or `yaml`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit 2>&1 | grep -E "^not ok|^# (tests|fail)"`
Expected: `# tests 55`, `# fail 0`.

- [ ] **Step 6: Run the CLI against the test bed**

```bash
cd /Users/aleksi/work/test-suite-package/testbed
node ../bin/test-suite.js config
node ../bin/test-suite.js test --project=chrome-desktop --grep "page loads"
cd .. && node bin/test-suite.js config; echo "exit $?"
```

Expected: the first prints `Config check passed.`; the second passes 6 page-load tests on chrome-desktop; the third (from PKG, which has no config) prints the `No tests.config.mjs in /Users/aleksi/work/test-suite-package` message and `exit 1`.

- [ ] **Step 7: Commit**

```bash
git add bin/test-suite.js package.json package-lock.json lib/bin.test.js lib/package.test.js
git commit -m "Add the test-suite CLI and the package manifest

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: init and sync-docs

**Files:**
- Create: `lib/project.js`
- Modify: `bin/test-suite.js`
- Test: `lib/project.test.js` (create)

**Interfaces:**
- Consumes: `SUITE_DIR`; the bin path `bin/test-suite.js` (Task 5).
- Produces (in `lib/project.js`):
  - `FOLDER = 'test-suite'`, `DOCS = ['README.md', 'AGENTS.md']`, `REPO = 'https://github.com/MEOM/test-suite'`, `GITIGNORE: string`
  - `suitePackage(): { version: string, ... }`
  - `defaultSource(version: string): string`, `git+https://github.com/MEOM/test-suite.git#v<version>`
  - `projectPackageJson(name: string, source: string): object`
  - `class InitError extends Error`
  - `initProject({ projectRoot: string, source: string }): { dir: string, warnings: string[] }`
  - `syncDocs({ folder: string, version: string }): string[]` (written file paths)

- [ ] **Step 1: Write the failing tests**

Create `lib/project.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SUITE_DIR } from './config.js';
import { initProject, syncDocs, defaultSource, InitError, GITIGNORE } from './project.js';

const BIN = path.join(SUITE_DIR, 'bin', 'test-suite.js');

function cli(args, cwd) {
  const env = { ...process.env };
  delete env.SUITE_CONFIG;
  return spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
}

const SOURCE = 'git+https://github.com/MEOM/test-suite.git#v9.9.9';

function projectRoot({ configYml = true, workspaces } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-proj-'));
  if (configYml) fs.writeFileSync(path.join(root, 'config.yml'), 'name: demo\n');
  if (workspaces) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces }));
  return root;
}

test('defaultSource points at the version tag on GitHub', () => {
  assert.equal(defaultSource('0.1.0'), 'git+https://github.com/MEOM/test-suite.git#v0.1.0');
});

test('initProject writes the folder package.json and .gitignore', () => {
  const root = projectRoot({ workspaces: ['htdocs/wp-content/themes/demo'] });
  const { dir, warnings } = initProject({ projectRoot: root, source: SOURCE });
  assert.equal(dir, path.join(root, 'test-suite'));
  assert.deepEqual(warnings, []);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.devDependencies['@meom/test-suite'], SOURCE);
  assert.equal(pkg.scripts.postinstall, 'test-suite sync-docs');
  assert.equal(pkg.scripts['launch-check'], 'test-suite run');
  assert.equal(pkg.scripts['check-config'], 'test-suite config');
  assert.equal(pkg.scripts.test, 'test-suite test');
  assert.equal(pkg.scripts['install-browsers'], 'test-suite install-browsers');
  assert.match(pkg.name, /^[a-z0-9-]+-test-suite$/);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), GITIGNORE);
  for (const entry of ['node_modules/', 'report/', '.auth/', '.env.tests']) {
    assert.ok(GITIGNORE.split('\n').includes(entry), `.gitignore lacks ${entry}`);
  }
});

test('initProject refuses an existing test-suite folder and changes nothing', () => {
  const root = projectRoot();
  const dir = path.join(root, 'test-suite');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'tests.config.mjs'), 'keep me');
  assert.throws(() => initProject({ projectRoot: root, source: SOURCE }), InitError);
  assert.deepEqual(fs.readdirSync(dir), ['tests.config.mjs']);
  assert.equal(fs.readFileSync(path.join(dir, 'tests.config.mjs'), 'utf8'), 'keep me');
});

test('initProject warns outside a project root and when the root workspaces list the folder', () => {
  const { warnings: noYml } = initProject({ projectRoot: projectRoot({ configYml: false }), source: SOURCE });
  assert.ok(noYml.some(w => w.includes('no config.yml')));
  for (const ws of [['test-suite'], ['./test-suite/'], { packages: ['test-suite'] }]) {
    const { warnings } = initProject({ projectRoot: projectRoot({ workspaces: ws }), source: SOURCE });
    assert.ok(warnings.some(w => w.includes('workspaces')), `no warning for ${JSON.stringify(ws)}`);
  }
});

test('syncDocs copies README.md and AGENTS.md with a header naming the version', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-docs-'));
  const written = syncDocs({ folder, version: '9.9.9' });
  assert.deepEqual(written.map(f => path.basename(f)), ['README.md', 'AGENTS.md']);
  for (const name of ['README.md', 'AGENTS.md']) {
    const copy = fs.readFileSync(path.join(folder, name), 'utf8');
    assert.match(copy, /^<!-- Copied from @meom\/test-suite 9\.9\.9 /);
    assert.ok(copy.endsWith(fs.readFileSync(path.join(SUITE_DIR, name), 'utf8')), `${name} body differs`);
  }
});

test('syncDocs refuses to run in the package itself', () => {
  assert.throws(() => syncDocs({ folder: SUITE_DIR, version: '9.9.9' }), /package itself/);
});

test('the CLI init --no-install creates the folder without installing', () => {
  const root = projectRoot();
  const res = cli(['init', '--no-install', '--source', SOURCE], root);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(root, 'test-suite', 'package.json')));
  assert.ok(!fs.existsSync(path.join(root, 'test-suite', 'node_modules')));
  const again = cli(['init', '--no-install'], root);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
});

test('the CLI sync-docs copies the docs into the current folder', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-docs-'));
  const res = cli(['sync-docs'], folder);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(folder, 'README.md')));
  assert.ok(fs.existsSync(path.join(folder, 'AGENTS.md')));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test lib/project.test.js`
Expected: FAIL, cannot find module `./project.js`.

- [ ] **Step 3: Implement `lib/project.js`**

```js
// Adds the suite to a project (init) and keeps the developer docs in the
// project's test-suite/ folder in step with the installed version (sync-docs).
import fs from 'node:fs';
import path from 'node:path';
import { SUITE_DIR } from './config.js';

export const FOLDER = 'test-suite';
export const DOCS = ['README.md', 'AGENTS.md'];
export const REPO = 'https://github.com/MEOM/test-suite';
export const GITIGNORE = ['node_modules/', 'report/', '.auth/', '.env.tests', ''].join('\n');

export class InitError extends Error {
  name = 'InitError';
}

export const suitePackage = () => JSON.parse(fs.readFileSync(path.join(SUITE_DIR, 'package.json'), 'utf8'));
export const defaultSource = version => `git+${REPO}.git#v${version}`;

export function projectPackageJson(name, source) {
  return {
    name: `${name}-test-suite`,
    private: true,
    scripts: {
      postinstall: 'test-suite sync-docs',
      'launch-check': 'test-suite run',
      'check-config': 'test-suite config',
      test: 'test-suite test',
      'test:visual': 'test-suite visual',
      'audit:images': 'test-suite audit',
      report: 'test-suite report',
      'install-browsers': 'test-suite install-browsers',
    },
    devDependencies: { '@meom/test-suite': source },
  };
}

// The root package.json must not list the folder in workspaces: the root
// npm install, and the Bitbucket pipeline with it, would install the suite.
function listsFolderInWorkspaces(projectRoot) {
  const file = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(file)) return false;
  const { workspaces } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(workspaces) ? workspaces : workspaces?.packages ?? [];
  return list.some(w => path.normalize(w).replace(/\/$/, '') === FOLDER);
}

// Writes <projectRoot>/test-suite/package.json and .gitignore. Refuses, without
// writing anything, when the folder exists. Returns warnings for the caller.
export function initProject({ projectRoot, source }) {
  const dir = path.join(projectRoot, FOLDER);
  if (fs.existsSync(dir)) throw new InitError(`${dir} already exists; nothing was changed.`);
  const warnings = [];
  if (!fs.existsSync(path.join(projectRoot, 'config.yml'))) {
    warnings.push(`no config.yml in ${projectRoot}; run init from the project root`);
  }
  if (listsFolderInWorkspaces(projectRoot)) {
    warnings.push(`the root package.json lists "${FOLDER}" in workspaces; remove it, or the root npm install (and CI) installs the suite`);
  }
  const name = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(projectPackageJson(name, source), null, 2)}\n`);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE);
  return { dir, warnings };
}

// Copies the package's README.md and AGENTS.md into the suite folder. The
// copies are committed, so a version bump shows its doc changes.
export function syncDocs({ folder, version }) {
  if (fs.realpathSync(folder) === fs.realpathSync(SUITE_DIR)) {
    throw new Error('sync-docs copies the docs into a project; it cannot run in the package itself');
  }
  const header =
    `<!-- Copied from @meom/test-suite ${version} by npm install. Edits here are overwritten; ` +
    `change the original in ${REPO}. -->\n\n`;
  return DOCS.map(name => {
    const target = path.join(folder, name);
    fs.writeFileSync(target, header + fs.readFileSync(path.join(SUITE_DIR, name), 'utf8'));
    return target;
  });
}
```

- [ ] **Step 4: Wire init and sync-docs into `bin/test-suite.js`**

Add imports:

```js
import { spawnSync } from 'node:child_process';
import { InitError, defaultSource, initProject, suitePackage, syncDocs } from '../lib/project.js';
```

Add to `USAGE`, before `help`:

```
  init [--source <spec>] [--no-install]
                     add the suite to a project; run from the project root
  sync-docs          copy README.md and AGENTS.md into the current folder
```

Add above `const commands`:

```js
const NEXT_STEPS = `
Next steps:
  cd test-suite
  npm run install-browsers     once per machine
  Ask Claude: Configure the test suite for this project. Follow test-suite/AGENTS.md.
  npm run check-config
  npm run launch-check
Commit test-suite/: package.json, package-lock.json, tests.config.mjs, README.md, AGENTS.md, .gitignore.`;

const option = name => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
```

Add to `commands`:

```js
  init: () => {
    const source = option('--source') ?? defaultSource(suitePackage().version);
    let result;
    try {
      result = initProject({ projectRoot: process.cwd(), source });
    } catch (err) {
      if (!(err instanceof InitError)) throw err;
      console.error(err.message);
      return 1;
    }
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    console.log(`Created ${result.dir} with @meom/test-suite from ${source}`);
    if (args.includes('--no-install')) return 0;
    const status = spawnSync('npm', ['install'], { cwd: result.dir, stdio: 'inherit' }).status ?? 1;
    if (status === 0) console.log(NEXT_STEPS);
    return status;
  },
  'sync-docs': () => {
    const written = syncDocs({ folder: process.cwd(), version: suitePackage().version });
    console.log(`Copied ${written.map(f => path.basename(f)).join(' and ')} from @meom/test-suite`);
    return 0;
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit 2>&1 | grep -E "^not ok|^# (tests|fail)"`
Expected: `# tests 63`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add lib/project.js lib/project.test.js bin/test-suite.js
git commit -m "Add init and sync-docs

init creates a project's test-suite/ folder; sync-docs, run by
postinstall, copies README.md and AGENTS.md into it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs for the package layout

**Files:**
- Modify: `README.md` (full rewrite below), `AGENTS.md` (listed edits), `testbed/README.md` (full rewrite below)

**Interfaces:**
- Consumes: the CLI subcommands and npm script names from Tasks 5 and 6.
- Produces: the docs `sync-docs` copies into projects.

- [ ] **Step 1: Rewrite `README.md`**

Keep the sections "Why it exists", "What it checks" (the table and the matrix), "Reading the report" (including "When something fails", the WebKit note and "Honesty rules") and "What it does not check" word for word from the current file, except for the path changes listed in Step 2. Replace the opening and everything from "## Getting started" up to "## Reading the report" with this text, and the "Config at a glance" paragraph after the key table as shown:

````markdown
# Launch check

The standard final check before a kala-stack site launches. It runs the same
automated checks on every project, in six browser and device combinations,
against the environment you choose: your local site, staging or production.
The result is one launch report.

The suite is the npm package `@meom/test-suite` from
https://github.com/MEOM/test-suite. A project installs it in its own
`test-suite/` folder, which holds everything you work with: the config, this
README, the instructions for Claude and the results.
````

(then "Why it exists" and "What it checks" unchanged)

````markdown
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
````

In "Config at a glance", change the code comment `// tests.config.mjs (project root)` to `// test-suite/tests.config.mjs`, the `local: {}` comment to `// URL from config.yml in the project root`, and replace the closing paragraph with:

```markdown
A complete real example: `node_modules/@meom/test-suite/examples/olmar.tests.config.mjs`.
How each value is found: `AGENTS.md`.
```

- [ ] **Step 2: Path edits in the kept README sections**

- "Reading the report": `` `tests/report/<env>/launch-report.md` `` becomes `` `test-suite/report/<env>/launch-report.md` ``; `(`npx playwright show-trace <path>`)` becomes `(`npx test-suite trace <path>`)`.
- Check the result: `grep -n "tests/\|npx playwright\|project root" README.md` prints only the "Do not run `npx playwright`" sentence and the `config.yml in the project root` comment.

- [ ] **Step 3: Edit `AGENTS.md`**

- Line "Write `tests.config.mjs` in the project root (the directory above `tests/`)." becomes:
  "Write `tests.config.mjs` in the project's `test-suite/` folder. If the folder does not exist, ask the developer to add the suite first (README, "Add the suite to a project")."
- The bullet starting "Never edit anything in `tests/`." becomes:
  "Never edit the suite in `node_modules/@meom/test-suite`, and never edit `README.md` or `AGENTS.md` in `test-suite/`: they are copies that `npm install` overwrites. The suite is a shared template; a change would make this project's checks differ from every other project's."
- "`npx playwright codegen <url>` (from `tests/`)" becomes "`npx test-suite codegen <url>` (from `test-suite/`)".
- In `environments`: "`.env.tests` in the project root" becomes "`.env.tests` in `test-suite/`".
- "A complete example: `examples/olmar.tests.config.mjs` in the suite repository." becomes "A complete example: `node_modules/@meom/test-suite/examples/olmar.tests.config.mjs`."
- "1. From `tests/`: `npm run check-config`." becomes "1. From `test-suite/`: `npm run check-config`."
- "Summarize from `tests/report/<env>/launch-report.md`:" becomes "Summarize from `test-suite/report/<env>/launch-report.md`:".
- Check: `grep -n "tests/" AGENTS.md` prints nothing.

- [ ] **Step 4: Rewrite `testbed/README.md`**

````markdown
# Test bed

`test-suite.local` is the kala-stack site the suite is verified against. It
has one page per template type and every feature the suite checks: a main
menu, the skip link, the Headroom header, a meomblocks accordion and a Gravity
Form. The About page shows a generated 2400x1600 image at 300px, so the image
audit always has an oversized image to report.

The site itself is not in this repo. Create a kala-stack site on
`test-suite.local`, then seed it from this repo:

    bash testbed/seed.sh <path to the site>

The script refuses to run twice. It creates the Subscriber `launchcheck` and
writes its credentials to `testbed/.env.tests` (gitignored).

## Dev loop

`testbed/` is a suite folder: it holds `tests.config.mjs` and receives
`report/` and `.auth/`. Run the CLI from the repo against it:

    cd testbed
    node ../bin/test-suite.js config
    node ../bin/test-suite.js run

The `login` environment checks `auth: 'wp-login'`. Activate `wp-force-login`
on the site first:

    TEST_ENV=login node ../bin/test-suite.js config

## Install check

Before a release, install the package in the site the way a project does:

    cd <site>
    node <this repo>/bin/test-suite.js init --source file:<this repo>
    cp <this repo>/testbed/tests.config.mjs <this repo>/testbed/.env.tests test-suite/
    cd test-suite && npm run launch-check

Then repeat with the `npm pack` tarball (`npm install <tarball>`) to prove the
`files` list is complete.
````

- [ ] **Step 5: Check the writing rules and commit**

Run: `grep -n "—" README.md AGENTS.md testbed/README.md` prints nothing.

```bash
git add README.md AGENTS.md testbed/README.md
git commit -m "Docs: install in test-suite/, CLI commands, test bed dev loop

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The test bed installs the package

**Files:**
- Modify: `PKG/testbed/seed.sh`
- Move: `SITE/.env.tests` to `PKG/testbed/.env.tests`
- Delete (SITE, git rm): `tests/`, `testbed/`, `docs/`, `examples/`, `tests.config.mjs`
- Create (SITE): `test-suite/` by `init`

**Interfaces:**
- Consumes: the CLI (`init --source`, `sync-docs` via postinstall, `run`, `config`, `test`), `testbed/tests.config.mjs`.
- Produces: SITE with the suite installed in `test-suite/`, ready for Task 9 to switch to the GitHub tag.

- [ ] **Step 1: Make `seed.sh` take the site directory**

Replace the top of `testbed/seed.sh` up to the `if [ -n ...` line with:

```bash
#!/usr/bin/env bash
# Seeds the launch check test bed (test-suite.local). Run from this repo on a
# fresh kala-stack WordPress install:
#   bash testbed/seed.sh <path to the site>
# Refuses to run twice.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="${1:?usage: bash testbed/seed.sh <path to the kala-stack site>}"
cd "$site"
wp() { docker compose exec -T --user vagrant wordpress wp "$@"; }
content() { cat "$here/content/$1"; }
```

Change the two eval-file lines to read the PHP from this repo through stdin:

```bash
image_path=$(wp eval-file - < "$here/make-image.php")
```

```bash
form_id=$(wp eval-file - < "$here/gf-form.php")
```

Change the credentials line and the final message:

```bash
printf 'TEST_AUTH_USER=launchcheck\nTEST_AUTH_PASSWORD=%s\n' "$password" > "$here/.env.tests"
```

```bash
echo "Seeded. Gravity Form id: $form_id. Credentials written to $here/.env.tests."
```

Check: `bash -n testbed/seed.sh` prints nothing; `grep -n "/data/wordpress" testbed/seed.sh` prints nothing.

- [ ] **Step 2: Prove the stdin eval-file path on the live site**

The test bed is already seeded, so the whole script refuses to run. Check the one changed mechanism without side effects beyond a temp file:

```bash
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp eval-file - < /Users/aleksi/work/test-suite-package/testbed/make-image.php
```

Expected: `/tmp/launch-check-large.jpg`.

- [ ] **Step 3: Move the credentials and run the dev loop**

```bash
mv /Users/aleksi/work/test-suite/.env.tests /Users/aleksi/work/test-suite-package/testbed/.env.tests
cd /Users/aleksi/work/test-suite-package/testbed
node ../bin/test-suite.js run; echo "exit $?"
```

Expected: `exit 0`. `testbed/report/local/launch-report.md` says `**Automated checks: PASSED**` with 0 failed across all six projects, and the header line is `| Suite version | 0.1.0 (<PKG HEAD short sha>) |` (`git -C .. rev-parse --short=7 HEAD`).

- [ ] **Step 4: Login check**

```bash
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp plugin activate wp-force-login
cd /Users/aleksi/work/test-suite-package/testbed
TEST_ENV=login node ../bin/test-suite.js config; echo "exit $?"
TEST_ENV=login node ../bin/test-suite.js test --project=chrome-desktop; echo "exit $?"
ls .auth/login.json
cd /Users/aleksi/work/test-suite
docker compose exec -T --user vagrant wordpress wp plugin deactivate wp-force-login
```

Expected: both `exit 0`, `.auth/login.json` exists in `testbed/`, the plugin ends deactivated.

- [ ] **Step 5: Commit the package repo**

```bash
cd /Users/aleksi/work/test-suite-package
git status --short   # only testbed/seed.sh; .env.tests, report/ and .auth/ are ignored
git add testbed/seed.sh
git commit -m "Test bed: seed a site given by path

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Remove the moved files from the site repo**

```bash
cd /Users/aleksi/work/test-suite
git rm -r -q tests testbed docs examples tests.config.mjs
rm -rf tests
git diff --cached --name-only | grep -v "^\(tests\|testbed\|docs\|examples\)/\|^tests.config.mjs$"
```

Expected: the last command prints nothing, so only the removed paths are staged. The site's other uncommitted changes (the kala theme deletion, lockfiles, `config.yml`) stay unstaged and untouched.

- [ ] **Step 7: Install with init from the linked package repo**

```bash
cd /Users/aleksi/work/test-suite
shasum package.json package-lock.json > "$TMPDIR/root-pkg.sha"   # the root package files before init
node /Users/aleksi/work/test-suite-package/bin/test-suite.js init --source file:/Users/aleksi/work/test-suite-package
```

Expected: no warnings (SITE has `config.yml`; its root `workspaces` list the theme and meomblocks only), `Created /Users/aleksi/work/test-suite/test-suite ...`, npm install succeeds, the postinstall prints `Copied README.md and AGENTS.md from @meom/test-suite`, then the next steps. Check:

```bash
head -1 test-suite/README.md     # <!-- Copied from @meom/test-suite 0.1.0 ...
ls test-suite                    # .gitignore AGENTS.md README.md node_modules package-lock.json package.json
shasum -c "$TMPDIR/root-pkg.sha"   # both OK: init did not touch the root package files
```

- [ ] **Step 8: Run the launch check from the project folder**

```bash
cp /Users/aleksi/work/test-suite-package/testbed/tests.config.mjs /Users/aleksi/work/test-suite-package/testbed/.env.tests /Users/aleksi/work/test-suite/test-suite/
cd /Users/aleksi/work/test-suite/test-suite
npm run check-config && npm run launch-check; echo "exit $?"
```

Expected: `exit 0`; `test-suite/report/local/launch-report.md` PASSED with 0 failed; `ls /Users/aleksi/work/test-suite-package/report` fails (nothing written into the package).

- [ ] **Step 9: Install the tarball and run again**

```bash
cd /Users/aleksi/work/test-suite-package
PACK=$(mktemp -d)
npm pack --pack-destination "$PACK"
cd /Users/aleksi/work/test-suite/test-suite
npm install "$PACK/meom-test-suite-0.1.0.tgz"
ls -la node_modules/@meom/test-suite | head -3   # a real directory, not a symlink
npm run launch-check; echo "exit $?"
```

Expected: `exit 0`, PASSED, and the report header shows `| Suite version | 0.1.0 |` with no commit (a tarball has neither a lockfile commit nor a checkout).

- [ ] **Step 10: Commit the site repo**

```bash
cd /Users/aleksi/work/test-suite
git add test-suite
git status --short test-suite   # package.json, package-lock.json, tests.config.mjs, README.md, AGENTS.md, .gitignore; no node_modules, report or .env.tests
git commit -m "Move the suite to MEOM/test-suite and install it in test-suite/

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The commit contains the staged removals from Step 6 and the new folder; nothing else.

---

### Task 9: Release v0.1.0 and install it from GitHub

**Files:**
- Modify (SITE): `test-suite/package.json`, `test-suite/package-lock.json`

**Interfaces:**
- Consumes: PKG `main` with Tasks 1 to 8; SITE `test-suite/` from Task 8.
- Produces: tag `v0.1.0` on GitHub; SITE installed from it. The olmar parity check (previous plan, Task 13 Step 6) then installs the same tag.

- [ ] **Step 1: Ask the developer before publishing**

The repo is public. Show the developer `git -C /Users/aleksi/work/test-suite-package log --oneline` and `npm pack --dry-run` output, and ask for confirmation to push `main` and tag `v0.1.0`. Wait for an explicit yes.

- [ ] **Step 2: Push and tag**

```bash
cd /Users/aleksi/work/test-suite-package
npm run test:unit 2>&1 | grep -E "^# fail 0" || echo "STOP: unit tests fail"
git push -u origin main
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
git rev-parse v0.1.0^{commit}
```

Note the commit sha for Step 3.

- [ ] **Step 3: Install the tag in the test bed**

```bash
cd /Users/aleksi/work/test-suite/test-suite
npm install git+https://github.com/MEOM/test-suite.git#v0.1.0
node -e "const l=require('./package-lock.json');console.log(l.packages['node_modules/@meom/test-suite'].resolved)"
grep '"@meom/test-suite"' package.json
```

Expected: `resolved` ends with `#<the sha from Step 2>` (npm may record it as `git+ssh://git@github.com/MEOM/test-suite.git#...`; the protocol does not matter, the report reads the sha), and `package.json` has `"@meom/test-suite": "git+https://github.com/MEOM/test-suite.git#v0.1.0"`. If npm rewrote the spec into a different form (for example `github:MEOM/test-suite#v0.1.0`), record the form in the report to the developer and keep it; both resolve to the same commit.

- [ ] **Step 4: Launch check from the tag**

```bash
npm run launch-check; echo "exit $?"
grep "Suite version" report/local/launch-report.md
```

Expected: `exit 0`, PASSED, `| Suite version | 0.1.0 (<first 7 chars of the sha>) |`.

- [ ] **Step 5: Prove the init command from GitHub**

```bash
CHECK=$(mktemp -d) && cd "$CHECK"
printf 'name: demo\n' > config.yml
npx --yes git+https://github.com/MEOM/test-suite.git#v0.1.0 init --no-install
grep '@meom/test-suite' test-suite/package.json
cd / && rm -rf "$CHECK"
```

Expected: `Created .../init-check/test-suite ...`, and the dependency line reads `git+https://github.com/MEOM/test-suite.git#v0.1.0`.

- [ ] **Step 6: Commit the site repo**

```bash
cd /Users/aleksi/work/test-suite
git add test-suite/package.json test-suite/package-lock.json test-suite/README.md test-suite/AGENTS.md
git commit -m "Install @meom/test-suite v0.1.0 from GitHub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Skip browsers that cannot start (runs after Task 8, before Task 9)

Added 2026-10-02 at the developer's request after Task 8 stalled: the Claude Code Bash sandbox blocks Playwright's Firefox, and every Firefox test then waited out a 30 s launch timeout. Spec: section 4 "Browsers that cannot start", section 5 item 2, section 6 AGENTS.md item 5.

**Files:**
- Create: `lib/browsers.js`, `lib/browsers.test.js`
- Modify: `lib/report.js`, `lib/report.test.js`, `launch-check.js`, `README.md`, `AGENTS.md`, `lib/package.test.js` (required list)

**Interfaces:**
- Consumes: `MATRIX` from `lib/projects.js` (entries `{ name, use }`, `use.defaultBrowserType` is `'chromium' | 'firefox' | 'webkit'` or absent for Chromium); `stripAnsi` from `lib/report.js`; `runPlaywrightTest(args, env)`.
- Produces:
  - `PROBE_TIMEOUT = 15_000`
  - `engineOf(project): 'chromium' | 'firefox' | 'webkit'`
  - `probeEngines(matrix = MATRIX, launch = defaultLaunch): Promise<Record<engine, string | null>>` (null = started)
  - `splitProjects(probe, matrix = MATRIX): { run: string[], skipped: { project, engine, reason }[] }`
  - `renderLaunchReport({ ..., skippedProjects = [] })`; `NOT_RUN_OPTIONS: string` exported from `lib/report.js`

- [ ] **Step 1: Write the failing browser tests**

Create `lib/browsers.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATRIX } from './projects.js';
import { engineOf, probeEngines, splitProjects, PROBE_TIMEOUT } from './browsers.js';

test('every matrix project maps to its browser engine', () => {
  assert.deepEqual(Object.fromEntries(MATRIX.map(p => [p.name, engineOf(p)])), {
    'chrome-phone': 'chromium',
    'chrome-tablet': 'chromium',
    'chrome-desktop': 'chromium',
    'firefox-desktop': 'firefox',
    'safari-phone': 'webkit',
    'safari-desktop': 'webkit',
  });
});

test('probeEngines starts each engine once and reports the launch error of one that cannot start', async () => {
  const calls = [];
  let closed = 0;
  const launch = async (engine, opts) => {
    calls.push([engine, opts.timeout]);
    if (engine === 'firefox') {
      throw new Error(
        'browserType.launch: Timeout 15000ms exceeded.\nCall log:\n' +
          '  - [pid=1][err] sandbox_extension_issue_file_to_process failed for plugin-container.app: 1 (Operation not permitted)'
      );
    }
    return { close: async () => { closed++; } };
  };
  const probe = await probeEngines(MATRIX, launch);
  assert.deepEqual(calls, [['chromium', PROBE_TIMEOUT], ['firefox', PROBE_TIMEOUT], ['webkit', PROBE_TIMEOUT]]);
  assert.equal(closed, 2);
  assert.equal(probe.chromium, null);
  assert.equal(probe.webkit, null);
  assert.equal(
    probe.firefox,
    'browserType.launch: Timeout 15000ms exceeded. sandbox_extension_issue_file_to_process failed for plugin-container.app: 1 (Operation not permitted)'
  );
});

test('splitProjects leaves out the projects of an engine that cannot start', () => {
  const { run, skipped } = splitProjects({ chromium: null, firefox: 'cannot start', webkit: null });
  assert.deepEqual(run, ['chrome-phone', 'chrome-tablet', 'chrome-desktop', 'safari-phone', 'safari-desktop']);
  assert.deepEqual(skipped, [{ project: 'firefox-desktop', engine: 'firefox', reason: 'cannot start' }]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test lib/browsers.test.js`
Expected: FAIL, cannot find module `./browsers.js`.

- [ ] **Step 3: Implement `lib/browsers.js`**

```js
// Finds the browser engines that cannot start on this machine before the main
// run, so launch-check skips their projects instead of waiting out a launch
// timeout in every test (seen when a sandbox blocks Playwright's Firefox).
import { chromium, firefox, webkit } from '@playwright/test';
import { MATRIX } from './projects.js';
import { stripAnsi } from './report.js';

const ENGINES = { chromium, firefox, webkit };
export const PROBE_TIMEOUT = 15_000;

const defaultLaunch = (engine, options) => ENGINES[engine].launch(options);

export const engineOf = project => project.use.defaultBrowserType ?? 'chromium';

// The reason is the error's first line plus the browser's own [err] line,
// which names the actual cause (for example a sandbox denial).
function launchFailure(err) {
  const lines = stripAnsi(String(err?.message ?? err)).split('\n').map(l => l.trim());
  const detail = lines.find(l => l.includes('[err]'));
  return detail ? `${lines[0]} ${detail.replace(/^-?\s*\[pid=\d+\]\[err\]\s*/, '')}` : lines[0];
}

export async function probeEngines(matrix = MATRIX, launch = defaultLaunch) {
  const probe = {};
  for (const engine of new Set(matrix.map(engineOf))) {
    try {
      const browser = await launch(engine, { timeout: PROBE_TIMEOUT });
      await browser.close();
      probe[engine] = null;
    } catch (err) {
      probe[engine] = launchFailure(err);
    }
  }
  return probe;
}

export function splitProjects(probe, matrix = MATRIX) {
  const run = [];
  const skipped = [];
  for (const project of matrix) {
    const engine = engineOf(project);
    if (probe[engine]) skipped.push({ project: project.name, engine, reason: probe[engine] });
    else run.push(project.name);
  }
  return { run, skipped };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test lib/browsers.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing report test**

In `lib/report.test.js`, add `NOT_RUN_OPTIONS` to the import from `./report.js` and append:

```js
test('a project that could not start makes a clean run INCOMPLETE and lists the options', () => {
  const passing = collectTests(json).filter(t => t.outcome === 'expected');
  const skippedProjects = [{ project: 'firefox-desktop', engine: 'firefox', reason: 'Timeout 15000ms exceeded.' }];
  const md = renderLaunchReport({ ...base, tests: passing, skippedProjects });
  assert.match(md, /\*\*Automated checks: INCOMPLETE\*\*/);
  assert.match(md, /\*\*Not run on this machine:\*\*/);
  assert.match(md, /- firefox-desktop \(firefox\): Timeout 15000ms exceeded\./);
  assert.ok(md.includes(NOT_RUN_OPTIONS));
});

test('a failure wins over skipped projects', () => {
  const skippedProjects = [{ project: 'firefox-desktop', engine: 'firefox', reason: 'x' }];
  const md = renderLaunchReport({ ...base, tests: collectTests(json), skippedProjects });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /Not run on this machine/);
});

test('without skipped projects the report has no Not run list', () => {
  const passing = collectTests(json).filter(t => t.outcome === 'expected');
  const md = renderLaunchReport({ ...base, tests: passing });
  assert.match(md, /\*\*Automated checks: PASSED\*\*/);
  assert.doesNotMatch(md, /Not run on this machine/);
});
```

Run: `node --test lib/report.test.js`
Expected: FAIL on the three new tests (`NOT_RUN_OPTIONS` undefined, no INCOMPLETE verdict).

- [ ] **Step 6: Implement in `lib/report.js`**

Add after `VISUAL_REVIEW`:

```js
export const NOT_RUN_OPTIONS =
  'The result covers only the browsers that ran. To complete it, run `npm run launch-check` in a normal terminal. ' +
  'When an agent runs it inside a sandbox, approve running exactly that command outside the sandbox.';
```

Change `resultSection` to take the skipped projects and use three verdicts:

```js
function resultSection(tests, egregiousCount, auditRan, auditExitCode, skipped) {
```

Replace the `passed` and first `lines` statements with:

```js
  const passed = !failed && egregiousCount === 0 && auditRan && auditExitCode === 0;
  const verdict = !passed ? 'FAILED' : skipped.length ? 'INCOMPLETE' : 'PASSED';
  const lines = [
    `**Automated checks: ${verdict}** ` +
      `(${count('expected')} passed, ${failed} failed, ${count('flaky')} flaky, ${count('skipped')} skipped)`,
  ];
```

Before the final `return lines.join('\n');` of `resultSection` add:

```js
  if (skipped.length) {
    lines.push(
      '',
      '**Not run on this machine:**',
      '',
      ...skipped.map(s => `- ${s.project} (${s.engine}): ${s.reason}`),
      '',
      NOT_RUN_OPTIONS
    );
  }
```

In `renderLaunchReport`, add `skippedProjects = []` to the destructured parameters and pass it: `resultSection(tests, egregiousCount, auditRows !== null, auditExitCode, skippedProjects)`.

Run: `node --test lib/report.test.js`
Expected: PASS, all report tests.

- [ ] **Step 7: Use the probe in `launch-check.js`**

Add `import { probeEngines, splitProjects } from './lib/browsers.js';`. Replace the main run line with:

```js
// A browser that cannot start here would make every one of its tests wait out
// the launch timeout. Its projects are left out and reported as not run.
const { run: runnable, skipped } = splitProjects(await probeEngines());
for (const s of skipped) console.warn(`\nNot running ${s.project}: ${s.engine} cannot start here. ${s.reason}`);
const mainStatus = runPlaywrightTest(
  ['--grep-invert', '@config|@audit', ...runnable.map(name => `--project=${name}`)],
  { RUN_LABEL: 'main' }
);
```

Pass `skippedProjects: skipped` to `renderLaunchReport`, and change the exit line to:

```js
process.exit(mainStatus !== 0 || auditStatus !== 0 || skipped.length ? 1 : 0);
```

Update the header comment's step 2 line to: `//   2. functional checks and screenshots across the 6 projects (a browser that cannot start here is skipped and reported)`.

- [ ] **Step 8: Docs and the package test**

`lib/package.test.js`: add `'lib/browsers.js'` to the `required` list.

`README.md`, "Reading the report": change item 2 to `2. **Result:** the verdict and a table of checks by device. INCOMPLETE means a browser could not start on this machine; the report lists it with the options.` In "When something fails", add after item 3:

```markdown
4. INCOMPLETE: a browser could not start, so its device column did not run.
   Run `npm run launch-check` in a normal terminal. If Claude ran it, its
   sandbox may block Playwright's Firefox: approve running exactly the launch
   check command outside the sandbox when it asks.
```

`AGENTS.md`, "Reporting to the developer": add a bullet after the flaky bullet:

```markdown
- an INCOMPLETE verdict as incomplete, never as passed: which browsers did not
  start and why, and the two options (the developer approves running exactly
  the launch check command outside the sandbox, or runs it in a terminal). Do
  not disable a sandbox yourself and do not retry a browser that cannot start.
```

Check: `grep -n "—" README.md AGENTS.md lib/browsers.js lib/report.js launch-check.js` prints nothing.

- [ ] **Step 9: Run the unit tests and commit**

Run: `npm run test:unit 2>&1 | grep -E "^not ok|^# (tests|fail)"`
Expected: `# tests 69`, `# fail 0`.

```bash
git add lib/browsers.js lib/browsers.test.js lib/report.js lib/report.test.js lib/package.test.js launch-check.js README.md AGENTS.md
git commit -m "Skip browsers that cannot start and mark the run INCOMPLETE

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Prove it inside the sandbox**

Inside the Claude Code Bash sandbox (where Firefox cannot start), from `/Users/aleksi/work/test-suite/test-suite` after updating the linked install (`npm install` is not needed for a `file:` link; for a tarball install re-pack and reinstall):

```bash
npm run launch-check; echo "exit $?"
grep -A6 "Automated checks" report/local/launch-report.md
```

Expected: the run finishes in about the time of five projects (no 30 s waits per Firefox test), `exit 1`, verdict `INCOMPLETE` with `firefox-desktop (firefox): ... Operation not permitted` under "Not run on this machine", and every other project ok. Then run the same command outside the sandbox (developer-approved): verdict PASSED, no Not run list.

---

## Self-Review

**Spec coverage (section 8 and the path changes):**
- Package repo with fresh history, root `package.json`, `files`, dependencies, engines, no devDependencies: Tasks 1 and 5.
- Suite folder and project root split, nothing written into the package: Task 2, verified in Tasks 3 and 8.
- CLI subcommands including `codegen`, no shell, one Playwright instance, absolute `SUITE_CONFIG`: Tasks 3 and 5.
- Report header version and commit: Task 4, verified for link, tarball and tag in Tasks 8 and 9.
- `init` with `--source` and `--no-install`, refusal, warnings, no config written: Task 6, used for real in Task 8 and from GitHub in Task 9.
- `sync-docs` through postinstall, header, committed copies: Task 6, verified in Task 8.
- CI untouched (separate package.json, workspaces warning): Task 6 warning test, Task 8 Step 7 checks the root package files stay unchanged.
- README, AGENTS.md: Task 7. Test bed seeded by path, dev loop, install check: Tasks 7 and 8.
- Verification section 7 item 3 (link, tarball, tag): Tasks 8 and 9. Item 4 (olmar parity) stays in the previous plan's Task 13 Step 6, now run with the package install.

**Placeholder scan:** every code step carries its code; the README rewrite gives the new sections in full and names the kept sections exactly.

**Type consistency:** `suiteFolder(env)` (Task 2) is used by Task 4; `reportDir(envName, dir)` keeps one-argument call sites; `runScript(name, args, env)`, `runPlaywrightTest(args, env)`, `runPlaywright(args)` (Task 3) match their uses in Tasks 5 and 6; `lib/bin.test.js` and `lib/project.test.js` each define their own `cli(args, cwd)` helper, so no test file imports another; `suiteVersion({ suiteDir, folder })` matches Task 4's call.

**Review Focus:** all five lines have tests: bin.test.js (1), project.test.js (2, 5), version.test.js (3), package.test.js plus the tarball run (4).
