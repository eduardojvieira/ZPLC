import { describe, expect, test } from 'bun:test';

import { compileSource, CompileFailure } from '../src/compile';
import { HostRuntimeLink } from '../src/hostLink';
import { run } from '../src/index';
import type { HILTestCase } from '../src/runner';
import { TestRunner } from '../src/runner';
import { FakeLink } from './fakeLink';
import { itNative, nativeRuntime } from './nativeGuard';

const ADD = `PROGRAM Main
VAR
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
a := 7;
b := a + 35;
END_PROGRAM
`;

function memoryCase(expected: number[]): HILTestCase {
  return {
    id: 'runner.add', name: 'a program that adds', category: 'language', language: 'ST', source: ADD, debugMode: 'off', timeout: 300,
    assertions: [{ type: 'memory', address: 0x1000, expected }],
  };
}

describe('the runner compiles, deploys, starts and observes (HIL-001)', () => {
  test('a program is compiled by the repository compiler into an artifact with a hash', () => {
    const compiled = compileSource({ text: ADD, extension: '.st' });
    expect(compiled.zplc.length).toBeGreaterThan(32);
    expect(compiled.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a program the compiler refuses is an error that carries the compiler message', () => {
    expect(() => compileSource({ text: 'PROGRAM Main\nVAR x AT %Q0.0 : INT; END_VAR\nEND_PROGRAM\n', extension: '.st' })).toThrow(CompileFailure);
  });

  test('the artifact is deployed through the link, started, observed while it runs, and stopped', async () => {
    const link = new FakeLink();
    [7, 0, 42, 0].forEach((byte, offset) => link.memory.set(0x1000 + offset, byte)); // what the program would have written
    const result = await new TestRunner(link, { settleMs: 50 }).runTest(memoryCase([7, 0, 42, 0]));
    expect(result.status).toBe('pass');
    expect(result.programSha256).toMatch(/^[0-9a-f]{64}$/);
    const order = link.calls.filter((call) => ['load', 'reset', 'start', 'peek', 'stop'].some((verb) => call.startsWith(verb)));
    expect(order.map((call) => call.split(' ')[0])).toEqual(['load', 'reset', 'start', 'peek', 'stop']);
    expect(link.loaded?.length).toBeGreaterThan(32);
  });

  test('an observed value that differs fails the test and names the assertion', async () => {
    const link = new FakeLink();
    link.memory.set(0x1000, 7);
    const result = await new TestRunner(link, { settleMs: 50 }).runTest(memoryCase([8]));
    expect(result.status).toBe('fail');
    expect(result.failedAssertion?.type).toBe('memory');
  });

  test('a device that does not deploy is an error of the test, not a pass', async () => {
    const link = new FakeLink();
    link.fail.add('load');
    const result = await new TestRunner(link, { settleMs: 10 }).runTest(memoryCase([7]));
    expect(result.status).toBe('error');
    expect(result.error).toContain('load failed');
  });

  test('a test that fails is tried again as many times as it allows, and no more', async () => {
    const link = new FakeLink();
    const result = await new TestRunner(link, { settleMs: 10 }).runTest({ ...memoryCase([1]), retries: 2 });
    expect(result.status).toBe('fail');
    expect(result.attempts).toBe(3);
  });

  itNative('on the native runtime of this tree: compile, deploy, run and read back, with nothing mocked', async () => {
    const link = await HostRuntimeLink.open(nativeRuntime);
    try {
      const result = await run(memoryCase([7, 0, 42, 0]), link, { settleMs: 1500 });
      expect(result).toMatchObject({ status: 'pass' });
      const wrong = await run(memoryCase([7, 0, 43, 0]), link, { settleMs: 1500 });
      expect(wrong.status).toBe('fail');
    } finally {
      await link.close();
    }
  }, 60_000);
});
