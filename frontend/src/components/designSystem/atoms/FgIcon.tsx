import type { IconType } from 'react-icons';

type FgIconProps = {
  readonly icon: IconType;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg';
  readonly color?:
    | 'primary'
    | 'secondary'
    | 'error'
    | 'success'
    | 'warning'
    | 'info';
  readonly className?: string;
  readonly label?: string;
};

const sizeClassMap = {
  xs: 'icon-xsmall',
  sm: 'icon-small',
  md: 'icon-default',
  lg: 'icon-large'
} as const;

const colorClassMap = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  error: 'text-error',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info'
} as const;

export default function FgIcon({
  icon: Icon,
  size = 'md',
  color,
  className,
  label
}: FgIconProps) {
  const sizeClass = sizeClassMap[size];
  const colorClass = color ? colorClassMap[color] : undefined;
  const combinedClassName = [sizeClass, colorClass, className]
    .filter(Boolean)
    .join(' ');

  if (label) {
    return (
      <span aria-label={label} role="img">
        <Icon className={combinedClassName} />
      </span>
    );
  }

  return (
    <span aria-hidden="true">
      <Icon className={combinedClassName} />
    </span>
  );
}
