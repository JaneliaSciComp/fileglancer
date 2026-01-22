import { Typography } from '@material-tailwind/react';

export interface Option {
  checked: boolean;
  id: string;
  label: string;
  onChange: () => Promise<void> | void;
}

interface OptionsSectionProps {
  readonly header: string;
  readonly options: readonly Option[];
}

export default function OptionsSection({
  header,
  options
}: OptionsSectionProps) {
  return (
    <>
      <Typography className="font-semibold">{header}</Typography>

      {options.map(option => (
        <div className="flex items-center gap-2 pl-4" key={option.id}>
          <input
            checked={option.checked}
            className="icon-small checked:accent-secondary-light"
            id={option.id}
            onChange={option.onChange}
            type="checkbox"
          />
          <Typography
            as="label"
            className="text-foreground"
            htmlFor={option.id}
          >
            {option.label}
          </Typography>
        </div>
      ))}
    </>
  );
}
