import { describe, expect, it } from 'bun:test';

import { describeUpdateCheck, runUpdateCheck } from './updateCheckBridge';

describe('update check bridge adapter (IDE-010)', () => {
  it('returns the validated answer of the main process', async () => {
    const answer = { status: 'available', current: '2.0.0', latest: '2.0.1', url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1' } as const;
    await expect(runUpdateCheck({ run: async () => answer }, '2.0.0')).resolves.toEqual(answer);
  });

  it('says it could not tell when there is no bridge, the call fails or the answer is not one', async () => {
    const unavailable = { status: 'unavailable', current: '2.0.0' } as const;
    await expect(runUpdateCheck(undefined, '2.0.0')).resolves.toEqual(unavailable);
    await expect(runUpdateCheck({ run: async () => { throw new Error('Request denied'); } }, '2.0.0')).resolves.toEqual(unavailable);
    await expect(runUpdateCheck({ run: async () => ({ status: 'available', current: '2.0.0', latest: '2.0.1', url: 'https://evil.example' }) }, '2.0.0')).resolves.toEqual(unavailable);
  });

  it('describes each answer in one plain line', () => {
    expect(describeUpdateCheck({ status: 'available', current: '2.0.0', latest: '2.0.1', url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1' })).toContain('2.0.1');
    expect(describeUpdateCheck({ status: 'current', current: '2.0.0', latest: '2.0.0' })).toContain('up to date');
    expect(describeUpdateCheck({ status: 'unavailable', current: '2.0.0' })).toContain('Could not check');
  });
});
