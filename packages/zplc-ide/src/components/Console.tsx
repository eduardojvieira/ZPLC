/**
 * Console Component
 *
 * The results panel under the editor (UX-011, SHL-003): Output, Problems, Test results, Trace and Watch, and Terminal while the target
 * is a board or once the person has opened it. The Explorer, the Inspector and the lessons are views of the sidebars
 * (shell/Sidebars.tsx); Interlocks, Changes and Agent are the Tests activity, the review document and the Assistant view (SHL-004).
 * The Terminal tab provides direct shell access to ZPLC devices.
 * The Watch tab shows live debug values.
 */

import { ProblemsPanel } from './ProblemsPanel';
import { useUnseen } from './consoleAttention';
import { ChevronDown, ChevronUp, Terminal, AlertTriangle, Trash2, Eye, FlaskConical, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { useConsoleState } from '../store/regionSubscriptions';
import { invalidateReview } from './reviewFlow';
import { useCommandState } from '../commands/bus';
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
import { Badge, Button, FileInput, IconButton } from '../ui';
import { useT } from '../i18n';
import { CommandEmptyState } from './panelStates';
import { LiveNativeMotorPanel } from './LiveNativeMotorControls';
import { useAppSettings } from '../store/useAppSettings';
import { outputLevelOf } from '../utils/appSettings';
import { entriesForLevel } from '../store/consoleEntries';
import { OutputTab } from './console/OutputTab';
import { TestsTab } from './console/TestsTab';
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
  // Terminal is a tab while the target is a board, and from the first time the person asks for it while the project stays open (SHL-003)
  const boardTarget = useCommandState().mode === 'hardware';
  const [terminalOpened, setTerminalOpened] = useState(false);
  if (activeConsoleTab === 'terminal' && !terminalOpened) setTerminalOpened(true);
  const projectBlocks = useProjectBlocks();
  const runner = useWorkspaceTestRunner({
    isProjectOpen,
    projectSession,
    workspaceScenarioLink,
    linkWorkspaceScenarios,
    hasUnsavedChanges,
  });
  const { workspaceManifestInputRef, registerWorkspaceManifest } = runner;

  // Get watch count for badge
  const watchCount = useIDEStore((state) => state.debug.watchVariables.length);
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const debugMode = useIDEStore((state) => state.debug.mode);
  const latestNativeTrace = nativeTrace.at(-1);
  const activeFile = activeFileId ? loadedFiles.get(activeFileId) : undefined;
  // a review of the review document is about the program as it was: a change of the program makes it stale. This panel is mounted with
  // the workbench, as the Changes tab that held the review was.
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
      label: t('u2Panel.testResults'),
      icon: <FlaskConical size={14} />,
      ariaLabel: t('console.tab.testsAria'),
    },
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
    ...(boardTarget || terminalOpened
      ? [
          {
            id: 'terminal' as const,
            label: t('console.tab.terminal'),
            icon: <Terminal size={14} className="text-[var(--color-accent-green)]" />,
          },
        ]
      : []),
  ];

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

        <ConsoleTabStrip tabs={tabs} activeConsoleTab={activeConsoleTab} onSelect={setActiveConsoleTab} />

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
