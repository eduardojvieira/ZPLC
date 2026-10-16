/**
 * The label association of a form control (UX-026). A `Field` provides the ids of its label, hint and error; the control
 * inside reads them, so the label is programmatically associated (`for`/`id`), the hint and the error describe the
 * control (`aria-describedby`), and an error marks it invalid, without any caller wiring ids by hand.
 */
import { createContext, useContext } from 'react';

export interface FieldState {
  id: string;
  hintId?: string;
  errorId?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}

export const FieldContext = createContext<FieldState | null>(null);

export interface ControlOwnProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'aria-required'?: boolean | 'true' | 'false';
  required?: boolean;
  disabled?: boolean;
}

/** The ids and states of the control, from the field that wraps it and the props the caller gave it. */
export function useFieldControl(own: ControlOwnProps): ControlOwnProps {
  const field = useContext(FieldContext);
  if (!field) return own;
  const describedBy = [own['aria-describedby'], field.hintId, field.errorId].filter(Boolean).join(' ');
  return {
    id: own.id ?? field.id,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': own['aria-invalid'] ?? (field.invalid ? true : undefined),
    'aria-required': own['aria-required'] ?? (field.required ? true : undefined),
    required: own.required,
    disabled: own.disabled ?? field.disabled,
  };
}
