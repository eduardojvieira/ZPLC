import { describe, expect, it } from 'bun:test';

import { DEBUG_ADAPTER_TYPE } from '../runtime/debugAdapter';
import { EXECUTION_MODE, selectRuntimeArtifact } from './runtimeArtifactSelection';

describe('selectRuntimeArtifact', () => {
  const bytecode = new Uint8Array([1, 2, 3]);
  const zplcFile = new Uint8Array([9, 8, 7, 6]);

  it('uses the full .zplc artifact for hardware sessions', () => {
    expect(selectRuntimeArtifact(EXECUTION_MODE.HARDWARE, DEBUG_ADAPTER_TYPE.SERIAL, { bytecode, zplcFile })).toBe(zplcFile);
  });

  it('uses the full .zplc artifact for native simulation', () => {
    expect(selectRuntimeArtifact(EXECUTION_MODE.SIMULATE, DEBUG_ADAPTER_TYPE.NATIVE, { bytecode, zplcFile })).toBe(zplcFile);
  });

  it('keeps raw bytecode for legacy WASM fallback', () => {
    expect(selectRuntimeArtifact(EXECUTION_MODE.SIMULATE, DEBUG_ADAPTER_TYPE.WASM, { bytecode, zplcFile })).toBe(bytecode);
  });
});
