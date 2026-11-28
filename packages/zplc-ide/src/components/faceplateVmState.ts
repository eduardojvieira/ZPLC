/** The state the faceplate reads: the plant session's while a plant document has bound one, as the status rail does (PLS-013). */
import type { TransportState } from '../runtime/transport';

const VM_OF_TRANSPORT: Record<TransportState, string> = {
  running: 'running',
  paused: 'paused',
  held: 'paused',
  faulted: 'error',
  stopped: 'stopped',
};

export function faceplateVmState(vmState: string, plantState: TransportState | undefined): string {
  return plantState === undefined ? vmState : VM_OF_TRANSPORT[plantState];
}
