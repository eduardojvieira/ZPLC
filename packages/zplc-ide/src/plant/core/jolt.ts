import initJolt from 'jolt-physics/wasm-compat';

export type JoltModule = Awaited<ReturnType<typeof initJolt>>;

/** A fresh module instance per call, so two worlds never share a heap (spec 6.1: no single-flavour global). */
export function loadJolt(): Promise<JoltModule> {
  return initJolt();
}
