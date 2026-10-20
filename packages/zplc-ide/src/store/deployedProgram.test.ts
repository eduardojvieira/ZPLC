import { afterEach, describe, expect, it } from 'bun:test';
import { useDeployedProgram } from './deployedProgram';

afterEach(() => useDeployedProgram.getState().clear());

describe('the program hash of the hardware grade (LRN-023, LRN-024)', () => {
  it('LRN-023 holds the SHA-256 of the artifact the deploy flow published, and nothing once cleared', async () => {
    await useDeployedProgram.getState().publish(new TextEncoder().encode('abc'));
    expect(useDeployedProgram.getState().sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    useDeployedProgram.getState().clear();
    expect(useDeployedProgram.getState().sha256).toBeNull();
  });

  it('LRN-023 keeps no hash of a deploy that was cleared while it was being hashed', async () => {
    const publishing = useDeployedProgram.getState().publish(new Uint8Array([1, 2, 3]));
    useDeployedProgram.getState().clear();
    await publishing;
    expect(useDeployedProgram.getState().sha256).toBeNull();
  });
});
