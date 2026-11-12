/**
 * Which transport the command bar drives (Task W4, contract C8). A plant document registers the session of the scene it shows;
 * with none registered the command bar drives the debug controller exactly as before.
 */
import type { DebugController } from '../hooks/debugControllerTypes';
import { programTransport, type Transport } from '../runtime/transport';

let registered: Transport | undefined;

/** Registers the plant transport (at most one: a later one replaces an earlier one). Returns the function that unregisters it. */
export function registerPlantTransport(transport: Transport): () => void {
  registered = transport;
  return () => {
    if (registered === transport) registered = undefined;
  };
}

/** The registered plant transport, else `programTransport(controller)`. The command bar calls nothing else. */
export function activeTransport(controller: DebugController): Transport {
  return registered ?? programTransport(controller);
}
