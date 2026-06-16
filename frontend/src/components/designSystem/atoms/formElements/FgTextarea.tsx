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

type FgTextareaOwnProps = {
  readonly error?: boolean;
  readonly className?: string;
};

type FgTextareaProps = FgTextareaOwnProps &
  Omit<ComponentPropsWithoutRef<'textarea'>, keyof FgTextareaOwnProps>;

const FgTextarea = forwardRef<HTMLTextAreaElement, FgTextareaProps>(
  (
    {
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
      `${INPUT_BASE_CLASSES} ${INPUT_FOCUS_CLASSES} ${INPUT_DISABLED_CLASSES} ${borderClass} ${className}`.trim();

    return (
      <textarea
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

FgTextarea.displayName = 'FgTextarea';

export default FgTextarea;
