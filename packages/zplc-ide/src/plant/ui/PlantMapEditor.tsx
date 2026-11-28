/**
 * The plant map as a configuration editor (spec 013 PLS-006, plan-u3 P4): the signals of the scene with a bind control and the type
 * check (`SignalTable`), each unbound or mismatched signal as a problem that opens its row (SCN-012; published for the Problems tab
 * in `plantMapProblems`), and "Create the declarations" for the open program (SCN-013). The action adds names and types and never
 * an address (LNK-002); binding stays a person's explicit act.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { runCommand } from '../../commands/bus';
import { useT } from '../../i18n';
import { listIoMap, type IoMap } from '../../runtime/ioMap';
import { useIDEStore } from '../../store/useIDEStore';
import { announce } from '../../utils/announce';
import { Button, EmptyState } from '../../ui';
import type { PlantMap } from '../../plants/plantMap';
import type { PlantSceneFile } from '../contracts';
import { catalogue } from '../core/catalogue';
import { parseScene } from '../core/scene';
import { usePlantEdit } from '../editSession';
import { declarationsFor, type DeclarationLanguage } from '../editor/declarations';
import { createMapEditor } from '../editor/mapEditor';
import { createSceneEditor } from '../editor/model';
import { SignalTable } from '../editor/SignalTable';
import type { ProblemAt } from '../editor/validate';
import { saveProjectScene, saveScene } from '../persistence/sceneFiles';
import { applyDeclarations, plantMapProblems, usePlantMapProblems, type PlantMapProblem } from './plantMapProblems';
import { usePlantChoice } from './usePlantChoice';
import { useProjectSceneTexts } from './usePlantSession';

const parseMap = (text: string | undefined): PlantMap | undefined => {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as PlantMap;
  } catch {
    return undefined;
  }
};

const NO_IO: IoMap = { inputs: [], outputs: [] };

export interface PlantMapEditorProps {
  /** What a test or a host gives; by default the scene the plant document shows, else the project's own scene. */
  scene?: PlantSceneFile;
  map?: PlantMap;
  ioMap?: IoMap;
}

export function PlantMapEditor(props: PlantMapEditorProps) {
  const { t } = useT();
  const [tick, refresh] = useReducer((n: number) => n + 1, 0);
  const [notes, setNotes] = useState<ProblemAt[]>([]);
  const [status, setStatus] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);
  const shown = usePlantChoice((state) => state.shown);
  const project = useProjectSceneTexts();
  const handle = useIDEStore((state) => state.directoryHandle);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const session = usePlantEdit();
  const focusAsk = usePlantMapProblems((state) => state.row);
  const table = useRef<HTMLDivElement>(null);

  const ioMap = useMemo(() => props.ioMap ?? (debugMap ? listIoMap(debugMap) : NO_IO), [props.ioMap, debugMap]);
  const projectScene = useMemo(() => {
    const parsed = project.scene ? parseScene(project.scene) : undefined;
    return parsed && 'scene' in parsed ? parsed.scene : undefined;
  }, [project.scene]);
  const scene = props.scene ?? shown?.scene ?? projectScene;
  const map = props.map ?? (props.scene ? undefined : shown ? shown.map : parseMap(project.map));
  const key = props.scene ? undefined : (shown?.key ?? 'project');

  const local = useMemo(() => {
    if (!scene) return undefined;
    const signals = createSceneEditor(catalogue, scene).signals();
    const mapEditor = createMapEditor(signals, scene.name);
    if (map) mapEditor.load(map);
    return { signals, mapEditor };
  }, [scene, map]);
  // While the scene is being edited the session's map editor is the one every view shows (PLS-005).
  const editing = !props.scene && session.editor && session.mapEditor && shown && session.sceneRef === shown.key ? session : undefined;
  const signals = editing?.editor ? editing.editor.signals() : local?.signals;
  const mapEditor = editing?.mapEditor ?? local?.mapEditor;
  const disabled = editing ? editing.running : false;

  // `tick` and the session's `version` stand for "a binding changed": the problems are read from the editor each time.
  const problems = useMemo<PlantMapProblem[]>(
    () => (mapEditor ? plantMapProblems(mapEditor, ioMap) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapEditor, ioMap, tick, session.version],
  );
  const problemKey = JSON.stringify(problems);
  useEffect(() => {
    usePlantMapProblems.getState().publish(problems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemKey]);
  useEffect(() => () => usePlantMapProblems.getState().publish([]), []);

  const focusRow = (signal: string) => table.current?.querySelector<HTMLElement>(`tr[data-signal="${signal}"] input`)?.focus();
  useEffect(() => {
    if (focusAsk) focusRow(focusAsk.signal);
  }, [focusAsk, signals]);

  if (!scene || !signals || !mapEditor)
    return (
      <EmptyState
        title={t('plantMap.noPlant')}
        description={t('plantMap.noPlantHint')}
        action={<Button onClick={() => runCommand('view.plant')}>{t('plant.activity.add')}</Button>}
      />
    );

  const changed = () => {
    if (editing) editing.touch();
    else {
      setDirty(true);
      refresh();
    }
  };
  const act = (fn: () => ProblemAt | ProblemAt[] | null | void) => {
    if (disabled) return;
    const result = fn();
    setNotes(result ? (Array.isArray(result) ? result : [result]) : []);
    changed();
  };
  const bindings = Object.fromEntries(Object.entries(mapEditor.map().signals).map(([name, s]) => [name, s.point]));

  const createDeclarations = (asked: DeclarationLanguage) => {
    const { loadedFiles, activeFileId, updateFileContent } = useIDEStore.getState();
    const open = activeFileId ? loadedFiles.get(activeFileId) : undefined;
    const language = open && open.language !== 'SCENARIO' ? open.language : asked;
    const declarations = declarationsFor(signals, language);
    const applied = open && open.language !== 'SCENARIO' ? applyDeclarations(open.content, declarations) : null;
    if (open && applied) {
      if (applied.added > 0) updateFileContent(open.id, applied.content);
      const text =
        applied.added > 0 ? t('plantMap.declared', { count: applied.added, file: open.name }) : t('plantMap.declNone', { file: open.name });
      setStatus(text);
      announce(text);
      return;
    }
    // A program that cannot take the text here: the declaration is copied, and the person is told.
    const copy =
      declarations.kind === 'text' ? declarations.block : declarations.rows.map((r) => `${r.name} : ${r.type} (${r.direction})`).join('\n');
    void navigator.clipboard?.writeText(copy)?.catch(() => undefined);
    setStatus(t('plantMap.declCopied'));
    announce(t('plantMap.declCopied'));
  };

  const saveTarget = !editing && handle && key && (key === 'project' || key.startsWith('file:')) ? key : undefined;
  const save = async () => {
    if (!handle || !saveTarget) return;
    const text = JSON.stringify(mapEditor.map());
    if (saveTarget === 'project') await saveProjectScene(handle, scene, text);
    else await saveScene(handle, saveTarget.slice('file:'.length), scene, text);
    setDirty(false);
    const message = t('plantMap.saved');
    setStatus(message);
    announce(message);
  };

  return (
    <div ref={table} data-plant-map-editor className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-surface-300)]">{t('plantMap.scene', { name: scene.name })}</p>
      {problems.length > 0 && (
        <section aria-label={t('plantMap.problems')} data-plant-map-problems>
          <h2 className="text-sm font-medium">{t('plantMap.problems')}</h2>
          <ul>
            {problems.map((problem) => (
              <li key={`${problem.signal}:${problem.kind}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  data-problem-signal={problem.signal}
                  data-problem-kind={problem.kind}
                  onClick={() => focusRow(problem.signal)}
                >
                  {problem.kind === 'unbound'
                    ? '○ ' + t('plantMap.problem.unbound', { signal: problem.signal })
                    : problem.kind === 'mismatch' && problem.detail
                      ? '⚠ ' + t('plantMap.problem.mismatch', { signal: problem.signal, ...problem.detail })
                      : '⚠ ' + problem.message}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SignalTable
        signals={signals}
        bindings={bindings}
        problems={notes}
        disabled={disabled}
        onBind={(signal, point, range, type) => act(() => mapEditor.bind(signal, point, range, type))}
        onUnbind={(signal) => act(() => void mapEditor.unbind(signal))}
        onCreateDeclarations={createDeclarations}
      />
      {saveTarget && (
        <div>
          <Button data-plant-map-save disabled={!dirty} onClick={() => void save()}>
            {t('plantMap.save')}
          </Button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
