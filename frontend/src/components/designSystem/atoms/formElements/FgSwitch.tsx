import { forwardRef, useId } from 'react';
import { Switch } from '@material-tailwind/react';

type FgSwitchProps = {
  readonly label: string;
  readonly id?: string;
  readonly checked: boolean;
  readonly onChange: () => void | Promise<void>;
  readonly disabled?: boolean;
  readonly showState?: boolean;
  readonly className?: string;
};

const switchClassName =
  'before:bg-primary/50 after:border-primary/50 disabled:before:bg-surface disabled:before:border disabled:before:border-surface-dark disabled:after:border-surface-dark dark:disabled:before:bg-surface-light dark:disabled:before:opacity-50 dark:disabled:before:border-surface-light dark:disabled:after:border-surface-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const FgSwitch = forwardRef<HTMLDivElement, FgSwitchProps>(
  (
    {
      label,
      id,
      checked,
      onChange,
      disabled = false,
      showState = false,
      className = ''
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const combinedSwitchClassName = `${switchClassName} ${className}`.trim();

    const stateText = checked ? 'On' : 'Off';

    return (
      <div className="flex items-center justify-between gap-2" ref={ref}>
        <div>
          <label
            className={`text-foreground text-sm block ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
            htmlFor={inputId}
          >
            {label}
          </label>
          {showState ? (
            <span className="block font-semibold text-base text-foreground sm:hidden">
              {stateText}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={checked}
            className={combinedSwitchClassName}
            disabled={disabled}
            id={inputId}
            onChange={onChange}
          />
          {showState ? (
            <span className="hidden font-semibold text-sm text-foreground sm:inline">
              {stateText}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
);

FgSwitch.displayName = 'FgSwitch';

export default FgSwitch;
