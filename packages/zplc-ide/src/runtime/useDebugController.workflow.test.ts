import { describe, expect, it } from 'bun:test';

import { getDebugFeatureActionability } from '../hooks/debugCapabilityActions';
import { getLegacyWasmCapabilities } from './debugCapabilities';

describe('shared workflow capability surface', () => {
  it('blocks disabled browser WASM controls through the capability workflow surface', () => {
    const capabilities = getLegacyWasmCapabilities();
    const pause = getDebugFeatureActionability(capabilities, 'pause', 'Pause');
    const step = getDebugFeatureActionability(capabilities, 'step', 'Step');

    expect(pause.allowed).toBe(false);
    expect(pause.message).toContain('Browser WASM simulation is disabled');
    expect(step.allowed).toBe(false);
    expect(step.message).toContain('Browser WASM simulation is disabled');
  });
});
