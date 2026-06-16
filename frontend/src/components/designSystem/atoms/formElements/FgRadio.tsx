import { forwardRef, useId } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

type FgRadioOwnProps = {
  readonly label: string;
  readonly id?: string;
  readonly hideLabel?: boolean;
  readonly color?: 'primary' | 'secondary';
  readonly className?: string;
};

type FgRadioProps = FgRadioOwnProps &
  Omit<ComponentPropsWithoutRef<'input'>, keyof FgRadioOwnProps | 'type'>;

const FgRadio = forwardRef<HTMLInputElement, FgRadioProps>(
  (
    {
      label,
      id,
      hideLabel = false,
      color = 'secondary',
      className = '',
      disabled,
      ...restProps
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const colorClasses =
      color === 'primary'
        ? 'accent-primary'
        : 'accent-secondary-light dark:accent-secondary-dark';

    const focusClasses = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${color === 'primary' ? 'focus-visible:outline-primary' : 'focus-visible:outline-secondary'}`;

    const disabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50 ';

    const inputClassName =
      `icon-small dark:brightness-90 dark:checked:brightness-100 ${colorClasses} ${focusClasses} ${disabledClasses} ${className}`.trim();

    return (
      <div className="flex items-center gap-2">
        <input
          {...restProps}
          aria-label={hideLabel ? label : undefined}
          className={inputClassName}
          disabled={disabled}
          id={inputId}
          ref={ref}
          type="radio"
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

FgRadio.displayName = 'FgRadio';

export default FgRadio;
