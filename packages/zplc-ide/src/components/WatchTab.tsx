import { useMemo } from 'react';
import type { DebugController } from '../hooks/useDebugController';
import { useBoundPlantMap } from '../plant/ui/usePlantSession';
import { resolvePlantMap } from '../plants/plantMap';
import { plantFedPaths } from '../runtime/faceplateState';
import { listIoMap } from '../runtime/ioMap';
import { useIDEStore } from '../store/useIDEStore';
import { DebugWatchPanel } from './DebugWatchPanel';
import { FaceplatePanel } from './FaceplatePanel';

/**
 * The inputs the running plant session feeds (PLS-007), by qualified path; none while no plant session is bound. A signal the
 * program does not declare feeds nothing, and leaves the other inputs of the map marked.
 */
function usePlantFed(): ReadonlySet<string> | undefined {
  const map = useBoundPlantMap();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  return useMemo(() => (map ? plantFedPaths(resolvePlantMap(map, listIoMap(debugMap))) : undefined), [map, debugMap]);
}

/** The Watch tab: the live I/O faceplate of the running program (LRN-017, IDE-024), above the watch table. */
export function WatchTab({ controller }: { controller?: DebugController }) {
  const plantFed = usePlantFed();
  return (
    <>
      <div className="px-2 pt-2">
        <FaceplatePanel controller={controller} plantFed={plantFed} />
      </div>
      <DebugWatchPanel
        plantFed={plantFed}
        setValue={controller?.setValue}
        toggleForceValue={controller?.toggleForceValue}
        clearAllForcedValues={controller?.clearAllForcedValues}
        hasActiveSerialSession={controller?.adapter?.type === 'serial' && controller.adapter.connected}
      />
    </>
  );
}
