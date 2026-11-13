/**
 * Which transport the command bar drives (Task W4, contract C8). A plant document registers the session of the scene it shows;
 * with none registered the command bar drives the debug controller exactly as before. The registry can be subscribed to, so the
 * command bar and the status rail repaint when a plant binds, unbinds, changes state or changes its slowdown (PLS-003, PLS-013).
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import type { DebugController } from '../hooks/debugControllerTypes';
import { programTransport, type Transport } from '../runtime/transport';

let registered: Transport | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Registers the plant transport (at most one: a later one replaces an earlier one). Returns the function that unregisters it. */
export function registerPlantTransport(transport: Transport): () => void {
  registered = transport;
  emit();
  return () => {
    if (registered === transport) {
      registered = undefined;
      emit();
    }
  };
}

/** The registered plant transport, if a plant document bound one. */
export function registeredPlantTransport(): Transport | undefined {
  return registered;
}

/** Calls `listener` when a plant transport is registered or unregistered. Returns the function that unsubscribes. */
export function subscribeRegisteredPlantTransport(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The registered plant transport, and a repaint of the caller when it is replaced, removed, changes state or its slowdown. */
export function useRegisteredPlantTransport(): Transport | undefined {
  const transport = useSyncExternalStore(subscribeRegisteredPlantTransport, registeredPlantTransport);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport?.onChange(refresh), [transport]);
  return transport;
}

/** The registered plant transport, else `programTransport(controller)`. The command bar calls nothing else. */
export function activeTransport(controller: DebugController): Transport {
  return registered ?? programTransport(controller);
}
