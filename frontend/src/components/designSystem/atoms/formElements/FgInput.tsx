import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import {
  INPUT_BASE_CLASSES,
  INPUT_DEFAULT_BORDER,
  INPUT_FOCUS_CLASSES,
  INPUT_ERROR_CLASSES,
  INPUT_DISABLED_CLASSES
} from '@/components/designSystem/atoms/formElements/formStyles';

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
  ({ size = 'md', error = false, className = '', ...restProps }, ref) => {
    const borderClass = error ? INPUT_ERROR_CLASSES : INPUT_DEFAULT_BORDER;

    const combinedClassName =
      `${INPUT_BASE_CLASSES} ${SIZE_CLASSES[size]} ${INPUT_FOCUS_CLASSES} ${INPUT_DISABLED_CLASSES} ${borderClass} ${className}`.trim();

    return <input className={combinedClassName} ref={ref} {...restProps} />;
  }
);

FgInput.displayName = 'FgInput';

export default FgInput;
