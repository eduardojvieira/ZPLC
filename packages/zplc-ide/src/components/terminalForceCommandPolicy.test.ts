import { describe, expect, it } from 'bun:test';

import { isTerminalForceMutation } from './terminalForceCommandPolicy';

describe('isTerminalForceMutation', () => {
  it('blocks terminal force set, clear, and clear_all without needing their payload', () => {
    expect(isTerminalForceMutation('zplc dbg force set 0x10 deadbeef')).toBe(true);
    expect(isTerminalForceMutation(' ZPLC\tDBG  FORCE  CLEAR 0x10 ')).toBe(true);
    expect(isTerminalForceMutation('zplc dbg force CLEAR_ALL')).toBe(true);
  });

  it('allows force inspection and unrelated commands', () => {
    expect(isTerminalForceMutation('zplc dbg force list')).toBe(false);
    expect(isTerminalForceMutation('zplc status --json')).toBe(false);
  });
});
