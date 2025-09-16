// Help page
import { Link } from 'react-router';
import { ReactNode } from 'react';

type StyledLinkProps = {
  readonly to: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly target?: string;
  readonly rel?: string;
  readonly textSize?: 'default' | 'large' | 'small';
};

export const FgStyledLink = ({
  to,
  children,
  className = '',
  target,
  rel,
  textSize = 'default'
}: StyledLinkProps) => {
  const baseClasses = 'text-primary-light hover:underline focus:underline';
  const textClasses = {
    default: 'text-base',
    large: 'text-lg',
    small: 'text-sm'
  };

  return (
    <Link
      className={`${baseClasses} ${textClasses[textSize]} ${className}`}
      rel={rel}
      target={target}
      to={to}
    >
      {children}
    </Link>
  );
};
