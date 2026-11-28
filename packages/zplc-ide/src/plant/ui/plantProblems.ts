/**
 * The problems of the plant in the Problems tab (spec 013 PLS-005, SCN-015, plan-u3 P5): those of the scene being edited, each at the
 * part that causes it, and those of the plant map, each at its signal's row (`plantMapProblems`). Both are entries of the source
 * "Plant"; activating one takes the person to the part or to the row.
 */
import { showActivity } from '../../commands/bind/layout';
import { usePlantEdit } from '../editSession';
import type { ProblemAt } from '../editor/validate';
import { openPlantMapRow, usePlantMapProblems, type PlantMapProblem } from './plantMapProblems';

export type PlantProblemEntry =
  { kind: 'scene'; message: string; problem: ProblemAt } | { kind: 'map'; message: string; problem: PlantMapProblem };

const NONE: readonly ProblemAt[] = [];

/** The problems of the scene being edited, read again after every edit, undo and redo of the session. */
function useSceneProblems(): readonly ProblemAt[] {
  const editor = usePlantEdit((s) => s.editor);
  usePlantEdit((s) => s.version);
  return editor ? editor.state().problems : NONE;
}

/** What the Problems tab lists under "Plant": the scene's problems, then the plant map's. */
export function usePlantProblems(): PlantProblemEntry[] {
  const scene = useSceneProblems();
  const map = usePlantMapProblems((s) => s.problems);
  return [
    ...scene.map((problem): PlantProblemEntry => ({ kind: 'scene', message: problem.message, problem })),
    ...map.map((problem): PlantProblemEntry => ({ kind: 'map', message: problem.message, problem })),
  ];
}

/** Selects the part of a scene problem in the session (the Plant activity row and the Inspector form read it), or opens the map row. */
export function activatePlantProblem(entry: PlantProblemEntry): void {
  if (entry.kind === 'map') return openPlantMapRow(entry.problem.signal);
  const editor = usePlantEdit.getState().editor;
  if (editor && entry.problem.partId !== null) editor.select(entry.problem.partId);
  showActivity('plant');
}
