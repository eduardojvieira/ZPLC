import { describe, expect, it } from 'bun:test';

import { consumeSerialConsoleChunk, flushSerialConsoleRemainder } from './serialConsole';
import { sanitizeUploadTraceText } from './uploadTrace';

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

  it('strips backspace control characters from device logs', () => {
    expect(consumeSerialConsoleChunk('', 'zplc\u0008 status\n')).toEqual({
      lines: ['zplc status'],
      remainder: '',
    });
  });

  it('keeps a split sensitive echo in the remainder until the complete line can be redacted', () => {
    const first = consumeSerialConsoleChunk('', 'zplc:~$ zplc config set wifi_pass "test-');
    expect(first.lines).toEqual([]);
    const second = consumeSerialConsoleChunk(first.remainder, 'secret"\nnormal line\n');

    expect(second.lines.map(sanitizeUploadTraceText)).toEqual([
      'zplc config set wifi_pass "***"',
      'normal line',
    ]);
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
