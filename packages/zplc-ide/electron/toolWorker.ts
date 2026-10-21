/**
 * The tool worker (IDE-012): the process that compiles, checks safety, runs scenarios and reviews candidates for the main
 * process. It is bundled with the Tool API by `electron:compile` and started by `toolWorkerHost.ts`, never by hand.
 *
 * It answers one `run` command with the plain value of the Tool API result, and stops its operation on `cancel` (a run of
 * scenarios ends with its cancelled evidence; a synchronous compile cannot be interrupted, and the host kills the
 * process instead). Non-enumerable fields of a result (the artifact bytes of a compile) are copied as plain fields,
 * because only own enumerable fields survive the structured clone that carries the answer.
 */
import { compilerCompile, createCandidateChangeSet, safetyCheck, scenarioRun, testsRun } from '../src/cli/toolApi';
import { lessonCheck } from '../src/learn/lessonCheck';
import { parseToolWorkerCommand, type ToolWorkerCommand, type ToolWorkerReply } from './toolWorkerProtocol';

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
}

/** Electron's utility process has `process.parentPort`; a plain Node child (the tests) has the IPC channel of `fork`. */
function openChannel(): { post(message: ToolWorkerReply): void; onMessage(listener: (message: unknown) => void): void } {
  const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (parentPort)
    return {
      post: (message) => parentPort.postMessage(message),
      onMessage: (listener) => parentPort.on('message', (event) => listener(event.data)),
    };
  if (typeof process.send === 'function')
    return {
      post: (message) => {
        process.send!(message);
      },
      onMessage: (listener) => {
        process.on('message', listener);
      },
    };
  throw new Error('The tool worker was not started by a parent process');
}

/** Fields that the Tool API defines non-enumerable on its results and that the main process needs. */
const HIDDEN_FIELDS = ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap'] as const;

function plain(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const copy: Record<string, unknown> = { ...value };
  for (const field of HIDDEN_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor && 'value' in descriptor) copy[field] = descriptor.value;
  }
  return copy;
}

type RunCommand = Extract<ToolWorkerCommand, { type: 'run' }>;

async function execute(command: RunCommand, signal: AbortSignal): Promise<unknown> {
  switch (command.operation) {
    case 'compile':
      return plain(await compilerCompile(command.root));
    case 'safety-check':
      return await safetyCheck(command.root);
    case 'test':
      return await testsRun(command.root, { signal });
    case 'scenario-run':
      return await scenarioRun(command.root, command.scenarioId, { signal });
    case 'change-set-review':
      return await createCandidateChangeSet(command.root, command.edits, { signal });
    case 'lesson-check':
      return await lessonCheck(command.root, command.lessonId, { signal });
  }
}

const channel = openChannel();
const controller = new AbortController();
let started = false;

channel.onMessage((message) => {
  const command = parseToolWorkerCommand(message);
  if (command?.type === 'cancel') {
    controller.abort();
    return;
  }
  if (command?.type !== 'run' || started) {
    const id = typeof (message as { id?: unknown } | null)?.id === 'string' ? (message as { id: string }).id : '';
    channel.post({ type: 'error', id });
    return;
  }
  started = true;
  execute(command, controller.signal).then(
    (value) => channel.post({ type: 'result', id: command.id, value }),
    () => channel.post({ type: 'error', id: command.id }),
  );
});
