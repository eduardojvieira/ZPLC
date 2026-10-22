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
