/**
 * What the main process and the tool worker say to each other (IDE-012). Pure TypeScript with no Electron or Node
 * import, so both sides and the tests share it.
 *
 * The worker is a process of its own that runs one Tool API operation on one workspace root and answers once. The main
 * process names the operation from this closed list; nothing here is text that the renderer supplied except the scenario
 * id and the candidate edit, which the IPC schemas have already bounded.
 */

export const TOOL_WORKER_OPERATIONS = ['compile', 'safety-check', 'test', 'scenario-run', 'change-set-review'] as const;
export type ToolWorkerOperation = typeof TOOL_WORKER_OPERATIONS[number];

export type ToolWorkerRequest =
  | { operation: 'compile'; root: string }
  | { operation: 'safety-check'; root: string }
  | { operation: 'test'; root: string }
  | { operation: 'scenario-run'; root: string; scenarioId: string }
  | { operation: 'change-set-review'; root: string; edits: Array<{ path: string; content: string }> };

/** Main to worker: one `run`, then at most one `cancel`. */
export type ToolWorkerCommand = ({ type: 'run'; id: string } & ToolWorkerRequest) | { type: 'cancel' };

/** Worker to main: the answer to a `run`, once. */
export type ToolWorkerReply = { type: 'result'; id: string; value: unknown } | { type: 'error'; id: string };

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The command if it is exactly one of the commands above, else null: the worker runs nothing it was not told by name. */
export function parseToolWorkerCommand(value: unknown): ToolWorkerCommand | null {
  if (!isPlain(value)) return null;
  if (value.type === 'cancel') return Object.keys(value).length === 1 ? { type: 'cancel' } : null;
  if (value.type !== 'run' || typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 64
    || typeof value.root !== 'string' || value.root.length === 0 || value.root.includes('\0')) return null;
  const { id, root } = value;
  switch (value.operation) {
    case 'compile': case 'safety-check': case 'test':
      return Object.keys(value).length === 4 ? { type: 'run', id, operation: value.operation, root } : null;
    case 'scenario-run':
      return Object.keys(value).length === 5 && typeof value.scenarioId === 'string' ? { type: 'run', id, operation: 'scenario-run', root, scenarioId: value.scenarioId } : null;
    case 'change-set-review': {
      const { edits } = value;
      if (Object.keys(value).length !== 5 || !Array.isArray(edits) || edits.length < 1 || edits.length > 8) return null;
      if (!edits.every((edit) => isPlain(edit) && Object.keys(edit).length === 2 && typeof edit.path === 'string' && typeof edit.content === 'string')) return null;
      return { type: 'run', id, operation: 'change-set-review', root, edits: edits.map((edit: { path: string; content: string }) => ({ path: edit.path, content: edit.content })) };
    }
    default:
      return null;
  }
}
