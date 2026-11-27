import { useMemo } from 'react';
import type { DebugController } from '../hooks/useDebugController';
import { DebugWatchPanel } from './DebugWatchPanel';
import { FaceplatePanel } from './FaceplatePanel';
import { useProjectSceneTexts } from '../plant/ui/usePlantSession';
import { resolvePlantMap, validatePlantMap, type PlantMap } from '../plants/plantMap';
import { plantFedPaths } from '../runtime/faceplateState';
import { listIoMap } from '../runtime/ioMap';
import { useIDEStore } from '../store/useIDEStore';

/** The inputs the project's plant map drives (PLS-007); none with no map, an invalid one, or a point the program does not declare. */
function usePlantFed(): ReadonlySet<string> | undefined {
  const { map } = useProjectSceneTexts();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  return useMemo(() => {
    if (!map) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(map);
    } catch {
      return undefined;
    }
    if (validatePlantMap(parsed).length > 0) return undefined;
    const ioMap = listIoMap(debugMap);
    const resolved = resolvePlantMap(parsed as PlantMap, ioMap);
    return resolved.problems.length > 0 ? undefined : plantFedPaths(resolved, ioMap.inputs);
  }, [map, debugMap]);
}

/** The Watch tab: the live I/O faceplate of the running program (LRN-017, IDE-024), above the watch table. */
export function WatchTab({ controller }: { controller?: DebugController }) {
  const plantFed = usePlantFed();
  return (
    <>
      <div className="px-2 pt-2">
        <FaceplatePanel controller={controller} />
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
