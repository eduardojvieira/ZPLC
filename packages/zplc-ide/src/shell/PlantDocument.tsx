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
import { PlantPanel, type PlantPanelProps } from '../plant/ui/PlantPanel';
import { useProjectSceneTexts, useProjectScenes } from '../plant/ui/usePlantSession';
import { PlantLivePanel } from '../plants/PlantLivePanel';
import { resolvePlantMap } from '../plants/plantMap';
import { listIoMap } from '../runtime/ioMap';
import { runCommand } from '../commands/bus';
import { usePlantDocument } from '../store/usePlantDocument';
import { useIDEStore } from '../store/useIDEStore';
import { Button, ToggleGroup } from '../ui';
import { useWorkspaceTestResult } from './workspaceTestResult';

export function PlantDocument({
  controller,
  visible,
  deps,
}: {
  controller: DebugController | undefined;
  visible: boolean;
  /** What a test replaces in the scene panel (`PlantPanelProps.deps`). */
  deps?: PlantPanelProps['deps'];
}) {
  const { t } = useT();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const rootScene = useProjectSceneTexts().scene !== undefined;
  const savedScenes = useProjectScenes().names.length > 0;
  // A person asked for a scene: shipped, empty or saved (SCN-001, SCN-016); the scene panel stays until the project changes.
  const [asked, setAsked] = useState(false);
  const sceneOpen = rootScene || savedScenes || asked;
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  const [view, setView] = useState<'live' | 'replay'>('live');
  // "Replay" on a result asks for the recording: the request switches the view once, and the toggle stays free after it (TST-007)
  const replayRequests = usePlantDocument((state) => state.replayRequests);
  const [seenReplay, setSeenReplay] = useState(replayRequests);
  if (seenReplay !== replayRequests) {
    setSeenReplay(replayRequests);
    setView('replay');
  }

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
      {!sceneOpen && (
        <Button data-plant-open-scene variant="secondary" size="sm" className="m-2 self-start" onClick={() => setAsked(true)}>
          {t('studio.plant.openScene')}
        </Button>
      )}
      {showing === 'live' &&
        (sceneOpen ? (
          <PlantPanel controller={controller} visible={visible} {...(deps ? { deps } : {})} />
        ) : (
          <PlantLivePanel controller={controller} />
        ))}
      {showing === 'replay' && (
        <>
          <h2 data-plant-replay className="px-3 pt-2 text-sm font-semibold text-[var(--text-primary)]">
            {t('studio.plant.replay')}
          </h2>
          <LabPanel presentation={presentation ?? null} />
        </>
      )}
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
