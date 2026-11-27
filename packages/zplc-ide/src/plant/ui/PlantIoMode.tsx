/**
 * "Feed the board from the plant" in the plant document (PLS-008): the action, its confirmation (LNK-008, UX-020), and, once the
 * mode runs, the mirroring switch (LNK-010) and the stop. Only the confirmation starts anything.
 */
import { AlertDialog, Button, Checkbox } from '../../ui';
import { useT } from '../../i18n';
import { requestFeedBoard, setIoModeMirroring, startIoMode, stopIoMode, useIoModeStatus } from '../../store/ioModeStatus';

export function PlantIoMode({ boardConnected }: { boardConnected: boolean }) {
  const { t } = useT();
  const status = useIoModeStatus();
  const active = status.state === 'starting' || status.state === 'running';
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!active && boardConnected && (
        <Button variant="secondary" size="sm" data-command="plant.feedBoard" onClick={() => requestFeedBoard(true)}>
          {t('command.plant.feedBoard')}
        </Button>
      )}
      {active && (
        <>
          <Checkbox
            label={t('plant.ioMode.mirror')}
            checked={status.mirroring}
            disabled={status.state !== 'running'}
            onChange={(event) => void setIoModeMirroring(event.target.checked)}
          />
          <Button variant="secondary" size="sm" onClick={() => void stopIoMode()}>
            {t('plant.ioMode.stop')}
          </Button>
        </>
      )}
      {status.failure && !active && (
        <div role="alert" className="text-xs">
          {t('plant.ioMode.failed', { reason: status.failure })} {t('plant.ioMode.failedStaysBoard')}
        </div>
      )}
      <AlertDialog
        open={status.confirming}
        title={t('plant.ioMode.dialog.title')}
        description={t('plant.ioMode.dialog.description')}
        actionLabel={t('plant.ioMode.confirm')}
        cancelLabel={t('plant.ioMode.cancel')}
        onAction={() => void startIoMode()}
        onCancel={() => requestFeedBoard(false)}
      />
    </div>
  );
}
