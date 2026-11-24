/**
 * Console Component
 *
 * The results panel under the editor (UX-011): Output, Problems, Tests, Interlocks, Changes, Agent, Trace, Watch and Terminal tabs.
 * The Explorer, the Inspector and the lessons are views of the sidebars (shell/Sidebars.tsx).
 * The Terminal tab provides direct shell access to ZPLC devices.
 * The Watch tab shows live debug values.
 */

import { ProblemsPanel } from './ProblemsPanel';
import { useUnseen } from './consoleAttention';
import {
  ChevronDown,
  ChevronUp,
  Terminal,
  AlertTriangle,
  Trash2,
  Eye,
  FlaskConical,
  Activity,
  FileDiff,
  Bot,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { useConsoleState } from '../store/regionSubscriptions';
import { sha256Text } from './candidateSources';
import { acceptReview, cancelReview, invalidateReview, reviewActiveChange, reviewIsCurrent, reviewProposal } from './reviewFlow';
import { useReviewDocument } from '../store/useReviewDocument';
import { isCandidateSourcePath } from '../ai/candidatePaths';
import { presentAgentResponse } from './agent/agentResponse';
import { ConsoleTabStrip, type ConsoleTabFace } from './ConsoleTabStrip';
import { TerminalTab } from './TerminalTab';
import { WatchTab } from './WatchTab';
import type { DebugController } from '../hooks/useDebugController';
import { describeVmError } from '../runtime/nativeTrace';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { ErrorBoundary } from './ErrorBoundary';
import { DevFaultProbe } from './DevFaultProbe';
import { resultsTabFor } from '../shell/shellRouting';
import { elementToSelect } from '../editors/diagnosticElement';
import { requestElementSelection } from '../editors/elementSelectionRequests';
import { useProjectBlocks } from '../editors/useProjectBlocks';
import { presentAiProviderStatus, type AiProviderMode, type AiProviderStatusPresentation } from './aiProviderPresentation';
import { useTheme } from '../hooks/useTheme';
import { Badge, Button, FileInput, IconButton } from '../ui';
import { useT } from '../i18n';
import { CommandEmptyState } from './panelStates';
import { type CandidateReviewState, type AgentState } from './ConsoleReviewPanels';
import { LiveNativeMotorPanel } from './LiveNativeMotorControls';
import { useAppSettings } from '../store/useAppSettings';
import { outputLevelOf } from '../utils/appSettings';
import { entriesForLevel } from '../store/consoleEntries';
import { OutputTab } from './console/OutputTab';
import { TestsTab } from './console/TestsTab';
import { InterlocksTab } from './console/InterlocksTab';
import { ChangesTab } from './console/ChangesTab';
import { AgentTab } from './console/AgentTab';
import { useWorkspaceTestRunner } from './console/useWorkspaceTestRunner';

interface ConsoleProps {
  debugController?: DebugController;
}

export function Console({ debugController }: ConsoleProps) {
  const { t, tn } = useT();
  const {
    consoleEntries,
    activeConsoleTab: storedConsoleTab,
    compilerMessages,
    compilerMessagesChecked,
    stBufferDiagnostics,
    activeFileId,
    loadedFiles,
    isConsoleCollapsed,
    toggleConsole,
    setActiveConsoleTab,
    clearConsole,
    clearCompilerMessages,
    clearNativeTrace,
    fileTree,
    navigateToCompilerDiagnostic,
    isProjectOpen,
    projectSession,
    compilerRunId,
    workspaceScenarioLink,
    canonicalWorkspaceBuildEvidence,
    linkWorkspaceScenarios,
    hasUnsavedChanges,
  } = useConsoleState();
  // a request for a view that left this panel (the explorer, the inspector, the lessons) is shown by the sidebars; this panel keeps its own
  // tab
  const activeConsoleTab = resultsTabFor(storedConsoleTab);
  const { effectiveTheme } = useTheme();
  const projectBlocks = useProjectBlocks();
  const runner = useWorkspaceTestRunner({
    isProjectOpen,
    projectSession,
    compilerRunId,
    workspaceScenarioLink,
    linkWorkspaceScenarios,
    hasUnsavedChanges,
  });
  const {
    workspaceTests,
    workspaceTestBusy,
    setWorkspaceTestBusy,
    workspaceManifestInputRef,
    hasCurrentWorkspaceLink,
    registerWorkspaceManifest,
  } = runner;
  const candidateChangeSet = window.electronAPI?.candidateChangeSet;
  const aiProvider = window.electronAPI?.aiProvider;
  const candidateDesktopReady = Boolean(candidateChangeSet && workspaceTests);
  // the review is held once, by the review document's store, and shown here and in the editor area
  const candidateReviewState = useReviewDocument((state) => state.review) as CandidateReviewState;
  const candidateReviewBusy = useReviewDocument((state) => state.busy);
  const [agentMode, setAgentMode] = useState<AiProviderMode>('ask');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [agentStatus, setAgentStatus] = useState<AiProviderStatusPresentation>({ kind: 'invalid' });

  // Get watch count for badge
  const watchCount = useIDEStore((state) => state.debug.watchVariables.length);
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const debugMode = useIDEStore((state) => state.debug.mode);
  const latestNativeTrace = nativeTrace.at(-1);
  const activeFile = activeFileId ? loadedFiles.get(activeFileId) : undefined;
  const candidateEligible = Boolean(
    candidateDesktopReady &&
    isProjectOpen &&
    hasCurrentWorkspaceLink &&
    activeFile &&
    isCandidateSourcePath(activeFile.path) &&
    activeFile.isModified &&
    activeFile.handle,
  );
  // an assistant's change set is bound to its own files; the person's buffer review to the active file
  const candidateReviewStateForCurrent: CandidateReviewState = reviewIsCurrent(candidateReviewState)
    ? candidateReviewState
    : { kind: 'stale' };
  useEffect(() => {
    invalidateReview();
  }, [
    projectSession,
    compilerRunId,
    activeFileId,
    activeFile?.path,
    activeFile?.content,
    activeFile?.handle,
    activeFile?.isModified,
    workspaceScenarioLink?.workspaceId,
  ]);
  const liveSTDiagnostics =
    stBufferDiagnostics &&
    stBufferDiagnostics.projectSession === projectSession &&
    stBufferDiagnostics.compilerRunId === compilerRunId &&
    stBufferDiagnostics.fileId === activeFileId &&
    stBufferDiagnostics.file === activeFile?.path
      ? stBufferDiagnostics.diagnostics
      : [];
  const errorCount =
    compilerMessages.filter((message) => message.type === 'error').length +
    liveSTDiagnostics.filter((message) => message.type === 'error').length;
  const warningCount =
    compilerMessages.filter((message) => message.type === 'warning').length +
    liveSTDiagnostics.filter((message) => message.type === 'warning').length;
  const problemSummary = `${tn('workbench.inspector.errors', errorCount)} · ${tn('workbench.inspector.warnings', warningCount)}`;

  // Opening a problem opens its file at its position, and in a diagram selects the element it is about (LNG-003)
  const activateDiagnostic = async (msg: { file?: string; line?: number; column?: number; message: string; element?: string }) => {
    if (!msg.file) return;
    const opened = await navigateToCompilerDiagnostic(msg.file, msg.line && msg.line >= 1 ? msg.line : 1, msg.column ?? 1);
    if (!opened) return;
    const file = [...useIDEStore.getState().loadedFiles.values()].find((candidate) => candidate.path === msg.file);
    const element = elementToSelect(msg, file, projectBlocks);
    if (element) requestElementSelection(msg.file, element);
  };

  // a message written while another view is visible raises an indicator on its tab (IDE-020)
  const outputLevel = useAppSettings((state) => outputLevelOf(state.settings));
  const unseen = useUnseen(
    { output: entriesForLevel(consoleEntries, outputLevel).length, problems: compilerMessages.length },
    activeConsoleTab,
  );
  const unseenTab = (count = 0) =>
    count > 0
      ? {
          count: (
            <Badge tone="info" className="ml-1">
              {count}
            </Badge>
          ),
          ariaLabel: t('console.tab.unseenOutput', { count }),
        }
      : {};
  const tabs: ConsoleTabFace[] = [
    { id: 'output', label: t('panel.output'), icon: <Terminal size={14} />, ...unseenTab(unseen.output) },
    {
      id: 'problems',
      label: t('panel.problems'),
      icon: <AlertTriangle size={14} />,
      summary: problemSummary,
      count: unseenTab(unseen.problems).count,
      ariaLabel:
        t('console.tab.problemsAria', { summary: problemSummary }) +
        (unseen.problems ? `, ${t('console.tab.unseen', { count: unseen.problems })}` : ''),
    },
    {
      id: 'tests',
      label: t('panel.tests'),
      icon: <FlaskConical size={14} />,
      ariaLabel: t('console.tab.testsAria'),
    },
    { id: 'interlocks', label: t('console.tab.interlocks'), icon: <ShieldCheck size={14} />, ariaLabel: t('console.tab.interlocksAria') },
    { id: 'changes', label: t('console.tab.changes'), icon: <FileDiff size={14} />, ariaLabel: t('console.tab.changesAria') },
    { id: 'agent', label: t('console.tab.agent'), icon: <Bot size={14} />, ariaLabel: t('console.tab.agentAria') },
    {
      id: 'trace',
      label: t('panel.trace'),
      icon: <Activity size={14} />,
      count: nativeTrace.length > 0 ? nativeTrace.length : undefined,
      ariaLabel: tn('console.tab.traceAria', nativeTrace.length),
    },
    {
      id: 'watch',
      label: t('panel.watch'),
      icon: <Eye size={14} className={debugMode !== 'none' ? 'text-[var(--color-accent-green)]' : ''} />,
      count: watchCount > 0 ? watchCount : undefined,
    },
    { id: 'terminal', label: t('console.tab.terminal'), icon: <Terminal size={14} className="text-[var(--color-accent-green)]" /> },
  ];

  const reviewCandidateChange = async () => {
    if (!candidateChangeSet || !workspaceTests || workspaceTestBusy) return;
    setWorkspaceTestBusy(true);
    try {
      await reviewActiveChange();
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const cancelCandidateReview = async () => {
    if (!workspaceTests || !workspaceTestBusy) return;
    await cancelReview();
  };

  const saveReviewedChange = async () => {
    setWorkspaceTestBusy(true);
    try {
      await acceptReview();
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const refreshAiProvider = useCallback(async () => {
    await Promise.resolve();
    if (!aiProvider) {
      setAgentState('unavailable');
      setAgentStatus({ kind: 'invalid' });
      return;
    }
    setAgentState('loading');
    try {
      const statusValue = await aiProvider.getStatus();
      const status = presentAiProviderStatus(statusValue);
      setAgentStatus(status);
      setAgentState(status.kind === 'invalid' ? 'unavailable' : 'idle');
    } catch {
      setAgentState('unavailable');
    }
  }, [aiProvider, setAgentState, setAgentStatus]);

  // the open program, in any of the five languages, goes with a request in every mode; an edit also needs it saved and unmodified
  const agentContextFile = activeFile && isCandidateSourcePath(activeFile.path) && activeFile.handle ? activeFile : undefined;
  const agentEditFile = agentContextFile && !agentContextFile.isModified ? agentContextFile : undefined;
  const agentBusy = agentState === 'sending' || agentState === 'cancelling';
  const agentProposalCurrent =
    typeof agentState === 'object' &&
    agentState.kind === 'response' &&
    agentState.expectedEdit !== undefined &&
    agentState.expectedEdit.projectSession === projectSession &&
    agentState.expectedEdit.compilerRunId === compilerRunId &&
    agentState.expectedEdit.workspaceId === workspaceScenarioLink?.workspaceId &&
    agentState.expectedEdit.fileId === activeFile?.id &&
    agentState.expectedEdit.path === activeFile?.path &&
    agentState.expectedEdit.content === activeFile?.content &&
    agentState.expectedEdit.handle === activeFile?.handle &&
    !activeFile?.isModified;
  const agentCanSend = Boolean(
    aiProvider &&
    !agentBusy &&
    agentStatus.kind === 'ready' &&
    agentStatus.configured &&
    agentStatus.enabled &&
    hasCurrentWorkspaceLink &&
    isProjectOpen &&
    agentPrompt.trim().length > 0 &&
    agentPrompt.length <= 4_000 &&
    (agentMode !== 'edit' || agentEditFile),
  );
  const agentDiagnostics = liveSTDiagnostics.slice(0, 32).map(({ code, line, column }) => ({
    code,
    ...(activeFile?.path ? { path: activeFile.path } : {}),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  }));
  const agentTrace = nativeTrace.slice(-32).map((sample) => ({ atMs: sample.uptimeMs, signal: 'runtime.cycles', value: sample.cycles }));

  const sendAgentRequest = async () => {
    const current = useIDEStore.getState();
    const link = current.workspaceScenarioLink;
    const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
    if (
      !aiProvider ||
      !link ||
      link.projectSession !== current.projectSession ||
      !current.isProjectOpen ||
      !agentCanSend ||
      (agentMode === 'edit' && (!file || file !== agentEditFile))
    )
      return;
    if (useReviewDocument.getState().review.kind === 'result') useReviewDocument.setState({ review: { kind: 'stale' } });
    setAgentState('sending');
    try {
      const sentFile = agentMode === 'edit' ? file : file && isCandidateSourcePath(file.path) && file.handle ? file : undefined;
      const request = {
        workspaceId: link.workspaceId,
        mode: agentMode,
        prompt: agentPrompt.trim(),
        ...(sentFile ? { activeFile: { fileId: sentFile.id, path: sentFile.path } } : {}),
        ...(agentMode === 'debug' ? { diagnostics: agentDiagnostics, trace: agentTrace } : {}),
      };
      const response = await aiProvider.request(request);
      const latest = useIDEStore.getState();
      const latestFile = latest.activeFileId ? latest.loadedFiles.get(latest.activeFileId) : undefined;
      if (
        latest.projectSession !== current.projectSession ||
        latest.compilerRunId !== current.compilerRunId ||
        latest.workspaceScenarioLink?.workspaceId !== link.workspaceId ||
        (agentMode === 'edit' &&
          (!latestFile || latestFile.id !== file?.id || latestFile.content !== file?.content || latestFile.isModified))
      ) {
        setAgentState('error');
        return;
      }
      const baselineSha256 = agentMode === 'edit' && file ? await sha256Text(file.content) : undefined;
      const expectedEdit =
        agentMode === 'edit' && file && baselineSha256
          ? {
              projectSession: current.projectSession,
              compilerRunId: current.compilerRunId,
              workspaceId: link.workspaceId,
              fileId: file.id,
              path: file.path,
              content: file.content,
              handle: file.handle!,
              baselineSha256,
            }
          : undefined;
      const sent = sentFile
        ? {
            workspaceId: link.workspaceId,
            fileId: sentFile.id,
            path: sentFile.path,
            ...(baselineSha256 ? { baselineSha256 } : {}),
          }
        : undefined;
      const presentation = presentAgentResponse(response, sent);
      setAgentState({ kind: 'response', presentation, ...(expectedEdit ? { expectedEdit } : {}) });
    } catch {
      setAgentState('error');
    }
  };

  const reviewAgentProposal = async () => {
    const current = useIDEStore.getState();
    const link = current.workspaceScenarioLink;
    const response = typeof agentState === 'object' && agentState.kind === 'response' ? agentState : undefined;
    const expectedEdit = response?.expectedEdit;
    const changes = response?.presentation.kind === 'answer' ? response.presentation.changes : undefined;
    if (
      !candidateChangeSet ||
      !workspaceTests ||
      candidateReviewBusy ||
      !changes ||
      !expectedEdit ||
      !link ||
      link.projectSession !== current.projectSession ||
      workspaceTestBusy ||
      expectedEdit.projectSession !== current.projectSession ||
      expectedEdit.compilerRunId !== current.compilerRunId ||
      expectedEdit.workspaceId !== link.workspaceId
    )
      return;
    setWorkspaceTestBusy(true);
    try {
      await reviewProposal(changes, link.workspaceId, candidateChangeSet);
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const cancelAgentRequest = async () => {
    if (!aiProvider || agentState !== 'sending') return;
    setAgentState('cancelling');
    if (useReviewDocument.getState().review.kind === 'result') useReviewDocument.setState({ review: { kind: 'stale' } });
    try {
      await aiProvider.cancel();
    } catch {
      /* the provider request remains authoritative */
    }
  };

  // Collapsed state - just show header bar
  if (isConsoleCollapsed) {
    return (
      <div className="h-8 bg-[var(--color-surface-800)] border-t border-[var(--color-surface-600)] flex items-center px-2">
        <Button variant="ghost" size="sm" onClick={toggleConsole} aria-label={t('console.expandWorkbenchPanel')}>
          <ChevronUp size={16} />
          <span>{t('console.panel')}</span>
        </Button>

        {/* Quick status */}
        <div className="ml-4 text-xs tabular-nums text-[var(--color-surface-300)]" aria-label={t('console.problems', { problemSummary })}>
          {problemSummary}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface-800)] border-t border-[var(--color-surface-600)]">
      {/* Tab Bar: as tall as its tabs, since the compact density shrinks the spacing but not the text (SHL-016) */}
      <div className="min-h-8 flex items-center border-b border-[var(--color-surface-600)] px-2">
        {/* Collapse Button */}
        <IconButton
          label={t('console.collapseWorkbenchPanel')}
          variant="ghost"
          size="sm"
          icon={<ChevronDown size={16} />}
          onClick={toggleConsole}
          className="mr-2"
        />

        <ConsoleTabStrip
          tabs={tabs}
          activeConsoleTab={activeConsoleTab}
          onSelect={(tab) => {
            setActiveConsoleTab(tab);
            if (tab === 'agent') void refreshAiProvider();
          }}
        />

        {(activeConsoleTab === 'output' || activeConsoleTab === 'problems' || activeConsoleTab === 'trace') && (
          <IconButton
            label={t('console.clear', { tab: (tabs.find((tab) => tab.id === activeConsoleTab)?.label ?? activeConsoleTab).toLowerCase() })}
            tooltip={t('console.clear2')}
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => {
              if (activeConsoleTab === 'output') clearConsole();
              if (activeConsoleTab === 'problems') clearCompilerMessages();
              if (activeConsoleTab === 'trace') clearNativeTrace();
            }}
          />
        )}
      </div>

      {/* Content Area */}
      <div
        id={`console-panel-${activeConsoleTab}`}
        role="tabpanel"
        aria-labelledby={`console-tab-${activeConsoleTab}`}
        className="flex-1 overflow-y-auto font-mono text-sm"
      >
        <ErrorBoundary region="Panel" resetKey={activeConsoleTab}>
          <DevFaultProbe region="Panel" />
          <FileInput
            ref={workspaceManifestInputRef}
            accept="application/json,.json"
            label={t('console.chooseTheWorkspaceZplc')}
            data-workspace-manifest-input
            onChange={(event) => {
              void registerWorkspaceManifest(event);
            }}
          />
          {activeConsoleTab === 'output' && <OutputTab entries={consoleEntries} />}

          {activeConsoleTab === 'problems' && (
            <ProblemsPanel
              summary={problemSummary}
              live={liveSTDiagnostics}
              buildMessages={compilerMessages}
              checked={compilerMessagesChecked}
              fileTree={fileTree}
              activeFilePath={activeFile?.path}
              onActivate={(msg) => {
                void activateDiagnostic(msg);
              }}
            />
          )}

          {activeConsoleTab === 'tests' && (
            <TestsTab
              runner={runner}
              projectSession={projectSession}
              compilerRunId={compilerRunId}
              workspaceScenarioLink={workspaceScenarioLink}
              canonicalWorkspaceBuildEvidence={canonicalWorkspaceBuildEvidence}
            />
          )}

          {activeConsoleTab === 'interlocks' && <InterlocksTab runner={runner} />}

          {activeConsoleTab === 'changes' && (
            <ChangesTab
              hasCurrentWorkspaceLink={hasCurrentWorkspaceLink}
              isProjectOpen={isProjectOpen}
              candidateDesktopReady={candidateDesktopReady}
              candidateEligible={candidateEligible}
              candidateReviewStateForCurrent={candidateReviewStateForCurrent}
              workspaceTestBusy={workspaceTestBusy}
              workspaceManifestInputRef={workspaceManifestInputRef}
              effectiveTheme={effectiveTheme}
              reviewCandidateChange={reviewCandidateChange}
              cancelCandidateReview={cancelCandidateReview}
              saveReviewedChange={saveReviewedChange}
            />
          )}

          {activeConsoleTab === 'agent' && (
            <AgentTab
              agentMode={agentMode}
              setAgentMode={setAgentMode}
              agentPrompt={agentPrompt}
              setAgentPrompt={setAgentPrompt}
              agentState={agentState}
              setAgentState={setAgentState}
              agentStatus={agentStatus}
              agentBusy={agentBusy}
              agentCanSend={agentCanSend}
              agentProposalCurrent={agentProposalCurrent}
              agentEditFile={agentEditFile}
              agentContextFile={agentContextFile}
              agentDiagnosticCount={agentDiagnostics.length}
              agentTraceCount={agentTrace.length}
              hasCurrentWorkspaceLink={hasCurrentWorkspaceLink}
              workspaceTestBusy={workspaceTestBusy}
              refreshAiProvider={refreshAiProvider}
              sendAgentRequest={sendAgentRequest}
              cancelAgentRequest={cancelAgentRequest}
              reviewAgentProposal={reviewAgentProposal}
            />
          )}

          {activeConsoleTab === 'trace' && (
            <div className="p-2 font-sans text-sm text-[var(--color-surface-200)]">
              <p className="mb-2 text-xs text-[var(--color-surface-400)]">{t('console.nativePosixHostTrace')}</p>
              <LiveNativeMotorPanel
                adapterType={debugController?.adapter?.type}
                connected={Boolean(debugController?.adapter?.connected)}
                simulationInputsAuthorized={
                  debugController?.adapter instanceof NativeAdapter && debugController.adapter.supportsSimulationInput
                }
                vmState={debugController?.vmState ?? 'disconnected'}
                debugMap={debugMap}
                sample={latestNativeTrace}
                currentCompilerRunId={compilerRunId}
                setSimulationInput={debugController?.setSimulationInput}
              />
              {nativeTrace.length === 0 ? (
                <CommandEmptyState
                  title={t('panel.trace.empty.title')}
                  description={t('panel.trace.empty.description')}
                  actions={['debug.step', 'online.connect']}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
                    <caption className="sr-only">{t('console.nativePosixHostTrace2')}</caption>
                    <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]">
                      <tr>
                        <th scope="col" className="px-2 py-1 font-medium">
                          {t('console.uptime')}
                        </th>
                        <th scope="col" className="px-2 py-1 font-medium">
                          {t('console.cycles')}
                        </th>
                        <th scope="col" className="px-2 py-1 font-medium">
                          {t('console.state')}
                        </th>
                        <th scope="col" className="px-2 py-1 font-medium">
                          {t('console.pc')}
                        </th>
                        <th scope="col" className="px-2 py-1 font-medium">
                          {t('console.error')}
                        </th>
                        <th scope="col" className="px-2 py-1 text-right font-medium">
                          {t('console.overruns')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...nativeTrace].reverse().map((sample, index) => (
                        <tr
                          key={`${sample.uptimeMs}-${sample.cycles}-${index}`}
                          className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]"
                        >
                          <td className="px-2 py-1">{t('console.ms', { uptimeMs: sample.uptimeMs })}</td>
                          <td className="px-2 py-1">{sample.cycles}</td>
                          <td className="px-2 py-1">{sample.state}</td>
                          <td className="px-2 py-1">
                            {sample.pc === null ? '—' : t('console.0x', { value: sample.pc.toString(16).toUpperCase() })}
                          </td>
                          <td className="px-2 py-1">{describeVmError(sample.error)}</td>
                          <td className="px-2 py-1 text-right">{sample.overruns}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeConsoleTab === 'terminal' && <TerminalTab isActive={activeConsoleTab === 'terminal'} />}

          {activeConsoleTab === 'watch' && <WatchTab controller={debugController} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
