import { describe, expect, it } from 'bun:test';

import { consumeSerialConsoleChunk, flushSerialConsoleRemainder } from './serialConsole';

describe('consumeSerialConsoleChunk', () => {
  it('extracts complete lines and preserves partial remainder', () => {
    expect(consumeSerialConsoleChunk('', 'hello\nworld')).toEqual({
      lines: ['hello'],
      remainder: 'world',
    });
  });

  it('drops prompt-only noise and strips leading prompts from echoed lines', () => {
    expect(consumeSerialConsoleChunk('', 'zplc:~$ \nzplc:~$ zplc status --json\n')).toEqual({
      lines: ['zplc status --json'],
      remainder: '',
    });
  });

  it('strips ansi sequences from device logs', () => {
    expect(consumeSerialConsoleChunk('', '\u001b[1;32mzplc:~$ \u001b[m[CORE] loaded\n')).toEqual({
      lines: ['[CORE] loaded'],
      remainder: '',
    });
  });
});

describe('flushSerialConsoleRemainder', () => {
  it('flushes a final meaningful line', () => {
    expect(flushSerialConsoleRemainder('last line')).toEqual(['last line']);
  });

  it('ignores empty or prompt-only remainder', () => {
    expect(flushSerialConsoleRemainder('')).toEqual([]);
    expect(flushSerialConsoleRemainder('zplc:~$ ')).toEqual([]);
  });
});
