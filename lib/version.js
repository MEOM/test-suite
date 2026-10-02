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
