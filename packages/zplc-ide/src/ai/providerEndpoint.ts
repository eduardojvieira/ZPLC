/**
 * The endpoints the assistant may talk to (AIX-006, AI-17): a hosted provider over https, or a model on this machine over http at
 * exactly `localhost`, `127.0.0.1` or `[::1]`. Anything else is refused: another loopback address, a name that only starts like
 * `localhost`, any other IPv6 form, a credential, a query or a fragment. The URL parser has already turned `127.1` or
 * `[0:0:0:0:0:0:0:1]` into the canonical host, so the comparison below is on that form.
 *
 * Pure module with no import, so the main process, the IPC validator and the tests share one rule.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The endpoint without a trailing slash, or null when it is not one the assistant may use. */
export function canonicalAiEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
  try {
    const url = new URL(value);
    const loopback = LOOPBACK_HOSTS.has(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash)
      return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** True for an endpoint on this machine, which needs no key. */
export function isLoopbackAiEndpoint(endpoint: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}
