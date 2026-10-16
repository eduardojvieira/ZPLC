// The module that the Vite plugin of scripts/wasmRuntimePlugin.ts provides: the WebAssembly runtime of the browser
// simulation, as base64, with the manifest of the build that made it (IDE-025).
declare module 'virtual:zplc-wasm-runtime' {
  export const manifest: {
    file: string;
    bytes: number;
    sha256: string;
    commit: string;
    dirty: boolean;
    version: string;
    toolchain: string;
  } | null;
  export const bytesBase64: string | null;
  export const unavailableReason: string | null;
}
