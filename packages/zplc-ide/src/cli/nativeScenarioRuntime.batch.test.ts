import { describe, expect, it } from 'bun:test';

import { createNativeScenarioRuntime } from './nativeScenarioRuntime';

/** A fake adapter over a flat 0x2000-byte image that records every exchange. */
function fakeAdapter() {
  const memory = new Uint8Array(0x2000);
  const calls: string[] = [];
  const adapter = {
    loadProgram: async () => undefined,
    reset: async () => undefined,
    scenarioStep: async (atMs: number) => void calls.push(`step:${atMs}`),
    listForcedValues: async () => [],
    peek: async (address: number, length: number) => (calls.push(`peek:${address}:${length}`), memory.slice(address, address + length)),
    poke: async (address: number, value: number) => {
      calls.push(`poke:${address}`);
      memory[address] = value;
    },
    pokeN: async (address: number, bytes: Uint8Array) => {
      calls.push(`pokeN:${address}:${bytes.length}`);
      memory.set(bytes, address);
    },
  };
  return { adapter, memory, calls };
}

/** The same calls through the old unbatched exchange: read-modify-write per bit, one write per number. */
const tickCalls = async (runtime: ReturnType<typeof createNativeScenarioRuntime>) => {
  for (let bit = 0; bit < 8; bit++) await runtime.setInput(2, bit, bit % 3 === 0);
  await runtime.setInput(3, 1, true);
  await runtime.setInputNumber!(4, 'INT', -2);
  await runtime.setInputNumber!(3, 'INT', 0x0102); // overwrites the bit write of byte 3
  await runtime.step(10);
};

describe('the batched native scenario runtime', () => {
  it('one tick of 9 bit writes, 2 numeric writes and 11 output reads costs 1 input read, 1 write, 1 step and 1 output read', async () => {
    const { adapter, calls } = fakeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);
    for (let bit = 0; bit < 8; bit++) await runtime.setInput(2, bit, true);
    await runtime.setInput(3, 0, true);
    await runtime.setInputNumber!(8, 'INT', 5);
    await runtime.setInputNumber!(12, 'REAL', 1.5);
    expect(calls).toEqual(['peek:0:64']);
    await runtime.step(10);
    for (let bit = 0; bit < 8; bit++) await runtime.readOutput(0x1000, bit);
    await runtime.readOutput(0x1001, 0);
    await runtime.readOutputNumber!(0x1004, 'INT');
    await runtime.readOutputNumber!(0x1008, 'REAL');
    expect(calls).toEqual(['peek:0:64', 'pokeN:2:14', 'step:10', 'peek:4096:64']);
  });

  it('the memory after the step equals what the unbatched exchange leaves', async () => {
    const batched = fakeAdapter();
    await tickCalls(createNativeScenarioRuntime(batched.adapter));
    const plain = fakeAdapter();
    // old exchange, spelled out: peek 1 byte + poke per bit, one pokeN per number
    const old = plain.adapter;
    for (let bit = 0; bit < 8; bit++) {
      const [b] = await old.peek(2, 1);
      await old.poke(2, bit % 3 === 0 ? b! | (1 << bit) : b! & ~(1 << bit));
    }
    await old.poke(3, (await old.peek(3, 1))[0]! | 2);
    await old.pokeN(4, new Uint8Array([0xfe, 0xff]));
    await old.pokeN(3, new Uint8Array([0x02, 0x01]));
    expect([...batched.memory]).toEqual([...plain.memory]);
    expect(batched.memory[3]).toBe(0x02);
  });

  it('a reset makes the next write read the chunk again', async () => {
    const { adapter, calls } = fakeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);
    await runtime.setInput(0, 0, true);
    await runtime.setInput(1, 0, true);
    await runtime.reset();
    await runtime.setInput(0, 0, true);
    expect(calls).toEqual(['peek:0:64', 'peek:0:64']);
  });

  it('reads after a second step do not reuse the first step cache', async () => {
    const { adapter, memory } = fakeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);
    memory[0x1000] = 1;
    await runtime.step(1);
    expect(await runtime.readOutput(0x1000, 0)).toBe(true);
    memory[0x1000] = 0;
    expect(await runtime.readOutput(0x1000, 0)).toBe(true); // same step: cached
    await runtime.step(2);
    expect(await runtime.readOutput(0x1000, 0)).toBe(false);
  });
});
