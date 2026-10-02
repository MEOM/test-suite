// The loaded, validated config for this run. playwright.config.js, every spec
// and every script import from here. Throws ConfigError on an invalid config.
import { loadConfig } from './config.js';
import { ANALYTICS_PATTERNS, exceptionsFor, readCredentials, selectEnvironment } from './environment.js';

export const config = await loadConfig();
export const environment = selectEnvironment(config);
export const exceptions = exceptionsFor(config, environment.name);
export const credentials = readCredentials(config, environment);
export const { pages, features, selectors } = config;

// Requests aborted in every test: the project's blockHosts plus analytics.
export const blockedPatterns = [
  ...exceptions.blockHosts.map(e => e.pattern),
  ...(config.blockAnalytics ? ANALYTICS_PATTERNS : []),
];
