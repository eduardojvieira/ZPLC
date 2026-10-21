/** The two sidebars of the shell (UX-011): the primary one swaps its view with the activity rail, the secondary one holds the Inspector. */
import { useState } from 'react';
import { useT } from '../i18n';
import { useLearnUi } from '../learn/learnUi';
import { useIDEStore } from '../store/useIDEStore';
import { ToggleGroup } from '../ui';
import { lessonSurface } from './shellRouting';
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
      <h2
        className={
          'shrink-0 truncate border-b border-[var(--color-surface-600)] px-3 py-1.5 text-[length:var(--font-size-caption)] ' +
          'font-semibold uppercase tracking-wide text-[var(--color-surface-300)]'
        }
      >
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

const TITLE_KEYS = {
  project: 'shell.activity.project',
  search: 'shell.activity.search',
  tests: 'shell.activity.tests',
  learn: 'shell.activity.learn',
} as const;

function ActivityBody({ view }: { view: ActivityView }) {
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  switch (view) {
    case 'project':
      return <ProjectExplorer />;
    case 'search':
      return <SearchView />;
    case 'tests':
      return <TestsView />;
    case 'learn':
      return <LearnPanel workspaceTestPresentation={presentation} />;
  }
}

export function PrimarySidebar() {
  const { t } = useT();
  const view = useShellLayout((state) => state.activityView);
  return (
    <SidebarFrame label={t('shell.primary.label')} title={t(TITLE_KEYS[view])}>
      <ErrorBoundary region="Sidebar" resetKey={view}>
        <ActivityBody view={view} />
      </ErrorBoundary>
    </SidebarFrame>
  );
}

export function SecondarySidebar() {
  const { t } = useT();
  const view = useShellLayout((state) => state.activityView);
  const workspace = useLearnUi((state) => state.workspace);
  const session = useIDEStore((state) => state.projectSession);
  const beside = lessonSurface(view, workspace !== null && workspace.session === session) === 'secondary';
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  // The learner's choice holds for the lesson it was made for; a new lesson starts on the lesson, which is what the learner expects to see
  // first.
  const [choice, setChoice] = useState<{ lesson: unknown; view: 'lesson' | 'inspector' }>({ lesson: null, view: 'lesson' });
  const shown = choice.lesson === workspace ? choice.view : 'lesson';
  if (!beside) {
    return (
      <SidebarFrame label={t('shell.secondary.label')} title={t('shell.secondary.inspector')}>
        <ErrorBoundary region="Sidebar">
          <WorkbenchInspector />
        </ErrorBoundary>
      </SidebarFrame>
    );
  }
  return (
    <SidebarFrame label={t('shell.secondary.label')} title={t(shown === 'lesson' ? 'shell.secondary.lesson' : 'shell.secondary.inspector')}>
      <div className="border-b border-[var(--color-surface-600)] px-3 py-1.5">
        <ToggleGroup
          label={t('shell.secondary.view')}
          value={shown}
          onValueChange={(next) => setChoice({ lesson: workspace, view: next as 'lesson' | 'inspector' })}
          options={[
            { value: 'lesson', label: t('shell.secondary.lesson') },
            { value: 'inspector', label: t('shell.secondary.inspector') },
          ]}
        />
      </div>
      <ErrorBoundary region="Sidebar" resetKey={shown}>
        {shown === 'lesson' ? <LearnPanel workspaceTestPresentation={presentation} /> : <WorkbenchInspector />}
      </ErrorBoundary>
    </SidebarFrame>
  );
}
