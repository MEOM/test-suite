// Loads, defaults and validates the project's tests.config.mjs. Every spec and
// script reads site-specific values from here, never from its own constants.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const SUITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FEATURE_KEYS = ['navigation', 'skipLink', 'stickyHeader', 'accordion', 'form'];

// kala-stack markup. Override per site under `selectors` only when it differs.
export const DEFAULT_SELECTORS = {
  nav: '.js-site-nav',
  navToggle: '.js-site-nav-toggle',
  navOpenClass: 'is-opened',
  header: '.js-site-header',
  skipLinkTarget: '#content',
  accordionHeader: '.accordion__header',
};

export const NOT_FOUND_PAGE = { slug: '404', path: '/launch-check-404/', label: '404' };

const TOP_LEVEL_KEYS = ['name', 'environments', 'pages', 'features', 'exceptions', 'selectors', 'blockAnalytics'];
const AUTH_TYPES = ['basic', 'wp-login'];
const EXCEPTION_KINDS = ['notFound', 'consoleErrors', 'blockHosts'];

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid launch check config:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim() !== '';
const isPath = v => typeof v === 'string' && v.startsWith('/');

const FEATURE_RULES = {
  navigation: v =>
    v === false || (isObject(v) && isNonEmptyString(v.desktopLink))
      ? null
      : 'must be false or { desktopLink: "<text of a top-level link without a sub-menu>" }',
  skipLink: v => (typeof v === 'boolean' ? null : 'must be true or false'),
  stickyHeader: v => (typeof v === 'boolean' ? null : 'must be true or false'),
  accordion: v =>
    v === false || (isObject(v) && isPath(v.path)) ? null : 'must be false or { path: "/page-with-accordion/" }',
  form: v =>
    v === false || (isObject(v) && isPath(v.path) && Number.isInteger(v.gravityFormId) && v.gravityFormId > 0)
      ? null
      : 'must be false or { path: "/page-with-form/", gravityFormId: <number> }',
};

export function resolveConfigPath(env = process.env, cwd = process.cwd()) {
  return env.SUITE_CONFIG ? path.resolve(env.SUITE_CONFIG) : path.resolve(cwd, 'tests.config.mjs');
}

export function localBaseURLFromYaml(projectRoot) {
  const file = path.join(projectRoot, 'config.yml');
  if (!fs.existsSync(file)) return null;
  const domain = parseYaml(fs.readFileSync(file, 'utf8'))?.development?.domains?.[0];
  return domain ? `https://${domain}` : null;
}

function normalizeEnvironments(raw, projectRoot, problems) {
  const environments = {};
  if (!isObject(raw)) {
    problems.push('environments must be an object with at least a "local" entry');
    return environments;
  }
  if (!('local' in raw)) problems.push('environments.local is required');
  for (const [name, def] of Object.entries(raw)) {
    if (!isObject(def)) {
      problems.push(`environments.${name} must be an object`);
      continue;
    }
    let baseURL = def.baseURL;
    if (baseURL === undefined && name === 'local') baseURL = localBaseURLFromYaml(projectRoot);
    if (typeof baseURL !== 'string' || !/^https?:\/\//.test(baseURL)) {
      problems.push(
        name === 'local' && def.baseURL === undefined
          ? 'environments.local.baseURL is missing and config.yml has no development.domains[0]'
          : `environments.${name}.baseURL must be an http(s) URL`
      );
    }
    if (def.auth !== undefined && !AUTH_TYPES.includes(def.auth)) {
      problems.push(`environments.${name}.auth must be one of: ${AUTH_TYPES.join(', ')}`);
    }
    environments[name] = {
      baseURL: typeof baseURL === 'string' ? baseURL.replace(/\/+$/, '') : null,
      auth: def.auth ?? null,
    };
  }
  return environments;
}

function normalizePages(raw, problems) {
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push('pages must be a non-empty array of { slug, path, label }');
    return [];
  }
  const pages = [];
  const seen = new Set();
  raw.forEach((p, i) => {
    const where = `pages[${i}]`;
    if (!isObject(p)) {
      problems.push(`${where} must be an object`);
      return;
    }
    for (const key of ['slug', 'path', 'label']) {
      if (!isNonEmptyString(p[key])) problems.push(`${where}.${key} must be a non-empty string`);
    }
    if (typeof p.path === 'string' && !p.path.startsWith('/')) problems.push(`${where}.path must start with "/"`);
    if (p.slug === NOT_FOUND_PAGE.slug) {
      problems.push(`${where}: slug "404" is reserved; the 404 page is added automatically`);
    }
    if (seen.has(p.slug)) problems.push(`${where}: duplicate slug "${p.slug}"`);
    seen.add(p.slug);
    pages.push({ slug: p.slug, path: p.path, label: p.label });
  });
  pages.push({ ...NOT_FOUND_PAGE });
  return pages;
}

function normalizeFeatures(raw, problems) {
  const features = {};
  if (!isObject(raw)) {
    problems.push(`features must be an object with keys: ${FEATURE_KEYS.join(', ')}`);
    return features;
  }
  for (const key of Object.keys(raw)) {
    if (!FEATURE_KEYS.includes(key)) {
      problems.push(`features.${key} is not a known feature (known: ${FEATURE_KEYS.join(', ')})`);
    }
  }
  for (const key of FEATURE_KEYS) {
    if (!(key in raw)) {
      problems.push(`features.${key} is missing; set it, or set it to false if the site does not have it`);
      continue;
    }
    const problem = FEATURE_RULES[key](raw[key]);
    if (problem) problems.push(`features.${key} ${problem}`);
    features[key] = raw[key];
  }
  return features;
}

function normalizeExceptions(raw, environments, problems) {
  const exceptions = { notFound: [], consoleErrors: [], blockHosts: [] };
  if (raw === undefined) return exceptions;
  if (!isObject(raw)) {
    problems.push('exceptions must be an object');
    return exceptions;
  }
  for (const key of Object.keys(raw)) {
    if (!EXCEPTION_KINDS.includes(key)) {
      problems.push(`exceptions.${key} is not known (known: ${EXCEPTION_KINDS.join(', ')})`);
    }
  }
  for (const kind of EXCEPTION_KINDS) {
    const list = raw[kind] ?? [];
    if (!Array.isArray(list)) {
      problems.push(`exceptions.${kind} must be an array`);
      continue;
    }
    list.forEach((e, i) => {
      const where = `exceptions.${kind}[${i}]`;
      if (!isObject(e)) {
        problems.push(`${where} must be { pattern, reason, env? }`);
        return;
      }
      if (!(e.pattern instanceof RegExp)) problems.push(`${where}.pattern must be a RegExp`);
      if (!isNonEmptyString(e.reason)) {
        problems.push(`${where}.reason is required: say why this exception is justified`);
      }
      if (e.env !== undefined && (!Array.isArray(e.env) || e.env.some(n => !(n in environments)))) {
        problems.push(`${where}.env must list configured environment names`);
      }
      exceptions[kind].push({ pattern: e.pattern, reason: e.reason, env: e.env ?? null });
    });
  }
  return exceptions;
}

function normalizeSelectors(raw, problems) {
  const selectors = { ...DEFAULT_SELECTORS };
  if (raw === undefined) return selectors;
  if (!isObject(raw)) {
    problems.push('selectors must be an object');
    return selectors;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULT_SELECTORS)) {
      problems.push(`selectors.${key} is not known (known: ${Object.keys(DEFAULT_SELECTORS).join(', ')})`);
    } else if (!isNonEmptyString(value)) {
      problems.push(`selectors.${key} must be a non-empty string`);
    } else if (key === 'skipLinkTarget' && !/^#[\w-]+$/.test(value)) {
      problems.push('selectors.skipLinkTarget must be an id selector such as "#content"');
    } else {
      selectors[key] = value;
    }
  }
  return selectors;
}

export function normalizeConfig(raw, { projectRoot }) {
  if (!isObject(raw)) throw new ConfigError(['tests.config.mjs must export a default object']);
  const problems = [];

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      problems.push(`${key} is not a known config key (known: ${TOP_LEVEL_KEYS.join(', ')})`);
    }
  }
  if (!isNonEmptyString(raw.name)) problems.push('name must be a non-empty string');
  if (raw.blockAnalytics !== undefined && typeof raw.blockAnalytics !== 'boolean') {
    problems.push('blockAnalytics must be true or false');
  }

  const environments = normalizeEnvironments(raw.environments, projectRoot, problems);
  const config = {
    name: raw.name,
    projectRoot,
    environments,
    pages: normalizePages(raw.pages, problems),
    features: normalizeFeatures(raw.features, problems),
    exceptions: normalizeExceptions(raw.exceptions, environments, problems),
    selectors: normalizeSelectors(raw.selectors, problems),
    blockAnalytics: raw.blockAnalytics ?? true,
  };

  if (problems.length) throw new ConfigError(problems);
  return config;
}

// The suite folder (dir) holds the config; the project root, where config.yml
// lives, is its parent.
export async function loadConfig(env = process.env) {
  const file = resolveConfigPath(env);
  if (!fs.existsSync(file)) {
    throw new ConfigError([
      `no config file at ${file}. Run from the project's test-suite/ folder. If the config does not exist yet, ` +
        'ask Claude: "Configure the test suite for this project. Follow test-suite/AGENTS.md."',
    ]);
  }
  const mod = await import(pathToFileURL(file).href);
  const dir = path.dirname(file);
  return { ...normalizeConfig(mod.default, { projectRoot: path.dirname(dir) }), dir, file };
}
