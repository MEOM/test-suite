// Finds the browser engines that cannot start on this machine before the main
// run, so launch-check skips their projects instead of waiting out a launch
// timeout in every test.
import { chromium, firefox, webkit } from '@playwright/test';
import { MATRIX } from './projects.js';
import { stripAnsi } from './report.js';

const ENGINES = { chromium, firefox, webkit };
export const PROBE_TIMEOUT = 15_000;

const defaultLaunch = (engine, options) => ENGINES[engine].launch(options);

export const engineOf = project => project.use.defaultBrowserType ?? 'chromium';

// The reason is the error's first line plus the browser's own [err] line that
// names the actual cause (the line that looks like a failure). Benign banner lines
// come first in real output, so a line that looks like a failure wins.
function launchFailure(err) {
  const lines = stripAnsi(String(err?.message ?? err)).split('\n').map(l => l.trim());
  const errLines = lines.filter(l => l.includes('[err]'));
  const detail = errLines.find(l => /not permitted|denied|failed|sandbox/i.test(l)) ?? errLines[0];
  return detail ? `${lines[0]} ${detail.replace(/^-?\s*\[pid=\d+\]\[err\]\s*/, '')}` : lines[0];
}

export async function probeEngines(matrix = MATRIX, launch = defaultLaunch) {
  const probe = {};
  for (const engine of new Set(matrix.map(engineOf))) {
    const { launchOptions } = matrix.find(p => engineOf(p) === engine).use;
    try {
      const browser = await launch(engine, { ...launchOptions, timeout: PROBE_TIMEOUT });
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
