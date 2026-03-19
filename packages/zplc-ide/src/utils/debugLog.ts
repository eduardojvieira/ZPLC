const debugLoggingEnabled = (() => {
  if (typeof globalThis !== 'undefined' && '__ZPLC_DEBUG_LOGS__' in globalThis) {
    return Boolean((globalThis as Record<string, unknown>).__ZPLC_DEBUG_LOGS__);
  }

  if (typeof window !== 'undefined') {
    const value = window.localStorage.getItem('zplc:debug-logs');
    return value === '1' || value === 'true';
  }

  return false;
})();

export function debugLog(...args: unknown[]): void {
  if (!debugLoggingEnabled) {
    return;
  }

  console.log(...args);
}
