import { describe, expect, test } from 'bun:test';
import { declaredSafeOutputs } from './safeOutputs';

const row = (name: string, address: string, extra: Record<string, unknown> = {}) => ({ name, address, type: 'BOOL' as const, ...extra });

describe('the safe values a project declares for its outputs (RT-023)', () => {
  test('a project that declares nothing declares nothing: every output is off', () => {
    const result = declaredSafeOutputs({ outputs: [row('Relay', '%QX0.0')] }, 'rpi_pico');
    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.declared).toEqual([]);
  });

  test('an output of the board with a safe value is an entry of its place in the output image', () => {
    const result = declaredSafeOutputs(
      { outputs: [row('Relay', '%Q0.1', { safe: true }), row('Valve', '%QX0.4', { safe: false })] },
      'rpi_pico',
    );
    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([
      { offset: 0, bit: 1, value: 1 },
      { offset: 0, bit: 4, value: 0 },
    ]);
    expect(result.declared).toEqual([
      { name: 'Relay', address: '%QX0.1', value: true },
      { name: 'Valve', address: '%QX0.4', value: false },
    ]);
  });

  test('a safe value that is not true or false is a build problem that names the output', () => {
    for (const bad of [1, 0, 'on', null, 2]) {
      const { problems, entries } = declaredSafeOutputs({ outputs: [row('Relay', '%QX0.0', { safe: bad })] }, 'rpi_pico');
      expect(entries).toEqual([]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("'Relay'");
      expect(problems[0]).toMatch(/true or false/);
    }
  });

  test('an output the board does not have is a build problem that names the board', () => {
    const { problems } = declaredSafeOutputs({ outputs: [row('Ghost', '%QX0.6', { safe: true })] }, 'rpi_pico');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'Ghost'");
    expect(problems[0]).toContain('%QX0.6');
    expect(problems[0]).toContain('Raspberry Pi Pico');
  });

  test('a word, a byte or an analog output has no on or off to declare', () => {
    for (const address of ['%QW0', '%QB0']) {
      const { problems } = declaredSafeOutputs({ outputs: [row('Analog', address, { safe: true })] }, 'rpi_pico');
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('one bit');
    }
  });

  test('an input or an image word no pin drives has no safe state to declare', () => {
    const { problems } = declaredSafeOutputs(
      {
        inputs: [row('Button', '%IX0.0', { safe: true })],
        virtual: [row('Flag', '%QX0.7', { safe: false })],
      },
      'rpi_pico',
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("'Button'");
    expect(problems[1]).toContain("'Flag'");
  });

  test('two outputs that name the same bit are one declaration too many', () => {
    const { problems } = declaredSafeOutputs(
      { outputs: [row('A', '%QX0.2', { safe: true }), row('B', '%Q0.2', { safe: false })] },
      'rpi_pico',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'A'");
    expect(problems[0]).toContain("'B'");
  });

  test('a board with no description (the host, a custom board) takes any bit of the image', () => {
    const result = declaredSafeOutputs({ outputs: [row('Relay', '%QX9.7', { safe: true })] }, undefined);
    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([{ offset: 9, bit: 7, value: 1 }]);
  });
});
