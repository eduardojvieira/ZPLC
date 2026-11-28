/**
 * The four ways into the Assistant (AIX-003, plan-aix.md 9.2): a problem, a failed test, the lesson guide and an editor selection each
 * open it with their context attached. The context is the fields of the one request the provider already accepts (`AiRequest`); this
 * store only carries them from the place that asked to the Assistant, which attaches them as a removable chip and sends them. Nothing
 * here builds a second context.
 */
import { create } from 'zustand';
import { runCommand } from '../commands/bus';
import { t } from '../i18n';

export type AssistantMode = 'ask' | 'plan' | 'edit' | 'debug';

type Check = { signal: string; expected: boolean | number | string; observed: boolean | number | string };
export interface ContextFields {
  diagnostics?: Array<{ code: string; message?: string; path?: string; line?: number; column?: number; element?: string }>;
  failedScenarios?: Array<{ id: string; assertions: Array<{ index: number; kind: string; atMs: number; checks: Check[] }> }>;
  selection?: { startLine: number; endLine: number; text: string } | { element: string };
  lessonContext?: { lessonId: string; stage?: string };
}
export interface AttachedContext {
  kind: 'diagnostic' | 'failure' | 'lesson' | 'selection';
  /** What the chip says. */
  label: string;
  fields: ContextFields;
}
export interface AssistantIntent {
  mode: AssistantMode;
  /** The request is prefilled with it; the person may change it before sending. */
  prompt?: string;
  context: AttachedContext;
}

interface EntryState {
  pending: (AssistantIntent & { id: number }) | null;
  /** The Assistant applied the intent. */
  take: () => void;
}

let sequence = 0;
export const useAssistantEntry = create<EntryState>((set) => ({
  pending: null,
  take: () => set({ pending: null }),
}));

/** Reveals the Assistant (or Preferences, while no provider is configured) and leaves the intent for it to apply once. */
export function openAssistantWith(intent: AssistantIntent): void {
  sequence += 1;
  useAssistantEntry.setState({ pending: { ...intent, id: sequence } });
  runCommand('view.agent');
}

const CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
const ELEMENT = /^(?:rung|block|step|transition):[A-Za-z0-9_.-]{1,64}$/;
const SIGNAL = /^[A-Za-z_][A-Za-z0-9_.:]{0,127}$/;

export interface ProblemLike {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  errorCode?: string;
  element?: string;
}

export function diagnosticIntent(problem: ProblemLike): AssistantIntent {
  const code = [problem.code, problem.errorCode].find((value) => value !== undefined && CODE.test(value)) ?? 'DIAGNOSTIC';
  const place = problem.file ? `${problem.file}${problem.line ? `:${problem.line}` : ''}` : '';
  return {
    mode: 'debug',
    prompt: t('assistant.prompt.explainProblem'),
    context: {
      kind: 'diagnostic',
      label: t('assistant.chip.diagnostic', { code, place: place || '-' }),
      fields: {
        diagnostics: [
          {
            code,
            message: problem.message.slice(0, 256),
            ...(problem.file && !problem.file.startsWith('/') && !problem.file.includes('..') ? { path: problem.file } : {}),
            ...(problem.line && problem.line >= 1 ? { line: problem.line } : {}),
            ...(problem.column && problem.column >= 1 ? { column: problem.column } : {}),
            ...(problem.element && ELEMENT.test(problem.element) ? { element: problem.element } : {}),
          },
        ],
      },
    },
  };
}

export interface FailureLike {
  id: string;
  path?: string;
  kind?: string;
  atMs?: number;
  index?: number;
  checks?: ReadonlyArray<{
    signal: string;
    expected: boolean | number | { min?: number; max?: number };
    observed?: boolean | number;
  }>;
}

const value = (flag: boolean | number | { min?: number; max?: number }): boolean | number | string =>
  typeof flag === 'object'
    ? flag.min !== undefined && flag.max !== undefined
      ? `[${flag.min}, ${flag.max}]`
      : flag.min !== undefined
        ? `≥ ${flag.min}`
        : `≤ ${flag.max}`
    : flag;

export function failureIntent(failure: FailureLike): AssistantIntent {
  const detailed = failure.index !== undefined && failure.kind !== undefined && failure.atMs !== undefined;
  return {
    mode: 'debug',
    prompt: t('assistant.prompt.explainFailure'),
    context: {
      kind: 'failure',
      label: t('assistant.chip.failure', { id: failure.id }),
      fields: {
        failedScenarios: [
          {
            id: failure.id,
            assertions: detailed
              ? [
                  {
                    index: failure.index!,
                    kind: failure.kind!,
                    atMs: failure.atMs!,
                    checks: (failure.checks ?? [])
                      .filter((check) => SIGNAL.test(check.signal))
                      .slice(0, 8)
                      .map((check) => ({
                        signal: check.signal,
                        expected: value(check.expected),
                        observed: check.observed === undefined ? 'unobserved' : check.observed,
                      })),
                  },
                ]
              : [],
          },
        ],
      },
    },
  };
}

export function lessonIntent(lessonId: string, title: string): AssistantIntent {
  return {
    mode: 'ask',
    prompt: t('assistant.prompt.hint'),
    context: { kind: 'lesson', label: t('assistant.chip.lesson', { title }), fields: { lessonContext: { lessonId } } },
  };
}

export function selectionIntent(path: string, selection?: NonNullable<ContextFields['selection']>): AssistantIntent {
  const place =
    selection === undefined
      ? path
      : 'element' in selection
        ? `${path} ${selection.element}`
        : `${path}:${selection.startLine}${selection.endLine > selection.startLine ? `-${selection.endLine}` : ''}`;
  return {
    mode: 'ask',
    prompt: t('assistant.prompt.aboutSelection'),
    context: {
      kind: 'selection',
      label: t('assistant.chip.selection', { place }),
      fields: selection ? { selection } : {},
    },
  };
}
