import { useId } from 'react';
import type { ReactNode } from 'react';

import { Typography } from '@material-tailwind/react';

type FgFieldSetProps = {
  readonly legend: string;
  readonly helperText?: string;
  readonly inline?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

function FgFieldSet({
  legend,
  helperText,
  inline,
  className,
  children
}: FgFieldSetProps) {
  const helperId = useId();
  return (
    <fieldset
      aria-describedby={helperText ? helperId : undefined}
      className={`flex flex-col gap-2 border-none p-0 m-0 ${className ?? ''}`.trim()}
    >
      <legend className="font-sans antialiased text-foreground text-sm font-semibold mb-2">
        {legend}
      </legend>
      {helperText ? (
        <Typography
          className="block text-foreground"
          id={helperId}
          type="small"
        >
          {helperText}
        </Typography>
      ) : null}
      {inline ? (
        <div className="flex items-center gap-4">{children}</div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </fieldset>
  );
}

FgFieldSet.displayName = 'FgFieldSet';

export default FgFieldSet;
