import { describe, expect, it } from 'bun:test';

import { selectRuntimeArtifact } from './runtimeArtifactSelection';

describe('selectRuntimeArtifact', () => {
  const bytecode = new Uint8Array([1, 2, 3]);
  const zplcFile = new Uint8Array([9, 8, 7, 6]);

  it('uses the full .zplc artifact for every runtime', () => {
    expect(selectRuntimeArtifact({ bytecode, zplcFile })).toBe(zplcFile);
  });
});
