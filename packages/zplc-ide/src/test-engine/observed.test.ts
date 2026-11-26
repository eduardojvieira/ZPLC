/**
 * AI-08: a run can record its inputs and watched internal variables beside the trace, in a sidecar that never enters the
 * recorded trace, so the 2.0 trace bytes (and `traceSha256`) stay the same.
 */
import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { compileScenario, resolveWatch, runScenario, watchableSignals, type ScenarioRuntimePort } from './index';

const debugMap = (): DebugMap => ({
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: {
    ipiBase: 0,
    ipiSize: 1,
    opiBase: 0x1000,
    opiSize: 1,
    workBase: 0x2000,
    workSize: 64,
    retainBase: 0x3000,
    retainSize: 1,
    codeBase: 0x4000,
    codeSize: 1,
  },
  pou: {
    Motor: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: {
        Start: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 },
        Run: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
        Count: { addr: 0x2000, type: 'INT', region: 'WORK', size: 2 },
        Note: { addr: 0x2004, type: 'STRING', region: 'WORK', size: 8, capacity: 6 },
        T1: { addr: 0x2010, type: 'TON', region: 'WORK', size: 16, children: { ET: { offset: 4, type: 'TIME', size: 4 } } },
      },
    },
  },
});

/** Run follows Start; Count counts the scans with Start on; T1.ET grows by 10 ms a scan. */
class Counting implements ScenarioRuntimePort {
  start = false;
  memory = new DataView(new ArrayBuffer(0x4000));
  async loadProgram(): Promise<void> {}
  async reset(): Promise<void> {}
  async hasForces(): Promise<boolean> {
    return false;
  }
  async setInput(_address: number, _bit: number, value: boolean): Promise<void> {
    this.start = value;
  }
  async step(): Promise<void> {
    if (this.start) this.memory.setInt16(0x2000, this.memory.getInt16(0x2000, true) + 1, true);
    this.memory.setInt32(0x2014, this.memory.getInt32(0x2014, true) + 10, true);
  }
  async readOutput(): Promise<boolean> {
    return this.start;
  }
  async readMemory(address: number, size: number): Promise<Uint8Array> {
    return new Uint8Array(this.memory.buffer.slice(address, address + size));
  }
}

const scenario = () =>
  compileScenario(
    {
      schemaVersion: 1,
      id: 'observed',
      tickMs: 10,
      durationMs: 30,
      events: [{ atMs: 10, set: { 'Motor.Start': true } }],
      expectations: [{ kind: 'AT', atMs: 20, condition: { 'Motor.Run': true } }],
    },
    debugMap(),
  );

describe('the inputs and watched variables of a run, beside its trace (AI-08)', () => {
  it('AI-08 records every input and watched variable per sample and leaves the trace as it was', async () => {
    const plain = await runScenario(scenario(), new Uint8Array([1]), new Counting());
    expect(plain.observed).toBeUndefined();
    const watch = ['Motor.Count', 'Motor.T1.ET'].map((name) => resolveWatch(debugMap(), name)!);
    const observed = await runScenario(scenario(), new Uint8Array([1]), new Counting(), { inputs: true, watch });
    expect(JSON.stringify(observed.trace)).toBe(JSON.stringify(plain.trace));
    expect(observed.assertions).toEqual(plain.assertions);
    expect(observed.observed!.inputs).toEqual([
      { 'Motor.Start': false },
      { 'Motor.Start': true },
      { 'Motor.Start': true },
      { 'Motor.Start': true },
    ]);
    expect(observed.observed!.watched).toEqual([
      { 'Motor.Count': 0, 'Motor.T1.ET': 10 },
      { 'Motor.Count': 1, 'Motor.T1.ET': 20 },
      { 'Motor.Count': 2, 'Motor.T1.ET': 30 },
      { 'Motor.Count': 3, 'Motor.T1.ET': 40 },
    ]);
  });

  it('AI-08 a watched name resolves to a variable or a block member of a readable type, and nothing else', () => {
    expect(resolveWatch(debugMap(), 'Motor.Count')).toMatchObject({ signal: 'Motor.Count', address: 0x2000, type: 'INT', size: 2 });
    expect(resolveWatch(debugMap(), 'Motor.T1.ET')).toMatchObject({ signal: 'Motor.T1.ET', address: 0x2014, type: 'TIME', size: 4 });
    expect(resolveWatch(debugMap(), 'Motor.Missing')).toBeUndefined();
    expect(resolveWatch(debugMap(), 'Motor.Note')).toBeUndefined();
    expect(resolveWatch(debugMap(), 'Motor.T1')).toBeUndefined();
    expect(watchableSignals(debugMap())).toEqual(['Motor.Count', 'Motor.Run', 'Motor.Start', 'Motor.T1.ET']);
  });

  it('AI-08 a runtime that cannot read memory refuses a watched run instead of answering nothing', async () => {
    const runtime: ScenarioRuntimePort = new Counting();
    Object.defineProperty(runtime, 'readMemory', { value: undefined });
    const watch = [resolveWatch(debugMap(), 'Motor.Count')!];
    await expect(runScenario(scenario(), new Uint8Array([1]), runtime, { watch })).rejects.toThrow('readMemory');
  });
});
