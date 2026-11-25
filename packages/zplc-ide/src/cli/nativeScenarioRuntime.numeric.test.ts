import { describe, expect, it } from 'bun:test';

import { createNativeScenarioRuntime } from './nativeScenarioRuntime';

/** An adapter over a flat byte image: pokeN and peek act on it, every call is recorded. */
function fakeAdapter(withPokeN = true) {
  const memory = new Uint8Array(0x2000);
  const calls: string[] = [];
  const adapter = {
    loadProgram: async () => undefined,
    reset: async () => undefined,
    scenarioStep: async () => void calls.push('step'),
    listForcedValues: async () => [],
    peek: async (address: number, length: number) => (calls.push(`peek:${address}:${length}`), memory.slice(address, address + length)),
    poke: async () => undefined,
    ...(withPokeN
      ? {
          pokeN: async (address: number, bytes: Uint8Array) => {
            calls.push(`pokeN:${address}:${bytes.length}`);
            memory.set(bytes, address);
          },
        }
      : {}),
  };
  return { adapter, memory, calls };
}

describe('the numeric native scenario runtime', () => {
  it(
    'PLT-003 the numeric native runtime encodes INT as int16 and REAL as float32 little-endian and refuses an address outside its ' +
      'image',
    async () => {
      const { adapter, memory, calls } = fakeAdapter();
      const runtime = createNativeScenarioRuntime(adapter);
      await runtime.setInputNumber!(0x10, 'INT', -2);
      await runtime.setInputNumber!(0x20, 'REAL', 1.5);
      // the values land in the image when the tick steps, as one write over the touched range of the chunk
      expect([...memory.slice(0x10, 0x13)]).toEqual([0, 0, 0]);
      await runtime.step(0);
      expect([...memory.slice(0x10, 0x13)]).toEqual([0xfe, 0xff, 0]);
      expect([...memory.slice(0x20, 0x24)]).toEqual([0x00, 0x00, 0xc0, 0x3f]);
      expect(calls.filter((call) => call.startsWith('pokeN'))).toEqual(['pokeN:16:20']);
      // the last slot that still fits, then one byte past the image, a negative and a fractional address
      await runtime.setInputNumber!(0x0ffe, 'INT', 1);
      await runtime.setInputNumber!(0x0ffc, 'REAL', 1);
      for (const [address, type] of [
        [0x0fff, 'INT'],
        [0x0ffd, 'REAL'],
        [0x1000, 'INT'],
        [-1, 'INT'],
        [1.5, 'INT'],
      ] as const)
        expect(runtime.setInputNumber!(address, type, 1)).rejects.toThrow('Scenario IPI address is invalid');
      // reads decode the same layout from the output image, and refuse addresses outside it
      memory.set([0x34, 0xf2], 0x1000);
      memory.set([0x00, 0x00, 0xc0, 0x3f], 0x1004);
      expect(await runtime.readOutputNumber!(0x1000, 'INT')).toBe(-3532);
      expect(await runtime.readOutputNumber!(0x1004, 'REAL')).toBe(1.5);
      for (const [address, type] of [
        [0x0ffe, 'INT'],
        [0x1fff, 'INT'],
        [0x1ffd, 'REAL'],
        [0x2000, 'INT'],
      ] as const)
        expect(runtime.readOutputNumber!(address, type)).rejects.toThrow('Scenario OPI address is invalid');
      // both reads (and the refused ones) are served from one 64-byte chunk read
      expect(calls.filter((call) => call.startsWith('peek:4096'))).toEqual(['peek:4096:64']);
    },
  );

  it('PLT-003 an adapter without pokeN yields a runtime without numeric methods and the bit methods stay', () => {
    const runtime = createNativeScenarioRuntime(fakeAdapter(false).adapter);
    expect(runtime.setInputNumber).toBeUndefined();
    expect(runtime.readOutputNumber).toBeUndefined();
    expect(typeof runtime.setInput).toBe('function');
  });
});
