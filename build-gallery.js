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

const slugs = fs.readdirSync(SCREENSHOTS_DIR).filter(name =>
  fs.statSync(path.join(SCREENSHOTS_DIR, name)).isDirectory()
);

const rows = slugs.map(slug => {
  const cells = PROJECTS.map(project => {
    const file = `${slug}/${project}.png`;
    const exists = fs.existsSync(path.join(SCREENSHOTS_DIR, file));
    return exists
      ? `<td><a href="${file}" target="_blank"><img loading="lazy" src="${file}" alt="${slug} on ${project}"></a></td>`
      : `<td class="missing">missing</td>`;
  }).join('');
  return `<tr><th>${slug}</th>${cells}</tr>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${config.name}: visual review (${environment.name})</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 0; padding: 16px; background: #fafafa; }
  h1 { margin: 0 0 12px; }
  .meta { color: #666; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; vertical-align: top; padding: 4px; background: #fff; }
  th { position: sticky; top: 0; background: #f4f4f4; z-index: 1; }
  th:first-child { left: 0; z-index: 2; min-width: 140px; text-align: left; }
  img { max-width: 220px; height: auto; display: block; }
  td.missing { color: #c00; text-align: center; padding: 24px; background: #ffeaea; }
</style>
</head>
<body>
<h1>${config.name}: visual review (${environment.name})</h1>
<p class="meta">${environment.baseURL}. Generated ${new Date().toISOString()}. Click an image for full size.</p>
<table>
  <thead>
    <tr>
      <th>Page</th>
      ${PROJECTS.map(p => `<th>${p}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</body>
</html>`;

const outFile = path.join(SCREENSHOTS_DIR, 'index.html');
fs.writeFileSync(outFile, html);
console.log(`Wrote ${outFile} — ${slugs.length} pages × ${PROJECTS.length} projects`);
