/**
 * Buttons of the kit (UX-001). A `Button` has visible text; an `IconButton` has only an icon, so its accessible name is
 * required by its type and is also what its tooltip shows (UX-026). Both default to `type="button"`, so a button inside
 * a form never submits by accident.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the text. It is hidden from assistive technology: the text names the button. */
  icon?: ReactNode;
  /** Shown as a tooltip; for a hint a name does not already give. */
  tooltip?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, tooltip, className, children, type = 'button', ...rest }, ref,
) {
  const button = (
    <button ref={ref} type={type} className={cx('ui-button', className)} data-variant={variant} data-size={size} {...rest}>
      {icon !== undefined && <span className="ui-button-icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
  return tooltip === undefined ? button : <Tooltip content={tooltip}>{button}</Tooltip>;
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label' | 'children'> {
  /** The accessible name and, unless `tooltip` says more, the tooltip. Required: an icon alone names nothing. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A longer tooltip than the name, for example the name and its shortcut. */
  tooltip?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', tooltip, className, type = 'button', ...rest }, ref,
) {
  return (
    <Tooltip content={tooltip ?? label} describes={tooltip !== undefined}>
      <button ref={ref} type={type} aria-label={label} className={cx('ui-button ui-icon-button', className)} data-variant={variant} data-size={size} {...rest}>
        <span aria-hidden="true" className="ui-button-icon">{icon}</span>
      </button>
    </Tooltip>
  );
});
