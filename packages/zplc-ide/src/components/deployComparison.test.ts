import { describe, expect, it } from 'bun:test';
import { translatorFor } from '../i18n';
import { compareDeployFacts, type DeployFacts } from './deployComparison';

const { t } = translatorFor('en');
const facts: DeployFacts = {
  project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: 1, minor: 0, draft: 6 }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 },
  device: { board: 'stm32f746g_disco', boardProfile: 'stm32f746g_disco/stm32f746xx', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 },
  declaredSafe: [],
  transfer: 'framed',
};
const row = (compared: ReturnType<typeof compareDeployFacts>, id: string) => compared.rows.find((entry) => entry.id === id)!;
const withDevice = (device: Partial<NonNullable<DeployFacts['device']>>): DeployFacts => ({ ...facts, device: { ...facts.device!, ...device } });

describe('UX-019 deploy comparison of the project and the device', () => {
  it('UX-019 compares board, profile, firmware and ABI version, program identity, size and tasks, in that order', () => {
    const compared = compareDeployFacts(facts, t);
    expect(compared.rows.map((entry) => entry.id)).toEqual(['board', 'profile', 'firmware', 'abi', 'identity', 'size', 'tasks']);
    expect(compared.blocked).toBe(false);
    expect(row(compared, 'board')).toMatchObject({ label: 'Board', project: 'STM32F746G Discovery', device: 'stm32f746g_disco', status: 'match' });
    expect(row(compared, 'abi')).toMatchObject({ project: '1.0, contract draft 6', device: '1.0, contract draft 6', status: 'match' });
    expect(row(compared, 'size')).toMatchObject({ project: '512 bytes', device: 'Up to 4096 bytes', status: 'match' });
    expect(row(compared, 'tasks')).toMatchObject({ project: '2', device: 'Up to 4', status: 'match' });
    expect(row(compared, 'firmware')).toMatchObject({ device: '1.0.0 (Zephyr 4.0.0)', status: 'info' });
  });

  it('UX-019 shows what the device does not report as such and never invents it, and does not block on it', () => {
    const compared = compareDeployFacts(withDevice({ maxArtifactBytes: null, maxTasks: null }), t);
    expect(row(compared, 'identity')).toMatchObject({ device: 'Not reported by the device', status: 'unreported' });
    expect(row(compared, 'size')).toMatchObject({ device: 'Not reported by the device', status: 'unreported' });
    expect(row(compared, 'tasks')).toMatchObject({ device: 'Not reported by the device', status: 'unreported' });
    expect(compared.blocked).toBe(false);
  });

  it('UX-019 highlights a different board profile on the board and the profile rows, with a message for the profile', () => {
    const compared = compareDeployFacts(withDevice({ boardProfile: 'rpi_pico/rp2040' }), t);
    expect(row(compared, 'board').status).toBe('mismatch');
    expect(row(compared, 'profile')).toMatchObject({ status: 'mismatch', device: 'rpi_pico/rp2040' });
    expect(row(compared, 'profile').message).toContain('builds for stm32f746g_disco/stm32f746xx and the device reports rpi_pico/rp2040');
    expect(compared.blocked).toBe(true);
  });

  it('UX-019 highlights a different ABI version or contract draft and says what to do', () => {
    const minor = compareDeployFacts(withDevice({ abi: { major: 1, minor: 1 } }), t);
    expect(row(minor, 'abi')).toMatchObject({ status: 'mismatch', device: '1.1, contract draft 6' });
    expect(row(minor, 'abi').message).toContain('Rebuild the program or install matching firmware');
    const draft = compareDeployFacts(withDevice({ draft: 7 }), t);
    expect(row(draft, 'abi')).toMatchObject({ status: 'mismatch', device: '1.0, contract draft 7' });
    const none = compareDeployFacts(withDevice({ draft: null }), t);
    expect(row(none, 'abi')).toMatchObject({ status: 'mismatch', device: '1.0, no contract draft' });
    expect(minor.blocked && draft.blocked && none.blocked).toBe(true);
  });

  it('UX-019 highlights a program larger than the device accepts and more tasks than it supports', () => {
    const size = compareDeployFacts(withDevice({ maxArtifactBytes: 256 }), t);
    expect(row(size, 'size')).toMatchObject({ status: 'mismatch' });
    expect(row(size, 'size').message).toBe('The program is 512 bytes and the device accepts at most 256.');
    const tasks = compareDeployFacts(withDevice({ maxTasks: 1 }), t);
    expect(row(tasks, 'tasks')).toMatchObject({ status: 'mismatch', device: 'Up to 1' });
    expect(row(tasks, 'tasks').message).toBe('The program has 2 tasks and the device supports 1.');
    expect(size.blocked && tasks.blocked).toBe(true);
  });

  it('UX-019 compares nothing and blocks when the device gave no valid system information', () => {
    const compared = compareDeployFacts({ ...facts, device: null }, t);
    expect(compared.blocked).toBe(true);
    expect(compared.rows.every((entry) => entry.status === 'unreported')).toBe(true);
    expect(compared.rows.every((entry) => entry.device === 'Not reported by the device')).toBe(true);
    expect(compared.notes).toContain('The device did not report valid system information.');
  });

  it('UX-019 states the safe values of the outputs during the transfer exactly as the runtime guarantees them (RT-023)', () => {
    expect(compareDeployFacts(facts, t).safeState).toBe('Every output stays off while the old program stops, the new one is written and the PLC stays stopped.');
    const declared = compareDeployFacts({ ...facts, declaredSafe: [{ address: '%QX0.1', value: true }, { address: '%QX0.3', value: false }] }, t);
    expect(declared.safeState).toContain('Declared by the project: %QX0.1: on, %QX0.3: off.');
    expect(declared.safeState).toContain('Every other output is off.');
    expect(declared.scope).toBe('This is checked by host and simulator tests. Studio does not measure the pins of this board.');
  });

  it('UX-019 says how the program travels, and that the older text shell does not read it back (COM-028)', () => {
    expect(compareDeployFacts(facts, t).transfer).toContain('CRC-32');
    expect(compareDeployFacts({ ...facts, transfer: 'text-shell' }, t).transfer).toContain('not read back');
  });

  it('UX-019 speaks Spanish with the words of the rest of the interface', () => {
    const es = compareDeployFacts(withDevice({ maxTasks: 1 }), translatorFor('es').t);
    expect(row(es, 'tasks').message).toBe('El programa tiene 2 tareas y el dispositivo admite 1.');
    expect(row(es, 'tasks').label).toBe('Tareas');
  });
});
