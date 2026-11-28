/**
 * The scene editor, usable with no pointer (SCN-014, UX-025): add a part from a list, position it with numeric fields, bind its
 * signals, with each problem shown at the part that causes it (SCN-015). Editing needs the plant stopped (SCN-008). Undo and redo
 * are the Edit menu's (SCN-010); the host re-renders the panel after them.
 * A modified scene joins "Save all" through the plant session (FLW-005).
 */
import { useEffect, useReducer, useState } from 'react';
import { currentLocale, useT } from '../../i18n';
import type { SignalRange } from '../../plants/plantMap';
import { catalogue as shipped, type Catalogue } from '../core/catalogue';
import { freshIdentity } from './commands';
import { createMapEditor, type MapEditor } from './mapEditor';
import type { SceneEditor } from './model';
import { PartForm } from './PartForm';
import { PartList } from './PartList';
import { SignalTable } from './SignalTable';
import type { ProblemAt } from './validate';

export interface EditorPanelProps {
  editor: SceneEditor;
  mapEditor: MapEditor;
  stopped: boolean;
  /** Defaults to the shipped catalogue. */
  catalogue?: Catalogue;
  /** Called when the signals of the scene change and the map editor had to be rebuilt; the host keeps this one. */
  onMapEditor?: (mapEditor: MapEditor) => void;
}

const signalKey = (editor: SceneEditor) =>
  editor
    .signals()
    .map((s) => `${s.name}:${s.type}:${s.direction}`)
    .join('|');

export function EditorPanel({ editor, mapEditor, stopped, catalogue = shipped, onMapEditor }: EditorPanelProps) {
  const { t } = useT();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [notes, setNotes] = useState<ProblemAt[]>([]);
  const [map, setMap] = useState(mapEditor);
  const [keyed, setKeyed] = useState(() => signalKey(editor));

  useEffect(() => {
    editor.setRunning(!stopped);
    refresh();
  }, [editor, stopped]);

  // The map editor knows the signals it was built with: when parts change them, it is rebuilt with the bindings kept.
  const state = editor.state();
  const key = signalKey(editor);
  let current = map;
  if (key !== keyed) {
    const old = map.map();
    current = createMapEditor(editor.signals(), 'scene' in old.target ? old.target.scene : state.scene.name);
    current.load(old);
    setMap(current);
    setKeyed(key);
  }
  useEffect(() => {
    if (map !== mapEditor) onMapEditor?.(map);
  }, [map, mapEditor, onMapEditor]);

  const act = (fn: () => ProblemAt[] | void) => {
    if (!stopped) return;
    setNotes(fn() ?? []);
    refresh();
  };
  const locale = currentLocale();
  const part = state.scene.parts.find((p) => p.id === state.selection) ?? null;
  const bindings = Object.fromEntries(Object.entries(current.map().signals).map(([name, s]) => [name, s.point]));

  return (
    <div className="flex flex-col gap-4" aria-label={t('plantEditor.title')} role="group">
      {!stopped && <p role="status">{t('plantEditor.running')}</p>}
      <PartList
        parts={state.scene.parts}
        catalogue={catalogue.list()}
        locale={locale}
        selection={state.selection}
        problems={[...state.problems, ...notes]}
        disabled={!stopped}
        onSelect={(id) => {
          editor.select(id);
          setNotes([]);
          refresh();
        }}
        onAdd={(id) =>
          act(() => {
            const placed = editor.place(freshIdentity(state.scene, { id }).id, id, [0, 0, 0]);
            if (typeof placed !== 'string') return [{ partId: null, ...placed, path: 'parts', message: placed.problem }];
          })
        }
        onDuplicate={(id) => act(() => void editor.duplicate(id))}
        onRemove={(id) => act(() => editor.remove(id))}
      />
      <PartForm
        part={part}
        def={part ? catalogue.get(part.part) : undefined}
        problems={[...state.problems, ...notes]}
        disabled={!stopped}
        onMove={(x, z) => part && act(() => editor.move(part.id, [x, part.position[1], z]))}
        onRotate={(deg) => part && act(() => editor.rotate(part.id, deg))}
        onConfigure={(patch) =>
          part &&
          act(() => {
            const before = editor.state().past;
            const result = editor.configure(part.id, patch);
            // A refused edit is said at its field; an applied one shows through the scene's problems.
            return editor.state().past === before ? result : [];
          })
        }
      />
      <SignalTable
        signals={editor.signals()}
        bindings={bindings}
        problems={notes}
        disabled={!stopped}
        onBind={(signal, point, range?: SignalRange, type?: 'INT' | 'REAL') =>
          act(() => {
            const problem = current.bind(signal, point, range, type);
            return problem ? [problem] : [];
          })
        }
        onUnbind={(signal) => act(() => current.unbind(signal))}
      />
    </div>
  );
}
