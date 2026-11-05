import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { openTryLab, planTryLab, readingsOf, type TryLab, type TryLabAdapter, type TryLabSpec } from './tryLab';

const SRC = 'reading/off-delay.ld.json';
const OFF_DELAY = readFileSync(join(import.meta.dir, '..', 'learn', 'reading', 'fixtures', 'off-delay.ld.json'), 'utf8');
const SPEC: TryLabSpec = { src: SRC, inputs: [{ name: 'Button' }], outputs: ['Light'], timing: ['Button', 'Light'] };

function fakeAdapter(values: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const adapter: TryLabAdapter = {
    connect: async () => void calls.push('connect'),
    disconnect: async () => void calls.push('disconnect'),
    loadProgram: async () => void calls.push('load'),
    start: async () => void calls.push('start'),
    stop: async () => void calls.push('stop'),
    pause: async () => void calls.push('pause'),
    resume: async () => void calls.push('resume'),
    reset: async () => void calls.push('reset'),
    peek: async () => Uint8Array.of(0),
    setValue: async (address, bytes) => void calls.push(`set ${address}:${[...bytes].join(',')}`),
    readWatchVariables: async (variables) =>
      variables.map((variable) => ({ ...variable, value: values[variable.name.slice(variable.name.lastIndexOf('@') + 1)] })),
  };
  return { adapter, calls, values };
}
function open(fake = fakeAdapter(), spec = SPEC): TryLab {
  const opened = openTryLab(OFF_DELAY, spec, () => fake.adapter);
  if (!opened.ok) throw new Error('the lab did not open');
  return opened.lab;
}

describe('try-it lab plan (LRN-041)', () => {
  test('compiles the program with the Studio compiler and resolves the inputs, outputs and the power-flow variables', () => {
    const result = planTryLab(OFF_DELAY, SPEC);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { plan } = result;
    expect(plan.inputs.get('Button')).toMatchObject({ name: 'Button', type: 'BOOL', region: 'IPI' });
    expect(plan.entries.some((entry) => entry.role === 'power')).toBe(true);
    const names = plan.polled.map((variable) => variable.name);
    expect(names).toContain(`${SRC}@Light`);
    expect(names).toContain(`${SRC}@HoldTimer.Q`);
  });

  test('says which name is not an input or an output of the program, and reports a compile error as a message', () => {
    expect(planTryLab(OFF_DELAY, { ...SPEC, inputs: [{ name: 'Nope' }] })).toMatchObject({ ok: false, reason: 'input', name: 'Nope' });
    expect(planTryLab(OFF_DELAY, { ...SPEC, outputs: ['Nope'] })).toMatchObject({ ok: false, reason: 'output', name: 'Nope' });
    expect(planTryLab('{ not json', SPEC)).toMatchObject({ ok: false, reason: 'compile' });
  });

  test('reads the polled values back by variable name', () => {
    const read = readingsOf([
      { name: `${SRC}@Light`, address: 0, type: 'BOOL', forceable: false, value: true },
      { name: `${SRC}@HoldTimer.ET`, address: 0, type: 'DINT', forceable: false },
    ]);
    expect(read('Light')).toBe(true);
    expect(read('HoldTimer.ET')).toBeUndefined();
  });
});

describe('plain variables as inputs (LRN-041)', () => {
  test('an input may be a plain variable of the program, with no direct address', () => {
    const plain = readFileSync(join(import.meta.dir, '..', 'learn', 'reading', 'fixtures', 'off-delay-var.ld.json'), 'utf8');
    const result = planTryLab(plain, SPEC);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.inputs.get('Button')).toMatchObject({ type: 'BOOL', region: 'WORK', origin: 'program-input' });
  });
});

describe('try-it lab session (LRN-041, LRN-015)', () => {
  test('makes no adapter and starts nothing until the learner asks to run', async () => {
    let made = 0;
    const fake = fakeAdapter();
    const opened = openTryLab(OFF_DELAY, SPEC, () => (made++, fake.adapter));
    expect(opened.ok).toBe(true);
    expect(made).toBe(0);
    expect(fake.calls).toEqual([]);
    if (!opened.ok) return;
    await opened.lab.run();
    expect(fake.calls).toEqual(['connect', 'load', 'start']);
  });

  test('run, hold, run again and restart map to start, pause, resume and reset', async () => {
    const fake = fakeAdapter();
    const lab = open(fake);
    await lab.run();
    await lab.hold();
    await lab.run();
    await lab.restart();
    await lab.run();
    expect(fake.calls).toEqual(['connect', 'load', 'start', 'pause', 'resume', 'reset', 'start']);
  });

  test('sets an input with the typed write of the faceplate, the bit of its byte, and never forces', async () => {
    const fake = fakeAdapter();
    const lab = open(fake);
    await lab.run();
    await lab.press('Button', true);
    await lab.press('Button', false);
    const writes = fake.calls.filter((call) => call.startsWith('set '));
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatch(/^set \d+:1$/);
    expect(writes[1]).toMatch(/^set \d+:0$/);
    await expect(lab.press('Nope', true)).rejects.toThrow('not an input');
  });

  test('reads the values and the power flow of the rung', async () => {
    const fake = fakeAdapter({ Button: true, 'HoldTimer.Q': false });
    const lab = open(fake);
    await lab.run();
    const { read, states } = await lab.readings();
    expect(read('Button')).toBe(true);
    expect(read('Light')).toBeUndefined();
    expect(states.get('rung:rung_1/cell:0,6')?.power).toBe(true);
  });

  test('stops and disconnects on close, once, and a run after it is refused', async () => {
    const fake = fakeAdapter();
    const lab = open(fake);
    await lab.run();
    await lab.close();
    await lab.close();
    expect(fake.calls.slice(-2)).toEqual(['stop', 'disconnect']);
    expect(fake.calls.filter((call) => call === 'disconnect')).toHaveLength(1);
    await expect(lab.readings()).rejects.toThrow('not running');
  });

  test('closing before run touches no adapter; closing while the session opens leaves it disconnected', async () => {
    const idle = fakeAdapter();
    await open(idle).close();
    expect(idle.calls).toEqual([]);

    const fake = fakeAdapter();
    const lab = open(fake);
    const running = lab.run().catch(() => undefined);
    await lab.close();
    await running;
    expect(fake.calls.at(-1)).toBe('disconnect');
    expect(fake.calls).not.toContain('start');
  });
});
