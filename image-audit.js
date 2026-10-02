// Image-size audit orchestrator + report generator. One command:
//   1. clean report/<env>/image-audit/data/
//   2. run the @audit spec on the 3 Chromium viewports (capture exit code)
//   3. aggregate per-page JSON into report/<env>/image-audit/report.md (ranked, with
//      fix suggestions)
//   4. exit with the Playwright exit code, so an egregious offender still fails
//      `npm run audit:images` while the report is still produced.
//
// Extra CLI args are forwarded to the Playwright run, e.g.
//   npm run audit:images -- --project=chrome-desktop
//
// Applying fixes (register add_image_size, swap the block/template call,
// regenerate thumbnails) is a SEPARATE human-in-the-loop step done from the
// report — never by this tool.
import fs from 'node:fs';
import path from 'node:path';
import { loadSuiteOrExit, runPlaywrightTest } from './lib/cli.js';
import { reportDir } from './lib/environment.js';
import { CHROMIUM_PROJECTS } from './lib/projects.js';
import { readAuditRows } from './lib/audit-rows.js';

const { environment } = await loadSuiteOrExit();
const AUDIT_DIR = path.join(reportDir(environment.name), 'image-audit');
const DATA_DIR = path.join(AUDIT_DIR, 'data');
const REPORT = path.join(AUDIT_DIR, 'report.md');

const passthrough = process.argv.slice(2);
const projectFlags = passthrough.some(a => a.startsWith('--project'))
  ? []
  : CHROMIUM_PROJECTS.map(p => `--project=${p}`);

// 1. Clean prior data so a stale run cannot pollute the report.
fs.rmSync(DATA_DIR, { recursive: true, force: true });

// 2. Run the audit spec; an egregious finding exits non-zero but the report is
//    still written.
const exitCode = runPlaywrightTest(['--grep', '@audit', ...projectFlags, ...passthrough], { RUN_LABEL: 'audit' });

// 3. Aggregate JSON into the ranked report.
const rows = readAuditRows(DATA_DIR) ?? [];

const kb = n => `${Math.round(n / 1024)} KB`;
const totalWasted = rows.reduce((s, r) => s + r.wastedBytes, 0);

// Suggested width: the largest needed px for this block+image across viewports,
// rounded up to the next 64px step — a sensible add_image_size candidate.
function suggestWidth(block, file) {
  const peers = rows.filter(r => r.block === block && r.file === file);
  const maxNeeded = Math.max(...peers.map(r => r.neededPx));
  return Math.ceil(maxNeeded / 64) * 64;
}

function blockToFile(block) {
  if (block.startsWith('wp-block-meomblocks-')) {
    return `src/blocks/${block.replace('wp-block-meomblocks-', '')}/render.php`;
  }
  if (block.startsWith('wp-block-meom-')) {
    return `src/blocks/${block.replace('wp-block-meom-', '')}/render.php`;
  }
  return block;
}

let body;
if (!rows.length) {
  body = '\nNo images flagged: every measured image is within the report threshold.\n';
} else {
  const header =
    `\n**${rows.length}** oversized image occurrence(s) across the 3 Chromium viewports; ` +
    `est. total wasted **${kb(totalWasted)}**.\n\n` +
    `| Owning block | Image | Page | Viewport | Displayed px | Needed px | Downloaded px | Downloaded | Ratio | Est. wasted | Suggestion |\n` +
    `|---|---|---|---|--:|--:|--:|--:|--:|--:|---|\n`;
  const lines = rows.map(r => {
    const target = suggestWidth(r.block, r.file);
    const suggestion = `Register ~${target}px size; used in \`${blockToFile(r.block)}\``;
    return (
      `| ${r.block} | ${r.file} | ${r.page} | ${r.viewport} | ${r.displayedPx} | ` +
      `${r.neededPx} | ${r.downloadedPx} | ${r.downloadedBytes ? kb(r.downloadedBytes) : '?'} | ` +
      `${r.ratio}x | ${r.wastedBytes ? kb(r.wastedBytes) : '?'} | ${suggestion} |`
    );
  });
  body = header + lines.join('\n') + '\n';
}

const md =
  `# Image-size audit report\n${body}\n` +
  `> Detector only. Review, accept the rows you want, then apply fixes separately ` +
  `(register add_image_size, swap the block/template call, regenerate thumbnails).\n`;

fs.mkdirSync(AUDIT_DIR, { recursive: true });
fs.writeFileSync(REPORT, md);
console.log(`\nWrote ${REPORT} — ${rows.length} flagged, est. ${kb(totalWasted)} wasted.`);

process.exit(exitCode);
