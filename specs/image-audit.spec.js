import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../lib/test.js';
import { pages, environment } from '../lib/suite.js';
import { stabilize } from '../lib/stabilize.js';
import { reportDir } from '../lib/environment.js';
import { CHROMIUM_PROJECTS } from '../lib/projects.js';

// Image-size audit. On-demand (@audit, excluded from the normal run). For each
// page on the 3 Chromium viewports, measures every <img>, records images served
// >= REPORT_RATIO wider than needed to report/<env>/image-audit/data/<project>__<slug>.json,
// and fails the page if any image is egregiously oversized. The orchestrator
// (image-audit.js) aggregates the JSON into report/<env>/image-audit/report.md.
//
// srcset selection is per viewport x DPR but engine-independent, so this runs
// only the Chromium projects (one per distinct viewport/DPR).
const REPORT_RATIO = 2;                 // report when naturalWidth/neededWidth >= this
const FAIL_RATIO = 3;                   // egregious when ratio >= this ...
const FAIL_WASTED_BYTES = 150 * 1024;   // ... AND at least this many wasted bytes

const DATA_DIR = path.join(reportDir(environment.name), 'image-audit', 'data');

for (const pageDef of pages) {
  test(`image audit: ${pageDef.label} @audit`, async ({ page }, testInfo) => {
    test.skip(!CHROMIUM_PROJECTS.includes(testInfo.project.name), 'image audit runs on Chromium viewports only');

    // Capture each image's transferred size from its response body, keyed by
    // file name. content-length is often absent and resource timing reports 0,
    // so the body length is the reliable figure. File names, not URLs, because
    // a local host may redirect uploads to production, which changes the
    // response URL but not the file name.
    const bytesByFile = new Map();
    const bodyReads = [];
    page.on('response', res => {
      const type = res.headers()['content-type'] || '';
      if (!type.startsWith('image/')) return;
      const file = res.url().split('/').pop().split('?')[0];
      bodyReads.push(
        res.body().then(b => bytesByFile.set(file, b.length)).catch(() => {})
      );
    });

    await page.goto(pageDef.path, { waitUntil: 'load' });
    await stabilize(page);
    // Ensure every image body has been measured before correlating.
    await Promise.allSettled(bodyReads);

    const measured = await page.evaluate(() => {
      const dpr = window.devicePixelRatio || 1;

      function owningBlock(img) {
        const blocks = [];
        let el = img;
        while (el && el !== document.documentElement) {
          for (const c of el.classList) {
            if (c.startsWith('wp-block-')) blocks.push(c);
          }
          el = el.parentElement;
        }
        const custom = blocks.find(
          c => c.startsWith('wp-block-meomblocks-') || c.startsWith('wp-block-meom-')
        );
        if (custom) return custom;
        if (blocks.length) return blocks[0];
        return img.classList[0] ? `.${img.classList[0]}` : '(no class)';
      }

      return Array.from(document.images)
        .map(img => {
          const rect = img.getBoundingClientRect();
          const currentSrc = img.currentSrc || img.src;
          return {
            currentSrc,
            file: currentSrc ? currentSrc.split('/').pop().split('?')[0] : '',
            naturalWidth: img.naturalWidth,
            renderedWidth: rect.width,
            dpr,
            block: owningBlock(img),
          };
        })
        .filter(m => m.renderedWidth > 0 && m.naturalWidth > 0);
    });

    const oversized = [];
    const egregious = [];
    for (const m of measured) {
      const neededWidth = m.renderedWidth * m.dpr;
      if (neededWidth <= 0) continue;
      const ratio = m.naturalWidth / neededWidth;
      if (ratio < REPORT_RATIO) continue;

      // Authoritative byte size from the image's own response body (captured
      // above). 0 means the body couldn't be read; the row is still reported by
      // ratio, with wasted bytes shown as unknown.
      const bytes = bytesByFile.get(m.file) || 0;
      const wastedBytes = bytes
        ? Math.round(bytes * (1 - (neededWidth / m.naturalWidth) ** 2))
        : 0;

      const row = {
        page: pageDef.path,
        viewport: testInfo.project.name,
        block: m.block,
        file: m.file,
        displayedPx: Math.round(m.renderedWidth),
        neededPx: Math.round(neededWidth),
        downloadedPx: m.naturalWidth,
        downloadedBytes: bytes,
        ratio: Number(ratio.toFixed(2)),
        wastedBytes,
        egregious: ratio >= FAIL_RATIO && wastedBytes >= FAIL_WASTED_BYTES,
      };
      oversized.push(row);
      if (row.egregious) egregious.push(row);
    }

    // Write data BEFORE asserting, so a failing page still feeds the report.
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, `${testInfo.project.name}__${pageDef.slug}.json`),
      JSON.stringify(oversized, null, 2)
    );

    const summary = egregious
      .map(
        r =>
          `  ${r.block} ${r.file}: ${r.downloadedPx}px for ~${r.neededPx}px needed ` +
          `(${r.ratio}x, ~${Math.round(r.wastedBytes / 1024)}KB wasted)`
      )
      .join('\n');
    expect(
      egregious,
      `${pageDef.path} (${testInfo.project.name}) has egregiously oversized images:\n${summary}`
    ).toHaveLength(0);
  });
}
