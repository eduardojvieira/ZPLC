import { describe, expect, it } from 'bun:test';

import { terminalDisconnectMessage } from './terminalConnectionPresentation';

describe('terminalDisconnectMessage', () => {
  it('does not present a failed close as disconnected', () => {
    expect(terminalDisconnectMessage(true)).toBe('\n[Disconnected]\n');
    expect(terminalDisconnectMessage(false)).toBe('\n[Connection close failed. Verify device state before operating.]\n');
  });
});
