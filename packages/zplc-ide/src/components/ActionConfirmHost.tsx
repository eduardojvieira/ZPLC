/** The one place that shows the question of `confirmAction` (UX-020), mounted once in the workbench. */
import { useEffect } from 'react';
import { answerConfirmation, mountConfirmHost, useConfirmation } from '../store/actionConfirm';
import { AlertDialog } from '../ui';

export function ActionConfirmHost() {
  const request = useConfirmation();
  useEffect(() => mountConfirmHost(), []);
  return (
    <AlertDialog
      open={request !== null}
      title={request?.title ?? ''}
      description={request?.description ?? ''}
      actionLabel={request?.actionLabel ?? null}
      cancelLabel={request?.cancelLabel ?? ''}
      destructive={request?.destructive}
      size={request?.size}
      onAction={() => answerConfirmation(true)}
      onCancel={() => answerConfirmation(false)}
    >
      {request?.body}
    </AlertDialog>
  );
}
