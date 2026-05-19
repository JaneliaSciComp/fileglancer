import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import {
  INPUT_BASE_CLASSES,
  INPUT_DEFAULT_BORDER,
  INPUT_FOCUS_CLASSES,
  INPUT_ERROR_CLASSES,
  INPUT_DISABLED_CLASSES
} from '@/components/designSystem/atoms/formElements/formStyles';
import { useFgFormFieldContext } from '@/components/designSystem/molecules/FgFormField';

type FgInputOwnProps = {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly error?: boolean;
  readonly className?: string;
};

type FgInputProps = FgInputOwnProps &
  Omit<ComponentPropsWithoutRef<'input'>, keyof FgInputOwnProps>;

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
} as const;

const FgInput = forwardRef<HTMLInputElement, FgInputProps>(
  (
    {
      size = 'md',
      error,
      className = '',
      id,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...restProps
    },
    ref
  ) => {
    const formField = useFgFormFieldContext();
    const resolvedId = id ?? formField?.id;
    const resolvedDescribedBy = ariaDescribedBy ?? formField?.describedBy;
    const resolvedInvalid = ariaInvalid ?? formField?.invalid;
    const resolvedError = error ?? formField?.error ?? false;

    const borderClass = resolvedError
      ? INPUT_ERROR_CLASSES
      : INPUT_DEFAULT_BORDER;

    const combinedClassName =
      `${INPUT_BASE_CLASSES} ${SIZE_CLASSES[size]} ${INPUT_FOCUS_CLASSES} ${INPUT_DISABLED_CLASSES} ${borderClass} ${className}`.trim();

    return (
      <input
        aria-describedby={resolvedDescribedBy}
        aria-invalid={resolvedInvalid}
        className={combinedClassName}
        id={resolvedId}
        ref={ref}
        {...restProps}
      />
    );
  }
);

FgInput.displayName = 'FgInput';

export default FgInput;
