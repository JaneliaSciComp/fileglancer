import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';

import { Typography } from '@material-tailwind/react';

type FgFormFieldContextValue = {
  readonly id: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly error: boolean;
};

const FgFormFieldContext = createContext<FgFormFieldContextValue | null>(null);

export function useFgFormFieldContext(): FgFormFieldContextValue | null {
  return useContext(FgFormFieldContext);
}

type FgFormFieldProps = {
  readonly label: string;
  readonly htmlFor?: string;
  readonly optional?: boolean;
  readonly error?: string;
  readonly helperText?: string;
  readonly children: ReactNode;
  readonly className?: string;
};

function FgFormField({
  label,
  htmlFor,
  optional,
  error,
  helperText,
  children,
  className
}: FgFormFieldProps) {
  const generatedId = useId();
  const fieldId = htmlFor ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const describedBy =
    [helperId, errorId].filter(Boolean).join(' ') || undefined;

  const contextValue: FgFormFieldContextValue = {
    id: fieldId,
    describedBy,
    invalid: Boolean(error),
    error: Boolean(error)
  };

  return (
    <div className={className}>
      <label
        className="block font-sans antialiased text-foreground text-sm font-semibold mb-1"
        htmlFor={fieldId}
      >
        {label}
        {optional ? (
          <span className="text-foreground font-normal ml-1">(optional)</span>
        ) : null}
      </label>
      {helperText ? (
        <Typography
          className="block text-foreground mb-1"
          id={helperId}
          type="small"
        >
          {helperText}
        </Typography>
      ) : null}
      <FgFormFieldContext.Provider value={contextValue}>
        {children}
      </FgFormFieldContext.Provider>
      <div aria-live="polite" className="min-h-[1.5rem]">
        {error ? (
          <Typography className="text-error" id={errorId} type="small">
            {error}
          </Typography>
        ) : null}
      </div>
    </div>
  );
}

FgFormField.displayName = 'FgFormField';

export default FgFormField;
