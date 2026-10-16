/**
 * The dialog in which the user chooses the serial port to connect to (IDE-018): each port with its name and its USB
 * identifiers, the known boards marked, a way to ask for the list again, and a cancel that is also what Escape does.
 * It only shows rows and reports what the user did; `SerialPortChooser` holds the state and talks to the main process.
 */

import { Modal } from './Modal';
import { boardNote, type SerialPortRow } from '../utils/serialPortChoice';

export interface SerialPortDialogProps {
  rows: readonly SerialPortRow[];
  selectedPortId: string | null;
  refreshing: boolean;
  onSelect(portId: string): void;
  onChoose(): void;
  onRefresh(): void;
  onCancel(): void;
}

const BUTTON = 'px-4 py-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';

export function SerialPortDialog({ rows, selectedPortId, refreshing, onSelect, onChoose, onRefresh, onCancel }: SerialPortDialogProps) {
  return (
    <Modal isOpen onClose={onCancel} title="Choose a serial port" widthClass="max-w-xl" showCloseButton={false}>
      <div className="p-4" data-serial-port-dialog>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">
          Studio uses only the port you choose, for this connection. Choosing a port does not send a program or start anything.
        </p>
        {rows.length === 0 ? (
          <p role="status" className="mb-4 rounded border border-[var(--border-color)] p-3 text-sm text-[var(--color-surface-100)]" data-serial-port-empty>
            No serial port was found. Plug in the board, then choose Refresh.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Serial ports" className="mb-4 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {rows.map((row) => {
              const note = boardNote(row);
              const checked = row.portId === selectedPortId;
              return (
                <label
                  key={row.portId}
                  data-serial-port-row={row.kind}
                  className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm ${checked ? 'border-[var(--color-accent-blue)] bg-[var(--color-surface-700)]' : 'border-[var(--border-color)] hover:bg-[var(--color-surface-700)]'}`}
                >
                  <input type="radio" name="serial-port" checked={checked} onChange={() => onSelect(row.portId)} className="mt-1" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words font-medium text-[var(--color-surface-50)]">{row.name}</span>
                    <span className="text-xs text-[var(--color-surface-200)]">
                      {row.usbId === null ? 'No USB identifiers' : `USB ${row.usbId}`}
                      {row.serialNumber === null ? '' : ` · serial number ${row.serialNumber}`}
                    </span>
                    {note === null ? null : <span className={`text-xs ${row.kind === 'known-board' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-200)]'}`}>{note}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="flex justify-between gap-2">
          <button type="button" disabled={refreshing} onClick={onRefresh} className={`${BUTTON} bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-100)]`}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className={`${BUTTON} bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-100)]`}>
              Cancel
            </button>
            <button type="button" disabled={selectedPortId === null || refreshing} onClick={onChoose} className={`${BUTTON} bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white`}>
              Use this port
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
