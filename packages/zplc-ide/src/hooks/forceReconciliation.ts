import type { IDebugAdapter } from '../runtime/debugAdapter';

export function isCurrentSerialAdapter(active: IDebugAdapter | null, candidate: IDebugAdapter): boolean {
  return active === candidate && candidate.type === 'serial';
}

export function usesConnectionManager(adapter: IDebugAdapter | null): boolean {
  return adapter?.type === 'serial';
}

export function shouldMarkForceCommandFailureUnconfirmed(
  active: IDebugAdapter | null,
  candidate: IDebugAdapter,
): boolean {
  return isCurrentSerialAdapter(active, candidate);
}
