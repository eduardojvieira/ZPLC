import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { compileScenario, runScenario, type ScenarioRuntimePort } from './index';

const OUTPUTS = 10;
const debugMap = (): DebugMap => ({
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: {
    ipiBase: 0,
    ipiSize: 1,
    opiBase: 0x1000,
    opiSize: OUTPUTS,
    workBase: 0x2000,
    workSize: 1,
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
        ...Object.fromEntries(
          Array.from({ length: OUTPUTS }, (_, index) => [
            `Out${index}`,
            { addr: 0x1000 + index, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
          ]),
        ),
      },
    },
  },
});

/** Every output follows Start. */
class FollowStart implements ScenarioRuntimePort {
  start = false;
  async loadProgram(): Promise<void> {}
  async reset(): Promise<void> {}
  async hasForces(): Promise<boolean> {
    return false;
  }
  async setInput(_address: number, _bit: number, value: boolean): Promise<void> {
    this.start = value;
  }
  async step(): Promise<void> {}
  async readOutput(): Promise<boolean> {
    return this.start;
  }
}

const run = (expectations: unknown[]) =>
  runScenario(
    compileScenario(
      {
        schemaVersion: 1,
        id: 'detail',
        tickMs: 10,
        durationMs: 40,
        events: [{ atMs: 10, set: { 'Motor.Start': true } }],
        expectations,
      },
      debugMap(),
    ),
    new Uint8Array([1]),
    new FollowStart(),
  );

describe('failure detail of an assertion (TST-003, contract C-E)', () => {
  it('TST-003 a failed AT expectation reports its index, the signal, the expected and the observed value', async () => {
    const result = await run([
      { kind: 'AT', atMs: 20, condition: { 'Motor.Out0': true } },
      { kind: 'AT', atMs: 20, condition: { 'Motor.Out0': false } },
    ]);
    expect(result.assertions[1]).toEqual({
      kind: 'AT',
      passed: false,
      atMs: 20,
      index: 1,
      checks: [{ signal: 'Motor.Out0', expected: false, observed: true }],
    });
  });

  it('TST-003 a failed FOR expectation reports the first sample where it broke', async () => {
    const result = await run([{ kind: 'FOR', fromMs: 0, forMs: 40, condition: { 'Motor.Out0': false } }]);
    expect(result.assertions[0]).toEqual({
      kind: 'FOR',
      passed: false,
      atMs: 10,
      index: 0,
      checks: [{ signal: 'Motor.Out0', expected: false, observed: true }],
    });
  });

  it('TST-003 a passed expectation has no index and no checks', async () => {
    const result = await run([{ kind: 'AT', atMs: 20, condition: { 'Motor.Out0': true } }]);
    expect(result.assertions).toEqual([{ kind: 'AT', passed: true, atMs: 20 }]);
    expect(Object.keys(result.assertions[0]!)).toEqual(['kind', 'passed', 'atMs']);
  });

  it('TST-003 a condition on more than 8 signals reports the first 8', async () => {
    const condition = Object.fromEntries(Array.from({ length: OUTPUTS }, (_, index) => [`Motor.Out${index}`, false]));
    const result = await run([{ kind: 'AT', atMs: 20, condition }]);
    const checks = result.assertions[0]!.checks!;
    expect(checks).toHaveLength(8);
    expect(checks.map((check) => check.signal)).toEqual(Array.from({ length: 8 }, (_, index) => `Motor.Out${index}`));
    expect(checks.every((check) => check.expected === false && check.observed === true)).toBe(true);
  });
});
