/**
 * The SHA-256 of the artifact the deploy flow last sent to the board (LRN-023, LRN-024): the hardware check records it as the
 * program hash of its grade. The deploy flow clears it when a transfer begins and publishes it once the transfer succeeded,
 * so a failed or unconfirmed deploy leaves no hash behind. Not saved: a session starts without one.
 */
import { create } from 'zustand';

interface DeployedProgramState {
  sha256: string | null;
  publish: (artifact: Uint8Array) => Promise<void>;
  clear: () => void;
}

let generation = 0;

export const useDeployedProgram = create<DeployedProgramState>((set) => ({
  sha256: null,
  publish: async (artifact) => {
    const mine = ++generation;
    set({ sha256: null });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', artifact.slice()));
    // A later clear or publish wins over this one.
    if (mine === generation) set({ sha256: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
  },
  clear: () => { generation += 1; set({ sha256: null }); },
}));
