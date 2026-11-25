/**
 * The two sidebars of the shell (UX-011): the primary one swaps its view with the activity rail, the secondary one holds one of its views
 * at a time (SHL-008).
 */
import { useEffect } from 'react';
import { useT } from '../i18n';
import { useLearnUi } from '../learn/learnUi';
import { useIDEStore } from '../store/useIDEStore';
import { ToggleGroup } from '../ui';
import { lessonSurface } from './shellRouting';
import { useShellDensity } from './shellDensity';
import { useAssistantProvider, useSecondaryView, type SecondaryView } from './useSelection';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useShellLayout, type ActivityView } from '../store/useShellLayout';
import { PRIMARY_VIEWS, SECONDARY_VIEWS } from './views';

function SidebarFrame({
  kind,
  label,
  title,
  children,
}: {
  kind: 'primary' | 'secondary';
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      data-sidebar-kind={kind}
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-surface-800)]"
      data-sidebar={label}
    >
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

function ActivityBody({ view }: { view: ActivityView }) {
  const { Body } = PRIMARY_VIEWS[view];
  return <Body />;
}

/**
 * The view the secondary sidebar shows: the person's choice while it is available, else the lesson of an open lesson workspace, else the
 * Inspector.
 */
function useShownSecondaryView(): { shown: SecondaryView; available: SecondaryView[] } {
  const view = useShellLayout((state) => state.activityView);
  const workspace = useLearnUi((state) => state.workspace);
  const session = useIDEStore((state) => state.projectSession);
  const assistant = useAssistantProvider((state) => state.available);
  const choice = useSecondaryView((state) => state.choice);
  const lesson = lessonSurface(view, workspace !== null && workspace.session === session) === 'secondary';
  const available: SecondaryView[] = [
    ...(lesson ? (['lesson'] as const) : []),
    'inspector',
    ...(assistant ? (['assistant'] as const) : []),
  ];
  const chosen = choice && choice.lesson === workspace && available.includes(choice.view) ? choice.view : null;
  return { shown: chosen ?? (lesson ? 'lesson' : 'inspector'), available };
}

function SecondaryBody({ view }: { view: SecondaryView }) {
  const { Body } = SECONDARY_VIEWS[view];
  return <Body />;
}

function SecondarySwitch({ shown, available, label }: { shown: SecondaryView; available: SecondaryView[]; label: string }) {
  const { t } = useT();
  const show = useSecondaryView((state) => state.show);
  if (available.length < 2) return null;
  return (
    <div className="border-b border-[var(--color-surface-600)] px-3 py-1.5">
      <ToggleGroup
        label={label}
        value={shown}
        onValueChange={(next) => show(next as SecondaryView)}
        options={available.map((value) => ({ value, label: t(SECONDARY_VIEWS[value].titleKey) }))}
      />
    </div>
  );
}

export function PrimarySidebar() {
  const { t } = useT();
  const view = useShellLayout((state) => state.activityView);
  const compact = useShellDensity() === 'compact';
  const offered = useSecondaryView((state) => state.inPrimary) && compact;
  const setInPrimary = useSecondaryView((state) => state.setInPrimary);
  const { shown, available } = useShownSecondaryView();
  const title = offered ? t(SECONDARY_VIEWS[shown].titleKey) : t(PRIMARY_VIEWS[view].titleKey);
  return (
    <SidebarFrame kind="primary" label={t('shell.primary.label')} title={title}>
      {compact && (
        <div className="border-b border-[var(--color-surface-600)] px-3 py-1.5">
          <ToggleGroup
            label={t('shell.primary.secondaryView')}
            value={offered ? 'secondary' : 'primary'}
            onValueChange={(next) => setInPrimary(next === 'secondary')}
            options={[
              { value: 'primary', label: t(PRIMARY_VIEWS[view].titleKey) },
              { value: 'secondary', label: t(SECONDARY_VIEWS[shown].titleKey) },
            ]}
          />
        </div>
      )}
      {offered && <SecondarySwitch shown={shown} available={available} label={t('shell.secondary.view')} />}
      <ErrorBoundary region="Sidebar" resetKey={offered ? shown : view}>
        {offered ? <SecondaryBody view={shown} /> : <ActivityBody view={view} />}
      </ErrorBoundary>
    </SidebarFrame>
  );
}

export function SecondarySidebar() {
  const { t } = useT();
  const { shown, available } = useShownSecondaryView();
  const refreshAvailability = useAssistantProvider((state) => state.refresh);
  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);
  return (
    <SidebarFrame kind="secondary" label={t('shell.secondary.label')} title={t(SECONDARY_VIEWS[shown].titleKey)}>
      <SecondarySwitch shown={shown} available={available} label={t('shell.secondary.view')} />
      <ErrorBoundary region="Sidebar" resetKey={shown}>
        <SecondaryBody view={shown} />
      </ErrorBoundary>
    </SidebarFrame>
  );
}
