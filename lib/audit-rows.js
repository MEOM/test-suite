import fs from 'node:fs';
import path from 'node:path';

// Reads the image audit's per-page JSON files. Returns null when the audit has
// not run (no data directory), rows sorted by estimated waste otherwise.
export function readAuditRows(dataDir) {
  if (!fs.existsSync(dataDir)) return null;
  const rows = [];
  for (const file of fs.readdirSync(dataDir)) {
    if (file.endsWith('.json')) rows.push(...JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')));
  }
  return rows.sort((a, b) => b.wastedBytes - a.wastedBytes);
}
