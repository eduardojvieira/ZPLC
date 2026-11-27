import { useState } from 'react';
import { useT } from '../i18n';
import { catalogue } from '../plant/core/catalogue';
import { usePlantEdit } from '../plant/editSession';
import { PartForm } from '../plant/editor/PartForm';
import type { ProblemAt } from '../plant/editor/validate';

/**
 * The properties of the selected part of the scene being edited (PLS-005, SCN-009): `PartForm` bound to the edit session. A refused
 * edit is said at its field and changes nothing; while the plant runs nothing is editable and the reason is shown as text (SCN-008).
 */
export function PlantPartInspector() {
  const { t } = useT();
  const editor = usePlantEdit((s) => s.editor);
  const running = usePlantEdit((s) => s.running);
  usePlantEdit((s) => s.version); // every edit, undo and redo re-renders the form
  const [notes, setNotes] = useState<ProblemAt[]>([]);
  const [seen, setSeen] = useState('');
  const state = editor?.state();
  // A refusal belongs to the selection and history it was made at: a new selection, undo or redo clears it.
  const stamp = `${state?.selection}|${state?.past}|${state?.future}`;
  if (seen !== stamp) {
    setSeen(stamp);
    setNotes([]);
  }
  if (!editor || !state) return null;
  const part = state.scene.parts.find((p) => p.id === state.selection);
  if (!part) return null;
  const act = (fn: () => ProblemAt[] | void) => {
    if (!running) setNotes(fn() ?? []);
  };
  return (
    <section aria-labelledby="inspector-part">
      <h2 id="inspector-part">{t('inspector.plantPart')}</h2>
      {running && <p role="status">{t('plantEditor.running')}</p>}
      <PartForm
        part={part}
        def={catalogue.get(part.part)}
        problems={[...state.problems, ...notes]}
        disabled={running}
        idPrefix="inspector-"
        onMove={(x, z) => act(() => editor.move(part.id, [x, part.position[1], z]))}
        onRotate={(deg) => act(() => editor.rotate(part.id, deg))}
        onConfigure={(patch) =>
          act(() => {
            const before = editor.state().past;
            const result = editor.configure(part.id, patch);
            // A refused edit is said at its field; an applied one shows through the scene's problems.
            return editor.state().past === before ? result : [];
          })
        }
      />
    </section>
  );
}
