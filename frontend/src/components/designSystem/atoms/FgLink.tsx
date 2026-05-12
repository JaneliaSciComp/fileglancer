import { Link } from 'react-router';
import type { ReactNode, MouseEvent } from 'react';

type FgLinkProps = {
  readonly to: string;
  readonly children: ReactNode;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly target?: string;
  readonly rel?: string;
  readonly onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

const SIZE_CLASSES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
} as const;

const BASE_CLASSES =
  'text-primary-dark hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary';

export default function FgLink({
  to,
  children,
  size = 'md',
  className,
  target,
  rel,
  onClick
}: FgLinkProps) {
  const combinedClassName = [BASE_CLASSES, SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <Link
      className={combinedClassName}
      onClick={onClick}
      rel={rel}
      target={target}
      to={to}
    >
      {children}
    </Link>
  );
}
