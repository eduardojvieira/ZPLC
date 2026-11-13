/**
 * What a run of the tests needs before it starts (FLW-006, TST-002): the documents saved by the rule of the preference "Before
 * running and building" (Always saves, Ask asks), and the project reached by the runner without anyone choosing a file. A step
 * that cannot be done says so in a notice with the action to take (FLW-004) and the run does not start.
 */
import { shownProjectBridge, type ShownProjectBridge } from '../ipc/shownProjectBridge';
import { t } from '../i18n';
import { confirmAction } from '../store/actionConfirm';
import { useNotifications } from '../store/notifications';
import { saveAllDocuments } from '../store/saveAll';
import { useAppSettings } from '../store/useAppSettings';
import { useIDEStore } from '../store/useIDEStore';
import { linkProjectWorkspace } from '../utils/workspaceTestLink';

export type RunRefusal = 'desktop' | 'noProject' | 'cancelled' | 'saveFailed' | 'noLink';
export interface PreparedRun {
  bridge: ShownProjectBridge;
  workspaceId: string;
  projectSession: number;
  compilerRunId: number;
}

function refuse(title: string, detail: string | undefined, retry: () => void): void {
  useNotifications.getState().report({
    kind: 'tests',
    status: 'error',
    title,
    ...(detail === undefined ? {} : { detail }),
    details: 'tests',
    recover: { label: t('u2Tests.retry'), run: retry },
  });
}

/** `retry` is what the action of a refusal does: the same run again. */
export async function prepareProjectTestRun(
  retry: () => void,
): Promise<{ ok: true; run: PreparedRun } | { ok: false; refusal: RunRefusal }> {
  const bridge = shownProjectBridge(window.electronAPI?.workspaceTests);
  if (!bridge) return { ok: false, refusal: 'desktop' };
  if (!useIDEStore.getState().isProjectOpen) return { ok: false, refusal: 'noProject' };

  if (useIDEStore.getState().hasUnsavedChanges()) {
    if (useAppSettings.getState().settings.saveBeforeRun === 'ask') {
      const yes = await confirmAction({
        title: t('studio.flow.ask.title'),
        description: t('studio.flow.ask.description'),
        actionLabel: t('studio.flow.ask.action'),
        cancelLabel: t('common.cancel'),
      });
      if (!yes) return { ok: false, refusal: 'cancelled' };
    }
    const { failed } = await saveAllDocuments();
    if (failed.length > 0) {
      refuse(t('u2Tests.refused.save', { files: failed.join(', ') }), undefined, retry);
      return { ok: false, refusal: 'saveFailed' };
    }
  }

  const current = useIDEStore.getState();
  const link =
    current.workspaceScenarioLink?.projectSession === current.projectSession ? current.workspaceScenarioLink : await linkProjectWorkspace();
  if (!link) {
    refuse(t('u2Tests.refused.title'), t('u2Tests.refused.detail'), retry);
    return { ok: false, refusal: 'noLink' };
  }
  const latest = useIDEStore.getState();
  if (latest.projectSession !== link.projectSession) return { ok: false, refusal: 'noProject' };
  return {
    ok: true,
    run: { bridge, workspaceId: link.workspaceId, projectSession: link.projectSession, compilerRunId: latest.compilerRunId },
  };
}
