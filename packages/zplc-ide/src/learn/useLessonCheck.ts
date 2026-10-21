/**
 * The lesson check as the panel uses it (LRN-022, LRN-026): one press grades the saved program of the open project against
 * the reference scenario of the lesson package, in the tool worker of the main process, and answers a grade record.
 *
 * The request carries a lesson id and nothing else of the learner's; the id of the shown folder is added by the shown
 * project bridge, so the check can only reach the project on screen. The answer is validated here again, and a result that
 * arrives after the project changed is dropped. The record is handed to `onRecord`, which persists it.
 */
import { useRef, useState } from 'react';

import { parseLessonCheckAnswer } from '../../electron/lessonCheckProtocol';
import type { GradeRecord } from '../../shared/learnProgressModel';
import type { LearnLessonGrade } from '../components/learnLesson';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useIDEStore } from '../store/useIDEStore';
import { linkProjectWorkspace } from '../utils/workspaceTestLink';

type Outcome =
  | 'running'
  | { status: 'done'; record: GradeRecord }
  | { status: 'refused'; reason: string; codes: readonly string[] }
  | { status: 'error' };

interface Check {
  lessonId: string;
  projectSession: number;
  outcome: Outcome;
}

export function useLessonCheck(onRecord: (record: GradeRecord) => void) {
  const bridge = shownProjectBridge(window.electronAPI?.workspaceTests);
  const available = typeof window.electronAPI?.workspaceTests?.lessonCheck === 'function';
  const projectSession = useIDEStore((state) => state.projectSession);
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const unsaved = useIDEStore((state) => state.hasUnsavedChanges());
  const [check, setCheck] = useState<Check | null>(null);
  const busy = useRef(false);

  const current = (lessonId: string): Outcome | undefined =>
    check && check.lessonId === lessonId && check.projectSession === projectSession ? check.outcome : undefined;

  const run = async (lessonId: string): Promise<void> => {
    const store = useIDEStore.getState();
    if (!bridge || busy.current || !store.isProjectOpen || store.hasUnsavedChanges()) return;
    busy.current = true;
    const session = store.projectSession;
    setCheck({ lessonId, projectSession: session, outcome: 'running' });
    let outcome: Outcome = { status: 'error' };
    try {
      const link = store.workspaceScenarioLink?.projectSession === session ? store.workspaceScenarioLink : await linkProjectWorkspace();
      if (link) {
        const answer = parseLessonCheckAnswer(await bridge.lessonCheck({ workspaceId: link.workspaceId, lessonId }));
        if (answer?.ok) outcome = { status: 'done', record: answer.record };
        else if (answer) outcome = { status: 'refused', reason: answer.reason, codes: answer.codes };
      }
    } catch {
      /* the outcome stays an error: the run was cancelled, refused or the host is gone */
    }
    busy.current = false;
    if (useIDEStore.getState().projectSession !== session) {
      setCheck(null);
      return;
    }
    setCheck({ lessonId, projectSession: session, outcome });
    if (typeof outcome === 'object' && outcome.status === 'done') onRecord(outcome.record);
  };

  const cancel = (): void => {
    void bridge?.cancel().catch(() => undefined);
  };

  /** The grade of the last check of this lesson in this project, in the shape the panel already shows. */
  const gradeOf = (lessonId: string): LearnLessonGrade | undefined => {
    const outcome = current(lessonId);
    if (outcome === undefined || outcome === 'running') return undefined;
    if (outcome.status !== 'done') return { kind: 'unavailable' };
    const { record } = outcome;
    return record.result === 'passed'
      ? { kind: 'passed', assertions: record.assertions.total }
      : { kind: 'failed', assertions: record.assertions.total, failures: record.failedAssertions };
  };

  return {
    available,
    running: (lessonId: string) => current(lessonId) === 'running',
    /** Why the last check of this lesson gave no grade, when it gave none. */
    refusal: (lessonId: string) => {
      const outcome = current(lessonId);
      return typeof outcome === 'object' && outcome.status === 'refused' ? outcome : undefined;
    },
    failed: (lessonId: string) => {
      const outcome = current(lessonId);
      return typeof outcome === 'object' && outcome.status === 'error';
    },
    gradeOf,
    canRun: isProjectOpen && !unsaved,
    unsaved,
    isProjectOpen,
    run,
    cancel,
  };
}
