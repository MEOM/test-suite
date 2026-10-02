import { config, environment } from './suite.js';

// Prints once per run which site and environment are being tested.
export default function globalSetup() {
  const login = environment.auth ? `, login: ${environment.auth}` : '';
  console.log(`\n${config.name}: environment "${environment.name}" at ${environment.baseURL}${login}\n`);
}
