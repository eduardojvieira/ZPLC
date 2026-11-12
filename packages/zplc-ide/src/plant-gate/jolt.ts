import initJolt from 'jolt-physics/wasm-compat';

export type JoltModule = Awaited<ReturnType<typeof initJolt>>;

// A fresh module instance on every call, so two worlds never share a heap.
export function loadJolt(): Promise<JoltModule> {
  return initJolt();
}
