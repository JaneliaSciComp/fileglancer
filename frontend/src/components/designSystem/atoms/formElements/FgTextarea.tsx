import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import {
  INPUT_BASE_CLASSES,
  INPUT_DEFAULT_BORDER,
  INPUT_FOCUS_CLASSES,
  INPUT_ERROR_CLASSES,
  INPUT_DISABLED_CLASSES
} from '@/components/designSystem/atoms/formElements/formStyles';

type FgTextareaOwnProps = {
  readonly error?: boolean;
  readonly className?: string;
};

type FgTextareaProps = FgTextareaOwnProps &
  Omit<ComponentPropsWithoutRef<'textarea'>, keyof FgTextareaOwnProps>;

const FgTextarea = forwardRef<HTMLTextAreaElement, FgTextareaProps>(
  ({ error = false, className = '', ...restProps }, ref) => {
    const borderClass = error ? INPUT_ERROR_CLASSES : INPUT_DEFAULT_BORDER;

    const combinedClassName =
      `${INPUT_BASE_CLASSES} ${INPUT_FOCUS_CLASSES} ${INPUT_DISABLED_CLASSES} ${borderClass} ${className}`.trim();

    return <textarea className={combinedClassName} ref={ref} {...restProps} />;
  }
);

FgTextarea.displayName = 'FgTextarea';

export default FgTextarea;
