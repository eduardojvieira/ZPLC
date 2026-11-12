/**
 * The plant, as a document of the editor area (spec 013 PLS-001, decision D-20). It shows the scene panel when the project
 * has a scene, else the live plant of 2.0, and the replay of the last recorded run when there is one; a switch chooses
 * between live and replay. It has no run controls: the command bar is the only transport (PLS-003).
 */
import { useMemo, useState } from 'react';
import { LabPanel } from '../components/LabPanel';
import { recordedLabScenes } from '../components/labPlayback';
import { LESSON_INDEX } from '../generated/lessonIndex';
import type { DebugController } from '../hooks/useDebugController';
import { useT } from '../i18n';
import { PlantPanel } from '../plant/ui/PlantPanel';
import { PlantLivePanel } from '../plants/PlantLivePanel';
import { resolvePlantMap } from '../plants/plantMap';
import { listIoMap } from '../runtime/ioMap';
import { runCommand } from '../commands/bus';
import { useIDEStore } from '../store/useIDEStore';
import { Button, ToggleGroup } from '../ui';
import { useWorkspaceTestResult } from './workspaceTestResult';

/** The project's scene file (`scene.json` at the project root, spec 012 SCN-006). */
const hasProjectScene = (files: ReadonlyMap<string, { path: string }>): boolean =>
  [...files.values()].some((file) => file.path === 'scene.json');

export function PlantDocument({ controller, visible }: { controller: DebugController | undefined; visible: boolean }) {
  const { t } = useT();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const sceneOpen = useIDEStore((state) => hasProjectScene(state.loadedFiles));
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  const [view, setView] = useState<'live' | 'replay'>('live');

  // The live plant of 2.0 exists when a lesson mapping binds to every I/O point of the loaded program, as `PlantLivePanel` decides.
  const liveOpen = useMemo(() => {
    const ioMap = listIoMap(debugMap);
    return LESSON_INDEX.lessons.some((lesson) => lesson.plantMap && resolvePlantMap(lesson.plantMap, ioMap).problems.length === 0);
  }, [debugMap]);
  const replayOpen = useMemo(() => recordedLabScenes(presentation ?? null).length > 0, [presentation]);
  const liveShown = sceneOpen || liveOpen;
  const showing = liveShown && (view === 'live' || !replayOpen) ? 'live' : replayOpen ? 'replay' : 'none';

  return (
    <div
      data-plant-document
      data-visible={visible}
      role="region"
      aria-label={t('studio.surface.plant')}
      className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--color-surface-900)]"
    >
      {liveShown && replayOpen && (
        <ToggleGroup
          label={t('studio.plant.views')}
          className="m-2 self-start"
          options={[
            { value: 'live', label: t('studio.plant.live') },
            { value: 'replay', label: t('studio.plant.replay') },
          ]}
          value={showing}
          onValueChange={(value) => setView(value === 'replay' ? 'replay' : 'live')}
        />
      )}
      {showing === 'live' &&
        (sceneOpen ? <PlantPanel controller={controller} visible={visible} /> : <PlantLivePanel controller={controller} />)}
      {showing === 'replay' && <LabPanel presentation={presentation ?? null} />}
      {showing === 'none' && (
        <div className="p-4 text-sm text-[var(--text-secondary)]">
          <p>{t('studio.plant.empty')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => runCommand('view.tests')}>
            {t('studio.plant.showTests')}
          </Button>
        </div>
      )}
    </div>
  );
}
