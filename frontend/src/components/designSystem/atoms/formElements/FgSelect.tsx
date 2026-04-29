import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import {
  INPUT_BASE_CLASSES,
  INPUT_DEFAULT_BORDER,
  INPUT_FOCUS_CLASSES,
  INPUT_ERROR_CLASSES,
  INPUT_DISABLED_CLASSES
} from '@/components/designSystem/atoms/formElements/formStyles';

type FgSelectOwnProps = {
  readonly error?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

type FgSelectProps = FgSelectOwnProps &
  Omit<ComponentPropsWithoutRef<'select'>, keyof FgSelectOwnProps>;

const FgSelect = forwardRef<HTMLSelectElement, FgSelectProps>(
  ({ error = false, className = '', children, ...restProps }, ref) => {
    const borderClass = error ? INPUT_ERROR_CLASSES : INPUT_DEFAULT_BORDER;

    const combinedClassName =
      `${INPUT_BASE_CLASSES} ${INPUT_FOCUS_CLASSES} ${INPUT_DISABLED_CLASSES} ${borderClass} ${className}`.trim();

    return (
      <select className={combinedClassName} ref={ref} {...restProps}>
        {children}
      </select>
    );
  }
);

FgSelect.displayName = 'FgSelect';

export default FgSelect;
