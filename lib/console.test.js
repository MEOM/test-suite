import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIgnorableConsoleError } from './console.js';

const opts = { blockedPatterns: [/cookiebot\.com/], allowedPatterns: [/ResizeObserver loop/] };

test('404 resource lines are ignored (page-load tracks 404s by URL)', () => {
  assert.ok(isIgnorableConsoleError({ text: 'Failed to load resource: the server responded with a status of 404 (Not Found)', url: 'https://s/x.png' }, opts));
});

test('failed loads of blocked requests are ignored', () => {
  assert.ok(isIgnorableConsoleError({ text: 'Failed to load resource: net::ERR_FAILED', url: 'https://consent.cookiebot.com/uc.js' }, opts));
});

test('failed loads of other requests are real errors', () => {
  assert.ok(!isIgnorableConsoleError({ text: 'Failed to load resource: net::ERR_FAILED', url: 'https://s/app.js' }, opts));
});

test('script errors are real unless an exception allows them', () => {
  assert.ok(!isIgnorableConsoleError({ text: 'Uncaught TypeError: x is undefined', url: 'https://s/app.js' }, opts));
  assert.ok(isIgnorableConsoleError({ text: 'ResizeObserver loop limit exceeded', url: '' }, opts));
});
