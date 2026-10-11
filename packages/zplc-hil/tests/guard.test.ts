import { describe, expect, test } from 'bun:test';

import { confirmPhysicalStep, IdentityMismatchError, NotInteractiveError, requireInteractive } from '../src/guard';
import type { HumanIo } from '../src/guard';

function person(answers: string[], interactive = true): HumanIo & { said: string[] } {
  const said: string[] = [];
  return { interactive, said, say: (text) => { said.push(text); }, ask: (prompt) => { said.push(prompt); return Promise.resolve(answers.shift() ?? ''); } };
}

describe('the human-presence guard (HIL-003)', () => {
  test('a command without an interactive terminal is refused with an error', () => {
    expect(() => requireInteractive(person([], false), 'a hardware scenario run')).toThrow(NotInteractiveError);
    expect(() => requireInteractive(person([], true), 'a hardware scenario run')).not.toThrow();
  });

  test('a physical step is confirmed only by typing the identity the device reports', async () => {
    const io = person(['rpi_pico']);
    const confirmation = await confirmPhysicalStep(io, { id: 'safe', title: 'Safe to drive', instruction: 'Check the outputs.' }, 'rpi_pico', { now: () => new Date('2026-10-10T12:00:00Z') });
    expect(confirmation).toEqual({ stepId: 'safe', confirmedAt: '2026-10-10T12:00:00.000Z', confirmedIdentity: 'rpi_pico' });
    expect(io.said.join('\n')).toContain('Check the outputs.');
  });

  test('Enter alone, or another board, does not confirm it', async () => {
    await expect(confirmPhysicalStep(person(['', '']), { id: 's', title: 't', instruction: 'i' }, 'rpi_pico')).rejects.toBeInstanceOf(IdentityMismatchError);
    await expect(confirmPhysicalStep(person(['esp32s3', 'esp32s3']), { id: 's', title: 't', instruction: 'i' }, 'rpi_pico')).rejects.toBeInstanceOf(IdentityMismatchError);
  });

  test('a second try is allowed, a third is not', async () => {
    expect((await confirmPhysicalStep(person(['rpi', 'rpi_pico']), { id: 's', title: 't', instruction: 'i' }, 'rpi_pico')).confirmedIdentity).toBe('rpi_pico');
    await expect(confirmPhysicalStep(person(['a', 'b', 'rpi_pico']), { id: 's', title: 't', instruction: 'i' }, 'rpi_pico')).rejects.toBeInstanceOf(IdentityMismatchError);
  });
});
