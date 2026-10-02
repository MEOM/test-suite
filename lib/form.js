// Fill values and payload matching for the Gravity Forms check.
export const FILL_VALUES = {
  text: 'Playwright',
  search: 'Playwright',
  email: 'test@example.com',
  tel: '+358000000000',
  url: 'https://example.com',
  number: '1',
  textarea: 'automated check',
};

// Returns the value to type into a field, or null for field types the check
// leaves alone (date pickers, files, colours and the like).
export function valueForField(tag, type) {
  if (tag === 'textarea') return FILL_VALUES.textarea;
  return FILL_VALUES[type || 'text'] ?? null;
}

// Gravity Forms posts multipart/form-data, but a browser or plugin may send
// url-encoded data, where "@", "+" and spaces are encoded.
export function payloadHasValue(body, value) {
  const encoded = encodeURIComponent(value);
  return [value, encoded, encoded.replace(/%20/g, '+')].some(v => body.includes(v));
}

export function hasGformSubmit(body, formId) {
  return new RegExp(`name="gform_submit"\\r?\\n\\r?\\n${formId}\\r?\\n|(^|&)gform_submit=${formId}(&|$)`).test(body);
}
