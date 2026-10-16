/**
 * Asks what to do with modified files before they would be lost: save, discard or cancel.
 * Cancel is also what Escape and the backdrop do, so the safe answer is the easy one.
 */

import { Button } from '../ui';
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

export function UnsavedChangesDialog({ title, items, busy = false, saveLabel = 'Save', discardLabel = 'Discard', onChoice }: UnsavedChangesDialogProps) {
  return (
    <Modal isOpen onClose={() => !busy && onChoice('cancel')} title={title} widthClass="max-w-md" showCloseButton={false}>
      <div className="p-4" data-unsaved-changes-dialog>
        <p className="mb-2 text-[var(--text-primary)]">These have changes that are not saved:</p>
        <ul className="mb-4 list-disc pl-5 text-sm text-[var(--color-surface-100)]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={() => onChoice('cancel')}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={() => onChoice('discard')}>{discardLabel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => onChoice('save')}>{busy ? 'Saving…' : saveLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
