// Resolves which environment a run targets (TEST_ENV), the exceptions that
// apply there, login credentials and where the run writes its output (the suite folder).
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ConfigError, resolveConfigPath } from './config.js';

// Analytics collection endpoints. Blocking them keeps test runs out of the
// site's visitor numbers; the analytics scripts themselves still load, so any
// error they throw is still caught.
export const ANALYTICS_PATTERNS = [
  /google-analytics\.com\/(g\/|j\/)?collect/,
  /analytics\.google\.com\/g\/collect/,
];

export function selectEnvironment(config, env = process.env) {
  const name = env.TEST_ENV || 'local';
  const def = config.environments[name];
  if (!def) {
    throw new ConfigError([
      `TEST_ENV="${name}" is not configured (configured: ${Object.keys(config.environments).join(', ')})`,
    ]);
  }
  return { name, baseURL: def.baseURL, auth: def.auth };
}

export function exceptionsFor(config, environmentName) {
  const applies = e => !e.env || e.env.includes(environmentName);
  return Object.fromEntries(
    Object.entries(config.exceptions).map(([kind, list]) => [kind, list.filter(applies)])
  );
}

export function readCredentials(config, environment, env = process.env) {
  if (!environment.auth) return null;
  const file = path.join(config.dir, '.env.tests');
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  const username = env.TEST_AUTH_USER || fromFile.TEST_AUTH_USER;
  const password = env.TEST_AUTH_PASSWORD || fromFile.TEST_AUTH_PASSWORD;
  if (!username || !password) {
    throw new ConfigError([
      `environment "${environment.name}" uses auth "${environment.auth}" but TEST_AUTH_USER and ` +
        `TEST_AUTH_PASSWORD are not set in ${file} or the shell`,
    ]);
  }
  return { username, password };
}

// The suite folder is the directory that holds tests.config.mjs. Every run
// writes there, never into the package directory.
export const suiteFolder = (env = process.env) => path.dirname(resolveConfigPath(env));
export const reportDir = (envName, dir = suiteFolder()) => path.join(dir, 'report', envName);
export const runDir = (envName, label, dir = suiteFolder()) => path.join(reportDir(envName, dir), 'runs', label);
export const authStatePath = (envName, dir = suiteFolder()) => path.join(dir, '.auth', `${envName}.json`);
