// The standard launch check. One command:
//   1. check-config (stops here when the config does not match the site)
//   2. functional checks and screenshots across the 6 projects (a browser that cannot start here is skipped and reported)
//   3. gallery
//   4. image audit
//   5. launch report: report/<env>/launch-report.md
// Steps 2 to 5 run to the end even when checks fail, so the report is complete.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadSuiteOrExit, runPlaywrightTest, runScript } from './lib/cli.js';
import { reportDir, runDir, suiteFolder } from './lib/environment.js';
import { probeEngines, splitProjects } from './lib/browsers.js';
import { suiteVersion } from './lib/version.js';
import { collectTests, renderLaunchReport } from './lib/report.js';
import { readAuditRows } from './lib/audit-rows.js';
import { SUITE_DIR } from './lib/config.js';

const { config, environment, exceptions } = await loadSuiteOrExit();
const out = reportDir(environment.name);
fs.rmSync(out, { recursive: true, force: true });

console.log(`Launch check: ${config.name}, environment "${environment.name}" (${environment.baseURL})`);

if (runScript('check-config.js') !== 0) {
  console.error('\nLaunch check stopped: fix tests.config.mjs (or the site) and run it again.');
  process.exit(1);
}

// A browser that cannot start here would make every one of its tests wait out
// the launch timeout. Its projects are left out and reported as not run.
const { run: runnable, skipped } = splitProjects(await probeEngines());
for (const s of skipped) console.warn(`\nNot running ${s.project}: ${s.engine} cannot start here. ${s.reason}`);
let mainStatus = 1;
if (runnable.length) {
  mainStatus = runPlaywrightTest(
    ['--grep-invert', '@config|@audit', ...runnable.map(name => `--project=${name}`)],
    { RUN_LABEL: 'main' }
  );
} else {
  // No --project flag would make Playwright run all six projects.
  console.error('\nNo browser could start here; nothing was run.');
}
runScript('build-gallery.js');
const auditStatus = runScript('image-audit.js');

function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: suiteFolder(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const resultsFile = path.join(runDir(environment.name, 'main'), 'results.json');

const report = renderLaunchReport({
  config,
  environment,
  exceptions,
  generatedAt: new Date(),
  suiteVersion: suiteVersion({ suiteDir: SUITE_DIR, folder: suiteFolder() }),
  runBy: tryExec('git config user.name') || os.userInfo().username,
  tests: runnable.length && fs.existsSync(resultsFile) ? collectTests(JSON.parse(fs.readFileSync(resultsFile, 'utf8'))) : null,
  auditRows: readAuditRows(path.join(out, 'image-audit', 'data')),
  auditExitCode: auditStatus,
  skippedProjects: skipped,
});

const reportFile = path.join(out, 'launch-report.md');
fs.writeFileSync(reportFile, report);
console.log(`\nWrote ${reportFile}`);
process.exit(mainStatus !== 0 || auditStatus !== 0 || skipped.length ? 1 : 0);
