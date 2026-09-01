/**
 * Console Component
 * 
 * Lower workbench panel with Explorer, Inspector, Output, Problems, Tests, Watch, and Terminal tabs.
 * The Terminal tab provides direct shell access to ZPLC devices.
 * The Watch tab shows live debug values.
 */

import {
  ChevronDown,
  ChevronUp,
  Terminal,
  AlertTriangle,
  Trash2,
  XCircle,
  AlertCircle,
  Info,
  CheckCircle,
  Eye,
  FlaskConical,
  FolderOpen,
  LoaderCircle,
  Play,
  Activity,
  PanelRight,
  FileDiff,
  BookOpen,
  Bot,
  Send,
  CircleStop,
  Boxes,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DiffEditor, type Monaco } from '@monaco-editor/react';
import { useIDEStore } from '../store/useIDEStore';
import type { ConsoleEntry, ConsoleTab } from '../types';
import { TerminalTab } from './TerminalTab';
import { DebugWatchPanel } from './DebugWatchPanel';
import type { DebugController } from '../hooks/useDebugController';
import { classifyWorkspaceTestBuildLink, isWorkspaceManifestRegistrationCurrent, isWorkspaceTestRunCurrent, presentCandidateChangeSetReview, presentRecordedConveyorPlant, presentRecordedMotorPlant, presentRecordedMotorOutput, presentRecordedPedestrianCrossing, presentRecordedTankLevel, presentWorkspaceTestResult, workspaceTestAvailability, workspaceTestRunFallbackState, type CandidateChangeSetReviewPresentation, type WorkspaceTestPresentation } from './workspaceTestPresentation';
import { findFileInTree, readFileContent } from '../utils/fileSystem';
import { LIVE_NATIVE_OUTPUT_MAX_AGE_MS, presentLiveNativeMotorControls, presentLiveNativeMotorOutput } from '../runtime/nativeTrace';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { claimMotorInputCommand, shouldClearMotorInputFailure } from './liveNativeMotorPanel';
import { presentWorkspaceSafetyCheck, type WorkspaceSafetyPresentation } from './workspaceSafetyPresentation';
import { Sidebar } from './Sidebar';
import { WorkbenchInspector } from './WorkbenchInspector';
import { LearnPanel } from './LearnPanel';
import { LabPanel } from './LabPanel';
import { presentAiProviderConfig, presentAiProviderMutation, presentAiProviderResponse, presentAiProviderStatus, type AiProviderMode, type AiProviderResponsePresentation, type AiProviderStatusPresentation } from './aiProviderPresentation';
import { useTheme } from '../hooks/useTheme';
import { ZPLC_DARK_THEME, ZPLC_DARK_THEME_ID, ZPLC_HIGH_CONTRAST_THEME, ZPLC_HIGH_CONTRAST_THEME_ID, ZPLC_LIGHT_THEME, ZPLC_LIGHT_THEME_ID } from '../utils/monaco-themes';

type WorkspaceTestResultState = { presentation: WorkspaceTestPresentation; projectSession: number; compilerRunId: number; workspaceId: string };
type WorkspaceSafetyTextState = { status: 'running' | 'unavailable'; projectSession: number; compilerRunId: number; workspaceId: string };
type WorkspaceSafetyState = 'idle' | WorkspaceSafetyTextState | { presentation: WorkspaceSafetyPresentation; projectSession: number; compilerRunId: number; workspaceId: string };
type CandidateReviewSnapshot = { origin: 'manual' | 'agent'; projectSession: number; compilerRunId: number; workspaceId: string; fileId: string; path: string; editorContent: string; candidate: string; handle: FileSystemFileHandle; beforeSha256: string; afterSha256: string; baseline: string };
type CandidateReviewState = { kind: 'idle' | 'matches-disk' | 'running' | 'cancelling' | 'saving' | 'stale' | 'error' | 'saved' } | { kind: 'result'; snapshot: CandidateReviewSnapshot; presentation: CandidateChangeSetReviewPresentation };
type AgentEditIdentity = { projectSession: number; compilerRunId: number; workspaceId: string; fileId: string; path: string; content: string; handle: FileSystemFileHandle; baselineSha256: string };
type AgentState = 'idle' | 'loading' | 'sending' | 'cancelling' | 'unavailable' | 'error' | { kind: 'response'; presentation: AiProviderResponsePresentation; expectedEdit?: AgentEditIdentity };

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isCandidateSTPath(path: string): boolean {
  return path.length <= 512 && /^src\/[^/\\\0\r\n]+\.st$/.test(path);
}

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

function SafetyCoverageReport({ presentation }: { presentation: WorkspaceSafetyPresentation }) {
  if (presentation.kind === 'not-configured') return <p role="status" className="text-xs text-[var(--color-surface-400)]">No incompatible outputs are declared in this project.</p>;
  if (presentation.kind === 'invalid') return <div className="space-y-1"><p role="status" className="text-xs text-[var(--color-accent-yellow)]">Declared interlock coverage result was invalid.</p><SafetyDiagnostics diagnostics={presentation.diagnostics} /></div>;
  const missing = presentation.kind === 'uncovered' ? new Set(presentation.uncovered.map((pair) => [...pair.outputs].sort().join('\0'))) : new Set<string>();
  return <div className="space-y-2 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><caption className="sr-only">Declared output interlock coverage.</caption><thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">Output A</th><th scope="col" className="px-2 py-1 font-medium">Output B</th><th scope="col" className="px-2 py-1 font-medium">Status</th></tr></thead><tbody>{presentation.declared.map((pair) => { const isMissing = missing.has([...pair.outputs].sort().join('\0')); return <tr key={pair.outputs.join('\0')} className="border-b border-[var(--color-surface-700)]"><td className="px-2 py-1 font-mono text-[var(--color-surface-200)]">{pair.outputs[0]}</td><td className="px-2 py-1 font-mono text-[var(--color-surface-200)]">{pair.outputs[1]}</td><td className={`px-2 py-1 ${isMissing ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-accent-green)]'}`}>{isMissing ? 'Missing exact NEVER coverage' : 'Covered'}</td></tr>; })}</tbody></table><SafetyDiagnostics diagnostics={presentation.diagnostics} /></div>;
}

function SafetyDiagnostics({ diagnostics }: { diagnostics: WorkspaceSafetyPresentation['diagnostics'] }) {
  if (diagnostics.length === 0) return null;
  return <ul aria-label="Safety diagnostics" className="space-y-1 border-t border-[var(--color-surface-700)] pt-2 text-xs text-[var(--color-surface-200)]">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}><span className="font-mono">{diagnostic.code}</span>{diagnostic.path && <span className="text-[var(--color-surface-400)]"> · {diagnostic.path}{diagnostic.line ? `:${diagnostic.line}` : ''}{diagnostic.column ? `:${diagnostic.column}` : ''}</span>}</li>)}</ul>;
}

export function Console({ debugController }: ConsoleProps) {
  const {
    consoleEntries,
    activeConsoleTab,
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
  } = useIDEStore();
  const { effectiveTheme } = useTheme();
  const [workspaceTestBusy, setWorkspaceTestBusy] = useState(false);
  const [workspaceTestState, setWorkspaceTestState] = useState<'idle' | 'selected' | 'running' | 'cancelling' | 'desktop-unavailable' | WorkspaceTestResultState>('idle');
  const [workspaceSafetyState, setWorkspaceSafetyState] = useState<WorkspaceSafetyState>('idle');
  const workspaceManifestInputRef = useRef<HTMLInputElement>(null);
  const workspaceTests = window.electronAPI?.workspaceTests;
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

  const tabs: { id: ConsoleTab; label: string; icon: React.ReactNode; count?: React.ReactNode; ariaLabel?: string }[] = [
    { id: 'explorer', label: 'Explorer', icon: <FolderOpen size={14} />, ariaLabel: 'Explorer' },
    { id: 'inspector', label: 'Inspector', icon: <PanelRight size={14} />, ariaLabel: 'Inspector' },
    { 
      id: 'output', 
      label: 'Output', 
      icon: <Terminal size={14} /> 
    },
    {
      id: 'problems',
      label: 'Problems',
      icon: <AlertTriangle size={14} />,
      count: <span className="text-xs tabular-nums">{problemSummary}</span>,
      ariaLabel: `Problems, ${problemSummary}`,
    },
    {
      id: 'tests',
      label: 'Tests',
      icon: <FlaskConical size={14} />,
      ariaLabel: 'Tests, host POSIX scenarios',
    },
    { id: 'lab', label: 'Lab', icon: <Boxes size={14} />, ariaLabel: 'Lab, recorded host scenario playback' },
    { id: 'learn', label: 'Learn', icon: <BookOpen size={14} />, ariaLabel: 'Learn, safe motor start-stop lesson' },
    { id: 'changes', label: 'Changes', icon: <FileDiff size={14} />, ariaLabel: 'Changes, candidate review' },
    { id: 'agent', label: 'Agent', icon: <Bot size={14} />, ariaLabel: 'Agent, optional provider' },
    {
      id: 'trace',
      label: 'Trace',
      icon: <Activity size={14} />,
      count: nativeTrace.length > 0 ? nativeTrace.length : undefined,
      ariaLabel: `Trace, ${nativeTrace.length} native POSIX samples`,
    },
    { 
      id: 'watch', 
      label: 'Watch', 
      icon: <Eye size={14} className={debugMode !== 'none' ? 'text-green-400' : ''} />,
      count: watchCount > 0 ? watchCount : undefined,
    },
    { 
      id: 'terminal', 
      label: 'Terminal', 
      icon: <Terminal size={14} className="text-[var(--color-accent-green)]" /> 
    },
  ];

  const getEntryIcon = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'error':
        return <XCircle size={14} className="text-[var(--color-accent-red)] flex-shrink-0" />;
      case 'warning':
        return <AlertCircle size={14} className="text-[var(--color-accent-yellow)] flex-shrink-0" />;
      case 'success':
        return <CheckCircle size={14} className="text-[var(--color-accent-green)] flex-shrink-0" />;
      case 'command':
        return <Terminal size={14} className="text-[var(--color-accent-purple)] flex-shrink-0" />;
      default:
        return <Info size={14} className="text-[var(--color-accent-blue)] flex-shrink-0" />;
    }
  };

  const getEntryColor = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'error':
        return 'text-[var(--color-accent-red)]';
      case 'warning':
        return 'text-[var(--color-accent-yellow)]';
      case 'success':
        return 'text-[var(--color-accent-green)]';
      case 'command':
        return 'text-[var(--color-accent-purple)]';
      default:
        return 'text-[var(--color-surface-200)]';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

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

  const runWorkspaceTests = async (scenarioId?: string) => {
    const current = useIDEStore.getState();
    const link = current.workspaceScenarioLink;
    if (!workspaceTests || workspaceTestBusy || !current.isProjectOpen || current.hasUnsavedChanges() || !link || link.projectSession !== current.projectSession) return;
    const { workspaceId, projectSession: expectedProjectSession } = link;
    const expectedCompilerRunId = current.compilerRunId;
    setWorkspaceTestBusy(true);
    setWorkspaceTestState('running');
    try {
      const request = { workspaceId, ...(scenarioId === undefined ? {} : { scenarioId }) };
      const result = await workspaceTests.run(request);
      const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) {
        setWorkspaceTestState({ presentation: presentWorkspaceTestResult(result), projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId });
      }
    } catch {
      const latest = useIDEStore.getState();
      if (isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })) {
        setWorkspaceTestState('desktop-unavailable');
      }
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
  }, [aiProvider]);

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
        <button
          onClick={toggleConsole}
          className="flex items-center gap-1 text-sm text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)] transition-colors"
          aria-label="Expand workbench panel"
          title="Expand workbench panel"
        >
          <ChevronUp size={16} />
          <span>Panel</span>
        </button>
        
        {/* Quick status */}
        <div className="ml-4 text-xs tabular-nums text-[var(--color-surface-300)]" aria-label={`Problems: ${problemSummary}`}>
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
        <button
          onClick={toggleConsole}
          className="p-1 mr-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
          title="Collapse workbench panel"
          aria-label="Collapse workbench panel"
        >
          <ChevronDown size={16} />
        </button>

        <div role="tablist" aria-label="Workbench panels" className="flex h-full min-w-0 items-center overflow-x-auto">
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
          <button
            onClick={() => {
              if (activeConsoleTab === 'output') clearConsole();
              if (activeConsoleTab === 'problems') clearCompilerMessages();
              if (activeConsoleTab === 'trace') clearNativeTrace();
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-400)] hover:text-[var(--color-surface-200)]"
            title="Clear"
            aria-label={`Clear ${activeConsoleTab}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div
        id={`console-panel-${activeConsoleTab}`}
        role="tabpanel"
        aria-labelledby={`console-tab-${activeConsoleTab}`}
        className="flex-1 overflow-y-auto font-mono text-sm"
      >
        <input
          ref={workspaceManifestInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          tabIndex={-1}
          aria-hidden="true"
          data-workspace-manifest-input
          onChange={(event) => { void registerWorkspaceManifest(event); }}
        />
        {activeConsoleTab === 'output' && (
          <div className="p-2 space-y-0.5">
            {consoleEntries.length === 0 ? (
              <div className="text-[var(--color-surface-400)] italic">
                No output yet
              </div>
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
                    <span className="text-[var(--color-surface-500)] text-xs">
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

        {activeConsoleTab === 'explorer' && <Sidebar />}

        {activeConsoleTab === 'inspector' && <WorkbenchInspector />}

        {activeConsoleTab === 'problems' && (
          <div className="p-2 space-y-1">
            <section aria-label="Declared interlock coverage" className="space-y-2 border-b border-[var(--color-surface-700)] pb-2 font-sans text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-surface-200)]">Declared interlock coverage</h2>
                <button type="button" onClick={() => { void runWorkspaceSafetyCheck(); }} disabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'} className="border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">{workspaceSafetyStateForLink === 'running' ? 'Checking…' : 'Check declared interlocks'}</button>
              </div>
              {workspaceTestAvailabilityState === 'link-required' && <p role="status" className="text-xs text-[var(--color-surface-400)]">Save the project and choose zplc.json in Tests to check declared interlocks.</p>}
              {workspaceTestAvailabilityState === 'unsaved' && <p role="status" className="text-xs text-[var(--color-surface-400)]">Save all changes before checking declared interlocks.</p>}
              {workspaceTestAvailabilityState === 'desktop-unavailable' && <p role="status" className="text-xs text-[var(--color-surface-400)]">Declared interlock coverage requires the desktop app.</p>}
              {workspaceTestAvailabilityState === 'project-required' && <p role="status" className="text-xs text-[var(--color-surface-400)]">Open a saved project folder to check declared interlocks.</p>}
              {workspaceSafetyStateForLink === 'unavailable' && <p role="status" className="text-xs text-[var(--color-accent-yellow)]">Declared interlock coverage is unavailable.</p>}
              {typeof workspaceSafetyStateForLink === 'object' && <SafetyCoverageReport presentation={workspaceSafetyStateForLink.presentation} />}
              <p className="text-xs text-[var(--color-surface-400)]">Checks exact NEVER coverage in saved scenarios. It does not establish physical safety, timing, or certification.</p>
            </section>
            <div className="pb-1 text-xs tabular-nums text-[var(--color-surface-300)] border-b border-[var(--color-surface-700)]">
              {problemSummary}
            </div>
            {liveSTDiagnostics.length > 0 && (
              <section aria-label="Live Structured Text syntax diagnostics" className="space-y-1 pb-2 border-b border-[var(--color-surface-700)]">
                <div className="px-2 text-xs text-[var(--color-surface-300)]">Live ST syntax · not build evidence</div>
                {liveSTDiagnostics.map((msg, idx) => (
                  <div key={`${msg.code}-${idx}`} className="flex items-start gap-2 rounded px-2 py-1">
                    {msg.type === 'error' ? <XCircle size={14} className="text-[var(--color-accent-red)] mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="text-[var(--color-accent-yellow)] mt-0.5 flex-shrink-0" />}
                    <div className="flex-1">
                      <span className="sr-only">{msg.type === 'warning' ? 'Warning' : 'Error'}: </span>
                      <span className="text-[var(--color-surface-100)]">{msg.message}</span>
                      {activeFile?.path && <span className="ml-2 text-[var(--color-surface-400)] text-xs">{activeFile.path}{msg.line !== undefined && `:${msg.line}`}{msg.column !== undefined && `:${msg.column}`}</span>}
                    </div>
                  </div>
                ))}
              </section>
            )}
            <section aria-label="Latest build diagnostics" className="space-y-1">
              <div className="px-2 text-xs text-[var(--color-surface-300)]">Latest build diagnostics</div>
              {compilerMessages.length === 0 ? (
                <div className="px-2 text-[var(--color-surface-400)] italic">
                  {compilerMessagesChecked ? 'No diagnostics from the latest build' : 'Build to check project diagnostics'}
                </div>
              ) : (
              compilerMessages.map((msg, idx) => {
                const node = msg.file && fileTree ? findFileInTree(fileTree, msg.file) : null;
                const navigable = Boolean(node?.type === 'file' && node.path === msg.file && msg.line && msg.line >= 1);
                const content = <>
                  {msg.type === 'error' && (
                    <XCircle size={14} className="text-[var(--color-accent-red)] mt-0.5 flex-shrink-0" />
                  )}
                  {msg.type === 'warning' && (
                    <AlertCircle size={14} className="text-[var(--color-accent-yellow)] mt-0.5 flex-shrink-0" />
                  )}
                  {msg.type === 'info' && (
                    <Info size={14} className="text-[var(--color-accent-blue)] mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="sr-only">{msg.type === 'info' ? 'Info' : msg.type === 'warning' ? 'Warning' : 'Error'}: </span>
                    <span className="text-[var(--color-surface-100)]">{msg.message}</span>
                    {msg.file && (
                      <span className="ml-2 text-[var(--color-surface-400)] text-xs">
                        {msg.file}
                        {msg.line !== undefined && `:${msg.line}`}
                        {msg.column !== undefined && `:${msg.column}`}
                      </span>
                    )}
                  </div>
                </>;
                return navigable ? <button key={idx} type="button" onClick={() => { void navigateToCompilerDiagnostic(msg.file!, msg.line!, msg.column ?? 1); }} className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)]">{content}</button> : <div key={idx} className="flex items-start gap-2 rounded px-2 py-1">{content}</div>;
              })
              )}
            </section>
          </div>
        )}

        {activeConsoleTab === 'tests' && (
          <div className="p-3 space-y-3 font-sans text-sm text-[var(--color-surface-200)]">
            {workspaceTestAvailabilityState === 'desktop-unavailable' ? (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]"><Info size={15} aria-hidden="true" />Workspace tests require the desktop app.</p>
            ) : workspaceTestAvailabilityState === 'project-required' ? (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]"><Info size={15} aria-hidden="true" />Open a local project before linking workspace tests.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => workspaceManifestInputRef.current?.click()}
                    disabled={workspaceTestBusy}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 bg-[var(--color-surface-700)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
                  >
                    <FolderOpen size={14} aria-hidden="true" />
                    {hasCurrentWorkspaceLink ? 'Relink zplc.json' : 'Choose zplc.json'}
                  </button>
                  {workspaceTestAvailabilityState === 'unsaved' && (
                    <button
                      type="button"
                      onClick={() => { void saveWorkspaceProject(); }}
                      disabled={workspaceTestBusy}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2.5 py-1.5 text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
                    >
                      Save project
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void runWorkspaceTests(); }}
                    disabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 bg-[var(--color-accent-blue)] text-white hover:bg-[var(--color-accent-blue)]/80 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
                  >
                    <Play size={14} aria-hidden="true" />
                    Run host scenarios
                  </button>
                  {workspaceTestStateForLink === 'running' || workspaceTestStateForLink === 'cancelling' ? (
                    <button
                      type="button"
                      onClick={cancelWorkspaceTests}
                      disabled={workspaceTestStateForLink === 'cancelling'}
                      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 bg-[var(--color-surface-700)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
                    >
                      {workspaceTestStateForLink === 'cancelling' ? 'Cancelling…' : 'Cancel scenarios'}
                    </button>
                  ) : null}
                </div>

                {workspaceTestAvailabilityState === 'link-required' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]"><Info size={15} aria-hidden="true" />Select the saved workspace zplc.json whose scenarios you want to run.</p>
                )}
                {workspaceTestAvailabilityState === 'unsaved' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-accent-yellow)]"><AlertCircle size={15} aria-hidden="true" />Tests use saved workspace files and do not include changes that are not saved.</p>
                )}
                {workspaceTestAvailabilityState === 'ready' && (workspaceTestStateForLink === 'selected' || workspaceTestStateForLink === 'idle') && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]"><CheckCircle size={15} aria-hidden="true" />Linked saved workspace ready for host scenarios.</p>
                )}
                {workspaceTestStateForLink === 'running' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
                    <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Running host POSIX scenarios…
                  </p>
                )}
                {workspaceTestStateForLink === 'cancelling' && (
                  <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
                    <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Cancelling host POSIX scenarios…
                  </p>
                )}
                {workspaceTestStateForLink === 'desktop-unavailable' && (
                  <p role="status" aria-live="polite" className="text-[var(--color-accent-yellow)]">Host POSIX simulation is unavailable.</p>
                )}
                {typeof workspaceTestStateForLink === 'object' && (
                  <WorkspaceTestResult
                    presentation={workspaceTestStateForLink.presentation}
                    onRunScenario={runWorkspaceTests}
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

        {activeConsoleTab === 'learn' && <LearnPanel workspaceTestPresentation={typeof workspaceTestStateForLink === 'object' ? workspaceTestStateForLink.presentation : undefined} />}

        {activeConsoleTab === 'changes' && (
          <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
            <div className="border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {!hasCurrentWorkspaceLink && isProjectOpen && candidateDesktopReady && (
                  <button type="button" onClick={() => workspaceManifestInputRef.current?.click()} disabled={workspaceTestBusy} className="inline-flex items-center gap-1.5 border border-[var(--color-surface-600)] px-2.5 py-1.5 hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><FolderOpen size={14} aria-hidden="true" />Choose zplc.json</button>
                )}
                <button type="button" onClick={() => { void reviewCandidateChange(); }} disabled={!candidateEligible || workspaceTestBusy} className="inline-flex items-center gap-1.5 bg-[var(--color-accent-blue)] px-2.5 py-1.5 text-white hover:bg-[var(--color-accent-blue)]/80 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><FileDiff size={14} aria-hidden="true" />Review active ST change</button>
                {candidateReviewStateForCurrent.kind === 'running' && <button type="button" onClick={() => { void cancelCandidateReview(); }} className="inline-flex items-center gap-1.5 border border-[var(--color-surface-600)] px-2.5 py-1.5 hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Cancel review</button>}
              </div>
              {!candidateDesktopReady ? <p role="status" aria-live="polite" className="mt-3">Candidate review requires the desktop app.</p>
                : !isProjectOpen ? <p role="status" aria-live="polite" className="mt-3">Open a saved project folder to review a change.</p>
                  : !hasCurrentWorkspaceLink ? <p role="status" aria-live="polite" className="mt-3">Choose the saved workspace zplc.json before reviewing the active file.</p>
                    : !candidateEligible ? <p role="status" aria-live="polite" className="mt-3">Only a modified active Structured Text file under src/ can enter the candidate. Other unsaved buffers remain outside it.</p>
                      : <p className="mt-3 text-[var(--color-surface-300)]">Only the active Structured Text buffer enters this candidate. Other unsaved buffers remain outside it.</p>}
              <p className="mt-2 text-xs text-[var(--color-surface-400)]">Native POSIX host evidence — not hardware or HIL evidence.</p>
              <p className="text-xs text-[var(--color-surface-400)]">Review itself does not write files.</p>
            </div>
            <div role="status" aria-live="polite" className="mt-3">
              {candidateReviewStateForCurrent.kind === 'matches-disk' && <p>Active buffer matches disk; no candidate review was run.</p>}
              {candidateReviewStateForCurrent.kind === 'running' && <p className="flex items-center gap-2"><LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Reviewing isolated host candidate…</p>}
              {candidateReviewStateForCurrent.kind === 'cancelling' && <p>Cancelling candidate review…</p>}
              {candidateReviewStateForCurrent.kind === 'saving' && <p>Saving reviewed change…</p>}
              {candidateReviewStateForCurrent.kind === 'stale' && <p>Candidate is no longer current. Review again.</p>}
              {candidateReviewStateForCurrent.kind === 'error' && <p>Candidate review could not be completed. Review again.</p>}
              {candidateReviewStateForCurrent.kind === 'saved' && <p>Reviewed change saved. Review is no longer current.</p>}
            </div>
            {candidateReviewStateForCurrent.kind === 'result' && <CandidateReviewResult state={candidateReviewStateForCurrent} effectiveTheme={effectiveTheme} beforeMount={beforeMountDiff} onSave={saveReviewedChange} busy={workspaceTestBusy} />}
          </div>
        )}

        {activeConsoleTab === 'agent' && (
          <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
            <section aria-label="Optional Agent" className="max-w-3xl space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-surface-600)] pb-2">
                <div><h2 className="font-medium text-[var(--color-surface-100)]">Agent</h2><p className="mt-1 text-xs text-[var(--color-surface-400)]">Provider response — not evidence. It cannot operate hardware.</p></div>
                <button type="button" onClick={() => { if (!agentBusy && !agentSettingsBusy) void refreshAiProvider(); }} disabled={agentState === 'loading' || agentBusy || agentSettingsBusy} className="border border-[var(--color-surface-600)] px-2 py-1 text-xs hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Refresh status</button>
              </div>
              <div role="radiogroup" aria-label="Agent mode" className="flex flex-wrap gap-1">
                {(['ask', 'plan', 'edit', 'debug'] as const).map((mode, index, modes) => <button key={mode} type="button" role="radio" aria-checked={agentMode === mode} tabIndex={agentMode === mode ? 0 : -1} disabled={agentBusy} onClick={() => { if (!agentBusy) { setAgentMode(mode); setAgentState('idle'); } }} onKeyDown={(event) => { if (agentBusy) return; const next = event.key === 'ArrowRight' ? modes[(index + 1) % modes.length] : event.key === 'ArrowLeft' ? modes[(index + modes.length - 1) % modes.length] : undefined; if (next) { event.preventDefault(); setAgentMode(next); document.getElementById(`agent-mode-${next}`)?.focus(); } }} id={`agent-mode-${mode}`} className={`border px-2.5 py-1 text-xs font-medium capitalize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-60 ${agentMode === mode ? 'border-[var(--color-accent-blue)] text-[var(--color-surface-100)]' : 'border-[var(--color-surface-600)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'}`}>{mode}</button>)}
              </div>
              <label className="block text-xs font-medium text-[var(--color-surface-200)]">Request<textarea value={agentPrompt} disabled={agentBusy} maxLength={4_000} onChange={(event) => { if (!agentBusy) setAgentPrompt(event.target.value); }} rows={4} placeholder="Describe what you want to understand or review." className="mt-1 block w-full resize-y border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-2 text-sm text-[var(--color-surface-100)] placeholder:text-[var(--color-surface-500)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" /></label>
              <p className="text-xs tabular-nums text-[var(--color-surface-400)]">{agentPrompt.length}/4000 characters</p>
              <section aria-label="Agent context preview" className="border-y border-[var(--color-surface-600)] py-2 text-xs text-[var(--color-surface-300)]">
                <h3 className="font-medium text-[var(--color-surface-200)]">Context preview</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4"><li>Mode: {agentMode}; prompt length: {agentPrompt.trim().length}.</li><li>Workspace: {hasCurrentWorkspaceLink ? 'linked saved workspace' : 'link zplc.json in Tests before sending'}.</li>{agentMode === 'edit' && <li>{agentEditFile ? `Host will reread saved ${agentEditFile.path}; editor changes are excluded.` : 'Edit requires the active saved, unmodified Structured Text file under src/.'}</li>}{agentMode === 'debug' && <li>Bounded diagnostics: {agentDiagnostics.length}; host trace samples: {agentTrace.length}.</li>}{(agentMode === 'ask' || agentMode === 'plan') && <li>No source file or active editor content is sent.</li>}<li>Do not put secrets in the prompt. Known sensitive patterns in the prompt or context are rejected before network access; do not paste secrets. Terminal, raw serial, and physical controls are excluded.</li></ul>
              </section>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { void sendAgentRequest(); }} disabled={!agentCanSend} className="inline-flex items-center gap-1.5 border border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-blue)]/80 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><Send size={14} aria-hidden="true" />Send request</button>{agentBusy && <button type="button" onClick={() => { void cancelAgentRequest(); }} disabled={agentState === 'cancelling'} className="inline-flex items-center gap-1.5 border border-[var(--color-surface-600)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><CircleStop size={14} aria-hidden="true" />Cancel request</button>}</div>
              <AgentStatus state={agentState} status={agentStatus} />
              {typeof agentState === 'object' && agentState.kind === 'response' && <section className="space-y-2 border-t border-[var(--color-surface-600)] pt-2"><p className="whitespace-pre-wrap text-[var(--color-surface-100)]">{agentState.presentation.kind === 'answer' ? agentState.presentation.answer : agentState.presentation.kind === 'error' ? `Provider request failed: ${agentState.presentation.code}.` : 'Provider response could not be trusted.'}</p><p className="text-xs text-[var(--color-surface-400)]">Provider response — not evidence.</p>{agentState.presentation.kind === 'answer' && agentState.presentation.replacement && (agentProposalCurrent ? <button type="button" onClick={() => { void reviewAgentProposal(); }} disabled={workspaceTestBusy || !agentEditFile} className="inline-flex items-center gap-1.5 border border-[var(--color-accent-blue)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"><FileDiff size={14} aria-hidden="true" />Review proposed ST change</button> : <p role="status" className="text-xs text-[var(--color-accent-yellow)]">Proposed change is stale. Send a new request.</p>)}</section>}
              <details open={agentSettingsOpen} onToggle={(event) => { if (agentBusy) { event.currentTarget.open = agentSettingsOpen; return; } setAgentSettingsOpen(event.currentTarget.open); }} className="border-t border-[var(--color-surface-600)] pt-2"><summary aria-disabled={agentBusy} className="cursor-pointer text-xs font-medium text-[var(--color-surface-200)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Provider settings</summary><fieldset disabled={agentBusy || agentSettingsBusy} className="mt-2 disabled:opacity-60"><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={agentConfig.enabled} onChange={(event) => setAgentConfig((config) => ({ ...config, enabled: event.target.checked }))} />Enabled</label><label className="text-xs">Endpoint<input value={agentConfig.endpoint} onChange={(event) => setAgentConfig((config) => ({ ...config, endpoint: event.target.value }))} className="mt-1 block w-full border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] px-2 py-1 text-[var(--color-surface-100)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" /></label><label className="text-xs">Model<input value={agentConfig.model} onChange={(event) => setAgentConfig((config) => ({ ...config, model: event.target.value }))} className="mt-1 block w-full border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] px-2 py-1 text-[var(--color-surface-100)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" /></label><label className="text-xs">API key<input type="password" value={agentKey} onChange={(event) => setAgentKey(event.target.value)} autoComplete="new-password" className="mt-1 block w-full border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] px-2 py-1 text-[var(--color-surface-100)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" /></label></div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { void saveAgentConfig(); }} disabled={!aiProvider} className="border border-[var(--color-surface-600)] px-2 py-1 text-xs hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Save configuration</button><button type="button" onClick={() => { void storeAgentKey(); }} disabled={!aiProvider || !agentKey} className="border border-[var(--color-surface-600)] px-2 py-1 text-xs hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Store key</button><button type="button" onClick={() => { void clearAgentKey(); }} disabled={!aiProvider} className="border border-[var(--color-surface-600)] px-2 py-1 text-xs hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Clear key</button></div></fieldset>{agentSettingsMessage && <p role="status" className="mt-2 text-xs text-[var(--color-surface-300)]">{agentSettingsMessage}</p>}</details>
            </section>
          </div>
        )}

        {activeConsoleTab === 'trace' && (
          <div className="p-2 font-sans text-sm text-[var(--color-surface-200)]">
            <p className="mb-2 text-xs text-[var(--color-surface-400)]">Native POSIX host trace. Not hardware or HIL evidence.</p>
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
              <p className="text-[var(--color-surface-400)]">Step the native POSIX simulation to collect trace samples.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
                  <caption className="sr-only">Native POSIX host trace samples, newest first.</caption>
                  <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]">
                    <tr><th scope="col" className="px-2 py-1 font-medium">Uptime</th><th scope="col" className="px-2 py-1 font-medium">Cycles</th><th scope="col" className="px-2 py-1 font-medium">State</th><th scope="col" className="px-2 py-1 font-medium">PC</th><th scope="col" className="px-2 py-1 font-medium">Error</th><th scope="col" className="px-2 py-1 text-right font-medium">Overruns</th></tr>
                  </thead>
                  <tbody>
                    {[...nativeTrace].reverse().map((sample, index) => (
                      <tr key={`${sample.uptimeMs}-${sample.cycles}-${index}`} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]">
                        <td className="px-2 py-1">{sample.uptimeMs} ms</td><td className="px-2 py-1">{sample.cycles}</td><td className="px-2 py-1">{sample.state}</td><td className="px-2 py-1">{sample.pc === null ? '—' : `0x${sample.pc.toString(16).toUpperCase()}`}</td><td className="px-2 py-1">{sample.error ?? '—'}</td><td className="px-2 py-1 text-right">{sample.overruns}</td>
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
            onRun={() => { void runWorkspaceTests(); }}
          />
        )}

        {activeConsoleTab === 'terminal' && (
          <TerminalTab isActive={activeConsoleTab === 'terminal'} />
        )}

        {activeConsoleTab === 'watch' && (
          <DebugWatchPanel
            setValue={debugController?.setValue}
            toggleForceValue={debugController?.toggleForceValue}
            clearAllForcedValues={debugController?.clearAllForcedValues}
            hasActiveSerialSession={debugController?.adapter?.type === 'serial' && debugController.adapter.connected}
          />
        )}
      </div>
    </div>
  );
}

function CandidateReviewResult({ state, effectiveTheme, beforeMount, onSave, busy }: { state: Extract<CandidateReviewState, { kind: 'result' }>; effectiveTheme: 'light' | 'dark' | 'high-contrast'; beforeMount: (monaco: Monaco) => void; onSave: () => void; busy: boolean }) {
  const { presentation, snapshot } = state;
  const accepted = presentation.kind === 'accepted';
  return (
    <section className="space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3" aria-label="Candidate review result">
      <h2 className="font-medium text-[var(--color-surface-100)]">Review · {snapshot.path}</h2>
      <p className={accepted ? 'text-[var(--color-accent-green)]' : presentation.kind === 'rejected' ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-accent-red)]'}>{accepted ? 'Accepted: isolated host candidate passed.' : presentation.kind === 'rejected' ? 'Rejected: candidate was not accepted.' : 'Invalid: candidate review result could not be trusted.'}</p>
      <dl className="grid gap-x-4 gap-y-1 border-y border-[var(--color-surface-600)] py-2 text-xs sm:grid-cols-2">
        {presentation.artifacts.map((artifact) => <div key={artifact.kind} className="flex justify-between gap-2"><dt>{artifact.kind === 'zplc' ? 'ZPLC program' : 'Trace'}</dt><dd className="break-all tabular-nums" title={artifact.sha256} aria-label={`${artifact.kind === 'zplc' ? 'ZPLC program' : 'Trace'} SHA-256 ${artifact.sha256}`}>{artifact.sha256.slice(0, 12)} · {artifact.byteLength} bytes</dd></div>)}
        {presentation.savedTestInputIdentity && <div className="flex justify-between gap-2 sm:col-span-2"><dt>Saved input identity</dt><dd className="break-all tabular-nums" title={presentation.savedTestInputIdentity.sha256} aria-label={`Saved input identity SHA-256 ${presentation.savedTestInputIdentity.sha256}`}>{presentation.savedTestInputIdentity.sha256.slice(0, 12)} · {presentation.savedTestInputIdentity.fileCount} files</dd></div>}
        {presentation.diagnostics.map((diagnostic) => <div key={diagnostic.code} className="sm:col-span-2"><dt className="inline">Diagnostic </dt><dd className="inline">{diagnostic.code}</dd></div>)}
      </dl>
      <div className="grid gap-1 text-xs text-[var(--color-surface-300)] sm:grid-cols-2"><span>Saved on disk</span><span>{snapshot.origin === 'agent' ? 'Proposed ST change' : 'Current editor buffer'}</span></div>
      <div className="h-72 border border-[var(--color-surface-600)]">
        <DiffEditor original={snapshot.baseline} modified={snapshot.candidate} language="st" theme={effectiveTheme === 'high-contrast' ? ZPLC_HIGH_CONTRAST_THEME_ID : effectiveTheme === 'dark' ? ZPLC_DARK_THEME_ID : ZPLC_LIGHT_THEME_ID} beforeMount={beforeMount} options={{ readOnly: true, automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', accessibilitySupport: 'on', scrollBeyondLastLine: false, renderSideBySide: true }} />
      </div>
      <p className="text-xs text-[var(--color-surface-400)]">Native POSIX host evidence — not hardware or HIL evidence.</p>
      <p className="text-xs text-[var(--color-surface-400)]">No file has been written.</p>
      {accepted && <button type="button" onClick={onSave} disabled={busy} className="border border-[var(--color-accent-blue)] px-2.5 py-1.5 text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Save reviewed change</button>}
    </section>
  );
}

function AgentStatus({ state, status }: { state: AgentState; status: AiProviderStatusPresentation }) {
  if (state === 'loading') return <p role="status" className="text-xs text-[var(--color-surface-400)]">Checking provider configuration…</p>;
  if (state === 'sending') return <p role="status" className="text-xs text-[var(--color-surface-300)]">Sending explicit provider request…</p>;
  if (state === 'cancelling') return <p role="status" className="text-xs text-[var(--color-surface-300)]">Cancelling provider request…</p>;
  if (state === 'unavailable') return <p role="status" className="text-xs text-[var(--color-accent-yellow)]">Agent is unavailable in this host. Use the desktop app and configure a supported vault.</p>;
  if (state === 'error') return <p role="status" className="text-xs text-[var(--color-accent-yellow)]">Agent request is no longer current or could not be completed. Review the context and try again.</p>;
  if (status.kind === 'invalid') return <p role="status" className="text-xs text-[var(--color-surface-400)]">Provider status has not been confirmed.</p>;
  if (status.kind === 'unavailable') return <p role="status" className="text-xs text-[var(--color-accent-yellow)]">Vault unavailable{status.vaultReason ? `: ${status.vaultReason}` : ''}. Keys are not stored here.</p>;
  return <p role="status" className="text-xs text-[var(--color-surface-400)]">Provider {status.enabled ? 'enabled' : 'disabled'} · key {status.keyStored ? 'stored' : 'not stored'} · vault available.</p>;
}

function LiveNativeMotorPanel(props: Omit<Parameters<typeof presentLiveNativeMotorControls>[0], 'nowMs'> & {
  setSimulationInput: DebugController['setSimulationInput'] | undefined;
}) {
  const { setSimulationInput, sample } = props;
  // eslint-disable-next-line react-hooks/purity -- this panel must compare each parent snapshot to the current wall clock.
  const nowMs = Date.now();
  const [, setFreshnessTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [failedAtMs, setFailedAtMs] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const failureAtRef = useRef<number | null>(null);
  useEffect(() => {
    const receivedAtMs = sample?.receivedAtMs;
    const currentNowMs = Date.now();
    if (typeof receivedAtMs !== 'number' || !Number.isSafeInteger(receivedAtMs) || receivedAtMs < 0 || !Number.isSafeInteger(currentNowMs) || currentNowMs < 0 || receivedAtMs > currentNowMs || currentNowMs - receivedAtMs > LIVE_NATIVE_OUTPUT_MAX_AGE_MS) return;
    const expiresAtMs = receivedAtMs > Number.MAX_SAFE_INTEGER - LIVE_NATIVE_OUTPUT_MAX_AGE_MS ? receivedAtMs : receivedAtMs + LIVE_NATIVE_OUTPUT_MAX_AGE_MS;
    const delayMs = Math.min(LIVE_NATIVE_OUTPUT_MAX_AGE_MS + 1, Math.max(0, expiresAtMs - currentNowMs + 1));
    const timeout = window.setTimeout(() => setFreshnessTick((tick) => tick + 1), delayMs);
    return () => window.clearTimeout(timeout);
  }, [sample?.receivedAtMs]);

  useEffect(() => {
    if (!shouldClearMotorInputFailure(failureAtRef.current, sample?.receivedAtMs)) return;
    const clearFailure = window.setTimeout(() => {
      if (!shouldClearMotorInputFailure(failureAtRef.current, sample?.receivedAtMs)) return;
      failureAtRef.current = null;
      setFailedAtMs(null);
    }, 0);
    return () => window.clearTimeout(clearFailure);
  }, [failedAtMs, sample?.receivedAtMs]);

  const output = presentLiveNativeMotorOutput({
    adapterType: props.adapterType,
    connected: props.connected,
    vmState: props.vmState,
    debugMap: props.debugMap,
    sample,
    currentCompilerRunId: props.currentCompilerRunId,
    nowMs,
  });
  const controls = output ? presentLiveNativeMotorControls({ ...props, nowMs }) : null;

  const command = useCallback(async (inputId: 'motor.start' | 'motor.stop' | 'motor.estop', active: boolean) => {
    if (!setSimulationInput || pending || !claimMotorInputCommand(inFlightRef, failureAtRef)) return;
    setPending(true);
    try {
      await setSimulationInput(inputId, active);
    } catch {
      const failureAtMs = Date.now();
      failureAtRef.current = failureAtMs;
      setFailedAtMs(failureAtMs);
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [pending, setSimulationInput, setFailedAtMs, setPending]);

  if (!output) return null;
  const unavailable = failedAtMs !== null;
  const disabled = pending || unavailable;
  const inputButton = 'border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]';

  return (
    <section aria-label="Live native POSIX motor" aria-busy={pending} className="mb-3 border border-[var(--color-surface-700)] bg-[var(--color-surface-900)] p-2">
      <p className="text-xs font-medium text-[var(--color-surface-100)]">Live native POSIX host motor — not hardware or HIL evidence.</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2"><dt className="text-[var(--color-surface-200)]">Motor.Forward</dt><dd className="font-medium text-[var(--color-surface-100)]">{output.forward ? 'ON' : 'OFF'}</dd></div>
        <div className="flex items-baseline justify-between gap-2"><dt className="text-[var(--color-surface-200)]">Motor.Reverse</dt><dd className="font-medium text-[var(--color-surface-100)]">{output.reverse ? 'ON' : 'OFF'}</dd></div>
        <div className="col-span-2 text-[var(--color-surface-200)]">{output.uptimeMs} ms · {output.cycles} cycles · {output.state}</div>
      </dl>
      {controls && setSimulationInput && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={inputButton} disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.start', true)}>Start</button>
          <button type="button" className={inputButton} disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.stop', true)}>Stop</button>
          <button type="button" className={inputButton} disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.estop', true)}>Assert E-stop</button>
          <button type="button" className={inputButton} disabled={disabled || !controls.eStopAsserted} onClick={() => void command('motor.estop', false)}>Release E-stop</button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-surface-200)]">
        {unavailable
          ? 'Input command was not confirmed; controls are unavailable until a fresh native snapshot.'
          : pending
            ? 'Staging host input; waiting for a fresh native snapshot.'
            : controls ? `E-stop: ${controls.eStopAsserted ? 'asserted' : 'released'}` : 'Input controls unavailable.'}
      </p>
    </section>
  );
}

function WorkspaceTestResult({ presentation, buildLink, onRunScenario, scenarioRunDisabled }: {
  presentation: WorkspaceTestPresentation;
  buildLink: ReturnType<typeof classifyWorkspaceTestBuildLink>;
  onRunScenario: (scenarioId: string) => void;
  scenarioRunDisabled: boolean;
}) {
  const Icon = presentation.kind === 'passed' ? CheckCircle : presentation.kind === 'assertion-failed' ? XCircle : presentation.kind === 'invalid' ? AlertTriangle : AlertCircle;
  const iconColor = presentation.kind === 'passed' ? 'text-[var(--color-accent-green)]' : presentation.kind === 'assertion-failed' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-yellow)]';

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon size={16} className={`${iconColor} mt-0.5 flex-shrink-0`} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p role="status" aria-live="polite" className="font-medium text-[var(--color-surface-100)]">{presentation.message}</p>
          {presentation.scenarioCount !== undefined && <p className="text-xs tabular-nums text-[var(--color-surface-400)]">{presentation.scenarioCount} {presentation.scenarioCount === 1 ? 'scenario' : 'scenarios'} passed.</p>}
        </div>
      </div>

      {presentation.diagnostics.length > 0 && (
        <div className="space-y-1 border-t border-[var(--color-surface-700)] pt-2">
          {presentation.diagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${index}`} className="flex min-w-0 items-start gap-2 break-words text-xs">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-[var(--color-accent-yellow)]" aria-hidden="true" />
              <p className="min-w-0"><span className="font-medium text-[var(--color-surface-200)]">{diagnostic.code}</span><span className="text-[var(--color-surface-400)]"> · {diagnostic.message}</span>{diagnostic.path && <span className="block break-all text-[var(--color-surface-500)]">{diagnostic.path}</span>}</p>
            </div>
          ))}
        </div>
      )}

      {presentation.preview && (
        <details open={presentation.kind === 'assertion-failed' || presentation.preview.scenarios.some((scenario) => presentRecordedMotorPlant(scenario) || presentRecordedConveyorPlant(scenario) || presentRecordedPedestrianCrossing(scenario) || presentRecordedTankLevel(scenario))} className="border-t border-[var(--color-surface-700)] pt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-surface-200)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Scenario evidence (recorded test result)</summary>
          <p className="mt-2 text-xs text-[var(--color-surface-400)]">Recorded during this host test run. It does not update with the live Trace panel.</p>
          {presentation.preview.totalScenarioCount > presentation.preview.scenarios.length && <p className="mt-1 text-xs tabular-nums text-[var(--color-surface-400)]">Showing {presentation.preview.scenarios.length} of {presentation.preview.totalScenarioCount} scenarios.</p>}
          <div className="mt-3 space-y-4">
            {presentation.preview.scenarios.map((scenario) => <ScenarioPreview key={`${scenario.id}-${scenario.path}`} scenario={scenario} onRunScenario={onRunScenario} scenarioRunDisabled={scenarioRunDisabled} />)}
          </div>
        </details>
      )}

      {presentation.hasEvidence && presentation.artifacts.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--color-surface-700)] pt-2">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Native POSIX test evidence artifacts.</caption>
            <thead className="text-[var(--color-surface-400)]"><tr><th scope="col" className="pr-3 font-medium">Artifact</th><th scope="col" className="pr-3 font-medium">SHA-256</th><th scope="col" className="text-right font-medium">Bytes</th></tr></thead>
            <tbody>
              {presentation.artifacts.map((artifact) => (
                <tr key={`${artifact.kind}-${artifact.sha256}`} className="border-t border-[var(--color-surface-700)] text-[var(--color-surface-300)]">
                  <td className="py-1.5 pr-3">{artifact.kind}</td>
                  <td className="py-1.5 pr-3 font-mono" title={artifact.sha256} aria-label={`SHA-256 ${artifact.sha256}`}>{artifact.sha256.slice(0, 12)}…</td>
                  <td className="py-1.5 text-right tabular-nums">{artifact.byteLength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-label="Canonical build test link" className="border-t border-[var(--color-surface-700)] pt-2 text-xs">
        {buildLink.kind === 'verified' ? (
          <p className="text-[var(--color-accent-green)]">Canonical saved build linked · native POSIX run · .zplc match · trace recorded.</p>
        ) : presentation.hasEvidence ? (
          <p className="text-[var(--color-surface-400)]">Not linked to the current canonical saved build. This test result remains recorded evidence only.</p>
        ) : (
          <p className="text-[var(--color-surface-400)]">No scenario evidence was recorded; there is no canonical build link.</p>
        )}
      </section>

      {presentation.savedTestInputIdentity && <p className="border-t border-[var(--color-surface-700)] pt-2 text-xs tabular-nums text-[var(--color-surface-400)]">Saved test inputs · {presentation.savedTestInputIdentity.fileCount} files · SHA-256 <span className="font-mono" title={presentation.savedTestInputIdentity.sha256}>{presentation.savedTestInputIdentity.sha256.slice(0, 12)}…</span></p>}

      {presentation.hasEvidence && <p className="border-t border-[var(--color-surface-700)] pt-2 text-xs text-[var(--color-surface-400)]">Evidence: native POSIX · logical single-task scan. This is not hardware or HIL evidence.</p>}
    </div>
  );
}

function ScenarioPreview({ scenario, onRunScenario, scenarioRunDisabled }: {
  scenario: NonNullable<WorkspaceTestPresentation['preview']>['scenarios'][number];
  onRunScenario: (scenarioId: string) => void;
  scenarioRunDisabled: boolean;
}) {
  const signals = [...new Set(scenario.samples.flatMap((sample) => Object.keys(sample.outputs)))].sort();
  const motorOutput = presentRecordedMotorOutput(scenario);
  const motorPlant = presentRecordedMotorPlant(scenario);
  const conveyorPlant = presentRecordedConveyorPlant(scenario);
  const pedestrianCrossing = presentRecordedPedestrianCrossing(scenario);
  const tankLevel = presentRecordedTankLevel(scenario);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className={scenario.passed ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}>{scenario.passed ? 'Passed' : 'Failed'}</span><span className="text-[var(--color-surface-200)]">{scenario.id}</span><span className="break-all text-[var(--color-surface-500)]">{scenario.path}</span>{scenario.truncated && <span className="text-[var(--color-surface-400)]">Preview truncated.</span>}<button type="button" onClick={() => onRunScenario(scenario.id)} aria-label={`Run ${scenario.id} again on native POSIX`} disabled={scenarioRunDisabled} className="ml-auto border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1 text-xs font-medium text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]">Run this scenario again</button></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-xs tabular-nums">
          <caption className="sr-only">Recorded assertions for {scenario.id}.</caption>
          <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">Kind</th><th scope="col" className="px-2 py-1 font-medium">Result</th><th scope="col" className="px-2 py-1 font-medium">Time</th></tr></thead>
          <tbody>{scenario.assertions.map((assertion, index) => <tr key={`${assertion.kind}-${index}`} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]"><td className="px-2 py-1">{assertion.kind}</td><td className="px-2 py-1">{assertion.passed ? 'Passed' : 'Failed'}</td><td className="px-2 py-1">{assertion.atMs === undefined ? '—' : `${assertion.atMs} ms`}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs tabular-nums">
          <caption className="sr-only">Recorded sampled timeline for {scenario.id}.</caption>
          <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">Time</th>{signals.map((signal) => <th key={signal} scope="col" className="px-2 py-1 font-medium">{signal}</th>)}</tr></thead>
          <tbody>{scenario.samples.map((sample) => <tr key={sample.atMs} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]"><td className="px-2 py-1">{sample.atMs} ms</td>{signals.map((signal) => <td key={signal} className="px-2 py-1">{sample.outputs[signal] ? 'TRUE' : 'FALSE'}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {motorOutput && (
        <div data-recorded-motor-output className="space-y-2 border-t border-[var(--color-surface-700)] pt-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />Recorded motor output</p>
          <div className="overflow-x-auto">
            <div role="group" aria-label="Recorded motor output samples" className="flex min-w-max rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">Time</span>
                {motorOutput.signals.map((signal) => <span key={signal} className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{signal}</span>)}
              </div>
              {motorOutput.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[4.5rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{sample.atMs} ms</span>
                  {motorOutput.signals.map((signal) => {
                    const state = sample.outputs[signal] ? 'ON' : 'OFF';
                    return <span key={signal} className="flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2" aria-label={`${signal} ${state} at ${sample.atMs} ms`}>{state}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-[var(--color-surface-200)]">Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.</p>
        </div>
      )}
      {motorPlant && (
        <section data-recorded-motor-plant className="space-y-2 border-t border-[var(--color-surface-700)] pt-2" aria-label="Motor plant recorded host scenario">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />Motor plant · recorded host scenario</p>
          <div role="region" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" tabIndex={0} aria-label="Recorded motor plant matrix">
            <div role="group" aria-label="Recorded motor plant samples: Command, Running, At speed, and Speed by time" className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">Time</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Command</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Running</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">At speed</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Speed</span>
              </div>
              {motorPlant.samples.map((sample) => {
                const values = [
                  ['Command', sample.command ? 'ON' : 'OFF', sample.command ? 'text-[var(--color-accent-blue)]' : 'text-[var(--color-surface-300)]'],
                  ['Running', sample.running ? 'ON' : 'OFF', sample.running ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-300)]'],
                  ['At speed', sample.atSpeed ? 'YES' : 'NO', sample.atSpeed ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-300)]'],
                  ['Speed', `${sample.speedPermilleAfterTick / 10}%`, sample.speedPermilleAfterTick > 0 ? 'text-[var(--color-accent-blue)]' : 'text-[var(--color-surface-300)]'],
                ] as const;
                return <div key={sample.atMs} className="flex min-w-[4.5rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{sample.atMs} ms</span>
                  {values.map(([label, value, stateClass]) => <span key={label} className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${stateClass}`} aria-label={`${label} ${value} at ${sample.atMs} ms`}>{value}</span>)}
                </div>;
              })}
            </div>
          </div>
          <p className="text-xs text-[var(--color-surface-200)]">Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.</p>
        </section>
      )}
      {conveyorPlant && (
        <section data-recorded-conveyor-plant className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label="Conveyor plant recorded host scenario">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />Conveyor plant · recorded host scenario</p>
          <div role="region" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" tabIndex={0} aria-label="Recorded conveyor plant matrix">
            <div role="group" aria-label="Recorded conveyor plant samples by time" className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-[11px] tabular-nums">
              <div className="grid shrink-0 grid-cols-2 border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="col-span-2 flex h-6 items-center px-2 font-medium">Time</span>
                {[
                  ['Belt command', 'Diverter command'],
                  ['Fault lamp', 'Classified count'],
                  ['Classifier sensor', 'Metal sensor'],
                  ['Diverter sensor', 'Jam sensor'],
                ].flat().map((label) => <span key={label} className="flex h-6 items-center border-t border-[var(--color-surface-600)] px-2">{label}</span>)}
              </div>
              {conveyorPlant.samples.map((sample) => {
                const values = [
                  ['Belt command', sample.beltCommand ? 'ON' : 'OFF', sample.beltCommand ? 'text-[var(--color-accent-blue)]' : 'text-[var(--color-surface-300)]'],
                  ['Diverter command', sample.diverterCommand ? 'ON' : 'OFF', sample.diverterCommand ? 'text-[var(--color-accent-blue)]' : 'text-[var(--color-surface-300)]'],
                  ['Fault lamp', sample.faultLamp ? 'ON' : 'OFF', sample.faultLamp ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-surface-300)]'],
                  ['Classified count', String(sample.classifiedCountAfterTick), sample.classifiedCountAfterTick > 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-300)]'],
                  ['Classifier sensor', sample.partAtClassifierInput ? 'ACTIVE' : 'CLEAR', sample.partAtClassifierInput ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-300)]'],
                  ['Metal sensor', sample.metalDetectedInput ? 'DETECTED' : 'CLEAR', sample.metalDetectedInput ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-300)]'],
                  ['Diverter sensor', sample.partAtDiverterInput ? 'ACTIVE' : 'CLEAR', sample.partAtDiverterInput ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-300)]'],
                  ['Jam sensor', sample.jamDetectedInput ? 'JAM' : 'CLEAR', sample.jamDetectedInput ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-surface-300)]'],
                ] as const;
                return <div key={sample.atMs} className="grid min-w-[7rem] grid-cols-2 border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="col-span-2 flex h-6 items-center justify-center px-2 font-medium">{sample.atMs} ms</span>
                  {values.map(([label, value, stateClass], index) => <span key={label} className={`flex h-6 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${index % 2 === 0 ? 'border-r border-[var(--color-surface-600)]' : ''} ${stateClass}`} aria-label={`${label} ${value} at ${sample.atMs} ms`}>{value}</span>)}
                </div>;
              })}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.</p>
        </section>
      )}
      {pedestrianCrossing && (
        <section data-recorded-pedestrian-crossing className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label="Pedestrian crossing recorded host scenario">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />Pedestrian crossing · recorded host scenario</p>
          <div role="region" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" tabIndex={0} aria-label="Recorded pedestrian crossing matrix">
            <div role="group" aria-label="Recorded pedestrian crossing samples by time" className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">Time</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Vehicle</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Pedestrian</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Request</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Plant</span>
              </div>
              {pedestrianCrossing.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[5.25rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{sample.atMs} ms</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.vehicle === 'GREEN' ? 'text-[var(--color-accent-green)]' : sample.vehicle === 'YELLOW' ? 'text-[var(--color-accent-yellow)]' : sample.vehicle === 'RED' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-surface-300)]'}`} aria-label={`Vehicle ${sample.vehicle} at ${sample.atMs} ms`}>{sample.vehicle}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.pedestrian === 'WALK' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`} aria-label={`Pedestrian ${sample.pedestrian} at ${sample.atMs} ms`}>{sample.pedestrian}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.request === 'ACTIVE' ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-300)]'}`} aria-label={`Request ${sample.request} at ${sample.atMs} ms`}>{sample.request}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.phase === 'CROSSING' ? 'text-[var(--color-accent-green)]' : sample.phase === 'WAITING' ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-300)]'}`} aria-label={`Plant ${sample.phase} at ${sample.atMs} ms`}>{sample.phase}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.</p>
        </section>
      )}
      {tankLevel && (
        <section data-recorded-tank-level className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label="Tank level controller recorded host scenario">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />Tank level controller · recorded host scenario</p>
          <div role="region" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]" tabIndex={0} aria-label="Recorded tank level matrix">
            <div role="group" aria-label="Recorded tank level outputs by time" className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">Time</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Pump</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">Alarm</span>
              </div>
              {tankLevel.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[5.25rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{sample.atMs} ms</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.pump === 'RUNNING' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-300)]'}`} aria-label={`Pump ${sample.pump} at ${sample.atMs} ms`}>{sample.pump}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.alarm === 'ALARM' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-surface-300)]'}`} aria-label={`Alarm ${sample.alarm} at ${sample.atMs} ms`}>{sample.alarm}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.</p>
        </section>
      )}
    </section>
  );
}
