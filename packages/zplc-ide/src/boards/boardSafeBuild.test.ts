import { describe, expect, test } from 'bun:test';
import { readArtifact } from '@zplc/compiler';
import { CompilerError, compileMultiTaskProject } from '../compiler';
import type { IOConfig } from '../types';

const PROGRAM = 'PROGRAM Main\nVAR\nLed AT %QX0.4 : BOOL;\nValve AT %QX0.0 : BOOL;\nEND_VAR\n    Led := TRUE;\nEND_PROGRAM';

function build(board: string | undefined, io?: IOConfig) {
  return compileMultiTaskProject(
    {
      name: 'SafeBoard', version: '1.0.0', ...(board ? { target: { board } } : {}), ...(io ? { io } : {}),
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main'] }],
    },
    [{ name: 'Main', sourceRef: 'src/Main.st', language: 'ST', content: PROGRAM }],
  );
}

function refusal(board: string | undefined, io: IOConfig): CompilerError {
  try {
    build(board, io);
  } catch (error) {
    if (error instanceof CompilerError) return error;
    throw error;
  }
  throw new Error('the build succeeded');
}

describe('a safe value declared by the project is in the artifact (RT-023)', () => {
  test('an output declared on builds, and the artifact and the result both say it', () => {
    const result = build('rpi_pico', { outputs: [{ name: 'Valve', address: '%QX0.0', type: 'BOOL', safe: true }] });
    expect(readArtifact(result.zplcFile).safe).toEqual([{ offset: 0, bit: 0, value: 1 }]);
    expect(result.safe).toEqual([{ offset: 0, bit: 0, value: 1 }]);
    expect(result.declaredSafe).toEqual([{ name: 'Valve', address: '%QX0.0', value: true }]);
  });

  test('a project that declares nothing builds an artifact with no SAFE segment', () => {
    const result = build('rpi_pico', { outputs: [{ name: 'Valve', address: '%QX0.0', type: 'BOOL' }] });
    expect(readArtifact(result.zplcFile).safe).toEqual([]);
    expect(result.declaredSafe).toEqual([]);
  });

  test('an output the board does not have is a build error: there is no artifact to deploy', () => {
    const error = refusal('rpi_pico', { outputs: [{ name: 'Ghost', address: '%QX0.6', type: 'BOOL', safe: true }] });
    expect(error.detail).toContain("'Ghost'");
    expect(error.detail).toContain('%QX0.6');
    expect(error.detail).toContain('Raspberry Pi Pico (RP2040)');
  });

  test('a safe value that is not true or false is a build error', () => {
    const error = refusal('rpi_pico', { outputs: [{ name: 'Valve', address: '%QX0.0', type: 'BOOL', safe: 'on' as unknown as boolean }] });
    expect(error.detail).toContain('true or false');
  });

  test('every declaration with a problem is reported, not only the first', () => {
    const error = refusal('rpi_pico', {
      outputs: [
        { name: 'A', address: '%QX0.6', type: 'BOOL', safe: true },
        { name: 'B', address: '%QW0', type: 'INT', safe: true },
      ],
    });
    const text = error.errors.map((each) => each.detail).join('\n');
    expect(text).toContain("'A'");
    expect(text).toContain("'B'");
  });

  test('the host and a custom board take any bit of the image', () => {
    for (const board of [undefined, 'posix', 'custom']) {
      const result = build(board, { outputs: [{ name: 'Relay', address: '%QX3.2', type: 'BOOL', safe: true }] });
      expect(result.safe).toEqual([{ offset: 3, bit: 2, value: 1 }]);
    }
  });
});
