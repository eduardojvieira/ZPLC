/** The Tests activity (UX-011): what the host scenarios are, whether the project's are linked, and the way to the results panel where they run and report. */
import { useT } from '../i18n';
import { runCommand } from '../commands/bus';
import { useIDEStore } from '../store/useIDEStore';
import { Button } from '../ui';

export function TestsView() {
  const { t } = useT();
  const linked = useIDEStore((state) => state.workspaceScenarioLink?.projectSession === state.projectSession);
  return (
    <div className="space-y-3 p-3 font-sans text-sm text-[var(--color-surface-200)]" data-tests-view>
      <p>{t('testsView.description')}</p>
      <p role="status" className="text-[var(--color-surface-300)]">{linked ? t('testsView.linked') : t('testsView.notLinked')}</p>
      <Button variant="primary" size="sm" onClick={() => { runCommand('view.tests'); }}>{t('testsView.show')}</Button>
    </div>
  );
}
