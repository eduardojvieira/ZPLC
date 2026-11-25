import { expect, test } from 'bun:test';
import { killTree, type OwnedProcess } from './cdpHarness';

const fake = (calls: unknown[]) => ({ pid: 4242, kill: (signal?: string) => calls.push(['kill', signal]) }) as unknown as OwnedProcess;

test('on win32 killTree runs taskkill /T /F on the pid and does not call kill', () => {
  const calls: unknown[] = [];
  killTree(fake(calls), 'SIGTERM', 'win32', ((cmd: string, args: string[]) => calls.push([cmd, args])) as never);
  expect(calls).toEqual([['taskkill', ['/PID', '4242', '/T', '/F']]]);
});

for (const platform of ['linux', 'darwin'] as const) {
  test(`on ${platform} killTree sends the given signal with kill`, () => {
    const calls: unknown[] = [];
    const spawner = (() => calls.push('spawned')) as never;
    killTree(fake(calls), 'SIGTERM', platform, spawner);
    killTree(fake(calls), 'SIGKILL', platform, spawner);
    expect(calls).toEqual([
      ['kill', 'SIGTERM'],
      ['kill', 'SIGKILL'],
    ]);
  });
}
