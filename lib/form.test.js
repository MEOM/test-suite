import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILL_VALUES, valueForField, payloadHasValue, hasGformSubmit } from './form.js';

const multipart = [
  '------WebKitFormBoundaryX',
  'Content-Disposition: form-data; name="input_2"',
  '',
  'test@example.com',
  '------WebKitFormBoundaryX',
  'Content-Disposition: form-data; name="gform_submit"',
  '',
  '1',
  '------WebKitFormBoundaryX--',
].join('\r\n');

const urlencoded = 'input_2=test%40example.com&input_3=%2B358000000000&input_4=automated+check&gform_submit=1';

test('values are chosen by field type', () => {
  assert.equal(valueForField('textarea', ''), FILL_VALUES.textarea);
  assert.equal(valueForField('input', 'email'), 'test@example.com');
  assert.equal(valueForField('input', ''), FILL_VALUES.text);
  assert.equal(valueForField('input', 'date'), null);
});

test('payloadHasValue finds values in multipart and url-encoded bodies', () => {
  assert.ok(payloadHasValue(multipart, 'test@example.com'));
  assert.ok(payloadHasValue(urlencoded, 'test@example.com'));
  assert.ok(payloadHasValue(urlencoded, '+358000000000'));
  assert.ok(payloadHasValue(urlencoded, 'automated check'));
  assert.ok(!payloadHasValue(urlencoded, 'Playwright'));
});

test('hasGformSubmit matches the form id exactly', () => {
  assert.ok(hasGformSubmit(multipart, 1));
  assert.ok(hasGformSubmit(urlencoded, 1));
  assert.ok(!hasGformSubmit(multipart, 12));
  assert.ok(!hasGformSubmit('gform_submit=12', 1));
});
