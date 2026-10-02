import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTests, renderLaunchReport, stripAnsi, VISUAL_REVIEW, NOT_RUN_OPTIONS } from './report.js';

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
  auditExitCode: 0,
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
  assert.match(renderLaunchReport({ ...base, tests: [], auditRows: null, auditExitCode: 0 }), /Image audit did not run\./);
});

test('failed audit run with no egregious rows shows warning and fails verdict', () => {
  const passing = { suites: [{ title: 'a', file: 'overflow.spec.js', specs: [{ title: 't', file: 'overflow.spec.js', tests: [{ projectName: 'chrome-desktop', status: 'expected', results: [{ status: 'passed' }] }] }], suites: [] }] };
  const md = renderLaunchReport({ ...base, tests: collectTests(passing), auditRows: [], auditExitCode: 1 });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /The image audit run failed \(exit 1\)/);
  assert.match(md, /some pages may be missing below/);
});

test('failed audit run with egregious rows does not show the warning', () => {
  const row = { block: 'wp-block-image', file: 'a.jpg', page: '/', viewport: 'chrome-desktop', ratio: 4, wastedBytes: 300 * 1024, egregious: true };
  const passing = { suites: [] };
  const md = renderLaunchReport({ ...base, tests: collectTests(passing), auditRows: [row], auditExitCode: 1 });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.ok(!md.includes('The image audit run failed'));
  assert.match(md, /1 egregious/);
});

test('long error messages are truncated with a continuation note', () => {
  const longMessage = Array(20).fill('line').join('\n');
  const json20 = {
    suites: [{
      title: 'test.spec.js',
      file: 'test.spec.js',
      specs: [{
        title: 'long error',
        file: 'test.spec.js',
        tests: [{
          projectName: 'chrome-desktop',
          status: 'unexpected',
          results: [{
            status: 'failed',
            error: { message: longMessage },
            attachments: [{ name: 'trace', path: '/trace.zip' }],
          }],
        }],
      }],
      suites: [],
    }],
  };
  const md = renderLaunchReport({ ...base, tests: collectTests(json20) });
  assert.match(md, /\.\.\. \(truncated, see the trace\)/);
  const lines = md.split('\n');
  const failuresStart = lines.findIndex(l => l === '## Failures');
  const codeBlockContent = lines.slice(failuresStart + 5, failuresStart + 21).join('\n');
  assert.ok(codeBlockContent.includes('... (truncated, see the trace)'));
});

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

test('no test results with skipped projects is FAILED and still lists what did not run', () => {
  const skippedProjects = [{ project: 'firefox-desktop', engine: 'firefox', reason: 'x' }];
  const md = renderLaunchReport({ ...base, tests: null, skippedProjects });
  assert.match(md, /\*\*Automated checks: FAILED\*\*/);
  assert.match(md, /No test results found/);
  assert.match(md, /- firefox-desktop \(firefox\): x/);
  assert.ok(md.includes(NOT_RUN_OPTIONS));
});
