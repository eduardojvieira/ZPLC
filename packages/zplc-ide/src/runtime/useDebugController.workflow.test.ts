import { describe, expect, it } from 'bun:test';

import { getDebugFeatureActionability } from '../hooks/debugCapabilityActions';
import { getLegacyWasmCapabilities } from './debugCapabilities';

describe('shared workflow capability surface', () => {
  it('reports degraded WASM controls through the same capability workflow surface', () => {
    const capabilities = getLegacyWasmCapabilities();
    const pause = getDebugFeatureActionability(capabilities, 'pause', 'Pause');
    const step = getDebugFeatureActionability(capabilities, 'step', 'Step');

    expect(pause.allowed).toBe(true);
    expect(pause.message).toContain('degraded');
    expect(step.allowed).toBe(true);
    expect(step.message).toContain('authoritative stepping');
  });
});
