/**
 * Form controls of the kit (UX-001, UX-026): a `Field` that associates a visible label, a hint and an error with the
 * control inside it, and the text, number, text-area, select, checkbox and switch controls. Each one is a native element
 * (keyboard operable and announced by the platform) with the kit's styling. A control is given a `label`, which wraps
 * it in a `Field`, or is placed inside a `Field`, or carries an `aria-label`: there is no fourth way, and the kit guard
 * (tools/ci/ui-kit-guard.ts) fails on one.
 */
import { useId, type ComponentProps, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { FieldContext, useFieldControl } from './fieldContext';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown under the control and announced; it also marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** `inline` puts the label beside the control, for a short field in a row. */
  layout?: 'stacked' | 'inline';
  /** The id of the control, when the caller must know it (a test or a skip link); generated otherwise. */
  controlId?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, disabled, layout = 'stacked', controlId, className, children }: FieldProps) {
  const generated = useId();
  const id = controlId ?? generated;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const hasError = error !== undefined && error !== null && error !== false;
  const state = { id, hintId: hasHint ? `${id}-hint` : undefined, errorId: hasError ? `${id}-error` : undefined, required, invalid: hasError, disabled };
  return (
    <FieldContext.Provider value={state}>
      <div className={cx('ui-field', className)} data-layout={layout}>
        <label htmlFor={id} className="ui-label">
          {label}
          {required && <span aria-hidden="true" className="ui-required"> *</span>}
        </label>
        {children}
        {hasHint && <p id={state.hintId} className="ui-hint">{hint}</p>}
        {hasError && <p id={state.errorId} className="ui-error" role="alert">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}

interface Labelled { label?: ReactNode; hint?: ReactNode; error?: ReactNode; layout?: 'stacked' | 'inline'; fieldClassName?: string }

/** Wraps the control in a Field when it was given a label; otherwise it is the caller's to name (aria-label or a Field). */
function withField(control: ReactNode, { label, hint, error, layout, fieldClassName }: Labelled, required: boolean | undefined, disabled: boolean | undefined, controlId: string | undefined): ReactNode {
  if (label === undefined) return control;
  return <Field label={label} hint={hint} error={error} required={required} disabled={disabled} layout={layout} controlId={controlId} className={fieldClassName}>{control}</Field>;
}

// The controls read the ids of the Field they sit in, so they are separate components rendered inside its provider.
function InputControl({ className, type, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} {...useFieldControl(rest)} type={type} className={className} />;
}

function AreaControl({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} {...useFieldControl(rest)} className={className} />;
}

function SelectControl({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} {...useFieldControl(rest)} className={className}>{children}</select>;
}

/** The native props, `ref` included (React 19 passes it as a prop), and the label shorthand. */
export type TextFieldProps = ComponentProps<'input'> & Labelled;

export function TextField({ label, hint, error, layout, fieldClassName, className, type = 'text', ...rest }: TextFieldProps) {
  return <>{withField(<InputControl {...rest} type={type} className={cx('ui-input', className)} />, { label, hint, error, layout, fieldClassName }, rest.required, rest.disabled, rest.id)}</>;
}

export type NumberFieldProps = Omit<ComponentProps<'input'>, 'type'> & Labelled;

/** A native number input: the keyboard (arrows, typing) and the spin buttons are the platform's; values are tabular. */
export function NumberField({ label, hint, error, layout, fieldClassName, className, ...rest }: NumberFieldProps) {
  return <>{withField(<InputControl {...rest} type="number" inputMode="decimal" className={cx('ui-input ui-tabular', className)} />, { label, hint, error, layout, fieldClassName }, rest.required, rest.disabled, rest.id)}</>;
}

export type RangeFieldProps = Omit<ComponentProps<'input'>, 'type'> & Labelled;

/** A native slider: the arrows, Home, End and Page keys and the announcement of the value are the platform's. */
export function RangeField({ label, hint, error, layout, fieldClassName, className, ...rest }: RangeFieldProps) {
  return <>{withField(<InputControl {...rest} type="range" className={cx('ui-range', className)} />, { label, hint, error, layout, fieldClassName }, rest.required, rest.disabled, rest.id)}</>;
}

export interface FileInputProps extends Omit<ComponentProps<'input'>, 'type' | 'children' | 'aria-label'> {
  /** Names what the file is for. The input itself is not drawn: a button opens it with `ref.current.click()`. */
  label: string;
}

/** A file chooser that a visible button opens. It is `hidden`, so it takes no place in the tab order; the button is the control. */
export function FileInput({ label, ...rest }: FileInputProps) {
  return <input {...rest} type="file" hidden aria-label={label} />;
}

export type TextareaProps = ComponentProps<'textarea'> & Labelled;

export function Textarea({ label, hint, error, layout, fieldClassName, className, ...rest }: TextareaProps) {
  return <>{withField(<AreaControl {...rest} className={cx('ui-input ui-textarea', className)} />, { label, hint, error, layout, fieldClassName }, rest.required, rest.disabled, rest.id)}</>;
}

export type SelectProps = ComponentProps<'select'> & Labelled;

/** A native select, so the list, the keyboard and the announcement are the platform's. Its options are `<option>` children. */
export function Select({ label, hint, error, layout, fieldClassName, className, children, ...rest }: SelectProps) {
  return <>{withField(<SelectControl {...rest} className={cx('ui-input ui-select', className)}>{children}</SelectControl>, { label, hint, error, layout, fieldClassName }, rest.required, rest.disabled, rest.id)}</>;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  /** The label: it wraps the box, so clicking it toggles, and it is the accessible name. */
  label: ReactNode;
  /** Keeps the label for assistive technology only, for a box in a table cell whose column already says what it is. */
  hideLabel?: boolean;
  hint?: ReactNode;
}

export function Checkbox({ label, hideLabel = false, hint, className, ...rest }: CheckboxProps) {
  const hintId = useId();
  const describedBy = [rest['aria-describedby'], hint === undefined ? undefined : hintId].filter(Boolean).join(' ') || undefined;
  return (
    <label className={cx('ui-check', className)}>
      <input {...rest} aria-describedby={describedBy} type="checkbox" className="ui-check-box" />
      <span className={cx('ui-check-label', hideLabel && 'ui-visually-hidden')}>{label}</span>
      {hint !== undefined && <span id={hintId} className="ui-hint">{hint}</span>}
    </label>
  );
}

/** An on/off setting that takes effect at once. A native checkbox with the switch role, so Space toggles it. */
export function Switch({ label, hideLabel = false, hint, className, ...rest }: CheckboxProps) {
  const hintId = useId();
  const describedBy = [rest['aria-describedby'], hint === undefined ? undefined : hintId].filter(Boolean).join(' ') || undefined;
  return (
    <label className={cx('ui-check ui-switch', className)}>
      <input {...rest} aria-describedby={describedBy} type="checkbox" role="switch" className="ui-switch-box" />
      <span className={cx('ui-check-label', hideLabel && 'ui-visually-hidden')}>{label}</span>
      {hint !== undefined && <span id={hintId} className="ui-hint">{hint}</span>}
    </label>
  );
}
