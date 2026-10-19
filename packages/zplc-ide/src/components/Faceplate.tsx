/**
 * The live I/O faceplate (LRN-017): the inputs and outputs of the running program, from its I/O map, one row each.
 * An input is operated with the control that fits its type (a switch and a push button for a BOOL, a slider and a number
 * box for a number), and shows that its change is pending until the next scan and then applied. An output shows its
 * live value in the shared signal vocabulary (UX-009): the state is a glyph and a word as well as a colour. Presentational
 * only (no store, no controller), so it renders in a test without a window; `FaceplatePanel.tsx` supplies the rows.
 *
 * Plants (LRN-018) bind to the same I/O points by an explicit mapping; nothing here depends on a name.
 */
import { useEffect, useRef, useState } from 'react';

import { useT, type Translator } from '../i18n';
import { inputAddressLabel, inputRange, type DeclaredInput } from '../runtime/declaredInputs';
import { createHold } from '../runtime/faceplateState';
import { outputAddressLabel, type DeclaredOutput } from '../runtime/ioMap';
import { signalTone, type SignalTone } from '../theme/signalTone';
import { Button, Checkbox, NumberField, RangeField, SignalValue } from '../ui';

export type InputPhase = 'idle' | 'pending' | 'applied';

export interface FaceplateInputRow {
  input: DeclaredInput;
  /** The value read from the runtime, or null when it has not been read yet. */
  value: boolean | number | null;
  /** `pending` from the moment a change is written until the runtime holds it, `applied` for a moment after that. */
  phase: InputPhase;
  forced: boolean;
  /** Types that a force carries (up to 32 bits); the others can be set but not forced. */
  forceable: boolean;
}

export interface FaceplateOutputRow {
  output: DeclaredOutput;
  value: boolean | number | null;
  forced: boolean;
}

const literal = (value: boolean): string => (value ? 'TRUE' : 'FALSE');

/** What a value reads as: the PLC literal of a BOOL, the number, or a dash for a value that has not been read. */
function valueText(value: boolean | number | null, t: Translator['t']): string {
  if (value === null) return t('faceplate.notRead');
  return typeof value === 'boolean' ? literal(value) : String(value);
}

function Value({ type, value, forced, t }: { type: string; value: boolean | number | null; forced: boolean; t: Translator['t'] }) {
  const tone: SignalTone = signalTone({ forced, type, value });
  return <SignalValue tone={tone}>{valueText(value, t)}</SignalValue>;
}

/**
 * A push button: TRUE while it is held, FALSE when it is released, by pointer or by Space and Enter. The pointer is captured
 * while it is down, so the release arrives wherever it ends and a layout change under it does not let go of the input.
 */
function HoldControl({ row, disabled, onHold }: { row: FaceplateInputRow; disabled: boolean; onHold: (down: boolean) => void }) {
  const { t } = useT();
  const [held, setHeld] = useState(false);
  const onHoldRef = useRef(onHold);
  useEffect(() => { onHoldRef.current = onHold; });
  const holdRef = useRef<ReturnType<typeof createHold> | null>(null);
  const change = (down: boolean) => {
    holdRef.current ??= createHold((now) => { setHeld(now); onHoldRef.current(now); });
    if (down) holdRef.current.press(); else holdRef.current.release();
  };
  // A button that is gone while held lets go of the input.
  useEffect(() => () => holdRef.current?.release(), []);
  const isHoldKey = (key: string) => key === ' ' || key === 'Enter';
  return (
    <Button
      variant="secondary" size="sm" disabled={disabled} aria-pressed={held}
      aria-label={t('faceplate.holdLabel', { name: row.input.name })}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); change(true); }}
      onPointerUp={() => change(false)} onPointerCancel={() => change(false)} onLostPointerCapture={() => change(false)}
      onBlur={() => change(false)}
      onKeyDown={(event) => { if (isHoldKey(event.key)) { event.preventDefault(); if (!event.repeat) change(true); } }}
      onKeyUp={(event) => { if (isHoldKey(event.key)) { event.preventDefault(); change(false); } }}
    >{t('faceplate.hold')}</Button>
  );
}

/** A number: a slider over the range of the type when the type is small, and always a box with Set, which takes a typed value. */
function NumberControl({ row, disabled, onSet }: { row: FaceplateInputRow; disabled: boolean; onSet: (value: number) => void }) {
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const [dragged, setDragged] = useState<number | null>(null);
  const range = inputRange(row.input);
  const submit = () => {
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onSet(parsed);
  };
  // The slider shows where it was dragged while the change is pending or just applied, and follows the runtime after that.
  const shown = row.phase !== 'idle' && dragged !== null ? dragged : (typeof row.value === 'number' ? row.value : 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {range && (
        <RangeField
          min={range.min} max={range.max} step={1} value={shown} disabled={disabled} className="w-28"
          aria-label={t('faceplate.sliderLabel', { name: row.input.name })}
          onChange={(event) => { const next = Number(event.target.value); setDragged(next); onSet(next); }}
        />
      )}
      <NumberField
        inputMode="decimal" value={draft} placeholder={row.value === null ? '' : String(row.value)} disabled={disabled}
        aria-label={t('faceplate.valueOf', { name: row.input.name })} className="w-24 tabular-nums"
        onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
      />
      <Button variant="ghost" size="sm" disabled={disabled || draft.trim() === ''} aria-label={t('faceplate.setName', { name: row.input.name })} onClick={submit}>{t('faceplate.set')}</Button>
    </span>
  );
}

function StateCell({ phase }: { phase: InputPhase }) {
  const { t } = useT();
  if (phase === 'idle') return null;
  return (
    <span data-input-phase={phase}>
      <span aria-hidden="true">{phase === 'pending' ? '…' : '✓'} </span>
      {phase === 'pending' ? t('faceplate.pending') : t('faceplate.applied')}
    </span>
  );
}

function InputRow({ row, disabled, onSet, onHold, onForce }: {
  row: FaceplateInputRow;
  disabled: boolean;
  onSet: (input: DeclaredInput, value: boolean | number) => void;
  onHold: (input: DeclaredInput, down: boolean) => void;
  onForce: (input: DeclaredInput, force: boolean) => void;
}) {
  const { t } = useT();
  const { input } = row;
  return (
    <tr data-input={input.path} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-200)]">
      <th scope="row" className="px-2 py-1 font-medium">{input.path}</th>
      <td className="px-2 py-1">{input.type}</td>
      <td className="px-2 py-1 tabular-nums">{inputAddressLabel(input)}</td>
      <td className="px-2 py-1 tabular-nums" data-input-value><Value type={input.type} value={row.value} forced={row.forced} t={t} /></td>
      <td className="px-2 py-1">
        {input.type === 'BOOL' ? (
          <span className="inline-flex items-center gap-1">
            <Button
              variant="secondary" size="sm" role="switch" aria-checked={row.value === true} disabled={disabled}
              aria-label={t('faceplate.switchLabel', { name: input.name, state: literal(row.value === true) })}
              onClick={() => onSet(input, row.value !== true)}
            >{row.value === true ? t('faceplate.setFalse') : t('faceplate.setTrue')}</Button>
            <HoldControl row={row} disabled={disabled} onHold={(down) => onHold(input, down)} />
          </span>
        ) : (
          <NumberControl row={row} disabled={disabled} onSet={(value) => onSet(input, value)} />
        )}
      </td>
      <td className="px-2 py-1"><StateCell phase={row.phase} /></td>
      <td className="px-2 py-1">
        <Checkbox label={t('faceplate.forceLabel', { name: input.name })} hideLabel checked={row.forced} disabled={disabled || !row.forceable || row.value === null} onChange={(event) => onForce(input, event.target.checked)} />
        {!row.forceable && <span className="ml-2 text-xs text-[var(--text-tertiary)]">{t('faceplate.notForceable')}</span>}
      </td>
    </tr>
  );
}

const TABLE_HEAD = 'border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]';
const TH = 'px-2 py-1 font-medium';

// `relative` keeps the visually hidden words of the values inside this section: positioned against the window they would
// lengthen the page whenever the panel is scrolled, and scrolling a control into view would then scroll the page.
export function Faceplate({ inputs, outputs, unavailable, message, onSet, onHold, onForce }: {
  inputs: readonly FaceplateInputRow[];
  outputs: readonly FaceplateOutputRow[];
  /** Why the inputs cannot be operated now, in words (no simulator, paused, not running, hardware); the controls are then disabled. */
  unavailable?: string;
  /** The outcome of the last action, shown in words (a refused value, a failed write). */
  message?: string;
  onSet: (input: DeclaredInput, value: boolean | number) => void;
  onHold: (input: DeclaredInput, down: boolean) => void;
  onForce: (input: DeclaredInput, force: boolean) => void;
}) {
  const { t } = useT();
  const disabled = unavailable !== undefined;
  const nothing = inputs.length === 0 && outputs.length === 0;
  return (
    <section aria-label={t('faceplate.title')} data-faceplate className="relative mb-3 border border-[var(--color-surface-700)] bg-[var(--color-surface-900)] p-2">
      <h3 className="text-xs font-medium text-[var(--color-surface-100)]">{t('faceplate.title')}</h3>
      <p className="mt-1 text-xs text-[var(--color-surface-400)]">{t('faceplate.intro')}</p>
      {unavailable && <p role="status" data-faceplate-reason className="mt-2 text-xs text-[var(--color-accent-yellow)]">{unavailable}</p>}
      {nothing ? null : (
        <>
          <h4 className="mt-2 text-xs font-medium text-[var(--color-surface-100)]">{t('faceplate.inputsHeading')}</h4>
          {inputs.length === 0 ? (
            <p role="status" className="mt-1 text-xs text-[var(--color-surface-300)]">{t('faceplate.noInputs')}</p>
          ) : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <caption className="sr-only">{t('faceplate.inputsCaption')}</caption>
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th scope="col" className={TH}>{t('faceplate.colInput')}</th><th scope="col" className={TH}>{t('faceplate.colType')}</th><th scope="col" className={TH}>{t('faceplate.colAddress')}</th>
                    <th scope="col" className={TH}>{t('faceplate.colValue')}</th><th scope="col" className={TH}>{t('faceplate.colSet')}</th><th scope="col" className={TH}>{t('faceplate.colState')}</th><th scope="col" className={TH}>{t('faceplate.colForce')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((row) => <InputRow key={row.input.path} row={row} disabled={disabled} onSet={onSet} onHold={onHold} onForce={onForce} />)}
                </tbody>
              </table>
            </div>
          )}
          <h4 className="mt-3 text-xs font-medium text-[var(--color-surface-100)]">{t('faceplate.outputsHeading')}</h4>
          {outputs.length === 0 ? (
            <p role="status" className="mt-1 text-xs text-[var(--color-surface-300)]">{t('faceplate.noOutputs')}</p>
          ) : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <caption className="sr-only">{t('faceplate.outputsCaption')}</caption>
                <thead className={TABLE_HEAD}>
                  <tr><th scope="col" className={TH}>{t('faceplate.colOutput')}</th><th scope="col" className={TH}>{t('faceplate.colType')}</th><th scope="col" className={TH}>{t('faceplate.colAddress')}</th><th scope="col" className={TH}>{t('faceplate.colValue')}</th></tr>
                </thead>
                <tbody>
                  {outputs.map((row) => (
                    <tr key={row.output.path} data-output={row.output.path} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-200)]">
                      <th scope="row" className="px-2 py-1 font-medium">{row.output.path}</th>
                      <td className="px-2 py-1">{row.output.type}</td>
                      <td className="px-2 py-1 tabular-nums">{outputAddressLabel(row.output)}</td>
                      <td className="px-2 py-1 tabular-nums" data-output-value><Value type={row.output.type} value={row.value} forced={row.forced} t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {message && <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-accent-yellow)]">{message}</p>}
    </section>
  );
}
