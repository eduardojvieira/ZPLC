/** What the deploy dialog asks and how it is answered (UX-019); the body it shows is DeployDialog.tsx. */
import { t } from '../i18n';
import { confirmAction, type ActionConfirmRequest } from '../store/actionConfirm';
import { compareDeployFacts, type DeployFacts } from './deployComparison';
import { DeployDialogBody } from './DeployDialog';
import type { HardwareDeployConfirmation } from './hardwareDeployConfirmation';

/** What `confirmAction` asks for a deploy; with a refusal, or a mismatch, the dialog only informs and offers Close. */
export function deployRequest(
  facts: DeployFacts,
  { running, refusal = null }: { running: boolean; refusal?: string | null },
): ActionConfirmRequest {
  const comparison = compareDeployFacts(facts, t);
  const blocked = comparison.blocked || refusal !== null;
  return {
    title: blocked ? t('deploy.blocked.title') : t('deploy.title'),
    description: blocked ? t('deploy.blocked.description') : running ? t('deploy.description.running') : t('deploy.description.stopped'),
    actionLabel: blocked ? null : running ? t('deploy.action.stopAndDeploy') : t('deploy.action.deploy'),
    cancelLabel: blocked ? t('deploy.close') : t('common.cancel'),
    destructive: running && !blocked,
    size: 'xl',
    body: <DeployDialogBody comparison={comparison} refusal={refusal} />,
  };
}

/** True when the person confirmed. A mismatch cannot be confirmed: the dialog then only informs. */
export async function confirmDeploy(confirmation: HardwareDeployConfirmation, running: boolean): Promise<boolean> {
  const request = deployRequest(confirmation.facts, { running });
  const answer = await confirmAction(request);
  return answer && request.actionLabel !== null;
}

/** Shows why a deploy was refused before any byte was sent, with the rows that do not match. Always false. */
export async function showDeployRefusal(facts: DeployFacts, reason: string | undefined): Promise<false> {
  await confirmAction(deployRequest(facts, { running: false, refusal: reason ?? t('deploy.refused.generic') }));
  return false;
}
