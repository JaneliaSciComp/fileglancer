import { Typography } from '@material-tailwind/react';

export type Option = {
  checked: boolean;
  id: string;
  label: string;
  onChange: () => Promise<void> | void;
};

type OptionsSectionProps = {
  readonly header?: string;
  readonly options: readonly Option[];
  readonly checkboxesOnly?: boolean;
};

export default function OptionsSection({
  header,
  options,
  checkboxesOnly = false
}: OptionsSectionProps) {
  return (
    <>
      {!checkboxesOnly && header ? (
        <Typography className="font-semibold">{header}</Typography>
      ) : null}

      {options.map(option => (
        <div
          className={
            checkboxesOnly
              ? 'flex items-center gap-2'
              : 'flex items-center gap-2 pl-4'
          }
          key={option.id}
        >
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
