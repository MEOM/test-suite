// Decides which console errors page-load ignores. Two browser lines are noise:
// "Failed to load resource" for a 404 (page-load tracks 404s precisely by URL)
// and for a request aborted on purpose (blockHosts, analytics). Anything else is
// a real error unless a consoleErrors exception with a reason allows it.
export function isIgnorableConsoleError({ text, url }, { blockedPatterns, allowedPatterns }) {
  if (/^Failed to load resource/i.test(text)) {
    if (/\b404\b/.test(text)) return true;
    if (url && blockedPatterns.some(re => re.test(url))) return true;
  }
  return allowedPatterns.some(re => re.test(text));
}
