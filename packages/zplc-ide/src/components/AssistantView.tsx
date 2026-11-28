/**
 * The Assistant view of the secondary sidebar (SHL-004, SHL-008): the Agent block of the results panel moved here with its content
 * unchanged, provider settings form included until Preferences holds it (Task H2). Nothing here lets the provider act: a request
 * returns a proposal, a person reviews it, and the person's click is the only thing that writes (IDE-030). A reviewed proposal opens
 * as the review document of the editor area, with one notice (SHL-004, SHL-010): the review is held once, by its store.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCandidateSourcePath } from '../ai/candidatePaths';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useT } from '../i18n';
import { useAssistantProvider } from '../shell/useSelection';
import { useIDEStore } from '../store/useIDEStore';
import { useReviewDocument } from '../store/useReviewDocument';
import { useAssistantEntry, type AttachedContext } from '../store/useAssistantEntry';
import { presentAgentResponse } from './agent/agentResponse';
import { addTurn, historyOf, type Turn } from './agent/conversation';
import { presentAiProviderStatus, type AiProviderMode, type AiProviderStatusPresentation } from './aiProviderPresentation';
import { sha256Text } from './candidateSources';
import { AgentTab } from './console/AgentTab';
import { type AgentState, type CandidateReviewState } from './ConsoleReviewPanels';
import { reviewProposal as reviewProposedChangeSet } from './reviewFlow';

/** A new request or its cancel makes a reviewed proposal of an earlier answer stale. */
const staleReview = (): void => {
  if (useReviewDocument.getState().review.kind === 'result') useReviewDocument.setState({ review: { kind: 'stale' } });
};

export function AssistantView() {
  const { t, locale } = useT();
  const aiProvider = window.electronAPI?.aiProvider;
  const candidateChangeSet = window.electronAPI?.candidateChangeSet;
  const workspaceTests = shownProjectBridge(window.electronAPI?.workspaceTests);
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const projectSession = useIDEStore((state) => state.projectSession);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const link = useIDEStore((state) => state.workspaceScenarioLink);
  const activeFile = useIDEStore((state) => (state.activeFileId ? state.loadedFiles.get(state.activeFileId) : undefined));
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);
  const stDiagnostics = useIDEStore((state) => state.stBufferDiagnostics);
  const refreshAvailability = useAssistantProvider((state) => state.refresh);
  const [mode, setMode] = useState<AiProviderMode>('ask');
  const [prompt, setPrompt] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [status, setStatus] = useState<AiProviderStatusPresentation>({ kind: 'invalid' });
  const review = useReviewDocument((state) => state.review) as CandidateReviewState;
  const reviewBusy = useReviewDocument((state) => state.busy);
  const [chip, setChip] = useState<AttachedContext | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState(projectSession);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const pending = useAssistantEntry((state) => state.pending);
  const [applied, setApplied] = useState(0);

  // A place that asked for the Assistant (AIX-003) sets its mode, prefills the request and attaches its context once.
  if (pending && pending.id !== applied) {
    setApplied(pending.id);
    setMode(pending.mode);
    setPrompt(pending.prompt ?? '');
    setChip(pending.context);
    setAgentState('idle');
  }
  // Another project is another conversation (AI-18).
  if (session !== projectSession) {
    setSession(projectSession);
    setTurns([]);
    setChip(null);
  }
  useEffect(() => {
    if (!pending) return;
    useAssistantEntry.getState().take();
    promptRef.current?.focus();
  }, [pending]);

  const refresh = useCallback(async () => {
    await Promise.resolve();
    if (!aiProvider) {
      setAgentState('unavailable');
      setStatus({ kind: 'invalid' });
      return;
    }
    setAgentState('loading');
    try {
      const statusValue = await aiProvider.getStatus();
      const next = presentAiProviderStatus(statusValue);
      setStatus(next);
      setAgentState(next.kind === 'invalid' ? 'unavailable' : 'idle');
      void refreshAvailability();
    } catch {
      setAgentState('unavailable');
    }
  }, [aiProvider, refreshAvailability]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const hasLink = link?.projectSession === projectSession;
  // the open program, in any of the five languages, goes with a request in every mode; an edit also needs it saved and unmodified
  const contextFile = activeFile && isCandidateSourcePath(activeFile.path) && activeFile.handle ? activeFile : undefined;
  const editFile = contextFile && !contextFile.isModified ? contextFile : undefined;
  const busy = agentState === 'sending' || agentState === 'cancelling';
  const proposalCurrent =
    typeof agentState === 'object' &&
    agentState.kind === 'response' &&
    agentState.expectedEdit !== undefined &&
    agentState.expectedEdit.projectSession === projectSession &&
    agentState.expectedEdit.compilerRunId === compilerRunId &&
    agentState.expectedEdit.workspaceId === link?.workspaceId &&
    agentState.expectedEdit.fileId === activeFile?.id &&
    agentState.expectedEdit.path === activeFile?.path &&
    agentState.expectedEdit.content === activeFile?.content &&
    agentState.expectedEdit.handle === activeFile?.handle &&
    !activeFile?.isModified;
  const canSend = Boolean(
    aiProvider &&
    !busy &&
    status.kind === 'ready' &&
    status.configured &&
    status.enabled &&
    hasLink &&
    isProjectOpen &&
    prompt.trim().length > 0 &&
    prompt.length <= 4_000 &&
    (mode !== 'edit' || editFile),
  );
  const liveDiagnostics =
    stDiagnostics &&
    stDiagnostics.projectSession === projectSession &&
    stDiagnostics.compilerRunId === compilerRunId &&
    stDiagnostics.fileId === useIDEStore.getState().activeFileId &&
    stDiagnostics.file === activeFile?.path
      ? stDiagnostics.diagnostics
      : [];
  const diagnostics = liveDiagnostics.slice(0, 32).map(({ code, line, column }) => ({
    code,
    ...(activeFile?.path ? { path: activeFile.path } : {}),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  }));
  const trace = nativeTrace.slice(-32).map((sample) => ({ atMs: sample.uptimeMs, signal: 'runtime.cycles', value: sample.cycles }));

  const send = async () => {
    const current = useIDEStore.getState();
    const currentLink = current.workspaceScenarioLink;
    const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
    if (
      !aiProvider ||
      !currentLink ||
      currentLink.projectSession !== current.projectSession ||
      !current.isProjectOpen ||
      !canSend ||
      (mode === 'edit' && (!file || file !== editFile))
    )
      return;
    staleReview();
    setAgentState('sending');
    try {
      const sentFile = mode === 'edit' ? file : file && isCandidateSourcePath(file.path) && file.handle ? file : undefined;
      const response = await aiProvider.request({
        workspaceId: currentLink.workspaceId,
        mode,
        prompt: prompt.trim(),
        locale,
        ...(sentFile ? { activeFile: { fileId: sentFile.id, path: sentFile.path } } : {}),
        ...(mode === 'debug' ? { diagnostics, trace } : {}),
        // what the place that opened the Assistant attached (AIX-003): the fields of this same request, never a second context
        ...(chip ? chip.fields : {}),
        ...(turns.length > 0 ? { history: historyOf(turns) } : {}),
      });
      const latest = useIDEStore.getState();
      const latestFile = latest.activeFileId ? latest.loadedFiles.get(latest.activeFileId) : undefined;
      if (
        latest.projectSession !== current.projectSession ||
        latest.compilerRunId !== current.compilerRunId ||
        latest.workspaceScenarioLink?.workspaceId !== currentLink.workspaceId ||
        (mode === 'edit' && (!latestFile || latestFile.id !== file?.id || latestFile.content !== file?.content || latestFile.isModified))
      ) {
        setAgentState('error');
        return;
      }
      const baselineSha256 = mode === 'edit' && file ? await sha256Text(file.content) : undefined;
      const expectedEdit =
        mode === 'edit' && file && baselineSha256
          ? {
              projectSession: current.projectSession,
              compilerRunId: current.compilerRunId,
              workspaceId: currentLink.workspaceId,
              fileId: file.id,
              path: file.path,
              content: file.content,
              handle: file.handle!,
              baselineSha256,
            }
          : undefined;
      const sent = sentFile
        ? {
            workspaceId: currentLink.workspaceId,
            fileId: sentFile.id,
            path: sentFile.path,
            ...(baselineSha256 ? { baselineSha256 } : {}),
          }
        : undefined;
      const presentation = presentAgentResponse(response, sent);
      if (presentation.kind === 'answer') setTurns((previous) => addTurn(previous, prompt.trim(), presentation.answer));
      setAgentState({ kind: 'response', presentation, ...(expectedEdit ? { expectedEdit } : {}) });
    } catch {
      setAgentState('error');
    }
  };

  const reviewProposal = async () => {
    const current = useIDEStore.getState();
    const currentLink = current.workspaceScenarioLink;
    const response = typeof agentState === 'object' && agentState.kind === 'response' ? agentState : undefined;
    const expectedEdit = response?.expectedEdit;
    const changes = response?.presentation.kind === 'answer' ? response.presentation.changes : undefined;
    if (
      !candidateChangeSet ||
      !workspaceTests ||
      reviewBusy ||
      !changes ||
      !expectedEdit ||
      !currentLink ||
      currentLink.projectSession !== current.projectSession ||
      expectedEdit.projectSession !== current.projectSession ||
      expectedEdit.compilerRunId !== current.compilerRunId ||
      expectedEdit.workspaceId !== currentLink.workspaceId
    )
      return;
    await reviewProposedChangeSet(changes, currentLink.workspaceId, candidateChangeSet);
  };

  const cancel = async () => {
    if (!aiProvider || agentState !== 'sending') return;
    setAgentState('cancelling');
    staleReview();
    try {
      await aiProvider.cancel();
    } catch {
      /* the provider request remains authoritative */
    }
  };

  return (
    <div aria-label={t('assistant.region')} role="region">
      <AgentTab
        agentMode={mode}
        setAgentMode={setMode}
        agentPrompt={prompt}
        setAgentPrompt={setPrompt}
        agentState={agentState}
        setAgentState={setAgentState}
        agentStatus={status}
        agentBusy={busy}
        agentCanSend={canSend}
        agentProposalCurrent={proposalCurrent}
        agentEditFile={editFile}
        agentContextFile={contextFile}
        agentDiagnosticCount={diagnostics.length}
        agentTraceCount={trace.length}
        hasCurrentWorkspaceLink={hasLink}
        workspaceTestBusy={reviewBusy}
        chip={chip}
        removeChip={() => setChip(null)}
        turnCount={turns.length / 2}
        newConversation={() => {
          setTurns([]);
          setAgentState('idle');
        }}
        promptRef={promptRef}
        refreshAiProvider={refresh}
        sendAgentRequest={send}
        cancelAgentRequest={cancel}
        reviewAgentProposal={reviewProposal}
      />
      <div role="status" aria-live="polite" className="px-3 text-sm">
        {review.kind === 'running' && <p>{t('console.reviewingTheChangeIn')}</p>}
        {review.kind === 'saving' && <p>{t('console.savingReviewedChange')}</p>}
        {review.kind === 'stale' && <p>{t('console.theChangeIsNo')}</p>}
        {review.kind === 'error' && <p>{t('console.theReviewCouldNot')}</p>}
        {review.kind === 'saved' && <p>{t('console.reviewedChangeSavedReview')}</p>}
        {review.kind === 'no-change' && <p>{t('console.proposalNoChange')}</p>}
        {review.kind === 'unsaved' && <p>{t('console.proposalUnsaved', { path: review.path })}</p>}
      </div>
    </div>
  );
}
