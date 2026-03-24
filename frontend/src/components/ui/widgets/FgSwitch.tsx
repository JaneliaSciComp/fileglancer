import { Switch, Typography } from '@material-tailwind/react';

interface FgSwitchProps {
  readonly checked: boolean;
  readonly onChange: () => void | Promise<void>;
  readonly label: string;
  readonly id: string;
  readonly disabled?: boolean;
}

export default function FgSwitch({
  checked,
  onChange,
  label,
  id,
  disabled = false
}: FgSwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        className="before:bg-primary/50 after:border-primary/50 checked:disabled:before:bg-surface checked:disabled:before:border checked:disabled:before:border-surface-dark checked:disabled:after:border-surface-dark"
        disabled={disabled}
        id={id}
        onChange={onChange}
      />
      <Typography
        as="label"
        className={`${disabled ? 'cursor-default' : 'cursor-pointer'} text-foreground font-semibold text-sm`}
        htmlFor={id}
      >
        {label}
      </Typography>
    </div>
  );
}
