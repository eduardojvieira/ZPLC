const ELECTRON_VERSION = '43.4.1';
const BOOTSTRAP = 'Electron sandboxed_renderer.bundle.js script failed to run';
const TYPE_ERROR = "TypeError: Cannot destructure property 'preloadScripts' of 'binding.startupData' as it is null.";

export function isElectronHeadlessBootstrapQuarantine(version: string, details: readonly string[], frameId: string): boolean {
  if (details.length === 0) return true;
  if (version !== ELECTRON_VERSION || details.length !== 2) return false;
  try {
    const parsed = details.map((detail) => JSON.parse(detail) as { method?: string; human?: string; context?: string; stack?: Array<{ url?: string }> });
    const contexts = parsed.map((detail) => JSON.parse(detail.context ?? '{}') as { id?: number; name?: string; isDefault?: boolean; type?: string; frameId?: string });
    if (parsed[0].human !== BOOTSTRAP || parsed[1].human?.split('\n', 1)[0] !== TYPE_ERROR || contexts[0].id !== contexts[1].id) return false;
    return parsed.every((detail) => detail.method === 'Runtime.consoleAPICalled' && detail.stack?.length && detail.stack.every((frame) => frame.url === 'node:electron/js2c/sandbox_bundle'))
      && contexts.every((context) => Number.isInteger(context.id) && context.name === 'Electron Isolated Context' && context.isDefault === false && context.type === 'isolated' && context.frameId === frameId);
  } catch { return false; }
}
