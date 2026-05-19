import type { ReactNode } from 'react';

type FgFieldSetProps = {
  readonly legend: string;
  readonly inline?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

function FgFieldSet({ legend, inline, className, children }: FgFieldSetProps) {
  return (
    <fieldset
      className={`flex flex-col gap-2 border-none p-0 m-0 ${className ?? ''}`.trim()}
    >
      <legend className="font-sans antialiased text-foreground text-sm font-semibold mb-2">
        {legend}
      </legend>
      {inline ? (
        <div className="flex items-center gap-4">{children}</div>
      ) : (
        <div className="pl-4 flex flex-col gap-2">{children}</div>
      )}
    </fieldset>
  );
}

FgFieldSet.displayName = 'FgFieldSet';

export default FgFieldSet;
