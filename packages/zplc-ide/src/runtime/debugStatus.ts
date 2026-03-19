import type { StatusInfo } from './serialAdapter';
import type { VMState } from './debugAdapter';

export interface DerivedHardwareDebugState {
  vmState: VMState;
  halted: boolean;
}

export function deriveHardwareDebugState(status: StatusInfo): DerivedHardwareDebugState {
  const normalized = status.state.trim().toLowerCase();
  const halted = normalized === 'paused';

  if (normalized === 'paused') {
    return { vmState: 'paused', halted: true };
  }

  if (normalized === 'running') {
    return { vmState: 'running', halted: false };
  }

  if (normalized === 'idle' || normalized === 'ready') {
    return { vmState: 'idle', halted: false };
  }

  return { vmState: 'error', halted };
}
