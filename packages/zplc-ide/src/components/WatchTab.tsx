import type { DebugController } from '../hooks/useDebugController';
import { DebugWatchPanel } from './DebugWatchPanel';
import { FaceplatePanel } from './FaceplatePanel';

/** The Watch tab: the live I/O faceplate of the running program (LRN-017, IDE-024), above the watch table. */
export function WatchTab({ controller }: { controller?: DebugController }) {
  return (
    <>
      <div className="px-2 pt-2">
        <FaceplatePanel controller={controller} />
      </div>
      <DebugWatchPanel
        setValue={controller?.setValue}
        toggleForceValue={controller?.toggleForceValue}
        clearAllForcedValues={controller?.clearAllForcedValues}
        hasActiveSerialSession={controller?.adapter?.type === 'serial' && controller.adapter.connected}
      />
    </>
  );
}
