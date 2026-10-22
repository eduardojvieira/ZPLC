import { describe, expect, test } from 'bun:test';
import { teardown } from './teardown';

describe('teardown of the browser test environment', () => {
  test('names the step that does not finish, in seconds, and still runs the steps after it', async () => {
    const ran: string[] = [];
    const started = Date.now();
    const error = await teardown(
      [
        ['stop the browser', () => new Promise<void>(() => undefined)],
        ['close the server', async () => void ran.push('close the server')],
      ],
      50,
    ).then(
      () => undefined,
      (caught: Error) => caught,
    );
    expect(error?.message).toContain('stop the browser');
    expect(error?.message).toContain('50 ms');
    expect(ran).toEqual(['close the server']);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  test('reports a late step marked as a warning on stderr without failing, and still runs the steps after it', async () => {
    const ran: string[] = [];
    const warnings: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => (warnings.push(String(chunk)), true)) as typeof process.stderr.write;
    try {
      await teardown(
        [
          ['close the file watcher', () => new Promise<void>(() => undefined), { warn: true }],
          ['delete the profile', async () => void ran.push('delete the profile')],
        ],
        50,
      );
    } finally {
      process.stderr.write = write;
    }
    expect(ran).toEqual(['delete the profile']);
    expect(warnings.join('')).toContain('close the file watcher: did not finish within 50 ms');
  });

  test('names a step that throws and passes when every step is done', async () => {
    await expect(teardown([['a', async () => undefined]], 50)).resolves.toBeUndefined();
    await expect(
      teardown(
        [
          [
            'remove the profile',
            () => {
              throw new Error('EBUSY');
            },
          ],
        ],
        50,
      ),
    ).rejects.toThrow('remove the profile: EBUSY');
  });
});
