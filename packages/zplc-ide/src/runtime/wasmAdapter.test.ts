import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  WASM_SIMULATION_DISABLED_ERROR,
  WASM_SIMULATION_ENABLED,
  WASMAdapter,
  verifierWorkspaceBytes,
} from './wasmAdapter';
import { isModuleLoaded, resetModule } from './wasmLoader';

describe('WASMAdapter', () => {
  it('fails closed before loading the browser module', async () => {
    resetModule();
    const adapter = new WASMAdapter();

    expect(WASM_SIMULATION_ENABLED).toBe(false);
    await expect(adapter.connect()).rejects.toThrow(WASM_SIMULATION_DISABLED_ERROR);
    expect(isModuleLoaded()).toBe(false);
  });
});

describe('verifierWorkspaceBytes', () => {
  it('matches ZPLC_LOADER_VERIFY_WORKSPACE_SIZE of the C loader at the default CODE size', () => {
    // 5632 boundary bits + 704 rank index + 5760 depth intervals + 360 pending bits + 2688 frame records.
    expect(verifierWorkspaceBytes(0xB000)).toBe(15144);
  });

  it('grows with the CODE size the runtime accepts', () => {
    expect(verifierWorkspaceBytes(0x2000)).toBeLessThan(verifierWorkspaceBytes(0xB000));
  });
  it('follows the macro of the C loader: a change of that formula fails here', () => {
    // The adapter cannot call the C macro, so the formula is mirrored by hand. Pin the macro text: when
    // zplc_loader.h changes it, this test fails and verifierWorkspaceBytes has to follow.
    const header = readFileSync(
      fileURLToPath(new URL('../../../../firmware/lib/zplc_core/include/zplc_loader.h', import.meta.url)), 'utf8');
    const logical = header.replace(/\\\r?\n/g, ' ').split('\n');
    const define = (name: string): string => {
      const line = logical.find((candidate) => candidate.startsWith(`#define ${name} `));
      expect(line).toBeDefined();
      return (line ?? '').slice(`#define ${name} `.length).replace(/\s+/g, ' ').trim();
    };
    expect(define('ZPLC_VERIFY_MAX_LEADERS')).toBe('((ZPLC_MEM_CODE_SIZE) / 16U + 64U)');
    expect(define('ZPLC_VERIFY_MAX_FRAMES')).toBe('((ZPLC_MEM_CODE_SIZE) / 128U + 32U)');
    expect(define('ZPLC_VERIFY_FRAME_BYTES')).toBe('7U');
    expect(define('ZPLC_LOADER_VERIFY_WORKSPACE_SIZE')).toBe(
      '(((ZPLC_MEM_CODE_SIZE + 7U) / 8U) + 2U * ((ZPLC_MEM_CODE_SIZE + 127U) / 128U) + ' +
      '2U * ZPLC_VERIFY_MAX_LEADERS + (ZPLC_VERIFY_MAX_LEADERS + 7U) / 8U + ' +
      'ZPLC_VERIFY_MAX_FRAMES * ZPLC_VERIFY_FRAME_BYTES)');
  });
});
