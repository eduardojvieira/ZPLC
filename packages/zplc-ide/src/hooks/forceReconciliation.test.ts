import { describe, expect, it } from 'bun:test';

import type { IDebugAdapter } from '../runtime/debugAdapter';
import { isCurrentSerialAdapter, shouldMarkForceCommandFailureUnconfirmed, usesConnectionManager } from './forceReconciliation';

describe('isCurrentSerialAdapter', () => {
  it('rejects a stale serial result after replacement', () => {
    const oldAdapter = { type: 'serial' } as IDebugAdapter;
    const replacement = { type: 'serial' } as IDebugAdapter;

    expect(isCurrentSerialAdapter(replacement, oldAdapter)).toBe(false);
    expect(isCurrentSerialAdapter(oldAdapter, oldAdapter)).toBe(true);
  });

  it('never grants force-reconciliation authority to simulation', () => {
    const simulation = { type: 'native' } as IDebugAdapter;
    expect(isCurrentSerialAdapter(simulation, simulation)).toBe(false);
  });
});

describe('usesConnectionManager', () => {
  it('keeps serial lifecycle and unmount cleanup on the connection manager path', () => {
    expect(usesConnectionManager({ type: 'serial' } as IDebugAdapter)).toBe(true);
    expect(usesConnectionManager({ type: 'native' } as IDebugAdapter)).toBe(false);
    expect(usesConnectionManager(null)).toBe(false);
  });
});

describe('shouldMarkForceCommandFailureUnconfirmed', () => {
  it('marks a failed serial force set as unconfirmed only while that session is current', () => {
    const serial = { type: 'serial' } as IDebugAdapter;
    expect(shouldMarkForceCommandFailureUnconfirmed(serial, serial)).toBe(true);
  });

  it('marks a failed serial force clear as unconfirmed only while that session is current', () => {
    const serial = { type: 'serial' } as IDebugAdapter;
    const replacement = { type: 'serial' } as IDebugAdapter;
    expect(shouldMarkForceCommandFailureUnconfirmed(serial, serial)).toBe(true);
    expect(shouldMarkForceCommandFailureUnconfirmed(replacement, serial)).toBe(false);
  });
});
