import { forwardRef, useId } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import { FORM_CONTROL_FOCUS_CLASSES } from '@/components/designSystem/atoms/formElements/formStyles';

type FgCheckboxOwnProps = {
  readonly label: string;
  readonly id?: string;
  readonly hideLabel?: boolean;
  readonly color?: 'primary' | 'secondary';
  readonly className?: string;
};

type FgCheckboxProps = FgCheckboxOwnProps &
  Omit<ComponentPropsWithoutRef<'input'>, keyof FgCheckboxOwnProps | 'type'>;

const FgCheckbox = forwardRef<HTMLInputElement, FgCheckboxProps>(
  (
    {
      label,
      id,
      hideLabel = false,
      color = 'primary',
      className = '',
      disabled,
      ...restProps
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const colorClasses =
      color === 'secondary'
        ? 'accent-secondary-light dark:accent-secondary dark:checked:accent-secondary'
        : 'accent-primary';

    const disabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50';

    const inputClassName =
      `h-4 w-4 dark:brightness-90 dark:checked:brightness-100 ${colorClasses} ${FORM_CONTROL_FOCUS_CLASSES} ${disabledClasses} ${className}`.trim();

    return (
      <div className="flex items-center gap-2">
        <input
          {...restProps}
          aria-label={hideLabel ? label : undefined}
          className={inputClassName}
          disabled={disabled}
          id={inputId}
          ref={ref}
          type="checkbox"
        />
        {hideLabel ? null : (
          <label
            className={`text-foreground text-sm ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
            htmlFor={inputId}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

FgCheckbox.displayName = 'FgCheckbox';

export default FgCheckbox;
