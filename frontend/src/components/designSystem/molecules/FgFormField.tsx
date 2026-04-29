import { cloneElement, isValidElement, useId } from 'react';
import type { ReactNode, ReactElement } from 'react';

import { Typography } from '@material-tailwind/react';

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

  const enhancedChildren = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: fieldId,
        error: error ? true : undefined,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy
      })
    : children;

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
      {enhancedChildren}
      <div className="min-h-[1.5rem]">
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
