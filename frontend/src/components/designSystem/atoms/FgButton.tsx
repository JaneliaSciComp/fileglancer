import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { Button } from '@material-tailwind/react';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import { Spinner } from '@/components/ui/widgets/Loaders';

type FgButtonOwnProps = {
  readonly children: ReactNode;
  readonly variant?: 'solid' | 'outline' | 'ghost' | 'link';
  readonly color?:
    | 'primary'
    | 'secondary'
    | 'error'
    | 'success'
    | 'warning'
    | 'info';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly loading?: boolean;
  readonly loadingText?: string;
  readonly icon?: IconType;
  readonly iconPosition?: 'left' | 'right';
  readonly href?: string;
  readonly target?: string;
  readonly rel?: string;
};

type FgButtonProps = FgButtonOwnProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof FgButtonOwnProps>;

const FgButton = forwardRef<HTMLButtonElement, FgButtonProps>(
  (
    {
      children,
      variant = 'solid',
      color,
      size = 'md',
      disabled = false,
      loading = false,
      loadingText,
      icon,
      iconPosition = 'left',
      className = '',
      type = 'button',
      href,
      target,
      rel,
      onClick,
      ...restProps
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const focusClasses =
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
    const loadingClasses = loading ? 'cursor-not-allowed' : '';
    const combinedClassName =
      `${focusClasses} ${loadingClasses} ${className}`.trim();

    const iconElement = icon ? <FgIcon icon={icon} size="sm" /> : null;

    // Keep the label in normal flow so the button's size and vertical centering
    // are unchanged by the loading state. While loading, the label is hidden in
    // place (preserving the button's footprint) and a spinner is overlaid.
    const content = (
      <span className="relative inline-flex items-center justify-center">
        <span
          className={`inline-flex items-center gap-2 ${loading ? 'invisible' : ''}`}
        >
          {iconPosition === 'left' ? iconElement : null}
          {children}
          {iconPosition === 'right' ? iconElement : null}
        </span>
        {loading ? (
          <span
            aria-label={loadingText ?? 'Loading'}
            className="absolute inset-0 flex items-center justify-center"
            role="status"
          >
            <Spinner
              customClasses="border-current border-t-transparent"
              sizeClasses="w-4 h-4 border-2"
            />
          </span>
        ) : null}
      </span>
    );

    // Link variant: renders a plain <button> styled as a text link.
    // Use for inline actions that should look like links but behave as buttons.
    if (variant === 'link') {
      const linkSizeClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg'
      } as const;
      const linkClassName =
        `inline-flex items-center gap-1 text-primary-dark hover:underline ${focusClasses} ${linkSizeClasses[size]} ${loadingClasses} ${isDisabled ? 'opacity-50 pointer-events-none' : ''} ${className}`.trim();

      return (
        <button
          {...restProps}
          className={linkClassName}
          disabled={isDisabled}
          onClick={onClick}
          ref={ref}
          type={
            type === 'submit' ? 'submit' : type === 'reset' ? 'reset' : 'button'
          }
        >
          {content}
        </button>
      );
    }

    // Anchor variant: renders a Material Tailwind Button as an <a> element.
    // Use for navigation to external URLs that should look like a button.
    if (href) {
      // restProps event handlers are typed for HTMLButtonElement; extract only
      // the data-/aria- attributes that are safe to forward onto an anchor.
      const dataAndAriaProps = Object.fromEntries(
        Object.entries(restProps).filter(
          ([key]) => key.startsWith('data-') || key.startsWith('aria-')
        )
      );

      return (
        <Button
          {...dataAndAriaProps}
          aria-disabled={isDisabled || undefined}
          as="a"
          className={`${combinedClassName} ${isDisabled ? 'pointer-events-none opacity-50' : ''}`.trim()}
          color={color}
          href={isDisabled ? undefined : href}
          onClick={
            onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined
          }
          ref={ref as React.Ref<HTMLAnchorElement>}
          rel={rel}
          size={size}
          target={target}
          variant={variant}
        >
          {content}
        </Button>
      );
    }

    // Default variant: renders a Material Tailwind Button as a <button> element.
    // Supports solid, outline, and ghost variants.
    return (
      <Button
        {...restProps}
        className={combinedClassName}
        color={color}
        disabled={isDisabled}
        onClick={onClick}
        ref={ref}
        size={size}
        type={
          type === 'submit' ? 'submit' : type === 'reset' ? 'reset' : 'button'
        }
        variant={variant}
      >
        {content}
      </Button>
    );
  }
);

FgButton.displayName = 'FgButton';

export default FgButton;
