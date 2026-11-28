/**
 * The problems of the plant map (SCN-012): an unbound signal, a type mismatch or another located message, each tied to the row of
 * its signal. The editor publishes them here for the Problems tab (plan-u3 P5), and `openPlantMapRow` is how a problem opens its row.
 */
import { create } from 'zustand';
import type { IoMap } from '../../runtime/ioMap';
import { openConfigEditorFromNavigator } from '../../navigator/openConfigEditor';
import { serializeVisualDocument } from '../../models/visualFileFormat';
import type { Declarations } from '../editor/declarations';
import type { MapEditor } from '../editor/mapEditor';

export type PlantMapProblemKind = 'unbound' | 'mismatch' | 'other';

export interface PlantMapProblem {
  /** The signal whose row the problem opens. */
  signal: string;
  kind: PlantMapProblemKind;
  /** The located message as the map editor words it. */
  message: string;
  /** For a mismatch: what the program variable is and what the signal is. */
  detail?: { point: string; found: string; type: string };
}

const MISMATCH = /^.+: (\S+) is (\w+), the signal is (\w+)$/;

/** The problems of a map editor's bindings against the program's I/O map. */
export function plantMapProblems(mapEditor: MapEditor, ioMap: IoMap): PlantMapProblem[] {
  return mapEditor.check(ioMap).map((problem) => {
    const signal = problem.path.replace(/^signals\./, '');
    if (problem.message.includes('is not bound to a program point')) return { signal, kind: 'unbound', message: problem.message };
    const mismatch = MISMATCH.exec(problem.message);
    if (mismatch)
      return {
        signal,
        kind: 'mismatch',
        message: problem.message,
        detail: { point: mismatch[1]!, found: mismatch[2]!, type: mismatch[3]! },
      };
    return { signal, kind: 'other', message: problem.message };
  });
}

interface PlantMapProblemsState {
  problems: readonly PlantMapProblem[];
  /** The row to focus: `n` changes on every ask, so asking for the same signal again focuses it again. */
  row: { signal: string; n: number } | null;
  publish(problems: readonly PlantMapProblem[]): void;
  focusRow(signal: string): void;
}

/** What the Problems tab reads (P5): the problems of the plant map being shown, empty while no plant map is. */
export const usePlantMapProblems = create<PlantMapProblemsState>()((set) => ({
  problems: [],
  row: null,
  publish: (problems) => set({ problems }),
  focusRow: (signal) => set((state) => ({ row: { signal, n: (state.row?.n ?? 0) + 1 } })),
}));

/** Opens the plant map editor and puts the focus in the row of `signal`. */
export function openPlantMapRow(signal: string): void {
  openConfigEditorFromNavigator('plantMap');
  usePlantMapProblems.getState().focusRow(signal);
}

/**
 * The text of `content` with the declarations added and every existing character kept, or null when this program cannot take them
 * (`null` also when it already declares them all: `added` is then 0). A diagram language takes rows in its variable table.
 */
export function applyDeclarations(content: string, declarations: Declarations): { content: string; added: number } | null {
  if (declarations.kind === 'text') {
    const declared = new Set([...content.matchAll(/^\s*([A-Za-z_]\w*)\s*(?:AT\s+\S+\s*)?:/gim)].map((m) => m[1]!.toLowerCase()));
    const lines: string[] = [];
    let added = 0;
    let pending: string[] = [];
    for (const line of declarations.block.split('\n')) {
      const name = /^\s*([A-Za-z_]\w*)\s*:/.exec(line)?.[1];
      if (/^\s*VAR_(INPUT|OUTPUT)\s*$/.test(line)) pending = [line];
      else if (/^\s*END_VAR\s*$/.test(line)) {
        if (pending.length > 1) lines.push(...pending, line);
        pending = [];
      } else if (name && !declared.has(name.toLowerCase())) {
        pending.push(line);
        added += 1;
      }
    }
    if (added === 0) return { content, added };
    const block = lines.join('\n') + '\n';
    const header = /^[ \t]*(PROGRAM|FUNCTION_BLOCK)\b.*$/im.exec(content);
    if (!header) return { content: block + content, added };
    const end = header.index + header[0].length;
    const newline = content.startsWith('\r\n', end) ? 2 : content.startsWith('\n', end) ? 1 : 0;
    const at = end + newline;
    return { content: content.slice(0, at) + (newline ? '' : '\n') + block + content.slice(at), added };
  }
  let model: { variables?: { local?: unknown[]; inputs?: { name: string }[]; outputs?: { name: string }[] } };
  try {
    model = JSON.parse(content) as typeof model;
  } catch {
    return null;
  }
  if (typeof model !== 'object' || model === null) return null;
  const variables = (model.variables ??= { local: [], outputs: [] });
  const known = new Set(
    [...(variables.local ?? []), ...(variables.inputs ?? []), ...(variables.outputs ?? [])].map((v) =>
      String((v as { name: string }).name).toLowerCase(),
    ),
  );
  let added = 0;
  for (const row of declarations.rows) {
    if (known.has(row.name.toLowerCase())) continue;
    const entry = { name: row.name, type: row.type, ...(row.comment ? { comment: row.comment } : {}) };
    if (row.direction === 'input') (variables.inputs ??= []).push(entry);
    else (variables.outputs ??= []).push(entry);
    added += 1;
  }
  return { content: added === 0 ? content : serializeVisualDocument(model), added };
}
