/**
 * Console Component
 * 
 * The results panel under the editor (UX-011): Output, Problems, Tests, Interlocks, Lab, Changes, Agent, Trace, Watch and Terminal tabs.
 * The Explorer, the Inspector and the lessons are views of the sidebars (shell/Sidebars.tsx).
 * The Terminal tab provides direct shell access to ZPLC devices.
 * The Watch tab shows live debug values.
 */

import { ProblemsPanel } from './ProblemsPanel';
import { getEntryIcon, getEntryColor, formatTime } from './consoleEntryStyle';
import { useUnseen } from './consoleAttention';
import { ChevronDown, ChevronUp, Terminal, AlertTriangle, Trash2, AlertCircle, Info, CheckCircle, Eye, FlaskConical, FolderOpen, LoaderCircle, Play, Activity, FileDiff, Bot, Send, CircleStop, Boxes, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Monaco } from './monacoRuntime';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { trackTestRun } from './workspaceTestNotifications';
import { useIDEStore } from '../store/useIDEStore';
import { useConsoleState } from '../store/regionSubscriptions';
import { isCandidateSTPath, sha256Text } from './candidateSources';
import type { ConsoleTab } from '../types';
import { TerminalTab } from './TerminalTab';
import { WatchTab } from './WatchTab';
import type { DebugController } from '../hooks/useDebugController';
import { classifyWorkspaceTestBuildLink, isWorkspaceManifestRegistrationCurrent, isWorkspaceTestRunCurrent, presentCandidateChangeSetReview, presentWorkspaceTestResult, workspaceTestAvailability, workspaceTestRunFallbackState, type WorkspaceTestPresentation } from './workspaceTestPresentation';
import { readFileContent } from '../utils/fileSystem';
import { describeVmError } from '../runtime/nativeTrace';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { presentWorkspaceSafetyCheck, type WorkspaceSafetyPresentation } from './workspaceSafetyPresentation';
import { InterlockCoverage } from './InterlockCoverage';
import { ErrorBoundary } from './ErrorBoundary';
import { DevFaultProbe } from './DevFaultProbe';
import { resultsTabFor } from '../shell/shellRouting';
import { usePublishWorkspaceTestResult } from '../shell/workspaceTestResult';
import { LabPanel } from './LabPanel';
import { elementToSelect } from '../editors/diagnosticElement';
import { requestElementSelection } from '../editors/elementSelectionRequests';
import { useProjectBlocks } from '../editors/useProjectBlocks';
import { presentAiProviderConfig, presentAiProviderMutation, presentAiProviderResponse, presentAiProviderStatus, type AiProviderMode, type AiProviderStatusPresentation } from './aiProviderPresentation';
import { useTheme } from '../hooks/useTheme';
import { ZPLC_DARK_THEME, ZPLC_DARK_THEME_ID, ZPLC_HIGH_CONTRAST_THEME, ZPLC_HIGH_CONTRAST_THEME_ID, ZPLC_LIGHT_THEME, ZPLC_LIGHT_THEME_ID } from '../utils/monaco-themes';
import { Badge, Button, Checkbox, FileInput, IconButton, TextField, Textarea, Tooltip } from '../ui';
import { useT } from '../i18n';
import { CommandEmptyState } from './panelStates';
import { CandidateReviewResult, AgentStatus, type CandidateReviewSnapshot, type CandidateReviewState, type AgentState } from './ConsoleReviewPanels';
import { LiveNativeMotorPanel } from './LiveNativeMotorControls';
import { WorkspaceTestResult } from './WorkspaceTestResult';

type WorkspaceTestResultState = { presentation: WorkspaceTestPresentation; projectSession: number; compilerRunId: number; workspaceId: string };
type WorkspaceSafetyTextState = { status: 'running' | 'unavailable'; projectSession: number; compilerRunId: number; workspaceId: string };
type WorkspaceSafetyState = 'idle' | WorkspaceSafetyTextState | { presentation: WorkspaceSafetyPresentation; projectSession: number; compilerRunId: number; workspaceId: string };

interface ConsoleProps {
  debugController?: DebugController;
}

function consoleTabAfterKey(tabs: ConsoleTab[], activeTab: ConsoleTab, key: string): ConsoleTab | null {
  const index = tabs.indexOf(activeTab);
  if (index < 0) return null;
  if (key === 'Home') return tabs[0] ?? null;
  if (key === 'End') return tabs.at(-1) ?? null;
  if (key === 'ArrowLeft') return tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
  if (key === 'ArrowRight') return tabs[(index + 1) % tabs.length] ?? null;
  return null;
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
    saveAllFiles,
    saveProjectConfig,
    saveFile,
    updateFileContent,
  } = useConsoleState();
  // a request for a view that left this panel (the explorer, the inspector, the lessons) is shown by the sidebars; this panel keeps its own tab
  const activeConsoleTab = resultsTabFor(storedConsoleTab);
  const { effectiveTheme } = useTheme();
  const projectBlocks = useProjectBlocks();
  const [workspaceTestBusy, setWorkspaceTestBusy] = useState(false);
  const [workspaceTestState, setWorkspaceTestState] = useState<'idle' | 'selected' | 'running' | 'cancelling' | 'desktop-unavailable' | WorkspaceTestResultState>('idle');
  const [workspaceSafetyState, setWorkspaceSafetyState] = useState<WorkspaceSafetyState>('idle');
  const workspaceManifestInputRef = useRef<HTMLInputElement>(null);
  const workspaceTests = shownProjectBridge(window.electronAPI?.workspaceTests);
  const candidateChangeSet = window.electronAPI?.candidateChangeSet;
  const aiProvider = window.electronAPI?.aiProvider;
  const candidateDesktopReady = Boolean(candidateChangeSet && workspaceTests);
  const candidateReviewGeneration = useRef(0);
  const candidateReviewBusy = useRef(false);
  const [candidateReviewState, setCandidateReviewState] = useState<CandidateReviewState>({ kind: 'idle' });
  const [agentMode, setAgentMode] = useState<AiProviderMode>('ask');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [agentStatus, setAgentStatus] = useState<AiProviderStatusPresentation>({ kind: 'invalid' });
  const [agentConfig, setAgentConfig] = useState({ enabled: false, endpoint: '', model: '' });
  const [agentKey, setAgentKey] = useState('');
  const [agentSettingsBusy, setAgentSettingsBusy] = useState(false);
  const [agentSettingsMessage, setAgentSettingsMessage] = useState<string | null>(null);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const hasCurrentWorkspaceLink = workspaceScenarioLink?.projectSession === projectSession;
  const workspaceTestAvailabilityState = workspaceTestAvailability({
    desktopAvailable: Boolean(workspaceTests),
    isProjectOpen,
    hasCurrentLink: hasCurrentWorkspaceLink,
    hasUnsavedChanges: hasUnsavedChanges(),
  });
  const workspaceTestStateForLink = typeof workspaceTestState === 'object' && !isWorkspaceTestRunCurrent({ projectSession, compilerRunId, workspaceScenarioLink }, workspaceTestState)
    ? workspaceTestRunFallbackState({ isProjectOpen, projectSession, workspaceScenarioLink })
    : hasCurrentWorkspaceLink ? workspaceTestState : 'idle';
  const workspaceSafetyStateForLink = workspaceSafetyState === 'idle' || !isWorkspaceTestRunCurrent({ projectSession, compilerRunId, workspaceScenarioLink }, workspaceSafetyState)
    ? 'idle'
    : 'status' in workspaceSafetyState ? workspaceSafetyState.status : workspaceSafetyState;

  // The lessons live in the sidebar and read the latest scenario run from here.
  usePublishWorkspaceTestResult(typeof workspaceTestStateForLink === 'object' ? workspaceTestStateForLink.presentation : undefined);

  // Get watch count for badge
  const watchCount = useIDEStore((state) => state.debug.watchVariables.length);
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const debugMode = useIDEStore((state) => state.debug.mode);
  const latestNativeTrace = nativeTrace.at(-1);
  const activeFile = activeFileId ? loadedFiles.get(activeFileId) : undefined;
  const candidateEligible = Boolean(candidateDesktopReady && isProjectOpen && hasCurrentWorkspaceLink
    && activeFile && activeFile.language === 'ST' && isCandidateSTPath(activeFile.path) && activeFile.isModified && activeFile.handle);
  const candidateReviewStateForCurrent = candidateReviewState.kind === 'result' && (candidateReviewState.snapshot.projectSession !== projectSession
    || candidateReviewState.snapshot.compilerRunId !== compilerRunId || candidateReviewState.snapshot.workspaceId !== workspaceScenarioLink?.workspaceId
    || candidateReviewState.snapshot.fileId !== activeFileId || candidateReviewState.snapshot.path !== activeFile?.path || candidateReviewState.snapshot.editorContent !== activeFile?.content
    || candidateReviewState.snapshot.handle !== activeFile?.handle || (candidateReviewState.snapshot.origin === 'manual' ? !activeFile?.isModified : activeFile?.isModified))
    ? { kind: 'stale' } as CandidateReviewState
    : candidateReviewState;
  useEffect(() => { candidateReviewGeneration.current += 1; }, [projectSession, compilerRunId, activeFileId, activeFile?.path, activeFile?.content, activeFile?.handle, activeFile?.isModified, workspaceScenarioLink?.workspaceId]);
  const liveSTDiagnostics = stBufferDiagnostics
    && stBufferDiagnostics.projectSession === projectSession
    && stBufferDiagnostics.compilerRunId === compilerRunId
    && stBufferDiagnostics.fileId === activeFileId
    && stBufferDiagnostics.file === activeFile?.path
    ? stBufferDiagnostics.diagnostics
    : [];
  const errorCount = compilerMessages.filter((message) => message.type === 'error').length
    + liveSTDiagnostics.filter((message) => message.type === 'error').length;
  const warningCount = compilerMessages.filter((message) => message.type === 'warning').length
    + liveSTDiagnostics.filter((message) => message.type === 'warning').length;
  const problemSummary = `${errorCount} ${errorCount === 1 ? 'error' : 'errors'} · ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`;

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
  const unseen = useUnseen({ output: consoleEntries.length, problems: compilerMessages.length }, activeConsoleTab);
  const unseenTab = (count = 0) => count > 0 ? { count: <Badge tone="info" className="ml-1">{count}</Badge>, ariaLabel: t('console.tab.unseenOutput', { count }) } : {};
  const tabs: { id: ConsoleTab; label: string; icon: React.ReactNode; count?: React.ReactNode; ariaLabel?: string }[] = [
    { id: 'output', label: t('panel.output'), icon: <Terminal size={14} />, ...unseenTab(unseen.output) },
    {
      id: 'problems',
      label: t('panel.problems'),
      icon: <AlertTriangle size={14} />,
      count: <><span className="text-xs tabular-nums">{problemSummary}</span>{unseenTab(unseen.problems).count}</>,
      ariaLabel: t('console.tab.problemsAria', { summary: problemSummary }) + (unseen.problems ? `, ${t('console.tab.unseen', { count: unseen.problems })}` : ''),
    },
    {
      id: 'tests',
      label: t('panel.tests'),
      icon: <FlaskConical size={14} />,
      ariaLabel: t('console.tab.testsAria'),
    },
    { id: 'interlocks', label: t('console.tab.interlocks'), icon: <ShieldCheck size={14} />, ariaLabel: t('console.tab.interlocksAria') },
    { id: 'lab', label: t('console.tab.lab'), icon: <Boxes size={14} />, ariaLabel: t('console.tab.labAria') },
    { id: 'changes', label: t('console.tab.changes'), icon: <FileDiff size={14} />, ariaLabel: t('console.tab.changesAria') },
    { id: 'agent', label: t('console.tab.agent'), icon: <Bot size={14} />, ariaLabel: t('console.tab.agentAria') },
    {
      id: 'trace',
      label: t('panel.trace'),
      icon: <Activity size={14} />,
      count: nativeTrace.length > 0 ? nativeTrace.length : undefined,
      ariaLabel: tn('console.tab.traceAria', nativeTrace.length),
    },
    { id: 'watch', label: t('panel.watch'), icon: <Eye size={14} className={debugMode !== 'none' ? 'text-[var(--color-accent-green)]' : ''} />, count: watchCount > 0 ? watchCount : undefined },
    { id: 'terminal', label: t('console.tab.terminal'), icon: <Terminal size={14} className="text-[var(--color-accent-green)]" /> },
  ];

  const registerWorkspaceManifest = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !workspaceTests || workspaceTestBusy || !isProjectOpen) return;
    const expectedProjectSession = projectSession;
    setWorkspaceTestBusy(true);
    try {
      const selection = await workspaceTests.registerProjectFile(file);
      if (selection?.workspaceId
        && isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)) {
        if (linkWorkspaceScenarios(selection.workspaceId, expectedProjectSession)) {
          setWorkspaceTestState('selected');
        }
      }
    } catch {
      if (isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)) {
        setWorkspaceTestState('desktop-unavailable');
      }
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const saveWorkspaceProject = async () => {
    const current = useIDEStore.getState();
    if (workspaceTestBusy || !current.isProjectOpen) return;
    const expectedProjectSession = current.projectSession;
    setWorkspaceTestBusy(true);
    try {
      await saveAllFiles();
      let latest = useIDEStore.getState();
      if (latest.projectSession !== expectedProjectSession
        || !latest.isProjectOpen
        || Array.from(latest.loadedFiles.values()).some((file) => file.isModified)) return;

      if (latest.projectConfigDirty) {
        await saveProjectConfig();
      }

      latest = useIDEStore.getState();
      if (latest.projectSession !== expectedProjectSession
        || !latest.isProjectOpen
        || latest.hasUnsavedChanges()) return;
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  // The workspace test handlers below catch their own errors and show them in the panel; the buttons start them with `void`.
  const runWorkspaceTests = async (scenarioId?: string) => {
    const current = useIDEStore.getState();
    const link = current.workspaceScenarioLink;
    if (!workspaceTests || workspaceTestBusy || !current.isProjectOpen || current.hasUnsavedChanges() || !link || link.projectSession !== current.projectSession) return;
    const { workspaceId, projectSession: expectedProjectSession } = link;
    const expectedCompilerRunId = current.compilerRunId;
    setWorkspaceTestBusy(true);
    setWorkspaceTestState('running');
    const notice = trackTestRun(scenarioId, () => { void workspaceTests.cancel().catch(() => undefined); });
    try {
      const request = { workspaceId, ...(scenarioId === undefined ? {} : { scenarioId }) };
      const result = await workspaceTests.run(request);
      const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) {
        setWorkspaceTestState({ presentation: presentWorkspaceTestResult(result), projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId });
        notice.done(result);
      } else notice.dismiss();
    } catch {
      const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) {
        setWorkspaceTestState('desktop-unavailable');
        notice.unavailable();
      } else notice.dismiss();
    } finally {
      setWorkspaceTestBusy(false);
      const latest = useIDEStore.getState();
      setWorkspaceTestState((state) => state === 'running' || state === 'cancelling' ? workspaceTestRunFallbackState(latest) : state);
    }
  };

  const runWorkspaceSafetyCheck = async () => {
    const current = useIDEStore.getState(); const link = current.workspaceScenarioLink;
    if (!workspaceTests || workspaceTestBusy || !current.isProjectOpen || current.hasUnsavedChanges() || !link || link.projectSession !== current.projectSession) return;
    const { workspaceId, projectSession: expectedProjectSession } = link; const expectedCompilerRunId = current.compilerRunId;
    let published = false;
    setWorkspaceTestBusy(true); setWorkspaceSafetyState({ status: 'running', projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId });
    try {
      const result = await workspaceTests.safetyCheck({ workspaceId }); const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) {
        setWorkspaceSafetyState({ presentation: presentWorkspaceSafetyCheck(result), projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId });
        published = true;
      }
    } catch {
      const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) { setWorkspaceSafetyState({ status: 'unavailable', projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId }); published = true; }
    } finally { setWorkspaceTestBusy(false); if (!published) setWorkspaceSafetyState((state) => typeof state === 'object' && 'status' in state && state.status === 'running' ? 'idle' : state); }
  };

  const cancelWorkspaceTests = async () => {
    if (!workspaceTests || !workspaceTestBusy || workspaceTestState !== 'running') return;
    setWorkspaceTestState('cancelling');
    try { await workspaceTests.cancel(); } catch { /* the active run remains authoritative */ }
  };

  const candidateSnapshotIsCurrent = (snapshot: CandidateReviewSnapshot) => {
    const current = useIDEStore.getState();
    const file = current.loadedFiles.get(snapshot.fileId);
    return current.projectSession === snapshot.projectSession
      && current.compilerRunId === snapshot.compilerRunId
      && current.activeFileId === snapshot.fileId
      && current.workspaceScenarioLink?.projectSession === snapshot.projectSession
      && current.workspaceScenarioLink.workspaceId === snapshot.workspaceId
      && file?.path === snapshot.path && file.content === snapshot.editorContent && file.handle === snapshot.handle
      && (snapshot.origin === 'manual' ? file.isModified : !file.isModified);
  };

  const reviewCandidateChange = async () => {
    const current = useIDEStore.getState();
    const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
    const link = current.workspaceScenarioLink;
    if (!candidateChangeSet || !workspaceTests || candidateReviewBusy.current || !file || !file.handle || !file.isModified || file.language !== 'ST' || !isCandidateSTPath(file.path)
      || workspaceTestBusy || !current.isProjectOpen || !link || link.projectSession !== current.projectSession) return;
    const generation = ++candidateReviewGeneration.current;
    candidateReviewBusy.current = true; setWorkspaceTestBusy(true); setCandidateReviewState({ kind: 'running' });
    try {
      const baseline = await readFileContent(file.handle);
      const [beforeSha256, afterSha256] = await Promise.all([sha256Text(baseline), sha256Text(file.content)]);
      const snapshot: CandidateReviewSnapshot = { origin: 'manual', projectSession: current.projectSession, compilerRunId: current.compilerRunId, workspaceId: link.workspaceId, fileId: file.id, path: file.path, editorContent: file.content, candidate: file.content, handle: file.handle, beforeSha256, afterSha256, baseline };
      if (generation !== candidateReviewGeneration.current || !candidateSnapshotIsCurrent(snapshot)) return;
      if (beforeSha256 === afterSha256) { setCandidateReviewState({ kind: 'matches-disk' }); return; }
      const result = await candidateChangeSet.review({ workspaceId: snapshot.workspaceId, edit: { path: snapshot.path, content: snapshot.candidate } });
      if (generation !== candidateReviewGeneration.current || !candidateSnapshotIsCurrent(snapshot)) return;
      setCandidateReviewState({ kind: 'result', snapshot, presentation: presentCandidateChangeSetReview(result, snapshot) });
    } catch {
      if (generation === candidateReviewGeneration.current) setCandidateReviewState({ kind: 'error' });
    } finally {
      if (candidateReviewBusy.current) { candidateReviewBusy.current = false; setWorkspaceTestBusy(false); }
      setCandidateReviewState((state) => state.kind === 'running' || state.kind === 'cancelling' ? { kind: 'stale' } : state);
    }
  };

  const cancelCandidateReview = async () => {
    if (!workspaceTests || candidateReviewState.kind !== 'running' || !workspaceTestBusy) return;
    candidateReviewGeneration.current += 1;
    setCandidateReviewState({ kind: 'cancelling' });
    try { await workspaceTests.cancel(); } catch { /* cancellation cannot publish a review */ }
  };

  const saveReviewedChange = async () => {
    if (candidateReviewBusy.current || candidateReviewState.kind !== 'result' || candidateReviewState.presentation.kind !== 'accepted') return;
    const { snapshot } = candidateReviewState;
    if (!candidateSnapshotIsCurrent(snapshot)) { setCandidateReviewState({ kind: 'stale' }); return; }
    candidateReviewBusy.current = true; setWorkspaceTestBusy(true); setCandidateReviewState({ kind: 'saving' });
    try {
      const diskHash = await sha256Text(await readFileContent(snapshot.handle));
      if (diskHash !== snapshot.beforeSha256 || !candidateSnapshotIsCurrent(snapshot)) { setCandidateReviewState({ kind: 'stale' }); return; }
      if (snapshot.origin === 'agent') {
        updateFileContent(snapshot.fileId, snapshot.candidate);
        const changed = useIDEStore.getState().loadedFiles.get(snapshot.fileId);
        if (!changed || changed.content !== snapshot.candidate || !changed.isModified) { setCandidateReviewState({ kind: 'stale' }); return; }
      }
      if (await saveFile(snapshot.fileId)) setCandidateReviewState({ kind: 'saved' });
      else setCandidateReviewState({ kind: 'error' });
    } catch { setCandidateReviewState({ kind: 'error' }); }
    finally { candidateReviewBusy.current = false; setWorkspaceTestBusy(false); }
  };

  const refreshAiProvider = useCallback(async () => {
    await Promise.resolve();
    if (!aiProvider) { setAgentState('unavailable'); setAgentStatus({ kind: 'invalid' }); return; }
    setAgentState('loading');
    try {
      const [statusValue, configValue] = await Promise.all([aiProvider.getStatus(), aiProvider.getConfig()]);
      const status = presentAiProviderStatus(statusValue); const config = presentAiProviderConfig(configValue);
      setAgentStatus(status); if (config) setAgentConfig(config);
      setAgentState(status.kind === 'invalid' ? 'unavailable' : 'idle');
    } catch { setAgentState('unavailable'); }
  }, [aiProvider, setAgentState, setAgentStatus, setAgentConfig]);

  const agentEditFile = activeFile && activeFile.language === 'ST' && isCandidateSTPath(activeFile.path) && activeFile.handle && !activeFile.isModified ? activeFile : undefined;
  const agentBusy = agentState === 'sending' || agentState === 'cancelling';
  const agentProposalCurrent = typeof agentState === 'object' && agentState.kind === 'response' && agentState.expectedEdit !== undefined
    && agentState.expectedEdit.projectSession === projectSession && agentState.expectedEdit.compilerRunId === compilerRunId && agentState.expectedEdit.workspaceId === workspaceScenarioLink?.workspaceId
    && agentState.expectedEdit.fileId === activeFile?.id && agentState.expectedEdit.path === activeFile?.path && agentState.expectedEdit.content === activeFile?.content && agentState.expectedEdit.handle === activeFile?.handle && !activeFile?.isModified;
  const agentCanSend = Boolean(aiProvider && !agentBusy && !agentSettingsBusy && agentStatus.kind === 'ready' && agentStatus.configured && agentStatus.enabled && hasCurrentWorkspaceLink && isProjectOpen && agentPrompt.trim().length > 0 && agentPrompt.length <= 4_000
    && (agentMode !== 'edit' || agentEditFile));
  const agentDiagnostics = liveSTDiagnostics.slice(0, 32).map(({ code, line, column }) => ({ code, ...(activeFile?.path ? { path: activeFile.path } : {}), ...(line === undefined ? {} : { line }), ...(column === undefined ? {} : { column }) }));
  const agentTrace = nativeTrace.slice(-32).map((sample) => ({ atMs: sample.uptimeMs, signal: 'runtime.cycles', value: sample.cycles }));

  const sendAgentRequest = async () => {
    const current = useIDEStore.getState(); const link = current.workspaceScenarioLink; const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
    if (!aiProvider || !link || link.projectSession !== current.projectSession || !current.isProjectOpen || !agentCanSend || (agentMode === 'edit' && (!file || file !== agentEditFile))) return;
    setCandidateReviewState((state) => state.kind === 'result' ? { kind: 'stale' } : state);
    setAgentState('sending');
    try {
      const request = {
        workspaceId: link.workspaceId,
        mode: agentMode,
        prompt: agentPrompt.trim(),
        ...(agentMode === 'edit' && file ? { activeFile: { fileId: file.id, path: file.path } } : {}),
        ...(agentMode === 'debug' ? { diagnostics: agentDiagnostics, trace: agentTrace } : {}),
      };
      const response = await aiProvider.request(request);
      const latest = useIDEStore.getState(); const latestFile = latest.activeFileId ? latest.loadedFiles.get(latest.activeFileId) : undefined;
      if (latest.projectSession !== current.projectSession || latest.compilerRunId !== current.compilerRunId || latest.workspaceScenarioLink?.workspaceId !== link.workspaceId || (agentMode === 'edit' && (!latestFile || latestFile.id !== file?.id || latestFile.content !== file?.content || latestFile.isModified))) { setAgentState('error'); return; }
      const baselineSha256 = agentMode === 'edit' && file ? await sha256Text(file.content) : undefined;
      const expectedEdit = agentMode === 'edit' && file && baselineSha256 ? { projectSession: current.projectSession, compilerRunId: current.compilerRunId, workspaceId: link.workspaceId, fileId: file.id, path: file.path, content: file.content, handle: file.handle!, baselineSha256 } : undefined;
      const presentation = presentAiProviderResponse(response, expectedEdit);
      setAgentState({ kind: 'response', presentation, ...(expectedEdit ? { expectedEdit } : {}) });
    } catch { setAgentState('error'); }
  };

  const reviewAgentProposal = async () => {
    const current = useIDEStore.getState(); const link = current.workspaceScenarioLink; const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
    const response = typeof agentState === 'object' && agentState.kind === 'response' ? agentState : undefined;
    const expectedEdit = response?.expectedEdit;
    if (!candidateChangeSet || !workspaceTests || candidateReviewBusy.current || !response || response.presentation.kind !== 'answer' || !response.presentation.replacement || !expectedEdit || !file || !file.handle || file.isModified || file.language !== 'ST' || !isCandidateSTPath(file.path) || !link || link.projectSession !== current.projectSession || workspaceTestBusy
      || expectedEdit.projectSession !== current.projectSession || expectedEdit.compilerRunId !== current.compilerRunId || expectedEdit.workspaceId !== link.workspaceId || expectedEdit.fileId !== file.id || expectedEdit.path !== file.path || expectedEdit.content !== file.content || expectedEdit.handle !== file.handle) return;
    const generation = ++candidateReviewGeneration.current; candidateReviewBusy.current = true; setWorkspaceTestBusy(true); setCandidateReviewState({ kind: 'running' });
    try {
      const baseline = await readFileContent(file.handle); const [beforeSha256, afterSha256] = await Promise.all([sha256Text(baseline), sha256Text(response.presentation.replacement.content)]);
      if (baseline !== file.content || beforeSha256 !== expectedEdit.baselineSha256 || generation !== candidateReviewGeneration.current || file.content !== useIDEStore.getState().loadedFiles.get(file.id)?.content || beforeSha256 !== await sha256Text(file.content)) { setCandidateReviewState({ kind: 'stale' }); return; }
      const snapshot: CandidateReviewSnapshot = { origin: 'agent', projectSession: current.projectSession, compilerRunId: current.compilerRunId, workspaceId: link.workspaceId, fileId: file.id, path: file.path, editorContent: file.content, candidate: response.presentation.replacement.content, handle: file.handle, beforeSha256, afterSha256, baseline };
      if (!candidateSnapshotIsCurrent(snapshot)) return;
      const result = await candidateChangeSet.review({ workspaceId: snapshot.workspaceId, edit: { path: snapshot.path, content: snapshot.candidate } });
      if (generation !== candidateReviewGeneration.current || !candidateSnapshotIsCurrent(snapshot)) return;
      setCandidateReviewState({ kind: 'result', snapshot, presentation: presentCandidateChangeSetReview(result, snapshot) });
    } catch { if (generation === candidateReviewGeneration.current) setCandidateReviewState({ kind: 'error' }); }
    finally { candidateReviewBusy.current = false; setWorkspaceTestBusy(false); }
  };

  const cancelAgentRequest = async () => {
    if (!aiProvider || agentState !== 'sending') return;
    setAgentState('cancelling'); setCandidateReviewState((state) => state.kind === 'result' ? { kind: 'stale' } : state);
    try { await aiProvider.cancel(); } catch { /* the provider request remains authoritative */ }
  };

  const saveAgentConfig = async () => {
    if (!aiProvider || agentBusy || agentSettingsBusy) return;
    setAgentSettingsBusy(true); setAgentSettingsMessage(null);
    try {
      const result = presentAiProviderMutation(await aiProvider.saveConfig(agentConfig));
      if (result.kind !== 'ok') { setAgentSettingsMessage(result.kind === 'error' ? `Configuration was not saved: ${result.code}.` : 'Configuration result could not be trusted.'); return; }
      await refreshAiProvider(); setAgentSettingsMessage('Configuration saved.');
    } catch { setAgentSettingsMessage('Configuration could not be saved.'); }
    finally { setAgentSettingsBusy(false); }
  };

  const storeAgentKey = async () => {
    if (!aiProvider || !agentKey || agentBusy || agentSettingsBusy) return;
    setAgentSettingsBusy(true); setAgentSettingsMessage(null);
    try {
      const result = presentAiProviderMutation(await aiProvider.storeKey(agentKey));
      if (result.kind !== 'ok') { setAgentSettingsMessage(result.kind === 'error' ? `Key was not stored: ${result.code}.` : 'Key storage result could not be trusted.'); return; }
      setAgentKey(''); await refreshAiProvider(); setAgentSettingsMessage('Key stored.');
    } catch { setAgentSettingsMessage('Key could not be stored.'); }
    finally { setAgentSettingsBusy(false); }
  };

  const clearAgentKey = async () => {
    if (!aiProvider || agentBusy || agentSettingsBusy) return;
    setAgentSettingsBusy(true); setAgentSettingsMessage(null);
    try {
      const result = presentAiProviderMutation(await aiProvider.clearKey());
      if (result.kind !== 'ok') { setAgentSettingsMessage(result.kind === 'error' ? `Key was not cleared: ${result.code}.` : 'Key clear result could not be trusted.'); return; }
      await refreshAiProvider(); setAgentSettingsMessage('Stored key cleared.');
    } catch { setAgentSettingsMessage('Key could not be cleared.'); }
    finally { setAgentSettingsBusy(false); }
  };

  const beforeMountDiff = (monaco: Monaco) => {
    monaco.editor.defineTheme(ZPLC_DARK_THEME_ID, ZPLC_DARK_THEME);
    monaco.editor.defineTheme(ZPLC_LIGHT_THEME_ID, ZPLC_LIGHT_THEME);
    monaco.editor.defineTheme(ZPLC_HIGH_CONTRAST_THEME_ID, ZPLC_HIGH_CONTRAST_THEME);
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
      {/* Tab Bar */}
      <div className="h-8 flex items-center border-b border-[var(--color-surface-600)] px-2">
        {/* Collapse Button */}
        <IconButton label={t('console.collapseWorkbenchPanel')} variant="ghost" size="sm" icon={<ChevronDown size={16} />} onClick={toggleConsole} className="mr-2" />

        <div role="tablist" aria-label={t('console.workbenchPanels')} className="flex h-full min-w-0 items-center overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`console-tab-${tab.id}`}
              role="tab"
              aria-selected={activeConsoleTab === tab.id}
              aria-controls={`console-panel-${tab.id}`}
              aria-label={tab.ariaLabel}
              tabIndex={activeConsoleTab === tab.id ? 0 : -1}
              onClick={() => { setActiveConsoleTab(tab.id); if (tab.id === 'agent') void refreshAiProvider(); }}
              onKeyDown={(event) => {
                const nextTab = consoleTabAfterKey(tabs.map(({ id }) => id), activeConsoleTab, event.key);
                if (!nextTab) return;
                event.preventDefault();
                setActiveConsoleTab(nextTab);
                if (nextTab === 'agent') void refreshAiProvider();
                document.getElementById(`console-tab-${nextTab}`)?.focus();
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1 text-sm transition-colors ${
                activeConsoleTab === tab.id
                  ? 'text-[var(--color-surface-100)] border-b-2 border-[var(--color-accent-blue)]'
                  : 'text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && <span className={tab.id === 'problems' ? 'ml-1 hidden md:inline' : 'ml-1'}>{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {(activeConsoleTab === 'output' || activeConsoleTab === 'problems' || activeConsoleTab === 'trace') && (
          <IconButton label={t('console.clear', { tab: (tabs.find((tab) => tab.id === activeConsoleTab)?.label ?? activeConsoleTab).toLowerCase() })} tooltip={t('console.clear2')} variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => {
 if (activeConsoleTab === 'output') clearConsole();
 if (activeConsoleTab === 'problems') clearCompilerMessages();
 if (activeConsoleTab === 'trace') clearNativeTrace();
 }} />
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
          onChange={(event) => { void registerWorkspaceManifest(event); }}
        />
        {activeConsoleTab === 'output' && (
          <div className="p-2 space-y-0.5">
            {consoleEntries.length === 0 ? (
              <CommandEmptyState title={t('panel.output.empty.title')} description={t('panel.output.empty.description')} actions={['build.compile']} />
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 py-0.5 hover:bg-[var(--color-surface-700)] px-1 rounded"
                >
                  {getEntryIcon(entry.type)}
                  <span className="text-[var(--color-surface-400)] text-xs min-w-[60px]">
                    [{formatTime(entry.timestamp)}]
                  </span>
                  {entry.source && (
                    <span className="text-[var(--text-muted)] text-xs">
                      [{entry.source}]
                    </span>
                  )}
                  <span className={getEntryColor(entry.type)}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeConsoleTab === 'problems' && (
          <ProblemsPanel summary={problemSummary} live={liveSTDiagnostics} buildMessages={compilerMessages} checked={compilerMessagesChecked} fileTree={fileTree} activeFilePath={activeFile?.path} onActivate={(msg) => { void activateDiagnostic(msg); }} />
        )}

        {activeConsoleTab === 'tests' && (
          <div className="p-3 space-y-3 font-sans text-sm text-[var(--color-surface-200)]">
            {workspaceTestAvailabilityState === 'desktop-unavailable' ? (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]"><Info size={15} aria-hidden="true" />{t('console.workspaceTestsRequireThe')}</p>
            ) : workspaceTestAvailabilityState === 'project-required' ? (
              <CommandEmptyState title={t('panel.tests.empty.title')} description={t('panel.tests.empty.description')} actions={['file.open']} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => workspaceManifestInputRef.current?.click()} disabled={workspaceTestBusy}>
                    <FolderOpen size={14} aria-hidden="true" />
                    {hasCurrentWorkspaceLink ? t('console.chooseZplcJsonAgain') : t('console.chooseZplcJson')}
                  </Button>
                  {workspaceTestAvailabilityState === 'unsaved' && (
                    <Button variant="secondary" size="sm" onClick={() => { void saveWorkspaceProject(); }} disabled={workspaceTestBusy}>
                      {t('console.saveProject')}
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={() => { void runWorkspaceTests(); }} disabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'}>
                    <Play size={14} aria-hidden="true" />
                    {t('console.runHostScenarios')}
                  </Button>
                  {workspaceTestStateForLink === 'running' || workspaceTestStateForLink === 'cancelling' ? (
                    <Button variant="secondary" size="sm" onClick={() => { void cancelWorkspaceTests(); }} disabled={workspaceTestStateForLink === 'cancelling'}>
                      {workspaceTestStateForLink === 'cancelling' ? t('console.cancelling') : t('console.cancelScenarios')}
                    </Button>
                  ) : null}
                </div>

                {workspaceTestAvailabilityState === 'link-required' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]"><Info size={15} aria-hidden="true" />{t('console.selectTheSavedWorkspace')}</p>
                )}
                {workspaceTestAvailabilityState === 'unsaved' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-accent-yellow)]"><AlertCircle size={15} aria-hidden="true" />{t('console.testsUseSavedWorkspace')}</p>
                )}
                {workspaceTestAvailabilityState === 'ready' && (workspaceTestStateForLink === 'selected' || workspaceTestStateForLink === 'idle') && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]"><CheckCircle size={15} aria-hidden="true" />{t('console.linkedSavedWorkspaceReady')}</p>
                )}
                {workspaceTestStateForLink === 'running' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
                    <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {t('console.runningHostPosixScenarios')}
                  </p>
                )}
                {workspaceTestStateForLink === 'cancelling' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
                    <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {t('console.cancellingHostPosixScenarios')}
                  </p>
                )}
                {workspaceTestStateForLink === 'desktop-unavailable' && (
                  <p role="status" aria-live="polite" className="text-[var(--color-accent-yellow)]">{t('console.hostPosixSimulationIs')}</p>
                )}
                {typeof workspaceTestStateForLink === 'object' && (
                  <WorkspaceTestResult
                    presentation={workspaceTestStateForLink.presentation}
                    onRunScenario={(scenarioId) => { void runWorkspaceTests(scenarioId); }}
                    scenarioRunDisabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'}
                    buildLink={classifyWorkspaceTestBuildLink(
                      { projectSession, compilerRunId, workspaceScenarioLink },
                      canonicalWorkspaceBuildEvidence,
                      workspaceTestStateForLink,
                    )}
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeConsoleTab === 'interlocks' && <InterlockCoverage availability={workspaceTestAvailabilityState} state={workspaceSafetyStateForLink} busy={workspaceTestBusy} onCheck={() => { void runWorkspaceSafetyCheck(); }} />}

        {activeConsoleTab === 'changes' && (
          <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
            <div className="border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {!hasCurrentWorkspaceLink && isProjectOpen && candidateDesktopReady && (
                  <Button variant="secondary" size="sm" onClick={() => workspaceManifestInputRef.current?.click()} disabled={workspaceTestBusy}><FolderOpen size={14} aria-hidden="true" />{t('console.chooseZplcJson')}</Button>
                )}
                <Button variant="primary" size="sm" onClick={() => { void reviewCandidateChange(); }} disabled={!candidateEligible || workspaceTestBusy}><FileDiff size={14} aria-hidden="true" />{t('console.reviewActiveStChange')}</Button>
                {candidateReviewStateForCurrent.kind === 'running' && <Button variant="secondary" size="sm" onClick={() => { void cancelCandidateReview(); }}>{t('console.cancelReview')}</Button>}
              </div>
              {!candidateDesktopReady ? <p role="status" aria-live="polite" className="mt-3">{t('console.changeReviewRequiresThe')}</p>
                : !isProjectOpen ? <p role="status" aria-live="polite" className="mt-3">{t('console.openASavedProject')}</p>
                  : !hasCurrentWorkspaceLink ? <p role="status" aria-live="polite" className="mt-3">{t('console.chooseTheSavedWorkspace')}</p>
                    : !candidateEligible ? <p role="status" aria-live="polite" className="mt-3">{t('console.onlyAModifiedActive')}</p>
                      : <p className="mt-3 text-[var(--color-surface-300)]">{t('console.onlyTheActiveStructured')}</p>}
              <p className="mt-2 text-xs text-[var(--color-surface-400)]"><Tooltip content={t('console.nativePosixHostEvidence')}><span tabIndex={0}><Badge tone="neutral">{t('console.hostEvidenceBadge')}</Badge></span></Tooltip></p>
              <p className="text-xs text-[var(--color-surface-400)]">{t('console.reviewItselfDoesNot')}</p>
            </div>
            <div role="status" aria-live="polite" className="mt-3">
              {candidateReviewStateForCurrent.kind === 'matches-disk' && <p>{t('console.theActiveBufferMatches')}</p>}
              {candidateReviewStateForCurrent.kind === 'running' && <p className="flex items-center gap-2"><LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('console.reviewingTheChangeIn')}</p>}
              {candidateReviewStateForCurrent.kind === 'cancelling' && <p>{t('console.cancellingTheReview')}</p>}
              {candidateReviewStateForCurrent.kind === 'saving' && <p>{t('console.savingReviewedChange')}</p>}
              {candidateReviewStateForCurrent.kind === 'stale' && <p>{t('console.theChangeIsNo')}</p>}
              {candidateReviewStateForCurrent.kind === 'error' && <p>{t('console.theReviewCouldNot')}</p>}
              {candidateReviewStateForCurrent.kind === 'saved' && <p>{t('console.reviewedChangeSavedReview')}</p>}
            </div>
            {candidateReviewStateForCurrent.kind === 'result' && <CandidateReviewResult state={candidateReviewStateForCurrent} effectiveTheme={effectiveTheme} beforeMount={beforeMountDiff} onSave={() => { void saveReviewedChange(); }} busy={workspaceTestBusy} />}
          </div>
        )}

        {activeConsoleTab === 'agent' && (
          <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
            <section aria-label={t('console.optionalAgent')} className="max-w-3xl space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-surface-600)] pb-2">
                <div><h2 className="font-medium text-[var(--color-surface-100)]">{t('console.tab.agent')}</h2><p className="mt-1 text-xs text-[var(--color-surface-400)]">{t('console.providerResponseNotEvidence')}</p></div>
                <Button variant="secondary" size="sm" onClick={() => { if (!agentBusy && !agentSettingsBusy) void refreshAiProvider(); }} disabled={agentState === 'loading' || agentBusy || agentSettingsBusy}>{t('console.refreshStatus')}</Button>
              </div>
              <div role="radiogroup" aria-label={t('console.agentMode')} className="flex flex-wrap gap-1">
                {(['ask', 'plan', 'edit', 'debug'] as const).map((mode, index, modes) => <Button variant="secondary" size="sm" key={mode} role="radio" aria-checked={agentMode === mode} tabIndex={agentMode === mode ? 0 : -1} disabled={agentBusy} onClick={() => { if (!agentBusy) { setAgentMode(mode); setAgentState('idle'); } }} onKeyDown={(event) => { if (agentBusy) return; const next = event.key === 'ArrowRight' ? modes[(index + 1) % modes.length] : event.key === 'ArrowLeft' ? modes[(index + modes.length - 1) % modes.length] : undefined; if (next) { event.preventDefault(); setAgentMode(next); document.getElementById(`agent-mode-${next}`)?.focus(); } }} id={`agent-mode-${mode}`} className={`border px-2.5 py-1 text-xs font-medium capitalize disabled:cursor-not-allowed disabled:opacity-60 ${agentMode === mode ? 'border-[var(--color-accent-blue)] text-[var(--color-surface-100)]' : 'border-[var(--color-surface-600)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'}`}>{mode}</Button>)}
              </div>
              <Textarea label={t('console.request')} value={agentPrompt} disabled={agentBusy} maxLength={4_000} onChange={(event) => { if (!agentBusy) setAgentPrompt(event.target.value); }} rows={4} placeholder={t('console.describeWhatYouWant')} />
              <p className="text-xs tabular-nums text-[var(--color-surface-400)]">{agentPrompt.length}{t('console.4000Characters')}</p>
              <section aria-label={t('console.agentContextPreview')} className="border-y border-[var(--color-surface-600)] py-2 text-xs text-[var(--color-surface-300)]">
                <h3 className="font-medium text-[var(--color-surface-200)]">{t('console.contextPreview')}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4"><li>{t('console.modePromptLength', { agentMode, length: agentPrompt.trim().length })}</li><li>{hasCurrentWorkspaceLink ? t('console.workspaceLinkedSavedWorkspace') : t('console.workspaceChooseZplcJson')}</li>{agentMode === 'edit' && <li>{agentEditFile ? t('console.hostWillRereadSaved', { path: agentEditFile.path }) : t('console.editRequiresTheActive')}</li>}{agentMode === 'debug' && <li>{t('console.boundedDiagnosticsHostTrace', { length: agentDiagnostics.length, length2: agentTrace.length })}</li>}{(agentMode === 'ask' || agentMode === 'plan') && <li>{t('console.noSourceFileOr')}</li>}<li>{t('console.doNotPutSecrets')}</li></ul>
              </section>
              <div className="flex flex-wrap gap-2"><Button variant="primary" size="sm" onClick={() => { void sendAgentRequest(); }} disabled={!agentCanSend}><Send size={14} aria-hidden="true" />{t('console.sendRequest')}</Button>{agentBusy && <Button variant="secondary" size="sm" onClick={() => { void cancelAgentRequest(); }} disabled={agentState === 'cancelling'}><CircleStop size={14} aria-hidden="true" />{t('console.cancelRequest')}</Button>}</div>
              <AgentStatus state={agentState} status={agentStatus} />
              {typeof agentState === 'object' && agentState.kind === 'response' && <section className="space-y-2 border-t border-[var(--color-surface-600)] pt-2"><p className="whitespace-pre-wrap text-[var(--color-surface-100)]">{agentState.presentation.kind === 'answer' ? agentState.presentation.answer : agentState.presentation.kind === 'error' ? t('console.providerRequestFailed', { code: agentState.presentation.code }) : t('console.providerResponseCouldNot')}</p><p className="text-xs text-[var(--color-surface-400)]">{t('console.providerResponseNotEvidence2')}</p>{agentState.presentation.kind === 'answer' && agentState.presentation.replacement && (agentProposalCurrent ? <Button variant="secondary" size="sm" onClick={() => { void reviewAgentProposal(); }} disabled={workspaceTestBusy || !agentEditFile}><FileDiff size={14} aria-hidden="true" />{t('console.reviewProposedStChange')}</Button> : <p role="status" className="text-xs text-[var(--color-accent-yellow)]">{t('console.proposedChangeIsStale')}</p>)}</section>}
              <details open={agentSettingsOpen} onToggle={(event) => { if (agentBusy) { event.currentTarget.open = agentSettingsOpen; return; } setAgentSettingsOpen(event.currentTarget.open); }} className="border-t border-[var(--color-surface-600)] pt-2"><summary aria-disabled={agentBusy} className="cursor-pointer text-xs font-medium text-[var(--color-surface-200)]">{t('console.providerSettings')}</summary><fieldset disabled={agentBusy || agentSettingsBusy} className="mt-2 disabled:opacity-60"><div className="grid gap-2 sm:grid-cols-2"><Checkbox checked={agentConfig.enabled} onChange={(event) => setAgentConfig((config) => ({ ...config, enabled: event.target.checked }))} label={t('console.enabled2')} /><TextField value={agentConfig.endpoint} onChange={(event) => setAgentConfig((config) => ({ ...config, endpoint: event.target.value }))} className="mt-1 block w-full" label={t('console.endpoint')} /><TextField value={agentConfig.model} onChange={(event) => setAgentConfig((config) => ({ ...config, model: event.target.value }))} className="mt-1 block w-full" label={t('console.model')} /><TextField type="password" value={agentKey} onChange={(event) => setAgentKey(event.target.value)} autoComplete="new-password" className="mt-1 block w-full" label={t('console.apiKey')} /></div><div className="mt-2 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => { void saveAgentConfig(); }} disabled={!aiProvider}>{t('configEditor.save')}</Button><Button variant="secondary" size="sm" onClick={() => { void storeAgentKey(); }} disabled={!aiProvider || !agentKey}>{t('console.storeKey')}</Button><Button variant="secondary" size="sm" onClick={() => { void clearAgentKey(); }} disabled={!aiProvider}>{t('console.clearKey')}</Button></div></fieldset>{agentSettingsMessage && <p role="status" className="mt-2 text-xs text-[var(--color-surface-300)]">{agentSettingsMessage}</p>}</details>
            </section>
          </div>
        )}

        {activeConsoleTab === 'trace' && (
          <div className="p-2 font-sans text-sm text-[var(--color-surface-200)]">
            <p className="mb-2 text-xs text-[var(--color-surface-400)]">{t('console.nativePosixHostTrace')}</p>
            <LiveNativeMotorPanel
              adapterType={debugController?.adapter?.type}
              connected={Boolean(debugController?.adapter?.connected)}
              simulationInputsAuthorized={debugController?.adapter instanceof NativeAdapter && debugController.adapter.supportsSimulationInput}
              vmState={debugController?.vmState ?? 'disconnected'}
              debugMap={debugMap}
              sample={latestNativeTrace}
              currentCompilerRunId={compilerRunId}
              setSimulationInput={debugController?.setSimulationInput}
            />
            {nativeTrace.length === 0 ? (
              <CommandEmptyState title={t('panel.trace.empty.title')} description={t('panel.trace.empty.description')} actions={['debug.step', 'online.connect']} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
                  <caption className="sr-only">{t('console.nativePosixHostTrace2')}</caption>
                  <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]">
                    <tr><th scope="col" className="px-2 py-1 font-medium">{t('console.uptime')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.cycles')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.state')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.pc')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.error')}</th><th scope="col" className="px-2 py-1 text-right font-medium">{t('console.overruns')}</th></tr>
                  </thead>
                  <tbody>
                    {[...nativeTrace].reverse().map((sample, index) => (
                      <tr key={`${sample.uptimeMs}-${sample.cycles}-${index}`} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]">
                        <td className="px-2 py-1">{t('console.ms', { uptimeMs: sample.uptimeMs })}</td><td className="px-2 py-1">{sample.cycles}</td><td className="px-2 py-1">{sample.state}</td><td className="px-2 py-1">{sample.pc === null ? '—' : t('console.0x', { value: sample.pc.toString(16).toUpperCase() })}</td><td className="px-2 py-1">{describeVmError(sample.error)}</td><td className="px-2 py-1 text-right">{sample.overruns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeConsoleTab === 'lab' && (
          <LabPanel
            presentation={typeof workspaceTestStateForLink === 'object' ? workspaceTestStateForLink.presentation : null}
            runDisabled={workspaceTestAvailabilityState !== 'ready'}
            running={workspaceTestBusy}
            onRun={() => { void runWorkspaceTests(); }} controller={debugController}
          />
        )}

        {activeConsoleTab === 'terminal' && (
          <TerminalTab isActive={activeConsoleTab === 'terminal'} />
        )}

        {activeConsoleTab === 'watch' && (
          <WatchTab controller={debugController} />
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

