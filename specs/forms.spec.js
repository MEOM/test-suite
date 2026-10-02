import { test, expect } from '../lib/test.js';
import { features } from '../lib/suite.js';
import { valueForField, payloadHasValue, hasGformSubmit } from '../lib/form.js';

const form = features.form;
const SKIP_TYPES = ['submit', 'button', 'hidden', 'file', 'image', 'reset'];

// Fills every visible field of the configured Gravity Form by type, submits it
// and checks the payload. Every non-GET request from the page is answered in
// the browser with an empty 200, so nothing reaches any server in any
// environment. The success message is not checked: the stubbed response has
// none.
test('form submits the expected payload (intercepted, never delivered)', async ({ page }) => {
  test.skip(!form, 'form: not on this site');

  const bodies = [];
  await page.route('**/*', async route => {
    const method = route.request().method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await route.fallback();
      return;
    }
    bodies.push(route.request().postData() || '');
    await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
  });

  await page.goto(form.path);
  const root = page.locator(`#gform_${form.gravityFormId}`);
  await expect(root, `#gform_${form.gravityFormId} not found on ${form.path}`).toBeVisible();

  const typed = [];
  const checkedGroups = new Set();
  const fields = root.locator('input:visible, textarea:visible, select:visible');
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const { tag, type, name } = await field.evaluate(el => ({
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
    }));

    if (tag === 'select') {
      const option = await field.evaluate(el => [...el.options].find(o => o.value)?.value ?? null);
      if (option !== null) await field.selectOption(option);
      continue;
    }
    if (SKIP_TYPES.includes(type)) continue;
    if (type === 'checkbox' || type === 'radio') {
      // One option per field: Gravity Forms names checkbox inputs input_5.1,
      // input_5.2 and so on, radios share one name.
      const group = `${type}:${name.replace(/\.\d+$/, '')}`;
      if (!checkedGroups.has(group)) {
        await field.check();
        checkedGroups.add(group);
      }
      continue;
    }
    const value = valueForField(tag, type);
    if (value === null) continue;
    await field.fill(value);
    typed.push(value);
  }

  await root.locator('input[type="submit"], button[type="submit"]').first().click();

  await expect
    .poll(() => bodies.find(b => hasGformSubmit(b, form.gravityFormId)), {
      timeout: 10_000,
      message: 'the form never posted a Gravity Forms submission',
    })
    .toBeTruthy();

  const body = bodies.find(b => hasGformSubmit(b, form.gravityFormId));
  for (const value of typed) {
    expect(payloadHasValue(body, value), `typed value "${value}" missing from the submitted payload`).toBe(true);
  }
});
