/**
 * The Test results tab (TST-003, TST-004, TST-005): the verdict of the latest run in one sentence, the failed tests with what was
 * expected and observed and the way to the step and the time that failed, the passed tests collapsed, and the evidence record behind
 * Details. A result older than the sources stays, marked, with one action to run again.
 */
import { useState } from 'react';
import { Button } from '../ui';
import { useT } from '../i18n';
import { locateJsonPointer } from '../refs/jsonPlace';
import { useProjectTests } from '../projectTests/useProjectTests';
import { usePlantDocument } from '../store/usePlantDocument';
import { useWorkspaceTestResult } from '../shell/workspaceTestResult';
import { useIDEStore } from '../store/useIDEStore';
import { findFileInTree } from '../utils/fileSystem';
import { SafetyCoverageReport } from './InterlockCoverage';
import { recordedLabScenes } from './labPlayback';
import { TestVerdict, type VerdictFailure } from './TestVerdict';
import { WorkspaceTestResult, type TraceHighlight } from './WorkspaceTestResult';
import { classifyWorkspaceTestBuildLink, type WorkspaceTestPresentation } from './workspaceTestPresentation';
import type { useConsoleState } from '../store/regionSubscriptions';

type ConsoleState = ReturnType<typeof useConsoleState>;

/** The preview lists failed tests first and at most this many (`testPreview` in the Tool API): more failures than that are not counted. */
const PREVIEW_LIMIT = 8;

/** What the verdict says and shows, from the presentation of a run. */
function verdictOf(presentation: WorkspaceTestPresentation, t: ReturnType<typeof useT>['t']) {
  const preview = presentation.preview;
  const failedScenarios = preview?.scenarios.filter((scenario) => !scenario.passed) ?? [];
  const failures: VerdictFailure[] = failedScenarios.flatMap((scenario) => {
    const failed = scenario.assertions.filter((assertion) => !assertion.passed);
    return failed.length === 0
      ? [{ id: scenario.id, path: scenario.path }]
      : failed.map((assertion) => ({
          id: scenario.id,
          path: scenario.path,
          kind: assertion.kind,
          ...(assertion.atMs === undefined ? {} : { atMs: assertion.atMs }),
          ...(assertion.index === undefined ? {} : { index: assertion.index }),
          ...(assertion.checks === undefined ? {} : { checks: assertion.checks }),
        }));
  });
  const passedIds = preview?.scenarios.filter((scenario) => scenario.passed).map((scenario) => scenario.id) ?? [];
  const total = preview?.totalScenarioCount;
  if (presentation.kind === 'passed' && total !== undefined)
    return { sentence: t('u2Tests.verdict.counts', { passed: total, total }), ok: true as const, failures, passedIds };
  if (presentation.kind === 'assertion-failed' && total !== undefined && failedScenarios.length > 0) {
    const sentence =
      failedScenarios.length >= PREVIEW_LIMIT
        ? t('u2Tests.verdict.atLeast', { failed: failedScenarios.length, total })
        : t('u2Tests.verdict.counts', { passed: total - failedScenarios.length, total });
    return { sentence, ok: false as const, failures, passedIds };
  }
  // the run did not finish, or the file is not valid: its own message, with no counts
  return { sentence: presentation.message, ok: presentation.kind === 'passed' ? true : null, failures, passedIds };
}

/** The text of a project file by its path, read through the project folder; undefined when it cannot be read. */
async function readProjectText(root: FileSystemDirectoryHandle | null, path: string): Promise<string | undefined> {
  try {
    let folder = root;
    const parts = path.split('/');
    const name = parts.pop()!;
    for (const part of parts) folder = (await folder?.getDirectoryHandle(part)) ?? null;
    return await (await (await folder?.getFileHandle(name))?.getFile())?.text();
  } catch {
    return undefined;
  }
}

/** The step of a test a failed expectation points at, shown where the scenario file cannot be opened in an editor. */
interface ShownStep {
  path: string;
  number: number;
  line: number;
  column: number;
  text: string;
}

export interface TestResultsTabProps {
  runDisabled?: boolean;
  workspaceScenarioLink: ConsoleState['workspaceScenarioLink'];
  canonicalWorkspaceBuildEvidence: ConsoleState['canonicalWorkspaceBuildEvidence'];
}

export function TestResultsTab({ runDisabled = false, workspaceScenarioLink, canonicalWorkspaceBuildEvidence }: TestResultsTabProps) {
  const { t } = useT();
  const projectSession = useIDEStore((state) => state.projectSession);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const published = useWorkspaceTestResult((state) => state.presentation);
  const records = useProjectTests((state) => state.records);
  const running = useProjectTests((state) => state.running);
  const run = useProjectTests((state) => state.run);
  const safety = useProjectTests((state) => state.safety);
  const runScenario = useProjectTests((state) => state.runScenario);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [highlight, setHighlight] = useState<TraceHighlight | null>(null);
  const [stepMissing, setStepMissing] = useState(false);
  const [step, setStep] = useState<ShownStep | null>(null);

  // The published result is about the sources as they are; when they changed it is withdrawn and the last record stays (TST-005).
  const latest = Object.values(records)
    .filter((record) => record.presentation && record.projectSession === projectSession)
    .sort((a, b) => b.at - a.at)[0];
  const presentation = published ?? latest?.presentation;
  // the interlock check has its own run and its own heading (TST-006): it is never mixed into the verdict of the tests
  const interlock =
    typeof safety === 'object' ? (
      <section data-interlock-result className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-surface-200)]">
          {t('u2Tests.interlocks.title')}
        </h3>
        <SafetyCoverageReport presentation={safety.presentation} />
      </section>
    ) : null;
  if (!presentation) return interlock;
  const older = !published && latest !== undefined && latest.compilerRunId !== compilerRunId;
  const busy = running !== null || runDisabled;
  const verdict = verdictOf(presentation, t);

  const openStep = async (failure: VerdictFailure): Promise<void> => {
    setStepMissing(false);
    setStep(null);
    if (failure.index === undefined) return setStepMissing(true);
    const ide = useIDEStore.getState();
    const pointer = `/expectations/${failure.index}`;
    // a scenario file the project tree holds opens in the editor, at the expectation
    const node = ide.fileTree ? findFileInTree(ide.fileTree, failure.path) : null;
    if (node?.type === 'file') {
      await ide.openFile(node.id);
      const text = useIDEStore.getState().loadedFiles.get(node.id)?.content ?? '';
      const at = locateJsonPointer(text, pointer) ?? { line: 1, column: 1 };
      if (!(await useIDEStore.getState().navigateToCompilerDiagnostic(failure.path, at.line, at.column))) setStepMissing(true);
      return;
    }
    // the tree lists programs only: the step is read from the project folder and shown here
    const text = await readProjectText(ide.directoryHandle, failure.path);
    const at = text === undefined ? undefined : locateJsonPointer(text, pointer);
    let expectation: unknown;
    try {
      expectation = (JSON.parse(text ?? '') as { expectations?: unknown[] }).expectations?.[failure.index];
    } catch {
      /* not valid JSON: refused below */
    }
    if (!at || expectation === undefined) return setStepMissing(true);
    setStep({ path: failure.path, number: failure.index + 1, ...at, text: JSON.stringify(expectation, null, 2) });
  };

  return (
    <div className="space-y-3" data-test-results>
      {older && (
        <p role="status" data-test-older className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-accent-yellow)]">
          {t('u2Tests.older.notice')}
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              void run();
            }}
          >
            {t('u2Tests.runAgain')}
          </Button>
        </p>
      )}
      <TestVerdict
        sentence={verdict.sentence}
        ok={verdict.ok}
        failures={verdict.failures}
        passedIds={verdict.passedIds}
        boundary={presentation.hasEvidence ? 'simulation' : null}
        onScenarioStep={(failure) => void openStep(failure)}
        onTraceTime={(failure) => {
          setHighlight({ scenarioId: failure.id, atMs: failure.atMs! });
          setDetailsOpen(true);
        }}
      />
      {recordedLabScenes(presentation).length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          data-command-exempt="shows the plant document on the recording of this result (view.plant)"
          onClick={() => usePlantDocument.getState().showReplay()}
        >
          {t('u2Tests.replay')}
        </Button>
      )}
      {step && (
        <section data-scenario-step className="space-y-1 text-xs">
          <p className="font-medium text-[var(--color-surface-200)]">
            {t('u2Tests.step.title', { number: step.number, file: step.path, line: step.line })}
          </p>
          <pre className="overflow-x-auto bg-[var(--color-surface-800)] p-2 font-mono">{step.text}</pre>
        </section>
      )}
      {stepMissing && (
        <p role="alert" className="text-xs text-[var(--color-accent-yellow)]">
          {t('u2Tests.step.unavailable')}
        </p>
      )}
      <WorkspaceTestResult
        presentation={presentation}
        onRunScenario={(scenarioId) => {
          void runScenario(scenarioId);
        }}
        scenarioRunDisabled={busy}
        detailsOpen={detailsOpen}
        onDetailsToggle={(open) => {
          setDetailsOpen(open);
          if (!open) setHighlight(null);
        }}
        highlight={highlight}
        buildLink={classifyWorkspaceTestBuildLink(
          { projectSession, compilerRunId, workspaceScenarioLink },
          canonicalWorkspaceBuildEvidence,
          workspaceScenarioLink && !older
            ? { presentation, projectSession, compilerRunId, workspaceId: workspaceScenarioLink.workspaceId }
            : null,
        )}
      />
      {interlock}
    </div>
  );
}
