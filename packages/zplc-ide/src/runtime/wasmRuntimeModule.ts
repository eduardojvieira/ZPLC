/**
 * The WebAssembly runtime that the IDE build embeds (scripts/wasmRuntimePlugin.ts): its bytes and the manifest of the
 * build that made them. The page loads this chunk only when a simulation falls back to the browser runtime, so a session
 * on the native runtime never pays for it.
 */

export interface WasmRuntimeManifest {
  file: string;
  bytes: number;
  sha256: string;
  commit: string;
  dirty: boolean;
  version: string;
  toolchain: string;
}

export interface ShippedWasmRuntime {
  bytes: Uint8Array;
  manifest: WasmRuntimeManifest;
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The runtime of this build; rejects with the reason when the build had no clang and wasm-ld to make one. */
export async function loadShippedWasmRuntime(): Promise<ShippedWasmRuntime> {
  const shipped = await import('virtual:zplc-wasm-runtime');
  if (shipped.bytesBase64 === null || shipped.manifest === null) {
    throw new Error(shipped.unavailableReason ?? 'This build of the IDE has no WebAssembly runtime.');
  }
  return { bytes: base64ToBytes(shipped.bytesBase64), manifest: shipped.manifest };
}
