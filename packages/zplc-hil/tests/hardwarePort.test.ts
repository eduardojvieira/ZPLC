import { describe, expect, test } from 'bun:test';

import { HardwareRuntimePort, ScenarioTimingError, withHardwarePort } from '../src/hardwarePort';
import { FakeLink } from './fakeLink';

const noWait = { sleep: () => Promise.resolve() };

/** What the scenario engine does on one tick: set the inputs, step, read the outputs. */
async function tick(port: HardwareRuntimePort, atMs: number, input?: boolean): Promise<boolean> {
  if (input !== undefined) await port.setInput(0, 0, input);
  await port.step(atMs);
  return port.readOutput(0x1000, 0);
}

describe('the hardware runtime port of the scenario engine (HIL-002)', () => {
  test('an input is forced, a scan runs with it and the output is read after that scan', async () => {
    const link = new FakeLink();
    const port = new HardwareRuntimePort(link, noWait);
    await port.loadProgram(Uint8Array.of(1, 2, 3));
    await port.reset();
    expect(await tick(port, 0, false)).toBe(false);
    expect(await tick(port, 10, true)).toBe(true);
    expect(await tick(port, 20, false)).toBe(false);
    expect(link.calls.filter((call) => call.startsWith('force'))).toEqual(['force 0:0', 'force 0:1', 'force 0:0']);
    expect(link.calls).not.toContain('poke 0');
  });

  test('time is taken from the device clock, and each tick waits for it', async () => {
    const link = new FakeLink();
    const port = new HardwareRuntimePort(link, noWait);
    await port.loadProgram(Uint8Array.of(1));
    await port.reset();
    for (const atMs of [0, 10, 20, 30]) await tick(port, atMs);
    const [first, ...rest] = port.observations;
    expect(first?.atMs).toBe(0);
    for (const observation of rest) expect(observation.deviceMs).toBeGreaterThanOrEqual(observation.atMs);
    expect(port.observations.map((o) => o.cycles)).toEqual([...port.observations.map((o) => o.cycles)].sort((a, b) => a - b));
    expect(new Set(port.observations.map((o) => o.cycles)).size).toBe(port.observations.length);
  });

  test('a sample taken later than the declared tolerance voids the run', async () => {
    const link = new FakeLink();
    link.scanMs = 200; // a board whose scan is slower than the tick the scenario asks for
    const port = new HardwareRuntimePort(link, { ...noWait, toleranceMs: 20 });
    await port.loadProgram(Uint8Array.of(1));
    await port.reset();
    await expect(tick(port, 0)).rejects.toBeInstanceOf(ScenarioTimingError);
  });

  test('a device that never reaches the tick is a timeout, not a pass', async () => {
    const link = new FakeLink();
    link.scanMs = 1_000_000;
    let clock = 0;
    const port = new HardwareRuntimePort(link, {
      sleep: () => {
        clock += 5_000;
        return Promise.resolve();
      },
      now: () => clock,
      timeoutMs: 10_000,
    });
    await port.loadProgram(Uint8Array.of(1));
    await port.reset();
    await expect(port.step(0)).rejects.toThrow(/did not reach tick/);
  });

  test('forces that are already active refuse the run, as the engine requires', async () => {
    const link = new FakeLink();
    link.forced.set(0, 1);
    expect(await new HardwareRuntimePort(link, noWait).hasForces()).toBe(true);
    expect(await new HardwareRuntimePort(new FakeLink(), noWait).hasForces()).toBe(false);
  });

  test('addresses outside the images are refused before anything reaches the device', async () => {
    const link = new FakeLink();
    const port = new HardwareRuntimePort(link, noWait);
    await expect(port.setInput(0x1000, 0, true)).rejects.toThrow(/IPI address/);
    await expect(port.setInput(0, 8, true)).rejects.toThrow(/bitOffset/);
    await expect(port.readOutput(0, 0)).rejects.toThrow(/OPI address/);
    expect(link.calls).toEqual([]);
  });
});

describe('forces are released by the tool at the end and on abort (HIL-003)', () => {
  test('at the end of a run the forces are cleared and the board is stopped', async () => {
    const link = new FakeLink();
    const done = await withHardwarePort(link, noWait, async (port) => {
      await port.loadProgram(Uint8Array.of(1));
      await port.reset();
      return tick(port, 0, true);
    });
    expect(done.value).toBe(true);
    expect(done.release).toEqual({ ok: true, forcesCleared: true, stopped: true, errors: [] });
    expect(link.forced.size).toBe(0);
    expect(link.running).toBe(false);
  });

  test('when the run throws, the forces are still cleared and the board stopped, and the error is kept', async () => {
    const link = new FakeLink();
    await expect(
      withHardwarePort(link, noWait, async (port) => {
        await port.loadProgram(Uint8Array.of(1));
        await port.reset();
        await tick(port, 0, true);
        throw new Error('the scenario broke');
      }),
    ).rejects.toThrow('the scenario broke');
    expect(link.forced.size).toBe(0);
    expect(link.running).toBe(false);
  });

  test('on abort the next poll stops the run and the release still happens', async () => {
    const link = new FakeLink();
    const controller = new AbortController();
    await expect(
      withHardwarePort(link, { ...noWait, signal: controller.signal }, async (port) => {
        await port.loadProgram(Uint8Array.of(1));
        await port.reset();
        await tick(port, 0, true);
        controller.abort();
        await port.step(10);
      }),
    ).rejects.toThrow();
    expect(link.forced.size).toBe(0);
    expect(link.running).toBe(false);
  });

  test('a release that fails is reported, and it is not mistaken for a pass', async () => {
    const link = new FakeLink();
    link.stuckForces = true;
    const done = await withHardwarePort(link, noWait, async (port) => {
      await port.loadProgram(Uint8Array.of(1));
      await port.reset();
      await tick(port, 0, true);
    });
    expect(done.release.ok).toBe(false);
    expect(done.release.forcesCleared).toBe(false);
    expect(done.release.errors.join(' ')).toContain('forces are still listed');
  });

  test('a link that is gone when the release runs is an error in the report, and STOP is still tried', async () => {
    const link = new FakeLink();
    link.fail.add('clearForces');
    const done = await withHardwarePort(link, noWait, async (port) => {
      await port.loadProgram(Uint8Array.of(1));
      await port.reset();
      await tick(port, 0, true);
    });
    expect(done.release.ok).toBe(false);
    expect(done.release.stopped).toBe(true);
    expect(link.calls).toContain('stop');
  });

  test('releasing twice is the same release', async () => {
    const link = new FakeLink();
    const port = new HardwareRuntimePort(link, noWait);
    const first = await port.release();
    const second = await port.release();
    expect(second).toBe(first);
    expect(link.calls.filter((call) => call === 'stop')).toHaveLength(1);
  });
});
