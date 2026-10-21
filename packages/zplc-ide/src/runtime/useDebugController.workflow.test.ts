import { describe, expect, it } from 'bun:test';

import { getDebugFeatureActionability } from '../hooks/debugCapabilityActions';
import { getWasmCapabilities } from './debugCapabilities';
import { wasmCapabilityProfile } from './wasmCapabilities';

describe('shared workflow capability surface', () => {
  it('lets the controls the browser runtime has through, and says why for one that it has only in part', () => {
    const capabilities = getWasmCapabilities();
    for (const [feature, label] of [
      ['pause', 'Pause'],
      ['resume', 'Resume'],
      ['step', 'Step'],
      ['breakpoints', 'Breakpoint sync'],
    ] as const) {
      const action = getDebugFeatureActionability(capabilities, feature, label);
      expect(action.allowed).toBe(true);
      expect(action.message).toBeNull();
    }
    const timing = getDebugFeatureActionability(capabilities, 'timing', 'Timing check');
    expect(timing.allowed).toBe(true);
    expect(timing.message).toContain('browser clock');
  });

  it('blocks, with the reason and what to do instead, a feature that a browser module does not have', () => {
    const profile = wasmCapabilityProfile('project');
    // the feature names of the profile are the ones the controller asks about
    const modbus = profile.features.find((feature) => feature.name === 'modbus');
    expect(modbus?.status).toBe('unavailable');
    const capabilities = getWasmCapabilities();
    const action = getDebugFeatureActionability(capabilities, 'modbus', 'Modbus blocks');
    expect(action.allowed).toBe(false);
    expect(action.message).toContain('STATUS 10');
  });
});
