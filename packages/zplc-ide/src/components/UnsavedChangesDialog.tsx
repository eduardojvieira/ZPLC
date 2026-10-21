/**
 * Asks what to do with modified files before they would be lost: save, discard or cancel, as an alert dialog (UX-020).
 * Cancel is also what Escape does and where focus starts, so the safe answer is the easy one.
 */

import { AlertDialog } from '../ui';
import { useT } from '../i18n';
import type { UnsavedChoice } from '../utils/unsavedChanges';

interface UnsavedChangesDialogProps {
  title: string;
  items: string[];
  busy?: boolean;
  saveLabel?: string;
  discardLabel?: string;
  onChoice: (choice: UnsavedChoice) => void;
}

export function UnsavedChangesDialog({ title, items, busy = false, saveLabel, discardLabel, onChoice }: UnsavedChangesDialogProps) {
  const { t } = useT();
  return (
    <AlertDialog
      open
      title={title}
      description={t('unsaved.items')}
      cancelLabel={t('common.cancel')}
      secondary={{ label: discardLabel ?? t('common.discard'), destructive: true, onSelect: () => onChoice('discard') }}
      actionLabel={busy ? t('common.saving') : (saveLabel ?? t('common.save'))}
      busy={busy}
      onAction={() => onChoice('save')}
      onCancel={() => onChoice('cancel')}
    >
      <ul className="list-disc pl-5 text-sm text-[var(--color-surface-100)]" data-unsaved-changes-dialog>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AlertDialog>
  );
}
