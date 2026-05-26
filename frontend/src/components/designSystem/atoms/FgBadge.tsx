import type { ReactNode } from 'react';

type FgBadgeProps = {
  readonly children: ReactNode;
  readonly variant?: 'default' | 'pill';
  readonly color?:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'error'
    | 'warning'
    | 'info'
    | 'neutral';
  readonly dot?: boolean;
  readonly dotColor?: string;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
};

const COLOR_STYLES = {
  primary: { bg: 'bg-primary/20', text: 'text-primary', dot: 'bg-primary' },
  secondary: {
    bg: 'bg-secondary/20',
    text: 'text-secondary',
    dot: 'bg-secondary'
  },
  success: { bg: 'bg-success/20', text: 'text-success', dot: 'bg-success' },
  error: { bg: 'bg-error/20', text: 'text-error', dot: 'bg-error' },
  warning: { bg: 'bg-warning/20', text: 'text-warning', dot: 'bg-warning' },
  info: { bg: 'bg-info/20', text: 'text-info', dot: 'bg-info' },
  neutral: { bg: 'bg-surface', text: 'text-foreground', dot: 'bg-foreground' }
};

const VARIANT_STYLES = {
  default: 'rounded-md font-bold',
  pill: 'rounded-full font-medium'
};

const SIZE_STYLES = {
  sm: 'text-xs',
  md: 'text-sm'
};

export default function FgBadge({
  children,
  variant = 'default',
  color = 'primary',
  dot = false,
  dotColor,
  size = 'sm',
  className = ''
}: FgBadgeProps) {
  const colorStyle = COLOR_STYLES[color];
  const resolvedDotColor = dotColor ?? colorStyle.dot;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${colorStyle.bg} ${colorStyle.text} ${className}`.trim()}
    >
      {dot ? (
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${resolvedDotColor} opacity-75`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${resolvedDotColor}`}
          />
        </span>
      ) : null}
      {children}
    </span>
  );
}
