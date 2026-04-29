import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

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
    const colorClasses =
      color === 'secondary'
        ? 'accent-secondary-light dark:accent-secondary dark:checked:accent-secondary'
        : 'accent-primary';

    const focusClasses =
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

    const disabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50';

    const inputClassName =
      `h-4 w-4 dark:brightness-90 dark:checked:brightness-100 ${colorClasses} ${focusClasses} ${disabledClasses} ${className}`.trim();

    return (
      <label
        className={`flex items-center gap-2 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <input
          {...restProps}
          aria-label={hideLabel ? label : undefined}
          className={inputClassName}
          disabled={disabled}
          id={id}
          ref={ref}
          type="checkbox"
        />
        {hideLabel ? null : (
          <span className="text-foreground text-sm">{label}</span>
        )}
      </label>
    );
  }
);

FgCheckbox.displayName = 'FgCheckbox';

export default FgCheckbox;
