import type { ReactNode } from 'react';

type FgFieldSetProps = {
  readonly legend: string;
  readonly inline?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

function FgFieldSet({ legend, inline, className, children }: FgFieldSetProps) {
  return (
    <fieldset className={`border-none p-0 m-0 ${className ?? ''}`.trim()}>
      <legend className="font-sans antialiased text-foreground text-sm font-semibold mb-1">
        {legend}
      </legend>
      {inline ? (
        <div className="flex items-center gap-4">{children}</div>
      ) : (
        children
      )}
    </fieldset>
  );
}

FgFieldSet.displayName = 'FgFieldSet';

export default FgFieldSet;
