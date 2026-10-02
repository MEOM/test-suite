// Adds the suite to a project (init) and keeps the developer docs in the
// project's test-suite/ folder in step with the installed version (sync-docs).
import fs from 'node:fs';
import path from 'node:path';
import { SUITE_DIR } from './config.js';

export const FOLDER = 'test-suite';
export const DOCS = ['README.md', 'AGENTS.md'];
export const REPO = 'https://github.com/MEOM/test-suite';
export const GITIGNORE = ['node_modules/', 'report/', '.auth/', '.env.tests', ''].join('\n');

export class InitError extends Error {
  name = 'InitError';
}

export const suitePackage = () => JSON.parse(fs.readFileSync(path.join(SUITE_DIR, 'package.json'), 'utf8'));
export const defaultSource = version => `git+${REPO}.git#v${version}`;

export function projectPackageJson(name, source) {
  return {
    name: `${name}-test-suite`,
    private: true,
    scripts: {
      postinstall: 'test-suite sync-docs',
      'launch-check': 'test-suite run',
      'check-config': 'test-suite config',
      test: 'test-suite test',
      'test:visual': 'test-suite visual',
      'audit:images': 'test-suite audit',
      report: 'test-suite report',
      'install-browsers': 'test-suite install-browsers',
    },
    devDependencies: { '@meom/test-suite': source },
  };
}

// The root package.json must not list the folder in workspaces: the root
// npm install, and the Bitbucket pipeline with it, would install the suite.
function listsFolderInWorkspaces(projectRoot) {
  const file = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(file)) return false;
  const { workspaces } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(workspaces) ? workspaces : workspaces?.packages ?? [];
  return list.some(w => path.normalize(w).replace(/\/$/, '') === FOLDER);
}

// Writes <projectRoot>/test-suite/package.json and .gitignore. Refuses, without
// writing anything, when the folder exists. Returns warnings for the caller.
export function initProject({ projectRoot, source }) {
  const dir = path.join(projectRoot, FOLDER);
  if (fs.existsSync(dir)) throw new InitError(`${dir} already exists; nothing was changed.`);
  const warnings = [];
  if (!fs.existsSync(path.join(projectRoot, 'config.yml'))) {
    warnings.push(`no config.yml in ${projectRoot}; run init from the project root`);
  }
  if (listsFolderInWorkspaces(projectRoot)) {
    warnings.push(`the root package.json lists "${FOLDER}" in workspaces; remove it, or the root npm install (and CI) installs the suite`);
  }
  const name = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(projectPackageJson(name, source), null, 2)}\n`);
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE);
  return { dir, warnings };
}

// Copies the package's README.md and AGENTS.md into the suite folder. The
// copies are committed, so a version bump shows its doc changes.
export function syncDocs({ folder, version }) {
  if (fs.realpathSync(folder) === fs.realpathSync(SUITE_DIR)) {
    throw new Error('sync-docs copies the docs into a project; it cannot run in the package itself');
  }
  const header =
    `<!-- Copied from @meom/test-suite ${version} by npm install. Edits here are overwritten; ` +
    `change the original in ${REPO}. -->\n\n`;
  return DOCS.map(name => {
    const target = path.join(folder, name);
    fs.writeFileSync(target, header + fs.readFileSync(path.join(SUITE_DIR, name), 'utf8'));
    return target;
  });
}
