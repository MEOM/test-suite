#!/usr/bin/env node
// The test-suite CLI. Every npm script in a project's test-suite/ folder calls
// one of these subcommands.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveConfigPath } from '../lib/config.js';
import { reportDir, suiteFolder } from '../lib/environment.js';
import { runPlaywright, runPlaywrightTest, runScript } from '../lib/cli.js';
import { InitError, defaultSource, initProject, suitePackage, syncDocs } from '../lib/project.js';

const USAGE = `Usage: test-suite <command> [args]

  init [--source <spec>] [--no-install]
                     add the suite to a project; run from the project root
  sync-docs          copy README.md and AGENTS.md into the current folder
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
  run: () => runScript('launch-check.js'),
  config: () => runScript('check-config.js'),
  test: () => runPlaywrightTest(['--grep-invert', '@config|@visual|@audit', ...args]),
  visual: () => {
    const status = runPlaywrightTest(['--grep', '@visual', ...args]);
    return status === 0 ? runScript('build-gallery.js') : status;
  },
  audit: () => runScript('image-audit.js', args),
  report: () =>
    runPlaywright(['show-report', path.join(reportDir(process.env.TEST_ENV || 'local', suiteFolder()), 'runs', 'main', 'playwright-report')]),
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
