import type { ReactNode } from 'react';
import { HiExternalLink } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';

type FgExternalLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly showIcon?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
};

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
} as const;

const LINK_CLASSES =
  'text-primary-dark hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary';

export default function FgExternalLink({
  href,
  children,
  showIcon = true,
  size = 'md',
  className
}: FgExternalLinkProps) {
  const baseClasses = showIcon
    ? `inline-flex items-center gap-1 ${LINK_CLASSES}`
    : LINK_CLASSES;
  const combinedClassName = [baseClasses, SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      className={combinedClassName}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {showIcon ? <span>{children}</span> : children}
      {showIcon ? <FgIcon icon={HiExternalLink} size="xs" /> : null}
    </a>
  );
}
