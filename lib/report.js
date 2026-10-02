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

export const NOT_RUN_OPTIONS =
  'The result covers only the browsers that ran. To complete it, run `npm run launch-check` in your own terminal app (Terminal or iTerm). ' +
  'If the reason says the browser executable does not exist, run `npm run install-browsers` first. ' +
  'If the browser fails in your terminal too, see "Browsers that cannot start" in README.md.';

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

function notRunLines(skipped) {
  if (!skipped.length) return [];
  return [
    '',
    '**Not run on this machine:**',
    '',
    ...skipped.map(s => `- ${s.project} (${s.engine}): ${s.reason}`),
    '',
    NOT_RUN_OPTIONS,
  ];
}

function resultSection(tests, egregiousCount, auditRan, auditExitCode, skipped) {
  if (!tests) {
    return [
      '**Automated checks: FAILED**',
      '',
      'No test results found: the functional run did not complete. See the terminal output.',
      ...notRunLines(skipped),
    ].join('\n');
  }
  const count = outcome => tests.filter(t => t.outcome === outcome).length;
  const failed = count('unexpected');
  const passed = !failed && egregiousCount === 0 && auditRan && auditExitCode === 0;
  const verdict = !passed ? 'FAILED' : skipped.length ? 'INCOMPLETE' : 'PASSED';
  const lines = [
    `**Automated checks: ${verdict}** ` +
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
  lines.push(...notRunLines(skipped));
  return lines.join('\n');
}

function failuresSection(tests) {
  const failures = (tests ?? []).filter(t => t.outcome === 'unexpected');
  if (!failures.length) return 'No failures.';
  return failures
    .map(t => {
      const errorLines = (t.error ?? 'No error message recorded.').split('\n');
      const isTruncated = errorLines.length > 15;
      const message = errorLines.slice(0, 15).join('\n');
      const truncatedLine = isTruncated ? '\n... (truncated, see the trace)' : '';
      const trace = t.trace ? `\nTrace: \`${t.trace}\`` : '';
      return `### ${t.check}: ${t.title} (${t.project})\n\n\`\`\`\n${message}${truncatedLine}\n\`\`\`${trace}`;
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

function auditSection(rows, auditExitCode) {
  if (rows === null) return 'Image audit did not run.';
  const egregiousCount = rows.filter(r => r.egregious).length;
  const showAuditFailureWarning = auditExitCode !== 0 && egregiousCount === 0;
  const lines = [];
  if (showAuditFailureWarning) {
    lines.push(`The image audit run failed (exit ${auditExitCode}), so some pages may be missing below. See \`runs/audit/playwright-report\`.`, '');
  }
  if (!rows.length) {
    lines.push('No oversized images. Full report: `image-audit/report.md`.');
    return lines.join('\n');
  }
  const total = rows.reduce((s, r) => s + r.wastedBytes, 0);
  const top = rows
    .slice(0, 10)
    .map(r => `| ${r.block} | ${r.file} | ${r.page} | ${r.viewport} | ${r.ratio}x | ${r.wastedBytes ? kb(r.wastedBytes) : '?'} |`);
  lines.push(
    `${rows.length} oversized image occurrence(s), est. ${kb(total)} wasted, ${egregiousCount} egregious. ` +
      'Full report: `image-audit/report.md`.',
    '',
    '| Owning block | Image | Page | Viewport | Ratio | Est. wasted |',
    '|---|---|---|---|--:|--:|',
    ...top,
  );
  return lines.join('\n');
}

export function renderLaunchReport({ config, environment, exceptions, generatedAt, suiteVersion, runBy, tests, auditRows, auditExitCode, skippedProjects = [] }) {
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
    resultSection(tests, egregiousCount, auditRows !== null, auditExitCode, skippedProjects),
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
    auditSection(auditRows, auditExitCode),
    '',
    '## Visual review',
    '',
    'Open `screenshots/index.html` and check every page on every device:',
    '',
    ...VISUAL_REVIEW.map(item => `- [ ] ${item}`),
    '',
  ].join('\n');
}
