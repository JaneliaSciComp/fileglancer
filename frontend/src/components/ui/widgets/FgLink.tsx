import { Link } from 'react-router';
import type { ReactNode, MouseEvent } from 'react';

type StyledLinkProps = {
  readonly to: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly target?: string;
  readonly rel?: string;
  readonly textSize?: 'default' | 'large' | 'small';
  readonly onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export function FgStyledLink({
  to,
  children,
  className = '',
  target,
  rel,
  textSize = 'default',
  onClick
}: StyledLinkProps) {
  const baseClasses = 'text-primary-light hover:underline focus:underline';
  const textClasses = {
    default: 'text-base',
    large: 'text-lg',
    small: 'text-sm'
  };

  return (
    <Link
      className={`${baseClasses} ${textClasses[textSize]} ${className}`}
      onClick={onClick}
      rel={rel}
      target={target}
      to={to}
    >
      {children}
    </Link>
  );
}
