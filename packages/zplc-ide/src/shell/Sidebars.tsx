/** The two sidebars of the shell (UX-011): the primary one swaps its view with the activity rail, the secondary one holds the Inspector. */
import { useT } from '../i18n';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LearnPanel } from '../components/LearnPanel';
import { ProjectExplorer } from '../components/ProjectExplorer';
import { WorkbenchInspector } from '../components/WorkbenchInspector';
import { useShellLayout, type ActivityView } from '../store/useShellLayout';
import { useWorkspaceTestResult } from './workspaceTestResult';
import { SearchView } from './SearchView';
import { TestsView } from './TestsView';

function SidebarFrame({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <aside aria-label={label} className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-surface-800)]" data-sidebar={label}>
      <h2 className="shrink-0 truncate border-b border-[var(--color-surface-600)] px-3 py-1.5 text-[length:var(--font-size-caption)] font-semibold uppercase tracking-wide text-[var(--color-surface-300)]">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

const TITLE_KEYS = { project: 'shell.activity.project', search: 'shell.activity.search', tests: 'shell.activity.tests', learn: 'shell.activity.learn' } as const;

function ActivityBody({ view }: { view: ActivityView }) {
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  switch (view) {
    case 'project': return <ProjectExplorer />;
    case 'search': return <SearchView />;
    case 'tests': return <TestsView />;
    case 'learn': return <LearnPanel workspaceTestPresentation={presentation} />;
  }
}

export function PrimarySidebar() {
  const { t } = useT();
  const view = useShellLayout((state) => state.activityView);
  return (
    <SidebarFrame label={t('shell.primary.label')} title={t(TITLE_KEYS[view])}>
      <ErrorBoundary region="Sidebar" resetKey={view}><ActivityBody view={view} /></ErrorBoundary>
    </SidebarFrame>
  );
}

export function SecondarySidebar() {
  const { t } = useT();
  return (
    <SidebarFrame label={t('shell.secondary.label')} title={t('shell.secondary.inspector')}>
      <ErrorBoundary region="Sidebar"><WorkbenchInspector /></ErrorBoundary>
    </SidebarFrame>
  );
}
