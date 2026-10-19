/**
 * The regions of the workbench under the command bar (UX-011): the activity rail, the primary sidebar, the editor area
 * over the results panel, and the secondary sidebar, with a separator between each pair (UX-017). The sidebars collapse
 * rather than unmount their panels, so a layout saved with one hidden comes back the same.
 */
import { useEffect, type ComponentType } from 'react';
import { Group, Panel, useGroupCallbackRef, usePanelCallbackRef, type PanelSize } from 'react-resizable-panels';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LearnHome } from '../components/LearnHome';
import { PanelSeparator } from '../components/PanelSeparator';
import { useT } from '../i18n';
import type { DebugController } from '../hooks/useDebugController';
import { openLearnHome, useLearnUi } from '../learn/learnUi';
import { useIDEStore } from '../store/useIDEStore';
import { startShellRouting } from './shellRouting';
import { useShellLayout } from '../store/useShellLayout';
import { useShellLayoutSizes, useWorkspaceLayout } from '../utils/layoutStorage';
import { workspaceLayoutFrom } from '../utils/sessionState';
import { ActivityRail } from './ActivityRail';
import { PrimarySidebar, SecondarySidebar } from './Sidebars';
import { COMPACT_MAX_WIDTH, useShellDensity } from './shellDensity';

interface WorkbenchShellProps {
  EditorArea: ComponentType;
  Console: ComponentType<{ debugController: DebugController }>;
  debugController: DebugController;
}

/** Keeps a collapsible panel and the visibility flag that stands for it the same, whichever one the user changed. */
function useCollapsible(panel: ReturnType<typeof usePanelCallbackRef>[0], visible: boolean): void {
  useEffect(() => {
    if (!panel) return;
    if (visible && panel.isCollapsed()) panel.expand();
    if (!visible && !panel.isCollapsed()) panel.collapse();
  }, [panel, visible]);
}

export function WorkbenchShell({ EditorArea, Console, debugController }: WorkbenchShellProps) {
  const { t } = useT();
  const density = useShellDensity();
  const { activityView, primaryVisible, secondaryVisible, showActivity, setPrimaryVisible, setSecondaryVisible } = useShellLayout();
  const isConsoleCollapsed = useIDEStore((s) => s.isConsoleCollapsed);
  const learnHomeOpen = useLearnUi((s) => s.homeOpen);
  const lessonWorkspace = useLearnUi((s) => s.workspace);
  const sessionLayout = useIDEStore((s) => s.sessionLayout);
  const setSessionLayout = useIDEStore((s) => s.setSessionLayout);
  const projectSession = useIDEStore((s) => s.projectSession);
  const { defaultLayout, onLayoutChanged } = useWorkspaceLayout();
  const shellSizes = useShellLayoutSizes();

  const [consolePanel, setConsolePanel] = usePanelCallbackRef();
  const [groupPanel, setGroupPanel] = useGroupCallbackRef();
  const [shellGroup, setShellGroup] = useGroupCallbackRef();
  const [primaryPanel, setPrimaryPanel] = usePanelCallbackRef();
  const [secondaryPanel, setSecondaryPanel] = usePanelCallbackRef();

  // A request for the lessons, the explorer or the inspector, made by name as a console tab, shows that view.
  useEffect(() => startShellRouting(useIDEStore, () => useShellLayout.getState()), []);

  // A project that opens while the workbench is already showing brings its own split; the first one is the group's default.
  useEffect(() => {
    const layout = useIDEStore.getState().sessionLayout;
    if (groupPanel && layout) groupPanel.setLayout(layout);
  }, [groupPanel, projectSession]);

  useEffect(() => {
    if (!consolePanel) return;
    if (isConsoleCollapsed) consolePanel.collapse();
    else consolePanel.expand();
  }, [isConsoleCollapsed, consolePanel]);

  useCollapsible(primaryPanel, primaryVisible);
  useCollapsible(secondaryPanel, secondaryVisible);

  // A lesson that has just been started and sits in the secondary sidebar (the rail is not Learn) opens that sidebar, once per lesson.
  useEffect(() => {
    if (lessonWorkspace && density !== 'compact' && useShellLayout.getState().activityView !== 'learn') useShellLayout.getState().setSecondaryVisible(true);
  }, [lessonWorkspace, density]);

  // A window as narrow as the minimum has no room for the secondary sidebar (UX-023); it can be shown again from the View menu.
  useEffect(() => {
    if (density === 'compact') useShellLayout.getState().setSecondaryVisible(false);
  }, [density]);

  const follow = (visible: boolean, set: (visible: boolean) => void) => (size: PanelSize): void => {
    const shown = size.inPixels > 0;
    if (shown !== visible) set(shown);
  };

  return (
    <div className="flex min-h-0 flex-1 ledger-workspace">
      <ActivityRail
        active={activityView}
        density={density}
        onSelect={(view) => {
          if (view === 'tests') { showActivity('tests'); useIDEStore.getState().setActiveConsoleTab('tests'); if (useIDEStore.getState().isConsoleCollapsed) useIDEStore.getState().toggleConsole(); }
          else if (view === 'learn') openLearnHome();
          else showActivity(view);
        }}
      />
      <Group
        orientation="horizontal"
        className="h-full min-w-0 flex-1"
        defaultLayout={shellSizes.defaultLayout}
        groupRef={setShellGroup}
        onLayoutChanged={shellSizes.onLayoutChanged}
      >
        <Panel id="primary" panelRef={setPrimaryPanel} defaultSize="280px" minSize="200px" maxSize="520px" collapsible collapsedSize={0} onResize={follow(primaryVisible, setPrimaryVisible)} className="overflow-hidden">
          {primaryVisible && <PrimarySidebar />}
        </Panel>
        <PanelSeparator id="primary-separator" label={t('shell.resize.primary')} group={shellGroup} leading="primary" trailing="center" />
        <Panel id="center" minSize={`${Math.round(COMPACT_MAX_WIDTH / 3)}px`} className="overflow-hidden">
          <Group
            orientation="vertical"
            className="h-full min-w-0"
            defaultLayout={sessionLayout ?? defaultLayout}
            groupRef={setGroupPanel}
            onLayoutChanged={(layout, meta) => {
              onLayoutChanged(layout, meta);
              if (meta.isUserInteraction) {
                const split = workspaceLayoutFrom(layout);
                if (split) setSessionLayout(split);
              }
            }}
          >
            <Panel id="editor" defaultSize="72%" minSize="30%" className="overflow-hidden">
              <main aria-label={t('shell.editor.label')} className="relative h-full min-h-0">
                <ErrorBoundary region="Editor">
                  <EditorArea />
                </ErrorBoundary>
                {/* The Learn home covers the editor without unmounting it, so a lesson's buffers and cursor are where they were when it closes. */}
                {learnHomeOpen && <div className="absolute inset-0 z-20"><ErrorBoundary region="Editor"><LearnHome /></ErrorBoundary></div>}
              </main>
            </Panel>
            <PanelSeparator id="workspace-separator" label={t('app.resize')} group={groupPanel} leading="editor" trailing="console" />
            <Panel id="console" panelRef={setConsolePanel} defaultSize="28%" minSize="5%" maxSize="65%" collapsible collapsedSize={32} className="overflow-hidden">
              <ErrorBoundary region="Panel">
                <Console debugController={debugController} />
              </ErrorBoundary>
            </Panel>
          </Group>
        </Panel>
        <PanelSeparator id="secondary-separator" label={t('shell.resize.secondary')} group={shellGroup} leading="center" trailing="secondary" />
        <Panel id="secondary" panelRef={setSecondaryPanel} defaultSize="280px" minSize="200px" maxSize="520px" collapsible collapsedSize={0} onResize={follow(secondaryVisible, setSecondaryVisible)} className="overflow-hidden">
          {secondaryVisible && <SecondarySidebar />}
        </Panel>
      </Group>
    </div>
  );
}
