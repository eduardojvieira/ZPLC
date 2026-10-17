/**
 * Asks what to do with modified files before they would be lost: save, discard or cancel.
 * Cancel is also what Escape and the backdrop do, so the safe answer is the easy one.
 */

import { Button } from '../ui';
import { useT } from '../i18n';
import { Modal } from './Modal';
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
    <Modal isOpen onClose={() => !busy && onChoice('cancel')} title={title} widthClass="max-w-md" showCloseButton={false}>
      <div className="p-4" data-unsaved-changes-dialog>
        <p className="mb-2 text-[var(--text-primary)]">{t('unsaved.items')}</p>
        <ul className="mb-4 list-disc pl-5 text-sm text-[var(--color-surface-100)]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={() => onChoice('cancel')}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={busy} onClick={() => onChoice('discard')}>{discardLabel ?? t('common.discard')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => onChoice('save')}>{busy ? t('common.saving') : saveLabel ?? t('common.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
