/**
 * The dialog in which the user chooses the serial port to connect to (IDE-018): each port with its name and its USB
 * identifiers, the known boards marked, a way to ask for the list again, and a cancel that is also what Escape does.
 * It only shows rows and reports what the user did; `SerialPortChooser` holds the state and talks to the main process.
 */

import type { KeyboardEvent } from 'react';
import { Button } from '../ui';
import { useT } from '../i18n';
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

export function SerialPortDialog({ rows, selectedPortId, refreshing, onSelect, onChoose, onRefresh, onCancel }: SerialPortDialogProps) {
  const { t } = useT();
  // A radio group the way a native one behaves: one tab stop (the chosen port, else the first), and the arrow keys move
  // the choice and the focus together.
  const onRowKey = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const target = (index + step + rows.length) % rows.length;
    onSelect(rows[target].portId);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[target]?.focus();
  };
  return (
    <Modal isOpen onClose={onCancel} title={t('serialPort.title')} widthClass="max-w-xl" showCloseButton={false}>
      <div className="p-4" data-serial-port-dialog>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">
          {t('serialPort.intro')}
        </p>
        {rows.length === 0 ? (
          <p role="status" className="mb-4 rounded border border-[var(--border-color)] p-3 text-sm text-[var(--color-surface-100)]" data-serial-port-empty>
            {t('serialPort.empty')}
          </p>
        ) : (
          <div role="radiogroup" aria-label={t('serialPort.list')} className="mb-4 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {rows.map((row, index) => {
              const note = boardNote(row, t);
              const checked = row.portId === selectedPortId;
              return (
                <Button
                  key={row.portId}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked || (selectedPortId === null && index === 0) ? 0 : -1}
                  data-serial-port-row={row.kind}
                  onClick={() => onSelect(row.portId)}
                  onKeyDown={(event) => onRowKey(event, index)}
                  className={`items-start justify-start gap-3 whitespace-normal p-3 text-left text-sm ${checked ? 'border-[var(--color-accent-blue)] bg-[var(--color-surface-700)]' : ''}`}
                >
                  <span aria-hidden="true" className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--color-accent-blue)] ${checked ? 'bg-[var(--color-accent-blue)]' : ''}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words font-medium text-[var(--color-surface-100)]">{row.name}</span>
                    <span className="text-xs font-normal text-[var(--color-surface-200)]">
                      {row.usbId === null ? t('serialPort.noUsbId') : t('serialPort.usb', { id: row.usbId })}
                      {row.serialNumber === null ? '' : ` · ${t('serialPort.serialNumber', { serial: row.serialNumber })}`}
                    </span>
                    {note === null ? null : <span className={`text-xs font-normal ${row.kind === 'known-board' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-surface-200)]'}`}>{note}</span>}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex justify-between gap-2">
          <Button disabled={refreshing} onClick={onRefresh}>
            {refreshing ? t('serialPort.refreshing') : t('serialPort.refresh')}
          </Button>
          <div className="flex gap-2">
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={selectedPortId === null || refreshing} onClick={onChoose}>{t('serialPort.use')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
