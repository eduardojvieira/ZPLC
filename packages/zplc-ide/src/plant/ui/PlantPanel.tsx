/**
 * The 3D plant as the content of the plant document (spec 013 PLS-001, Task V4). It has no run controls: while a session is bound
 * it is the command bar's transport (PLS-003, `usePlantSession`). The toolbar holds only what belongs to a plant: the view switch,
 * the camera presets, "Reset plant" and "Edit scene" (PLS-004); the faults and the items are the operate panel's. A failure of the
 * view or of the scene is said here, with the schematic offered, while the program, the plant core and grading keep running
 * (VIS-006, PLS-009); the facts are always there as text (VIS-008).
 *
 * Interim (plan-u3 P1, removed by P4): the scene being edited is the one edit session (`usePlantEdit`), and its editor still renders
 * here, with Undo, Redo and Done; the scene chooser and the save sit beside it, off the toolbar, until the Plant activity, the
 * navigator and Save all hold them (P2, P5, P6).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import type { PlantMapV2 } from '../../plants/plantMap';
import type { DebugController } from '../../hooks/debugControllerTypes';
import { useT } from '../../i18n';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import { saveProjectScene, saveScene } from '../persistence/sceneFiles';
import { offerSceneFit } from '../../commands/bind/plant';
import { useAppSettings } from '../../store/useAppSettings';
import { useIDEStore } from '../../store/useIDEStore';
import { announce } from '../../utils/announce';
import { Button, Select, ToggleGroup } from '../../ui';
import { SaveSceneButton, SceneChooser } from './SceneChooser';
import { catalogue } from '../core/catalogue';
import { EditorPanel } from '../editor/EditorPanel';
import { usePlantEdit } from '../editSession';
import { schematicFor } from '../schematic/schematic';
import { describePlant } from '../text/describe';
import type { DisplayPrefs } from '../view/displayModes';
import { qualityLevels, type QualityLevel } from '../view/quality';
import type { PlantRenderer } from '../view/renderer';
import { OperatePanel } from './OperatePanel';
import { PlantCanvas } from './PlantCanvas';
import {
  refValue,
  usePlantSession,
  useProjectSceneTexts,
  useProjectScenes,
  type CanvasFailure,
  type CanvasTiming,
  type PlantPanelDeps,
  type SceneOverride,
  type SceneRef,
} from './usePlantSession';
import type { PlantSceneFile } from '../contracts';

export interface PlantPanelProps {
  controller: DebugController | undefined;
  /** False while the document's tab is not the active one of its group (PLS-010). */
  visible: boolean;
  /** What a test replaces: the engine, the session factory and the timings of the fallbacks. */
  deps?: PlantPanelDeps & { timing?: CanvasTiming };
}

const NO_DEPS: PlantPanelDeps = {};

/**
 * What the Plant activity (plan-u3 P2) and the plant document tell each other: `request` is a scene the activity asks the document
 * to show (each panel adopts it, and a panel that mounts later starts on it); `shown` is the scene a panel is showing, which the
 * activity lists. Neither holds an edit: that is the edit session's.
 */
type ShownScene = { key: string; scene: PlantSceneFile; map: PlantMapV2 | undefined };
// A hook beside its component: its own file is outside the surfaces of P2 (move it to `usePlantChoice.ts` with P4).
// eslint-disable-next-line react-refresh/only-export-components
export const usePlantChoice = create<{
  request: SceneRef | undefined;
  shown: ShownScene | undefined;
  ask: (ref: SceneRef) => void;
  show: (shown: ShownScene | undefined) => void;
}>()((set) => ({
  request: undefined,
  shown: undefined,
  ask: (request) => set({ request: { ...request } }),
  show: (shown) => set({ shown }),
}));

/** A scene name as `sceneFilePath` accepts it, from a scene's display name. */
const saveName = (name: string) =>
  name
    .replace(/[^A-Za-z0-9._ -]/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 64);

function Schematic({ scene }: { scene: PlantSceneFile }) {
  const { t } = useT();
  const model = useMemo(() => schematicFor(scene, catalogue), [scene]);
  return (
    <svg
      data-plant-schematic
      role="img"
      aria-label={t('plant.panel.schematic', { scene: scene.name })}
      viewBox={`0 0 ${model.width} ${model.height}`}
      className="h-full min-h-64 w-full bg-[var(--color-surface-800)]"
    >
      {model.shapes.map((shape) => (
        <rect
          key={shape.id}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          transform={`rotate(${shape.rotationDeg} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
      ))}
      {model.labels.map((label) => (
        <text key={`${label.x}:${label.y}:${label.text}`} x={label.x} y={label.y} fontSize={14} fill="currentColor">
          {label.text}
        </text>
      ))}
    </svg>
  );
}

const prefersReduced = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PlantPanel({ controller, visible, deps = NO_DEPS }: PlantPanelProps) {
  const { t, locale } = useT();
  const hasProjectScene = useProjectSceneTexts().scene !== undefined;
  const theme = useIDEStore((state) => state.theme);
  const quality = useAppSettings((state) => state.settings.plantQuality);
  const handle = useIDEStore((state) => state.directoryHandle);
  const saved = useProjectScenes();
  // Until a person chooses, the panel shows the project's own scene, else its first saved one, else the first shipped scene.
  const [choice, setRef] = useState<SceneRef | undefined>(() => usePlantChoice.getState().request);
  const first = saved.names[0];
  const ref: SceneRef =
    choice ??
    (hasProjectScene ? { kind: 'project' } : first ? { kind: 'file', name: first } : { kind: 'shipped', id: SCENE_INDEX[0]?.id ?? '' });
  const [view, setView] = useState<'3d' | 'schematic'>('3d');
  // A failure belongs to the scene it was reported for.
  const [failed, setFailed] = useState<{ key: string; failure: CanvasFailure } | undefined>();
  const [renderer, setRenderer] = useState<PlantRenderer | undefined>();
  // The part whose control in the operate panel has the keyboard focus: the 3D view marks it and names its signals (VIS-003).
  const [focusedPart, setFocusedPart] = useState<string | undefined>();
  // Once editing ends, the edited scene the plant core is rebuilt from.
  const [edited, setEdited] = useState<{ key: string; texts: SceneOverride } | undefined>();
  const refKey = refValue(ref);
  // The scene being edited (SCN-008) is the session's, when it was opened on this scene; `version` re-renders its views.
  const session = usePlantEdit();
  const editing =
    session.editor && session.mapEditor && session.sceneRef === refKey
      ? { editor: session.editor, mapEditor: session.mapEditor }
      : undefined;
  const binding = usePlantSession(controller, ref, deps, edited?.key === refKey ? edited.texts : undefined);
  const { load, snapshot, state } = binding;
  const ready = load.phase === 'ready' ? load : undefined;

  const display = useMemo<DisplayPrefs>(() => {
    const dark =
      theme === 'system'
        ? typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
        : theme === 'dark';
    return { mode: theme === 'high-contrast' ? 'high-contrast' : dark ? 'dark' : 'light', reducedMotion: prefersReduced() };
  }, [theme]);

  const failure = failed?.key === refKey ? failed.failure : undefined;
  const setFailure = (next: CanvasFailure | undefined) => setFailed(next && { key: refKey, failure: next });

  // The facts as live text, announced only when the situation changes, not on every scan (VIS-008).
  const facts = useMemo(
    () => (ready && snapshot ? describePlant(snapshot, ready.scene, locale === 'es' ? 'es' : 'en') : undefined),
    [ready, snapshot, locale],
  );
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!facts) return;
    if (announced.current !== undefined && announced.current !== facts.key) announce(facts.text);
    announced.current = facts.key;
  }, [facts]);

  // "Fit scene" of the palette and the menu fits this view while it is the 3D view on screen (VIS-002, FND-002).
  useEffect(
    () => (renderer && visible && view === '3d' ? offerSceneFit(() => renderer.fitScene?.()) : undefined),
    [renderer, visible, view],
  );

  // A scene the Plant activity asked for replaces the choice of this panel; the scene this panel shows is what the activity lists.
  useEffect(
    () =>
      usePlantChoice.subscribe((next, prev) => {
        if (!next.request || next.request === prev.request) return;
        const own = usePlantEdit.getState();
        if (own.sceneRef === refKey) own.end();
        setRef(next.request);
      }),
    [refKey],
  );
  const shownScene = ready?.scene;
  const shownMap = ready?.map;
  useEffect(() => {
    if (!shownScene) return;
    usePlantChoice.getState().show({ key: refKey, scene: shownScene, map: shownMap });
    return () => {
      if (usePlantChoice.getState().shown?.key === refKey) usePlantChoice.getState().show(undefined);
    };
  }, [refKey, shownScene, shownMap]);

  const stopped = state === 'stopped';
  const { setRunning } = session;
  useEffect(() => setRunning(!stopped, refKey), [setRunning, stopped, refKey]);
  // The session belongs to the panel of its scene: it closes with that panel or its scene, never with another one.
  const endOwn = () => {
    const own = usePlantEdit.getState();
    if (own.sceneRef === refKey) own.end();
  };
  useEffect(
    () => () => {
      const own = usePlantEdit.getState();
      if (own.sceneRef === refKey) own.end();
    },
    [refKey],
  );
  const startEditing = () => {
    if (!ready) return;
    setRunning(!stopped, refKey);
    session.begin({ scene: ready.scene, map: ready.map ?? null }, refKey);
  };
  const finishEditing = () => {
    const texts = session.end();
    if (texts) setEdited({ key: refKey, texts });
  };
  const message =
    failure?.kind === 'unavailable'
      ? t('plant.panel.unavailable', { reason: failure.reason })
      : failure?.kind === 'lost'
        ? t('plant.panel.contextLost')
        : failure?.kind === 'slow'
          ? t('plant.panel.slowFrames')
          : undefined;
  const saveProject = async () => {
    if (!handle || !ready) return;
    await saveProjectScene(handle, ready.scene, ready.map ? JSON.stringify(ready.map) : undefined);
    announce(t('plant.panel.saved', { name: 'scene.json' }));
  };
  const saveToProject = async (name: string) => {
    if (!handle || !ready) return;
    await saveScene(handle, name, ready.scene, ready.map ? JSON.stringify(ready.map) : undefined);
    saved.refresh();
    setRef({ kind: 'file', name });
    announce(t('plant.panel.saved', { name }));
  };

  return (
    <div data-plant-panel data-visible={visible} className="flex min-h-0 flex-1 flex-col">
      <div role="toolbar" aria-label={t('plant.panel.toolbar')} className="flex flex-wrap items-end gap-3 p-2">
        <ToggleGroup
          label={t('plant.panel.view')}
          options={[
            { value: '3d', label: t('plant.panel.view3d') },
            { value: 'schematic', label: t('plant.panel.viewSchematic') },
          ]}
          value={view}
          onValueChange={(value) => {
            setView(value === 'schematic' ? 'schematic' : '3d');
            setFailure(undefined);
          }}
        />
        <Button
          data-plant-reset
          disabled={!ready || !stopped}
          onClick={() => {
            ready?.core.reset();
            binding.publish();
          }}
        >
          {t('plant.panel.resetPlant')}
        </Button>
        <Button data-plant-edit-scene aria-pressed={!!editing} disabled={!stopped || !ready || !!session.editor} onClick={startEditing}>
          {t('plant.panel.editScene')}
        </Button>
        {/* Controls that appear with the scene come last: appending never moves the ones already there. */}
        {ready && view === '3d' && ready.scene.cameras.length > 0 && (
          <Select
            label={t('plant.panel.camera')}
            disabled={!renderer}
            defaultValue={ready.scene.cameras[0]?.name}
            onChange={(event) => renderer?.setCameraPreset(event.target.value)}
          >
            {ready.scene.cameras.map((camera) => (
              <option key={camera.name} value={camera.name}>
                {camera.name}
              </option>
            ))}
          </Select>
        )}
        {ready && view === '3d' && (
          <Button data-command="view.fitPlantScene" disabled={!renderer} onClick={() => renderer?.fitScene?.()}>
            {t('command.view.fitPlantScene')}
          </Button>
        )}
      </div>
      <div role="group" aria-label={t('plant.panel.sceneFile')} data-plant-scene-file className="flex flex-wrap items-end gap-3 px-2">
        <SceneChooser
          value={refKey}
          rootScene={hasProjectScene}
          saved={saved.names}
          onChoose={(next) => {
            endOwn();
            setRef(next);
          }}
        />
        {handle && ready && ref.kind === 'project' && !editing && (
          <Button data-plant-save-scene onClick={() => void saveProject()}>
            {t('plant.panel.saveToProject')}
          </Button>
        )}
        {handle && ready && ref.kind !== 'file' && ref.kind !== 'project' && !editing && (
          <SaveSceneButton initialName={saveName(ready.scene.name)} existing={saved.names} onSave={saveToProject} />
        )}
      </div>
      {editing && (
        <div data-plant-editor className="flex flex-col gap-3 p-2">
          <div className="flex flex-wrap gap-3">
            <Button data-plant-undo disabled={!stopped} onClick={session.undo}>
              {t('plantEditor.undo')}
            </Button>
            <Button data-plant-redo disabled={!stopped} onClick={session.redo}>
              {t('plantEditor.redo')}
            </Button>
            <Button data-plant-edit-done disabled={!stopped} onClick={finishEditing}>
              {t('plantEditor.done')}
            </Button>
          </div>
          <EditorPanel
            editor={editing.editor}
            mapEditor={editing.mapEditor}
            stopped={stopped}
            catalogue={catalogue}
            projectScene={ref.kind === 'project'}
            onMapEditor={session.setMapEditor}
          />
        </div>
      )}
      {message && (
        <div role="alert" data-plant-failure={failure?.kind} className="flex flex-wrap items-center gap-3 p-2 text-sm">
          <span>{message}</span>
          {view === '3d' && (
            <Button
              data-plant-show-schematic
              onClick={() => {
                setView('schematic');
                setFailure(undefined);
              }}
            >
              {t('plant.panel.showSchematic')}
            </Button>
          )}
        </div>
      )}
      {binding.slowdownMessage && (
        <p data-plant-slowdown className="p-2 text-sm">
          {binding.slowdownMessage}
        </p>
      )}
      {load.phase === 'loading' && <p className="p-2 text-sm">{t('plant.panel.loading')}</p>}
      {load.phase === 'failed' && (
        <div role="alert" data-plant-load-failed className="flex flex-wrap items-center gap-3 p-2 text-sm">
          <span>
            {t('plant.panel.sceneFailed', { scene: refKey, detail: load.detail })}
            {load.at && ` (${t('plant.panel.breaksAt', load.at)})`}
          </span>
          {load.scene && view === '3d' && (
            <Button data-plant-show-schematic onClick={() => setView('schematic')}>
              {t('plant.panel.showSchematic')}
            </Button>
          )}
        </div>
      )}
      {load.phase === 'failed' && load.scene && view === 'schematic' && <Schematic scene={load.scene} />}
      {ready && (
        <>
          {editing && view === '3d' && (
            <p data-plant-drag-hint className="px-2 text-sm text-[var(--text-secondary)]">
              {t('plant.panel.dragHint')}
            </p>
          )}
          <div className="min-h-64 flex-1">
            {view === '3d' ? (
              <PlantCanvas
                engine={ready.engine}
                scene={ready.scene}
                feed={binding.feed}
                visible={visible}
                quality={qualityLevels.includes(quality as QualityLevel) ? (quality as QualityLevel) : undefined}
                display={display}
                {...(focusedPart ? { focusedPart } : {})}
                label={t('plant.panel.canvas', { scene: ready.scene.name })}
                {...(deps.timing ? { timing: deps.timing } : {})}
                {...(editing ? { edit: { editor: editing.editor, catalogue, onEdited: session.touch } } : {})}
                onRenderer={setRenderer}
                onFailure={setFailure}
              />
            ) : (
              <Schematic scene={ready.scene} />
            )}
          </div>
          {!editing && (
            <OperatePanel
              scene={ready.scene}
              core={ready.core}
              snapshot={snapshot}
              onChange={binding.publish}
              onFocusPart={setFocusedPart}
            />
          )}
          {!editing && !binding.bound && (
            <p data-plant-unbound className="px-2 text-sm text-[var(--text-secondary)]">
              {ready.map ? t('plant.panel.waitingRun') : t('plant.panel.noRuntime')}
            </p>
          )}
          {!editing && (
            <section aria-label={t('plant.panel.facts')} className="p-2 text-sm">
              <p data-plant-text>{facts?.text}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
