/**
 * The declared inputs of the running program, one row each, with the control that sets it (IDE-024). Presentational only
 * (no store, no controller), so it renders in a test without a window; `SimulationInputsPanel.tsx` supplies the rows.
 */
import { useState } from 'react';

import { inputAddressLabel, type DeclaredInput } from '../runtime/declaredInputs';
import { Button, Checkbox, NumberField } from '../ui';

export interface SimulationInputRow {
  input: DeclaredInput;
  /** The value read from the runtime, or null when it has not been read yet. */
  value: boolean | number | null;
  forced: boolean;
  /** Types that a force carries (up to 32 bits); the others can be set but not forced. */
  forceable: boolean;
}


function NumberControl({ row, disabled, onSet }: { row: SimulationInputRow; disabled: boolean; onSet: (value: number) => void }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onSet(parsed);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <NumberField inputMode="decimal" value={draft} placeholder={row.value === null ? '' : String(row.value)} disabled={disabled} aria-label={`Value of ${row.input.name}`} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} className="w-24 tabular-nums" />
      <Button variant="ghost" size="sm" disabled={disabled || draft.trim() === ''} aria-label={`Set ${row.input.name}`} onClick={submit}>Set</Button>
    </span>
  );
}

export function SimulationInputsList({ rows, unavailable, message, onSet, onForce }: {
  rows: readonly SimulationInputRow[];
  /** Why the inputs cannot be set now (no simulator connected, hardware, nothing compiled); the rows are then read-only. */
  unavailable?: string;
  /** The outcome of the last action, shown in words (a refused value, a failed write). */
  message?: string;
  onSet: (input: DeclaredInput, value: boolean | number) => void;
  onForce: (input: DeclaredInput, force: boolean) => void;
}) {
  const disabled = unavailable !== undefined;
  return (
    <section aria-label="Simulation inputs" className="mb-3 border border-[var(--color-surface-700)] bg-[var(--color-surface-900)] p-2">
      <h3 className="text-xs font-medium text-[var(--color-surface-100)]">Simulation inputs</h3>
      <p className="mt-1 text-xs text-[var(--color-surface-400)]">
        Every input the running program declares: variables mapped to the input image and the inputs of its programs. Setting one writes it into the native simulation; Force holds it there.
      </p>
      {rows.length === 0 ? (
        <p role="status" className="mt-2 text-xs text-[var(--color-surface-300)]">{unavailable ?? 'The program declares no inputs.'}</p>
      ) : (
        <>
          {unavailable && <p role="status" className="mt-2 text-xs text-[var(--color-accent-yellow)]">{unavailable}</p>}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <caption className="sr-only">Inputs declared by the running program</caption>
              <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]">
                <tr><th scope="col" className="px-2 py-1 font-medium">Input</th><th scope="col" className="px-2 py-1 font-medium">Type</th><th scope="col" className="px-2 py-1 font-medium">Address</th><th scope="col" className="px-2 py-1 font-medium">Value</th><th scope="col" className="px-2 py-1 font-medium">Set</th><th scope="col" className="px-2 py-1 font-medium">Force</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.input.path} data-input={row.input.path} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-200)]">
                    <th scope="row" className="px-2 py-1 font-medium">{row.input.path}</th>
                    <td className="px-2 py-1">{row.input.type}</td>
                    <td className="px-2 py-1 tabular-nums">{inputAddressLabel(row.input)}</td>
                    <td className="px-2 py-1 tabular-nums" data-input-value>{row.value === null ? '—' : typeof row.value === 'boolean' ? (row.value ? 'TRUE' : 'FALSE') : String(row.value)}</td>
                    <td className="px-2 py-1">
                      {row.input.type === 'BOOL' ? (
                        <Button
                          variant="secondary" size="sm" role="switch" aria-checked={row.value === true} disabled={disabled}
                          aria-label={`${row.input.name}: ${row.value === true ? 'TRUE' : 'FALSE'}`}
                          onClick={() => onSet(row.input, row.value !== true)}
                        >{row.value === true ? 'Set FALSE' : 'Set TRUE'}</Button>
                      ) : (
                        <NumberControl row={row} disabled={disabled} onSet={(value) => onSet(row.input, value)} />
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <Checkbox label={`Force input ${row.input.name}`} hideLabel checked={row.forced} disabled={disabled || !row.forceable || row.value === null} onChange={(event) => onForce(row.input, event.target.checked)} />
                      {!row.forceable && <span className="ml-2 text-xs text-[var(--text-tertiary)]">A force carries up to 32 bits</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {message && <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-accent-yellow)]">{message}</p>}
    </section>
  );
}
