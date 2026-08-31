import { describe, expect, it } from 'bun:test';

import { isNativeCapabilityProfile } from './runtimeSnapshot';

describe('isNativeCapabilityProfile', () => {
  it('rejects malformed feature entries without throwing', () => {
    for (const profile of [
      { profile_id: 'native-posix-mvp', features: [null] },
      { profile_id: 'native-posix-mvp', features: [['simulation-inputs']] },
      { profile_id: 'native-posix-mvp', features: [{ name: '', status: 'supported' }] },
      { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'unknown' }] },
      { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported', reason: 1 }] },
    ]) {
      expect(isNativeCapabilityProfile(profile)).toBe(false);
    }
  });
});
