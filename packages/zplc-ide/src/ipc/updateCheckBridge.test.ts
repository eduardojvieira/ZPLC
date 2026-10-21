import { describe, expect, it } from 'bun:test';

import type { UpdateCheckResult } from '../../electron/updateCheckProtocol';
import { describeUpdateCheck, runUpdateCheck, startUpdateCheck } from './updateCheckBridge';

describe('update check bridge adapter (IDE-010)', () => {
  it('returns the validated answer of the main process', async () => {
    const answer = {
      status: 'available',
      current: '2.0.0',
      latest: '2.0.1',
      url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1',
    } as const;
    await expect(runUpdateCheck({ run: async () => answer }, '2.0.0')).resolves.toEqual(answer);
  });

  it('says it could not tell when there is no bridge, the call fails or the answer is not one', async () => {
    const unavailable = { status: 'unavailable', current: '2.0.0' } as const;
    await expect(runUpdateCheck(undefined, '2.0.0')).resolves.toEqual(unavailable);
    await expect(
      runUpdateCheck(
        {
          run: async () => {
            throw new Error('Request denied');
          },
        },
        '2.0.0',
      ),
    ).resolves.toEqual(unavailable);
    await expect(
      runUpdateCheck(
        { run: async () => ({ status: 'available', current: '2.0.0', latest: '2.0.1', url: 'https://evil.example' }) },
        '2.0.0',
      ),
    ).resolves.toEqual(unavailable);
  });

  it('describes each answer in one plain line', () => {
    expect(
      describeUpdateCheck({
        status: 'available',
        current: '2.0.0',
        latest: '2.0.1',
        url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1',
      }),
    ).toContain('2.0.1');
    expect(describeUpdateCheck({ status: 'current', current: '2.0.0', latest: '2.0.0' })).toContain('up to date');
    expect(describeUpdateCheck({ status: 'unavailable', current: '2.0.0' })).toContain('Could not check');
  });
});

describe('the update check at start, as App runs it (REL-021)', () => {
  const available = {
    status: 'available',
    current: '2.0.0',
    latest: '2.0.1',
    url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1',
  } as const;
  const bridge = (calls: string[]) => ({
    run: async () => {
      calls.push('asked');
      return available;
    },
  });

  it('asks nothing and reports nothing while the user has the check turned off', async () => {
    const calls: string[] = [];
    const reported: UpdateCheckResult[] = [];
    startUpdateCheck(false, bridge(calls), '2.0.0', (result) => reported.push(result));
    await Bun.sleep(5);
    expect({ calls, reported }).toEqual({ calls: [], reported: [] });
  });

  it('reports the answer once when the check is on, and again when it is turned off and on', async () => {
    const calls: string[] = [];
    const reported: UpdateCheckResult[] = [];
    const stop = startUpdateCheck(true, bridge(calls), '2.0.0', (result) => reported.push(result));
    await Bun.sleep(5);
    stop();
    startUpdateCheck(true, bridge(calls), '2.0.0', (result) => reported.push(result));
    await Bun.sleep(5);
    expect({ calls, reported }).toEqual({ calls: ['asked', 'asked'], reported: [available, available] });
  });

  it('drops an answer that arrives after the check was turned off, and reports "could not tell" when offline', async () => {
    const reported: UpdateCheckResult[] = [];
    const stop = startUpdateCheck(true, { run: async () => available }, '2.0.0', (result) => reported.push(result));
    stop();
    await Bun.sleep(5);
    expect(reported).toEqual([]);
    startUpdateCheck(
      true,
      {
        run: async () => {
          throw new Error('offline');
        },
      },
      '2.0.0',
      (result) => reported.push(result),
    );
    await Bun.sleep(5);
    expect(reported).toEqual([{ status: 'unavailable', current: '2.0.0' }]);
  });
});
