import type { DebugController } from '../hooks/useDebugController';
import { DebugWatchPanel } from './DebugWatchPanel';
import { SimulationInputsPanel } from './SimulationInputsPanel';

/** The Watch tab: the inputs the running program declares (IDE-024), above the watch table. */
export function WatchTab({ controller }: { controller?: DebugController }) {
  return (
    <>
      <div className="px-2 pt-2"><SimulationInputsPanel controller={controller} /></div>
      <DebugWatchPanel
        setValue={controller?.setValue}
        toggleForceValue={controller?.toggleForceValue}
        clearAllForcedValues={controller?.clearAllForcedValues}
        hasActiveSerialSession={controller?.adapter?.type === 'serial' && controller.adapter.connected}
      />
    </>
  );
}
