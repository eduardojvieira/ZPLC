/**
 * @file wasmLoader.ts
 * @brief ZPLC WASM Module Loader
 *
 * Handles loading and initializing the Emscripten-compiled ZPLC module.
 * The module is compiled with MODULARIZE=1, so it exports a factory function
 * that must be called to create the actual module instance.
 */

/**
 * Emscripten Module interface
 */
export interface EmscriptenModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  ccall(
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ): unknown;
  cwrap(
    name: string,
    returnType: string | null,
    argTypes: string[]
  ): (...args: unknown[]) => unknown;
}

/**
 * Emscripten factory function type
 */
type EmscriptenFactory = (moduleArg?: object) => Promise<EmscriptenModule>;

/**
 * Global window interface for ZPLC module
 */
declare global {
  interface Window {
    ZPLCModule?: EmscriptenFactory | EmscriptenModule;
    zplcOnGpioWrite?: (channel: number, value: number) => void;
    zplcOnGpioRead?: (channel: number) => number;
  }
}

/** Cached module instance */
let moduleInstance: EmscriptenModule | null = null;

/** Loading promise to prevent multiple loads */
let loadingPromise: Promise<EmscriptenModule> | null = null;

/**
 * Load the ZPLC WASM script dynamically
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Get the base path for WASM files
 * Works in both Vite dev server and Electron production
 */
function getWasmBasePath(): string {
  // In Electron with file:// protocol, we need to get the directory of the HTML file
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    // Get the directory path from the current location
    // window.location.href is like: file:///path/to/dist/index.html
    // We need: file:///path/to/dist/
    const href = window.location.href;
    const lastSlash = href.lastIndexOf('/');
    if (lastSlash !== -1) {
      return href.substring(0, lastSlash + 1);
    }
    return './';
  }
  // Vite dev server or web build - files are in /public which maps to /
  return '/';
}

/**
 * Load and initialize the ZPLC WASM module
 *
 * This function:
 * 1. Loads the zplc_sim.js script if not already loaded
 * 2. Calls the Emscripten factory function to create the module
 * 3. Caches the result for subsequent calls
 *
 * @returns The initialized Emscripten module
 */
export async function loadZPLCModule(): Promise<EmscriptenModule> {
  // Return cached instance if available
  if (moduleInstance) {
    return moduleInstance;
  }

  // Return existing loading promise if in progress
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const basePath = getWasmBasePath();

    // Load the script
    await loadScript(`${basePath}zplc_sim.js`);

    // Get the factory function
    const factory = window.ZPLCModule as EmscriptenFactory | undefined;
    if (!factory || typeof factory !== 'function') {
      throw new Error(
        'ZPLC WASM module not loaded correctly. ZPLCModule should be a factory function.'
      );
    }

    // Initialize the module with configuration
    const module = await factory({
      // Locate the .wasm file
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return `${basePath}zplc_sim.wasm`;
        }
        return path;
      },
      // Suppress default console output during init
      print: (text: string) => console.log('[ZPLC]', text),
      printErr: (text: string) => console.error('[ZPLC]', text),
    });

    // Cache the initialized module
    moduleInstance = module;

    // Also store on window for debugging
    (window as { _zplcModule?: EmscriptenModule })._zplcModule = module;

    console.log('[ZPLC] WASM module loaded successfully');
    return module;
  })();

  try {
    return await loadingPromise;
  } catch (error) {
    // Reset on error so we can retry
    loadingPromise = null;
    throw error;
  }
}

/**
 * Check if the WASM module is loaded
 */
export function isModuleLoaded(): boolean {
  return moduleInstance !== null;
}

/**
 * Get the cached module instance (or null if not loaded)
 */
export function getModule(): EmscriptenModule | null {
  return moduleInstance;
}

/**
 * Reset the module (for testing purposes)
 */
export function resetModule(): void {
  moduleInstance = null;
  loadingPromise = null;
}
