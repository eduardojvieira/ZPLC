/**
 * The content security policy of the web build (REL-037). It is a static site: the page and its workers come from its own
 * origin, nothing is fetched from elsewhere, the browser runtime is WebAssembly compiled from the bundle, and no plugin,
 * frame or form is allowed. Inline styles stay because the editor and the component kit set style attributes.
 */
export function webContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}
