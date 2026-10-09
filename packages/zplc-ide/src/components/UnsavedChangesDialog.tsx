/**
 * Asks what to do with modified files before they would be lost: save, discard or cancel.
 * Cancel is also what Escape and the backdrop do, so the safe answer is the easy one.
 */

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

const BUTTON = 'px-4 py-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';

export function UnsavedChangesDialog({ title, items, busy = false, saveLabel = 'Save', discardLabel = 'Discard', onChoice }: UnsavedChangesDialogProps) {
  return (
    <Modal isOpen onClose={() => !busy && onChoice('cancel')} title={title} widthClass="max-w-md" showCloseButton={false}>
      <div className="p-4" data-unsaved-changes-dialog>
        <p className="text-[var(--color-surface-200)] mb-2">These have changes that are not saved:</p>
        <ul className="mb-4 list-disc pl-5 text-sm text-[var(--color-surface-100)]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => onChoice('cancel')} className={`${BUTTON} bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-100)]`}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => onChoice('discard')} className={`${BUTTON} bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80 text-white`}>
            {discardLabel}
          </button>
          <button type="button" disabled={busy} onClick={() => onChoice('save')} className={`${BUTTON} bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white`}>
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
