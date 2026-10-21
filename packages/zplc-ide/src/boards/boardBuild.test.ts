import { describe, expect, test } from 'bun:test';
import { CompilerError, compileMultiTaskProject } from '../compiler';

function build(board: string | undefined, declarations: string, io?: { virtual: Array<{ name: string; address: string }> }) {
  return compileMultiTaskProject(
    {
      name: 'IoBoard',
      version: '1.0.0',
      ...(board ? { target: { board } } : {}),
      ...(io ? { io } : {}),
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main'] }],
    },
    [{ name: 'Main', sourceRef: 'src/Main.st', language: 'ST', content: `PROGRAM Main\nVAR\n${declarations}\nEND_VAR\nEND_PROGRAM` }],
  );
}

function refusal(board: string | undefined, declarations: string): CompilerError {
  try {
    build(board, declarations);
  } catch (error) {
    if (error instanceof CompilerError) return error;
    throw error;
  }
  throw new Error('the build succeeded');
}

describe('mapping a variable to a channel the board does not have is a build error (IO-003)', () => {
  test('variables on the channels of the Pico build', () => {
    expect(() => build('rpi_pico', 'Led AT %QX0.4 : BOOL;\nButton AT %IX0.3 : BOOL;\nTemp AT %IW8 : INT;')).not.toThrow();
  });

  test('an output bit past the outputs of the Pico fails and the message names the variable, the address and the board', () => {
    const error = refusal('rpi_pico', 'Led AT %QX0.5 : BOOL;');
    expect(error.detail).toContain("'Led'");
    expect(error.detail).toContain('%QX0.5');
    expect(error.detail).toContain('Raspberry Pi Pico (RP2040)');
  });

  test('an analog input on a board that has none fails', () => {
    const error = refusal('nucleo_h743zi', 'Temp AT %IW4 : INT;');
    expect(error.detail).toContain('STM32 Nucleo-H743ZI');
  });

  test('every variable that has no channel is reported, not only the first', () => {
    const error = refusal('stm32f746g_disco', 'A AT %QX0.1 : BOOL;\nB AT %QX0.2 : BOOL;');
    expect(error.errors.map((each) => each.detail).join('\n')).toContain("'A'");
    expect(error.errors.map((each) => each.detail).join('\n')).toContain("'B'");
  });

  test('a word the project lists as virtual builds: an image word no pin drives is not a missing channel', () => {
    const declarations = 'TempC AT %QW4 : INT;';
    expect(() => build('rpi_pico', declarations)).toThrow(CompilerError);
    expect(() => build('rpi_pico', declarations, { virtual: [{ name: 'TempC', address: '%QW4' }] })).not.toThrow();
    // a virtual entry exempts its own address only
    expect(() => build('rpi_pico', 'Other AT %QW5 : INT;', { virtual: [{ name: 'TempC', address: '%QW4' }] })).toThrow(CompilerError);
  });

  test('the same program builds for the host and for a custom board', () => {
    for (const board of [undefined, 'posix', 'custom']) {
      expect(() => build(board, 'Led AT %QX0.5 : BOOL;')).not.toThrow();
    }
  });

  test('the first four outputs and inputs keep the addresses programs used before the description', () => {
    for (const board of ['rpi_pico', 'esp32s3_devkitc', 'arduino_opta_wifi']) {
      const declarations = ['%QX0.0', '%QX0.1', '%QX0.2', '%QX0.3'].map((address, index) => `Out${index} AT ${address} : BOOL;`).join('\n');
      expect(() => build(board, declarations), board).not.toThrow();
    }
  });
});
